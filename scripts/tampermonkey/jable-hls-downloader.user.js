// ==UserScript==
// @name         Jable HLS m3u8 提取与下载（测试）
// @namespace    https://jable.tv/
// @version      0.1.0
// @description  从页面 script 提取真实 m3u8（含 CDN token），浏览器内 AES-128 HLS 下载
// @match        https://jable.tv/videos/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const REFERER = "https://jable.tv/";
  const BATCH_SEGMENTS = 8;
  const SEGMENT_DELAY_MS = 150;
  const REFRESH_PLAYLIST_EVERY = 12;

  function findM3u8InScripts() {
    const text = Array.from(document.scripts)
      .map((s) => s.textContent || s.src)
      .join(" ");
    const re = /https?:[^ "'<>]+/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[0].includes(".m3u8")) {
        return m[0];
      }
    }
    return null;
  }

  async function fetchText(url) {
    const r = await fetch(url, { headers: { Referer: REFERER } });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}…`);
    }
    return await r.text();
  }

  async function fetchBytes(url) {
    const r = await fetch(url, { headers: { Referer: REFERER } });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} segment`);
    }
    return new Uint8Array(await r.arrayBuffer());
  }

  function parsePlaylist(m3u8Url, playlistText) {
    const keyLine = (playlistText.match(/#EXT-X-KEY:[^\n]+/) || [])[0] || "";
    const keyUri = (keyLine.match(/URI="([^"]+)"/) || [])[1];
    const ivHex = (keyLine.match(/IV=0x([0-9a-fA-F]+)/i) || [])[1];
    if (!keyUri || !ivHex) {
      throw new Error("播放列表缺少 #EXT-X-KEY");
    }
    const keyUrl = new URL(keyUri, m3u8Url).href;
    const iv = hexToBytes(ivHex);
    const segNames = playlistText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+\.ts$/.test(l));
    const segUrls = segNames.map((n) => new URL(n, m3u8Url).href);
    return { keyUrl, iv, segUrls };
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  async function loadKey(keyUrl) {
    const keyBytes = await fetchBytes(keyUrl);
    if (keyBytes.length !== 16) {
      throw new Error(`密钥长度异常: ${keyBytes.length}`);
    }
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  }

  async function decryptSegment(cryptoKey, iv, encrypted) {
    const copy = encrypted.slice();
    const dec = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, copy);
    return new Uint8Array(dec);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function slugFromPath() {
    const m = location.pathname.match(/\/videos\/([^/]+)/);
    return m ? m[1] : "video";
  }

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "jable-hls-panel";
    panel.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:999999;background:#111;color:#eee;" +
      "padding:12px 14px;border-radius:8px;font:13px/1.4 sans-serif;max-width:360px;" +
      "box-shadow:0 4px 20px rgba(0,0,0,.45);";
    panel.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px">HLS 下载（Tampermonkey 测试）</div>' +
      '<div id="jable-hls-status" style="margin-bottom:8px;color:#aaa">就绪</div>' +
      '<textarea id="jable-hls-url" readonly rows="3" style="width:100%;box-sizing:border-box;' +
      'font:11px monospace;margin-bottom:8px;background:#222;color:#9f9;border:1px solid #333"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" id="jable-hls-copy" style="cursor:pointer">复制 m3u8</button>' +
      '<button type="button" id="jable-hls-dl" style="cursor:pointer">下载 TS 合并</button>' +
      '<button type="button" id="jable-hls-cancel" style="cursor:pointer" disabled>取消</button>' +
      "</div>";
    document.body.appendChild(panel);
    return panel;
  }

  let cancelled = false;

  async function runDownload(statusEl, urlEl) {
    cancelled = false;
    const slug = slugFromPath();
    let index = 0;
    let parts = [];
    let cryptoKey = null;
    let iv = null;
    let segUrls = [];

    async function refresh() {
      const m3u8Url = findM3u8InScripts();
      if (!m3u8Url) {
        throw new Error("未在 script 中找到 m3u8");
      }
      urlEl.value = m3u8Url;
      const playlist = await fetchText(m3u8Url);
      const parsed = parsePlaylist(m3u8Url, playlist);
      cryptoKey = await loadKey(parsed.keyUrl);
      iv = parsed.iv;
      segUrls = parsed.segUrls;
      return m3u8Url;
    }

    await refresh();
    statusEl.textContent = `共 ${segUrls.length} 分片，开始下载…`;

    while (index < segUrls.length) {
      if (cancelled) {
        statusEl.textContent = "已取消";
        return;
      }
      if (index > 0 && index % REFRESH_PLAYLIST_EVERY === 0) {
        statusEl.textContent = `刷新 token… (${index}/${segUrls.length})`;
        await refresh();
      }
      const end = Math.min(index + BATCH_SEGMENTS, segUrls.length);
      for (let i = index; i < end; i++) {
        if (cancelled) {
          return;
        }
        const enc = await fetchBytes(segUrls[i]);
        if (enc.length < 5000) {
          throw new Error(`分片 ${i} 过小 (${enc.length})，可能 403，请刷新页面后重试`);
        }
        const dec = await decryptSegment(cryptoKey, iv, enc);
        parts.push(dec);
        statusEl.textContent = `下载 ${i + 1} / ${segUrls.length}`;
        await sleep(SEGMENT_DELAY_MS);
      }
      index = end;
    }

    statusEl.textContent = "合并并触发保存…";
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    const blob = new Blob([out], { type: "video/mp2t" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.ts`;
    a.click();
    URL.revokeObjectURL(a.href);
    statusEl.textContent = `完成：${slug}.ts（可用 ffmpeg remux 为 mp4）`;
  }

  function init() {
    if (document.getElementById("jable-hls-panel")) {
      return;
    }
    createPanel();
    const statusEl = document.getElementById("jable-hls-status");
    const urlEl = document.getElementById("jable-hls-url");
    const btnCopy = document.getElementById("jable-hls-copy");
    const btnDl = document.getElementById("jable-hls-dl");
    const btnCancel = document.getElementById("jable-hls-cancel");

    const m3u8 = findM3u8InScripts();
    urlEl.value = m3u8 || "（未找到 m3u8，请等待页面加载完成或刷新）";

    btnCopy.addEventListener("click", async () => {
      const url = findM3u8InScripts() || urlEl.value;
      if (!url || url.startsWith("（")) {
        statusEl.textContent = "无 m3u8 可复制";
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        statusEl.textContent = "已复制 m3u8 URL";
      } catch {
        urlEl.select();
        document.execCommand("copy");
        statusEl.textContent = "已复制（execCommand）";
      }
    });

    btnDl.addEventListener("click", async () => {
      btnDl.disabled = true;
      btnCancel.disabled = false;
      cancelled = false;
      try {
        await runDownload(statusEl, urlEl);
      } catch (e) {
        statusEl.textContent = `错误: ${e.message || e}`;
        console.error("[jable-hls]", e);
      } finally {
        btnDl.disabled = false;
        btnCancel.disabled = true;
      }
    });

    btnCancel.addEventListener("click", () => {
      cancelled = true;
      statusEl.textContent = "取消中…";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
