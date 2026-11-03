"""Build data/channels.json from the iptv-org Polish playlist and curated metadata; caches logos locally."""
import json, os, re, sys, urllib.request
from urllib.parse import urlparse
sys.path.insert(0, os.path.dirname(__file__))
from check import parse_m3u
from curated import CHANNELS, CATEGORIES, EXCLUDED_HOSTS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYLIST = "https://iptv-org.github.io/iptv/countries/pl.m3u"

def main():
    text = urllib.request.urlopen(PLAYLIST, timeout=30).read().decode("utf-8")
    streams = parse_m3u(text)
    logo_dir = os.path.join(ROOT, "static", "logos")
    os.makedirs(logo_dir, exist_ok=True)
    out = []
    for tvg, name, cat, desc, web in CHANNELS:
        matches = [s for s in streams if s["tvg_id"].split("@")[0] == tvg
                   and urlparse(s["url"]).hostname not in EXCLUDED_HOSTS]
        if not matches:
            print("no stream:", tvg)
            continue
        cid = re.sub(r"[^a-z0-9]+", "-", tvg.split(".")[0].lower()).strip("-")
        logo = ""
        src_logo = next((m["logo"] for m in matches if m["logo"]), "")
        if src_logo:
            ext = os.path.splitext(urlparse(src_logo).path)[1] or ".png"
            fn = f"{cid}{ext}"
            try:
                req = urllib.request.Request(src_logo, headers={"User-Agent": "Mozilla/5.0"})
                open(os.path.join(logo_dir, fn), "wb").write(urllib.request.urlopen(req, timeout=20).read())
                logo = f"logos/{fn}"
            except Exception as e:
                print("logo failed:", tvg, e)
        out.append({
            "id": cid, "name": name, "category": cat, "description": desc, "website": web, "logo": logo,
            "not247": any("Not 24/7" in m["name"] for m in matches),
            "sources": [{"url": m["url"], "label": m["name"], "referrer": m["referrer"], "ua": m["ua"]} for m in matches],
        })
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    json.dump({"categories": CATEGORIES, "channels": out},
              open(os.path.join(ROOT, "data", "channels.json"), "w"), ensure_ascii=False, indent=1)
    print(len(out), "channels written")

if __name__ == "__main__":
    main()
