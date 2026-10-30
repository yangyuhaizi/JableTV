<!-- generated from: JableTV src @ 2026-10-11 -->

# entry 模块概述

> 源码: `main.py`, `args.py`, `config.py`

## 职责

`main.py` 解析命令行。`--nogui` 为真时调用 `M3U8Sites.consoles_main`；否则调用 `gui_main`。保存目录常量是 `save_folder = "download"`。

**设计动机**: 把「随机推荐 / 指定 URL / 是否打开窗口」留在入口，下载步骤留在站点模块。详见 [architecture.md](../architecture.md) 中「为什么图形界面串行影片、分片并行」之外的入口约束：入口在分支之前导入图形界面。

**非目标**: 不解析影片页，不下载分片，不画窗口控件。

## 目录结构

```
.
├── main.py          # 进程入口，选择 consoles_main 或 gui_main
├── args.py          # ArgumentParser 与首页随机 URL
└── config.py        # 分片请求使用的 headers
```

## 依赖

| 依赖模块 | 依赖内容 | 强度 | 说明 |
|----------|----------|------|------|
| gui | `gui_main` | 强 | `main.py` 顶层 `from gui import *`，与 `--nogui` 无关 |
| sites | `M3U8Sites.consoles_main` | 强 | 经 `gui.py` 的 `import M3U8Sites` 进入命名空间 |
| config | `headers` | 强 | `av_recommand` 内部另建了一个同名局部字典，未使用 `config.headers` |

不依赖: `M3U8Crawler` 的私有下载步骤。入口不直接调用 `start_download`。

## 核心类

本模块没有类。函数见 [api/entry_api.md](../api/entry_api.md)。

| 函数 | 职责 | 源文件 |
|------|------|--------|
| `get_parser` | 创建 `ArgumentParser` | `args.py` |
| `av_recommand` | 请求 `https://jable.tv/` 并随机返回一个标题链接 | `args.py` |
| （脚本主体） | 按参数调用控制台或图形界面，然后 `sys.exit(0)` | `main.py` |

## 关键枚举

无。

## 数据流

```
命令行参数
  -> get_parser().parse_args()
  -> url_arg = args.url，或在 args.random 为真时 url_arg = av_recommand()
  -> args.nogui 为真: M3U8Sites.consoles_main(url_arg, "download")
  -> args.nogui 为假: gui_main(url_arg, "download")
  -> sys.exit(0)
```

**数据约定**: `--url` 是字符串，默认 `""`。`--random` 与 `--nogui` 的 `type` 都是 `bool`。`argparse` 对 `type=bool` 的行为是：对非空字符串调用 `bool("False")`，结果为 `True`。因此 `--nogui False` 仍会走控制台分支。README 中的 `-nogui` 不是已定义的短选项；源码里的长选项名是 `--nogui`。

`main.py` 调用 `sys.exit` 时没有 `import sys`。在 `--nogui` 路径能跑完的环境里，成功返回后会因 `NameError` 退出。

## 变更影响

| 变更内容 | 影响范围 | 需同步更新 |
|---------|---------|-----------|
| 增删命令行参数 | README 的执行说明、控制台调用方 | [api/entry_api.md](../api/entry_api.md)、[guides/download_video.md](../guides/download_video.md) |
| 修改 `save_folder` | 控制台与图形界面的默认保存目录 | 两处调用点都传该变量 |
| 去掉顶层 `import gui` | `--nogui` 不再依赖 Tk | [architecture.md](../architecture.md) 已知违规一节 |

**被依赖方**: 无其他模块导入 `main`。`gui.py` 在 `__main__` 时自行调用 `gui_main`。
**反向风险**: 入口依赖图形界面模块，使无 Tk 的环境无法执行控制台下载。

## 快速索引

| 用途 | 路径 |
|------|------|
| 进程入口 | `main.py` |
| 参数定义 | `args.py` → `get_parser` |
| 分片请求头 | `config.py` → `headers` |
| API | [api/entry_api.md](../api/entry_api.md) |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
