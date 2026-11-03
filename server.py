"""Polska TV: static site + stream health checker + whitelisted HLS proxy."""
import asyncio, json, os, sys, time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, quote

import aiohttp
from aiohttp import web

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from check import UA, check  # noqa: E402

CHECK_INTERVAL = int(os.environ.get("CHECK_INTERVAL", "600"))
DATA = json.load(open(os.path.join(ROOT, "data", "channels.json"), encoding="utf-8"))
SOURCES = {}  # (channel_id, index) -> source dict
for ch in DATA["channels"]:
    for i, s in enumerate(ch["sources"]):
        SOURCES[(ch["id"], i)] = s
ALLOWED_HOSTS = {urlparse(s["url"]).hostname for s in SOURCES.values()}
STATUS = {}  # "id:index" -> result
LAST_FULL_CHECK = {"at": None}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def check_source(session, key, sem):
    src = SOURCES[key]
    r = await check(session, dict(src), sem)
    STATUS[f"{key[0]}:{key[1]}"] = {k: r[k] for k in ("ok", "latency_ms", "segment_ms", "error")} | {"checked_at": now_iso()}


async def check_all(app):
    sem = asyncio.Semaphore(20)
    await asyncio.gather(*(check_source(app["session"], k, sem) for k in SOURCES))
    LAST_FULL_CHECK["at"] = now_iso()


async def checker_loop(app):
    while True:
        try:
            await check_all(app)
        except Exception as e:  # keep the loop alive
            print("check failed:", e)
        await asyncio.sleep(CHECK_INTERVAL)


def channel_payload(ch):
    srcs = []
    for i, s in enumerate(ch["sources"]):
        srcs.append({"index": i, "url": s["url"], "label": s["label"],
                     "needs_proxy": bool(s["referrer"] or s["ua"]),
                     "status": STATUS.get(f'{ch["id"]}:{i}')})
    return {k: v for k, v in ch.items() if k != "sources"} | {"sources": srcs}


async def api_channels(request):
    return web.json_response({"categories": DATA["categories"], "checked_at": LAST_FULL_CHECK["at"],
                              "server_time": now_iso(), "channels": [channel_payload(c) for c in DATA["channels"]]})


async def api_recheck(request):
    cid = request.match_info["id"]
    ch = next((c for c in DATA["channels"] if c["id"] == cid), None)
    if not ch:
        raise web.HTTPNotFound()
    sem = asyncio.Semaphore(5)
    await asyncio.gather(*(check_source(request.app["session"], (cid, i), sem) for i in range(len(ch["sources"]))))
    return web.json_response(channel_payload(ch))


def proxied(url, ref):
    return "/proxy?u=" + quote(url, safe="") + ("&r=" + quote(ref, safe="") if ref else "")


def rewrite_playlist(text, base, ref):
    out = []
    for line in text.splitlines():
        s = line.strip()
        if s and not s.startswith("#"):
            absu = urljoin(base, s)
            ALLOWED_HOSTS.add(urlparse(absu).hostname)
            out.append(proxied(absu, ref))
        elif 'URI="' in s:
            pre, rest = s.split('URI="', 1)
            uri, post = rest.split('"', 1)
            absu = urljoin(base, uri)
            ALLOWED_HOSTS.add(urlparse(absu).hostname)
            out.append(f'{pre}URI="{proxied(absu, ref)}"{post}')
        else:
            out.append(line)
    return "\n".join(out) + "\n"


async def proxy(request):
    url = request.query.get("u", "")
    ref = request.query.get("r", "")
    p = urlparse(url)
    if p.scheme not in ("http", "https") or p.hostname not in ALLOWED_HOSTS:
        raise web.HTTPForbidden(text="host not allowed")
    src = next((s for s in SOURCES.values() if s["url"] == url), None)
    headers = {"User-Agent": (src and src["ua"]) or UA}
    ref = ref or (src and src["referrer"]) or ""
    if ref:
        headers["Referer"] = ref
    try:
        resp = await request.app["session"].get(url, headers=headers)
    except Exception as e:
        raise web.HTTPBadGateway(text=str(e))
    async with resp:
        ctype = resp.headers.get("Content-Type", "")
        cors = {"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"}
        if resp.status != 200:
            return web.Response(status=resp.status, headers=cors)
        if "mpegurl" in ctype.lower() or urlparse(str(resp.url)).path.endswith(".m3u8"):
            text = (await resp.read()).decode("utf-8", "ignore")
            if text.lstrip().startswith("#EXTM3U"):
                return web.Response(text=rewrite_playlist(text, str(resp.url), ref),
                                    content_type="application/vnd.apple.mpegurl", headers=cors)
            return web.Response(text=text, headers=cors)
        out = web.StreamResponse(headers=cors | {"Content-Type": ctype or "video/mp2t"})
        await out.prepare(request)
        async for chunk in resp.content.iter_chunked(64 * 1024):
            await out.write(chunk)
        await out.write_eof()
        return out


async def index(request):
    return web.FileResponse(os.path.join(ROOT, "static", "index.html"))


async def on_startup(app):
    app["session"] = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25, connect=8),
                                           connector=aiohttp.TCPConnector(ssl=False, limit=100))
    app["checker"] = asyncio.create_task(checker_loop(app))


async def on_cleanup(app):
    app["checker"].cancel()
    await app["session"].close()


def make_app():
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/api/channels", api_channels)
    app.router.add_post("/api/channels/{id}/check", api_recheck)
    app.router.add_get("/proxy", proxy)
    app.router.add_static("/", os.path.join(ROOT, "static"))
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
