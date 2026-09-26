// Accessibility audit with axe-core (WCAG 2.x A/AA) plus keyboard checks.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { startServer } from "./serve.mjs";

const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const server = await startServer(4186);
const browser = await chromium.launch({ channel: "chrome" });
let failures = 0;
try {
  for (const [path, w, h] of [["/", 1440, 900], ["/", 390, 844], ["/philosophy", 1440, 900], ["/philosophy", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    await ctx.route(/google-analytics\.com|googletagmanager\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`http://localhost:4186${path}`, { waitUntil: "networkidle" });
    await page.addScriptTag({ content: axe });
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }));
    const v = res.violations;
    console.log(`${v.length ? "✗" : "✓"} ${path} @${w}px — ${v.length} violation(s), ${res.passes.length} rules passed`);
    for (const x of v) {
      console.log(`   [${x.impact}] ${x.id}: ${x.help}`);
      for (const n of x.nodes.slice(0, 4)) console.log(`      ${n.target.join(" ")} — ${(n.failureSummary || "").split("\n")[1] || ""}`);
    }
    failures += v.filter((x) => ["serious", "critical"].includes(x.impact)).length;

    // keyboard: first Tab reaches the skip link, and focus is visibly outlined
    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      return { cls: a.className, outline: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px", top: a.getBoundingClientRect().top };
    });
    console.log(`   keyboard: first Tab → .${skip.cls} (visible: ${skip.top >= 0}, outline: ${skip.outline})`);
    if (w < 900 && path === "/") {
      await page.click("#nav-toggle");
      const open = await page.evaluate(() => ({ expanded: document.querySelector("#nav-toggle").getAttribute("aria-expanded"), visible: getComputedStyle(document.querySelector("#primary-nav")).visibility }));
      await page.keyboard.press("Escape");
      const closed = await page.evaluate(() => ({ expanded: document.querySelector("#nav-toggle").getAttribute("aria-expanded"), focus: document.activeElement.id }));
      console.log(`   mobile menu: open → ${JSON.stringify(open)}, Escape → ${JSON.stringify(closed)}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures) process.exit(1);
