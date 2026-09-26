// Renders the hero posters (LCP image + no-WebGL/reduced-motion fallback) and
// the social preview from the live scene, so poster and canvas match exactly.
// Usage: node tools/render-posters.mjs [--only=wide|band|og] [--out=dir]
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { startServer } from "./serve.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const outDir = args.out || "images/station";
mkdirSync(outDir, { recursive: true });

const jobs = [
  { name: "hero-wide", comp: "wide", w: 1600, h: 900, dpr: 1.5, sizes: [1280, 1920, 2400] },
  { name: "hero-band", comp: "band", w: 1200, h: 900, dpr: 1, sizes: [640, 960, 1200] },
].filter((j) => !args.only || j.comp === args.only);

const server = await startServer(4180);
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"] });
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.dpr });
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    page.on("console", (m) => m.type() === "error" && console.error(m.text()));
    await page.goto(`http://localhost:4180/tools/capture.html?comp=${j.comp}&dpr=${j.dpr}&t=${args.t || 0}`);
    await page.waitForSelector("body[data-ready]", { state: "attached", timeout: 120000 });
    const png = `${outDir}/${j.name}.png`;
    await page.screenshot({ path: png });
    await page.close();
    if (!args.raw) {
      for (const s of j.sizes) {
        const base = `${outDir}/${j.name}-${s}`;
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-vf", `scale=${s}:-2:flags=lanczos`, `${base}.tmp.png`]);
        execFileSync("cwebp", ["-quiet", "-q", "80", "-m", "6", "-sharp_yuv", `${base}.tmp.png`, "-o", `${base}.webp`]);
        execFileSync("avifenc", ["-q", "58", "-s", "4", "-y", "420", `${base}.tmp.png`, `${base}.avif`], { stdio: "ignore" });
        execFileSync("rm", [`${base}.tmp.png`]);
      }
      if (!args.keep) execFileSync("rm", [png]);
    }
    console.log("rendered", j.name);
  }
} finally {
  await browser.close();
  server.close();
}
