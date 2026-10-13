// The tube cube: driver x power x rectifier lattice of predicted profiles, with an "explode" into character space.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { predict } from "./matrix.js";
import { reducedMotion } from "./data.js";

const COOL = new THREE.Color(0x5b7698), WARM = new THREE.Color(0xf26a32), DIM = new THREE.Color(0x15171a);
const HOME = new THREE.Vector3(36, 27, 54);

export function initCube(canvas, data, store, { onPick, readout, host }) {
  const powers = data.tubes.filter((t) => t.family === "2A3");
  const rects = data.tubes.filter((t) => t.family === "5U4G" || t.family === "274B");
  const drivers = data.tubes.filter((t) => t.family === "6C45");
  const axes = data.profiles.axes; const nP = powers.length, nR = rects.length, nD = drivers.length, N = nP * nR * nD;
  const combos = [];
  drivers.forEach((d, di) => rects.forEach((r, ri) => powers.forEach((p, pi) => combos.push({ p, r, d, pi, ri, di, pred: predict({ power: p.id, rectifier: r.id, driver: d.id }, data).axes }))));
  const idOf = (pi, ri, di) => (di * nR + ri) * nP + pi;
  const S = 1.0; // lattice spacing

  // ---- controls UI ----
  const state = { explode: 0, target: 0, color: "warmth", ex: "warmth", ey: "speed", ez: "stage", slice: null, fly: null };
  const opt = (sel) => axes.map((a) => `<option value="${a.id}" ${a.id === state[sel] ? "selected" : ""}>${a.label}</option>`).join("");
  host.innerHTML = `
    <div class="cube-side">
      <div class="cube-fly"><button type="button" class="btn" id="cube-fly">Fly to my selection</button><button type="button" class="chip" id="cube-home">Reset view</button></div>
      <p class="cube-label">Driver slice</p>
      <div class="cube-slices">${drivers.map((d) => `<button type="button" class="chip" data-slice="${d.id}" aria-pressed="false"><i class="dot ${d.status}"></i>${d.brand} ${d.model}</button>`).join("")}<button type="button" class="chip" data-slice="" aria-pressed="true">All drivers</button></div>
      <p class="cube-label">Colour by</p>
      <select id="cube-color" class="mono">${opt("color")}</select>
      <p class="cube-label">Explode onto</p>
      <div class="cube-axes"><select id="cube-x" class="mono">${opt("ex")}</select><select id="cube-y" class="mono">${opt("ey")}</select><select id="cube-z" class="mono">${opt("ez")}</select></div>
      <button type="button" class="btn" id="cube-explode" aria-pressed="false">Explode to character space</button>
      <p class="fine cube-help">Lattice: x = 2A3, y = rectifier, z = driver. Exploded: every combination moves to where its predicted character puts it, so neighbours sound alike. Drag to rotate, scroll to zoom, click a cube to roll it.</p>
    </div>`;
  const sliceBtns = [...host.querySelectorAll("[data-slice]")];
  sliceBtns.forEach((b) => b.addEventListener("click", () => { state.slice = b.dataset.slice || null; sliceBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); recolor(); }));
  host.querySelector("#cube-color").addEventListener("change", (e) => { state.color = e.target.value; recolor(); legend(); });
  ["x", "y", "z"].forEach((k) => host.querySelector(`#cube-${k}`).addEventListener("change", (e) => { state["e" + k] = e.target.value; buildSpaceLabels(); place(state.explode); }));
  const explodeBtn = host.querySelector("#cube-explode");
  explodeBtn.addEventListener("click", () => { state.target = state.target ? 0 : 1; explodeBtn.setAttribute("aria-pressed", String(!!state.target)); explodeBtn.textContent = state.target ? "Stack back into the lattice" : "Explode to character space"; if (reducedMotion()) { state.explode = state.target; place(state.explode); } });

  // ---- scene ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500); camera.position.copy(HOME);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false; controls.minDistance = 5; controls.maxDistance = 120;
  const HOME_TARGET = new THREE.Vector3(-4, -2.5, 0); controls.target.copy(HOME_TARGET); // aim a little left of centre so the box sits right of centre, leaving room for the left-hand labels
  scene.add(new THREE.HemisphereLight(0xe4e9f0, 0x0b0a08, 1.25));
  const key = new THREE.DirectionalLight(0xffe6c8, 1.3); key.position.set(10, 20, 12); scene.add(key);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.66, 0.66), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.12, transparent: true, opacity: 0.92 }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(nP * S, nR * S, nD * S)), new THREE.LineBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0.9 })); scene.add(frame);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35 })); scene.add(glow);
  // back panes: a faint grid on the three far sides of the bounding box (lattice extents and exploded extents, crossfaded)
  const EXT_L = { x: nP * S / 2, y: nR * S / 2, z: nD * S / 2 }, EXT_E = { x: nP * S / 2, y: nR * S / 2, z: nD * S * 1.1 };
  function gridPane(axis, ext) { // pane perpendicular to `axis`, spanning the other two extents
    const [a, b] = axis === "x" ? ["y", "z"] : axis === "y" ? ["x", "z"] : ["x", "y"];
    const pts = [];
    for (let i = -Math.ceil(ext[a]); i <= Math.ceil(ext[a]); i += 1) pts.push(i, -ext[b], i, ext[b]);
    for (let j = -Math.ceil(ext[b]); j <= Math.ceil(ext[b]); j += 1) pts.push(-ext[a], j, ext[a], j);
    const v = [];
    for (let k = 0; k < pts.length; k += 2) { const u = pts[k], w = pts[k + 1]; v.push(...(axis === "x" ? [0, u, w] : axis === "y" ? [u, 0, w] : [u, w, 0])); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0.55 }));
  }
  const panes = ["x", "y", "z"].map((axis) => { const lat = gridPane(axis, EXT_L), exp = gridPane(axis, EXT_E); scene.add(lat); scene.add(exp); return { axis, lat, exp }; });
  function placePanes() {
    const t = state.explode; const ext = { x: EXT_L.x, y: EXT_L.y, z: THREE.MathUtils.lerp(EXT_L.z, EXT_E.z, t) };
    panes.forEach((p) => { const side = camera.position[p.axis] > 0 ? -1 : 1; [p.lat, p.exp].forEach((m) => { m.position.set(0, 0, 0); m.position[p.axis] = side * ext[p.axis]; }); });
  }

  const latticePos = (c) => new THREE.Vector3((c.pi - (nP - 1) / 2) * S, (c.ri - (nR - 1) / 2) * S, (c.di - (nD - 1) / 2) * S);
  const range = {}; axes.forEach((a) => { const vals = combos.map((c) => c.pred[a.id]); const lo = Math.min(...vals), hi = Math.max(...vals); range[a.id] = [lo, Math.max(hi, lo + 1)]; });
  const norm = (ax, v) => (v - range[ax][0]) / (range[ax][1] - range[ax][0]) - 0.5;
  const spacePos = (c) => new THREE.Vector3(norm(state.ex, c.pred[state.ex]) * nP * S, norm(state.ey, c.pred[state.ey]) * nR * S, norm(state.ez, c.pred[state.ez]) * nD * S * 2.2);
  const m4 = new THREE.Matrix4(); const v = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
  const selPos = new THREE.Vector3();
  const selected = () => { const s = store.get(); return combos[idOf(powers.findIndex((p) => p.id === s.power), rects.findIndex((r) => r.id === s.rectifier), drivers.findIndex((d) => d.id === s.driver))]; };
  function place(t) {
    const sel = store.get();
    combos.forEach((c, i) => {
      const a = latticePos(c), b = spacePos(c); v.lerpVectors(a, b, t);
      const inSlice = !state.slice || c.d.id === state.slice;
      const isSel = c.p.id === sel.power && c.r.id === sel.rectifier && c.d.id === sel.driver;
      const s = isSel ? 1.25 : inSlice ? 1 : 0.42; sc.set(s, s, s);
      m4.compose(v, q, sc); mesh.setMatrixAt(i, m4);
      if (isSel) { glow.position.copy(v); selPos.copy(v); }
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    frame.material.opacity = 0.9 * (1 - t); frame.visible = t < 0.99;
    panes.forEach((p) => { p.lat.material.opacity = 0.55 * (1 - t); p.exp.material.opacity = 0.55 * t; });
  }
  const col = new THREE.Color();
  function recolor() {
    const sel = store.get();
    combos.forEach((c, i) => {
      const w = Math.pow(Math.min(1, Math.max(0, (c.pred[state.color] - 30) / 50)), 0.8); // lift the top end, keep the dark base
      const inSlice = !state.slice || c.d.id === state.slice;
      const isSel = c.p.id === sel.power && c.r.id === sel.rectifier && c.d.id === sel.driver;
      col.copy(COOL).lerp(WARM, w); if (!inSlice) col.lerp(DIM, 0.75); if (isSel) col.set(0xffd27a);
      mesh.setColorAt(i, col);
    });
    mesh.instanceColor.needsUpdate = true; place(state.explode); markSelectedLabels();
  }

  // ---- screen-space labels (HTML, projected each frame, thinned when they would overlap) ----
  const wrap = canvas.parentElement; wrap.style.position = "relative";
  const overlay = document.createElement("div"); overlay.className = "cube-labels"; wrap.appendChild(overlay);
  const legendEl = document.createElement("div"); legendEl.className = "cube-legend"; wrap.appendChild(legendEl);
  const noteEl = document.createElement("p"); noteEl.className = "cube-note"; wrap.appendChild(noteEl);
  function legend() { const a = axes.find((x) => x.id === state.color); legendEl.innerHTML = `<span>${a.low}</span><i></i><span>${a.high}</span><b>${a.label}</b>`; }
  legend();
  const labels = []; // {el, text, group, axis, index, id, coord}
  const mkLabel = (text, group, axis, index, id, coord) => { const el = document.createElement("span"); el.className = `cube-lab ${group} ${axis}`; el.textContent = text; overlay.appendChild(el); const L = { el, text, group, axis, index, id, coord }; labels.push(L); return L; };
  powers.forEach((p, pi) => mkLabel(`${p.brand} ${p.model}`, "lattice", "x", pi, p.id, (pi - (nP - 1) / 2) * S));
  rects.forEach((r, ri) => mkLabel(`${r.brand} ${r.model}`, "lattice", "y", ri, r.id, (ri - (nR - 1) / 2) * S));
  drivers.forEach((d, di) => mkLabel(`${d.brand} ${d.model}`, "lattice", "z", di, d.id, (di - (nD - 1) / 2) * S));
  mkLabel("2A3 →", "lattice", "tx", 0); mkLabel("rectifier ↑", "lattice", "ty", 0); mkLabel("driver ⤢", "lattice", "tz", 0);
  function buildSpaceLabels() {
    labels.filter((L) => L.group === "space").forEach((L) => L.el.remove());
    for (let i = labels.length - 1; i >= 0; i--) if (labels[i].group === "space") labels.splice(i, 1);
    const ax = axes.find((a) => a.id === state.ex), ay = axes.find((a) => a.id === state.ey), az = axes.find((a) => a.id === state.ez);
    [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]].forEach(([x, y, z], i) => {
      const L = mkLabel(`${x < 0 ? ax.low : ax.high} · ${y < 0 ? ay.low : ay.high} · ${z < 0 ? az.low : az.high}`, "space", "corner", i); L.corner = [x, y, z];
    });
    mkLabel(`${ax.label} →`, "space", "tx", 0); mkLabel(`${ay.label} ↑`, "space", "ty", 0); mkLabel(`${az.label} ⤢`, "space", "tz", 0);
    noteEl.textContent = `corners are the pool's own extremes on ${ax.label.toLowerCase()}, ${ay.label.toLowerCase()} and ${az.label.toLowerCase()}`;
  }
  buildSpaceLabels();
  const selIdx = { x: 0, y: 0, z: 0 }; // thinning is centred on the selected tube of each axis so it always keeps its label
  function markSelectedLabels() {
    const s = store.get();
    labels.forEach((L) => { const on = L.id === s.power || L.id === s.rectifier || L.id === s.driver; L.el.classList.toggle("sel", on); if (on && selIdx[L.axis] !== undefined) selIdx[L.axis] = L.index; });
  }
  markSelectedLabels();
  const pv = new THREE.Vector3(); const tmp = new THREE.Vector3();
  const toScreen = (x, y, z, w, h) => { pv.set(x, y, z).project(camera); return [(pv.x * 0.5 + 0.5) * w, (-pv.y * 0.5 + 0.5) * h, pv.z]; };
  /** Plotly-style edge choice: X and Z ticks on the box edge lowest on screen, Y ticks on the leftmost vertical edge. */
  function chooseEdges(ext, w, h) {
    let xe = null, ze = null, ye = null;
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const m = toScreen(0, sy * ext.y, sz * ext.z, w, h); if (!xe || m[1] > xe.m[1]) xe = { sy, sz, m }; }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const m = toScreen(sx * ext.x, sy * ext.y, 0, w, h); if (!ze || m[1] > ze.m[1]) ze = { sx, sy, m }; }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const m = toScreen(sx * ext.x, 0, sz * ext.z, w, h); if (!ye || m[0] < ye.m[0]) ye = { sx, sz, m }; }
    return { xe, ze, ye };
  }
  const LH = 13; // label line height on screen (px)
  const deg = (r) => (r * 180) / Math.PI;
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight; const t = state.explode;
    const ext = { x: EXT_L.x, y: EXT_L.y, z: THREE.MathUtils.lerp(EXT_L.z, EXT_E.z, t) };
    const { xe, ze, ye } = chooseEdges(ext, w, h);
    noteEl.style.opacity = t;
    const pad = 0.6;
    const centre = toScreen(0, 0, 0, w, h);
    // each axis: the on-screen direction of its edge and the gap between neighbouring ticks
    const edge = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const g = Math.hypot(dx, dy) || 1; return { ex: dx / g, ey: dy / g, gap: g }; };
    const E = {
      x: edge(toScreen(0, xe.sy * ext.y, xe.sz * ext.z, w, h), toScreen(S, xe.sy * ext.y, xe.sz * ext.z, w, h)),
      y: edge(toScreen(ye.sx * ext.x, 0, ye.sz * ext.z, w, h), toScreen(ye.sx * ext.x, S, ye.sz * ext.z, w, h)),
      z: edge(toScreen(ze.sx * ext.x, ze.sy * ext.y, 0, w, h), toScreen(ze.sx * ext.x, ze.sy * ext.y, S, w, h)),
    };
    // every tick label runs perpendicular to its edge on screen (a vertical edge stacks them, a horizontal edge hangs them, a diagonal fans them),
    // so each covers one line height of the edge and the thinning stride is the same rule on all three axes
    const stride = {}; for (const ax of ["x", "y", "z"]) stride[ax] = Math.max(1, Math.ceil((LH + 1) / Math.max(1, E[ax].gap)));
    const boxes = []; // screen boxes of the shown tick labels, so the axis titles can keep clear of them
    const titles = []; const ticks = [];
    labels.forEach((L) => {
      let p;
      const alpha = L.group === "lattice" ? 1 - t : t;
      if (alpha < 0.05) { L.el.style.opacity = 0; return; }
      if (L.axis === "x") p = toScreen(L.coord, xe.sy * (ext.y + pad), xe.sz * (ext.z + pad), w, h);
      else if (L.axis === "y") p = toScreen(ye.sx * (ext.x + pad * 1.6), L.coord, ye.sz * (ext.z + pad * 1.6), w, h);
      else if (L.axis === "z") p = toScreen(ze.sx * (ext.x + pad), ze.sy * (ext.y + pad), L.coord, w, h);
      else if (L.axis === "tx") p = toScreen(0, xe.sy * (ext.y + 7.5), xe.sz * (ext.z + 2.5), w, h);
      else if (L.axis === "ty") p = toScreen(ye.sx * (ext.x + 9.5), 0, ye.sz * (ext.z + 5.5), w, h);
      else if (L.axis === "tz") p = toScreen(ze.sx * (ext.x + 7.5), ze.sy * (ext.y + 1.5), 0, w, h);
      else if (L.axis === "corner") { const [cx, cy, cz] = L.corner; p = toScreen(cx * (ext.x + 0.8), cy * (ext.y + 0.8), cz * (ext.z + 0.8), w, h); }
      const tick = L.group === "lattice" && ["x", "y", "z"].includes(L.axis);
      // thinning keeps every stride-th label counted from the selected one, so the selection never collides with a neighbour
      const k = tick ? stride[L.axis] : 1;
      const thinned = tick && (((L.index - selIdx[L.axis]) % k) + k) % k !== 0;
      const show = p[2] < 1 && !thinned && p[0] > -60 && p[0] < w + 60 && p[1] > -30 && p[1] < h + 30;
      if (["tx", "ty", "tz"].includes(L.axis)) { titles.push({ L, p, alpha, show }); return; }
      L.el.style.opacity = show ? alpha : 0;
      if (!show) return;
      const lw = L.el.offsetWidth || 0;
      const x = p[0].toFixed(1), y = p[1].toFixed(1);
      if (tick) {
        const e = E[L.axis];
        let dx = -e.ey, dy = e.ex; // perpendicular to the edge
        if ((p[0] - centre[0]) * dx + (p[1] - centre[1]) * dy < 0) { dx = -dx; dy = -dy; } // pointing away from the cube
        const fx = p[0] + dx * lw;
        if (fx < 4 || fx > w - 4) { dx = -dx; dy = -dy; } // would run off the canvas sideways: run inward instead
        ticks.push({ L, p, dx, dy, lw, alpha, gap: e.gap, sel: L.el.classList.contains("sel") });
        return;
      }
      let left = p[0] < centre[0]; const top = p[1] < centre[1]; // text runs away from the cube
      if (left && p[0] - lw < 4) left = false; else if (!left && p[0] + lw > w - 4) left = true; // flip the side when the text would run off the canvas
      if (L.axis === "corner") L.el.style.transform = `translate(${x}px, ${y}px) translate(${left ? "-100%" : "0"}, ${top ? "-100%" : "0"})`;
      else L.el.style.transform = `translate(${x}px, ${y}px) translate(${left ? "-100%" : "0"}, -50%)`;
    });
    // tick labels of different axes can meet at a shared corner: where two cross, the one on the more foreshortened axis gives way
    const rect = (k) => { const nx = -k.dy * LH / 2, ny = k.dx * LH / 2; const qx = k.p[0] + k.dx * k.lw, qy = k.p[1] + k.dy * k.lw;
      return { pts: [[k.p[0] + nx, k.p[1] + ny], [k.p[0] - nx, k.p[1] - ny], [qx - nx, qy - ny], [qx + nx, qy + ny]], ax: [[k.dx, k.dy], [-k.dy, k.dx]] }; };
    const separated = (A, B) => [...A.ax, ...B.ax].some(([ux, uy]) => {
      const pr = (R) => R.pts.reduce((m, [px, py]) => { const v = px * ux + py * uy; return [Math.min(m[0], v), Math.max(m[1], v)]; }, [Infinity, -Infinity]);
      const a = pr(A), b = pr(B); return a[1] < b[0] + 1 || b[1] < a[0] + 1;
    });
    ticks.forEach((k) => { k.r = rect(k); k.hide = false; k.hits = 0; });
    const pairs = [];
    for (let i = 0; i < ticks.length; i++) for (let j = i + 1; j < ticks.length; j++) {
      const a = ticks[i], b = ticks[j];
      if (a.L.axis === b.L.axis || separated(a.r, b.r)) continue;
      pairs.push([a, b]); a.hits++; b.hits++;
    }
    // who gives way: a label on an axis squashed to a point, then the unselected one, then the one crossing more labels, then the more foreshortened axis
    const flat = (k) => k.gap < 6;
    pairs.forEach(([a, b]) => {
      if (a.hide || b.hide) return;
      const loser = flat(a) !== flat(b) ? (flat(a) ? a : b) : a.sel !== b.sel ? (a.sel ? b : a) : a.hits !== b.hits ? (a.hits > b.hits ? a : b) : (a.gap < b.gap ? a : b);
      loser.hide = true;
    });
    ticks.forEach((k) => {
      if (k.hide) { k.L.el.style.opacity = 0; return; }
      // the text reads left to right (or upward when vertical); its start or end sits on the tick accordingly
      const flip = k.dx < 0 || (k.dx === 0 && k.dy > 0);
      const rx = flip ? -k.dx : k.dx, ry = flip ? -k.dy : k.dy;
      k.L.el.style.opacity = k.alpha;
      k.L.el.style.transform = `translate(${k.p[0].toFixed(1)}px, ${k.p[1].toFixed(1)}px) rotate(${deg(Math.atan2(ry, rx)).toFixed(1)}deg) translate(${flip ? "-100%" : "0"}, -50%)`;
      const xs = k.r.pts.map((q) => q[0]), ys = k.r.pts.map((q) => q[1]);
      boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    });
    // axis titles: horizontal, pushed outward until they clear the tick labels (hidden when they cannot)
    const hits = (b) => boxes.some((o) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]);
    titles.forEach(({ L, p, alpha, show }) => {
      if (!show) { L.el.style.opacity = 0; return; }
      const lw = L.el.offsetWidth || 0;
      let [px, py] = p; const ox = px - centre[0], oy = py - centre[1]; const on = Math.hypot(ox, oy) || 1; const ux = ox / on, uy = oy / on;
      let ok = false;
      for (let i = 0; i < 5 && !ok; i++) {
        let left = px < centre[0]; if (left && px - lw < 4) left = false; else if (!left && px + lw > w - 4) left = true;
        px = left ? Math.min(px, w - 4) : Math.max(px, 4); py = Math.min(Math.max(py, LH), h - LH); // stay on the canvas
        const b = [left ? px - lw : px, py - LH / 2, left ? px : px + lw, py + LH / 2];
        if (!hits(b)) { ok = true; L.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(${left ? "-100%" : "0"}, -50%)`; }
        else { px += ux * 22; py += uy * 22; }
      }
      L.el.style.opacity = ok && px > -60 && px < w + 60 && py > -30 && py < h + 30 ? alpha : 0;
    });
  }

  // ---- fly-to ----
  function flyTo(target, distance, pos) {
    const dir = pos ? null : camera.position.clone().sub(controls.target).normalize();
    const to = pos ? pos.clone() : target.clone().add(dir.multiplyScalar(distance));
    state.fly = { t0: performance.now(), dur: reducedMotion() ? 1 : 950, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: to, toT: target.clone() };
    controls.enabled = false;
  }
  host.querySelector("#cube-fly").addEventListener("click", () => { place(state.explode); flyTo(selPos, 9.5); });
  host.querySelector("#cube-home").addEventListener("click", () => flyTo(HOME_TARGET, 0, HOME));
  function stepFly(now) {
    const f = state.fly; if (!f) return;
    const u = Math.min(1, (now - f.t0) / f.dur); const e = 1 - Math.pow(1 - u, 3);
    camera.position.lerpVectors(f.fromP, f.toP, e); controls.target.lerpVectors(f.fromT, f.toT, e); camera.lookAt(controls.target);
    if (u >= 1) { state.fly = null; controls.enabled = true; }
  }

  // ---- picking ----
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(-2, -2); let hoverId = -1; let downAt = null;
  canvas.addEventListener("pointermove", (e) => { const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)); });
  canvas.addEventListener("pointerleave", () => { ptr.set(-2, -2); hoverId = -1; });
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6 && hoverId >= 0) { const c = combos[hoverId]; onPick(c.p.id, c.r.id, c.d.id); } downAt = null; });
  function pick() {
    ray.setFromCamera(ptr, camera); const hit = ray.intersectObject(mesh)[0];
    const id = hit ? hit.instanceId : -1;
    if (id !== hoverId) { hoverId = id; canvas.style.cursor = id >= 0 ? "pointer" : "grab"; if (readout && id >= 0) { const c = combos[id]; readout.textContent = `${c.p.brand} ${c.p.model} + ${c.r.brand} ${c.r.model} + ${c.d.brand} ${c.d.model} — ` + axes.map((a) => `${a.label.toLowerCase()} ${c.pred[a.id]}`).join(" · "); } }
  }

  // ---- loop ----
  let active = false, visible = false, raf = 0, last = 0;
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  function loop(now) {
    if (!active || !visible) { raf = 0; return; }
    raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    resize();
    if (Math.abs(state.target - state.explode) > 0.0005) { state.explode += (state.target - state.explode) * (1 - Math.exp(-dt * 3.2)); place(state.explode); }
    stepFly(now);
    if (controls.enabled) controls.update();
    pick(); placePanes(); placeLabels(); renderer.render(scene, camera);
  }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible && active && !raf) { last = 0; raf = requestAnimationFrame(loop); } }, { threshold: 0.05 }).observe(canvas);
  store.subscribe(() => recolor());
  recolor();
  return { setActive(on) { active = on; if (on && visible && !raf) { last = 0; raf = requestAnimationFrame(loop); } } };
}
