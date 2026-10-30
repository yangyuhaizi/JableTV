<!-- generated from: JableTV src @ 2026-10-11 -->

# JableTV AI Documentation Index

> 从已注册站点的影片页下载 HLS，拼接为本地 mp4。
> 本文档集的首要消费者是 AI 编程助手，次要消费者是开发人员。

仓库没有单独的规格书，因此没有 L5 `reference/`。

## Quick-Route

### 理解类

| 我要做什么 | 先读 | 再读 | 定位到 |
|-----------|------|------|--------|
| 了解整体架构 | [architecture.md](architecture.md) | — | 模块依赖图 |
| 了解入口如何选择界面 | [modules/entry.md](modules/entry.md) | [architecture.md](architecture.md) § 已知违规 | `main.py` |
| 了解分片下载与拼接 | [modules/crawler.md](modules/crawler.md) | [api/crawler_api.md](api/crawler_api.md) | `M3U8Crawler.start_download` |
| 了解站点如何被选中 | [modules/sites.md](modules/sites.md) | [api/sites_api.md](api/sites_api.md) | `VaildateUrl` |
| 了解下载队列界面 | [modules/gui.md](modules/gui.md) | [api/gui_api.md](api/gui_api.md) | `JableTVDownloadWindow` |

### 查询类

| 我要做什么 | 先读 | 再读 | 定位到 |
|-----------|------|------|--------|
| 查命令行参数 | [api/entry_api.md](api/entry_api.md) | [modules/entry.md](modules/entry.md) | `get_parser` |
| 查分片请求头 | [api/entry_api.md](api/entry_api.md) § headers | — | `config.headers` |
| 查下载对象方法 | [api/crawler_api.md](api/crawler_api.md) | [modules/crawler.md](modules/crawler.md) | `M3U8Crawler` |
| 查控制台下载函数 | [api/sites_api.md](api/sites_api.md) | [guides/download_video.md](guides/download_video.md) | `consoles_main` |
| 查 jable.tv 单片正则 | [api/sites_api.md](api/sites_api.md) § SiteJableTV | [modules/sites.md](modules/sites.md) | `website_dirname_pattern` |
| 查列表排序参数 | [modules/sites.md](modules/sites.md) § 关键枚举 | [api/sites_api.md](api/sites_api.md) § JableTVList | `JableTVList._sortby_dict` |
| 查界面状态文字 | [modules/gui.md](modules/gui.md) § 关键枚举 | [api/gui_api.md](api/gui_api.md) | `MyDownloadListView._download_state_` |
| 查列表文件名 | [modules/gui.md](modules/gui.md) | [api/gui_api.md](api/gui_api.md) | `JableTV.csv` |

### 新增/修改类

| 我要做什么 | 先读 | 再读 | 定位到 |
|-----------|------|------|--------|
| 增加一个站点 | [guides/add_new_site.md](guides/add_new_site.md) | [api/sites_api.md](api/sites_api.md) | `siteList` |
| 修改 jable.tv 页面解析 | [modules/sites.md](modules/sites.md) | [api/sites_api.md](api/sites_api.md) § SiteJableTV | `SiteJableTV.get_url_infos` |
| 修改保存目录或命令行 | [modules/entry.md](modules/entry.md) | [api/entry_api.md](api/entry_api.md) | `save_folder` |
| 修改分片解密或拼接 | [modules/crawler.md](modules/crawler.md) | [api/crawler_api.md](api/crawler_api.md) | `M3U8Crawler._create_m3u8` |

### 调试类

| 我要做什么 | 先读 | 再读 | 定位到 |
|-----------|------|------|--------|
| 调试某 URL 没有写出 mp4 | [guides/download_video.md](guides/download_video.md) | [api/sites_api.md](api/sites_api.md) | `consoles_main` |
| 调试命令行在导入阶段退出 | [guides/download_video.md](guides/download_video.md) § 常见问题 | [architecture.md](architecture.md) § 已知违规 | `main.py` 对 `gui` 的导入 |
| 调试「下載網址錯誤」 | [modules/sites.md](modules/sites.md) § 数据流 | [modules/crawler.md](modules/crawler.md) | `M3U8Crawler.__init__` |
| 调试成片不可播放 | [modules/crawler.md](modules/crawler.md) § 数据约定 | [guides/download_video.md](guides/download_video.md) | AES IV 与绝对分片 URI |
| 调试列表选片窗口 | [modules/gui.md](modules/gui.md) | [guides/add_new_site.md](guides/add_new_site.md) § 常见问题 | `checkVideoLists` |

## Query Map

| 问题 | 层级 | 入口 |
|------|------|------|
| 进程怎么启动 | L2 | [modules/entry.md](modules/entry.md) |
| 某函数的参数和返回值 | L3 | [api/](api/) 下四个 API 文档 |
| 依赖方向与 2026-10-11 实测 | L1 | [architecture.md](architecture.md) |
| 怎样下载、怎样加站点 | L4 | [guides/download_video.md](guides/download_video.md)、[guides/add_new_site.md](guides/add_new_site.md) |

## Module-Index

| 模块 | 概述文档 | 关键 API 文档 | 稳定性 |
|------|---------|-------------|--------|
| entry | [modules/entry.md](modules/entry.md) | [api/entry_api.md](api/entry_api.md) | Stable |
| crawler | [modules/crawler.md](modules/crawler.md) | [api/crawler_api.md](api/crawler_api.md) | Internal |
| sites | [modules/sites.md](modules/sites.md) | [api/sites_api.md](api/sites_api.md) | Experimental |
| gui | [modules/gui.md](modules/gui.md) | [api/gui_api.md](api/gui_api.md) | Internal |

## File-Index

| 文档文件 | 主要内容 | 关联源文件 |
|---------|---------|-----------|
| `architecture.md` | 架构、依赖、设计决策、`start-153` 实测摘要 | `main.py`, `requirements.txt` |
| `modules/entry.md` | 命令行分支 | `main.py`, `args.py`, `config.py` |
| `modules/crawler.md` | 分片与拼接 | `M3U8Sites/M3U8Crawler.py` |
| `modules/sites.md` | 站点注册与页面解析 | `M3U8Sites/__init__.py`, `M3U8Sites/SiteJableTV.py`, `M3U8Sites/Site91Porn.py`, `M3U8Sites/SiteJavDB.py` |
| `modules/gui.md` | 队列与 CSV | `gui.py`, `mywidget.py` |
| `api/entry_api.md` | 参数、随机 URL、headers | `args.py`, `config.py`, `main.py` |
| `api/crawler_api.md` | `M3U8Crawler` 方法 | `M3U8Sites/M3U8Crawler.py` |
| `api/sites_api.md` | 注册表与各站正则 | `M3U8Sites/` |
| `api/gui_api.md` | 窗口与列表控件 | `gui.py`, `mywidget.py` |
| `guides/download_video.md` | 安装、运行、`start-153` 失败记录 | `main.py`, `M3U8Sites/__init__.py` |
| `guides/add_new_site.md` | 新站点子类与注册 | `M3U8Sites/__init__.py`, `M3U8Sites/M3U8Crawler.py` |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版全量 L0–L4 |
