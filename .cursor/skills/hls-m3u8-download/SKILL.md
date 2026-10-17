---
name: hls-m3u8-download
description: >-
  通过 playwriter-light 从 JS 渲染页提取带 CDN token 的真实 m3u8 URL，并在浏览器上下文中
  拉取 AES-128 HLS 分片写入文件。适用于 video 为 blob:、WSL 直连 m3u8 返回 403 的站点。
  触发词：m3u8 下载、HLS 下载、playwriter 视频、提取播放地址、jable hls。
---

# HLS m3u8 提取与下载（playwriter-light）

## 何时用本 Skill

| 现象 | 做法 |
| --- | --- |
| `<video src="blob:...">`，Elements 里看不到 m3u8 | 用 **页面 inline script** 里的完整 m3u8 URL（含 `bcdn_token` / `token_path`） |
| WSL 里 `curl` / `yt-dlp` 对 m3u8 或 `.ts` 返回 **403** | 必须在 **已打开该页的浏览器** 里 `fetch`（playwriter 或 Tampermonkey） |
| 分片拉取若干后 403 | **周期性重新扫描** `document.scripts` 刷新 m3u8（CDN token 会轮换） |

不要从 `video.currentSrc` 取地址（多为 blob）。不要假设 m3u8 基址 + 文件名拼接 token（应用 `new URL(segment, m3u8Url)`）。

## 前置：playwriter-light 远程会话

WSL Agent 控制 Win 上 Chrome/Edge 时，MCP 与 CLI 均需：

```bash
export PLAYWRITER_HOST="$(ip route show | awk '/default/ {print $3; exit}')"
export PLAYWRITER_TOKEN='<与 Win 上 playwriter serve --token 一致>'
npx -y playwriter@latest session list
```

`.cursor/mcp.json` 中 `playwriter-light` 的 `env` 也要包含上述变量；改完后 **重载 MCP**。

会话与扩展：见 [playwriter-session-guide](../playwriter-session-guide.md)。

## Phase 1：用 playwriter-light 拿到真实 m3u8 URL

### MCP `execute`（推荐多步、每步短代码）

1. 绑定标签页并确认 URL：

```javascript
state.page = context.pages().findLast((p) => p.url().includes("jable.tv/videos/"));
if (!state.page) throw new Error("未找到目标标签页，请先在该页启用 Playwriter");
console.log("URL:", state.page.url());
```

2. 从 **script 文本** 提取 m3u8（与 jable 类站点一致；其他站点可先 `snapshot` 再调整匹配条件）：

```javascript
const m3u8Url = await state.page.evaluate(() => {
  const text = Array.from(document.scripts)
    .map((s) => s.textContent || s.src)
    .join(" ");
  const re = /https?:[^ "'<>]+/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].includes(".m3u8")) return m[0];
  }
  return null;
});
console.log("m3u8Url:", m3u8Url);
if (!m3u8Url) throw new Error("未在 document.scripts 中找到 .m3u8");
```

3. 校验 m3u8 可读（仍走浏览器 cookie / Referer）：

```javascript
const head = await state.page.evaluate(
  async ({ url, referer }) => {
    const r = await fetch(url, { headers: { Referer: referer } });
    const text = await r.text();
    return { status: r.status, lines: text.split("\n").length, preview: text.slice(0, 120) };
  },
  { url: m3u8Url, referer: "https://jable.tv/" },
);
console.log(head);
```

期望：`status: 200`，正文含 `#EXTM3U`、`#EXT-X-KEY:METHOD=AES-128`。

### CLI 一键打印 m3u8

```bash
bash ~/projects/JableTV/.cursor/skills/hls-m3u8-download/scripts/extract-m3u8-url.sh \
  --session 1 \
  --page-match "jable.tv/videos/" \
  --referer "https://jable.tv/"
```

## Phase 2：用 m3u8 URL 下载（playwriter 浏览器 fetch）

WSL 侧 **不能** 仅用拿到的 URL 字符串做离线下载（token 与浏览器绑定）。应使用本 Skill 脚本：在 **同一 playwriter session** 内分批拉片、AES-128-CBC 解密、追加写入文件。

```bash
bash ~/projects/JableTV/.cursor/skills/hls-m3u8-download/scripts/download-hls-via-playwriter.sh \
  --session 1 \
  --page-match "jable.tv/videos/meyd-568" \
  --referer "https://jable.tv/" \
  --output "./meyd-568.mp4" \
  --log "./hls-download.log"
```

说明：

- 输出路径相对 **playwriter session 的 cwd**（常为 Win 上的 `C:\home\yangy\projects\<repo>`）。WSL 工作区若不同路径，下载结束后从 `/mnt/c/...` 复制到 Linux 目录。
- 每轮刷新 m3u8 与 `#EXT-X-KEY`，避免分片 403。
- 合并结果为 **MPEG-TS 拼接**；若要标准 MP4 容器，本地再 `ffmpeg -c copy` remux。

### 可选：Tampermonkey 纯浏览器下载

Tampermonkey 脚本：`~/projects/JableTV/scripts/tampermonkey/jable-hls-downloader.user.js`（页面内手动测试，不依赖 playwriter）。

## 故障排除

| 症状 | 处理 |
| --- | --- |
| Extension not connected | Win 上扩展点绿；`session new` |
| `403 Invalid Host header`（CLI 连 Win relay） | 设置 `PLAYWRITER_TOKEN`；remote 需 Bearer |
| 分片 `403`、size ≈ 2334 | 刷新页面后重扫 m3u8；减小并发、加大 `--batch` 间隔 |
| `Session N not found` | `npx -y playwriter@latest session new` |
| MCP 无 playwriter-light | 检查 `.cursor/mcp.json` env 并重载 MCP |

## 脚本位置

| 文件 | 作用 |
| --- | --- |
| `scripts/extract-m3u8-url.sh` | CLI 输出 m3u8 URL |
| `scripts/download-hls-via-playwriter.sh` | 分批下载完整 HLS |
| `scripts/playwriter-hls-batch.code.js` | 单批 playwriter 执行体（由 shell 注入 env） |
