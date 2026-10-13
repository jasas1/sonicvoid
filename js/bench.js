// Bench: 2A3 plate curves + load line (Koren model), 6C45 driver stage (Child–Langmuir model), heater budget + warm-up,
// rectifier sag (three-halves law), output transformer, tube anatomy.
import { reducedMotion } from "./data.js";

const KOREN_2A3 = { mu: 4.2, ex: 1.4, kg1: 1500, kp: 60, kvb: 300 }; // widely published SPICE parameters for the 2A3
export function korenIp(Vp, Vg, k = KOREN_2A3) {
  if (Vp <= 0) return 0;
  const E1 = (Vp / k.kp) * Math.log(1 + Math.exp(k.kp * (1 / k.mu + Vg / Math.sqrt(k.kvb + Vp * Vp))));
  return E1 <= 0 ? 0 : (2 * Math.pow(E1, k.ex)) / k.kg1; // amps
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const MONO = "'Sometype Mono', monospace";
const minus = (n, d = 1) => (n < 0 ? "−" : "") + Math.abs(n).toFixed(d);
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
  ctx.font = `14px ${MONO}`; ctx.fillStyle = css("--ink-3"); ctx.textAlign = "center";
  ctx.fillText(xlab, pad.l + (W - pad.l - pad.r) / 2, H - 8);
  ctx.save(); ctx.translate(14, pad.t + (H - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylab, 0, 0); ctx.restore();
}
/** Text on a Panel Black chip, so a label stays legible where it crosses a curve. */
function tag(ctx, text, x, y, align, color) {
  const w = ctx.measureText(text).width; const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.fillStyle = css("--bg-2"); ctx.fillRect(x0 - 3, y - 11, w + 6, 15);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y);
}
const rows = (list) => list.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

let benchData = null;    // set by initCurves; the round-2 cards and initAnatomy read the KB from here without extra wiring
let extrasDone = false;

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
    ctx.fillStyle = css("--ink-3"); ctx.font = `13px ${MONO}`; ctx.textAlign = "right";
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
  benchData = data;
  initBenchExtras(data); // the driver and heater cards wire themselves from here, so main.js needs no new line
  return { setLoad(rl) { state.rl = Math.round(rl); els.rl.value = state.rl; els.orl.value = state.rl; draw(); } };
}

/** Wire the round-2 cards (driver stage, heaters) by element id. Safe to call more than once. */
export function initBenchExtras(data) {
  if (extrasDone) return; extrasDone = true;
  const d = data || benchData || {}; const $ = (id) => document.getElementById(id);
  if ($("driver-canvas")) initDriver(d, { canvas: $("driver-canvas"), vbb: $("r-dvbb"), vg: $("r-dvg"), rl: $("r-drl"), ovbb: $("o-dvbb"), ovg: $("o-dvg"), orl: $("o-drl"), readout: $("driver-readout"), basis: $("driver-basis") });
  if ($("heat-canvas")) initHeaters(d, { canvas: $("heat-canvas"), bar: $("heat-bar"), scale: $("heat-scale"), legend: $("heat-legend"), segs: [...document.querySelectorAll("#bench-heat [data-rect]")], play: $("b-poweron"), readout: $("heat-readout") });
}

// ---------- 6C45 driver stage ----------
// Child–Langmuir three-halves law, Ia = K·(Va/μ + Vg)^1.5. μ and gm come from the KB; K is set so the model has that gm at an
// assumed test point, because the KB has no 6C45 operating point yet. rp = μ/gm falls out of the same fit.
const DRV_TEST = { va: 150, ia: 0.040 };
export function clTriode(mu, gmAV, test = DRV_TEST) {
  const E = (1.5 * test.ia) / gmAV;              // gm = dIa/dVg = 1.5·K·E^0.5 = 1.5·Ia/E at the test point
  const K = test.ia / Math.pow(E, 1.5);
  const ip = (va, vg) => { const e = va / mu + vg; return e > 0 ? K * Math.pow(e, 1.5) : 0; };
  const gm = (va, vg) => { const e = va / mu + vg; return e > 0 ? 1.5 * K * Math.sqrt(e) : 0; };
  return { mu, K, ip, gm, testVg: E - test.va / mu };
}
/** Operating point of a resistor-loaded triode: solve Ia = ip(Vbb − Ia·RL, Vg) by bisection. */
function loadPoint(tri, vbb, vg, rl) {
  let lo = 0, hi = vbb / rl;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (tri.ip(vbb - m * rl, vg) > m) lo = m; else hi = m; }
  const ia = (lo + hi) / 2; return { ia, va: vbb - ia * rl };
}
export function initDriver(data, els) {
  const ds = data.kb?.["6C45"]?.datasheet || {};
  const kbOk = !!(ds.mu && ds.gm_ma_v);
  const mu = ds.mu || 52, gmA = (ds.gm_ma_v || 52) / 1000, pmax = ds.max_plate_w || 6, vRated = ds.max_plate_v || 250;
  const drive = Math.abs(data.kb?.["2A3"]?.datasheet?.typical_op?.vg || 45); // the 2A3 grid swing to deliver, volts peak
  const tri = clTriode(mu, gmA);
  const canvas = els.canvas; let ctx, W = 900, H = 560; const pad = { l: 56, r: 16, t: 16, b: 40 };
  const maxV = 350, maxI = 0.1;
  const X = (v) => pad.l + (v / maxV) * (W - pad.l - pad.r), Y = (i) => H - pad.b - (i / maxI) * (H - pad.t - pad.b);
  const state = { vbb: +els.vbb.value, vg: +els.vg.value, rl: +els.rl.value };
  const curves = []; for (let k = 0; k <= 12; k++) { const vg = -k * 0.5; const pts = []; for (let v = 0; v <= maxV; v += 2) pts.push([v, tri.ip(v, vg)]); curves.push({ vg, pts }); }
  if (els.basis) els.basis.textContent = `Model: Child–Langmuir three-halves law, Ia = K·(Va/μ + Vg)^1.5, with μ ${mu} and gm ${+(gmA * 1000).toFixed(1)} mA/V ${kbOk ? "from the KB datasheet" : "(fallback values: the KB entry is missing)"}. K is set so the model has that gm at ${DRV_TEST.va} V and ${DRV_TEST.ia * 1000} mA, an assumed test point: the KB has no 6C45 operating point yet. The ${pmax} W hyperbola and the ${vRated} V line are the KB's limits; the ±${drive} V target is the 2A3 datasheet bias. A representative resistor-loaded stage: Woo publishes no driver voltages. The second-harmonic figure is the three-point estimate from the plate swing, not a measurement.`;
  function draw() {
    ({ ctx, W, H } = fit(canvas, 560 / 900));
    frame(ctx, W, H, pad, "PLATE VOLTS", "PLATE mA");
    ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1;
    for (let v = 0; v <= maxV; v += 50) { ctx.beginPath(); ctx.moveTo(X(v), Y(0)); ctx.lineTo(X(v), Y(maxI)); ctx.stroke(); }
    for (let i = 0; i <= maxI + 1e-9; i += 0.01) { ctx.beginPath(); ctx.moveTo(X(0), Y(i)); ctx.lineTo(X(maxV), Y(i)); ctx.stroke(); }
    ctx.fillStyle = css("--ink-3"); ctx.font = `13px ${MONO}`; ctx.textAlign = "right";
    for (let i = 0; i <= maxI + 1e-9; i += 0.02) ctx.fillText(Math.round(i * 1000), pad.l - 6, Y(i) + 3);
    ctx.textAlign = "center"; for (let v = 0; v <= maxV; v += 100) ctx.fillText(v, X(v), H - pad.b + 14);
    // limits from the KB: plate dissipation hyperbola and maximum plate voltage
    ctx.strokeStyle = css("--ember"); ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath();
    for (let v = pmax / maxI, first = true; v <= maxV; v += 2, first = false) first ? ctx.moveTo(X(v), Y(pmax / v)) : ctx.lineTo(X(v), Y(pmax / v));
    ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(vRated), Y(0)); ctx.lineTo(X(vRated), Y(maxI)); ctx.stroke(); ctx.setLineDash([]);
    // curve family: whole volts bright and labelled, half volts faint
    curves.forEach((c) => {
      const major = Number.isInteger(c.vg);
      ctx.strokeStyle = c.vg === 0 ? css("--ink") : css("--ink-2"); ctx.lineWidth = c.vg === 0 ? 1.4 : 1; ctx.globalAlpha = major ? 1 : 0.4;
      ctx.beginPath(); let started = false, last0 = null, exit = null;
      for (const [v, i] of c.pts) {
        if (i <= 0) { last0 = [v, 0]; continue; }
        if (i > maxI) { exit = [v, maxI, "top"]; break; }
        if (!started) { const s = last0 || [v, i]; ctx.moveTo(X(s[0]), Y(s[1])); started = true; }
        ctx.lineTo(X(v), Y(i));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (!major || !started) return;
      if (!exit) { const p = c.pts[c.pts.length - 1]; exit = [p[0], p[1], "right"]; }
      ctx.fillStyle = css("--ink-3"); const lab = c.vg === 0 ? "0 V" : minus(c.vg, 0);
      if (exit[2] === "top") { ctx.textAlign = "left"; ctx.fillText(lab, X(exit[0]) + 3, Y(maxI) + 13); }
      else { ctx.textAlign = "right"; ctx.fillText(lab, X(maxV) - 3, Y(exit[1]) - 5); }
    });
    ctx.font = `13px ${MONO}`;
    tag(ctx, `${pmax} W`, X(pmax / maxI) - 4, Y(maxI) + 13, "right", css("--ember"));
    tag(ctx, `${vRated} V max`, X(vRated) - 4, Y(0) - 7, "right", css("--ember"));
    // operating point, load line, and the stretch of it the music uses
    const q = loadPoint(tri, state.vbb, state.vg, state.rl);
    const on = q.ia > 1e-5;
    const gmQ = tri.gm(q.va, state.vg), rp = gmQ > 0 ? mu / gmQ : Infinity;
    const gain = on ? (mu * state.rl) / (state.rl + rp) : 0;
    const vin = gain > 0 ? drive / gain : Infinity;
    const up = on ? loadPoint(tri, state.vbb, state.vg - vin, state.rl) : q;   // grid more negative: less current, plate rises
    const dn = on ? loadPoint(tri, state.vbb, state.vg + vin, state.rl) : q;
    const swUp = up.va - q.va, swDn = q.va - dn.va;
    const h2 = swUp + swDn > 0 ? (Math.abs(swUp - swDn) / (2 * (swUp + swDn))) * 100 : 0; // three-point second-harmonic estimate
    const i0 = state.vbb / state.rl;
    ctx.strokeStyle = css("--amber"); ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(X(state.vbb), Y(0)); ctx.lineTo(X(i0 > maxI ? state.vbb - maxI * state.rl : 0), Y(Math.min(i0, maxI))); ctx.stroke();
    if (on) {
      ctx.strokeStyle = css("--amber-2"); ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(X(dn.va), Y(Math.min(dn.ia, maxI))); ctx.lineTo(X(up.va), Y(up.ia)); ctx.stroke(); ctx.lineCap = "butt";
      tag(ctx, `±${drive} V`, X(dn.va) - 8, Y(Math.min(dn.ia, maxI)) + 4, "right", css("--amber-2"));
    }
    ctx.fillStyle = css("--amber-2"); ctx.beginPath(); ctx.arc(X(q.va), Y(q.ia), 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = css("--amber"); ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(X(q.va), Y(q.ia), 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    tag(ctx, `Q ${Math.round(q.va)} V ${Math.round(q.ia * 1000)} mA`, X(q.va) + 10, Y(q.ia) - 10, "left", css("--amber-2"));
    // readout
    const diss = q.va * q.ia;
    const status = !on ? "cut off at idle" : state.vg + vin > 0 ? "▲ grid current on peaks" : up.ia < 1e-4 ? "▲ cuts off on peaks" : `clean ±${drive} V`;
    els.readout.innerHTML = rows([
      ["Plate current", `${(q.ia * 1000).toFixed(1)} mA`],
      ["Plate voltage", `${q.va.toFixed(0)} V${q.va > vRated ? " ▲ over max" : ""}`],
      ["Dissipation", `${diss.toFixed(1)} of ${pmax} W${diss > pmax ? " ▲" : ""}`],
      ["rp at Q", on ? `${(rp / 1000).toFixed(2)} kΩ` : "—"],
      ["Gain μ·RL/(RL+rp)", on ? `${gain.toFixed(1)}×` : "—"],
      [`6C45 grid for ±${drive} V`, on ? `±${vin.toFixed(2)} V pk` : "—"],
      ["Plate swing", on ? `+${swUp.toFixed(0)} / −${swDn.toFixed(0)} V` : "—"],
      ["2nd harmonic, est.", on ? `${h2.toFixed(1)} %` : "—"],
      ["Headroom", status],
    ]);
  }
  const bind = (key, out, fmt) => els[key].addEventListener("input", () => { state[key] = +els[key].value; els[out].value = fmt(state[key]); draw(); });
  bind("vbb", "ovbb", (v) => v); bind("vg", "ovg", (v) => minus(v, 1)); bind("rl", "orl", (v) => (v / 1000).toFixed(2));
  els.ovg.value = minus(state.vg, 1); els.orl.value = (state.rl / 1000).toFixed(2);
  onResize(canvas, draw);
  draw();
}

// ---------- heaters: budget and warm-up ----------
const LOG0 = -1, LOG1 = 3;                                   // timeline 0.1 s … 1000 s, log scale
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sInv = (p) => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (sstep(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
const warmAt = (w, t) => sstep((t - w.from) / (w.to - w.from));
const warmT = (w, p) => w.from + sInv(p) * (w.to - w.from);
const WARM_TYP = { dht: { from: 0.3, to: 1.8 }, rect: { from: 1, to: 4 }, idh: { from: 7, to: 28 } }; // seconds: typical values, not datasheet
const WOO_SETTLE = [300, 600];                                // Woo's quick-start guide: 5–10 minutes to operating temperature
const BPLUS_LIFT = 0.06;                                      // B+ sits a little high until the cold drivers start to draw (shape only)
const fmtT = (t) => (t < 10 ? `${t.toFixed(1)} s` : t < 120 ? `${Math.round(t)} s` : `${(t / 60).toFixed(1)} min`);
export function initHeaters(data, els) {
  const kb = data.kb || {}, amp = data.amp || {};
  const ds = (f) => kb[f]?.datasheet || {};
  const count = (f, d) => amp.families?.[f]?.count ?? d;
  const wall = amp.dimensions?.power_w || null;
  const wooSettle = (amp.facts || []).some((f) => /operating temperature/i.test(f.snippet || ""));
  const eml = (kb["5U4G"]?.makers || []).find((m) => (m.models || []).some((x) => /5U4G[- ]?Mesh/i.test(x)));
  const slow = (eml?.notes || "").match(/(\d+(?:\.\d+)?)\s*s first function[^0-9]*(\d+(?:\.\d+)?)\s*s full current/i);
  const emlFil = (eml?.notes || "").match(/Filament\s*([\d.]+)\s*V\s*\/\s*([\d.]+)\s*A/i);
  const RECT = {
    "5u4g": { label: "5U4G", short: "5U4G", v: ds("5U4G").filament_v, a: ds("5U4G").filament_a, warm: WARM_TYP.rect, src: "typ." },
    eml: { label: "EML 5U4G-Mesh", short: "EML", v: emlFil ? +emlFil[1] : ds("5U4G").filament_v, a: emlFil ? +emlFil[2] : ds("5U4G").filament_a, warm: slow ? { from: +slow[1], to: +slow[2] } : WARM_TYP.rect, src: slow ? "EML" : "typ." },
    "274b": { label: "274B", short: "274B", v: ds("274B").filament_v, a: ds("274B").filament_a, warm: WARM_TYP.rect, src: "typ." },
  };
  const P = { n2: count("2A3", 4), v2: ds("2A3").filament_v, a2: ds("2A3").filament_a, n6: count("6C45", 4), v6: ds("6C45").filament_v, a6: ds("6C45").filament_a };
  const watts = (n, v, a) => (n && v && a ? n * v * a : 0);
  const state = { rect: "5u4g", t: 10 ** LOG1, playing: false };
  const canvas = els.canvas; let ctx, W = 900, H = 400; const pad = { l: 56, r: 16, t: 30, b: 40 };
  function budget() {
    const r = RECT[state.rect];
    const list = [
      { key: "2a3", name: `2A3 filaments ×${P.n2}`, spec: `${P.v2} V × ${P.a2} A each · directly heated`, w: watts(P.n2, P.v2, P.a2), c: "--amber" },
      { key: "rect", name: `${r.label} filament`, spec: `${r.v} V × ${r.a} A · directly heated`, w: watts(1, r.v, r.a), c: "--ember" },
      { key: "6c45", name: `6C45 heaters ×${P.n6}`, spec: `${P.v6} V × ${P.a6} A each · indirectly heated`, w: watts(P.n6, P.v6, P.a6), c: "--amber-2" },
    ];
    return { list, total: list.reduce((s, x) => s + x.w, 0) };
  }
  function renderBudget() {
    const { list, total } = budget(); const scale = wall || total || 1; const pct = (w) => `${((w / scale) * 100).toFixed(2)}%`;
    els.bar.innerHTML = list.map((x) => `<span style="width:${pct(x.w)};background:var(${x.c})"></span>`).join("") + (wall ? `<span class="rest" style="width:${pct(Math.max(0, wall - total))}"></span>` : "");
    els.bar.setAttribute("aria-label", `Heaters ${total.toFixed(1)} W${wall ? ` of the amplifier's ${wall} W draw` : ""}`);
    els.scale.innerHTML = `<span>0 W</span><span>${wall ? `${wall} W draw · Woo spec` : "heaters only"}</span>`;
    els.legend.innerHTML = list.map((x) => `<li><i data-pip="${x.key}" style="--c:var(${x.c})"></i><span>${x.name}<small>${x.spec}</small></span><b>${x.w.toFixed(1)} W</b></li>`).join("")
      + (wall ? `<li class="rest"><i></i><span>Rest of the ${wall} W<small>plates, transformers, supply losses</small></span><b>${(wall - total).toFixed(0)} W</b></li>` : "");
  }
  function draw() {
    ({ ctx, W, H } = fit(canvas, (canvas.clientWidth || 900) < 480 ? 0.68 : 400 / 900)); // taller on a phone so the four curves separate
    const PMAX = 1.15;
    const X = (t) => pad.l + ((Math.log10(t) - LOG0) / (LOG1 - LOG0)) * (W - pad.l - pad.r);
    const Y = (p) => H - pad.b - (p / PMAX) * (H - pad.t - pad.b);
    frame(ctx, W, H, pad, "SECONDS AFTER POWER-ON (LOG)", "% OF FULL");
    const r = RECT[state.rect]; const tEnd = state.t;
    // typical-range band for indirectly heated cathodes, and Woo's settle time
    ctx.fillStyle = "rgba(239, 231, 220, 0.045)";
    ctx.fillRect(X(10), Y(PMAX), X(30) - X(10), Y(0) - Y(PMAX));
    if (wooSettle) ctx.fillRect(X(WOO_SETTLE[0]), Y(PMAX), X(WOO_SETTLE[1]) - X(WOO_SETTLE[0]), Y(0) - Y(PMAX));
    ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1;
    for (let d = LOG0; d < LOG1; d++) for (let m = 1; m < 10; m++) { ctx.globalAlpha = m === 1 ? 1 : 0.4; ctx.beginPath(); ctx.moveTo(X(m * 10 ** d), Y(0)); ctx.lineTo(X(m * 10 ** d), Y(PMAX)); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(X(10 ** LOG1), Y(0)); ctx.lineTo(X(10 ** LOG1), Y(PMAX)); ctx.stroke();
    [0, 0.25, 0.5, 0.75, 1].forEach((p) => { ctx.beginPath(); ctx.moveTo(X(10 ** LOG0), Y(p)); ctx.lineTo(X(10 ** LOG1), Y(p)); ctx.stroke(); });
    ctx.font = `13px ${MONO}`; ctx.fillStyle = css("--ink-3"); ctx.textAlign = "right";
    [0, 0.5, 1].forEach((p) => ctx.fillText(Math.round(p * 100), pad.l - 6, Y(p) + 4));
    for (let d = LOG0; d <= LOG1; d++) { ctx.textAlign = d === LOG1 ? "right" : "center"; ctx.fillText(d < 0 ? (10 ** d).toFixed(1) : String(10 ** d), X(10 ** d), H - pad.b + 14); }
    ctx.font = `11px ${MONO}`; ctx.textAlign = "center"; ctx.fillText("typ. 10–30 s", (X(10) + X(30)) / 2, pad.t - 9);
    if (wooSettle) { ctx.textAlign = "right"; ctx.fillText("Woo 5–10 min", X(10 ** LOG1) - 4, Y(0) - 7); } // bottom right: every curve is at full by then
    // emission curves up to the clock
    const e2 = (t) => warmAt(WARM_TYP.dht, t), er = (t) => warmAt(r.warm, t), e6 = (t) => warmAt(WARM_TYP.idh, t);
    const bp = (t) => er(t) * (1 + BPLUS_LIFT * (1 - e6(t)));
    const curve = (fn, color, width, dash = []) => {
      ctx.strokeStyle = css(color); ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); const l1 = Math.log10(tEnd);
      for (let k = 0; k <= 260; k++) { const t = 10 ** (LOG0 + ((l1 - LOG0) * k) / 260); k ? ctx.lineTo(X(t), Y(fn(t))) : ctx.moveTo(X(t), Y(fn(t))); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    curve(e6, "--amber-2", 1.5); curve(er, "--ember", 1.5); curve(bp, "--ink-2", 1.2, [5, 4]); curve(e2, "--amber", 1.8);
    ctx.font = `13px ${MONO}`;
    const lab = (txt, t, p, align, color, dx = 6, dy = 4) => { if (tEnd < t) return; ctx.fillStyle = css(color); ctx.textAlign = align; ctx.fillText(txt, X(t) + (align === "right" ? -dx : dx), Y(p) + dy); };
    lab("2A3", warmT(WARM_TYP.dht, 0.85), 0.85, "right", "--amber");
    lab(r.short, warmT(r.warm, 0.3), 0.3, "left", "--ember");
    lab("6C45", warmT(WARM_TYP.idh, 0.5), 0.5, "left", "--amber-2");
    const tb = r.warm.to + 1.5; lab("B+", tb, bp(tb), "left", "--ink-2", 2, -8);
    const tReady = Math.max(warmT(WARM_TYP.dht, 0.9), warmT(r.warm, 0.9), warmT(WARM_TYP.idh, 0.9));
    if (tEnd >= tReady) {
      ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(X(tReady), Y(0)); ctx.lineTo(X(tReady), Y(1)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css("--ink"); ctx.textAlign = "left"; ctx.fillText(`sound ≈ ${Math.round(tReady)} s`, X(tReady) + 6, Y(0.72));
    }
    if (state.playing) { ctx.strokeStyle = css("--amber"); ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(tEnd), Y(0)); ctx.lineTo(X(tEnd), Y(PMAX)); ctx.stroke(); ctx.globalAlpha = 1; }
    // the legend pips glow with each family's emission at the clock
    const e = { "2a3": e2(tEnd), rect: er(tEnd), "6c45": e6(tEnd) };
    els.legend.querySelectorAll("[data-pip]").forEach((p) => p.style.setProperty("--e", e[p.dataset.pip].toFixed(3)));
    const { total } = budget();
    els.readout.innerHTML = rows([
      ["Heaters total", `${total.toFixed(1)} W`],
      wall && [`Share of ${wall} W`, `${Math.round((total / wall) * 100)} %`],
      ["Clock", state.playing ? fmtT(tEnd) : tEnd >= 10 ** LOG1 ? "> 10 min" : "off"],
      ["2A3 emitting", `≈ ${warmT(WARM_TYP.dht, 0.9).toFixed(1)} s typ.`],
      [`B+ up · ${r.short}`, r.src === "EML" ? `${r.warm.from} → ${r.warm.to} s · EML` : `≈ ${warmT(r.warm, 0.9).toFixed(1)} s typ.`],
      ["6C45 emitting", `≈ ${Math.round(warmT(WARM_TYP.idh, 0.9))} s typ.`],
      wooSettle && ["Operating temp.", "5–10 min · Woo"],
    ]);
  }
  let raf = 0;
  function play() {
    cancelAnimationFrame(raf);
    if (reducedMotion()) { state.t = 10 ** LOG1; state.playing = false; draw(); return; }
    const t0 = performance.now(), dur = 6500;
    const step = (now) => { const k = Math.min(1, (now - t0) / dur); state.t = 10 ** (LOG0 + (LOG1 - LOG0) * k); state.playing = k < 1; draw(); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  els.segs.forEach((b) => b.addEventListener("click", () => {
    state.rect = b.dataset.rect; els.segs.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderBudget(); draw();
  }));
  els.play.addEventListener("click", play);
  renderBudget();
  if (!reducedMotion() && "IntersectionObserver" in window) {   // cold until the card is seen, then one power-on
    state.t = 10 ** LOG0;
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.35 });
    io.observe(canvas);
  }
  onResize(canvas, draw);
  draw();
}

// ---------- rectifier sag ----------
// Drop at rated current from the KB datasheet; between zero and that point the drop follows the three-halves law (V ∝ I^(2/3)).
const RECT_DEFS = [
  { id: "5u4g", label: "5U4G", fam: "5U4G", color: "--ink-2", eg: "EML 5U4G-Mesh" },
  { id: "5u4gb", label: "5U4GB", drop: 50, at: 275, approx: true, note: "≈ RCA datasheet, unverified · the KB warns it is not a drop-in for a 5U4G", color: "--steel" },
  { id: "274b", label: "274B", fam: "274B", color: "--amber", eg: "Takatsuki TA-274B" },
];
export function initRectifier(data, els) {
  const kb = data.kb || {};
  const host = (fam, ref) => { const e = (kb[fam]?.evidence || []).find((x) => x.claim_ref === ref); try { return e ? new URL(e.url).hostname.replace(/^www\./, "") : null; } catch { return null; } };
  const RECTS = RECT_DEFS.map((r) => {
    if (!r.fam) return { ...r };
    const ds = kb[r.fam]?.datasheet;
    if (ds?.voltage_drop_v && ds?.max_dc_output_ma) {
      const h = host(r.fam, "datasheet.voltage_drop_v");
      return { ...r, drop: ds.voltage_drop_v, at: ds.max_dc_output_ma, approx: false, note: h ? `datasheet via ${h}` : r.fam === "274B" ? "KB value, derived from EML operating data" : "KB value, no datasheet snippet" };
    }
    return { ...r, drop: r.fam === "274B" ? 30 : 44, at: r.fam === "274B" ? 150 : 225, approx: true, note: "≈ fallback: the KB entry is missing" };
  });
  const legend = els.legend || document.getElementById("rect-legend");
  if (legend) legend.innerHTML = RECTS.map((r) => `<li><i class="sw${r.approx ? " dash" : ""}" style="--c:var(${r.color})"></i><b>${r.label}</b><span>${r.drop} V @ ${r.at} mA · ${r.note}${r.eg ? ` · e.g. ${r.eg}` : ""}</span></li>`).join("");
  const canvas = els.canvas; let ctx, W = 900, H = 420; const pad = { l: 56, r: 16, t: 16, b: 40 };
  const state = { vpk: +els.vpk.value, il: +els.il.value, burst: 0 };
  const maxI = 300; const X = (i) => pad.l + (i / maxI) * (W - pad.l - pad.r);
  const vdc = (r, i) => state.vpk - r.drop * Math.pow(i / r.at, 2 / 3);
  function draw() {
    ({ ctx, W, H } = fit(canvas, 420 / 900));
    const vmin = state.vpk - 70, vmax = state.vpk + 6; const Y = (v) => H - pad.b - ((v - vmin) / (vmax - vmin)) * (H - pad.t - pad.b);
    const vstep = H < 260 ? 20 : 10;
    frame(ctx, W, H, pad, "LOAD CURRENT mA", "B+ VOLTS");
    ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1; for (let i = 0; i <= maxI; i += 50) { ctx.beginPath(); ctx.moveTo(X(i), Y(vmin)); ctx.lineTo(X(i), Y(vmax)); ctx.stroke(); }
    for (let v = Math.ceil(vmin / vstep) * vstep; v <= vmax; v += vstep) { ctx.beginPath(); ctx.moveTo(X(0), Y(v)); ctx.lineTo(X(maxI), Y(v)); ctx.stroke(); }
    ctx.fillStyle = css("--ink-3"); ctx.font = `13px ${MONO}`; ctx.textAlign = "right";
    for (let v = Math.ceil(vmin / vstep) * vstep; v <= vmax; v += vstep) ctx.fillText(v, pad.l - 6, Y(v) + 3);
    ctx.textAlign = "center"; for (let i = 0; i <= maxI; i += 50) ctx.fillText(i, X(i), H - pad.b + 14);
    const il = state.il + state.burst;
    RECTS.forEach((r) => {
      const seg = (i0, i1, dash) => { ctx.setLineDash(dash); ctx.beginPath(); for (let i = i0; i <= i1 + 1e-9; i += 2) { const v = vdc(r, i); i === i0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)); } ctx.stroke(); };
      ctx.strokeStyle = css(r.color); ctx.lineWidth = r.id === "274b" ? 1.6 : 1.2;
      const rated = Math.min(r.at, maxI);
      seg(0, rated, r.approx ? [6, 4] : []);
      if (rated < maxI) { ctx.globalAlpha = 0.6; seg(rated, maxI, [1.5, 4]); ctx.globalAlpha = 1; }
      ctx.setLineDash([]);
      // rated-current tick with the tube's name: labels sit at different currents, so they never collide
      const yr = Y(vdc(r, rated)); ctx.beginPath(); ctx.moveTo(X(rated), yr - 5); ctx.lineTo(X(rated), yr + 5); ctx.stroke();
      ctx.font = `13px ${MONO}`; tag(ctx, `${r.label}${r.approx ? " ≈" : ""}`, X(rated), yr + (r.id === "5u4gb" ? 20 : -10), "center", css(r.color));
      ctx.fillStyle = css(r.color); ctx.beginPath(); ctx.arc(X(il), Y(vdc(r, il)), 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = css("--amber"); ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(X(il), Y(vmin)); ctx.lineTo(X(il), Y(vmax)); ctx.stroke(); ctx.setLineDash([]);
    els.readout.innerHTML = rows(RECTS.map((r) => [`${r.label}${r.approx ? " ≈" : ""} @ ${Math.round(il)} mA`, `${vdc(r, il).toFixed(0)} V, −${(state.vpk - vdc(r, il)).toFixed(0)} V${il > r.at ? " ▲ over rating" : ""}`])
      .concat(RECTS.filter((r) => r.approx).map((r) => [`${r.label} basis`, r.note.split(" · ")[0]])));
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
// Woo publishes no transformer data: the design load, plate-to-plate impedance and inductances here are assumptions.
// The one related figure Woo gives is the whole amp's response, 10 Hz – 60 kHz at −2 dB (wooaudio.com/amplifiers/wa33).
const WOO_RESPONSE = { lo: 10, hi: 60000, db: -2 };
export function initTransformer(data, els, curves) {
  const canvas = els.canvas; let ctx, W = 900, H = 420; const pad = { l: 56, r: 16, t: 16, b: 40 };
  const state = { zs: 300, rpp: 5000, lp: 20, ll: 10 };
  const DESIGN_ZS = 300; const RP_PP = 2 * 800; // assumed design load; two 2A3 plate resistances (KB rp 800 Ω) in series across the primary
  const fmin = 10, fmax = 100000; const X = (f) => pad.l + ((Math.log10(f) - 1) / 4) * (W - pad.l - pad.r); const Y = (db) => pad.t + ((6 - db) / 36) * (H - pad.t - pad.b);
  function model() {
    const rppActual = state.rpp * (state.zs / DESIGN_ZS); const N = Math.sqrt(state.rpp / DESIGN_ZS);
    const rSrc = (RP_PP * rppActual) / (RP_PP + rppActual);
    const fLow = rSrc / (2 * Math.PI * state.lp); const fHigh = (RP_PP + rppActual) / (2 * Math.PI * state.ll / 1000);
    return { rppActual, N, fLow, fHigh, perTube: rppActual / 2 };
  }
  const resp = (f, m) => { const hp = (f / m.fLow) / Math.sqrt(1 + (f / m.fLow) ** 2); const lp = 1 / Math.sqrt(1 + (f / m.fHigh) ** 2); return 20 * Math.log10(hp * lp); };
  const at = (m, db, lo, hi, rising) => { for (let k = 0; k < 60; k++) { const mid = Math.sqrt(lo * hi); if ((resp(mid, m) < db) === rising) lo = mid; else hi = mid; } return Math.sqrt(lo * hi); };
  const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(0)} kHz` : f >= 10 ? `${f.toFixed(0)} Hz` : `${f.toFixed(1)} Hz`);
  function draw() {
    ({ ctx, W, H } = fit(canvas, 420 / 900));
    const m = model();
    frame(ctx, W, H, pad, "FREQUENCY Hz", "RESPONSE dB");
    ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1; [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].forEach((f) => { ctx.beginPath(); ctx.moveTo(X(f), Y(6)); ctx.lineTo(X(f), Y(-30)); ctx.stroke(); });
    for (let db = 6; db >= -30; db -= 6) { ctx.beginPath(); ctx.moveTo(X(fmin), Y(db)); ctx.lineTo(X(fmax), Y(db)); ctx.stroke(); }
    ctx.fillStyle = css("--ink-3"); ctx.font = `13px ${MONO}`; ctx.textAlign = "right";
    for (let db = 6; db >= -30; db -= H < 260 ? 12 : 6) ctx.fillText(db, pad.l - 6, Y(db) + 3); // every other label on a phone-width canvas
    ctx.textAlign = "center"; [10, 100, 1000, 10000, 100000].forEach((f) => ctx.fillText(f >= 1000 ? `${f / 1000}k` : f, X(f), H - pad.b + 14));
    ctx.strokeStyle = css("--amber"); ctx.lineWidth = 1.6; ctx.beginPath();
    for (let k = 0; k <= 400; k++) { const f = Math.pow(10, 1 + (4 * k) / 400); const db = resp(f, m); k === 0 ? ctx.moveTo(X(f), Y(Math.max(-30, db))) : ctx.lineTo(X(f), Y(Math.max(-30, db))); }
    ctx.stroke();
    ctx.strokeStyle = css("--ember"); ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(fmin), Y(-3)); ctx.lineTo(X(fmax), Y(-3)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = css("--amber-2"); ctx.textAlign = "left"; ctx.fillText(`−3 dB  ${m.fLow.toFixed(1)} Hz … ${(m.fHigh / 1000).toFixed(0)} kHz`, X(14), Y(-3) + 16);
    // Woo's published whole-amp response points, as steel diamonds
    ctx.fillStyle = css("--steel"); [WOO_RESPONSE.lo, WOO_RESPONSE.hi].forEach((f) => { const x = X(f), y = Y(WOO_RESPONSE.db); ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); });
    const lo2 = at(m, WOO_RESPONSE.db, 0.1, 1000, true), hi2 = at(m, WOO_RESPONSE.db, 1000, 1e7, false);
    els.readout.innerHTML = rows([
      ["Turns ratio N", m.N.toFixed(2) + " : 1"], ["Design load, assumed", `${DESIGN_ZS} Ω`], ["Plate-plate, assumed", `${Math.round(m.rppActual)} Ω`], ["Per-tube load ≈", `${Math.round(m.perTube)} Ω (class A)`],
      ["Bass corner", `${m.fLow.toFixed(1)} Hz`], ["Treble corner", `${(m.fHigh / 1000).toFixed(0)} kHz`],
      ["Model at −2 dB", `${hz(lo2)} – ${hz(hi2)}`], ["◇ Woo, whole amp", `${hz(WOO_RESPONSE.lo)} – ${hz(WOO_RESPONSE.hi)}`],
    ]);
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
  segButtons = [...(segButtons || [])].filter((b) => b.dataset.plate); // callers may pass every .seg-btn on the page; only the plate toggle belongs here
  data = data || benchData;                                             // the tube pool, when the caller does not pass data
  const state = { plate: "solid", pinned: null };
  const pool = (data?.tubes || []).filter((t) => t.family !== "6C45");
  const examples = (mesh) => pool.filter((t) => /mesh/i.test(t.construction || "") === mesh).slice(0, 7).map((t) => `${t.brand} ${t.model}`).join(", ");
  const describe = (part) => {
    let t = PARTS[part];
    const ex = (mesh) => { const list = examples(mesh); return list ? ` ${mesh ? "Mesh" : "Solid"}-plate tubes in the pool: ${list}.` : ""; };
    if (part === "plate") t += state.plate === "mesh"
      ? `${ex(true)} Owners describe them as airier and a touch softer; mesh runs closer to its limits, so respect the current ratings.`
      : `${ex(false)} Solid plates take more dissipation and tend to sound more direct.`;
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
