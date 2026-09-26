// Minimal static server that mirrors GitHub Pages routing:
// "/philosophy" → philosophy.html, "/dir/" → dir/index.html, 404.html fallback.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = join(root, clean);
  const candidates = clean.endsWith("/") ? [join(base, "index.html")] : [base, base + ".html", join(base, "index.html")];
  for (const c of candidates) {
    try {
      if ((await stat(c)).isFile()) return c;
    } catch {}
  }
  return null;
}

export function startServer(p = port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = await resolve(url.pathname);
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("404");
    }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  });
  return new Promise((ok) => server.listen(p, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
  console.log(`http://localhost:${port}`);
}
