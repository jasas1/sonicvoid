// The tube cube: driver x power x rectifier lattice of predicted profiles, with an "explode" into character space.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { predict } from "./matrix.js";
import { reducedMotion } from "./data.js";

const COOL = new THREE.Color(0x5b7698), WARM = new THREE.Color(0xf26a32), DIM = new THREE.Color(0x15171a);
const HOME = new THREE.Vector3(34, 26, 50);

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
  scene.add(new THREE.HemisphereLight(0xe4e9f0, 0x0b0a08, 1.25));
  const key = new THREE.DirectionalLight(0xffe6c8, 1.3); key.position.set(10, 20, 12); scene.add(key);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.66, 0.66), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.12, transparent: true, opacity: 0.92 }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(nP * S, nR * S, nD * S)), new THREE.LineBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0.9 })); scene.add(frame);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35 })); scene.add(glow);

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
    mesh.instanceMatrix.needsUpdate = true;
    frame.material.opacity = 0.9 * (1 - t); frame.visible = t < 0.99;
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
  const labels = []; // {el, pos, group, axis, index, id}
  const mkLabel = (text, pos, group, axis, index, id) => { const el = document.createElement("span"); el.className = `cube-lab ${group} ${axis}`; el.textContent = text; overlay.appendChild(el); const L = { el, pos, group, axis, index, id }; labels.push(L); return L; };
  powers.forEach((p, pi) => mkLabel(`${p.brand} ${p.model}`, new THREE.Vector3((pi - (nP - 1) / 2) * S, -(nR / 2) * S - 0.5, (nD / 2) * S + 0.5), "lattice", "x", pi, p.id));
  rects.forEach((r, ri) => mkLabel(`${r.brand} ${r.model}`, new THREE.Vector3((nP / 2) * S + 0.5, (ri - (nR - 1) / 2) * S, (nD / 2) * S + 0.5), "lattice", "y", ri, r.id));
  drivers.forEach((d, di) => mkLabel(`${d.brand} ${d.model}`, new THREE.Vector3(-(nP / 2) * S - 0.5, -(nR / 2) * S - 0.5, (di - (nD - 1) / 2) * S), "lattice", "z", di, d.id));
  mkLabel("2A3 →", new THREE.Vector3(0, -(nR / 2) * S - 4.2, (nD / 2) * S + 0.5), "lattice", "title", 0);
  mkLabel("rectifier ↑", new THREE.Vector3((nP / 2) * S + 5.5, 0, (nD / 2) * S + 0.5), "lattice", "title", 0);
  mkLabel("driver ⤢", new THREE.Vector3(-(nP / 2) * S - 3.4, -(nR / 2) * S - 2.4, 0), "lattice", "title", 0);
  function buildSpaceLabels() {
    labels.filter((L) => L.group === "space").forEach((L) => L.el.remove());
    for (let i = labels.length - 1; i >= 0; i--) if (labels[i].group === "space") labels.splice(i, 1);
    const ax = axes.find((a) => a.id === state.ex), ay = axes.find((a) => a.id === state.ey), az = axes.find((a) => a.id === state.ez);
    [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]].forEach(([x, y, z], i) => {
      mkLabel(`${x < 0 ? ax.low : ax.high} · ${y < 0 ? ay.low : ay.high} · ${z < 0 ? az.low : az.high}`, new THREE.Vector3(x * (nP / 2) * S * 1.08, y * (nR / 2) * S * 1.1, z * nD * S * 1.1 * 1.12), "space", "corner", i);
    });
    mkLabel(`${ax.label} →`, new THREE.Vector3(0, -(nR / 2) * S - 2.4, nD * S * 1.3), "space", "title", 0);
    mkLabel(`${ay.label} ↑`, new THREE.Vector3((nP / 2) * S + 3, 0, nD * S * 1.3), "space", "title", 0);
    mkLabel(`${az.label} ⤢`, new THREE.Vector3(-(nP / 2) * S - 2.2, -(nR / 2) * S - 2.4, 0), "space", "title", 0);
    noteEl.textContent = `corners are the pool's own extremes on ${ax.label.toLowerCase()}, ${ay.label.toLowerCase()} and ${az.label.toLowerCase()}`;
  }
  buildSpaceLabels();
  function markSelectedLabels() { const s = store.get(); labels.forEach((L) => L.el.classList.toggle("sel", L.id === s.power || L.id === s.rectifier || L.id === s.driver)); }
  markSelectedLabels();
  const pv = new THREE.Vector3();
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight; const t = state.explode;
    const stride = { x: 1, y: 1, z: 1 };
    // thinning: measure the projected gap between the first two labels of each lattice axis
    for (const axis of ["x", "y", "z"]) {
      const L = labels.filter((l) => l.group === "lattice" && l.axis === axis);
      if (L.length < 2) continue;
      const a = pv.copy(L[0].pos).project(camera), ax = (a.x * 0.5 + 0.5) * w, ay = (-a.y * 0.5 + 0.5) * h;
      const b = pv.copy(L[1].pos).project(camera), bx = (b.x * 0.5 + 0.5) * w, by = (-b.y * 0.5 + 0.5) * h;
      const gap = Math.hypot(bx - ax, by - ay); stride[axis] = Math.max(1, Math.ceil(13 / Math.max(1, gap)));
    }
    noteEl.style.opacity = t;
    labels.forEach((L) => {
      pv.copy(L.pos).project(camera);
      const x = (pv.x * 0.5 + 0.5) * w, y = (-pv.y * 0.5 + 0.5) * h;
      const alpha = L.group === "lattice" ? 1 - t : t;
      const thinned = L.group === "lattice" && ["x", "y", "z"].includes(L.axis) && (L.index % stride[L.axis] !== 0) && !L.el.classList.contains("sel");
      const show = alpha > 0.05 && pv.z < 1 && !thinned && x > -40 && x < w + 40 && y > -20 && y < h + 20;
      L.el.style.opacity = show ? alpha : 0;
      if (show) L.el.style.transform = L.axis === "x" ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(-90deg) translate(-100%, -50%)` : L.axis === "y" ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(0, -50%)` : `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
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
  host.querySelector("#cube-home").addEventListener("click", () => flyTo(new THREE.Vector3(0, 0, 0), 0, HOME));
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
    pick(); placeLabels(); renderer.render(scene, camera);
  }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible && active && !raf) { last = 0; raf = requestAnimationFrame(loop); } }, { threshold: 0.05 }).observe(canvas);
  store.subscribe(() => recolor());
  recolor();
  return { setActive(on) { active = on; if (on && visible && !raf) { last = 0; raf = requestAnimationFrame(loop); } } };
}
