// Data loading and a tiny store. All data is static JSON under data/.
const FILES = ["amp", "tubes", "profiles", "listings", "lore", "rates", "kb", "dealers"];

export async function loadData() {
  const out = {};
  await Promise.all(FILES.map(async (name) => {
    try {
      const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
      out[name] = res.ok ? await res.json() : null;
    } catch (err) {
      out[name] = null;
    }
  }));
  out.listings = out.listings || [];
  out.lore = out.lore || [];
  out.kb = out.kb || {};
  out.byId = Object.fromEntries((out.tubes || []).map((t) => [t.id, t]));
  return out;
}

export function tubesByFamily(data, family) {
  return (data.tubes || []).filter((t) => t.family === family);
}

export function poolForRole(data, role) {
  if (role === "power") return tubesByFamily(data, "2A3");
  if (role === "driver") return tubesByFamily(data, "6C45");
  return [...tubesByFamily(data, "5U4G"), ...tubesByFamily(data, "274B")];
}

export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },
  };
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
