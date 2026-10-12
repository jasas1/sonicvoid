// Signal path: a looping schematic of a balanced class-A push-pull tube amplifier with tube rectification.
// Representative topology for the WA33 (two drivers and two 2A3 per channel, output transformer, 5U4G/274B supply), not Woo's schematic.
import { reducedMotion } from "./data.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, children = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); children.forEach((c) => n.appendChild(c)); return n; };
const text = (x, y, s, cls = "sig-t", anchor = "start") => { const t = el("text", { x, y, class: cls, "text-anchor": anchor }); t.textContent = s; return t; };

export function initSignal(host, { period = 4 } = {}) {
  const W = 1200, H = 560;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Signal path through a balanced class-A push-pull tube amplifier, from balanced input to headphones, with the tube-rectified power supply above" });
  host.innerHTML = ""; host.appendChild(svg);
  const g = (cls) => { const n = el("g", { class: cls }); svg.appendChild(n); return n; };
  const wires = g("sig-wires"), parts = g("sig-parts"), labels = g("sig-labels"), dots = g("sig-dots"), scopes = g("sig-scopes");

  // ---------- geometry ----------
  const HOT = 250, COLD = 330;             // the two balanced phases run at these y's
  const X = { src: 40, in: 120, vol: 200, drv: 330, pwr: 560, opt: 790, out: 960, hp: 1090 };
  const paths = {};
  const wire = (id, d, cls = "sig-wire") => { const p = el("path", { d, class: cls, id }); wires.appendChild(p); paths[id] = p; return p; };
  // signal wires (hot / cold)
  wire("hot1", `M${X.in} ${HOT} H${X.vol - 22}`); wire("hot2", `M${X.vol + 22} ${HOT} H${X.drv - 34}`); wire("hot3", `M${X.drv + 34} ${HOT - 40} H${X.pwr - 40} V${HOT}`); wire("hot4", `M${X.pwr + 40} ${HOT - 60} H${X.opt - 20} V${HOT - 30}`);
  wire("cold1", `M${X.in} ${COLD} H${X.vol - 22}`); wire("cold2", `M${X.vol + 22} ${COLD} H${X.drv - 34}`); wire("cold3", `M${X.drv + 34} ${COLD + 40} H${X.pwr - 40} V${COLD}`); wire("cold4", `M${X.pwr + 40} ${COLD + 60} H${X.opt - 20} V${COLD + 30}`);
  wire("sec", `M${X.opt + 40} ${HOT + 10} H${X.out - 10}`); wire("sec2", `M${X.opt + 40} ${COLD - 10} H${X.out - 10}`);
  wire("hp1", `M${X.out + 30} ${HOT + 10} H${X.hp - 30}`); wire("hp2", `M${X.out + 30} ${COLD - 10} H${X.hp - 30}`);
  // power supply chain (top)
  const PS = 70;
  wire("ac", `M60 ${PS} H190`, "sig-wire sig-ac"); wire("ps1", `M260 ${PS} H370`, "sig-wire sig-ac"); wire("ps2", `M440 ${PS} H560`, "sig-wire sig-pulse"); wire("bplus", `M640 ${PS} H${X.opt + 10} V${HOT - 36}`, "sig-wire sig-dc");
  wire("bplus2", `M${X.pwr} ${PS} V${HOT - 120}`, "sig-wire sig-dc"); wire("bplus3", `M${X.drv} ${PS} V${HOT - 120}`, "sig-wire sig-dc");
  wire("fil", `M560 ${PS + 40} H${X.pwr - 60} V${COLD + 110} H${X.pwr + 60}`, "sig-wire sig-fil");

  // ---------- symbols ----------
  const tube = (x, y, name, big) => {
    const r = big ? 34 : 26; const grp = el("g", { class: "sig-tube" });
    grp.appendChild(el("circle", { cx: x, cy: y, r, class: "sig-glass" }));
    grp.appendChild(el("path", { d: `M${x - r * 0.45} ${y + r * 0.55} q${r * 0.22} -${r * 0.5} ${r * 0.45} 0 q${r * 0.22} ${r * 0.5} ${r * 0.45} 0`, class: "sig-fil-line" }));      // filament
    for (let i = -2; i <= 2; i++) grp.appendChild(el("line", { x1: x - r * 0.55 + i * 0.01, y1: y + i * r * 0.14, x2: x + r * 0.55, y2: y + i * r * 0.14, class: "sig-grid" }));          // grid
    grp.appendChild(el("path", { d: `M${x - r * 0.6} ${y - r * 0.55} H${x + r * 0.6}`, class: "sig-plate" }));                                                                             // plate
    grp.appendChild(el("path", { d: `M${x} ${y - r * 0.55} V${y - r - 6}`, class: "sig-wire" }));
    parts.appendChild(grp);
    labels.appendChild(text(x, y + r + 16, name, "sig-name", "middle"));
    paths["e" + name] = el("path", { d: `M${x} ${y + r * 0.5} V${y - r * 0.5}` }); // electron path inside the tube, filament → plate
    return grp;
  };
  const coil = (x, y, h, n) => { let d = `M${x} ${y}`; for (let i = 0; i < n; i++) d += ` a7 ${h / n / 2} 0 0 1 0 ${h / n}`; return el("path", { d, class: "sig-coil" }); };
  // source, input XLR
  parts.appendChild(el("circle", { cx: X.src, cy: (HOT + COLD) / 2, r: 24, class: "sig-glass" }));
  parts.appendChild(el("path", { d: `M${X.src - 14} ${(HOT + COLD) / 2} q7 -14 14 0 t14 0`, class: "sig-sine" }));
  parts.appendChild(el("path", { d: `M${X.src + 24} ${(HOT + COLD) / 2} H${X.in - 16} M${X.in - 16} ${HOT} V${COLD}`, class: "sig-wire" }));
  labels.appendChild(text(X.src, (HOT + COLD) / 2 + 48, "source", "sig-name", "middle"));
  labels.appendChild(text(X.in - 4, HOT - 14, "XLR in · hot", "sig-t")); labels.appendChild(text(X.in - 4, COLD + 22, "cold (−)", "sig-t"));
  labels.appendChild(text(X.in + 6, (HOT + COLD) / 2 + 4, "≈ 2 V AC", "sig-v"));
  // volume
  [HOT, COLD].forEach((y) => { parts.appendChild(el("rect", { x: X.vol - 22, y: y - 8, width: 44, height: 16, class: "sig-box" })); parts.appendChild(el("path", { d: `M${X.vol - 10} ${y + 6} L${X.vol + 12} ${y - 10}`, class: "sig-plate" })); });
  labels.appendChild(text(X.vol, COLD + 34, "volume", "sig-name", "middle"));
  // drivers
  tube(X.drv, HOT - 6, "6C45 driver (+)", false); tube(X.drv, COLD + 6, "6C45 driver (−)", false);
  labels.appendChild(text(X.drv + 40, HOT - 70, "gain ≈ 40×", "sig-v")); labels.appendChild(text(X.drv, PS + 40, "150 V DC", "sig-v", "middle"));
  // power tubes
  tube(X.pwr, HOT - 26, "2A3 (+)", true); tube(X.pwr, COLD + 26, "2A3 (−)", true);
  labels.appendChild(text(X.pwr - 60, HOT - 86, "grid −45 V ± 45 V", "sig-v")); labels.appendChild(text(X.pwr, PS + 40, "B+ 300 V DC", "sig-v", "middle"));
  labels.appendChild(text(X.pwr + 46, COLD + 112, "filament 2.5 V · 2.5 A", "sig-v"));
  // output transformer with centre tap
  parts.appendChild(coil(X.opt, HOT - 30, COLD - HOT + 60, 8)); parts.appendChild(coil(X.opt + 40, HOT + 10, COLD - HOT - 20, 6));
  parts.appendChild(el("line", { x1: X.opt + 14, y1: HOT - 34, x2: X.opt + 14, y2: COLD + 34, class: "sig-core" })); parts.appendChild(el("line", { x1: X.opt + 24, y1: HOT - 34, x2: X.opt + 24, y2: COLD + 34, class: "sig-core" }));
  parts.appendChild(el("path", { d: `M${X.opt + 10} ${HOT - 36} V${(HOT + COLD) / 2} H${X.opt}`, class: "sig-wire sig-dc" }));
  labels.appendChild(text(X.opt + 20, COLD + 60, "output transformer", "sig-name", "middle")); labels.appendChild(text(X.opt + 20, COLD + 76, "centre tap to B+ · primary carries the DIFFERENCE of the two plate currents", "sig-t", "middle"));
  // output XLR + headphone
  parts.appendChild(el("rect", { x: X.out - 10, y: HOT - 6, width: 40, height: COLD - HOT + 12, rx: 6, class: "sig-box" })); labels.appendChild(text(X.out + 10, COLD + 30, "XLR out", "sig-name", "middle"));
  parts.appendChild(el("path", { d: `M${X.hp - 30} ${HOT + 10} q0 -40 30 -40 h0 q30 0 30 40 V${COLD - 10} h-12 V${HOT + 20} h-36 V${COLD - 10} h-12 Z`, class: "sig-glass" }));
  labels.appendChild(text(X.hp, COLD + 30, "headphones", "sig-name", "middle")); labels.appendChild(text(X.hp, COLD + 46, "32–600 Ω · up to 10 W", "sig-v", "middle"));
  // power supply symbols
  labels.appendChild(text(60, PS - 14, "mains 120 V AC", "sig-t")); parts.appendChild(coil(205, PS - 24, 48, 4)); parts.appendChild(coil(245, PS - 24, 48, 4)); labels.appendChild(text(225, PS + 42, "power transformer", "sig-name", "middle"));
  labels.appendChild(text(300, PS - 14, "≈ 420 V AC", "sig-v"));
  tube(405, PS, "5U4G / 274B rectifier", false);
  labels.appendChild(text(500, PS - 14, "pulsating DC", "sig-v")); parts.appendChild(coil(590, PS - 24, 48, 4)); parts.appendChild(el("rect", { x: 606, y: PS - 10, width: 14, height: 20, class: "sig-box" })); labels.appendChild(text(600, PS + 42, "choke + capacitors", "sig-name", "middle"));
  labels.appendChild(text(660, PS - 14, "smooth DC", "sig-v"));
  // ---------- scopes ----------
  const scope = (x, y, w, title) => { scopes.appendChild(el("rect", { x, y, width: w, height: 70, class: "sig-scope" })); scopes.appendChild(text(x + 6, y + 14, title, "sig-t")); const p1 = el("path", { class: "sig-tr sig-tr-hot" }); const p2 = el("path", { class: "sig-tr sig-tr-cold" }); const p3 = el("path", { class: "sig-tr sig-tr-out" }); scopes.append(p1, p2, p3); return { x, y, w, p1, p2, p3 }; };
  const SY = 450;
  const sc1 = scope(40, SY, 200, "input: one AC signal"), sc2 = scope(260, SY, 220, "two phases, 180° apart"), sc3 = scope(500, SY, 240, "2A3 plate current: both stay ON (class A)"), sc4 = scope(760, SY, 200, "primary: difference → clean"), sc5 = scope(980, SY, 190, "supply: ripple → DC");
  const trace = (s, fn, path, zeroLine) => { let d = ""; for (let i = 0; i <= 60; i++) { const px = s.x + 8 + (i / 60) * (s.w - 16); const v = fn(i / 60); const py = s.y + 44 - v * 22; d += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1); } path.setAttribute("d", d); if (zeroLine && !s.zero) { s.zero = el("line", { x1: s.x + 8, y1: s.y + 44 + 22, x2: s.x + s.w - 8, y2: s.y + 44 + 22, class: "sig-zero" }); scopes.appendChild(s.zero); scopes.appendChild(text(s.x + s.w - 10, s.y + 64, "0 mA", "sig-t", "end")); } };

  // ---------- particles ----------
  const SIG = [["hot1", 1], ["hot2", 1], ["hot3", 1], ["hot4", 1], ["cold1", -1], ["cold2", -1], ["cold3", -1], ["cold4", -1]];
  const PS_PATHS = [["ac", "ac"], ["ps1", "ac"], ["ps2", "pulse"], ["bplus", "dc"], ["bplus2", "dc"], ["bplus3", "dc"], ["fil", "fil"], ["sec", "out"], ["sec2", "out"], ["hp1", "out"], ["hp2", "out"]];
  const E_PATHS = ["e6C45 driver (+)", "e6C45 driver (−)", "e2A3 (+)", "e2A3 (−)", "e5U4G / 274B rectifier"];
  const parts2 = [];
  const mk = (pathId, cls, n, kind, sign = 1) => { const p = paths[pathId]; const len = p.getTotalLength(); for (let i = 0; i < n; i++) { const c = el("circle", { r: kind === "e" ? 2 : 2.6, class: `sig-dot ${cls}` }); dots.appendChild(c); parts2.push({ p, len, c, ph: i / n, kind, sign }); } };
  SIG.forEach(([id, sign]) => mk(id, sign > 0 ? "sig-dot-hot" : "sig-dot-cold", 7, "sig", sign));
  PS_PATHS.forEach(([id, kind]) => mk(id, kind === "out" ? "sig-dot-out" : kind === "fil" ? "sig-dot-fil" : "sig-dot-dc", kind === "fil" ? 10 : 6, kind));
  E_PATHS.forEach((id) => { const sign = id.includes("(−)") ? -1 : 1; mk(id, "sig-dot-e", id.includes("2A3") ? 10 : 6, "e", sign); });

  const prefersStill = reducedMotion();
  let raf = 0, visible = false, t0 = performance.now();
  function frame(now) {
    const tt = ((now - t0) / 1000 / period) % 1; const w = 2 * Math.PI * tt; const sig = Math.sin(w);
    parts2.forEach((d) => {
      let speed = 1, vis = 1;
      if (d.kind === "sig") { speed = 1 + 0.55 * d.sign * sig; }           // signal dots surge with the waveform
      if (d.kind === "pulse") { speed = Math.abs(sig) * 1.4 + 0.1; }
      if (d.kind === "e") { const drive = 0.5 + 0.5 * d.sign * sig; speed = 0.7 + 1.6 * drive; vis = 0.3 + 0.7 * drive; } // electrons: more flow when the grid swings positive-ward
      if (d.kind === "out") { speed = 1 + 0.55 * sig; }
      const ph = (d.ph + tt * speed * 1.15) % 1;
      const pt = d.p.getPointAtLength(ph * d.len); d.c.setAttribute("cx", pt.x.toFixed(1)); d.c.setAttribute("cy", pt.y.toFixed(1)); d.c.style.opacity = vis;
    });
    trace(sc1, (x) => Math.sin(2 * Math.PI * (x * 2 - tt)) * 0.8, sc1.p1);
    trace(sc2, (x) => Math.sin(2 * Math.PI * (x * 2 - tt)) * 0.8, sc2.p1); trace(sc2, (x) => -Math.sin(2 * Math.PI * (x * 2 - tt)) * 0.8, sc2.p2);
    trace(sc3, (x) => 0.1 + 0.75 * (0.55 + 0.45 * Math.sin(2 * Math.PI * (x * 2 - tt))), sc3.p1, true); trace(sc3, (x) => 0.1 + 0.75 * (0.55 - 0.45 * Math.sin(2 * Math.PI * (x * 2 - tt))), sc3.p2, true);
    trace(sc4, (x) => Math.sin(2 * Math.PI * (x * 2 - tt)) * 0.8, sc4.p3);
    trace(sc5, (x) => Math.abs(Math.sin(2 * Math.PI * (x * 2 - tt))) * 0.8 - 0.3, sc5.p1); trace(sc5, () => 0.42, sc5.p3);
    if (prefersStill) { raf = 0; return; }
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { threshold: 0.05 }).observe(host);
  frame(performance.now());
}
