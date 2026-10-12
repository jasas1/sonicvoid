// Scroll orchestration: section reveals, rail highlighting, hero progress.
import { reducedMotion } from "./data.js";

export function initReveals() {
  const targets = document.querySelectorAll(".sheet-title, .lede, .socket-row, .bench-card, .kb-entry, .matrix-wrap, .table-wrap, .filters");
  targets.forEach((el) => el.classList.add("reveal"));
  if (reducedMotion()) { targets.forEach((el) => el.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
  targets.forEach((el) => io.observe(el));
}

export function initRail(getHeroProgress = () => 0) {
  const links = [...document.querySelectorAll(".rail a[data-nav]")];
  const sections = links.filter((a) => a.dataset.nav !== "roll").map((a) => document.getElementById(a.dataset.nav === "top" ? "hero" : a.dataset.nav)).filter(Boolean);
  const setCurrent = (id) => links.forEach((a) => a.setAttribute("aria-current", (a.dataset.nav === id || (id === "hero" && a.dataset.nav === "top")) ? "true" : "false"));
  let current = "hero";
  const apply = () => setCurrent(current === "hero" && getHeroProgress() > 0.55 ? "roll" : current);
  const io = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) { current = visible.target.id; apply(); }
  }, { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.2, 0.5] });
  sections.forEach((s) => io.observe(s));
  apply();
  return { refresh: apply };
}

/** Calls onProgress(t) with t in [0,1] as the hero scrolls through its sticky range. */
export function initHeroProgress(onProgress) {
  const hero = document.getElementById("hero");
  let last = -1;
  const compute = () => {
    const rect = hero.getBoundingClientRect();
    const range = hero.offsetHeight - window.innerHeight;
    const t = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1;
    if (t !== last) { last = t; onProgress(t); hero.classList.toggle("docked", t > 0.55); }
  };
  if (reducedMotion() || window.matchMedia("(max-width: 860px)").matches) {
    hero.classList.add("docked");
    onProgress(0.72);
    return;
  }
  window.addEventListener("scroll", compute, { passive: true });
  window.addEventListener("resize", compute);
  compute();
  // deep link: #roll lands on the docked roll panel (the rail's Roll link uses it)
  const toDock = () => { if (location.hash === "#roll") { const top = hero.offsetTop + hero.offsetHeight - window.innerHeight; window.scrollTo({ top, behavior: "auto" }); compute(); } };
  window.addEventListener("hashchange", toDock);
  toDock();
}
