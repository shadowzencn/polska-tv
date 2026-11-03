# 波兰电视直播 · Polska TV Na Żywo

波兰电视频道直播导航站：频道中文简介、官网链接、直播源延迟检测、北京时间 / 华沙时间双时钟、内置 HLS 播放器（ArtPlayer + hls.js）。

## 运行

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python server.py          # 默认 http://0.0.0.0:8080 ，可用 PORT 环境变量修改
```

## 功能

- **延迟检测（双重）**
  - 服务器检测：后台每 10 分钟（`CHECK_INTERVAL` 环境变量，秒）对每个直播源做完整检测：请求播放列表 → 解析子列表 → 下载首个 TS 分片，记录播放列表响应时间和分片耗时；卡片上“重新检测”可立即复检。
  - 本机延迟：浏览器直接请求直播源测得的往返时间，反映访问者所在网络的真实情况（“本机测速”按钮批量测试）。
- **播放**：hls.js；“自动”模式先直连源站，失败（跨域/网络）时自动改为服务器中转；HTTP 源在 HTTPS 页面下自动走中转。
  中转接口 `/proxy` 只允许频道列表内的源站域名，不是开放代理。
- **时钟**：北京时间（Asia/Shanghai）与华沙时间（Europe/Warsaw），自动识别波兰冬令时/夏令时并显示时差。
- 分类筛选、搜索、收藏（localStorage）、按延迟/名称排序、仅显示可用、移动端适配、`#频道id` 深链接。

## 更新频道数据

```bash
.venv/bin/python tools/build.py     # 从 iptv-org 拉取最新波兰频道源，合并 tools/curated.py 中的介绍与官网，缓存台标
.venv/bin/python tools/check.py data.m3u out.json   # 独立检测任意 m3u 列表
```

频道介绍、官网、分类在 `tools/curated.py` 维护。直播源来自 [iptv-org/iptv](https://github.com/iptv-org/iptv)，
仅保留广播机构官方、FAST 免费频道和地方台的公开流；裸 IP 转播的付费频道（HBO、Canal+、Eleven Sports 等）被排除（`EXCLUDED_HOSTS`）。

## GitHub Pages（静态版）

`.github/workflows/pages.yml` 每 30 分钟（以及每次推送到 main）运行 `tools/export_static.py`：检测全部直播源，把结果写进 `_site/api/channels.json`，再连同 `static/` 一起发布到 GitHub Pages。

静态版和服务器版共用同一套前端，前端拿不到 `api/channels` 时自动读取 `api/channels.json` 并进入静态模式：
- 播放、ArtPlayer、本机测速、双时钟都照常可用；
- 没有服务器中转：HTTP 源和需要特殊请求头的源无法播放，会在播放器里提示；
- “重新检测”只做本机测速，服务器检测结果由 Actions 定时更新。
