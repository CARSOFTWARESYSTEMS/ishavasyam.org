// Mobile alignment audit: measures where text actually starts/ends (ink, via Range rects — not
// box edges) against the page's content axis, and how far centred elements sit from the centre
// axis. Also captures per-section screenshots, optionally with the two axes drawn over the page.
// GA requests are blocked so QA never reaches the production property.
// Usage: node tools/align-audit.mjs [--only=390x844,430x932] [--out=qa-output/align] [--guides] [--shots] [--open]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { startServer } from "./serve.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const out = args.out || "qa-output/align";
mkdirSync(out, { recursive: true });
const phones = [[320, 640], [360, 800], [375, 812], [390, 844], [393, 852], [412, 915], [430, 932]];
const sizes = args.only ? String(args.only).split(",").map((s) => s.split("x").map(Number)) : phones;

/* Probes on the content axis: [label, selector]. Each is measured by its text ink (or box for controls). */
const AXIS = [
  ["header brand", ".brand", "box"],
  ["header menu (right)", ".nav-toggle", "box"],
  ["mission eyebrow", ".mission .eyebrow"],
  ["mission question", ".mission .question"],
  ["mission lead", ".mission .lead"],
  ["schematic frame", ".schematic-frame", "box"],
  ["legend rule", ".schematic-legend li:first-child a", "box"],
  ["schematic note", ".schematic-note"],
  ["fact dt", ".facts dt"],
  ["fact dd", ".facts dd"],
  ["fact rule", ".facts > div", "box"],
  ["frontiers eyebrow", ".frontiers .eyebrow"],
  ["frontiers h2", ".frontiers h2"],
  ["frontiers intro", ".frontiers .section-intro"],
  ["frontier rule", ".frontier", "box"],
  ["frontier num", ".frontier-num"],
  ["frontier h3", ".frontier h3"],
  ["frontier tag", ".frontier-tag", "box"],
  ["frontier desc", ".frontier > p:not(.frontier-num):not(.frontier-tag)"],
  ["frontier summary", ".frontier summary", "box"],
  ["frontier scope li", ".frontier details li"],
  ["researchers eyebrow", ".researchers .eyebrow"],
  ["researchers h2", ".researchers h2"],
  ["researchers lead", ".researchers .lead"],
  ["roles label", ".roles-label"],
  ["role li (rule)", ".roles li", "box"],
  ["lab eyebrow", ".lab .eyebrow"],
  ["lab h2 (pill)", ".lab h2 .status", "box"],
  ["lab h2 text", ".lab h2"],
  ["lab intro", ".lab .section-intro"],
  ["step (rail)", ".step", "box"],
  ["step h3", ".step h3"],
  ["step state", ".step-state"],
  ["step p", ".step p"],
  ["lab col rule", ".lab-col", "box"],
  ["lab col h3", ".lab-col h3"],
  ["lab col li", ".lab-col li"],
  ["collab h2", ".collaborate-inner > h2"],
  ["collab p", ".collaborate-inner > p"],
  ["collab btn", ".collaborate-actions .btn", "box"],
  ["collab link", ".collaborate-actions .text-link"],
  ["contact rule", ".contact", "box"],
  ["contact h2", ".contact h2"],
  ["contact name", ".contact-name"],
  ["contact phone", ".contact-phone"],
  ["contact profile", ".contact .text-link"],
  ["footer name", ".footer-name"],
  ["footer org", ".footer-org"],
  ["footer nav", ".footer-nav a", "box"],
  ["footer rule", ".footer-bottom", "box"],
  ["footer bottom", ".footer-bottom p"],
];
/* Probes on the centre axis (per line). */
const CENTRE = [
  ["mantra line 1", ".mantra-verse span:first-child"],
  ["mantra line 2", ".mantra-verse span:last-child"],
  ["mantra meta", ".mantra-meta"],
  ["hero org", ".hero-org"],
  ["hero main", ".hero-main"],
  ["hero subline", ".hero-subline"],
  ["hero mission", ".hero-mission"],
  ["hero caption", ".hero-caption"],
  ["hero CTA", ".hero-actions .btn", "box"],
  ["hero CTA label", ".hero-actions .btn"],
  ["hero support", ".hero-support"],
  ["schematic art", ".schematic-plan use", "svg"],
  ["schematic frame", ".schematic-frame", "box"],
];

const server = await startServer(4184);
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"] });
const results = {};
try {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < h, hasTouch: true });
    await ctx.route(/google-analytics\.com|googletagmanager\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto("http://localhost:4184/", { waitUntil: "networkidle" });
    await page.waitForTimeout(Number(args.wait || 2500));
    const data = await page.evaluate(({ AXIS, CENTRE }) => {
      const vw = document.documentElement.clientWidth;
      const c = document.querySelector("main .container");
      const cs = getComputedStyle(c);
      const cr = c.getBoundingClientRect();
      const axisL = cr.left + parseFloat(cs.paddingLeft);
      const axisR = cr.right - parseFloat(cs.paddingRight);
      // visually-hidden text (1px clipped boxes) has layout rects but no ink
      const hidden = (node, root) => {
        for (let a = node.parentElement; a && a !== root.parentElement; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (st.position === "absolute" && a.getBoundingClientRect().width <= 1) return true;
        }
        return false;
      };
      const ink = (el) => {
        const rects = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent.trim() || hidden(n, el)) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const q of r.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rects.push(q);
        }
        return rects;
      };
      const lines = (rects) => {
        // merge rects that share a line
        const byLine = [];
        for (const q of rects) {
          const l = byLine.find((b) => Math.abs(b.mid - (q.top + q.bottom) / 2) < q.height / 2);
          if (l) { l.left = Math.min(l.left, q.left); l.right = Math.max(l.right, q.right); }
          else byLine.push({ mid: (q.top + q.bottom) / 2, left: q.left, right: q.right });
        }
        return byLine;
      };
      const r1 = (n) => Math.round(n * 10) / 10;
      const axis = {};
      for (const [label, sel, mode] of AXIS) {
        const els = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
        if (!els.length) { axis[label] = null; continue; }
        const L = [], R = [];
        for (const el of els) {
          if (mode === "box") { const b = el.getBoundingClientRect(); L.push(b.left); R.push(b.right); }
          else { const ls = lines(ink(el)); if (!ls.length) continue; L.push(Math.min(...ls.map((x) => x.left))); R.push(Math.max(...ls.map((x) => x.right))); }
        }
        axis[label] = { dL: r1(Math.min(...L) - axisL), dLmax: r1(Math.max(...L) - axisL), dR: r1(axisR - Math.max(...R)), n: els.length };
      }
      const centre = {};
      for (const [label, sel, mode] of CENTRE) {
        const el = document.querySelector(sel);
        if (!el || !el.getClientRects().length) { centre[label] = null; continue; }
        if (mode === "box") { const b = el.getBoundingClientRect(); centre[label] = [r1((b.left + b.right) / 2 - vw / 2)]; continue; }
        if (mode === "svg") {
          const bb = el.getBBox(); const m = el.getScreenCTM();
          const x0 = m.a * bb.x + m.e, x1 = m.a * (bb.x + bb.width) + m.e;
          centre[label] = [r1((x0 + x1) / 2 - vw / 2)];
          continue;
        }
        centre[label] = lines(ink(el)).map((l) => r1((l.left + l.right) / 2 - vw / 2));
      }
      // anything wider than the viewport, or clipped horizontally inside its own box
      const overflow = [...document.querySelectorAll("body *")]
        .filter((el) => !el.closest(".sprite, svg, .hero-visual, .primary-nav") && el.getClientRects().length && !hidden(el.firstChild || el, el) && !(getComputedStyle(el).position === "absolute" && el.getBoundingClientRect().width <= 1))
        .filter((el) => { const b = el.getBoundingClientRect(); return b.right > vw + 0.5 || b.left < -0.5 || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible"); })
        .map((el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ").join(".") : ""));
      // justified text: widest inter-word space beyond a normal space, per block
      const gaps = [];
      for (const p of document.querySelectorAll("p")) {
        if (getComputedStyle(p).textAlign !== "justify" || !p.getClientRects().length) continue;
        const probe = document.createElement("span"); probe.textContent = " "; probe.style.whiteSpace = "pre"; p.appendChild(probe);
        const normal = probe.getBoundingClientRect().width; probe.remove();
        let worst = 0;
        const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) for (let i = 0; i < n.textContent.length; i++) {
          if (n.textContent[i] !== " ") continue;
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
          worst = Math.max(worst, r.getBoundingClientRect().width - normal);
        }
        gaps.push({ el: (p.className || p.parentElement.className || "p").split(" ")[0], worst: r1(worst) });
      }
      const g = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? { l: r1(b.left), r: r1(vw - b.right), top: r1(b.top + scrollY), h: r1(b.height), w: r1(b.width) } : null; };
      return {
        vw, axisL: r1(axisL), axisR: r1(vw - axisR), axis, centre, gaps, overflow: [...new Set(overflow)].slice(0, 12),
        docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
        boxes: { heroVisual: g(".hero-visual"), heroBtn: g(".hero-actions .btn"), collabBtn: g(".collaborate-actions .btn"), footerName: g(".footer-name") },
        live: !!document.querySelector(".hero-visual.is-live"),
      };
    }, { AXIS, CENTRE });
    results[`${w}x${h}`] = data;

    if (args.shots || args.guides) {
      // freeze viewport-relative sizes so the full-page capture keeps the phone layout
      await page.evaluate(() => {
        const hv = document.querySelector(".hero-visual");
        const b = hv.getBoundingClientRect();
        hv.style.cssText += `;height:${b.height}px;max-height:none;aspect-ratio:auto`;
        document.querySelector(".site-header").style.position = "absolute";
        document.querySelector(".site-header").style.width = "100%";
        document.querySelector(".mantra").style.marginTop = getComputedStyle(document.documentElement).getPropertyValue("--header-h");
      });
      const tag = `${args.label ? args.label + "-" : ""}${w}x${h}`;
      const shoot = async (suffix) => {
        const blocks = [["top", ".site-header", ".hero"], ["mission", "#mission"], ["frontiers", "#frontiers"], ["researchers", "#researchers"], ["lab", "#lab"], ["collaborate", "#collaborate"], ["footer", ".site-footer"]];
        for (const [name, a, b] of blocks) {
          const box = await page.evaluate(([a, b]) => {
            const r1 = document.querySelector(a).getBoundingClientRect();
            const r2 = document.querySelector(b || a).getBoundingClientRect();
            return { x: 0, y: r1.top + scrollY, width: document.documentElement.clientWidth, height: r2.bottom - r1.top };
          }, [a, b]);
          await page.screenshot({ path: `${out}/${tag}-${name}${suffix}.png`, clip: box, fullPage: true });
        }
      };
      if (args.shots) await shoot("");
      if (args.guides) {
        await page.evaluate(({ axisL, axisR, vw }) => {
          const o = document.createElement("div");
          o.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${document.documentElement.scrollHeight}px;pointer-events:none;z-index:9999`;
          const line = (x, color) => { const d = document.createElement("div"); d.style.cssText = `position:absolute;top:0;bottom:0;left:${x}px;width:1px;background:${color}`; o.appendChild(d); };
          line(axisL, "rgba(255,60,60,.85)"); line(vw - axisR - 1, "rgba(255,60,60,.85)"); line(vw / 2 - 0.5, "rgba(60,255,200,.7)");
          document.body.appendChild(o);
        }, data);
        await shoot("-guides");
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(`${out}/${args.label || "audit"}.json`, JSON.stringify(results, null, 1));

/* ---------- report ---------- */
const keys = Object.keys(results);
console.log("\nContent axis (gutter px): " + keys.map((k) => `${k.split("x")[0]}: ${results[k].axisL}/${results[k].axisR}`).join("  "));
console.log("\nLEFT offset from content axis (ink/box px; min..max across instances) — 0 means on-axis");
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("probe", 22) + keys.map((k) => pad(k.split("x")[0], 12)).join(""));
for (const [label] of AXIS) {
  console.log(pad(label, 22) + keys.map((k) => { const v = results[k].axis[label]; return pad(v ? (v.dL === v.dLmax ? v.dL : `${v.dL}..${v.dLmax}`) : "—", 12); }).join(""));
}
console.log("\nRIGHT offset from content axis (px inside the right gutter line; negative = past it)");
for (const [label] of AXIS) {
  console.log(pad(label, 22) + keys.map((k) => { const v = results[k].axis[label]; return pad(v ? v.dR : "—", 12); }).join(""));
}
console.log("\nCENTRE offset from viewport centre (px per line; + = right)");
for (const [label] of CENTRE) console.log(pad(label, 22) + keys.map((k) => pad(results[k].centre[label] ? results[k].centre[label].join(",") : "—", 12)).join(""));
console.log("\nJustified text — widest extra word space per viewport (px beyond a normal space):");
for (const k of keys) { const w = results[k].gaps.reduce((a, b) => (b.worst > a.worst ? b : a), { worst: 0, el: "—" }); console.log(`  ${k}: ${w.worst} (${w.el}) across ${results[k].gaps.length} blocks`); }
console.log("\nOverflow / clipping:");
for (const k of keys) console.log(`  ${k}: docW=${results[k].docW} ${results[k].overflow.length ? results[k].overflow.join(" ") : "none"}  live=${results[k].live}`);
