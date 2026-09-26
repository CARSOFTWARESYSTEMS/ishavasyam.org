// End-to-end GA4 verification in a real browser.
// Loads the real gtag.js, but every /g/collect hit is captured inside the page
// (fetch / sendBeacon / image are stubbed for that endpoint and answered with a
// local 204) — nothing reaches the production GA4 property. In-page stubbing is
// used because network-level interception aborts GA's keepalive requests.
// Checks: tag loads once, correct ID, one page_view per page with correct
// context, one cta_click per CTA with the documented params, no PII.
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const PORT = 4183;
const BASE = `http://localhost:${PORT}`;
const hits = [];
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

function parseHit(url, body) {
  const shared = Object.fromEntries(new URL(url).searchParams);
  const lines = (body || "").split("\n").filter(Boolean);
  const events = lines.length ? lines.map((l) => ({ ...shared, ...Object.fromEntries(new URLSearchParams(l)) })) : [shared];
  return events.filter((e) => e.en);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  const isHit = (u) => /\/g\/collect/.test(String(u));
  // recorded synchronously in localStorage so hits sent while a page unloads survive the navigation
  const report = (url, body) => {
    try {
      const log = JSON.parse(localStorage.getItem("__ga4hits") || "[]");
      log.push({ url: String(url), body: typeof body === "string" ? body : "" });
      localStorage.setItem("__ga4hits", JSON.stringify(log));
    } catch (e) {}
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (isHit(url)) {
      report(url, init && init.body);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return origFetch.apply(this, arguments);
  };
  const origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function (url, data) {
    if (isHit(url)) {
      report(url, data);
      return true;
    }
    return origBeacon ? origBeacon(url, data) : false;
  };
  const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    set(v) { if (isHit(v)) { report(v, ""); return; } imgSrc.set.call(this, v); },
    get() { return imgSrc.get.call(this); },
  });
});
// belt and braces: any GA request that still reaches the network layer is dropped
await ctx.route(/google-analytics\.com|analytics\.google\.com/, (r) => r.abort());
// external destinations are stubbed so clicks never leave the test
await ctx.route(/aerospace\.ishavasyam\.org|itelematics\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>stub" }));

const page = await ctx.newPage();
/** Pull hits recorded on localhost pages into `hits` (call while on a localhost page). */
async function collect() {
  const log = await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem("__ga4hits") || "[]");
    localStorage.removeItem("__ga4hits");
    return l;
  });
  for (const { url, body } of log) for (const e of parseHit(url, body)) hits.push(e);
}
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const events = (name) => hits.filter((h) => h.en === name);
const ctas = (name) => events("cta_click").filter((h) => h["ep.cta_name"] === name);
async function flush() {
  // gtag batches events for a few seconds before sending
  await page.waitForTimeout(6500);
  await collect();
}

try {
  // 1. Homepage load
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await collect();
  const tagCount = await page.locator('script[src*="googletagmanager.com/gtag/js"]').count();
  ok(tagCount === 1, `gtag.js included once on / (found ${tagCount})`);
  ok(await page.evaluate(() => typeof window.gtag === "function" && !!window.IshavasyamAnalytics), "gtag() and IshavasyamAnalytics are available");
  const pv1 = events("page_view");
  ok(pv1.length === 1, `one page_view after loading / (got ${pv1.length})`);
  ok(pv1[0] && pv1[0].tid === "G-BXZ9C642NH", `measurement ID is G-BXZ9C642NH (${pv1[0] && pv1[0].tid})`);
  ok(pv1[0] && new URL(pv1[0].dl).pathname === "/", `page_location path is / (${pv1[0] && pv1[0].dl})`);
  ok(pv1[0] && /Space Station Research/.test(pv1[0].dt), `page_title is the homepage title (${pv1[0] && pv1[0].dt})`);

  // 2. In-page CTAs (no navigation)
  await page.click('a[data-cta="collaborate_space_station_research"]');
  await page.evaluate(() => window.addEventListener("click", (e) => e.target.closest('a[href^="tel:"]') && e.preventDefault()));
  await page.click('a[data-cta="contact_sudarshana_phone"]');
  await page.click('.frontier details[data-frontier="power_energy"] summary');
  await flush();
  const collab = ctas("collaborate_space_station_research");
  ok(collab.length === 1, `collaboration CTA → one cta_click (got ${collab.length})`);
  ok(collab[0] && collab[0]["ep.cta_location"] === "collaboration" && collab[0]["ep.link_type"] === "internal", "collaboration params: location=collaboration, link_type=internal");
  const phone = ctas("contact_sudarshana_phone");
  ok(phone.length === 1, `phone CTA → one cta_click (got ${phone.length})`);
  ok(phone[0] && phone[0]["ep.contact_method"] === "phone" && phone[0]["ep.link_type"] === "phone" && phone[0]["ep.cta_location"] === "contact", "phone params: contact_method=phone, link_type=phone, location=contact");
  ok(events("research_frontier_select").length === 1, "frontier scope expand → one research_frontier_select");

  // 3. External research CTAs (navigate to stubs, come back)
  for (const [selector, name, dest] of [
    ['.hero a[data-cta="explore_space_station_research"]', "explore_space_station_research", "https://aerospace.ishavasyam.org/space/space-station"],
    ['.collaborate a[data-cta="explore_space_research"]', "explore_space_research", "https://aerospace.ishavasyam.org/space"],
    ['a[data-cta="view_sudarshana_profile"]', "view_sudarshana_profile", "https://aerospace.ishavasyam.org/about/sudarshana-karkala"],
  ]) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.click(selector);
    await page.waitForURL(/aerospace\.ishavasyam\.org/);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await collect();
    const got = ctas(name);
    ok(got.length === 1, `${name} → one cta_click (got ${got.length})`);
    ok(got[0] && got[0]["ep.destination_url"] === dest, `${name} destination_url = ${got[0] && got[0]["ep.destination_url"]}`);
  }
  const hero = ctas("explore_space_station_research")[0];
  ok(hero && hero["ep.cta_location"] === "hero" && hero["ep.link_type"] === "external_research_platform", "hero params: location=hero, link_type=external_research_platform");

  // 4. Mantra → /philosophy (navigation) and philosophy page_view
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await collect();
  const before = events("page_view").length;
  await page.click('a.mantra-link[data-cta="explore_ishavasyam_philosophy"]');
  await page.waitForURL(/\/philosophy$/);
  await page.waitForTimeout(7000);
  await collect();
  const phil = ctas("explore_ishavasyam_philosophy");
  ok(phil.length === 1 && phil[0]["ep.cta_location"] === "mantra" && phil[0]["ep.destination_url"] === "/philosophy", `mantra → one cta_click to /philosophy (got ${phil.length})`);
  const pvPhil = events("page_view").slice(before).filter((e) => new URL(e.dl).pathname === "/philosophy");
  ok(pvPhil.length === 1, `one page_view for /philosophy (got ${pvPhil.length})`);
  ok(pvPhil[0] && /Philosophy of Ishavasyam/.test(pvPhil[0].dt), `philosophy page_title (${pvPhil[0] && pvPhil[0].dt})`);
  ok((await page.locator('script[src*="googletagmanager.com/gtag/js"]').count()) === 1, "gtag.js included once on /philosophy");

  // 5. Global checks
  const pageViewsPerLoad = events("page_view").reduce((m, e) => ((m[e.dl + e._p] = (m[e.dl + e._p] || 0) + 1), m), {});
  ok(Object.values(pageViewsPerLoad).every((n) => n === 1), "no duplicate page_view within any page load");
  const blob = JSON.stringify(hits);
  ok(!/9845561518|98455|%2B91/.test(blob), "no phone number in any analytics hit");
  ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(blob.replace(/ep\.[a-z_]+/g, "")), "no email address in any analytics hit");
  ok(errors.length === 0, `no page errors (${errors.join("; ")})`);
  if (process.env.DUMP) console.log(JSON.stringify(ctas("explore_ishavasyam_philosophy")[0], null, 1));
  console.log(`\n${hits.length} GA4 events captured locally: ${[...new Set(hits.map((h) => h.en))].join(", ")}`);
} finally {
  await browser.close();
  server.close();
}
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
