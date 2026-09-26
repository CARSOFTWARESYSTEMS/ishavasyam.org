// Visual QA: screenshots at representative viewports + automatic checks
// (console errors, horizontal overflow, H1 count, live-canvas status).
// GA requests are blocked so QA never reaches the production property.
// Usage: node tools/visual-qa.mjs [--out=qa-output] [--path=/] [--only=390x844] [--reduced] [--full]
import { chromium, firefox, webkit } from "playwright";
import { mkdirSync } from "node:fs";
import { startServer } from "./serve.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const out = args.out || "qa-output";
mkdirSync(out, { recursive: true });
const viewports = [
  [320, 640], [360, 780], [375, 812], [390, 844], [412, 915], [430, 932],
  [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [844, 390],
];
const only = args.only ? viewports.filter(([w, h]) => `${w}x${h}` === args.only) : viewports;
const path = args.path || "/";

const server = await startServer(4182);
const engine = args.webkit ? webkit : args.firefox ? firefox : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome", args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"] } : {});
const report = [];
try {
  for (const [w, h] of only) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: w < 900 ? 2 : 1,
      isMobile: !args.firefox && w < 900 && w < h,
      hasTouch: w < 900,
      reducedMotion: args.reduced ? "reduce" : "no-preference",
    });
    await ctx.route(/google-analytics\.com|googletagmanager\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && !/googletagmanager|google-analytics|ERR_FAILED/.test(m.text()) && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(`http://localhost:4182${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(Number(args.wait || 3500));
    const info = await page.evaluate(() => ({
      overflow: Math.max(
        document.documentElement.scrollWidth - window.innerWidth,
        ...[...document.querySelectorAll("body *")]
          .filter((el) => !el.closest(".sprite, svg, .hero-visual, .primary-nav") && el.getClientRects().length)
          .map((el) => Math.round(el.getBoundingClientRect().right - window.innerWidth)),
      ),
      h1: document.querySelectorAll("h1").length,
      live: !!document.querySelector(".hero-visual.is-live"),
      ctaTop: (() => { const b = document.querySelector(".hero-actions .btn"); return b ? Math.round(b.getBoundingClientRect().bottom) : null; })(),
    }));
    const engineTag = args.webkit ? "-webkit" : args.firefox ? "-firefox" : "";
    const tag = `${path === "/" ? "home" : path.replace(/\W+/g, "")}-${w}x${h}${engineTag}${args.reduced ? "-reduced" : ""}`;
    await page.screenshot({ path: `${out}/${tag}.png` });
    if (args.full) await page.screenshot({ path: `${out}/${tag}-full.png`, fullPage: true });
    if (args.sections) {
      const blocks = page.locator("main > section, footer");
      const n = await blocks.count();
      for (let i = 0; i < n; i++) await blocks.nth(i).screenshot({ path: `${out}/${tag}-s${i}.png` });
    }
    report.push({ viewport: `${w}x${h}`, ...info, ctaAboveFold: info.ctaTop !== null ? info.ctaTop <= h : null, errors });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.table(report.map(({ errors, ...r }) => ({ ...r, errors: errors.length })));
for (const r of report) if (r.errors.length) console.log(r.viewport, r.errors);
