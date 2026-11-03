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
  const proxyUrl = u => `/proxy?u=${encodeURIComponent(u)}`;
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
    const d = await (await fetch("/api/channels", { cache: "no-store" })).json();
    const curId = state.current && state.current.id;
    state.channels = d.channels; state.categories = d.categories; state.checkedAt = d.checked_at;
    if (curId) state.current = state.channels.find(c => c.id === curId) || null;
    renderList();
    if (state.current) renderInfo(false);
    $("#footer-check").textContent = d.checked_at
      ? `服务器上次完整检测：${fBjD.format(new Date(d.checked_at))} ${fBjT.format(new Date(d.checked_at))}（北京时间）`
      : "服务器正在进行首次检测，请稍候…";
    if (!d.checked_at) setTimeout(load, 5000);
  }
  setInterval(load, 5 * 60 * 1000);

  /* ---------- local latency ---------- */
  async function measure(src) {
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

  /* ---------- player ---------- */
  const video = $("#video");
  let startT = 0;
  const msg = t => { const m = $("#player-msg"); m.hidden = !t; m.textContent = t || ""; };
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
  function startSource(forceProxy = false) {
    const ch = state.current; if (!ch) return;
    const src = ch.sources[+$("#source-select").value];
    const mode = $("#mode-select").value;
    const useProxy = forceProxy || mode === "proxy" || (mode !== "direct" && mustProxy(src));
    const url = useProxy ? proxyUrl(src.url) : src.url;
    $("#st-mode").textContent = useProxy ? "服务器中转" : "直连源站";
    ["#st-res", "#st-live", "#st-buf", "#st-start", "#st-bw"].forEach(s => $(s).textContent = "-");
    msg("正在连接…");
    if (state.hls) { state.hls.destroy(); state.hls = null; }
    startT = performance.now();
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingTimeOut: 12000, fragLoadingTimeOut: 20000 });
      state.hls = hls;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !useProxy && mode === "auto" && !state.triedProxy) {
          state.triedProxy = true; msg("直连失败，改用服务器中转…"); startSource(true); return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        msg("播放失败：" + (data.details || "网络错误") + "。可尝试切换直播源或播放方式。");
      });
      hls.loadSource(url); hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else { msg("当前浏览器不支持 HLS 播放"); return; }
    video.play().catch(() => msg("点击播放按钮开始观看"));
  }
  video.addEventListener("playing", () => {
    msg("");
    if (startT) { $("#st-start").textContent = fmtMs(performance.now() - startT); startT = 0; }
  });
  video.addEventListener("waiting", () => { if (!startT) msg("缓冲中…"); });
  setInterval(() => {
    if (!state.current || video.paused) return;
    const b = video.buffered;
    if (b.length) $("#st-buf").textContent = (b.end(b.length - 1) - video.currentTime).toFixed(1) + " s";
    if (video.videoHeight) $("#st-res").textContent = `${video.videoWidth}×${video.videoHeight}`;
    const h = state.hls;
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
      const r = await fetch(`/api/channels/${ch.id}/check`, { method: "POST" });
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
    if (!["ArrowDown", "ArrowUp"].includes(e.key) || !state.current) return;
    if (e.target.matches("input, select, textarea")) return;
    const rows = [...document.querySelectorAll(".group:not(.collapsed) .row")];
    const ids = rows.map(r => r.dataset.id).filter((id, i, a) => a.indexOf(id) === i);
    const i = ids.indexOf(state.current.id);
    const next = ids[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) { e.preventDefault(); play(state.channels.find(c => c.id === next)); }
  });

  load().then(() => {
    const id = location.hash.slice(1);
    const ch = id && state.channels.find(c => c.id === id);
    if (ch) play(ch);
  });
})();
