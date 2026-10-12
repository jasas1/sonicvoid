// Combination prediction: blend per-tube profiles, render tester-style meters and the 2A3 x rectifier matrix.
import { reducedMotion } from "./data.js";

const ROLE_OF = { "2A3": "power", "6C45": "driver", "5U4G": "rectifier", "274B": "rectifier" };

export function predict(sel, data) {
  const P = data.profiles; const axes = P.axes.map((a) => a.id);
  const out = {}; let n = 0; let seeded = false; const parts = [];
  for (const role of ["power", "rectifier", "driver"]) {
    const tube = data.byId[sel[role]]; const prof = P.tubes[sel[role]];
    const w = P.weights[role];
    parts.push({ role, tube, prof });
    if (prof) { n += prof.n_sources || 0; if ((prof.basis || "seed") === "seed") seeded = true; }
    axes.forEach((a) => { out[a] = (out[a] || 0) + w * (prof ? prof[a] : 50); });
  }
  axes.forEach((a) => { out[a] = Math.round(out[a]); });
  return { axes: out, n_sources: n, seeded, parts, sentence: sentence(out, parts, data) };
}

function band(v, lo, hi, [l, m, h]) { return v >= hi ? h : v <= lo ? l : m; }
function sentence(a, parts, data) {
  const warmth = band(a.warmth, 44, 62, ["a lean, clean balance", "an even balance", "a warm, lush balance"]);
  const bass = band(a.bass, 48, 66, ["light bass", "moderate bass weight", "weighty bass"]);
  const air = band(a.air, 48, 70, ["a rolled-off top", "a natural top end", "extended, airy treble"]);
  const speed = band(a.speed, 50, 72, ["a soft, relaxed attack", "clean, unhurried attacks", "fast transients"]);
  const detail = band(a.detail ?? 55, 48, 74, ["a softly focused picture", "honest resolution", "a highly resolving picture"]);
  const dyn = band(a.dynamics ?? 55, 50, 74, ["polite dynamics", "solid dynamics", "real slam"]);
  const stage = band(a.stage, 52, 74, ["an intimate stage", "a well-proportioned stage", "a wide, holographic stage"]);
  const black = band(a.black, 52, 80, ["a noise floor to listen for", "a quiet background", "a black background"]);
  let s = `Expect ${warmth} with ${bass}, ${air}, and ${speed}; ${detail}, ${dyn}, ${stage} and ${black}.`;
  const notes = [];
  const phys = data.profiles.physics || {};
  const power = parts.find((p) => p.role === "power").tube; const rect = parts.find((p) => p.role === "rectifier").tube;
  if (power && /mesh/i.test(power.construction) && phys["mesh plate"]) notes.push(`${power.brand} ${power.model}: ${phys["mesh plate"].note}`);
  if (power && /thoriated/i.test(power.construction) && phys["thoriated tungsten filament"]) notes.push(`${power.brand} ${power.model}: ${phys["thoriated tungsten filament"].note}`);
  const kb = data.kb || {};
  const d5 = kb["5U4G"]?.datasheet?.voltage_drop_v, d2 = kb["274B"]?.datasheet?.voltage_drop_v;
  if (rect && d5 && d2) {
    const mine = rect.family === "274B" ? d2 : d5, other = rect.family === "274B" ? d5 : d2;
    const key = mine > other ? "high voltage drop" : "low voltage drop";
    if (phys[key]) notes.push(`${rect.brand} ${rect.model} (${rect.family}, ${mine} V drop vs ${other} V): ${phys[key].note}`);
  }
  if (notes.length) s += " " + notes.slice(0, 2).join(" ");
  return s;
}

// ---- meters ----
const SWEEP = 150, START = 195; // degrees, clockwise from +x
function polar(cx, cy, r, deg) { const t = (deg * Math.PI) / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }
export function renderMeters(container, data) {
  container.innerHTML = "";
  const meters = data.profiles.axes.map((axis) => {
    const el = document.createElement("div"); el.className = "meter";
    const cx = 50, cy = 52, r = 40;
    let ticks = "";
    for (let i = 0; i <= 10; i++) { const d = START + (SWEEP * i) / 10; const [x1, y1] = polar(cx, cy, r, d); const [x2, y2] = polar(cx, cy, r - (i % 5 === 0 ? 7 : 4), d); ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i % 5 === 0 ? "var(--ink-2)" : "var(--ink-3)"}" stroke-width="${i % 5 === 0 ? 1.2 : 0.8}"/>`; }
    const [ax, ay] = polar(cx, cy, r, START), [bx, by] = polar(cx, cy, r, START + SWEEP);
    el.innerHTML = `<svg viewBox="0 0 100 62" role="img" aria-label="${axis.label}">
      <path d="M${ax.toFixed(1)} ${ay.toFixed(1)} A${r} ${r} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="var(--hair-2)" stroke-width="1"/>
      ${ticks}
      <line class="needle" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 2}" stroke="var(--amber)" stroke-width="1.6" stroke-linecap="round" transform="rotate(-75 ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="2.6" fill="var(--steel)"/>
      <text x="${cx}" y="60" text-anchor="middle" font-size="7" fill="var(--amber-2)" font-family="var(--font-mono)" class="val">50</text>
      <text x="${(ax - 2).toFixed(1)}" y="${(ay + 9).toFixed(1)}" text-anchor="start" font-size="5.5" fill="var(--ink-3)" font-family="var(--font-mono)">${axis.low}</text>
      <text x="${(bx + 2).toFixed(1)}" y="${(by + 9).toFixed(1)}" text-anchor="end" font-size="5.5" fill="var(--ink-3)" font-family="var(--font-mono)">${axis.high}</text>
    </svg>
    <div class="meter-label"><b>${axis.label}</b></div>`;
    container.appendChild(el);
    return { axis: axis.id, needle: el.querySelector(".needle"), val: el.querySelector(".val"), cur: 50, target: 50, cx, cy };
  });
  let raf = 0; let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; let moving = false;
    meters.forEach((m) => {
      const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 7);
      m.cur += (m.target - m.cur) * k;
      if (Math.abs(m.target - m.cur) > 0.05) moving = true; else m.cur = m.target;
      const deg = -75 + (SWEEP * m.cur) / 100; // -75..+75 around straight up
      m.needle.setAttribute("transform", `rotate(${deg.toFixed(2)} ${m.cx} ${m.cy})`);
      m.val.textContent = Math.round(m.cur);
    });
    raf = moving ? requestAnimationFrame(tick) : 0; if (!moving) last = 0;
  }
  return {
    set(values) { meters.forEach((m) => { m.target = values[m.axis] ?? 50; }); if (!raf) raf = requestAnimationFrame(tick); },
  };
}

// ---- matrix ----
export function renderMatrix(grid, data, store, { onPick, readout }) {
  const rows = data.tubes.filter((t) => t.family === "2A3");
  const cols = data.tubes.filter((t) => t.family === "5U4G" || t.family === "274B");
  grid.style.gridTemplateColumns = `13rem repeat(${cols.length}, minmax(3.4rem, 1fr))`;
  const axes = data.profiles.axes.map((a) => a.id);
  const frag = document.createDocumentFragment();
  const corner = document.createElement("div"); corner.className = "corner"; corner.setAttribute("role", "columnheader"); frag.appendChild(corner);
  cols.forEach((c) => { const h = document.createElement("div"); h.className = "mh"; h.setAttribute("role", "columnheader"); h.textContent = `${c.brand} ${c.model}`; frag.appendChild(h); });
  const cells = [];
  rows.forEach((r) => {
    const rh = document.createElement("div"); rh.className = "mr"; rh.setAttribute("role", "rowheader"); rh.textContent = `${r.brand} ${r.model}`; frag.appendChild(rh);
    cols.forEach((c) => {
      const b = document.createElement("button"); b.className = "cell"; b.type = "button"; b.setAttribute("role", "gridcell");
      b.dataset.power = r.id; b.dataset.rect = c.id;
      b.setAttribute("aria-label", `${r.brand} ${r.model} with ${c.brand} ${c.model}`);
      b.innerHTML = `<span class="bars">${axes.map(() => "<i></i>").join("")}</span><span class="n"></span>`;
      b.addEventListener("click", () => onPick(r.id, c.id));
      const show = () => { if (!readout) return; const p = predict({ power: r.id, rectifier: c.id, driver: store.get().driver }, data); readout.textContent = `${r.brand} ${r.model} + ${c.brand} ${c.model} — ` + data.profiles.axes.map((ax) => `${ax.label.toLowerCase()} ${p.axes[ax.id]}`).join(" · ") + (p.n_sources ? ` · ${p.n_sources} claims` : " · seed"); };
      b.addEventListener("mouseenter", show); b.addEventListener("focus", show);
      frag.appendChild(b); cells.push(b);
    });
  });
  grid.appendChild(frag);
  function paint(st) {
    cells.forEach((b) => {
      const p = predict({ power: b.dataset.power, rectifier: b.dataset.rect, driver: st.driver }, data);
      const bars = b.querySelectorAll(".bars i");
      axes.forEach((a, i) => { bars[i].style.height = `${Math.max(8, p.axes[a])}%`; });
      const w = Math.min(1, Math.max(0, (p.axes.warmth - 32) / 46)); // 0 cool steel .. 1 warm ember
      const mix = (c1, c2) => Math.round(c1 + (c2 - c1) * w);
      b.style.setProperty("--c", `rgb(${mix(22, 64)} ${mix(30, 30)} ${mix(40, 10)})`);
      b.querySelector(".n").textContent = p.n_sources ? `n=${p.n_sources}` : "seed";
      b.setAttribute("aria-selected", b.dataset.power === st.power && b.dataset.rect === st.rectifier ? "true" : "false");
    });
  }
  store.subscribe(paint);
}


// ---- spider (radar) view ----
export function renderSpider(container, data) {
  const axes = data.profiles.axes; const n = axes.length;
  const cx = 150, cy = 112, R = 78;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const r = (R * v) / 100; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = (v) => axes.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(",")).join(" ");
  container.innerHTML = `<svg viewBox="0 0 300 224" role="img" aria-label="Expected character, six axes">
    ${[25, 50, 75, 100].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="${v === 100 ? "var(--hair-2)" : "var(--hair)"}" stroke-width="1"/>`).join("")}
    ${axes.map((_, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--hair)" stroke-width="1"/>`; }).join("")}
    <polygon class="area" points="${ring(50)}" fill="rgba(255,154,60,0.16)" stroke="var(--amber)" stroke-width="1.6" stroke-linejoin="round"/>
    ${axes.map((_, i) => `<circle class="v" data-i="${i}" r="2.6" fill="var(--amber-2)"/>`).join("")}
    ${axes.map((ax, i) => { const [x, y] = pt(i, 128); const anchor = Math.abs(x - cx) < 6 ? "middle" : x < cx ? "end" : "start"; return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="8" fill="var(--ink-3)" font-family="var(--font-mono)" letter-spacing="0.5">${ax.label.toUpperCase()}</text><text class="val" data-i="${i}" x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="${anchor}" font-size="8" fill="var(--amber-2)" font-family="var(--font-mono)">50</text>`; }).join("")}
  </svg>`;
  const area = container.querySelector(".area"); const dots = [...container.querySelectorAll(".v")]; const vals = [...container.querySelectorAll(".val")];
  const cur = axes.map(() => 50); let target = axes.map(() => 50); let raf = 0; let last = 0;
  function paint() { area.setAttribute("points", axes.map((_, i) => pt(i, cur[i]).map((c) => c.toFixed(1)).join(",")).join(" ")); dots.forEach((d, i) => { const [x, y] = pt(i, cur[i]); d.setAttribute("cx", x.toFixed(1)); d.setAttribute("cy", y.toFixed(1)); }); vals.forEach((v, i) => { v.textContent = Math.round(cur[i]); }); }
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; let moving = false;
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 7);
    cur.forEach((_, i) => { cur[i] += (target[i] - cur[i]) * k; if (Math.abs(target[i] - cur[i]) > 0.05) moving = true; else cur[i] = target[i]; });
    paint(); raf = moving ? requestAnimationFrame(tick) : 0; if (!moving) last = 0;
  }
  paint();
  return { set(values) { target = axes.map((ax) => values[ax.id] ?? 50); if (!raf) raf = requestAnimationFrame(tick); } };
}
