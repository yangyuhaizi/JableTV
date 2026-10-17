// Playwriter one-shot batch: read PW_* from process.env, persist progress in state.hls.
const crypto = require("crypto");
const fs = require("fs");

const pageMatch = process.env.PW_PAGE_MATCH || "jable.tv/videos/";
const referer = process.env.PW_REFERER || "https://jable.tv/";
const outPath = process.env.PW_OUTPUT || "./download.mp4";
const batchSize = Number(process.env.PW_BATCH_SIZE || "12");

async function freshPlaylist() {
  state.page = context.pages().findLast((p) => p.url().includes(pageMatch));
  if (!state.page) {
    throw new Error(`No tab matching: ${pageMatch}`);
  }
  const m3u8Url = await state.page.evaluate(() => {
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
  });
  if (!m3u8Url) {
    throw new Error("m3u8 URL not found in document.scripts");
  }
  const playlist = await state.page.evaluate(
    async ({ url, ref }) => {
      const r = await fetch(url, { headers: { Referer: ref } });
      if (!r.ok) {
        throw new Error(`playlist HTTP ${r.status}`);
      }
      return await r.text();
    },
    { url: m3u8Url, ref: referer },
  );
  const keyLine = (playlist.match(/#EXT-X-KEY:[^\n]+/) || [])[0] || "";
  const keyUri = (keyLine.match(/URI="([^"]+)"/) || [])[1];
  const ivHex = (keyLine.match(/IV=0x([0-9a-fA-F]+)/i) || [])[1];
  if (!keyUri || !ivHex) {
    throw new Error("Missing #EXT-X-KEY in playlist");
  }
  const keyUrl = await state.page.evaluate(
    ({ base, rel }) => new URL(rel, base).href,
    { base: m3u8Url, rel: keyUri },
  );
  const keyArr = await state.page.evaluate(
    async ({ u, ref }) => {
      const buf = await (
        await fetch(u, { headers: { Referer: ref } })
      ).arrayBuffer();
      return Array.from(new Uint8Array(buf));
    },
    { u: keyUrl, ref: referer },
  );
  const names = playlist
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.ts$/.test(l));
  const segUrls = await state.page.evaluate(
    ({ base, segNames }) => segNames.map((n) => new URL(n, base).href),
    { base: m3u8Url, segNames: names },
  );
  return {
    m3u8Url,
    key: Buffer.from(keyArr),
    iv: Buffer.from(ivHex, "hex"),
    segUrls,
  };
}

if (!state.hls) {
  const f = await freshPlaylist();
  state.hls = {
    index: 0,
    outPath,
    segUrls: f.segUrls,
    key: f.key,
    iv: f.iv,
    total: f.segUrls.length,
  };
  fs.writeFileSync(state.hls.outPath, Buffer.alloc(0));
  console.log("init", state.hls.total, "m3u8", f.m3u8Url.slice(0, 80) + "...");
}

const refreshed = await freshPlaylist();
state.hls.segUrls = refreshed.segUrls;
state.hls.key = refreshed.key;
state.hls.iv = refreshed.iv;
state.hls.total = refreshed.segUrls.length;

const end = Math.min(state.hls.index + batchSize, state.hls.segUrls.length);
for (let i = state.hls.index; i < end; i++) {
  await state.page.waitForTimeout(120);
  const encArr = await state.page.evaluate(
    async ({ seg, ref }) => {
      const r = await fetch(seg, { headers: { Referer: ref } });
      if (!r.ok) {
        throw new Error(`segment HTTP ${r.status}`);
      }
      return Array.from(new Uint8Array(await r.arrayBuffer()));
    },
    { seg: state.hls.segUrls[i], ref: referer },
  );
  const enc = Buffer.from(encArr);
  if (enc.length < 5000) {
    throw new Error(`segment ${i} too small (${enc.length}), likely 403 HTML`);
  }
  const decipher = crypto.createDecipheriv("aes-128-cbc", state.hls.key, state.hls.iv);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  fs.appendFileSync(state.hls.outPath, dec);
}

state.hls.index = end;
console.log(
  "progress",
  state.hls.index,
  "/",
  state.hls.total,
  fs.statSync(state.hls.outPath).size,
);
