/*
 * Homepage enhancements (ES module — skipped entirely by very old browsers).
 * Everything here is optional: the page is complete without it.
 *   1. Live conceptual-station scene, faded in over the pre-rendered poster.
 *   2. Schematic legend ↔ plan highlighting.
 *   3. Frontier engagement events.
 */

const hero = document.getElementById("hero-visual");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wideQuery = window.matchMedia("(min-width: 1024px) and (min-aspect-ratio: 5/4)");

function analytics() {
  return window.IshavasyamAnalytics;
}

/* ---------- 1. Live station scene ---------- */

function capableGPU() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

function eligible() {
  if (!hero || reduceMotion.matches) return false;
  const conn = navigator.connection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;
  return capableGPU();
}

function tier() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const smallScreen = Math.min(screen.width, screen.height) < 820;
  const cores = navigator.hardwareConcurrency || 8;
  return coarse || smallScreen || cores <= 4 ? "medium" : "high";
}

const composition = () => (wideQuery.matches ? "wide" : "band");

let scene = null;

async function startScene() {
  if (scene || !eligible()) return;
  try {
    const { mountStation } = await import("/assets/js/station.min.js");
    if (reduceMotion.matches) return;
    scene = await mountStation(hero, {
      tier: tier(),
      composition: composition(),
      pointer: window.matchMedia("(pointer: fine)").matches,
      onFirstFrame: () => hero.classList.add("is-live"),
    });
  } catch {
    scene = null; // poster remains — it is the designed fallback
  }
}

function stopScene() {
  if (!scene) return;
  hero.classList.remove("is-live");
  const s = scene;
  scene = null;
  setTimeout(() => s.dispose(), 400);
}

wideQuery.addEventListener("change", () => scene && scene.setComposition(composition()));
reduceMotion.addEventListener("change", (e) => (e.matches ? stopScene() : startScene()));

function whenIdle(fn) {
  const run = () => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 400));
  document.readyState === "complete" ? run() : window.addEventListener("load", run, { once: true });
}
whenIdle(startScene);

/* ---------- 2. Schematic legend highlighting ---------- */

const schematic = document.getElementById("schematic");
if (schematic) {
  const set = (sys) => (sys ? schematic.setAttribute("data-sys", sys) : schematic.removeAttribute("data-sys"));
  schematic.querySelectorAll(".schematic-legend a[data-sys]").forEach((a) => {
    a.addEventListener("mouseenter", () => set(a.dataset.sys));
    a.addEventListener("focus", () => set(a.dataset.sys));
    a.addEventListener("mouseleave", () => set(null));
    a.addEventListener("blur", () => set(null));
    a.addEventListener("click", () => {
      const api = analytics();
      if (api) api.trackFrontier(a.dataset.frontier, "schematic_legend");
    });
  });
}

/* ---------- 3. Frontier scope disclosure events ---------- */

document.querySelectorAll(".frontier details[data-frontier]").forEach((d) => {
  d.addEventListener("toggle", () => {
    const api = analytics();
    if (d.open && api) api.trackFrontier(d.dataset.frontier, "scope_expand");
  });
});
