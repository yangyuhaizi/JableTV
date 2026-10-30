<!-- generated from: JableTV src @ 2026-10-11 -->

# sites API

> 源码: `M3U8Sites/__init__.py`, `M3U8Sites/SiteJableTV.py`, `M3U8Sites/Site91Porn.py`, `M3U8Sites/SiteJavDB.py`

注册表函数的源码拼写是 `VaildateUrl`。

## 注册表

### Public API

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `VaildateUrl(url: str)` | 站点类，或 `None` | 遍历 `siteList`，返回第一个 `validate_url(url)` 为真的类 |
| `CreateSite(url, savepath="", silence=False)` | `M3U8Crawler` 子类实例，或 `None` | 无匹配类时 `None`。匹配后总会构造；解析失败时实例里的 `_m3u8url` 为 `None` |
| `CreateSiteUrlList(url, silence=False)` | `JableTVList`，或 `None` | 仅当 `isVaildLinks()` 为真才返回 |
| `consoles_main(url, dest=None)` | `None` | `url` 为空时从标准输入读一行。校验通过后 `start_download()`，然后打印 `下載完成!` |

`siteList` 元组顺序就是匹配顺序，定义在 `M3U8Sites/__init__.py`。`siteUrlList` 只有 `JableTVList`。

### Usage Pattern

控制台下载一条 URL。这是 `--nogui` 分支在导入图形界面成功之后会执行的调用。

```python
import M3U8Sites

M3U8Sites.consoles_main(
    "https://jable.tv/videos/start-153/",
    dest="download",
)
```

2026-10-11 实测该调用打印 `下載網址 https://jable.tv/videos/start-153/ 錯誤!!`，不打印 `下載完成!`，不创建 `download/` 或 `start-153/`。

先判断再下载，避免把挑战页当成坏 URL 之后仍继续：

```python
import M3U8Sites

url = "https://jable.tv/videos/start-153/"
site_cls = M3U8Sites.VaildateUrl(url)
job = M3U8Sites.CreateSite(url, savepath="download", silence=True)
if site_cls is None:
    raise RuntimeError("url not in siteList")
if not job.is_url_vaildate():
    raise RuntimeError("page fetched but m3u8 missing")
job.start_download()
```

同一次实测里，`site_cls` 是 `SiteJableTV`，`job.is_url_vaildate()` 为 `False`。

## SiteJableTV

### Public API

| 类属性 | 值 |
|--------|----|
| `website_pattern` | `r'https://jable\.tv/videos/.+/'` |
| `website_dirname_pattern` | `r'https://jable\.tv/videos/(.+)/$'` |

`get_url_infos`：GET 影片页。状态码不是 200 时抛 `Exception(f"Bad url names: {self._url}")`。200 时用三个正则：

| 目标属性 | 正则 |
|----------|------|
| `_targetName` | `og:title".+/>`，取倒数第二个双引号字段 |
| `_imageUrl` | `og:image".+jpg"`，同样取字段 |
| `_m3u8url` | `https://.+m3u8`，贪心，取整段匹配 |

`SiteJableTV_Backup` 把主机换成 `https://fs1.app/videos/`，解析函数继承 `SiteJableTV`。

## JableTVList

构造要求 URL 以 `https://jable.tv` 开头，且页面中存在 `div#site-content`。会员角标文字为 `會員` 的条目不进入 `links`。

| 方法 | 作用 |
|------|------|
| `getSortTypeList()` | 非搜索页会去掉「最高相關」 |
| `loadPageAtIndex(index, sortby)` | 按当前是否搜索页拼接 `from` 或 `from_videos`，再调用 `_url_get` |

## SiteCCCDNXYZ 与子类

`get_url_infos` 从 `meta name="keywords"` 取标题第一段，从 `thumbnail` 字段取路径，再把主机改成 `https://p.<port>.cccdn.xyz`，最后把路径中的 `t.jpg` 换成 `v.m3u8`。

| 类 | `website_dirname_pattern` 捕获的目录名 |
|----|----------------------------------------|
| `SiteJableOrg` | `jable.org` 的数字 id |
| `SiteThisAV` | `thisav.org` |
| `SitePigAV` | `pigav.org` |
| `SitePorn5F` | `porn5f.org` |
| `Site85Tube` | `85tube.org` |
| `Site91Porn` | `91porn.best` |
| `SitePornBest` | `pornbest.org`（模式无 `$`） |

## SiteJavdbLive 与独立解析类

`SiteJavdbLive.get_url_infos` 用正则 `m3u8\|.+\|src` 按 `|` 拆分，从末尾三段拼主机，其余段倒序拼路径，最后加 `.m3u8`。

只替换正则的子类：`SiteHAnimeXYZ`、`SitePornTW`、`SitePornJP`、`SitePornHK`、`SitePornHoHo`、`SitePornNVR`（主机 `pornvr.me`）、`SiteVideo01`、`SitePornLuLu`。

| 类 | `get_url_infos` 的第二跳 |
|----|-------------------------|
| `SiteMIEN321` | GET `.../addons/dplayer/?url=` |
| `SiteAApp11` | 十六进制解码后再 GET dplayer |
| `SiteSeselah` | 页面内 `unescape('...')` 解成路径 |
| `SiteXJISHI` | POST `https://forum.xjishi.site/sixvideo/video/relatePage?id=<目录名>` |

### Usage Pattern

新增匹配只影响 `VaildateUrl` 的返回类；下载仍走基类。完整步骤见 [guides/add_new_site.md](../guides/add_new_site.md)。

```python
import M3U8Sites

url = "https://jable.tv/videos/start-153/"
cls = M3U8Sites.VaildateUrl(url)
name = cls.validate_url(url)  # "start-153"
```

无结尾斜线时 `validate_url` 返回 `None`，`CreateSite` 返回 `None`：

```python
import M3U8Sites

url = "https://jable.tv/videos/start-153"
assert M3U8Sites.CreateSite(url) is None
```

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版。`consoles_main` 对 `start-153` 的结果来自当日请求 |
