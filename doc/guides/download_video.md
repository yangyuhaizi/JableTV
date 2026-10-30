<!-- generated from: JableTV src @ 2026-10-11 -->

# 下载单部影片 指南

> 场景: 用本仓库把一条影片页 URL 下载为本地 `.mp4`，或核对该 URL 为何没有写出文件。

## 前置条件

- 已阅读 [modules/sites.md](../modules/sites.md) 与 [api/crawler_api.md](../api/crawler_api.md)。
- 安装 `requirements.txt` 中除 Pillow 以外的包即可跑通 `consoles_main`。Pillow 只被 `gui.py` 导入。
- `python main.py` 所使用的解释器必须能 `import tkinter`。该导入在 `--nogui` 判断之前执行。
- jable.tv 单片 URL 必须匹配 `https://jable.tv/videos/<目录名>/`，结尾保留 `/`。

## 步骤

### Step 1: 安装依赖

在 CPython 3.14 上按文件全量安装会在 Pillow 9.2 处失败。控制台路径可以不装 Pillow：

```bash
python3 -m venv .venv
.venv/bin/pip install 'requests==2.25.1' 'beautifulsoup4==4.9.3' \
  'm3u8==0.8.0' 'pycryptodome==3.9.9' 'cloudscraper==1.2.58'
```

**关键文件**: `requirements.txt`

### Step 2: 命令行入口

```bash
python main.py --url "https://jable.tv/videos/start-153/" --nogui True
```

工作目录下的相对保存位置是 `main.py` 里的 `download`。分片临时目录是 `<cwd>/start-153/`。成片路径是 `<cwd>/download/<标题>.mp4`。

**关键文件**: `main.py`

### Step 3: 绕过图形界面导入，直接调用下载函数

当 Step 2 因缺少 `_tkinter` 退出时，用下面的调用执行与 `--nogui` 相同的下载函数：

```bash
cd /tmp
python - << 'PY'
import sys
sys.path.insert(0, "/path/to/JableTV")
import M3U8Sites
M3U8Sites.consoles_main("https://jable.tv/videos/start-153/", dest="/tmp/jable-dl-test")
PY
```

把 `/path/to/JableTV` 换成仓库根目录。

**关键文件**: `M3U8Sites/__init__.py` → `consoles_main`

## 验证方法

1. 进程标准输出出现 `下載完成!`。
2. `dest` 目录中存在 `<标题>.mp4`，且字节数大于 0。
3. 若页面含封面，同一目录存在同名 `.jpg`。

2026-10-11 对 `https://jable.tv/videos/start-153/` 的结果（CPython 3.14.3，cloudscraper 1.2.58，直连，响应 `CF-RAY` 节点为 NRT）：

| 检查 | 观察 |
|------|------|
| `python main.py --url … --nogui True` | 退出码 1。`ModuleNotFoundError: No module named '_tkinter'`。来自 `gui.py` 第 6 行 `import tkinter` |
| `consoles_main` 同一 URL | 打印 `下載網址 https://jable.tv/videos/start-153/ 錯誤!!`。无 `下載完成!` |
| 保存目录与 `<cwd>/start-153/` | 均未创建 |
| HTTP | 状态 403，`Cf-Mitigated: challenge`，HTML `<title>` 为 `Just a moment...`。正文没有 `og:title`，也没有 `.m3u8` |
| 将 cloudscraper 升到 1.2.71 后重试 firefox/darwin、chrome/darwin、chrome/windows | 仍是 403 与同一标题 |

`VaildateUrl` 能返回 `SiteJableTV`，目录名为 `start-153`。失败发生在 `get_url_infos` 的状态码判断，下载循环没有执行。

## 常见问题

| 问题 | 原因 | 处理 |
|------|------|------|
| `No module named '_tkinter'` | `main.py` 无条件导入 `gui.py` | 换带 Tk 的 Python，或直接调用 `consoles_main` |
| 打印「下載網址錯誤」且没有文件 | `get_url_infos` 抛异常。对上述 URL，原因是 HTTP 403 挑战页，不是正则写错 | 看响应状态码与 `Cf-Mitigated`。状态不是 200 时，源码不会解析 m3u8 |
| `--nogui False` 仍不打开窗口 | `bool("False")` 为 `True` | 省略该选项才走图形界面 |
| 成片无法播放，但分片都下完了 | 绝对 `https://` 分片 URI 未写入 `_tsList`；或 IV 被截成 16 个 ASCII 字符 | 对照 [modules/crawler.md](../modules/crawler.md) 数据约定。当前这条 URL 还没有走到拼接 |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版。记录 `start-153` 当日下载结果 |
