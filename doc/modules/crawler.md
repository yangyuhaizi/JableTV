<!-- generated from: JableTV src @ 2026-10-11 -->

# crawler 模块概述

> 源码: `M3U8Sites/M3U8Crawler.py`

## 职责

`M3U8Crawler` 在子类已经写入 `_m3u8url`、`_targetName`、`_imageUrl` 之后，下载封面与全部分片，解密后按播放列表顺序拼接为 `_targetName + ".mp4"`。

**设计动机**: 各站只负责把页面变成三个 URL 字段。分片并发、断点跳过和拼接放在基类，避免每个站点复制下载循环。详见 [architecture.md](../architecture.md) § 为什么自行拼接 TS，而不调用 ffmpeg。

**非目标**: 不识别站点，不提供图形界面，不调用 ffmpeg。

## 目录结构

```
M3U8Sites/
└── M3U8Crawler.py
    ├── M3U8Crawler          # 单部影片下载
    └── SiteUrlList_M3U8     # 列表页字段访问器，无网络实现
```

同文件顶部定义 `request_headers` 与 `default_max_workers`。站点模块通过 `from M3U8Sites.M3U8Crawler import *` 使用这两个名字。

## 依赖

| 依赖 | 依赖内容 | 强度 | 说明 |
|------|----------|------|------|
| config | `headers` | 强 | 分片与密钥请求 |
| requests | `requests.get` | 强 | 超时 10 秒 |
| m3u8 | `m3u8.load` | 强 | 播放列表 |
| Crypto.Cipher.AES | AES-CBC | 强 | 仅当播放列表含密钥 URI |
| 标准库 | `concurrent.futures`, `os`, `re` | 强 | 线程池与路径 |

不依赖: `gui`、`main`、具体站点类。云端反爬库由站点子类在 `get_url_infos` 里使用，基类下载分片时不用 cloudscraper。

## 核心类

| 类 | 职责 | 源文件 |
|----|------|--------|
| `M3U8Crawler` | URL 校验、封面、分片、拼接、取消 | `M3U8Sites/M3U8Crawler.py` |
| `SiteUrlList_M3U8` | 列表页已解析字段的读取方法 | 同文件。网络抓取在 `JableTVList` |

## 关键枚举

无。`skip_pattern` 是类属性布尔值，默认 `False`。图形界面扫描剪贴板时，该属性为真的站点类会被跳过。当前注册类都没有把它设为 `True`。

## 数据流

```
子类 get_url_infos 写入 _m3u8url / _targetName / _imageUrl
  -> start_download
  -> download_image 写入 <保存目录>/<标题>.jpg
  -> _create_m3u8 填充 _tsList，可选创建 _ci
  -> _prepareCrawl 跳过临时目录里已存在的 <分片名>.mp4
  -> _startCrawl 最多 8 轮 ThreadPoolExecutor.map(_scrape)
  -> _mergeMp4Chunks 按 _tsList 顺序追加到 <保存目录>/<标题>.mp4
  -> _deleteMp4Chunks；临时目录与保存目录不同时 removedirs(临时目录)
```

**数据约定**:

| 字段 | 含义 |
|------|------|
| `_temp_folder` | `os.getcwd()` 与 URL 目录名（如 `start-153`）拼接。分片写在这里 |
| `_dest_folder` | `savepath` 为空时等于临时目录；否则为 `os.path.join(os.getcwd(), savepath)`。绝对路径时 `os.path.join` 的结果就是该绝对路径 |
| 分片文件名 | URL 最后一段去掉末尾 3 个字符，再加 `.mp4` |
| 加密 | 有密钥 URI 时下载密钥。有 IV 时 `AES.new(key, AES.MODE_CBC, iv)`；无 IV 时不传 IV |

`_create_m3u8` 若发现 `playlists` 非空，只加载 `playlists[0]`。多码率列表里第一个条目不一定是最高码率。

相对分片 URI 会拼到 m3u8 所在目录。`seg.uri` 以 `https://` 开头时，对应的 `tsUrl = seg.uri` 被注释。循环仍执行 `_tsList.append(tsUrl)`：第一条就是绝对地址时 `tsUrl` 未赋值；后面的绝对地址会沿用上一条相对地址拼出来的值。

IV 处理：`m3u8iv.replace("0x", "")[:16].encode()`。结果是十六进制文本的前 16 个字符的 ASCII 字节，不是 `bytes.fromhex` 得到的 16 字节。

`_scrape` 在下载过程中对 `self._downloadList` 执行 `remove`。该列表同时是 `executor.map` 的输入。

## 变更影响

| 变更内容 | 影响范围 | 需同步更新 |
|---------|---------|-----------|
| `start_download` / `cancel_download` 语义 | 图形界面队列与控制台 | [api/crawler_api.md](../api/crawler_api.md)、[gui.md](gui.md) |
| 临时目录位置 | 断点续传依赖 `<cwd>/<目录名>/*.mp4` | 下载指南中的路径说明 |
| `validate_url` 使用的类属性名 | 全部站点子类必须提供 `website_dirname_pattern` | [guides/add_new_site.md](../guides/add_new_site.md) |

**被依赖方**: `sites` 全部适配器，以及 `gui` 通过 `CreateSite` 间接调用。
**反向风险**: 无站点类型的反向导入。

## 快速索引

| 用途 | 路径 |
|------|------|
| 开始下载 | `M3U8Crawler.start_download` |
| 播放列表 | `M3U8Crawler._create_m3u8` |
| API | [api/crawler_api.md](../api/crawler_api.md) |

## 版本记录

| 日期 | 作者 | AI 模型 | 内容 |
|------|------|---------|------|
| 2026-10-11 | xiangyu | Grok 4.7 | 初版 |
