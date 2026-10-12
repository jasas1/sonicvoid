import { loadData, createStore, poolForRole } from "./data.js";
import { initRail, initHeroProgress } from "./motion.js";
import { initAmp } from "./amp3d.js";
import { predict, renderMeters, renderMatrix, renderSpider } from "./matrix.js";
import { initCurves, initRectifier, initTransformer, initAnatomy } from "./bench.js";
import { renderMarket } from "./market.js";
import { initCube } from "./cube.js";
import { initSignal } from "./signal.js";

const $ = (s) => document.querySelector(s);
const data = await loadData();
const store = createStore({ power: "eh-2a3", driver: "eh-6c45pi", rectifier: "sovtek-5u4g", role: "power" });

// data stamp
const stamp = [...(data.listings || []).map((l) => l.fetched_at), data.rates?.date].filter(Boolean).sort().pop();
$("#data-stamp").textContent = stamp || "seed data";

// ---- hero: amp + roll panel ----
const canvas = $("#amp-canvas");
let amp = null;
try {
  amp = initAmp(canvas, data, store, { onSocketClick: (role) => { store.set({ role }); document.getElementById("hero").classList.add("docked"); } });
} catch (err) {
  console.error("3D unavailable", err);
  canvas.replaceWith(Object.assign(document.createElement("div"), { className: "empty", textContent: "3D view unavailable in this browser." }));
}
let heroT = 0; let rail = null;
initHeroProgress((t) => { heroT = t; amp?.setProgress(t); rail?.refresh(); });
canvas.addEventListener("tube-hover", (e) => {
  const d = e.detail; const r = $("#hero-readout");
  if (!d) { const s = store.get(); r.innerHTML = `V5–V8 <b>${name(s.power)}</b><br>V9 <b>${name(s.rectifier)}</b><br>V1–V4 <b>${name(s.driver)}</b>`; return; }
  r.innerHTML = `${d.socket.label} · ${d.socket.role}<br><b>${d.tube.brand} ${d.tube.model}</b><br>${d.tube.construction}, ${d.tube.bottle} bottle`;
});
const name = (id) => { const t = data.byId[id]; return t ? `${t.brand} ${t.model}` : id; };
canvas.dispatchEvent(new CustomEvent("tube-hover", { detail: null }));

const tabs = [...document.querySelectorAll(".socket-tab")];
tabs.forEach((b) => b.addEventListener("click", () => store.set({ role: b.dataset.role })));
const pool = $("#roll-pool");
const meters = renderMeters($("#meters"), data);
const spider = renderSpider($("#spider"), data);
let view = "meters"; try { view = localStorage.getItem("av-view") || "meters"; } catch {}
const viewBtns = [...document.querySelectorAll(".view-toggle .seg-btn")];
function applyView() { $("#meters").hidden = view !== "meters"; $("#spider").hidden = view !== "spider"; viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view))); }
viewBtns.forEach((b) => b.addEventListener("click", () => { view = b.dataset.view; try { localStorage.setItem("av-view", view); } catch {} applyView(); }));
applyView();

// the roll panel follows the reader: it lives in the hero while the hero is on screen, then moves to a fixed dock
const panel = $("#roll"); const heroSticky = panel.parentElement; const dock = $("#roll-dock"); const heroEl = $("#hero"); const changeBtn = $("#roll-change");
let inDock = false;
new IntersectionObserver((entries) => {
  const heroVisible = entries[0].isIntersecting;
  if (!heroVisible && !inDock) { dock.appendChild(panel); inDock = true; dock.classList.add("on"); panel.classList.add("compact"); document.body.classList.add("dock-on"); }
  else if (heroVisible && inDock) { heroSticky.appendChild(panel); inDock = false; dock.classList.remove("on", "expanded"); panel.classList.remove("compact"); changeBtn.setAttribute("aria-expanded", "false"); document.body.classList.remove("dock-on"); }
}, { threshold: 0 }).observe(heroEl);
changeBtn.addEventListener("click", () => { const ex = dock.classList.toggle("expanded"); panel.classList.toggle("compact", !ex); changeBtn.setAttribute("aria-expanded", String(ex)); });
let pulseTimer = 0;
function pulseDock() { dock.classList.add("pulse"); clearTimeout(pulseTimer); pulseTimer = setTimeout(() => dock.classList.remove("pulse"), 1200); }
function renderPool(st) {
  tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.role === st.role ? "true" : "false"));
  const list = poolForRole(data, st.role); const nos = list.filter((t) => t.status === "nos").length;
  $("#pool-count").textContent = `${list.length} tubes · ${nos} NOS · scroll`;
  pool.innerHTML = list.map((t) => `<button type="button" class="chip" role="option" data-id="${t.id}" aria-selected="${st[st.role] === t.id}"><i class="dot ${t.status}"></i>${t.brand} ${t.model}</button>`).join("");
}
pool.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) store.set({ [store.get().role]: b.dataset.id }); });
store.subscribe((st) => {
  renderPool(st);
  const p = predict(st, data);
  meters.set(p.axes); spider.set(p.axes);
  $("#dock-summary").textContent = `${name(st.power)} · ${name(st.rectifier)} · ${name(st.driver)}`;
  $("#verdict").textContent = p.sentence;
  $("#basis").textContent = `${name(st.power)} ×4 · ${name(st.rectifier)} · ${name(st.driver)} ×4 — ${p.n_sources ? p.n_sources + " verified claims" : "seed priors, 0 verified claims yet"}${p.seeded ? " · heuristic, not a measurement" : ""}`;
  canvas.dispatchEvent(new CustomEvent("tube-hover", { detail: null }));
});

// ---- sockets sheet ----
$("#socket-sheet").innerHTML = Object.entries(data.amp.families).map(([fam, f]) => {
  const poolList = data.tubes.filter((t) => (fam === "5U4G" ? t.family === "5U4G" || t.family === "274B" : t.family === fam));
  return `<div class="socket-row">
    <div class="fam">${fam === "5U4G" ? "5U4G<br>274B" : fam}<small>× ${f.count} · ${f.role}</small></div>
    <dl><dt>Role</dt><dd>${f.note}</dd><dt>Matched set</dt><dd><b>${f.matched}</b></dd></dl>
    <dl><dt>Sockets</dt><dd>${data.amp.sockets.filter((s) => s.family === fam).map((s) => s.label).join(", ")}</dd><dt>Fits</dt><dd>${fam === "5U4G" ? "5U4G, 5U4GB, 274B (octal, 5 V)" : fam === "2A3" ? "2A3 types only (UX4, 2.5 V filament)" : "6C45 / 6S45P-E / 6C45Pi (noval)"}</dd><dt>Does not fit</dt><dd>${fam === "5U4G" ? "GZ34 / 5AR4 and 4-pin 5Z3 unverified; never a 300B-amp 5 V rectifier with a bigger first capacitor than the manual allows" : fam === "2A3" ? "300B (5 V filament), 45, 2A3-size tubes with other bases" : "WE 417A / 5842 (different pinout and heater; not listed by Woo)"}</dd></dl>
    <div><dt class="mono" style="font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)">Pool (${poolList.length})</dt><div class="pool-list">${poolList.map((t) => `<span class="${t.status}">${t.brand} ${t.model}</span>`).join("")}</div></div>
  </div>`;
}).join("");
if (data.amp.facts?.length) $("#amp-facts-note").innerHTML = data.amp.facts.slice(0, 6).map((f) => `${f.claim} <a href="${f.url}" target="_blank" rel="noopener">source</a>`).join("<br>");

// ---- matrix ----
renderMatrix($("#matrix-grid"), data, store, { readout: $("#matrix-readout"), onPick: (power, rectifier) => {
  store.set({ power, rectifier, role: "power" });
  if (inDock) { pulseDock(); return; } // the dock updates in place; the reader keeps their place on the page
  const hero = document.getElementById("hero");
  window.scrollTo({ top: hero.offsetTop + hero.offsetHeight - window.innerHeight, behavior: "smooth" });
} });

// ---- combinations: cube view ----
let cube = null;
const comboBtns = [...document.querySelectorAll(".combo-toggle .seg-btn")];
function setCombo(v) {
  comboBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.combo === v)));
  $("#combo-grid").hidden = v !== "grid"; $("#combo-cube").hidden = v !== "cube";
  if (v === "cube" && !cube) {
    try { cube = initCube($("#cube-canvas"), data, store, { readout: $("#matrix-readout"), host: $("#cube-controls"), onPick: (power, rectifier, driver) => { store.set({ power, rectifier, driver, role: "power" }); if (inDock) pulseDock(); } }); }
    catch (err) { console.error("cube unavailable", err); $("#combo-cube").innerHTML = '<p class="empty">3D view unavailable in this browser.</p>'; }
  }
  cube?.setActive(v === "cube");
}
comboBtns.forEach((b) => b.addEventListener("click", () => setCombo(b.dataset.combo)));

// ---- bench ----
initSignal($("#signal-figure"));
const curves = initCurves(data, { canvas: $("#curves-canvas"), vp: $("#r-vp"), vg: $("#r-vg"), rl: $("#r-rl"), ovp: $("#o-vp"), ovg: $("#o-vg"), orl: $("#o-rl"), w40: $("#c-40w"), readout: $("#curves-readout") });
initRectifier(data, { canvas: $("#rect-canvas"), vpk: $("#r-vpk"), il: $("#r-il"), ovpk: $("#o-vpk"), oil: $("#o-il"), burst: $("#b-burst"), readout: $("#rect-readout") });
initTransformer(data, { canvas: $("#xfmr-canvas"), zs: $("#s-zs"), rpp: $("#r-rpp"), lp: $("#r-lp"), ll: $("#r-ll"), orpp: $("#o-rpp"), olp: $("#o-lp"), oll: $("#o-ll"), readout: $("#xfmr-readout") }, curves);
initAnatomy($("#anatomy-svg"), $("#anatomy-note"), [...document.querySelectorAll(".seg-btn")]);

// ---- market ----
renderMarket(data, { filters: $("#market-filters"), body: $("#market-body"), note: $("#market-note"), count: $("#market-count") });

// ---- library (teaser; the full entries live in library.html) ----
const UNITS = { filament_v: "V", filament_a: "A", max_plate_v: "V", max_plate_w: "W", mu: "", rp_ohm: "Ω", gm_ma_v: "mA/V", max_dc_output_ma: "mA", max_piv_v: "V", voltage_drop_v: "V" };
const LABEL = { filament_v: "filament", filament_a: "filament", max_plate_v: "max plate", max_plate_w: "plate diss.", mu: "μ", rp_ohm: "rp", gm_ma_v: "gm", max_dc_output_ma: "max DC out", max_piv_v: "max PIV", voltage_drop_v: "drop" };
$("#kb").innerHTML = ["2A3", "6C45", "5U4G", "274B"].map((fam) => {
  const kb = data.kb?.[fam]; const lore = (data.lore || []).filter((c) => (c.families || []).includes(fam));
  const body = kb ? `
    <div class="spec-grid">${Object.entries(kb.datasheet || {}).filter(([k, v]) => typeof v === "number" && LABEL[k]).slice(0, 6).map(([k, v]) => `<div><span>${LABEL[k]}</span><b>${v} ${UNITS[k] || ""}</b></div>`).join("")}</div>
    <p style="margin-top:.6rem">${(kb.makers || []).length} current makers · ${(kb.nos || []).length} NOS lines · ${(kb.warnings || []).length} warnings · ${lore.length} owner claims · <a href="library.html#kb-${fam.toLowerCase()}">open the ${fam} entry</a></p>`
    : `<p class="pending">Entry pending: the ${fam} research lane has not passed yet.</p>`;
  return `<div class="kb-entry" id="kb-${fam.toLowerCase()}"><div class="fam">${fam}<small>${data.amp.families[fam === "274B" ? "5U4G" : fam]?.role || "rectifier"}</small></div><div class="kb-body">${body}</div></div>`;
}).join("");

rail = initRail(() => heroT);
