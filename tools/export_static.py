"""Export a static build (for GitHub Pages): copy static/ and write api/channels.json with fresh stream checks."""
import asyncio, json, os, shutil, sys
from datetime import datetime, timezone

import aiohttp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(__file__))
from check import check  # noqa: E402


async def run(out_dir):
    data = json.load(open(os.path.join(ROOT, "data", "channels.json"), encoding="utf-8"))
    sem = asyncio.Semaphore(20)
    now = lambda: datetime.now(timezone.utc).isoformat()
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25, connect=8),
                                     connector=aiohttp.TCPConnector(ssl=False)) as session:
        async def one(src):
            r = await check(session, dict(src), sem)
            return {k: r[k] for k in ("ok", "latency_ms", "segment_ms", "error")} | {"checked_at": now()}
        channels = []
        for ch in data["channels"]:
            statuses = await asyncio.gather(*(one(s) for s in ch["sources"]))
            srcs = [{"index": i, "url": s["url"], "label": s["label"], "needs_proxy": bool(s["referrer"] or s["ua"]),
                     "status": st} for i, (s, st) in enumerate(zip(ch["sources"], statuses))]
            channels.append({k: v for k, v in ch.items() if k != "sources"} | {"sources": srcs})
    payload = {"categories": data["categories"], "checked_at": now(), "server_time": now(),
               "static": True, "channels": channels}
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    shutil.copytree(os.path.join(ROOT, "static"), out_dir)
    os.makedirs(os.path.join(out_dir, "api"), exist_ok=True)
    json.dump(payload, open(os.path.join(out_dir, "api", "channels.json"), "w", encoding="utf-8"), ensure_ascii=False)
    open(os.path.join(out_dir, ".nojekyll"), "w").close()
    ok = sum(any(s["status"]["ok"] for s in c["sources"]) for c in channels)
    print(f"exported {len(channels)} channels ({ok} available) to {out_dir}")


if __name__ == "__main__":
    asyncio.run(run(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "_site")))
