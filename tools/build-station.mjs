// Bundles the conceptual-station scene (src/station) with a tree-shaken
// three.js into a single lazy-loaded ES module. Output is committed so the
// GitHub Pages site itself needs no build step.
import { build } from "esbuild";
import { statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const outfile = "assets/js/station.min.js";
await build({
  entryPoints: ["src/station/index.js"],
  bundle: true,
  format: "esm",
  minify: true,
  target: ["es2020", "safari15"],
  legalComments: "eof",
  outfile,
  logLevel: "warning",
});
const bytes = statSync(outfile).size;
const gz = gzipSync(readFileSync(outfile), { level: 9 }).length;
console.log(`${outfile}: ${(bytes / 1024).toFixed(1)} KiB (${(gz / 1024).toFixed(1)} KiB gzip)`);
