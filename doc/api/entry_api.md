<!-- generated from: JableTV src @ 2026-10-11 -->

# entry API

> 源码: `args.py`, `config.py`, `main.py`

## get_parser

### Public API

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `get_parser() -> argparse.ArgumentParser` | 已添加三个参数的解析器 | 不解析 `sys.argv` |

参数：

| 选项 | type | default | help 原文 |
|------|------|---------|-----------|
| `--random` | `bool` | `False` | `Enter True for download random ` |
| `--url` | `str` | `""` | `Jable TV URL to download` |
| `--nogui` | `bool` | `False` | `True for disable gui mode` |

### Usage Pattern

指定 URL 并走控制台。`type=bool` 下，只要选项后面的字符串非空，`args.nogui` 就是 `True`。

```python
from args import get_parser

parser = get_parser()
args = parser.parse_args(["--url", "https://jable.tv/videos/start-153/", "--nogui", "True"])
assert args.url.endswith("/start-153/")
assert args.nogui is True
```

错误处理：短选项 `-nogui` 未定义。`parse_args(["-nogui", "True"])` 由 argparse 报错并退出。随机推荐在首页请求失败时，异常直接抛出，`main.py` 没有捕获。

```python
from args import get_parser

parser = get_parser()
try:
    parser.parse_args(["-nogui", "True"])
except SystemExit as exc:
    code = exc.code  # argparse 失败时为 2
```

## av_recommand

### Public API

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `av_recommand() -> str` | `https://jable.tv/` 页面里 `h6.title` 匹配到的一个 URL | 使用 `random.choice`。请求头是函数内的 `{'User-Agent': 'Mozilla/5.0'}`，不用 `config.headers` |

无匹配时 `random.choice([])` 抛出 `IndexError`。

### Usage Pattern

```python
from args import av_recommand

url = av_recommand()
# url 来自首页标题链接；站点拒绝请求时 urlopen 抛 URLError
```

首页返回挑战页或没有 `h6.title` 时，调用方需要捕获 `IndexError` 或 `urllib.error.URLError`。`main.py` 只在 `--random` 为真且 `--url` 为空时调用它；`--url` 非空时不会请求首页。

```python
from urllib.error import URLError
from args import av_recommand

try:
    url = av_recommand()
except (IndexError, URLError):
    url = ""
```

## headers

### Key Type Definitions

```python
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36",
}
```

定义位置：`config.py`。`M3U8Crawler` 的分片与密钥请求使用该字典。影片页请求不使用它。

## main 脚本分支

`main.py` 仅在 `__name__ == "__main__"` 时执行。逻辑见 [modules/entry.md](../modules/entry.md) 数据流。保存目录字面量是 `"download"`。

### Usage Pattern

进程入口（需要当前解释器带 `_tkinter`，因为导入发生在分支之前）：

```bash
python main.py --url "https://jable.tv/videos/start-153/" --nogui True
```

2026-10-11，CPython 3.14.3（Homebrew，无 `_tkinter`）上该命令退出码为 1，异常为 `ModuleNotFoundError: No module named '_tkinter'`。

不经过 `main.py`、直接调用下载函数的写法见 [api/sites_api.md](sites_api.md) 的 `consoles_main`。

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
