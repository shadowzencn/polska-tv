(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const store = (k, v) => v === undefined ? JSON.parse(localStorage.getItem(k) || "null") : localStorage.setItem(k, JSON.stringify(v));
  const state = {
    channels: [], categories: [], checkedAt: null,
    query: "", sort: "default",
    local: {},                                   // "id:idx" -> {ms, ok, via, err, pending}
    favs: new Set(store("ptv-favs") || []),
    collapsed: new Set(store("ptv-collapsed") || []),
    current: null, hls: null, triedProxy: false,
  };
  const keyOf = (ch, i) => `${ch.id}:${i}`;
  const isHttps = location.protocol === "https:";

  /* ---------- clocks ---------- */
  const fmt = (tz, opts) => new Intl.DateTimeFormat("zh-CN", { timeZone: tz, hour12: false, ...opts });
  const timeFmt = tz => fmt(tz, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateFmt = tz => fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const fBjT = timeFmt("Asia/Shanghai"), fBjD = dateFmt("Asia/Shanghai");
  const fPlT = timeFmt("Europe/Warsaw"), fPlD = dateFmt("Europe/Warsaw");
  function tzOffsetMin(tz, d) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false,
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(d).map(x => [x.type, x.value]));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  }
  function tickClock() {
    const d = new Date();
    $("#clock-bj").textContent = fBjT.format(d);
    $("#date-bj").textContent = fBjD.format(d);
    $("#clock-pl").textContent = fPlT.format(d);
    $("#date-pl").textContent = fPlD.format(d);
    const plOff = tzOffsetMin("Europe/Warsaw", d);
    $("#clock-diff").textContent = `华沙${plOff === 120 ? "夏令时" : "冬令时"} · 比北京晚 ${(480 - plOff) / 60} 小时`;
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------- helpers ---------- */
  const proxyUrl = u => `proxy?u=${encodeURIComponent(u)}`;
  const level = ms => ms == null ? "" : ms < 300 ? "lv-good" : ms < 800 ? "lv-warn" : "lv-slow";
  const fmtMs = ms => ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : Math.round(ms) + " ms";
  const timeAgo = iso => {
    if (!iso) return "检测中…";
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    return s < 60 ? "刚刚" : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 3600)} 小时前`;
  };
  const mustProxy = src => src.needs_proxy || (isHttps && src.url.startsWith("http:"));
  const serverOk = ch => ch.sources.some(s => s.status && s.status.ok);
  const serverMs = ch => Math.min(...ch.sources.map(s => s.status && s.status.ok ? s.status.latency_ms : Infinity));
  const localMs = ch => Math.min(...ch.sources.map((s, i) => { const l = state.local[keyOf(ch, i)]; return l && l.ok ? l.ms : Infinity; }));
  const bestSource = ch => {
    let bi = 0, bv = Infinity;
    ch.sources.forEach((s, i) => {
      const l = state.local[keyOf(ch, i)];
      const v = l && l.ok ? l.ms : (s.status && s.status.ok ? 1e5 + s.status.latency_ms : 1e9);
      if (v < bv) { bv = v; bi = i; }
    });
    return bi;
  };
  function serverText(st) {
    if (!st) return { cls: "lv-wait", text: "检测中" };
    return st.ok ? { cls: level(st.latency_ms), text: fmtMs(st.latency_ms) } : { cls: "lv-bad", text: "不可用" };
  }
  function localText(l) {
    if (!l) return { cls: "", text: "未测" };
    if (l.pending) return { cls: "lv-wait", text: "测速中" };
    return l.ok ? { cls: level(l.ms), text: fmtMs(l.ms) } : { cls: "lv-bad", text: l.err || "失败" };
  }
  function chServer(ch) {
    const sts = ch.sources.map(s => s.status).filter(Boolean);
    if (!sts.length) return { cls: "lv-wait", text: "检测中" };
    return sts.some(s => s.ok) ? { cls: level(serverMs(ch)), text: fmtMs(serverMs(ch)) } : { cls: "lv-bad", text: "不可用" };
  }
  function chLocal(ch) {
    const ls = ch.sources.map((_, i) => state.local[keyOf(ch, i)]).filter(Boolean);
    if (!ls.length) return { cls: "", text: "未测" };
    if (ls.some(l => l.pending)) return { cls: "lv-wait", text: "测速中" };
    return ls.some(l => l.ok) ? { cls: level(localMs(ch)), text: fmtMs(localMs(ch)) } : { cls: "lv-bad", text: ls[0].err || "失败" };
  }
  function setLogo(box, img, ch) {
    box.classList.remove("fallback");
    box.classList.toggle("dark", !!ch.logo_light);
    if (!ch.logo) { box.classList.add("fallback"); box.textContent = ch.name.slice(0, 2).toUpperCase(); return; }
    img.onerror = () => { box.classList.add("fallback"); box.textContent = ch.name.slice(0, 2).toUpperCase(); };
    img.src = ch.logo; img.alt = ch.name;
  }

  /* ---------- data ---------- */
  async function load() {
    let d;
    try {
      const r = await fetch("api/channels", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      d = await r.json();
    } catch (_) {
      d = await (await fetch("api/channels.json", { cache: "no-store" })).json();
      d.static = true;
    }
    if (d.static && !state.static) enableStaticMode();
    const curId = state.current && state.current.id;
    state.channels = d.channels; state.categories = d.categories; state.checkedAt = d.checked_at;
    if (curId) state.current = state.channels.find(c => c.id === curId) || null;
    renderList();
    if (state.current) renderInfo(false);
    $("#footer-check").textContent = d.checked_at
      ? `${state.static ? "GitHub Actions" : "服务器"}上次完整检测：${fBjD.format(new Date(d.checked_at))} ${fBjT.format(new Date(d.checked_at))}（北京时间）`
      : "服务器正在进行首次检测，请稍候…";
    if (!d.checked_at) setTimeout(load, 5000);
  }
  setInterval(load, 5 * 60 * 1000);

  function enableStaticMode() {
    state.static = true;
    [...$("#mode-select").options].forEach(o => { if (o.value === "proxy") o.remove(); });
    $("#mode-select").options[0].textContent = "直连源站";
    $("#mode-select").options[0].value = "direct";
    if ($("#mode-select").options.length > 1) $("#mode-select").options[1].remove();
  }
  const unplayable = src => state.static && mustProxy(src);

  /* ---------- local latency ---------- */
  async function measure(src) {
    if (unplayable(src)) return { ok: false, ms: null, via: "proxy", err: "需中转" };
    const via = mustProxy(src) ? "proxy" : "direct";
    const base = via === "proxy" ? proxyUrl(src.url) : src.url;
    const url = base + (base.includes("?") ? "&" : "?") + "_t=" + Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const t0 = performance.now();
    try {
      const resp = await fetch(url, { mode: via === "proxy" ? "same-origin" : "no-cors", cache: "no-store", signal: ctrl.signal });
      return { ok: resp.type === "opaque" || resp.ok, ms: performance.now() - t0, via };
    } catch (e) {
      return { ok: false, ms: null, via, err: e.name === "AbortError" ? "超时" : "失败" };
    } finally { clearTimeout(timer); }
  }
  async function testChannel(ch) {
    ch.sources.forEach((_, i) => state.local[keyOf(ch, i)] = { pending: true });
    refresh(ch);
    await Promise.all(ch.sources.map(async (s, i) => { state.local[keyOf(ch, i)] = await measure(s); }));
    refresh(ch);
  }
  async function testAll() {
    const btn = $("#test-all");
    btn.disabled = true;
    const list = filtered();
    const queue = [...list];
    let done = 0;
    const worker = async () => { while (queue.length) { await testChannel(queue.shift()); btn.textContent = `${++done}/${list.length}`; } };
    await Promise.all(Array.from({ length: 6 }, worker));
    btn.disabled = false; btn.textContent = "本机测速";
    if (state.sort === "local") renderList();
  }
  function refresh(ch) {
    updateRow(ch);
    if (state.current && state.current.id === ch.id) renderInfo(false);
  }

  /* ---------- channel list ---------- */
  function filtered() {
    const q = state.query.trim().toLowerCase();
    let list = state.channels.filter(ch => !q || (ch.name + ch.description + ch.category).toLowerCase().includes(q));
    const order = { name: (a, b) => a.name.localeCompare(b.name), server: (a, b) => serverMs(a) - serverMs(b), local: (a, b) => localMs(a) - localMs(b) };
    if (order[state.sort]) list = [...list].sort(order[state.sort]);
    return list;
  }
  function renderList() {
    const box = $("#list"); box.innerHTML = "";
    const list = filtered();
    const ok = state.channels.filter(serverOk).length;
    $("#summary").textContent = `${state.channels.length} 个频道 · ${state.checkedAt ? ok : "…"} 个可用 · ${timeAgo(state.checkedAt)}检测`;
    if (!list.length) { box.innerHTML = `<div class="empty">没有符合条件的频道</div>`; return; }
    const groups = [];
    const favs = list.filter(c => state.favs.has(c.id));
    if (favs.length) groups.push(["★ 我的收藏", favs, "fav"]);
    if (state.sort !== "default") groups.push([$("#sort").selectedOptions[0].textContent, list, "sorted"]);
    else state.categories.forEach(cat => {
      const items = list.filter(c => c.category === cat);
      if (items.length) groups.push([cat, items, cat]);
    });
    const forceOpen = !!state.query.trim();
    groups.forEach(([title, items, key]) => {
      const g = document.createElement("section");
      g.className = "group" + (!forceOpen && state.collapsed.has(key) ? " collapsed" : "");
      const head = document.createElement("button");
      head.className = "group-head";
      head.innerHTML = `<span class="arrow">▼</span><span></span><span class="count">${items.length}</span>`;
      head.children[1].textContent = title;
      head.onclick = () => {
        g.classList.toggle("collapsed");
        g.classList.contains("collapsed") ? state.collapsed.add(key) : state.collapsed.delete(key);
        store("ptv-collapsed", [...state.collapsed]);
      };
      const rows = document.createElement("div");
      rows.className = "rows";
      items.forEach(ch => rows.appendChild(buildRow(ch)));
      g.append(head, rows);
      box.appendChild(g);
    });
  }
  function buildRow(ch) {
    const el = document.createElement("div");
    el.className = "row"; el.dataset.id = ch.id; el.tabIndex = 0; el.setAttribute("role", "button");
    el.innerHTML = `<div class="logo"><img loading="lazy" alt=""></div><div class="row-name"></div>
      <button class="icon-btn fav" title="收藏" aria-label="收藏">☆</button><span class="row-lat"></span>`;
    setLogo($(".logo", el), $("img", el), ch);
    $(".row-name", el).textContent = ch.name;
    $(".row-name", el).title = ch.name;
    el.onclick = e => { if (!e.target.closest(".fav")) play(ch); };
    el.onkeydown = e => { if (e.key === "Enter") play(ch); };
    $(".fav", el).onclick = () => toggleFav(ch);
    updateRow(ch, el);
    return el;
  }
  function updateRow(ch, els = document.querySelectorAll(`.row[data-id="${ch.id}"]`)) {
    (els instanceof Element ? [els] : [...els]).forEach(el => {
      const s = chServer(ch), l = chLocal(ch);
      const shown = l.text !== "未测" ? l : s;
      const lat = $(".row-lat", el);
      lat.className = "row-lat " + shown.cls; lat.textContent = shown.text.replace(" ms", "ms");
      el.title = `${ch.name}${ch.not247 ? "（非24小时）" : ""}\n服务器检测：${s.text}\n本机延迟：${l.text}`;
      el.classList.toggle("active", !!state.current && state.current.id === ch.id);
      el.classList.toggle("down", s.cls === "lv-bad");
      const f = $(".fav", el); f.classList.toggle("on", state.favs.has(ch.id)); f.textContent = state.favs.has(ch.id) ? "★" : "☆";
    });
  }
  function toggleFav(ch) {
    state.favs.has(ch.id) ? state.favs.delete(ch.id) : state.favs.add(ch.id);
    store("ptv-favs", [...state.favs]);
    renderList();
    if (state.current && state.current.id === ch.id) renderInfo(false);
  }

  /* ---------- info panel ---------- */
  function renderInfo(rebuildSelect) {
    const ch = state.current; if (!ch) return;
    $("#info").hidden = false;
    setLogo($("#info .logo"), $("#now-logo"), ch);
    $("#now-name").textContent = ch.name;
    $("#now-cat").textContent = ch.category;
    $("#now-247").hidden = !ch.not247;
    $("#now-desc").textContent = ch.description;
    const web = $("#now-web"); web.hidden = !ch.website; web.href = ch.website || "#";
    const fav = $("#now-fav"); fav.classList.toggle("on", state.favs.has(ch.id)); fav.textContent = state.favs.has(ch.id) ? "★" : "☆";
    updateStatus();
    const sel = $("#source-select");
    const cur = +sel.value || 0;
    if (rebuildSelect) {
      sel.innerHTML = "";
      ch.sources.forEach((s, i) => sel.add(new Option(`源 ${i + 1} · ${new URL(s.url).hostname}`, i)));
    }
    const tb = $("#src-rows"); tb.innerHTML = "";
    ch.sources.forEach((s, i) => {
      const sv = serverText(s.status), lv = localText(state.local[keyOf(ch, i)]);
      const tr = document.createElement("tr");
      if (i === (rebuildSelect ? cur : +sel.value)) tr.className = "cur";
      const seg = s.status && s.status.ok ? ` <span class="muted">· 分片 ${fmtMs(s.status.segment_ms)}</span>` : "";
      const err = s.status && !s.status.ok ? ` <span class="muted">(${s.status.error})</span>` : "";
      const via = state.local[keyOf(ch, i)] && state.local[keyOf(ch, i)].via === "proxy" ? ` <span class="muted">· 中转</span>` : "";
      tr.innerHTML = `<td>源 ${i + 1}</td><td class="${sv.cls}"><i class="dot"></i> ${sv.text}${seg}${err}</td><td class="${lv.cls}"><i class="dot"></i> ${lv.text}${via}</td>`;
      tr.title = s.url;
      tb.appendChild(tr);
    });
  }

  function updateStatus() {
    const ch = state.current; if (!ch) return;
    const l = chLocal(ch), s = chServer(ch);
    const lat = l.text !== "未测" ? `本机 ${l.text}` : `服务器 ${s.text}`;
    const parts = [$("#st-mode").textContent, $("#st-res").textContent, lat].filter(x => x && x !== "-");
    $("#now-status").textContent = parts.join(" · ");
  }

  /* ---------- player (ArtPlayer + hls.js) ---------- */
  let art = null, startT = 0, connectNotice = null;
  const notice = t => { if (art) art.notice.show = t; };
  const navIds = () => [...document.querySelectorAll(".group:not(.collapsed) .row")]
    .map(r => r.dataset.id).filter((id, i, a) => a.indexOf(id) === i);
  function step(dir) {
    if (!state.current) return;
    const ids = navIds(), next = ids[ids.indexOf(state.current.id) + dir];
    if (next) play(state.channels.find(c => c.id === next));
    else notice(dir > 0 ? "已经是最后一个频道" : "已经是第一个频道");
  }
  function play(ch) {
    const prev = state.current;
    state.current = ch; state.triedProxy = false;
    if (prev) updateRow(prev);
    updateRow(ch);
    renderInfo(true);
    $("#source-select").value = bestSource(ch);
    renderInfo(false);
    $("#placeholder").hidden = true;
    startSource();
    history.replaceState(null, "", "#" + ch.id);
    const row = document.querySelector(`.row[data-id="${ch.id}"]`);
    if (row && window.matchMedia("(min-width: 801px)").matches) row.scrollIntoView({ block: "nearest" });
    if (window.matchMedia("(max-width: 800px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    if (!Object.keys(state.local).some(k => k.startsWith(ch.id + ":"))) testChannel(ch);
  }
  function playM3u8(video, url, player) {
    if (player.hls) player.hls.destroy();
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingTimeOut: 12000, fragLoadingTimeOut: 20000 });
      player.hls = hls; state.hls = hls;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        onFatal(data.details || "网络错误", data.type === Hls.ErrorTypes.NETWORK_ERROR);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels.map((l, i) => ({ h: l.height, b: l.bitrate, i })).filter(l => l.h)
          .sort((x, y) => y.h - x.h || y.b - x.b).filter((l, k, arr) => k === 0 || arr[k - 1].h !== l.h);
        if (levels.length < 2) return;
        player.setting.add({
          name: "quality", html: "画质", tooltip: "自动", width: 160,
          selector: [{ html: "自动", value: -1, default: true }, ...levels.map(l => ({ html: `${l.h}p`, value: l.i }))],
          onSelect(item) { hls.currentLevel = item.value; return item.html; },
        });
      });
      hls.loadSource(url); hls.attachMedia(video);
      player.on("destroy", () => hls.destroy());
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else {
      player.notice.show = "当前浏览器不支持 HLS 播放";
    }
  }
  function onFatal(detail, network) {
    const mode = $("#mode-select").value;
    if (network && mode === "auto" && !state.static && !state.usingProxy && !state.triedProxy) {
      state.triedProxy = true; notice("直连失败，正在改用服务器中转…"); startSource(true); return;
    }
    const text = `播放失败（${detail}），可在设置中切换直播源或播放方式`;
    notice(text);
    $("#now-status").textContent = text;
  }
  function artSettings(ch) {
    const cur = +$("#source-select").value, mode = $("#mode-select").value;
    return [
      {
        html: "直播源", width: 260, tooltip: `源 ${cur + 1}`,
        selector: ch.sources.map((s, i) => ({ html: `源 ${i + 1} · ${new URL(s.url).hostname}`, value: i, default: i === cur })),
        onSelect(item) { $("#source-select").value = item.value; state.triedProxy = false; renderInfo(false); startSource(); return `源 ${item.value + 1}`; },
      },
      {
        html: "播放方式", width: 220, tooltip: $("#mode-select").selectedOptions[0].textContent.slice(0, 2),
        selector: [...$("#mode-select").options].map(o => ({ html: o.textContent, value: o.value, default: o.value === mode })),
        onSelect(item) { $("#mode-select").value = item.value; state.triedProxy = false; startSource(); return item.html.slice(0, 2); },
      },
    ];
  }
  function startSource(forceProxy = false) {
    const ch = state.current; if (!ch) return;
    const src = ch.sources[+$("#source-select").value];
    const mode = $("#mode-select").value;
    const useProxy = forceProxy || mode === "proxy" || (mode !== "direct" && mustProxy(src));
    state.usingProxy = useProxy;
    if (unplayable(src)) {
      if (art) { art.destroy(true); art = null; }
      const text = "此直播源为 HTTP 或需要特殊请求头，GitHub Pages 静态版无法播放（需要服务器中转）";
      $("#placeholder").hidden = false;
      $("#placeholder").querySelector("p").textContent = text;
      $("#now-status").textContent = text;
      return;
    }
    $("#placeholder").hidden = true;
    $("#placeholder").querySelector("p").textContent = "从右侧列表选择频道开始观看";
    const url = useProxy ? proxyUrl(src.url) : src.url;
    $("#st-mode").textContent = useProxy ? "服务器中转" : "直连源站";
    ["#st-res", "#st-live", "#st-buf", "#st-start", "#st-bw"].forEach(s => $(s).textContent = "-");
    if (art) { art.destroy(true); art = null; }
    startT = performance.now();
    art = new Artplayer({
      container: "#art",
      url, type: "m3u8", customType: { m3u8: playM3u8 },
      isLive: true, autoplay: true, volume: 0.7, lang: "zh-cn", theme: "#dc143c",
      setting: true, settings: artSettings(ch), pip: true, airplay: true, aspectRatio: true,
      fullscreen: true, fullscreenWeb: true, hotkey: true, mutex: true, autoOrientation: true,
      lock: true, fastForward: false, playsInline: true, miniProgressBar: false,
      moreVideoAttr: { playsInline: true, "webkit-playsinline": true },
      controls: [
        { name: "prev-channel", position: "left", index: 5, tooltip: "上一个频道", html: '<svg class="art-ch-btn" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>', click: () => step(-1) },
        { name: "next-channel", position: "left", index: 15, tooltip: "下一个频道", html: '<svg class="art-ch-btn" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>', click: () => step(1) },
        { name: "live-badge", position: "left", index: 30, html: '<span class="art-live">● 直播</span>' },
        { name: "channel-name", position: "left", index: 40, html: `<span class="art-ch-name"></span>` },
      ],
    });
    const nameEl = art.template.$player.querySelector(".art-ch-name");
    if (nameEl) nameEl.textContent = ch.name;
    art.on("ready", () => { art.play().catch(() => {}); });
    art.on("video:playing", () => {
      if (startT) { $("#st-start").textContent = fmtMs(performance.now() - startT); startT = 0; }
    });
    art.on("video:error", () => { if (!window.Hls || !Hls.isSupported()) onFatal("媒体错误", true); });
  }
  setInterval(() => {
    if (!state.current || !art || art.video.paused) return;
    const video = art.video, b = video.buffered;
    if (b.length) $("#st-buf").textContent = (b.end(b.length - 1) - video.currentTime).toFixed(1) + " s";
    if (video.videoHeight) $("#st-res").textContent = `${video.videoWidth}×${video.videoHeight}`;
    const h = art.hls;
    if (h && h.latency) $("#st-live").textContent = h.latency.toFixed(1) + " s";
    if (h && h.bandwidthEstimate) $("#st-bw").textContent = (h.bandwidthEstimate / 1e6).toFixed(2) + " Mbps";
    updateStatus();
  }, 1000);
  $("#source-select").onchange = () => { state.triedProxy = false; renderInfo(false); startSource(); };
  $("#mode-select").onchange = () => { state.triedProxy = false; startSource(); };
  $("#now-fav").onclick = () => state.current && toggleFav(state.current);
  $("#now-retest").onclick = async e => {
    const ch = state.current; if (!ch) return;
    const b = e.currentTarget; b.disabled = true; b.textContent = "检测中…";
    try {
      const r = state.static ? { ok: false } : await fetch(`api/channels/${ch.id}/check`, { method: "POST" });
      if (r.ok) { const fresh = await r.json(); ch.sources.forEach((s, i) => s.status = fresh.sources[i].status); }
    } catch (_) {}
    await testChannel(ch);
    b.disabled = false; b.textContent = "重新检测";
  };

  /* ---------- controls ---------- */
  $("#search").addEventListener("input", e => { state.query = e.target.value; renderList(); });
  $("#sort").addEventListener("change", e => { state.sort = e.target.value; renderList(); });
  $("#test-all").addEventListener("click", testAll);
  document.addEventListener("keydown", e => {
    if (!state.current || e.target.matches("input, select, textarea")) return;
    if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); step(e.key === "PageDown" ? 1 : -1); return; }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !(art && art.isFocus)) {
      e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1);
    }
  });

  load().then(() => {
    const id = location.hash.slice(1);
    const ch = id && state.channels.find(c => c.id === id);
    if (ch) play(ch);
  });
})();
