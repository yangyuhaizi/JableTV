<!-- generated from: JableTV src @ 2026-10-11 -->

# crawler API

> 源码: `M3U8Sites/M3U8Crawler.py`

方法名保持源码拼写：`is_url_vaildate`、`is_concurrent_dowload_completed`。

## M3U8Crawler

子类必须定义类属性 `website_dirname_pattern`（含一个捕获组），并实现 `get_url_infos`。`get_url_infos` 成功时写入：

| 属性 | 类型 | 空值含义 |
|------|------|----------|
| `_m3u8url` | `str \| None` | `None` 时 `is_url_vaildate()` 为 `False`，`start_download` 仍会被调用方拦住 |
| `_targetName` | `str \| None` | 空则封面与成片文件名无法按标题生成 |
| `_imageUrl` | `str \| None` | `None` 时 `download_image` 视为封面已存在，不发请求 |

构造失败（`get_url_infos` 抛异常，或 `validate_url` 返回空）时，对象仍然返回。前一种情况会打印 `下載網址 <url> 錯誤!!` 并把三个属性置为 `None`。后一种情况在 `validate_url` 失败时直接 `return`，不打印该句。

### Public API

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `validate_url(url: str) -> str \| None` | 目录名，或 `None` | 类方法。对 `website_dirname_pattern` 做 `re.match(..., flags=re.I)` |
| `__init__(url, savepath="", silence=False)` | `None` | `silence=True` 时不打印文件名、保存位置、缩略图 URL |
| `get_url_infos()` | 基类直接 `raise Exception` | 子类覆盖 |
| `target_name() -> str \| None` | `_targetName` | 构造末尾会删掉标题里匹配 `[^\w\-_\. ]` 的字符 |
| `dest_folder() -> str \| None` | `_dest_folder` | `validate_url` 失败时为 `None` |
| `is_url_vaildate() -> bool` | `_m3u8url` 是否为真 | |
| `get_url_full() -> str` | 构造时的 URL | 仅在 `validate_url` 成功并执行到 `self._url = url` 之后存在 |
| `is_target_video_exist() -> bool` | 成片路径是否存在 | |
| `is_target_image_exist() -> bool` | 无封面 URL 时返回 `True` | |
| `download_image() -> str \| None` | 封面保存路径；HTTP 非 200 或异常时 `None` | 已存在则不重新下载 |
| `start_download()` | `None` | 成片已存在时打印 `檔案已存在!!` 并返回 |
| `cancel_download()` | `None` | 置 `_cancel_job`，并 `shutdown` 两个线程池 |
| `begin_concurrent_download()` | `None` | 把 `start_download` 提交到线程池 |
| `is_concurrent_dowload_completed() -> bool` | future 已完成时为 `True`，并把 `_t_future` 置 `None` | 未调用 `begin_concurrent_download` 时访问 `_t_future` 会 `AttributeError`（该属性初值为 `None`，`None.done()` 失败） |
| `end_concurrent_download()` | `None` | `shutdown` 外层线程池 |

`SiteUrlList_M3U8` 只提供读取方法：`getLinks`、`getLinkDescs`、`getListType`、`getTotalLinks`、`getTotalPages`、`getCurrentPage`、`getSortType`、`isVaildLinks`。字段由子类 `JableTVList` 填充。

### Usage Pattern

单线程下载。调用前 `is_url_vaildate()` 必须为真，否则 `start_download` 里的 `download_image` / `_create_m3u8` 会在空字段上失败。

```python
from M3U8Sites import CreateSite

job = CreateSite("https://jable.tv/videos/start-153/", savepath="download")
if job and job.is_url_vaildate():
    job.start_download()
```

解析失败时不要调用 `start_download`。2026-10-11 该 URL 走这个分支：对象非空，`is_url_vaildate()` 为 `False`，标准输出有 `下載網址 … 錯誤!!`。

```python
from M3U8Sites import CreateSite

url = "https://jable.tv/videos/start-153/"
job = CreateSite(url, savepath="/tmp/jable-dl-test", silence=True)
if job is None or not job.is_url_vaildate():
    raise RuntimeError(f"m3u8 not available: {url}")
```

图形界面使用的并发包装：

```python
job.begin_concurrent_download()
# 定时器里:
if job.is_concurrent_dowload_completed():
    job.end_concurrent_download()
```

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
