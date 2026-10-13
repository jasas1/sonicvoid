// Market board: verified dealer listings with filters and per-tube USD normalisation.
const UNIT_N = { single: 1, pair: 2, quad: 4 };
const REGION_OF = (l) => l.dealer_region || ({ USD: "US", CAD: "CA", EUR: "EU", GBP: "UK", CHF: "EU" }[l.currency] || "—");
const STOCK_LABEL = { in_stock: "in stock", out_of_stock: "out", inquire: "inquire", backorder: "backorder", unknown: "unknown" };

const STOCK_RANK = { in_stock: 0, backorder: 1, inquire: 2, unknown: 3, out_of_stock: 4 };
export function renderMarket(data, els) {
  const sort = { key: "perTube", dir: 1 };
  const rates = data.rates?.usd_per_unit || { USD: 1 };
  const listings = (data.listings || []).map((l) => {
    const usd = l.usd_est ?? (l.price != null ? l.price * (rates[l.currency] || 1) : null);
    const service = /matching|service|adapter/i.test(l.model || "");
    return { ...l, usd, service, perTube: usd != null && !service ? usd / (UNIT_N[l.unit] || 1) : null, region: REGION_OF(l) };
  });
  const filters = { family: "2A3", condition: "all", stock: false, region: "all" };
  const famOpts = ["all", "2A3", "6C45", "5U4G", "274B"]; const condOpts = ["all", "new", "NOS"]; const regions = ["all", ...new Set(listings.map((l) => l.region))];
  const chip = (group, value, label) => `<button type="button" class="chip" data-group="${group}" data-value="${value}" aria-pressed="${String(filters[group]) === String(value)}">${label}</button>`;
  els.filters.innerHTML = famOpts.map((f) => chip("family", f, f === "all" ? "All families" : f)).join("") + `<span style="width:1rem"></span>`
    + condOpts.map((c) => chip("condition", c, c === "all" ? "New + NOS" : c)).join("") + `<span style="width:1rem"></span>`
    + regions.map((r) => chip("region", r, r === "all" ? "All regions" : r)).join("") + `<span style="width:1rem"></span>` + chip("stock", "true", "In stock only");
  els.filters.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const g = b.dataset.group;
    if (g === "stock") filters.stock = !filters.stock; else filters[g] = b.dataset.value;
    els.filters.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.group === "stock" ? String(filters.stock) : String(filters[c.dataset.group]) === c.dataset.value ? "true" : "false"));
    draw();
  });
  const sortBtns = [...document.querySelectorAll("#market-table .sort")];
  sortBtns.forEach((b) => b.addEventListener("click", () => { if (sort.key === b.dataset.sort) sort.dir = -sort.dir; else { sort.key = b.dataset.sort; sort.dir = 1; } draw(); }));
  const sortSel = document.getElementById("market-sort");
  sortSel?.addEventListener("change", () => { const [k, d] = sortSel.value.split(":"); sort.key = k; sort.dir = +d; draw(); });
  const keyOf = (l) => sort.key === "model" ? `${l.brand} ${l.model}`.toLowerCase() : sort.key === "dealer" ? l.dealer.toLowerCase() : sort.key === "price" ? (l.usd ?? null) : sort.key === "perTube" ? (l.perTube ?? null) : sort.key === "stock" ? STOCK_RANK[l.in_stock] ?? 9 : (l.fetched_at || "");
  function draw() {
    const rows = listings.filter((l) => (filters.family === "all" || l.family === filters.family) && (filters.condition === "all" || l.condition === filters.condition)
      && (filters.region === "all" || l.region === filters.region) && (!filters.stock || l.in_stock === "in_stock"))
      .sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); if (ka === null || ka === undefined) return 1; if (kb === null || kb === undefined) return -1; return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir; });
    sortBtns.forEach((b) => { const th = b.closest("th"); const on = b.dataset.sort === sort.key; th.setAttribute("aria-sort", on ? (sort.dir > 0 ? "ascending" : "descending") : "none"); b.classList.toggle("on", on); b.dataset.dir = on ? (sort.dir > 0 ? "▲" : "▼") : ""; });
    if (sortSel && sortSel.value !== `${sort.key}:${sort.dir}` && [...sortSel.options].some((o) => o.value === `${sort.key}:${sort.dir}`)) sortSel.value = `${sort.key}:${sort.dir}`;
    const tubesShown = new Set(rows.map((l) => `${l.brand} ${l.model}`.toLowerCase())).size;
    els.count.textContent = `${rows.length} of ${listings.length} listings · ${tubesShown} distinct tubes · sorted by ${sort.key === "perTube" ? "USD per tube" : sort.key === "fetched_at" ? "fetch date" : sort.key}${sort.dir > 0 ? " ↑" : " ↓"}`;
    if (!listings.length) { els.body.innerHTML = `<tr><td colspan="7"><div class="empty">No verified listings yet. When the research run finishes, run <code>python3 tools/merge_research.py</code> and reload.</div></td></tr>`; els.note.textContent = ""; return; }
    if (!rows.length) { els.body.innerHTML = `<tr><td colspan="7"><div class="empty">Nothing matches these filters.</div></td></tr>`; return; }
    els.body.innerHTML = rows.map((l) => {
      const price = l.price == null ? "—" : `${l.currency === "USD" ? "$" : l.currency + " "}${Number(l.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const ext = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8L8 2M3.5 2H8v4.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
      const label = l.order_path === "cart" ? "Cart" : l.order_path === "email" ? "Email" : (l.order_path || "page");
      const order = `<a class="order" href="${l.url}" target="_blank" rel="noopener">${label} ${ext}<span class="sr-only"> (opens the dealer page)</span></a>`;
      const ship = l.ships_to_us === "yes" ? " · ships US" : l.ships_to_us === "no" ? " · no US shipping" : ` · <span class="ship-unknown">US shipping unverified</span>`;
      return `<tr>
        <td class="tube"><b>${l.model.toLowerCase().startsWith(String(l.brand).toLowerCase()) ? l.model : `${l.brand} ${l.model}`}</b><small>${l.service ? "service · " : ""}${l.family} · ${l.unit}${l.condition === "NOS" ? " · NOS" : ""}${l.variant ? " · " + l.variant : ""}</small></td>
        <td><span class="cl">Dealer</span>${l.dealer}<br><small class="mono" style="color:var(--ink-3)">${l.region}${ship}</small></td>
        <td class="num price"><span class="cl">Price</span>${price}${l.price_note ? `<small>${l.price_note}</small>` : ""}${l.check?.price_seen != null ? `<small class="ship-unknown" title="seen on the dealer page on ${l.check.at}; not applied automatically">page shows ${Number(l.check.price_seen).toLocaleString("en-US", { minimumFractionDigits: 2 })}</small>` : ""}</td>
        <td class="num"><span class="cl">≈ USD / tube</span>${l.perTube != null ? "$" + Math.round(l.perTube).toLocaleString("en-US") : "—"}</td>
        <td><span class="cl">Stock</span><span class="stock ${l.stale ? "unknown" : l.in_stock}" title="${l.stale ? "could not re-verify on the dealer page on " + (l.check?.at || l.fetched_at) : (l.evidence?.snippet || "")}"><i></i>${l.stale ? "unverified" : (STOCK_LABEL[l.in_stock] || l.in_stock)}</span></td>
        <td><span class="cl">Order</span>${order}</td>
        <td class="mono" style="color:var(--ink-3);font-size:0.75rem"><span class="cl">Fetched</span>${l.fetched_at || ""}${l.check?.stock_was ? `<br><span title="was ${l.check.stock_was} before ${l.check.at}">changed</span>` : ""}</td>
      </tr>`;
    }).join("");
    const dealers = new Set(rows.map((l) => l.dealer)); const stamp = rows.map((l) => l.fetched_at).filter(Boolean).sort().pop();
    const none = (data.dealers || []).filter((d) => d.status === "none-in-scope").map((d) => `${d.dealer} (${d.checked})`);
    els.note.textContent = `${rows.length} listings from ${dealers.size} dealers · latest fetch ${stamp || "—"} · USD estimates use ECB reference rates of ${data.rates?.date || "—"} · per-tube price divides pairs by 2 and quads by 4.` + (none.length ? ` Checked, nothing in these families: ${none.join(", ")}.` : "");
  }
  draw();
}
