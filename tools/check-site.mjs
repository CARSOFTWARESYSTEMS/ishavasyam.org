// Link & asset checker: every local href/src/srcset in the published pages
// must resolve to a file (GitHub Pages routing), every in-page #anchor must
// exist, and (with --external) external links must answer 2xx/3xx.
import { existsSync, readFileSync } from "node:fs";

const pages = { "/": "index.html", "/philosophy": "philosophy.html" };
const external = process.argv.includes("--external");
let failures = 0;
const fail = (m) => { failures++; console.error("✗", m); };

function resolveLocal(url) {
  const path = url.split(/[?#]/)[0];
  if (path === "/" || path === "") return "index.html";
  const clean = path.replace(/^\//, "");
  for (const c of [clean, `${clean}.html`, `${clean}/index.html`]) if (existsSync(c)) return c;
  return null;
}

const externalUrls = new Set();
for (const [route, file] of Object.entries(pages)) {
  const html = readFileSync(file, "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [
    ...[...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+/)[0])),
  ];
  for (const ref of refs) {
    if (/^(mailto:|tel:|data:)/.test(ref)) continue;
    if (/^https?:\/\//.test(ref)) {
      if (ref.startsWith("https://ishavasyam.org/")) {
        const local = ref.replace("https://ishavasyam.org", "");
        if (!resolveLocal(local)) fail(`${file}: ${ref} does not resolve locally`);
      } else externalUrls.add(ref);
      continue;
    }
    if (ref.startsWith("#")) {
      if (ref.length > 1 && !ids.has(ref.slice(1))) fail(`${file}: missing anchor ${ref}`);
      continue;
    }
    const abs = ref.startsWith("/") ? ref : `/${ref}`;
    if (!resolveLocal(abs)) fail(`${file}: ${ref} does not resolve`);
    const hash = ref.split("#")[1];
    if (hash && abs.split("#")[0] !== route) {
      const target = readFileSync(resolveLocal(abs), "utf8");
      if (!new RegExp(`\\sid="${hash}"`).test(target)) fail(`${file}: ${ref} anchor not found in target`);
    }
  }
  console.log(`✓ ${file}: ${refs.length} references checked`);
}

if (external) {
  for (const url of [...externalUrls].filter((u) => !/fonts\.(googleapis|gstatic)|googletagmanager|schema\.org/.test(u))) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (res.status >= 400) fail(`${url} → HTTP ${res.status}`);
      else console.log(`✓ ${res.status} ${url}`);
    } catch (e) {
      fail(`${url} → ${e.message}`);
    }
  }
}
if (failures) {
  console.error(`${failures} problem(s)`);
  process.exit(1);
}
