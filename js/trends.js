// Price trends: USD per tube over time, one line per dealer, with a stock strip; built from data/history.jsonl.
// Follows the dataviz rules: fixed categorical order (first 8 dealers by listing count, rest fold into Other),
// 2px lines, >=8px markers with a surface ring, hairline grid, crosshair + tooltip listing every series, legend + direct labels.
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]; // validated dark palette
const OTHER = "#7d7366";
const UNIT_N = { single: 1, pair: 2, quad: 4 };
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };
const fmtUsd = (v) => "$" + Math.round(v).toLocaleString("en-US");
const dayMs = 86400000;

export function initTrends(data, els, store) {
  const rates = data.rates?.usd_per_unit || { USD: 1 };
  const rows = (data.history || []).map((r) => ({ ...r, key: r.tube_id || ("x:" + `${r.brand} ${r.model}`.toLowerCase()), t: Date.parse(r.date) }))
    .filter((r) => Number.isFinite(r.t));
  // fixed dealer order: by listing count in the current data, so colour follows the dealer everywhere
  const dealerCount = {}; (data.listings || []).forEach((l) => { dealerCount[l.dealer] = (dealerCount[l.dealer] || 0) + 1; });
  const dealerOrder = Object.keys(dealerCount).sort((a, b) => dealerCount[b] - dealerCount[a] || a.localeCompare(b));
  const colorOf = (d) => { const i = dealerOrder.indexOf(d); return i >= 0 && i < SERIES.length ? SERIES[i] : OTHER; };
  // tube picker: every key seen in the series, labelled from the pool when matched
  const keys = new Map();
  rows.forEach((r) => { if (!keys.has(r.key)) keys.set(r.key, { key: r.key, family: r.family, label: data.byId[r.tube_id] ? `${data.byId[r.tube_id].brand} ${data.byId[r.tube_id].model}` : `${r.brand} ${r.model}`.slice(0, 60), n: 0 }); keys.get(r.key).n++; });
  const fams = ["2A3", "274B", "5U4G", "6C45"];
  els.tube.innerHTML = fams.map((f) => `<optgroup label="${f}">${[...keys.values()].filter((k) => k.family === f).sort((a, b) => b.n - a.n).map((k) => `<option value="${k.key}">${k.label}</option>`).join("")}</optgroup>`).join("");
  const state = { key: null, perTube: true, range: "all", hidden: new Set() };
  const pick = (id) => { if (keys.has(id)) { state.key = id; els.tube.value = id; } };
  pick(store.get().power); if (!state.key) state.key = els.tube.value;
  els.tube.addEventListener("change", () => { state.key = els.tube.value; draw(); });
  els.norm.addEventListener("change", () => { state.perTube = els.norm.checked; draw(); });
  els.range.addEventListener("click", (e) => { const b = e.target.closest("[data-range]"); if (!b) return; state.range = b.dataset.range; [...els.range.querySelectorAll("[data-range]")].forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
  store.subscribe((st) => { if (keys.has(st.power) && st.power !== state.key) { pick(st.power); draw(); } });

  const listingById = new Map((data.listings || []).map((l) => [l.id, l]));
  const tint = (hex, k) => { // the dealer's hue, stepped lighter for its 2nd, 3rd... listing of the same tube
    if (!k) return hex; const m = Math.min(0.66, 0.22 * k); const c = hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
    return "#" + c.map((v, i) => Math.round(v + ([239, 231, 220][i] - v) * m).toString(16).padStart(2, "0")).join("");
  };
  function series() {
    const now = Date.now(); const minT = state.range === "all" ? -Infinity : now - (state.range === "1y" ? 365 : 90) * dayMs;
    const byListing = new Map(); // one line per listing: a dealer's single and pair (or NOS grades) must not fold into one series
    rows.filter((r) => r.key === state.key && r.t >= minT).forEach((r) => {
      const usd = r.price == null ? null : (r.usd_est ?? r.price * (rates[r.currency] || 1)) / (state.perTube ? (UNIT_N[r.unit] || 1) : 1);
      const id = r.id || `${r.dealer}|${r.unit}|${r.model}`;
      if (!byListing.has(id)) byListing.set(id, { id, dealer: r.dealer, unit: r.unit, model: r.model, pts: [] });
      byListing.get(id).pts.push({ t: r.t, date: r.date, v: usd, stock: r.in_stock, stale: r.stale, source: r.source, unit: r.unit, price: r.price, currency: r.currency });
    });
    const out = [...byListing.values()].sort((a, b) => dealerOrder.indexOf(a.dealer) - dealerOrder.indexOf(b.dealer) || a.id.localeCompare(b.id));
    const perDealer = {}; out.forEach((x) => { perDealer[x.dealer] = (perDealer[x.dealer] || 0) + 1; });
    const seen = {};
    out.forEach((x) => {
      const k = seen[x.dealer] || 0; seen[x.dealer] = k + 1;
      x.color = tint(colorOf(x.dealer), k);
      const short = x.dealer.split(" ").slice(0, 2).join(" ");
      const model = (listingById.get(x.id)?.model || x.model || "").replace(/\s+/g, " ").trim();
      x.label = perDealer[x.dealer] > 1 ? `${short} · ${x.unit || "?"} · ${model.length > 28 ? model.slice(0, 27) + "…" : model}` : x.dealer;
      x.short = perDealer[x.dealer] > 1 ? `${short} (${x.unit || "?"})` : short;
      x.pts.sort((a, b) => a.t - b.t);
    });
    return out;
  }

  function draw() {
    const S = series(); const host = els.chart; host.innerHTML = ""; els.legend.innerHTML = ""; els.strip.innerHTML = "";
    const k = keys.get(state.key); els.title.textContent = k ? `${k.label} — ${state.perTube ? "USD per tube" : "listed price in USD"}` : "";
    const all = S.flatMap((s) => s.pts.filter((p) => p.v != null));
    if (!all.length) { host.innerHTML = '<p class="empty">No priced observations for this tube yet. The daily refresh adds one point per dealer per day.</p>'; return; }
    const W = Math.max(480, host.clientWidth || 800), H = 320, pad = { l: 56, r: 150, t: 16, b: 34 };
    const tMin = Math.min(...all.map((p) => p.t)), tMax = Math.max(...all.map((p) => p.t)); const span = Math.max(tMax - tMin, 14 * dayMs);
    const vMax = Math.max(...all.map((p) => p.v)) * 1.08, vMin = 0;
    const X = (t) => pad.l + ((t - (tMax - span)) / span) * (W - pad.l - pad.r), Y = (v) => H - pad.b - ((v - vMin) / (vMax - vMin)) * (H - pad.t - pad.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend-svg", role: "img", "aria-label": els.title.textContent }, host);
    // grid + axes (hairline, recessive)
    const ticks = 4; for (let i = 0; i <= ticks; i++) { const v = (vMax / ticks) * i; el("line", { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: "trend-grid" }, svg); const t = el("text", { x: pad.l - 8, y: Y(v) + 4, class: "trend-tick", "text-anchor": "end" }, svg); t.textContent = fmtUsd(v); }
    const xt = 5; for (let i = 0; i <= xt; i++) { const t = tMax - span + (span * i) / xt; const d = new Date(t); const lab = el("text", { x: X(t), y: H - pad.b + 18, class: "trend-tick", "text-anchor": "middle" }, svg); lab.textContent = span > 400 * dayMs ? d.toISOString().slice(0, 7) : d.toISOString().slice(5, 10); }
    // lines + markers
    const visible = S.filter((s) => !state.hidden.has(s.id));
    visible.forEach((s) => {
      const pts = s.pts.filter((p) => p.v != null);
      if (pts.length > 1) {
        for (let i = 1; i < pts.length; i++) el("line", { x1: X(pts[i - 1].t), y1: Y(pts[i - 1].v), x2: X(pts[i].t), y2: Y(pts[i].v), class: "trend-line" + (pts[i].source === "wayback" || pts[i - 1].source === "wayback" ? " archive" : ""), stroke: s.color }, svg);
      }
      pts.forEach((p) => { el("circle", { cx: X(p.t), cy: Y(p.v), r: 4, class: "trend-dot" + (p.stock === "in_stock" ? " in" : "") + (p.stale ? " stale" : ""), stroke: s.color, fill: p.stock === "in_stock" ? s.color : "var(--bg-2)" }, svg); });
      if (visible.length <= 4 && pts.length) { const last = pts[pts.length - 1]; const t = el("text", { x: X(last.t) + 10, y: Y(last.v) + 4, class: "trend-label" }, svg); t.textContent = `${s.short} ${fmtUsd(last.v)}`; }
    });
    // legend (line keys, click to hide)
    S.forEach((s) => { const b = document.createElement("button"); b.type = "button"; b.className = "trend-key" + (state.hidden.has(s.id) ? " off" : ""); b.setAttribute("aria-pressed", String(!state.hidden.has(s.id))); const i = document.createElement("i"); i.style.background = s.color; b.appendChild(i); b.appendChild(document.createTextNode(` ${s.label} (${s.pts.length})`)); b.addEventListener("click", () => { state.hidden.has(s.id) ? state.hidden.delete(s.id) : state.hidden.add(s.id); draw(); }); els.legend.appendChild(b); });
    // stock strip: one row per dealer, one cell per observation
    S.forEach((s) => { const row = document.createElement("div"); row.className = "strip-row"; const name = document.createElement("span"); name.className = "strip-name"; name.textContent = s.label; row.appendChild(name); const cells = document.createElement("div"); cells.className = "strip-cells"; s.pts.forEach((p) => { const c = document.createElement("i"); c.className = "strip-cell " + (p.stale ? "unverified" : (p.stock || "unknown")); c.title = `${p.date} · ${p.stale ? "unverified" : (p.stock || "unknown").replace("_", " ")}${p.v != null ? " · " + fmtUsd(p.v) : ""}${p.source === "wayback" ? " · archive capture" : ""}`; cells.appendChild(c); }); row.appendChild(cells); els.strip.appendChild(row); });
    // crosshair + tooltip: every series at the nearest date
    const dates = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b);
    const hair = el("line", { y1: pad.t, y2: H - pad.b, class: "trend-hair", style: "opacity:0" }, svg);
    const tip = els.tip; const move = (clientX) => {
      const r = svg.getBoundingClientRect(); const x = ((clientX - r.left) / r.width) * W; const t = tMax - span + ((x - pad.l) / (W - pad.l - pad.r)) * span;
      let best = dates[0]; dates.forEach((d) => { if (Math.abs(d - t) < Math.abs(best - t)) best = d; });
      hair.setAttribute("x1", X(best)); hair.setAttribute("x2", X(best)); hair.style.opacity = 1;
      tip.innerHTML = ""; const h = document.createElement("div"); h.className = "tip-date"; h.textContent = new Date(best).toISOString().slice(0, 10); tip.appendChild(h);
      visible.forEach((s) => { const p = s.pts.filter((q) => q.v != null).reduce((acc, q) => (acc == null || Math.abs(q.t - best) < Math.abs(acc.t - best) ? q : acc), null); if (!p || Math.abs(p.t - best) > 45 * dayMs) return; const row = document.createElement("div"); row.className = "tip-row"; const key = document.createElement("i"); key.style.background = s.color; const val = document.createElement("b"); val.textContent = fmtUsd(p.v); const lab = document.createElement("span"); lab.textContent = ` ${s.label} · ${p.stale ? "unverified" : (p.stock || "").replace("_", " ")}${p.source === "wayback" ? " · archive" : ""}`; row.append(key, val, lab); tip.appendChild(row); });
      tip.hidden = false; const tx = Math.min(r.width - 260, Math.max(0, clientX - r.left + 14)); tip.style.transform = `translate(${tx}px, 0)`;
    };
    svg.addEventListener("pointermove", (e) => move(e.clientX)); svg.addEventListener("pointerleave", () => { hair.style.opacity = 0; tip.hidden = true; });
    svg.setAttribute("tabindex", "0"); svg.addEventListener("focus", () => move(svg.getBoundingClientRect().right - 160)); svg.addEventListener("blur", () => { hair.style.opacity = 0; tip.hidden = true; });
  }
  if ("ResizeObserver" in window) new ResizeObserver(() => draw()).observe(els.chart);
  draw();
  return { draw, pick: (id) => { pick(id); draw(); } };
}
