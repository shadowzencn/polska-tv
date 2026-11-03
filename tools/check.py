"""Parse an M3U playlist and verify each HLS stream: playlist reachability, latency, first segment."""
import asyncio, json, re, sys, time
from urllib.parse import urljoin
import aiohttp

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

def parse_m3u(text):
    items, cur = [], None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF"):
            attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', line))
            cur = {"name": line.rsplit(",", 1)[-1].strip(), "tvg_id": attrs.get("tvg-id", ""),
                   "logo": attrs.get("tvg-logo", ""), "group": attrs.get("group-title", ""),
                   "referrer": attrs.get("http-referrer", ""), "ua": attrs.get("http-user-agent", "")}
        elif line and not line.startswith("#") and cur:
            cur["url"] = line
            items.append(cur)
            cur = None
    return items

async def fetch(session, url, headers, limit=None):
    t0 = time.perf_counter()
    async with session.get(url, headers=headers, allow_redirects=True) as r:
        ttfb = (time.perf_counter() - t0) * 1000
        body = await (r.content.read(limit) if limit else r.read())
        return r.status, str(r.url), body, ttfb, (time.perf_counter() - t0) * 1000

async def check(session, item, sem):
    headers = {"User-Agent": item.get("ua") or UA}
    if item.get("referrer"):
        headers["Referer"] = item["referrer"]
    res = {"ok": False, "latency_ms": None, "segment_ms": None, "error": ""}
    async with sem:
        try:
            url = item["url"]
            st, final, body, ttfb, _ = await fetch(session, url, headers)
            res["latency_ms"] = round(ttfb)
            if st != 200:
                res["error"] = f"HTTP {st}"; return {**item, **res}
            text = body.decode("utf-8", "ignore")
            if "#EXTM3U" not in text:
                res["error"] = "not m3u8"; return {**item, **res}
            for _ in range(3):
                lines = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]
                if not lines:
                    res["error"] = "empty playlist"; return {**item, **res}
                nxt = urljoin(final, lines[0])
                if "#EXT-X-STREAM-INF" in text:
                    st, final, body, _, _ = await fetch(session, nxt, headers)
                    if st != 200:
                        res["error"] = f"variant HTTP {st}"; return {**item, **res}
                    text = body.decode("utf-8", "ignore")
                    continue
                seg = urljoin(final, lines[-1])
                st, _, b, _, total = await fetch(session, seg, headers, limit=65536)
                if st not in (200, 206) or len(b) < 1000:
                    res["error"] = f"segment HTTP {st}"; return {**item, **res}
                res["segment_ms"] = round(total)
                res["ok"] = True
                return {**item, **res}
            res["error"] = "too many nested playlists"
        except Exception as e:
            res["error"] = type(e).__name__ + (f": {e}"[:80] if str(e) else "")
    return {**item, **res}

async def main(src, out):
    items = parse_m3u(open(src, encoding="utf-8").read())
    sem = asyncio.Semaphore(30)
    timeout = aiohttp.ClientTimeout(total=20, connect=8)
    async with aiohttp.ClientSession(timeout=timeout, connector=aiohttp.TCPConnector(ssl=False)) as s:
        results = await asyncio.gather(*(check(s, i, sem) for i in items))
    json.dump(results, open(out, "w"), ensure_ascii=False, indent=1)
    ok = [r for r in results if r["ok"]]
    print(f"{len(ok)}/{len(results)} ok")
    for r in results:
        print(("OK " if r["ok"] else "-- ") + f'{r["name"][:45]:45} {r["latency_ms"]}ms seg={r["segment_ms"]} {r["error"]}')

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
