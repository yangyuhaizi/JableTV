<!-- generated from: JableTV src @ 2026-10-11 -->

# gui API

> 源码: `gui.py`, `mywidget.py`

## gui_main

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `gui_main(url, dest)` | `None` | 创建 `JableTVDownloadWindow`，进入 `mainloop`。窗口关闭流程里调用 `cancel_download` 后，`_on_window_closed` 执行 `os._exit(0)` |

### Usage Pattern

```python
from gui import gui_main

gui_main("https://jable.tv/videos/start-153/", "download")
```

当前解释器没有 `_tkinter` 时，`import gui` 即失败，`gui_main` 不会执行。封面依赖 Pillow；`requirements.txt` 锁定的 Pillow 9.2 在 CPython 3.14 上未能从源码构建。

## JableTVDownloadWindow

### Public API

| 方法 | 说明 |
|------|------|
| `__init__(dest="download", url="")` | 读 `JableTV.csv`，启动剪贴板线程 |
| `on_add_list()` | URL 能 `VaildateUrl` 则加入树；否则 `checkVideoLists` |
| `on_start_download()` | 当前输入进入队列 |
| `on_start_all_download()` | 选中行进入队列 |
| `on_cancel_download()` | 取消当前任务或从等待队列移除当前 URL |
| `on_cancel_all_download()` | 置 `_cancel_all` 并取消当前任务 |
| `cancel_download()` | `gui_main` 在 `mainloop` 返回后调用 |

队列计时器 `_on_timer_downloading` 是内部方法。完成时把树状态设为 `已下載`，不检查成片文件是否真的写完。`start_download` 中途失败时，界面仍可能显示 `已下載`。

### Usage Pattern

编程方式加入一行并开始队列（需要已经创建的 Tk 根窗口）：

```python
wnd.on_add_list()          # 使用窗口里「下載網址」「存放位置」两个输入框
wnd.on_start_download()    # 状态变为「等待中」，0.5 秒后尝试 CreateSite
```

`CreateSite` 返回的对象若 `is_url_vaildate()` 为假，`begin_concurrent_download` 仍会提交 `start_download`。`start_download` 不检查 `_m3u8url`。解析失败的对象进入 `download_image` 时，`_imageUrl` 为 `None`，`is_target_image_exist` 返回 `True`；随后 `_create_m3u8` 对空的 `_m3u8url` 调用 `split`，抛出 `AttributeError`。该异常发生在工作线程里。

## MyDownloadListView

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `additem(url, saveName="", savePath="", state="")` | `None` | `VaildateUrl` 失败则不插入。`iid = hash(url)` |
| `update_item_state(url, state)` | `None` | 行不存在则跳过 |
| `isUrlExist(url) -> bool` | `Treeview.exists(hash(url))` | |
| `save_to_csv(csvName)` | `None` | `list_modified` 为假时不写文件 |
| `load_from_csv(csvName)` | `None` | 文件不存在则返回 |

列名：`網址`、`名稱`、`儲存位置`、`狀態`。显示顺序是儲存位置、網址、名稱、狀態（`displaycolumns=[2, 0, 1, 3]`）。

### Usage Pattern

```python
tree.additem(
    "https://jable.tv/videos/start-153/",
    saveName="",
    savePath="download",
    state="",
)
tree.update_item_state("https://jable.tv/videos/start-153/", "等待中")
```

`hash()` 在不同 Python 进程之间加盐，不能把树的 `iid` 当作跨进程主键。CSV 用 URL 字符串而不是 hash 作为行内容。

## RedirectConsole

构造时执行 `sys.stdout.write = self._on_stdout_write`。`\r` 刷新当前行，`\n` 增加行号。析构时恢复原来的 `write`。进程若 `os._exit`，析构不运行。

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
