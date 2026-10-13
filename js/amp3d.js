// The amp, lit: a procedural three.js WA33 with nine swappable tubes.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { reducedMotion } from "./data.js";

const BOTTLES = {
  st:       [[0.012, 0], [0.015, 0.004], [0.017, 0.02], [0.021, 0.045], [0.024, 0.07], [0.024, 0.1], [0.021, 0.118], [0.014, 0.128], [0.006, 0.132], [0, 0.133]],
  globe:    [[0.012, 0], [0.014, 0.004], [0.016, 0.012], [0.024, 0.03], [0.029, 0.06], [0.027, 0.09], [0.02, 0.11], [0.01, 0.12], [0, 0.122]],
  straight: [[0.012, 0], [0.019, 0.004], [0.02, 0.02], [0.02, 0.11], [0.017, 0.124], [0.009, 0.13], [0, 0.131]],
  noval:    [[0.008, 0], [0.011, 0.002], [0.011, 0.05], [0.009, 0.058], [0.004, 0.062], [0, 0.063]],
};
const SCALE = { power: 1.0, rectifier: 1.08, driver: 1.0 };
const GLOW = { power: 0.11, rectifier: 0.09, driver: 0.05 };

function roundedBox(w, h, d, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,220,160,1)"); g.addColorStop(0.25, "rgba(255,160,70,0.55)"); g.addColorStop(0.6, "rgba(255,110,30,0.12)"); g.addColorStop(1, "rgba(255,90,20,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function meshTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d"); ctx.fillStyle = "rgba(0,0,0,0)"; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(120,115,105,1)"; ctx.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 10); return t;
}

function slotTexture() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 160;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 64, 160);
  ctx.fillStyle = "#000"; for (let i = 0; i < 5; i++) { ctx.fillRect(18, 18 + i * 27, 10, 14); ctx.fillRect(36, 18 + i * 27, 10, 14); }
  const t = new THREE.CanvasTexture(c); return t;
}

function envScene() {
  // A small lit room for glass reflections: one warm panel, one cool panel, dark walls.
  const s = new THREE.Scene(); s.background = new THREE.Color(0x05040a);
  const mk = (c, i, x, y, z, w, h, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c })); m.material.color.multiplyScalar(i); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); };
  mk(0xffb070, 3.5, -2, 1.2, 0, 1.2, 2.4, Math.PI / 2);
  mk(0x7f9bb8, 1.2, 2, 1.0, -0.5, 1.0, 2.0, -Math.PI / 2);
  mk(0xfff0d8, 0.8, 0, 2.5, 0, 2.0, 2.0, 0);
  s.children[2].rotation.x = Math.PI / 2;
  return s;
}

export function initAmp(canvas, data, store, { onSocketClick } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070605);
  scene.fog = new THREE.FogExp2(0x070605, 0.9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene(), 0.02).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enableZoom = false; controls.enablePan = false;
  controls.minPolarAngle = 0.15; controls.maxPolarAngle = 1.35; controls.enabled = false;

  // chassis (from Woo's Gen 2 photos): the amplifier block floats on four pillars above the power block; brushed black aluminium
  const W = 0.4445, D = 0.3048, HB = 0.083, GAP = 0.024;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.95, roughness: 0.28 });
  const black = new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.6, roughness: 0.4 });
  const blackTop = new THREE.MeshStandardMaterial({ color: 0x202226, metalness: 0.72, roughness: 0.34 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.85, roughness: 0.3 });
  const upper = new THREE.Mesh(roundedBox(W, HB, D, 0.008), blackTop); upper.position.y = -HB; scene.add(upper);
  const lower = new THREE.Mesh(roundedBox(W, HB, D, 0.008), black); lower.position.y = -(2 * HB + GAP); scene.add(lower);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, GAP, 24), black); p.position.set(sx * (W / 2 - 0.03), -HB - GAP / 2, sz * (D / 2 - 0.03)); scene.add(p); });
  const faceZ = D / 2 + 0.001;
  // upper face: two small knobs, the volume knob, two small knobs
  [[-0.17, 0.011], [-0.095, 0.011], [0, 0.021], [0.095, 0.011], [0.17, 0.011]].forEach(([x, r]) => {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.016, 48), black); k.rotation.x = Math.PI / 2; k.position.set(x, -HB / 2, faceZ + 0.008); scene.add(k);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0015, r * 0.6, 0.0015), steel); mark.position.set(x, -HB / 2 + r * 0.55, faceZ + 0.0165); scene.add(mark);
  });
  // lower face: gold plate with 4-pin XLR, 6.35 mm, power ring, 4.4 mm, XLR
  const plateY = -(HB + GAP + HB / 2);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.002), gold); plate.position.set(0, plateY, faceZ); scene.add(plate);
  const port = (x, r, inner) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.2, 12, 40), steel); ring.position.set(x, plateY, faceZ + 0.0015); scene.add(ring); const hole = new THREE.Mesh(new THREE.CircleGeometry(inner, 32), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 })); hole.position.set(x, plateY, faceZ + 0.0012); scene.add(hole); };
  port(-0.078, 0.0075, 0.006); port(-0.045, 0.0045, 0.003); port(0.045, 0.0045, 0.003); port(0.078, 0.0075, 0.006);
  const power = new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0015, 12, 40), new THREE.MeshBasicMaterial({ color: 0xff3a1a })); power.position.set(0, plateY, faceZ + 0.0015); scene.add(power);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.004, 24), new THREE.MeshBasicMaterial({ color: 0x2a0806 })); led.position.set(0, plateY, faceZ + 0.0012); scene.add(led);
  const bench = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.9, metalness: 0 })); bench.rotation.x = -Math.PI / 2; bench.position.y = -(2 * HB + GAP) - 0.0005; scene.add(bench);
  scene.add(new THREE.HemisphereLight(0x55606f, 0x0a0806, 0.75));
  const key = new THREE.DirectionalLight(0xd6dde8, 0.9); key.position.set(-0.6, 0.8, 0.5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe2b8, 0.6); fill.position.set(0.5, 0.4, 0.9); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fb3cc, 0.5); rim.position.set(0.2, 0.6, -1); scene.add(rim);

  const glowTex = glowTexture(); const meshTex = meshTexture(); const slotTex = slotTexture();
  const lights = { power: new THREE.PointLight(0xff9a3c, 0, 0.9, 1.6), driver: new THREE.PointLight(0xffc27a, 0, 0.5, 1.8), rectifier: new THREE.PointLight(0xff9a3c, 0, 0.6, 1.6) };
  lights.power.position.set(0, 0.17, -0.04); lights.driver.position.set(0, 0.08, 0.03); lights.rectifier.position.set(0, 0.16, -0.005);
  Object.values(lights).forEach((l) => scene.add(l));
  const LIGHT_MAX = { power: 1.25, driver: 0.45, rectifier: 0.7 };

  const sockets = data.amp.sockets.map((s) => {
    const group = new THREE.Group(); group.position.fromArray(s.pos); group.userData = { socket: s };
    const R = s.role === "driver" ? 0.013 : 0.021;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.003, 40), black); base.position.y = -0.0015; group.add(base);
    for (let i = 0; i < 8; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.002, 8), new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.8, roughness: 0.4 })); const a = (i / 8) * Math.PI * 2; h.position.set(Math.cos(a) * R * 0.82, 0.0005, Math.sin(a) * R * 0.82); group.add(h); }
    scene.add(group);
    return { socket: s, group, tube: null, glow: null, filament: null };
  });

  function buildTube(tube, role) {
    const sc = SCALE[role];
    const profile = BOTTLES[tube.bottle] || BOTTLES.st;
    const pts = profile.map(([r, y]) => new THREE.Vector2(r * sc, y * sc));
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshPhysicalMaterial({ color: 0xfaf6f0, metalness: 0, roughness: 0.06, transmission: 0.97, thickness: 0.003, ior: 1.5, transparent: true, envMapIntensity: 2.0, clearcoat: 1, clearcoatRoughness: 0.08 }));
    glass.position.y = 0.012 * sc; g.add(glass);
    const isNoval = tube.bottle === "noval";
    const baseH = isNoval ? 0.004 : 0.014;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(pts[0].x, pts[0].x * 0.96, baseH, 32), new THREE.MeshStandardMaterial({ color: 0x121010, roughness: 0.35, metalness: 0.2 }));
    base.position.y = baseH / 2 + 0.003; g.add(base);
    const isMesh = /mesh/i.test(tube.construction || "");
    const plateH = (isNoval ? 0.022 : 0.05) * sc, plateW = (isNoval ? 0.008 : 0.02) * sc, plateD = (isNoval ? 0.006 : 0.012) * sc;
    const plateMat = isMesh
      ? new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.3, color: 0x8a8278, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.7, metalness: 0.4, alphaMap: isNoval ? null : slotTex, transparent: !isNoval, alphaTest: 0.5, side: THREE.DoubleSide });
    const plateY = (isNoval ? 0.03 : 0.065) * sc;
    if (role === "rectifier") { // full-wave rectifier: two tall narrow plates side by side (Takatsuki TA-274B reference)
      [-1, 1].forEach((side) => { const p = new THREE.Mesh(new THREE.BoxGeometry(plateW * 0.42, plateH * 1.05, plateD * 0.7), plateMat); p.position.set(side * plateW * 0.3, plateY, 0); g.add(p); });
    } else {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), plateMat); plate.position.y = plateY; g.add(plate);
    }
    const topMica = new THREE.Mesh(new THREE.CylinderGeometry(pts[isNoval ? 2 : 4].x * 0.9, pts[isNoval ? 2 : 4].x * 0.9, 0.0008, 24), new THREE.MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.9, transparent: true, opacity: 0.6 }));
    topMica.position.y = plateY + plateH / 2 + 0.003; g.add(topMica);
    const getter = new THREE.Mesh(new THREE.SphereGeometry(pts[pts.length - 3].x * 0.9, 24, 12, 0, Math.PI * 2, 0, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 1, roughness: 0.15 }));
    getter.position.y = pts[pts.length - 1].y - 0.004; getter.rotation.x = Math.PI; g.add(getter);
    const thoriated = /thoriated/i.test(tube.construction || "");
    const fColor = new THREE.Color(thoriated ? 0xfff4dc : 0xffb050);
    const fil = new THREE.Group();
    const n = isNoval ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0007 * sc, 0.0007 * sc, plateH * 0.8, 6), new THREE.MeshBasicMaterial({ color: fColor }));
      f.position.set((i - (n - 1) / 2) * plateW * 0.3, plateY, 0); fil.add(f);
    }
    g.add(fil);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: thoriated ? 0xfff0d0 : 0xff9a3c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    const gs = GLOW[role] * 0.7 * (isMesh ? 1.25 : 1) * (tube.bottle === "globe" ? 1.15 : 1);
    glow.scale.set(gs, gs, 1); glow.position.y = plateY; g.add(glow);
    g.traverse((o) => { o.userData.tubeRoot = g; });
    return { g, glow, fil, fColor };
  }

  function setTube(role, tubeId) {
    const tube = data.byId[tubeId]; if (!tube) return;
    sockets.filter((s) => s.socket.role === role).forEach((s) => {
      if (s.tube) { s.group.remove(s.tube); s.tube.traverse((o) => { o.geometry?.dispose?.(); }); }
      const built = buildTube(tube, role);
      s.tube = built.g; s.glow = built.glow; s.filament = built.fil; s.group.add(built.g); s.tubeData = tube;
    });
  }
  const initial = store.get();
  setTube("power", initial.power); setTube("driver", initial.driver); setTube("rectifier", initial.rectifier);
  store.subscribe((st) => { ["power", "driver", "rectifier"].forEach((r) => { const cur = sockets.find((s) => s.socket.role === r); if (cur && cur.tubeData?.id !== st[r]) setTube(r, st[r]); }); });

  // camera path (scroll-driven), with mouse parallax
  const path = { p: 0 }; let docked = false;
  const pathTarget = new THREE.Vector3(); const pathPos = new THREE.Vector3();
  const mouse = { x: 0, y: 0 }; const pointer = new THREE.Vector2(-2, -2);
  function cameraFromPath(p) {
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const fit = Math.max(1, 1.75 / camera.aspect);
    const narrow = camera.aspect < 1.2; // mobile: no side panel, keep the amp centred
    pathPos.set(THREE.MathUtils.lerp(0.22, 0.0, e) * fit, THREE.MathUtils.lerp(0.14, narrow ? 0.52 : 0.74, e) * fit, THREE.MathUtils.lerp(0.68, narrow ? 0.40 : 0.56, e) * fit);
    pathTarget.set(narrow ? 0 : THREE.MathUtils.lerp(0.07, 0.15, e), THREE.MathUtils.lerp(-0.04, 0.0, e), THREE.MathUtils.lerp(-0.02, -0.02, e));
    pathPos.x += mouse.x * 0.03 * (1 - e); pathPos.y += -mouse.y * 0.015 * (1 - e);
    camera.position.copy(pathPos); camera.lookAt(pathTarget);
  }
  function setProgress(p) {
    path.p = p;
    const nowDocked = p >= 0.985;
    if (nowDocked && !docked) { cameraFromPath(1); controls.target.copy(pathTarget); controls.enabled = true; }
    if (!nowDocked && docked) controls.enabled = false;
    docked = nowDocked;
  }
  canvas.addEventListener("pointermove", (ev) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1; mouse.y = ((ev.clientY - r.top) / r.height) * 2 - 1;
    pointer.set(mouse.x, -mouse.y);
  });
  canvas.addEventListener("pointerleave", () => { pointer.set(-2, -2); mouse.x = 0; mouse.y = 0; });

  // picking
  const ray = new THREE.Raycaster(); let hover = null; let downAt = null;
  function pick() {
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(sockets.map((s) => s.tube).filter(Boolean), true);
    const root = hits[0]?.object.userData.tubeRoot || null;
    const found = root ? sockets.find((s) => s.tube === root) : null;
    if (found !== hover) { hover = found; canvas.classList.toggle("hit", !!found); canvas.dispatchEvent(new CustomEvent("tube-hover", { detail: found ? { socket: found.socket, tube: found.tubeData } : null })); }
  }
  canvas.addEventListener("pointerdown", (ev) => { downAt = [ev.clientX, ev.clientY]; });
  canvas.addEventListener("pointerup", (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) { downAt = null; return; }
    downAt = null; pick();
    if (hover && onSocketClick) onSocketClick(hover.socket.role, hover.socket);
  });

  // socket map: V1–V9 labels projected above each tube, shown while docked
  const labelHost = document.getElementById("socket-labels");
  const labels = sockets.map((s) => { const el = document.createElement("span"); el.className = "socket-label"; labelHost?.appendChild(el); return el; });
  const lv = new THREE.Vector3();
  function placeLabels() {
    if (!labelHost || !docked) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    sockets.forEach((s, i) => {
      lv.set(s.socket.pos[0], s.socket.role === "driver" ? 0.075 : 0.15, s.socket.pos[2]).project(camera);
      const x = (lv.x * 0.5 + 0.5) * w, y = (-lv.y * 0.5 + 0.5) * h;
      labels[i].style.transform = `translate(${x.toFixed(1)}px, ${(y - 28).toFixed(1)}px) translate(-50%, -100%)`;
      labels[i].innerHTML = `<b>${s.socket.label}</b> ${s.tubeData?.family || s.socket.family}`;
    });
  }
  // warm-up
  const t0 = performance.now(); const warmSecs = reducedMotion() ? 0.01 : 2.6;
  let visible = true; let raf = 0;
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible && !raf) loop(); }, { threshold: 0.01 });
  io.observe(canvas);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  let last = performance.now();
  function loop() {
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    resize();
    const warm = Math.min(1, (now - t0) / 1000 / warmSecs);
    const w = 1 - Math.pow(1 - warm, 3);
    const flicker = reducedMotion() ? 1 : 1 + 0.03 * Math.sin(now / 90) * Math.sin(now / 230);
    sockets.forEach((s) => { if (s.glow) s.glow.material.opacity = 0.6 * w * flicker; if (s.filament) s.filament.children.forEach((f) => f.material.color.copy(s.tube ? f.material.color : f.material.color)); });
    Object.entries(lights).forEach(([role, l]) => { l.intensity = LIGHT_MAX[role] * w * flicker; });
    if (controls.enabled) controls.update(); else cameraFromPath(path.p);
    placeLabels();
    pick();
    renderer.render(scene, camera);
  }
  loop();
  window.addEventListener("resize", resize);
  return { setProgress, setTube, sockets };
}
