import { loadData } from "./data.js";
import { initRail } from "./motion.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const UNITS = { filament_v: "V", filament_a: "A", max_plate_v: "V", max_plate_w: "W", mu: "", rp_ohm: "Ω", gm_ma_v: "mA/V", max_dc_output_ma: "mA", max_piv_v: "V", voltage_drop_v: "V", max_ac_v_per_plate: "V", max_input_cap_uf: "µF", peak_plate_ma: "mA" };
const LABEL = { filament_v: "filament", filament_a: "filament current", max_plate_v: "max plate", max_plate_w: "plate dissipation", mu: "μ", rp_ohm: "rp", gm_ma_v: "gm", max_dc_output_ma: "max DC out", max_piv_v: "max PIV", voltage_drop_v: "drop at rated current", max_ac_v_per_plate: "AC per plate", max_input_cap_uf: "first capacitor", peak_plate_ma: "peak plate" };
const ROLE = { "2A3": "power · ×4", "6C45": "driver · ×4", "5U4G": "rectifier · ×1 (stock)", "274B": "rectifier · ×1 (upgrade)" };

/** Tiny markdown renderer: headings, paragraphs, lists, bold, italics, links, inline code. Enough for the worker reports. */
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out = []; let list = null; let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const endList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)/.exec(line);
    if (h) { flush(); endList(); const lvl = Math.min(4, h[1].length + 2); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)/.exec(line);
    if (li) { flush(); const kind = /^\s*\d+\./.test(line) ? "ol" : "ul"; if (list !== kind) { endList(); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (!line.trim()) { flush(); endList(); continue; }
    if (/^\|/.test(line)) { continue; } // skip tables; the structured fields cover them
    para.push(line.trim());
  }
  flush(); endList();
  return out.join("\n");
}

const data = await loadData();
$("#data-stamp").textContent = data.rates?.date || "";
const fams = ["2A3", "6C45", "5U4G", "274B"];
const sections = await Promise.all(fams.map(async (fam) => {
  const kb = data.kb?.[fam];
  let narrative = "";
  if (kb?.sources_url) { try { const r = await fetch(kb.sources_url); if (r.ok) narrative = md(await r.text()); } catch {} }
  const lore = (data.lore || []).filter((c) => (c.families || []).includes(fam));
  if (!kb) return `<section class="sheet" id="kb-${fam.toLowerCase()}"><h2 class="sheet-title">${fam}</h2><p class="pending">Entry pending: the ${fam} research lane has not passed yet.</p></section>`;
  const specs = Object.entries(kb.datasheet || {}).filter(([, v]) => typeof v === "number");
  const op = kb.datasheet?.typical_op;
  return `<section class="sheet kb-page" id="kb-${fam.toLowerCase()}">
    <h2 class="sheet-title">${fam} <small>${ROLE[fam] || ""}</small></h2>
    <div class="kb-page-grid">
      <div class="kb-page-side">
        <h4>Datasheet</h4>
        <div class="spec-grid spec-grid-col">${specs.map(([k, v]) => `<div><span>${LABEL[k] || k.replace(/_/g, " ")}</span><b>${v} ${UNITS[k] || ""}</b></div>`).join("")}</div>
        ${op ? `<h4>Typical operating point</h4><div class="spec-grid spec-grid-col">${Object.entries(op).map(([k, v]) => `<div><span>${k.replace(/_/g, " ")}</span><b>${v}</b></div>`).join("")}</div>` : ""}
        ${kb.base || kb.heating ? `<p class="fine">${[kb.base, kb.heating].filter(Boolean).join(" · ")}</p>` : ""}
        ${(kb.warnings || []).length ? `<h4>Warnings</h4><ul class="warn-list">${kb.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="kb-page-main">
        <h4>Current production</h4>
        <table class="makers"><tbody>${(kb.makers || []).map((m) => `<tr><th scope="row">${esc(m.brand)}</th><td>${esc((m.models || []).join(", "))}</td><td>${esc(m.construction)}</td><td>${esc(m.country)}</td></tr>`).join("")}</tbody></table>
        <h4>NOS</h4>
        <table class="makers"><tbody>${(kb.nos || []).map((n) => `<tr><th scope="row">${esc(n.brand)}</th><td>${esc(n.variant)}</td><td>${esc(n.era || "")}</td><td>${esc(n.notes || "")}</td></tr>`).join("")}</tbody></table>
        ${kb.wa33_fit ? `<h4>In the WA33</h4><p>${esc(kb.wa33_fit.notes)}</p>` : ""}
        ${(kb.sonic_lore || []).length ? `<h4>Sonic lore by model</h4>${kb.sonic_lore.map((s) => `<p><b>${esc(s.model)}</b> — ${esc(s.summary)} <span class="mono tags">${(s.descriptors || []).map(esc).join(" · ")}</span></p>`).join("")}` : ""}
        ${narrative ? `<details class="narrative"><summary>Full research entry</summary>${narrative}</details>` : ""}
        ${(kb.evidence || []).length ? `<details class="evidence"><summary>${kb.evidence.length} evidence snippets</summary><ul>${kb.evidence.map((e) => `<li><span class="mono">${esc(e.claim_ref)}</span> — “${esc(e.snippet)}” <a href="${esc(e.url)}" target="_blank" rel="noopener">source</a></li>`).join("")}</ul></details>` : ""}
        ${lore.length ? `<h4>Owners on ${fam} tubes</h4>${lore.map((c) => `<blockquote class="quote">${esc(c.claim)}<cite>${esc(c.kind)} · ${esc(c.source_type)}${c.poster_context ? " · " + esc(c.poster_context) : ""} · <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.source_host || "source")}</a>${(c.descriptors || []).length ? " · " + c.descriptors.map(esc).join(", ") : ""}</cite></blockquote>`).join("")}` : ""}
      </div>
    </div>
  </section>`;
}));
$("#kb").innerHTML = sections.join("");
$("#lore-list").innerHTML = (data.lore || []).filter((c) => c.kind === "pairing").map((c) => `<blockquote class="quote"><b>${(c.tubes || []).map(esc).join(" + ")}</b><br>${esc(c.claim)}<cite>${esc(c.source_type)}${c.poster_context ? " · " + esc(c.poster_context) : ""} · <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.source_host || "source")}</a></cite></blockquote>`).join("") || `<p class="pending">No pairing claims merged yet.</p>`;
initRail();
