<!-- generated from: JableTV src @ 2026-10-11 -->

# sites 模块概述

> 源码: `M3U8Sites/__init__.py`, `M3U8Sites/SiteJableTV.py`, `M3U8Sites/Site91Porn.py`, `M3U8Sites/SiteJavDB.py`

## 职责

`VaildateUrl` 按 `siteList` 顺序找到第一个 `validate_url` 返回非空的站点类。`CreateSite` 用该类构造下载对象。`consoles_main` 在 `is_url_vaildate()` 为真时调用 `start_download`。

**设计动机**: 调用方只传 URL 字符串。站点差异限制在 `get_url_infos` 与两个正则类属性。详见 [architecture.md](../architecture.md) § 为什么按站点分子类。

**非目标**: 不实现分片线程池。不保存图形界面里的 CSV。

## 目录结构

```
M3U8Sites/
├── __init__.py        # siteList、siteUrlList、CreateSite、consoles_main
├── SiteJableTV.py     # jable.tv、fs1.app，以及 JableTVList
├── Site91Porn.py      # 共用 SiteCCCDNXYZ 的一组镜像站
└── SiteJavDB.py       # javdb.live 一组，以及四个独立解析类
```

## 依赖

| 依赖模块 | 依赖内容 | 强度 | 说明 |
|----------|----------|------|------|
| crawler | `M3U8Crawler`, `SiteUrlList_M3U8`, `request_headers` | 强 | 每个具体站点类的基类 |
| cloudscraper | `create_scraper().get/post` | 强 | 影片页。状态码必须为 200，否则抛 `Exception` |
| beautifulsoup4 | 列表页与部分点播页 | 弱 | `JableTVList`、`SiteMIEN321`、`SiteAApp11` |

不依赖: `gui`、`main`、`args`。

## 核心类

| 类 | 职责 | 源文件 |
|----|------|--------|
| （模块函数） | URL 到类、构造、控制台下载 | `M3U8Sites/__init__.py` |
| `SiteJableTV` | `og:title`、`og:image`、`https://…m3u8` | `M3U8Sites/SiteJableTV.py` |
| `SiteJableTV_Backup` | 同上，主机改为 `fs1.app` | 同文件 |
| `JableTVList` | `jable.tv` 列表/搜索分页 | 同文件 |
| `SiteCCCDNXYZ` | 从缩略图 URL 把 `t.jpg` 换成 `v.m3u8` | `M3U8Sites/Site91Porn.py` |
| `SiteJavdbLive` | 从 `m3u8\|…\|src` 倒序拼 URL | `M3U8Sites/SiteJavDB.py` |
| `SiteMIEN321` / `SiteAApp11` | 再请求 dplayer 附加页取 m3u8 | 同文件 |
| `SiteSeselah` | `unescape` 十六进制路径拼到站点主机 | 同文件 |
| `SiteXJISHI` | POST `relatePage`，从 JSON 片段取路径 | 同文件 |

`SiteJableOrg`、`SiteThisAV`、`SitePigAV`、`SitePorn5F`、`Site85Tube`、`Site91Porn`、`SitePornBest` 只覆盖 `SiteCCCDNXYZ` 的两个正则。`SiteHAnimeXYZ`、`SitePornTW`、`SitePornJP`、`SitePornHK`、`SitePornHoHo`、`SitePornNVR`、`SiteVideo01`、`SitePornLuLu` 只覆盖 `SiteJavdbLive` 的两个正则。

`SitePornNVR.website_pattern` 的主机是 `www.pornvr.me`。README 写的是 `pornnvr.me`。以源码正则为准。

## 关键枚举

无。`JableTVList._sortby_dict` 是排序中文名到查询参数的映射：

| 界面文字 | 查询值 |
|----------|--------|
| 最高相關 | 空字符串（仅搜索页保留此项） |
| 近期最佳 | `post_date_and_popularity` |
| 最近更新 | `post_date` |
| 最多觀看 | `video_viewed` |
| 最高收藏 | `most_favourited` |

## 数据流

以 `https://jable.tv/videos/start-153/` 为例，模式可以命中，页面解析在当前站点响应下不能完成：

```
VaildateUrl
  -> SiteJableTV.validate_url 命中，目录名 start-153
  -> SiteJableTV("…/start-153/", savepath)
  -> get_url_infos: cloudscraper GET
  -> 状态码 403 时抛 Exception
  -> M3U8Crawler.__init__ 捕获，_m3u8url 为空
  -> is_url_vaildate() 为 False
  -> consoles_main 不调用 start_download
```

**数据约定**: `website_dirname_pattern` 必须有一个捕获组，作为临时目录名。`SiteJableTV` 要求 URL 以 `/` 结尾，因为模式末尾是 `$` 前的 `/`。`https://jable.tv/videos/start-153`（无结尾斜线）不会命中。

`JableTVList.__init__` 在 URL 不以 `https://jable.tv` 开头时直接 `return`，`islist` 保持构造时设下的 `None`。

## 变更影响

| 变更内容 | 影响范围 | 需同步更新 |
|---------|---------|-----------|
| `siteList` 顺序或条目 | 同一 URL 可能命中另一个类 | [api/sites_api.md](../api/sites_api.md)、图形界面剪贴板扫描 |
| `SiteJableTV.get_url_infos` 正则 | jable.tv 单片下载 | [guides/download_video.md](../guides/download_video.md) |
| `CreateSiteUrlList` | 图形界面「加入清單」在 URL 不是单片时打开列表窗 | [modules/gui.md](gui.md) 中 `checkVideoLists` 目前没有调用该函数 |

**被依赖方**: `main.py`（控制台）、`gui.py`、`mywidget.py`。
**反向风险**: `gui.checkVideoLists` 执行 `M3U8Sites.siteUrlList(self._url)`。`siteUrlList` 是元组，调用会抛 `TypeError`。注册表提供的函数名是 `CreateSiteUrlList`。

## 快速索引

| 用途 | 路径 |
|------|------|
| 单片 jable.tv | `M3U8Sites/SiteJableTV.py` → `SiteJableTV` |
| 注册与控制台 | `M3U8Sites/__init__.py` |
| API | [api/sites_api.md](../api/sites_api.md) |
| 新增站点 | [guides/add_new_site.md](../guides/add_new_site.md) |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版。含 `start-153` 在 403 挑战页上的解析结果 |
