<!-- generated from: JableTV src @ 2026-10-11 -->

# gui 模块概述

> 源码: `gui.py`, `mywidget.py`

## 职责

`JableTVDownloadWindow` 维护下载列表、一次只跑一个 `M3U8Crawler` 任务，并把 `print` 重定向到列表框。关闭窗口时把列表写入当前工作目录的 `JableTV.csv`。

**设计动机**: README 描述的使用方式是收集多条 URL 后逐个下载，并支持从文本和剪贴板导入。队列状态放在界面，下载仍调用 `CreateSite`。详见 [architecture.md](../architecture.md) § 为什么图形界面串行影片、分片并行。

**非目标**: 不解析 m3u8。不并行下载多部影片。

## 目录结构

```
gui.py
├── gui_main
├── JableTVDownloadWindow       # 主窗口
└── JableTVVideoListWindow      # jable.tv 列表选片

mywidget.py
├── RedirectConsole             # 替换 sys.stdout.write
├── ScrollTreeView              # 带垂直滚动条的 Treeview
└── MyDownloadListView          # 四列下载列表与 CSV
```

## 依赖

| 依赖模块 | 依赖内容 | 强度 | 说明 |
|----------|----------|------|------|
| sites | `CreateSite`, `VaildateUrl`, `siteList` | 强 | 加入列表与开始下载 |
| mywidget | 列表与控制台控件 | 强 | `gui.py` 星号导入 |
| Tk | `tkinter` | 强 | 2026-10-11 本机 CPython 3.14.3 无 `_tkinter` |
| Pillow | `Image`, `ImageTk` | 强 | 封面预览。`requirements.txt` 中的 9.2 在 3.14 上未能构建 |

不依赖: `args.py`。`gui.py` 作为 `__main__` 时调用 `gui_main("", "download")`，不读命令行。

`gui.py` 使用 `ttk.Checkbutton` 与 `os.path` / `os._exit`。这两个名字来自 `from mywidget import *`（`mywidget.py` 导入了 `tkinter.ttk` 与 `os`），不是 `gui.py` 的直接导入。

## 核心类

| 类 | 职责 | 源文件 |
|----|------|--------|
| `JableTVDownloadWindow` | 列表、队列、取消、剪贴板、导入文本 | `gui.py` |
| `JableTVVideoListWindow` | 分页与排序，把选中链接交回主窗口 | `gui.py` |
| `MyDownloadListView` | 列：網址、名稱、儲存位置、狀態 | `mywidget.py` |
| `RedirectConsole` | 把 `\r` 进度刷新在同一行 | `mywidget.py` |

## 关键枚举

`MyDownloadListView._download_state_` 把状态文字映射为排序权重：

| 状态文字 | 权重 |
|----------|------|
| 已下載 | 0 |
| 未完成 | 1 |
| 下載中 | 2 |
| 等待中 | 3 |
| 已取消 | 4 |
| （空字符串） | 100 |
| 網址錯誤 | 99 |

界面写入这些字符串。下载引擎不返回该枚举。

## 数据流

```
加入清單
  -> VaildateUrl 命中: CreateSite，树中新增一行
  -> 未命中: checkVideoLists
开始下载
  -> URL 与保存目录进入 _download_list，状态「等待中」
  -> _on_timer_downloading 每 0.5 秒
  -> 无当前任务时弹出队列头，CreateSite，begin_concurrent_download，状态「下載中」
  -> is_concurrent_dowload_completed 为真: 状态「已下載」
关闭窗口
  -> 取消当前任务，save_to_csv("JableTV.csv")，os._exit(0)
```

**数据约定**: 树节点 `iid` 是 `hash(url)`。同一进程内重复 URL 不会新增行。CSV 编码为 UTF-8，表头与列名相同。README 写的文件名 `jabletv.cvs` 与源码 `JableTV.csv` 不一致，以源码为准。

`checkVideoLists` 调用 `M3U8Sites.siteUrlList(self._url)`。`siteUrlList` 不是可调用对象。列表页选片窗口因此到不了 `JableTVVideoListWindow`。

`_loadThumbnail` 在 `CreateSite` 返回 `None` 时仍调用 `jjob.download_image()`。`validate_url` 失败时 `CreateSite` 返回 `None`。

## 变更影响

| 变更内容 | 影响范围 | 需同步更新 |
|---------|---------|-----------|
| 状态字符串 | CSV 旧文件与排序权重 | [api/gui_api.md](../api/gui_api.md) |
| `JableTV.csv` 列 | 已有列表文件 | `MyDownloadListView._colnames` |
| 队列从串行改为并行 | `_currentJob` 单一引用 | [architecture.md](../architecture.md) 设计决策 |

**被依赖方**: `main.py`。
**反向风险**: 控件模块 `mywidget.py` 导入 `M3U8Sites`，用于 `additem` 前的 `VaildateUrl`。

## 快速索引

| 用途 | 路径 |
|------|------|
| 启动窗口 | `gui.py` → `gui_main` |
| 下载队列 | `JableTVDownloadWindow._on_timer_downloading` |
| API | [api/gui_api.md](../api/gui_api.md) |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
