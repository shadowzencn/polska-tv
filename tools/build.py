"""Build data/channels.json from the iptv-org Polish playlist and curated metadata; caches logos locally."""
import json, os, re, sys, urllib.request
try:
    from PIL import Image
except ImportError:
    Image = None
from urllib.parse import urlparse
sys.path.insert(0, os.path.dirname(__file__))
from check import parse_m3u
from curated import CHANNELS, CATEGORIES, EXCLUDED_HOSTS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYLIST = "https://iptv-org.github.io/iptv/countries/pl.m3u"

def is_light_logo(path):
    """True for mostly-white logos on a transparent background (need a dark backdrop)."""
    if Image is None:
        return False
    try:
        im = Image.open(path).convert("RGBA")
    except Exception:
        return False
    im.thumbnail((100, 100))
    px = [p for p in im.getdata() if p[3] > 128]
    if not px:
        return False
    lum = sum(0.299 * r + 0.587 * g + 0.114 * b for r, g, b, _ in px) / len(px)
    return lum > 200 and 1 - len(px) / (im.width * im.height) > 0.3


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
            "logo_light": bool(logo) and is_light_logo(os.path.join(ROOT, "static", logo)),
            "not247": any("Not 24/7" in m["name"] for m in matches),
            "sources": [{"url": m["url"], "label": m["name"], "referrer": m["referrer"], "ua": m["ua"]} for m in matches],
        })
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    json.dump({"categories": CATEGORIES, "channels": out},
              open(os.path.join(ROOT, "data", "channels.json"), "w"), ensure_ascii=False, indent=1)
    print(len(out), "channels written")

if __name__ == "__main__":
    main()
