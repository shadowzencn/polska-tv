(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const state = {
    channels: [], categories: [], checkedAt: null,
    cat: "全部", query: "", onlyOk: false, sort: "default",
    local: {},            // "id:idx" -> {ms, ok, via}
    favs: new Set(JSON.parse(localStorage.getItem("ptv-favs") || "[]")),
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
    const dst = plOff === 120;
    $("#tz-pl").textContent = dst ? "CEST 夏令时 UTC+2" : "CET 冬令时 UTC+1";
    const diff = (480 - plOff) / 60;
    $("#clock-diff").textContent = `华沙比北京晚 ${diff} 小时`;
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
  const best = ch => {   // best source: prefer local result, then server
    let bi = 0, bv = Infinity;
    ch.sources.forEach((s, i) => {
      const l = state.local[keyOf(ch, i)];
      const v = l ? (l.ok ? l.ms : Infinity) : (s.status && s.status.ok ? 1e5 + s.status.latency_ms : 1e9);
      if (v < bv) { bv = v; bi = i; }
    });
    return bi;
  };
  const serverOk = ch => ch.sources.some(s => s.status && s.status.ok);
  const serverMs = ch => Math.min(...ch.sources.map(s => s.status && s.status.ok ? s.status.latency_ms : Infinity));
  const localMs = ch => Math.min(...ch.sources.map((s, i) => { const l = state.local[keyOf(ch, i)]; return l && l.ok ? l.ms : Infinity; }));

  /* ---------- data ---------- */
  async function load() {
    const r = await fetch("/api/channels", { cache: "no-store" });
    const d = await r.json();
    state.channels = d.channels; state.categories = d.categories; state.checkedAt = d.checked_at;
    renderChips(); render();
    $("#footer-check").textContent = d.checked_at
      ? `服务器上次完整检测：${fBjD.format(new Date(d.checked_at))} ${fBjT.format(new Date(d.checked_at))}（北京时间）`
      : "服务器正在进行首次检测，请稍候…";
    if (!d.checked_at) setTimeout(load, 5000);
  }
  setInterval(load, 5 * 60 * 1000);

  /* ---------- local latency test ---------- */
  async function measure(src) {
    const via = mustProxy(src) ? "proxy" : "direct";
    const url = (via === "proxy" ? proxyUrl(src.url) : src.url) + (via === "proxy" ? "&" : (src.url.includes("?") ? "&" : "?")) + "_t=" + Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const t0 = performance.now();
    try {
      const resp = await fetch(url, { mode: via === "proxy" ? "same-origin" : "no-cors", cache: "no-store", signal: ctrl.signal });
      const ms = performance.now() - t0;
      const ok = resp.type === "opaque" || resp.ok;
      return { ok, ms, via };
    } catch (e) {
      return { ok: false, ms: null, via, err: e.name === "AbortError" ? "超时" : "失败" };
    } finally { clearTimeout(timer); }
  }
  async function testChannel(ch) {
    ch.sources.forEach((_, i) => state.local[keyOf(ch, i)] = { pending: true });
    updateCard(ch);
    await Promise.all(ch.sources.map(async (s, i) => { state.local[keyOf(ch, i)] = await measure(s); }));
    updateCard(ch);
  }
  async function testAll() {
    const btn = $("#test-all");
    btn.disabled = true;
    const list = visible();
    let done = 0;
    const queue = [...list];
    const worker = async () => { while (queue.length) { await testChannel(queue.shift()); btn.textContent = `测速中 ${++done}/${list.length}`; } };
    await Promise.all(Array.from({ length: 6 }, worker));
    btn.disabled = false; btn.textContent = "本机测速";
    if (state.sort === "local") render();
  }

  /* ---------- rendering ---------- */
  function renderChips() {
    const counts = { "全部": state.channels.length, "收藏": state.channels.filter(c => state.favs.has(c.id)).length };
    state.categories.forEach(c => counts[c] = state.channels.filter(ch => ch.category === c).length);
    const cats = ["全部", "收藏", ...state.categories.filter(c => counts[c])];
    const box = $("#chips"); box.innerHTML = "";
    cats.forEach(c => {
      const b = document.createElement("button");
      b.className = "chip" + (c === state.cat ? " active" : "");
      b.innerHTML = `${c}<span class="n">${counts[c]}</span>`;
      b.onclick = () => { state.cat = c; renderChips(); render(); };
      box.appendChild(b);
    });
  }
  function visible() {
    const q = state.query.trim().toLowerCase();
    let list = state.channels.filter(ch =>
      (state.cat === "全部" || (state.cat === "收藏" ? state.favs.has(ch.id) : ch.category === state.cat)) &&
      (!q || (ch.name + ch.description + ch.category).toLowerCase().includes(q)) &&
      (!state.onlyOk || serverOk(ch) || localMs(ch) < Infinity));
    const order = { name: (a, b) => a.name.localeCompare(b.name), server: (a, b) => serverMs(a) - serverMs(b), local: (a, b) => localMs(a) - localMs(b) };
    if (order[state.sort]) list = [...list].sort(order[state.sort]);
    return list;
  }
  function render() {
    const grid = $("#grid"); grid.innerHTML = "";
    const list = visible();
    const ok = state.channels.filter(serverOk).length;
    $("#summary").textContent = `共 ${state.channels.length} 个频道，服务器检测可用 ${state.checkedAt ? ok : "…"} 个 · 当前显示 ${list.length} 个 · 检测时间：${timeAgo(state.checkedAt)}`;
    if (!list.length) { grid.innerHTML = `<div class="empty">没有符合条件的频道</div>`; return; }
    list.forEach(ch => grid.appendChild(buildCard(ch)));
  }
  function buildCard(ch) {
    const el = $("#card-tpl").content.firstElementChild.cloneNode(true);
    el.dataset.id = ch.id;
    const img = $(".logo img", el);
    if (ch.logo) { img.src = ch.logo; img.alt = ch.name; img.onerror = () => logoFallback(el, ch); } else logoFallback(el, ch);
    $("h3", el).textContent = ch.name; $("h3", el).title = ch.name;
    $(".tag", el).textContent = ch.category;
    if (ch.not247) $(".title", el).insertAdjacentHTML("beforeend", `<span class="tag n247">非24小时</span>`);
    $(".desc", el).textContent = ch.description;
    const web = $(".web", el);
    if (ch.website) web.href = ch.website; else web.remove();
    const fav = $(".fav", el);
    fav.onclick = () => {
      state.favs.has(ch.id) ? state.favs.delete(ch.id) : state.favs.add(ch.id);
      localStorage.setItem("ptv-favs", JSON.stringify([...state.favs]));
      renderChips(); state.cat === "收藏" ? render() : updateCard(ch);
    };
    $(".play", el).onclick = () => play(ch);
    $(".retest", el).onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "检测中…";
      try {
        const r = await fetch(`/api/channels/${ch.id}/check`, { method: "POST" });
        if (r.ok) Object.assign(ch, await r.json());
      } catch (_) {}
      await testChannel(ch);
      b.disabled = false; b.textContent = "重新检测";
    };
    updateCard(ch, el);
    return el;
  }
  function logoFallback(el, ch) {
    const box = $(".logo", el); box.classList.add("fallback"); box.textContent = ch.name.slice(0, 2).toUpperCase();
  }
  function updateCard(ch, el = document.querySelector(`.card[data-id="${ch.id}"]`)) {
    if (!el) return;
    $(".fav", el).classList.toggle("on", state.favs.has(ch.id));
    $(".fav", el).textContent = state.favs.has(ch.id) ? "★" : "☆";
    el.classList.toggle("playing", state.current && state.current.id === ch.id);
    // server
    const sm = $(".metric.server", el), sv = $(".m-val", sm);
    sm.className = "metric server";
    const statuses = ch.sources.map(s => s.status).filter(Boolean);
    if (!statuses.length) { sm.classList.add("lv-wait"); sv.textContent = "检测中"; }
    else if (statuses.some(s => s.ok)) {
      const ms = serverMs(ch); sm.classList.add(level(ms)); sv.textContent = fmtMs(ms);
      sm.title = ch.sources.map((s, i) => `源${i + 1}: ${s.status ? (s.status.ok ? `可用 · 列表 ${s.status.latency_ms}ms · 分片 ${s.status.segment_ms}ms` : `不可用 (${s.status.error})`) : "未检测"}`).join("\n");
    } else { sm.classList.add("lv-bad"); sv.textContent = "不可用"; sm.title = statuses.map(s => s.error).join("\n"); }
    el.classList.toggle("down", statuses.length > 0 && !statuses.some(s => s.ok));
    // local
    const lm = $(".metric.local", el), lv = $(".m-val", lm);
    lm.className = "metric local";
    const locals = ch.sources.map((_, i) => state.local[keyOf(ch, i)]).filter(Boolean);
    if (!locals.length) lv.textContent = "未测";
    else if (locals.some(l => l.pending)) { lm.classList.add("lv-wait"); lv.textContent = "测速中"; }
    else if (locals.some(l => l.ok)) {
      const ms = localMs(ch); lm.classList.add(level(ms)); lv.textContent = fmtMs(ms);
      lm.title = locals.map((l, i) => `源${i + 1}: ${l.ok ? fmtMs(l.ms) : l.err || "失败"}${l.via === "proxy" ? "（经服务器中转）" : ""}`).join("\n");
    } else { lm.classList.add("lv-bad"); lv.textContent = locals[0].err || "失败"; }
  }

  /* ---------- player ---------- */
  const video = $("#video");
  let startT = 0, statTimer = null;
  function msg(t) { const m = $("#player-msg"); m.hidden = !t; m.textContent = t || ""; }
  function play(ch, srcIdx = best(ch)) {
    const prev = state.current; state.current = ch; state.triedProxy = false;
    if (prev) updateCard(prev);
    updateCard(ch);
    $("#player-wrap").hidden = false;
    $("#now-logo").src = ch.logo || ""; $("#now-name").textContent = ch.name;
    $("#now-cat").textContent = ch.category; $("#now-desc").textContent = ch.description;
    const web = $("#now-web"); web.hidden = !ch.website; web.href = ch.website || "#";
    const sel = $("#source-select"); sel.innerHTML = "";
    ch.sources.forEach((s, i) => {
      const st = s.status, l = state.local[keyOf(ch, i)];
      const info = l && l.ok ? `本机 ${fmtMs(l.ms)}` : st ? (st.ok ? `服务器 ${st.latency_ms}ms` : "不可用") : "未检测";
      sel.add(new Option(`源 ${i + 1} · ${new URL(s.url).hostname} · ${info}`, i));
    });
    sel.value = srcIdx;
    startSource();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "#" + ch.id);
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
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => { const l = hls.levels[d.level]; if (l && l.height) $("#st-res").textContent = `${l.width}×${l.height}`; });
      hls.loadSource(url); hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else { msg("当前浏览器不支持 HLS 播放"); return; }
    video.play().catch(() => {});
  }
  video.addEventListener("playing", () => {
    msg("");
    if (startT) { $("#st-start").textContent = fmtMs(performance.now() - startT); startT = 0; }
    if (video.videoHeight) $("#st-res").textContent = `${video.videoWidth}×${video.videoHeight}`;
  });
  video.addEventListener("waiting", () => { if (!startT) msg("缓冲中…"); });
  clearInterval(statTimer);
  statTimer = setInterval(() => {
    if (!state.current || video.paused) return;
    const b = video.buffered;
    if (b.length) $("#st-buf").textContent = (b.end(b.length - 1) - video.currentTime).toFixed(1) + " s";
    const h = state.hls;
    if (h) {
      if (h.latency) $("#st-live").textContent = h.latency.toFixed(1) + " s";
      if (h.bandwidthEstimate) $("#st-bw").textContent = (h.bandwidthEstimate / 1e6).toFixed(2) + " Mbps";
    }
    if (video.videoHeight) $("#st-res").textContent = `${video.videoWidth}×${video.videoHeight}`;
  }, 1000);
  $("#source-select").onchange = () => { state.triedProxy = false; startSource(); };
  $("#mode-select").onchange = () => { state.triedProxy = false; startSource(); };
  $("#close-player").onclick = () => {
    if (state.hls) { state.hls.destroy(); state.hls = null; }
    video.pause(); video.removeAttribute("src"); video.load();
    const prev = state.current; state.current = null; if (prev) updateCard(prev);
    $("#player-wrap").hidden = true; history.replaceState(null, "", location.pathname);
  };

  /* ---------- controls ---------- */
  $("#search").addEventListener("input", e => { state.query = e.target.value; render(); });
  $("#only-ok").addEventListener("change", e => { state.onlyOk = e.target.checked; render(); });
  $("#sort").addEventListener("change", e => { state.sort = e.target.value; render(); });
  $("#test-all").addEventListener("click", testAll);

  load().then(() => {
    const id = location.hash.slice(1);
    const ch = id && state.channels.find(c => c.id === id);
    if (ch) play(ch);
  });
})();
