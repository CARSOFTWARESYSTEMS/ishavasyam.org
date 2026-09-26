import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/*
 * Procedural surface textures, generated on the client from a few hundred
 * lines of 2D canvas drawing — nothing is downloaded. Deterministic PRNG so
 * the live scene matches the pre-rendered poster.
 */

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, anisotropy, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

/** Micrometeoroid-shield fabric: circumferential bands, seams and blanket patches. */
export function shieldTexture(anisotropy) {
  const rnd = prng(11);
  const c = canvas(512, 512);
  const g = c.getContext("2d");
  g.fillStyle = "#d9d6ce";
  g.fillRect(0, 0, 512, 512);
  // blanket patches with slight tonal variation
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 128) {
      const v = 205 + Math.floor(rnd() * 26);
      g.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
      g.fillRect(x + 1, y + 1, 126, 62);
    }
  }
  // stitched seams
  g.strokeStyle = "rgba(120,116,108,0.55)";
  g.lineWidth = 2;
  for (let y = 0; y <= 512; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  for (let x = 0; x <= 512; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  // handrail / grapple fixture hints
  g.fillStyle = "rgba(70,70,72,0.55)";
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 500;
    const y = rnd() * 500;
    g.fillRect(x, y, 3 + rnd() * 18, 3);
  }
  return finish(c, anisotropy);
}

/** Roll-out photovoltaic blanket: cell strings with bus-bars and a silver frame. */
export function solarTexture(anisotropy) {
  const rnd = prng(7);
  const w = 256;
  const h = 1024;
  const c = canvas(w, h);
  const g = c.getContext("2d");
  g.fillStyle = "#b9bec6";
  g.fillRect(0, 0, w, h);
  const cols = 8;
  const rows = 40;
  const cw = (w - 12) / cols;
  const ch = (h - 12) / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const t = rnd() * 10;
      g.fillStyle = `rgb(${14 + t},${26 + t},${56 + t * 1.6})`;
      g.fillRect(6 + i * cw + 1, 6 + j * ch + 1, cw - 2, ch - 2);
      g.fillStyle = "rgba(170,185,210,0.14)";
      g.fillRect(6 + i * cw + 1, 6 + j * ch + ch * 0.5, cw - 2, 1);
    }
  }
  // blanket hinge lines every 5 rows
  g.fillStyle = "rgba(200,205,215,0.8)";
  for (let j = 0; j <= rows; j += 5) g.fillRect(0, 6 + j * ch - 1, w, 2);
  return finish(c, anisotropy);
}

/** Radiator panel: white coating with embedded coolant tubes. */
export function radiatorTexture(anisotropy) {
  const c = canvas(128, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#e9e9e4";
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = "rgba(150,152,156,0.5)";
  g.lineWidth = 1.2;
  for (let x = 8; x < 128; x += 12) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  g.strokeStyle = "rgba(110,112,116,0.8)";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 253);
  return finish(c, anisotropy);
}

/** Crinkled thermal blanket (restrained gold/amber accent on the service module). */
export function foilTexture(anisotropy) {
  const rnd = prng(3);
  const c = canvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#a88542";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5 ? `rgba(245,214,150,${0.12 + v * 0.1})` : `rgba(70,50,20,${0.1 + v * 0.12})`;
    const x = rnd() * 256;
    const y = rnd() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 30);
    g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 50);
    g.closePath();
    g.fill();
  }
  return finish(c, anisotropy);
}
