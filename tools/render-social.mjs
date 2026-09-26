// Renders the Open Graph image (1200×630) and the apple-touch icon.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { startServer } from "./serve.mjs";

const server = await startServer(4181);
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"] });
try {
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await og.goto("http://localhost:4181/tools/og.html");
  await og.waitForSelector("body[data-ready]", { state: "attached", timeout: 120000 });
  await og.screenshot({ path: "images/station/og.tmp.png" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "images/station/og.tmp.png", "-q:v", "3", "images/station/ishavasyam-space-station-og.jpg"]);
  execFileSync("rm", ["images/station/og.tmp.png"]);

  const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await icon.setContent(`<html><body style="margin:0"><img src="http://localhost:4181/favicon.svg" width="180" height="180" style="display:block"></body></html>`);
  await icon.waitForTimeout(300);
  await icon.screenshot({ path: "apple-touch-icon.png" });
  console.log("rendered og + apple-touch-icon");
} finally {
  await browser.close();
  server.close();
}
