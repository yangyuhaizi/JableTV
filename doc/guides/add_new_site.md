<!-- generated from: JableTV src @ 2026-10-11 -->

# 注册新的影片站点 指南

> 场景: 一条 URL 现有 `siteList` 都不匹配，或某站的 `get_url_infos` 需要换成新的页面结构。

## 前置条件

- 已阅读 [modules/sites.md](../modules/sites.md) 与 [api/crawler_api.md](../api/crawler_api.md)。
- 新 URL 的目录名能由一个正则捕获组表示。该捕获组会变成临时目录名。
- `get_url_infos` 在成功返回前必须设置 `self._m3u8url`。标题与封面可空，但标题为空时成片文件名会在拼接阶段失败。

## 步骤

### Step 1: 子类

在 `M3U8Sites/` 新增或扩展现有模块。模式与解析分开：只换主机时继承已有 `get_url_infos`。

```python
import re
import cloudscraper
from M3U8Sites.M3U8Crawler import M3U8Crawler, request_headers


class SiteExample(M3U8Crawler):
    website_pattern = r"https://example\.test/videos/.+/"
    website_dirname_pattern = r"https://example\.test/videos/(.+)/$"

    def get_url_infos(self) -> None:
        htmlfile = cloudscraper.create_scraper(
            browser=request_headers, delay=10
        ).get(self._url)
        if htmlfile.status_code != 200:
            raise Exception(f"Bad url names: {self._url}")
        matched = re.search(r"https://\S+\.m3u8", htmlfile.text)
        if not matched:
            raise Exception(f"m3u8 missing: {self._url}")
        self._m3u8url = matched[0]
        self._targetName = self._dirName
        self._imageUrl = None
```

**关键文件**: `M3U8Sites/M3U8Crawler.py`。`validate_url` 读取的类属性名是 `website_dirname_pattern`。剪贴板与文本导入用的是 `website_pattern`（见 `gui.py` 的 `re.findall`）。

### Step 2: 写入 siteList

`VaildateUrl` 返回第一个命中的类。更具体的模式放在更宽的模式之前。

```python
import M3U8Sites.SiteExample as site_example

siteList = (
    site_example.SiteExample,
    # 原有条目保持在后面
)
```

**关键文件**: `M3U8Sites/__init__.py` 的 `siteList`。列表页不是单片 URL 时，另做一个 `SiteUrlList_M3U8` 子类并放入 `siteUrlList`。图形界面打开列表窗应调用 `CreateSiteUrlList`，不要调用元组 `siteUrlList`。

### Step 3: 确认基类会接着下载

`CreateSite` 只负责构造。`is_url_vaildate()` 为真之后，`start_download` 才会拉播放列表。多码率时基类固定使用 `playlists[0]`。

## 验证方法

1. `VaildateUrl(url)` 返回新类，`validate_url(url)` 返回预期目录名。
2. 无结尾斜线或错误主机时，`CreateSite` 返回 `None`。
3. 影片页状态码为 200 且正文含 m3u8 时，`is_url_vaildate()` 为 `True`。
4. `consoles_main` 在保存目录写出非空 `.mp4`。若站点返回 403 挑战页，第 3 步为假，第 4 步不会开始。这与 [guides/download_video.md](download_video.md) 里 `start-153` 的记录相同。

## 常见问题

| 问题 | 原因 | 处理 |
|------|------|------|
| 剪贴板能加进列表，`CreateSite` 却返回 `None` | `website_pattern` 比 `website_dirname_pattern` 宽，或后者缺少捕获组 | 两个正则对同一条样例 URL 分别用 `findall` 与 `match` 试一次 |
| 状态码 200 仍打印「下載網址錯誤」 | 正则没有匹配，`result[0]` 抛 `TypeError`，被构造函数吃掉 | 在 `get_url_infos` 里对 `None` 单独抛出带字段名的异常 |
| 列表窗打不开 | `gui.checkVideoLists` 调用了元组 `siteUrlList` | 改为 `CreateSiteUrlList` |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
