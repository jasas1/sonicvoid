// Bench: plate curves + load line (Koren 2A3 model), rectifier sag (three-halves law), output transformer, tube anatomy.
import { reducedMotion } from "./data.js";

const KOREN_2A3 = { mu: 4.2, ex: 1.4, kg1: 1500, kp: 60, kvb: 300 }; // widely published SPICE parameters for the 2A3
export function korenIp(Vp, Vg, k = KOREN_2A3) {
  if (Vp <= 0) return 0;
  const E1 = (Vp / k.kp) * Math.log(1 + Math.exp(k.kp * (1 / k.mu + Vg / Math.sqrt(k.kvb + Vp * Vp))));
  return E1 <= 0 ? 0 : (2 * Math.pow(E1, k.ex)) / k.kg1; // amps
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
/** Size the canvas backing store to its displayed width x devicePixelRatio and return a CSS-pixel context. */
function fit(canvas, aspect) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(280, Math.round(canvas.clientWidth || canvas.width));
  const H = Math.round(W * aspect);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = `${H}px`; }
  const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}
function onResize(canvas, draw) { if ("ResizeObserver" in window) new ResizeObserver(() => draw()).observe(canvas); else window.addEventListener("resize", draw); }
function frame(ctx, W, H, pad, xlab, ylab) {
  ctx.fillStyle = css("--bg-2") || "#0d0b09"; ctx.fillRect(0, 0, W, H);
  ctx.font = "14px 'Sometype Mono', monospace"; ctx.fillStyle = css("--ink-3"); ctx.textAlign = "center";
  ctx.fillText(xlab, pad.l + (W - pad.l - pad.r) / 2, H - 8);
  ctx.save(); ctx.translate(14, pad.t + (H - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylab, 0, 0); ctx.restore();
}

// ---------- plate curves ----------
export function initCurves(data, els) {
  const canvas = els.canvas; let ctx, W = 900, H = 560; const pad = { l: 56, r: 16, t: 16, b: 40 };
  const maxV = 450, maxI = 0.16; // 160 mA
  const X = (v) => pad.l + (v / maxV) * (W - pad.l - pad.r), Y = (i) => H - pad.b - (i / maxI) * (H - pad.t - pad.b);
  const state = { vp: 250, vg: -45, rl: 2500, w40: false };
  const curves = []; for (let vg = 0; vg >= -100; vg -= 10) { const pts = []; for (let v = 0; v <= maxV; v += 3) pts.push([v, korenIp(v, vg)]); curves.push({ vg, pts }); }
  function draw() {
    ({ ctx, W, H } = fit(canvas, 560 / 900));
    frame(ctx, W, H, pad, "PLATE VOLTS", "PLATE mA");
    ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1;
    for (let v = 0; v <= maxV; v += 50) { ctx.beginPath(); ctx.moveTo(X(v), Y(0)); ctx.lineTo(X(v), Y(maxI)); ctx.stroke(); }
    for (let i = 0; i <= maxI + 1e-9; i += 0.02) { ctx.beginPath(); ctx.moveTo(X(0), Y(i)); ctx.lineTo(X(maxV), Y(i)); ctx.stroke(); }
    ctx.fillStyle = css("--ink-3"); ctx.font = "13px 'Sometype Mono', monospace"; ctx.textAlign = "right";
    for (let i = 0; i <= maxI + 1e-9; i += 0.04) ctx.fillText(Math.round(i * 1000), pad.l - 6, Y(i) + 3);
    ctx.textAlign = "center"; for (let v = 0; v <= maxV; v += 100) ctx.fillText(v, X(v), H - pad.b + 14);
    // dissipation hyperbolas
    const hyper = (Pw, color, label) => { ctx.strokeStyle = color; ctx.setLineDash([4, 4]); ctx.beginPath(); let first = true; for (let v = 30; v <= maxV; v += 2) { const i = Pw / v; if (i > maxI) continue; first ? ctx.moveTo(X(v), Y(i)) : ctx.lineTo(X(v), Y(i)); first = false; } ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.textAlign = "left"; ctx.fillText(label, X(Pw / maxI) + 4, Y(maxI) + 12); };
    hyper(15, css("--ember"), "15 W");
    if (state.w40) hyper(40, css("--warn"), "40 W (2A3-40)");
    // curve family
    curves.forEach((c) => {
      ctx.strokeStyle = c.vg === 0 ? css("--ink") : css("--ink-2"); ctx.lineWidth = c.vg === 0 ? 1.4 : 1; ctx.beginPath(); let started = false;
      c.pts.forEach(([v, i]) => { if (i > maxI) return; started ? ctx.lineTo(X(v), Y(i)) : ctx.moveTo(X(v), Y(i)); started = true; });
      ctx.stroke();
      const lastVis = c.pts.filter(([, i]) => i <= maxI).pop(); if (lastVis && lastVis[1] > 0.002) { ctx.fillStyle = css("--ink-3"); ctx.textAlign = "left"; ctx.fillText(`${c.vg}`, X(lastVis[0]) - 18, Y(lastVis[1]) - 4); }
    });
    // operating point + load line
    const ip = korenIp(state.vp, state.vg); const vcut = state.vp + ip * state.rl;
    let vmin = state.vp; for (let v = state.vp; v >= 0; v -= 1) { const line = ip + (state.vp - v) / state.rl; if (korenIp(v, 0) <= line) { vmin = v; break; } }
    const imax = ip + (state.vp - vmin) / state.rl;
    ctx.strokeStyle = css("--amber"); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(Math.min(vcut, maxV)), Y(Math.max(0, ip - (Math.min(vcut, maxV) - state.vp) / state.rl))); ctx.lineTo(X(vmin), Y(Math.min(maxI, imax))); ctx.stroke();
    ctx.fillStyle = css("--amber-2"); ctx.beginPath(); ctx.arc(X(state.vp), Y(ip), 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = css("--amber"); ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(X(state.vp), Y(ip), 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = css("--amber-2"); ctx.textAlign = "left"; ctx.fillText(`Q  ${state.vp} V  ${Math.round(ip * 1000)} mA`, X(state.vp) + 8, Y(ip) - 8);
    // readout
    const diss = state.vp * ip; const swing = 2 * Math.min(state.vp - vmin, vcut - state.vp); const po = (swing * swing) / (8 * state.rl);
    const gm = (korenIp(state.vp, state.vg + 0.5) - korenIp(state.vp, state.vg - 0.5)) * 1000; const rp = 1 / ((korenIp(state.vp + 1, state.vg) - korenIp(state.vp - 1, state.vg)) / 2);
    els.readout.innerHTML = [
      ["Plate current", `${(ip * 1000).toFixed(1)} mA`], ["Dissipation", `${diss.toFixed(1)} W${diss > (state.w40 ? 40 : 15) ? " ▲ over limit" : ""}`],
      ["Clean swing", `${swing.toFixed(0)} V p-p`], ["Est. power / tube", `${po.toFixed(2)} W`], ["gm at Q", `${gm.toFixed(2)} mA/V`], ["rp at Q", `${Math.round(rp)} Ω`],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }
  const bind = (id, key, out, fmt = (v) => v) => { const r = els[id]; r.addEventListener("input", () => { state[key] = +r.value; els[out].value = fmt(r.value); draw(); }); };
  bind("vp", "vp", "ovp"); bind("vg", "vg", "ovg"); bind("rl", "rl", "orl");
  els.w40.addEventListener("change", () => { state.w40 = els.w40.checked; draw(); });
  onResize(canvas, draw);
  draw();
  return { setLoad(rl) { state.rl = Math.round(rl); els.rl.value = state.rl; els.orl.value = state.rl; draw(); } };
}

// ---------- rectifier sag ----------
const RECTS = [
  { id: "5u4g", label: "5U4G", drop: 44, at: 225, note: "RCA datasheet", color: "--ink-2" },
  { id: "5u4gb", label: "5U4GB", drop: 50, at: 275, note: "RCA datasheet", color: "--steel" },
  { id: "274b", label: "274B", drop: 60, at: 160, note: "≈ pending KB datasheet", color: "--amber", approx: true },
];
export function initRectifier(data, els) {
  const kb = data.kb || {};
  RECTS.forEach((r) => {
    const fam = r.id === "274b" ? "274B" : "5U4G"; const ds = kb[fam]?.datasheet;
    if (ds?.voltage_drop_v && ds?.max_dc_output_ma && (r.id !== "5u4gb")) { r.drop = ds.voltage_drop_v; r.at = ds.max_dc_output_ma; r.note = "datasheet (KB)"; r.approx = false; }
  });
  const canvas = els.canvas; let ctx, W = 900, H = 420; const pad = { l: 56, r: 16, t: 16, b: 40 };
  const state = { vpk: 420, il: 160, burst: 0 };
  const maxI = 300; const X = (i) => pad.l + (i / maxI) * (W - pad.l - pad.r);
  const vdc = (r, i) => state.vpk - r.drop * Math.pow(i / r.at, 2 / 3);
  function draw() {
    ({ ctx, W, H } = fit(canvas, 420 / 900));
    const vmin = state.vpk - 140, vmax = state.vpk + 10; const Y = (v) => H - pad.b - ((v - vmin) / (vmax - vmin)) * (H - pad.t - pad.b);
    frame(ctx, W, H, pad, "LOAD CURRENT mA", "B+ VOLTS (NO FILTER DROOP)");
    ctx.strokeStyle = css("--grid"); for (let i = 0; i <= maxI; i += 50) { ctx.beginPath(); ctx.moveTo(X(i), Y(vmin)); ctx.lineTo(X(i), Y(vmax)); ctx.stroke(); }
    for (let v = Math.ceil(vmin / 20) * 20; v <= vmax; v += 20) { ctx.beginPath(); ctx.moveTo(X(0), Y(v)); ctx.lineTo(X(maxI), Y(v)); ctx.stroke(); }
    ctx.fillStyle = css("--ink-3"); ctx.font = "13px 'Sometype Mono', monospace"; ctx.textAlign = "right";
    for (let v = Math.ceil(vmin / 20) * 20; v <= vmax; v += 20) ctx.fillText(v, pad.l - 6, Y(v) + 3);
    ctx.textAlign = "center"; for (let i = 0; i <= maxI; i += 50) ctx.fillText(i, X(i), H - pad.b + 14);
    const il = state.il + state.burst;
    RECTS.forEach((r) => {
      ctx.strokeStyle = css(r.color); ctx.lineWidth = r.id === "274b" ? 1.6 : 1.2; ctx.setLineDash(r.approx ? [6, 4] : []); ctx.beginPath();
      for (let i = 0; i <= maxI; i += 3) { const v = vdc(r, i); i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css(r.color); ctx.textAlign = "left"; ctx.fillText(`${r.label}${r.approx ? " ≈" : ""}`, X(maxI) - 60, Y(vdc(r, maxI)) - 6);
      ctx.beginPath(); ctx.arc(X(il), Y(vdc(r, il)), 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = css("--amber"); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(X(il), Y(vmin)); ctx.lineTo(X(il), Y(vmax)); ctx.stroke(); ctx.setLineDash([]);
    els.readout.innerHTML = RECTS.map((r) => `<dt>${r.label} B+ @ ${Math.round(il)} mA</dt><dd>${vdc(r, il).toFixed(0)} V (drop ${(state.vpk - vdc(r, il)).toFixed(0)} V)</dd>`).join("")
      + `<dt>Basis</dt><dd>${RECTS.map((r) => `${r.label}: ${r.drop} V @ ${r.at} mA, ${r.note}`).join("; ")}</dd>`;
  }
  els.vpk.addEventListener("input", () => { state.vpk = +els.vpk.value; els.ovpk.value = els.vpk.value; draw(); });
  els.il.addEventListener("input", () => { state.il = +els.il.value; els.oil.value = els.il.value; draw(); });
  els.burst.addEventListener("click", () => {
    if (reducedMotion()) { state.burst = 80; draw(); setTimeout(() => { state.burst = 0; draw(); }, 900); return; }
    const t0 = performance.now(); const dur = 1400;
    const step = (now) => { const t = (now - t0) / dur; state.burst = t >= 1 ? 0 : 80 * Math.exp(-t * 4) * Math.sin(Math.min(1, t * 6) * Math.PI / 2); draw(); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  onResize(canvas, draw);
  draw();
}

// ---------- output transformer ----------
export function initTransformer(data, els, curves) {
  const canvas = els.canvas; let ctx, W = 900, H = 420; const pad = { l: 56, r: 16, t: 16, b: 40 };
  const state = { zs: 300, rpp: 5000, lp: 20, ll: 10 };
  const DESIGN_ZS = 300; const RP_PP = 2 * 800; // two 2A3 plate resistances in series across the primary
  const fmin = 10, fmax = 100000; const X = (f) => pad.l + ((Math.log10(f) - 1) / 4) * (W - pad.l - pad.r); const Y = (db) => pad.t + ((6 - db) / 36) * (H - pad.t - pad.b);
  function model() {
    const rppActual = state.rpp * (state.zs / DESIGN_ZS); const N = Math.sqrt(state.rpp / DESIGN_ZS);
    const rSrc = (RP_PP * rppActual) / (RP_PP + rppActual);
    const fLow = rSrc / (2 * Math.PI * state.lp); const fHigh = (RP_PP + rppActual) / (2 * Math.PI * state.ll / 1000);
    return { rppActual, N, fLow, fHigh, perTube: rppActual / 2 };
  }
  function draw() {
    ({ ctx, W, H } = fit(canvas, 420 / 900));
    const m = model();
    frame(ctx, W, H, pad, "FREQUENCY Hz", "RESPONSE dB");
    ctx.strokeStyle = css("--grid"); [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].forEach((f) => { ctx.beginPath(); ctx.moveTo(X(f), Y(6)); ctx.lineTo(X(f), Y(-30)); ctx.stroke(); });
    for (let db = 6; db >= -30; db -= 6) { ctx.beginPath(); ctx.moveTo(X(fmin), Y(db)); ctx.lineTo(X(fmax), Y(db)); ctx.stroke(); }
    ctx.fillStyle = css("--ink-3"); ctx.font = "13px 'Sometype Mono', monospace"; ctx.textAlign = "right";
    for (let db = 6; db >= -30; db -= 6) ctx.fillText(db, pad.l - 6, Y(db) + 3);
    ctx.textAlign = "center"; [10, 100, 1000, 10000, 100000].forEach((f) => ctx.fillText(f >= 1000 ? `${f / 1000}k` : f, X(f), H - pad.b + 14));
    ctx.strokeStyle = css("--amber"); ctx.lineWidth = 1.6; ctx.beginPath();
    for (let k = 0; k <= 400; k++) { const f = Math.pow(10, 1 + (4 * k) / 400); const hp = (f / m.fLow) / Math.sqrt(1 + (f / m.fLow) ** 2); const lp = 1 / Math.sqrt(1 + (f / m.fHigh) ** 2); const db = 20 * Math.log10(hp * lp); k === 0 ? ctx.moveTo(X(f), Y(Math.max(-30, db))) : ctx.lineTo(X(f), Y(Math.max(-30, db))); }
    ctx.stroke();
    ctx.strokeStyle = css("--ember"); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(fmin), Y(-3)); ctx.lineTo(X(fmax), Y(-3)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = css("--amber-2"); ctx.textAlign = "left"; ctx.fillText(`-3 dB  ${m.fLow.toFixed(1)} Hz … ${(m.fHigh / 1000).toFixed(0)} kHz`, X(12), Y(-3) - 6);
    els.readout.innerHTML = [["Turns ratio N", m.N.toFixed(2) + " : 1"], ["Reflected plate-to-plate", `${Math.round(m.rppActual)} Ω`], ["Per-tube load ≈", `${Math.round(m.perTube)} Ω (class A)`], ["Bass corner", `${m.fLow.toFixed(1)} Hz`], ["Treble corner", `${(m.fHigh / 1000).toFixed(0)} kHz`]].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    curves?.setLoad(m.perTube);
  }
  els.zs.addEventListener("change", () => { state.zs = +els.zs.value; draw(); });
  [["rpp", "orpp"], ["lp", "olp"], ["ll", "oll"]].forEach(([k, o]) => els[k].addEventListener("input", () => { state[k] = +els[k].value; els[o].value = els[k].value; draw(); }));
  onResize(canvas, draw);
  draw();
}

// ---------- anatomy ----------
const PARTS = {
  glass: "The envelope holds a hard vacuum: receiving tubes are pumped to roughly 10⁻⁸ to 10⁻⁹ bar (10⁻⁵ to 10⁻⁶ torr), and the getter keeps it there for the life of the tube. The ST shoulder is a 1930s shape that let the plate sit higher without touching the glass.",
  filament: "The filament is the cathode itself (directly heated): a thoriated or oxide-coated ribbon at 2.5 V that boils off electrons. In the WA33 the 2A3 power tubes and the 5U4G / 274B rectifier are directly heated; the 6C45 drivers are indirectly heated (a 6.3 V heater warms a separate cathode sleeve).",
  grid: "A fine wire helix between filament and plate. A few volts negative on the grid throttle the electron stream; that is the gain. The 2A3 idles at about −45 V on its grid and swings ±45 V with the music.",
  plate: "The anode collects the electrons and gets hot doing it: 15 W for a 2A3. A solid plate radiates; a mesh plate is woven wire that runs hotter and lets you see the filament through it.",
  mica: "Mica spacers hold the structure rigid. Loose spacers ring: that is microphonics, and it is why the 6C45 driver is the tube owners tap to test.",
  getter: "A flashed barium getter: the silver mirror inside the top. It keeps eating stray gas for the life of the tube; a getter gone white means air got in.",
  base: "The UX4 bakelite base with four pins: two thick pins for the filament, two thin for grid and plate. Nothing to adjust, everything to align.",
};
export function initAnatomy(host, note, segButtons, data) {
  const state = { plate: "solid", pinned: null };
  const pool = (data?.tubes || []).filter((t) => t.family !== "6C45");
  const examples = (mesh) => pool.filter((t) => /mesh/i.test(t.construction || "") === mesh).slice(0, 7).map((t) => `${t.brand} ${t.model}`).join(", ");
  const describe = (part) => {
    let t = PARTS[part];
    if (part === "plate") t += state.plate === "mesh"
      ? ` Mesh-plate tubes in the pool: ${examples(true)}. Owners describe them as airier and a touch softer; mesh runs closer to its limits, so respect the current ratings.`
      : ` Solid-plate tubes in the pool: ${examples(false)}. Solid plates take more dissipation and tend to sound more direct.`;
    return t;
  };
  function svg() {
    const meshPat = `<pattern id="mesh" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0H4M0 0V4" stroke="#8a8278" stroke-width="0.8"/></pattern>`;
    const plate = state.plate === "mesh"
      ? `<rect class="part" data-part="plate" x="70" y="78" width="60" height="124" rx="3" fill="url(#mesh)" stroke="#8a8278" stroke-width="1.2"/>`
      : `<rect class="part" data-part="plate" x="70" y="78" width="60" height="124" rx="3" fill="#24211d" stroke="#3a3632" stroke-width="1.2"/>`;
    const grid = Array.from({ length: 18 }, (_, i) => `<line x1="86" y1="${86 + i * 6.3}" x2="114" y2="${88 + i * 6.3}" stroke="#9aa3ad" stroke-width="0.9"/>`).join("");
    const fil = `<path class="part" data-part="filament" d="M92 190 L96 96 L100 190 L104 96 L108 190" fill="none" stroke="var(--amber)" stroke-width="1.6" stroke-linejoin="round" filter="url(#glow)"/>`;
    return `<svg viewBox="0 0 200 300" role="img" aria-label="Cutaway of a 2A3 tube: glass, getter, mica, plate, grid, filament, base">
      <defs>${meshPat}<filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect class="bg" x="0" y="0" width="200" height="300" fill="transparent"/>
      <path class="part" data-part="glass" d="M72 262 C72 230 58 226 58 190 L58 120 C58 70 72 40 100 32 C128 40 142 70 142 120 L142 190 C142 226 128 230 128 262 Z" fill="rgba(239,231,220,0.03)" stroke="var(--steel)" stroke-width="1.4"/>
      <path class="part" data-part="getter" d="M78 52 C86 40 114 40 122 52 C114 60 86 60 78 52 Z" fill="#1a1d22" stroke="#4a5560" stroke-width="0.8"/>
      <rect class="part" data-part="mica" x="62" y="70" width="76" height="3" fill="#cfc9bd" opacity="0.7"/>
      <rect class="part" data-part="mica" x="62" y="206" width="76" height="3" fill="#cfc9bd" opacity="0.7"/>
      ${plate}<g class="part" data-part="grid">${grid}</g>${fil}
      <rect class="part" data-part="base" x="66" y="262" width="68" height="20" rx="2" fill="#151210" stroke="#3a3632"/>
      <g stroke="var(--steel)" stroke-width="3" stroke-linecap="round"><line x1="80" y1="282" x2="80" y2="296"/><line x1="120" y1="282" x2="120" y2="296"/></g>
      <g stroke="var(--steel)" stroke-width="1.6" stroke-linecap="round"><line x1="94" y1="282" x2="94" y2="296"/><line x1="106" y1="282" x2="106" y2="296"/></g>
      <g font-family="var(--font-mono)" font-size="7.5" fill="var(--ink-3)">
        <text x="150" y="50">getter</text><text x="150" y="74">mica</text><text x="150" y="140">plate (${state.plate})</text><text x="8" y="140">grid</text><text x="8" y="100">filament</text><text x="150" y="275">UX4 base</text>
      </g>
    </svg>`;
  }
  const DEFAULT = "Electrons boil off the heated filament, pass the grid, and land on the plate. The grid voltage gates the flow; that is the whole amplifier. Hover a part to read it; click to pin it.";
  function show(part) { note.textContent = part ? describe(part) : DEFAULT; host.querySelectorAll(".part").forEach((p) => p.classList.toggle("lit", p.dataset.part === part)); host.querySelectorAll(".part").forEach((p) => p.classList.toggle("pinned", !!state.pinned && p.dataset.part === state.pinned)); }
  function render() {
    host.innerHTML = svg();
    host.querySelectorAll(".part").forEach((p) => {
      p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); p.setAttribute("aria-pressed", String(state.pinned === p.dataset.part));
      p.addEventListener("mouseenter", () => show(p.dataset.part));
      p.addEventListener("mouseleave", () => show(state.pinned));
      p.addEventListener("focus", () => show(p.dataset.part));
      p.addEventListener("click", (e) => { e.stopPropagation(); state.pinned = state.pinned === p.dataset.part ? null : p.dataset.part; host.querySelectorAll(".part").forEach((x) => x.setAttribute("aria-pressed", String(state.pinned === x.dataset.part))); show(state.pinned || p.dataset.part); });
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.click(); } });
    });
    host.querySelector("svg").addEventListener("click", () => { state.pinned = null; show(null); });
    show(state.pinned);
  }
  segButtons.forEach((b) => b.addEventListener("click", () => { state.plate = b.dataset.plate; segButtons.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); if (!state.pinned || state.pinned === "plate") state.pinned = "plate"; render(); }));
  render();
}
