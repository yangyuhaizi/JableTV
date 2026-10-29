// ==UserScript==
// @name         Jable HLS m3u8 提取与下载
// @namespace    https://jable.tv/
// @version      0.2.2
// @description  从页面 script 提取真实 m3u8（含 CDN token），浏览器内 AES-128 HLS 下载。IndexedDB 逐片缓存 + 断点续传 + 403 自适应退避 + 后台标签页稳定运行。网络层使用 GM_xmlhttpRequest 绕过 CDN CORS 限制。
// @match        https://jable.tv/videos/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const REFERER = "https://jable.tv/";
  const IDB_NAME = "__jable_hls_idb";
  const IDB_STORE = "segs";
  const LS_PREFIX = "__jable_hls_state::";

  // ── 长期运行参数 ──────────────────────────────────────────────
  const SEG_DELAY_BASE = 200;      // 分片间隔基线（ms）
  const SEG_JITTER = 150;          // 抖动（ms）
  const REFRESH_EVERY = 12;        // 每 N 片主动刷新 playlist/key（CDN token 会轮换）
  const MAX_SEG_RETRIES = 6;       // 单分片最大重试次数
  const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000, 120000]; // 指数退避
  const MIN_SEG_BYTES = 5000;      // 小于此视为 403 HTML 错误页

  const LOG_PREFIX = "[jable-hls]";
  const _logBuffer = [];
  const MAX_LOG_ENTRIES = 2000;

  function _appendLog(level, args) {
    const ts = new Date().toISOString().slice(11, 23);
    const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    _logBuffer.push(`${ts} ${level} ${msg}`);
    if (_logBuffer.length > MAX_LOG_ENTRIES) _logBuffer.splice(0, _logBuffer.length - MAX_LOG_ENTRIES);
  }
  const log = (...args) => { _appendLog("INFO", args); console.log(`%c${LOG_PREFIX}`, "color:#22c55e;font-weight:bold", ...args); };
  const logWarn = (...args) => { _appendLog("WARN", args); console.warn(`%c${LOG_PREFIX}`, "color:#f59e0b;font-weight:bold", ...args); };
  const logErr = (...args) => { _appendLog("ERR ", args); console.error(`%c${LOG_PREFIX}`, "color:#ef4444;font-weight:bold", ...args); };

  // 沙箱下 navigator.clipboard 不可用：优先 GM_setClipboard，其次 execCommand
  function copyText(text) {
    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(text, "text");
        return true;
      }
    } catch (e) { logWarn("gmClipboardFail", { message: e.message }); }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  window.__jableHlsLog = () => {
    const text = _logBuffer.join("\n");
    if (copyText(text)) {
      log("已复制日志到剪贴板");
    } else {
      triggerDownload(new Blob([text], { type: "text/plain" }), "jable-hls-log.txt");
    }
    return text;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Worker sleep — 绕过 Chrome 后台标签页 setTimeout 节流
  function workerSleep(ms) {
    return new Promise((resolve) => {
      try {
        const blob = new Blob([`self.onmessage=e=>{setTimeout(()=>self.postMessage(1),e.data)}`], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        const w = new Worker(url);
        w.onmessage = () => { w.terminate(); URL.revokeObjectURL(url); resolve(); };
        w.postMessage(ms);
      } catch {
        setTimeout(resolve, ms);
      }
    });
  }

  function jitteredDelay() {
    return Math.max(80, SEG_DELAY_BASE + (Math.random() * SEG_JITTER - SEG_JITTER / 2));
  }

  function slugFromPath() {
    const m = location.pathname.match(/\/videos\/([^/]+)/);
    return m ? m[1] : "video";
  }

  // 视频标题（页面 h4），用于保存文件名；取不到则返回 null 由调用方回退
  function getVideoTitle() {
    try {
      const node = document.evaluate(
        `//*[@id="site-content"]/div/div/div[1]/section[2]/div[1]/div[1]/h4`,
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
      const text = node && node.textContent ? node.textContent.trim() : "";
      // 标题形如 "MEYD-568 中文标题 演员名"，过短则视为无效
      return text.length >= 3 ? text : null;
    } catch {
      return null;
    }
  }

  // Windows/下载文件名安全化：去非法字符、压缩空白、截断
  function sanitizeFilename(name) {
    return (name || "")
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || null;
  }

  // 保存文件名：优先视频标题，失败回退 slug
  function resolveSaveName(slug) {
    return sanitizeFilename(getVideoTitle()) || slug;
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ── IndexedDB：逐片缓存解密后的 TS ─────────────────────────────

  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutSeg(slug, index, buffer) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ id: `${slug}:${index}`, slug, index, data: buffer });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function idbGetSeg(slug, index) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(`${slug}:${index}`);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  // 返回该 slug 已缓存的分片序号集合
  async function idbCachedIndices(slug) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => {
        db.close();
        const set = new Set();
        for (const k of req.result || []) {
          if (typeof k === "string" && k.startsWith(slug + ":")) {
            const n = parseInt(k.slice(slug.length + 1), 10);
            if (!Number.isNaN(n)) set.add(n);
          }
        }
        resolve(set);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async function idbDeleteSlug(slug) {
    const db = await openIDB();
    const keys = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      for (const k of keys) {
        if (typeof k === "string" && k.startsWith(slug + ":")) store.delete(k);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // ── 轻进度（localStorage，只存指针）─────────────────────────────

  function lsKey(slug) { return LS_PREFIX + slug; }

  function loadState(slug) {
    try { return JSON.parse(localStorage.getItem(lsKey(slug))) || null; } catch { return null; }
  }

  function saveState(s) {
    try {
      localStorage.setItem(lsKey(s.slug), JSON.stringify({
        slug: s.slug, total: s.total, nextIndex: s.nextIndex,
        updatedAt: new Date().toISOString(),
      }));
    } catch { /* 配额满时忽略，IDB 数据不受影响 */ }
  }

  function clearState(slug) { localStorage.removeItem(lsKey(slug)); }

  // ── m3u8 提取与解析 ─────────────────────────────────────────────

  function findM3u8InScripts() {
    const text = Array.from(document.scripts)
      .map((s) => s.textContent || s.src)
      .join(" ");
    const re = /https?:[^ "'<>]+/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[0].includes(".m3u8")) return m[0];
    }
    return null;
  }

  function parsePlaylist(m3u8Url, playlistText) {
    const keyLine = (playlistText.match(/#EXT-X-KEY:[^\n]+/) || [])[0] || "";
    const keyUri = (keyLine.match(/URI="([^"]+)"/) || [])[1];
    const ivHex = (keyLine.match(/IV=0x([0-9a-fA-F]+)/i) || [])[1];
    if (!keyUri || !ivHex) throw new Error("播放列表缺少 #EXT-X-KEY");
    const keyUrl = new URL(keyUri, m3u8Url).href;
    const iv = new Uint8Array(ivHex.length / 2);
    for (let i = 0; i < iv.length; i++) iv[i] = parseInt(ivHex.slice(i * 2, i * 2 + 2), 16);
    const segNames = playlistText.split("\n").map((l) => l.trim()).filter((l) => /^\d+\.ts$/.test(l));
    const segUrls = segNames.map((n) => new URL(n, m3u8Url).href);
    return { keyUrl, iv, segUrls };
  }

  // GM_xmlhttpRequest 走 Tampermonkey 扩展上下文，不受页面 CORS 限制，
  // 且允许携带 Referer（CDN 校验 Referer 才返回 200）。
  function gmFetch(url, responseType) {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { Referer: REFERER },
          responseType: responseType || "arraybuffer",
          timeout: 30000,
          onload: (res) => resolve({ status: res.status, buffer: res.response }),
          onerror: (err) => reject(new Error(`GM_xhr error: ${(err && err.error) || "network"}`)),
          ontimeout: () => reject(new Error("GM_xhr timeout")),
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function bufToText(buf) {
    return new TextDecoder().decode(new Uint8Array(buf));
  }

  async function refreshPlaylist(urlEl) {
    const m3u8Url = findM3u8InScripts();
    if (!m3u8Url) throw new Error("未在 script 中找到 m3u8（请等待播放器加载或刷新页面）");
    if (urlEl) urlEl.value = m3u8Url;
    const r = await gmFetch(m3u8Url);
    if (r.status !== 200) throw new Error(`playlist HTTP ${r.status}`);
    const playlist = bufToText(r.buffer);
    const parsed = parsePlaylist(m3u8Url, playlist);
    const keyRes = await gmFetch(parsed.keyUrl);
    if (keyRes.status !== 200) throw new Error(`密钥 HTTP ${keyRes.status}`);
    const keyBuf = keyRes.buffer;
    if (keyBuf.byteLength !== 16) throw new Error(`密钥长度异常: ${keyBuf.byteLength}`);
    const cryptoKey = await crypto.subtle.importKey("raw", keyBuf, { name: "AES-CBC" }, false, ["decrypt"]);
    log("refresh", { segs: parsed.segUrls.length, m3u8: m3u8Url.slice(-60) });
    return { m3u8Url, cryptoKey, iv: parsed.iv, segUrls: parsed.segUrls, total: parsed.segUrls.length };
  }

  async function fetchSegBytes(url) {
    let r;
    try {
      r = await gmFetch(url);
    } catch (e) {
      return { ok: false, status: 0, bytes: null, error: e.message };
    }
    if (r.status !== 200) return { ok: false, status: r.status, bytes: null };
    const buf = new Uint8Array(r.buffer);
    if (buf.length < MIN_SEG_BYTES) return { ok: false, status: r.status, bytes: buf };
    return { ok: true, status: r.status, bytes: buf };
  }

  // ── UI ──────────────────────────────────────────────────────────

  function createUI() {
    const container = document.createElement("div");
    container.id = "jable-hls-ui";
    const btnBase = "padding:6px 12px;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;";
    const btnSmall = "padding:5px 8px;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;";
    container.innerHTML = `
      <div style="position:fixed;bottom:16px;right:16px;z-index:999999;font-family:system-ui,sans-serif">
        <div id="jh-panel" style="background:#1e293b;border-radius:12px;padding:16px;width:360px;
             color:#e2e8f0;box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:13px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <b style="font-size:14px;color:#f8fafc">Jable HLS 下载 v0.2.0</b>
            <span id="jh-close" style="cursor:pointer;color:#94a3b8;font-size:18px">&times;</span>
          </div>
          <div id="jh-status" style="color:#94a3b8;margin-bottom:8px">就绪</div>
          <div style="width:100%;height:4px;background:#334155;border-radius:2px;overflow:hidden;margin-bottom:4px">
            <div id="jh-bar" style="height:100%;background:#22c55e;border-radius:2px;transition:width .3s;width:0%"></div>
          </div>
          <div id="jh-detail" style="color:#64748b;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">&nbsp;</div>
          <div id="jh-rate" style="color:#64748b;font-size:10px;margin-bottom:10px">&nbsp;</div>
          <textarea id="jh-url" readonly rows="2" style="width:100%;box-sizing:border-box;font:11px monospace;
            margin-bottom:8px;background:#0f172a;color:#86efac;border:1px solid #334155;border-radius:6px"></textarea>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button id="jh-start" style="flex:1;${btnBase}background:#22c55e;">开始下载</button>
            <button id="jh-pause" style="${btnBase}background:#f59e0b;display:none;">暂停</button>
            <button id="jh-merge" style="flex:1;${btnBase}background:#3b82f6;">下载已有</button>
            <button id="jh-reset" style="${btnBase}background:#ef4444;">重置</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
            <button id="jh-copy" style="flex:1;${btnSmall}background:#6366f1;">复制 m3u8</button>
            <button id="jh-log" style="flex:1;${btnSmall}background:#8b5cf6;">导出日志</button>
            <button id="jh-clear" style="${btnSmall}background:#64748b;">清理缓存</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(container);
    const $ = (sel) => container.querySelector(sel);
    const $status = $("#jh-status"), $bar = $("#jh-bar"), $detail = $("#jh-detail"), $rate = $("#jh-rate");
    const $start = $("#jh-start"), $pause = $("#jh-pause"), $merge = $("#jh-merge"), $reset = $("#jh-reset");

    let minimized = false;
    const $panel = $("#jh-panel");
    const collapsible = [$status, $bar.parentElement, $detail, $rate, $start.parentElement].filter(Boolean);
    $("#jh-close").addEventListener("click", () => {
      minimized = !minimized;
      $panel.style.width = minimized ? "auto" : "360px";
      collapsible.forEach((el) => { el.style.display = minimized ? "none" : ""; });
    });

    function setBtn(el, visible, enabled) {
      el.style.display = visible ? "" : "none";
      if (visible) {
        el.style.opacity = enabled === false ? "0.4" : "";
        el.style.pointerEvents = enabled === false ? "none" : "";
      }
    }

    return {
      setStatus: (s) => { $status.textContent = s; },
      setProgress: (done, total) => { $bar.style.width = total ? Math.round((done / total) * 100) + "%" : "0%"; },
      setDetail: (d) => { $detail.textContent = d; },
      setRate: (r) => { $rate.textContent = r; },
      setBarColor: (c) => { $bar.style.background = c; },
      setUrl: (u) => { $("#jh-url").value = u; },
      getUrl: () => $("#jh-url").value,
      showRunning: (running, hasCache) => {
        setBtn($start, !running, true);
        setBtn($pause, running, true);
        setBtn($merge, true, !running && hasCache);
        setBtn($reset, true, !running);
      },
      setStartText: (t) => { $start.textContent = t; },
      onStart: (fn) => { $start.onclick = fn; },
      onPause: (fn) => { $pause.onclick = fn; },
      onMerge: (fn) => { $merge.onclick = fn; },
      onReset: (fn) => { $reset.onclick = fn; },
      onCopy: (fn) => { $("#jh-copy").onclick = fn; },
      onLog: (fn) => { $("#jh-log").onclick = fn; },
      onClear: (fn) => { $("#jh-clear").onclick = fn; },
      // 原生 confirm 在油猴沙箱中不可靠：按钮二次确认替代
      //（第一次点击变文案并 4 秒内有效，第二次点击真正执行）
      armConfirm: (sel, activeText, fn) => {
        const btn = container.querySelector(sel);
        if (!btn) return;
        if (btn.dataset.armed === "1") {
          delete btn.dataset.armed;
          btn.textContent = btn.dataset.label || btn.textContent;
          fn();
          return;
        }
        btn.dataset.label = btn.textContent;
        btn.dataset.armed = "1";
        btn.textContent = activeText;
        setTimeout(() => {
          if (btn.dataset.armed === "1") {
            delete btn.dataset.armed;
            btn.textContent = btn.dataset.label || btn.textContent;
          }
        }, 4000);
      },
    };
  }

  // ── 主流程 ──────────────────────────────────────────────────────

  let _running = false;
  let _pauseRequested = false;

  async function countdownWait(totalMs, ui, label) {
    const steps = Math.ceil(totalMs / 5000);
    for (let i = steps; i > 0; i--) {
      if (_pauseRequested) return;
      ui.setStatus(`${label}... ${Math.min(i * 5, Math.round(totalMs / 1000))}s`);
      await workerSleep(Math.min(5000, totalMs));
      totalMs -= 5000;
      if (totalMs <= 0) break;
    }
  }

  async function runDownload(ui, slug) {
    _running = true;
    _pauseRequested = false;
    ui.showRunning(true, false);
    ui.setBarColor("#22c55e");

    try {
      // 1. 刷新 playlist，确定总数
      ui.setStatus("获取 m3u8 与分片列表...");
      let pl = await refreshPlaylist({ set value(v) { ui.setUrl(v); } });
      const total = pl.total;

      // 2. 与 IndexedDB 对账：找出第一个缺失分片（断点续传）
      const cached = await idbCachedIndices(slug);
      let nextIndex = 0;
      while (nextIndex < total && cached.has(nextIndex)) nextIndex++;
      const resumed = nextIndex > 0;
      saveState({ slug, total, nextIndex });
      log("resume", { slug, total, cached: cached.size, nextIndex });

      if (nextIndex >= total) {
        ui.setStatus(`缓存已完整 (${total}/${total})，可直接“下载已有”合并`);
        ui.setProgress(total, total);
        return;
      }
      ui.setStatus(resumed ? `从断点继续 ${nextIndex}/${total}` : `共 ${total} 分片，开始下载...`);
      ui.setProgress(nextIndex, total);

      let failStreak = 0;

      for (let i = nextIndex; i < total; i++) {
        if (_pauseRequested) break;

        // 主动刷新 token（每 REFRESH_EVERY 片）
        if (i > 0 && i % REFRESH_EVERY === 0) {
          ui.setDetail(`刷新 token... (${i}/${total})`);
          try {
            pl = await refreshPlaylist({ set value(v) { ui.setUrl(v); } });
            if (pl.total !== total) {
              logWarn("totalChanged", { before: total, after: pl.total });
              ui.setDetail(`分片总数变化 ${total} → ${pl.total}，按原总数继续`);
            }
          } catch (e) {
            logWarn("refreshFail", { i, message: e.message });
          }
        }

        // 单分片：重试 + 指数退避
        let done = false;
        for (let attempt = 0; attempt < MAX_SEG_RETRIES; attempt++) {
          if (_pauseRequested) break;
          const res = await fetchSegBytes(pl.segUrls[i]);
          if (res.ok) {
            const dec = await crypto.subtle.decrypt(
              { name: "AES-CBC", iv: pl.iv },
              pl.cryptoKey,
              res.bytes.slice().buffer
            );
            await idbPutSeg(slug, i, dec);
            done = true;
            failStreak = 0;
            break;
          }
          failStreak++;
          logWarn("segRetry", { i, attempt: attempt + 1, status: res.status, size: res.bytes && res.bytes.length });
          ui.setRate(`分片 ${i} 重试 ${attempt + 1}/${MAX_SEG_RETRIES} (HTTP ${res.status})`);
          try {
            pl = await refreshPlaylist({ set value(v) { ui.setUrl(v); } });
          } catch { /* 刷新失败则沿用旧 key 继续退避 */ }
          await countdownWait(BACKOFF_MS[attempt], ui, `退避等待`);
          if (_pauseRequested) break;
        }

        if (_pauseRequested) break;

        if (!done) {
          // 打满重试仍失败：保存进度并自动暂停，不断网重试浪费 token
          saveState({ slug, total, nextIndex: i });
          ui.setBarColor("#f59e0b");
          ui.setStatus(`分片 ${i} 连续失败，已暂停（进度 ${i}/${total} 已保存）`);
          ui.setDetail("稍后点“继续下载”自动从断点恢复");
          logErr("autoPause", { seg: i, total });
          return;
        }

        saveState({ slug, total, nextIndex: i + 1 });
        ui.setProgress(i + 1, total);
        ui.setDetail(`分片 ${i + 1}/${total}`);
        ui.setRate(`间隔 ~${SEG_DELAY_BASE}ms | 刷新周期 ${REFRESH_EVERY} 片 | 已缓存 ${i + 1}`);
        await workerSleep(jitteredDelay());
      }

      const st = loadState(slug);
      if (_pauseRequested) {
        ui.setBarColor("#f59e0b");
        ui.setStatus(`已暂停 (${st ? st.nextIndex : "?"}/${total})，点“继续下载”恢复`);
        ui.setStartText("继续下载");
        return;
      }
      ui.setStatus(`全部 ${total} 片下载完成，可“下载已有”合并`);
      ui.setProgress(total, total);
      ui.setBarColor("#22c55e");
      log("complete", { slug, total });
    } catch (e) {
      logErr("fatal", { message: e.message });
      ui.setStatus(`错误: ${(e.message || e).slice(0, 80)}（进度已保存，可继续）`);
      ui.setBarColor("#ef4444");
      ui.setStartText("继续下载");
    } finally {
      _running = false;
      const cached = await idbCachedIndices(slug).catch(() => new Set());
      ui.showRunning(false, cached.size > 0);
    }
  }

  // 合并缓存为单个 .ts 文件（按序号从 IDB 顺序读取，不占用常驻内存数组）
  async function mergeCached(ui, slug) {
    try {
      const cached = await idbCachedIndices(slug);
      if (!cached.size) {
        ui.setStatus("无缓存可合并，先开始下载");
        return;
      }
      // 找从 0 开始的最大连续区间
      let end = 0;
      while (cached.has(end)) end++;
      ui.setStatus(`合并 ${end} 个连续分片...`);
      ui.setDetail("从 IndexedDB 顺序读取中");
      const parts = [];
      for (let i = 0; i < end; i++) {
        const rec = await idbGetSeg(slug, i);
        if (!rec) throw new Error(`分片 ${i} 缓存缺失`);
        parts.push(new Uint8Array(rec.data));
        if (i % 200 === 0) ui.setDetail(`读取 ${i}/${end}`);
        // 让出主线程，避免长任务卡死页面
        if (i % 100 === 0) await sleep(0);
      }
      const blob = new Blob(parts, { type: "video/mp2t" });
      const saveName = resolveSaveName(slug);
      triggerDownload(blob, `${saveName}.ts`);
      const tail = cached.size - end;
      ui.setStatus(`已导出 ${saveName}.ts（${end} 片${tail > 0 ? `，另有 ${tail} 片非连续缓存未包含` : ""}）`);
      ui.setDetail("可用 ffmpeg -c copy 转为 mp4");
      log("merged", { slug, merged: end, cached: cached.size });
    } catch (e) {
      ui.setStatus(`合并失败: ${(e.message || e).slice(0, 80)}`);
      logErr("mergeFail", { message: e.message });
    }
  }

  function init() {
    if (document.getElementById("jable-hls-ui")) return;
    const slug = slugFromPath();
    const ui = createUI();

    const m3u8 = findM3u8InScripts();
    ui.setUrl(m3u8 || "（未找到 m3u8，请等待播放器加载完成或刷新）");

    // 启动时与缓存对账，支持跨刷新恢复
    idbCachedIndices(slug).then((cached) => {
      const st = loadState(slug);
      if (st && st.nextIndex > 0 && st.nextIndex < st.total) {
        ui.setStatus(`检测到未完成进度 ${st.nextIndex}/${st.total}（缓存 ${cached.size} 片），可继续下载`);
        ui.setStartText("继续下载");
      } else if (cached.size > 0) {
        ui.setStatus(`缓存有 ${cached.size} 片，可“下载已有”合并或重新开始`);
        ui.setStartText("重新下载");
      }
      ui.showRunning(false, cached.size > 0);
    }).catch(() => ui.showRunning(false, false));

    ui.onStart(() => { if (!_running) runDownload(ui, slug); });
    ui.onPause(() => {
      _pauseRequested = true;
      ui.setStatus("暂停中...（当前分片完成后停）");
    });
    ui.onMerge(() => mergeCached(ui, slug));
    ui.onReset(() => {
      ui.armConfirm("#jh-reset", "确认清空？再点", () => {
        idbDeleteSlug(slug).then(() => {
          clearState(slug);
          ui.setStatus("已重置，可重新开始");
          ui.setProgress(0, 1);
          ui.setStartText("开始下载");
          ui.showRunning(false, false);
        }).catch((e) => ui.setStatus(`重置失败: ${(e.message || String(e)).slice(0, 60)}`));
      });
    });
    ui.onCopy(() => {
      const url = findM3u8InScripts() || ui.getUrl();
      if (!url || url.startsWith("（")) { ui.setStatus("无 m3u8 可复制"); return; }
      if (copyText(url)) {
        ui.setStatus("已复制 m3u8 URL");
      } else {
        ui.setStatus("自动复制失败，请手动选中文本框复制");
      }
    });
    ui.onLog(() => {
      const text = _logBuffer.join("\n");
      triggerDownload(new Blob([text], { type: "text/plain" }), `jable-hls-log-${slug}.txt`);
      ui.setStatus(`已导出日志（${_logBuffer.length} 条）`);
    });
    ui.onClear(() => {
      ui.armConfirm("#jh-clear", "确认清理？再点", () => {
        idbDeleteSlug(slug).then(() => {
          clearState(slug);
          ui.setStatus("缓存已清理");
          ui.showRunning(false, false);
        }).catch((e) => ui.setStatus(`清理失败: ${(e.message || String(e)).slice(0, 60)}`));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
