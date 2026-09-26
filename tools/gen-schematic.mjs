// Generates the plan-view engineering schematic of the conceptual station
// from src/station/layout.js (the same constants that build the 3D hero) and
// injects it into index.html between the station-plan markers.
//
// Every subsystem group uses CSS custom properties (--s-*, --f-*) so a <use>
// instance can highlight one frontier without duplicating the drawing.
import { readFileSync, writeFileSync } from "node:fs";
import { ARM, ARRAYS, COMMS, MODULES, OBSERVATION, PAYLOADS, PORTS, RADIATORS, SENSORS, SIDE_MODULE, TRUSS } from "../src/station/layout.js";

const f = (n) => Number(n.toFixed(2));
const VE = 'vector-effect="non-scaling-stroke"';
const rect = (x0, y0, x1, y1, cls, extra = "") =>
  `<rect class="${cls}" x="${f(Math.min(x0, x1))}" y="${f(Math.min(y0, y1))}" width="${f(Math.abs(x1 - x0))}" height="${f(Math.abs(y1 - y0))}" ${extra}${VE}/>`;
const line = (x0, y0, x1, y1, cls) => `<line class="${cls}" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" ${VE}/>`;
const circle = (x, y, r, cls) => `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${VE}/>`;
const poly = (pts, cls) => `<polyline class="${cls}" points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" ${VE}/>`;

// Plan projection: svg x = X, svg y = −Z (flight direction up).
const out = [];

// ---- Power & energy: photovoltaic wings -----------------------------------
const pw = [];
for (const sx of [-1, 1]) {
  const cx = sx * ARRAYS.hubX;
  const x0 = cx - ARRAYS.width / 2;
  const x1 = cx + ARRAYS.width / 2;
  for (const dz of [-1, 1]) {
    const y0 = -dz * ARRAYS.root;
    const y1 = -dz * (ARRAYS.root + ARRAYS.length);
    pw.push(rect(x0, y0, x1, y1, "p-power"));
    for (let i = 1; i < 4; i++) pw.push(line(x0 + (i * ARRAYS.width) / 4, y0, x0 + (i * ARRAYS.width) / 4, y1, "p-power-cell"));
    for (let j = 1; j < 6; j++) pw.push(line(x0, y0 + ((y1 - y0) * j) / 6, x1, y0 + ((y1 - y0) * j) / 6, "p-power-cell"));
  }
}
// radiators
for (const sx of [-1, 1]) {
  for (let i = 0; i < RADIATORS.panels; i++) {
    const z0 = RADIATORS.z0 - i * (RADIATORS.panelLength + RADIATORS.gap);
    pw.push(rect(sx * RADIATORS.x - RADIATORS.width / 2, -z0, sx * RADIATORS.x + RADIATORS.width / 2, -(z0 - RADIATORS.panelLength), "p-power"));
  }
}
out.push(`<g class="g-power">${pw.join("")}</g>`);

// ---- Station architecture: truss, joints, interfaces ------------------------
const ar = [];
const a = TRUSS.side / 2;
const L = TRUSS.halfLength;
ar.push(rect(-L, -a, L, a, "p-arch"));
const bays = Math.round((2 * L) / TRUSS.bay);
const step = (2 * L) / bays;
const zig = [];
for (let i = 0; i <= bays; i++) zig.push([-L + i * step, i % 2 ? a : -a]);
ar.push(poly(zig, "p-arch-lattice"));
for (const sx of [-1, 1]) {
  const jx = sx * (ARRAYS.hubX - ARRAYS.width / 2 - 1.2);
  ar.push(rect(jx - 0.7, -2.0, jx + 0.7, 2.0, "p-arch"));
  ar.push(rect(sx * ARRAYS.hubX - ARRAYS.width / 4, -1.2, sx * ARRAYS.hubX + ARRAYS.width / 4, 1.2, "p-arch"));
}
out.push(`<g class="g-arch">${ar.join("")}</g>`);

// ---- Life support: pressurised volume ---------------------------------------
const lf = [];
const neutral = [];
for (const m of MODULES) {
  const r = rect(-m.r, -m.z1, m.r, -m.z0, m.kind === "service" ? "p-base" : "p-life", `rx="${m.kind === "node" ? 1.2 : 0.9}" `);
  (m.kind === "service" ? neutral : lf).push(r);
}
lf.push(rect(SIDE_MODULE.x1, -SIDE_MODULE.r, SIDE_MODULE.x0, SIDE_MODULE.r, "p-life", 'rx="0.9" '));
lf.push(circle(0, 0, OBSERVATION.r, "p-life p-dashed"));
const svc = MODULES.find((m) => m.kind === "service");
for (const x of [-0.95, 0, 0.95]) neutral.push(line(x, -svc.z0, x, -svc.z0 + 0.8, "p-base"));
out.push(`<g class="g-base">${neutral.join("")}</g>`);
out.push(`<g class="g-life">${lf.join("")}</g>`);

// docking / berthing interfaces (architecture)
const ports = [];
for (const p of PORTS) {
  const [x, , z] = p.at;
  const [dx, dy, dz] = p.dir;
  if (dy !== 0) ports.push(circle(x, -z, 0.95, "p-arch p-port"));
  else ports.push(rect(x + (dx ? dx * 0.1 : -1.0), -z - (dz ? dz * 0.1 : 1.0), x + (dx ? dx * 0.95 : 1.0), -z - (dz ? dz * 0.95 : -1.0), "p-arch p-port"));
}
out.push(`<g class="g-arch">${ports.join("")}</g>`);

// ---- Robotics & operations: manipulator, payload platforms -----------------
const rb = [];
for (const p of PAYLOADS) rb.push(rect(p.x - 1.4, -p.z - 1.2, p.x + 1.4, -p.z + 1.2, "p-robo"));
const lab = MODULES.find((m) => m.id === "lab");
for (const sx of [-1, 1]) rb.push(rect(sx * (lab.r + 0.35) - 0.8, -((lab.z0 + lab.z1) / 2 + 2.4) - 1.2, sx * (lab.r + 0.35) + 0.8, -((lab.z0 + lab.z1) / 2 + 2.4) + 1.2, "p-robo"));
const armPts = ARM.joints.map(([x, , z]) => [x, -z]);
rb.push(poly(armPts, "p-robo p-arm"));
for (const [x, y] of armPts.slice(0, -1)) rb.push(circle(x, y, 0.55, "p-robo"));
out.push(`<g class="g-robo">${rb.join("")}</g>`);

// ---- Avionics & communications: antennas + data bus -------------------------
const av = [];
av.push(line(-L + 2, 0, L - 2, 0, "p-bus"));
av.push(line(0, -(MODULES.at(-1).z1 - 0.5), 0, -(svc.z0 + 0.5), "p-bus"));
av.push(line(0, 0, SIDE_MODULE.x1 + 0.5, 0, "p-bus"));
av.push(circle(COMMS.x, -0.6, COMMS.dish, "p-avio"));
av.push(circle(COMMS.x, -0.6, 0.25, "p-avio"));
for (const [x, y] of [
  [-2.2, -1.2],
  [15.5, 1.0],
]) av.push(circle(x, y, 0.35, "p-avio"));
const core = MODULES.find((m) => m.id === "core");
av.push(rect(-1.1, -1.1, 1.1, 1.1, "p-avio p-dashed"));
out.push(`<g class="g-avio">${av.join("")}</g>`);

// ---- Autonomous systems & station health: distributed sensing --------------
const hl = [];
for (const [x, z] of SENSORS) {
  const y = -z;
  const onTruss = Math.abs(y) < 0.01 || Math.abs(x) > 3;
  hl.push(onTruss ? line(x, y, x, 0, "p-net") : line(x, y, 0, y, "p-net"));
}
hl.push(line(-L + 2, 0, L - 2, 0, "p-net"));
hl.push(line(0, -(MODULES.at(-1).z1 - 0.5), 0, -(svc.z0 + 0.5), "p-net"));
for (const [x, z] of SENSORS) hl.push(circle(x, -z, 0.7, "p-health"));
out.push(`<g class="g-health">${hl.join("")}</g>`);

const symbol = `<symbol id="station-plan" viewBox="-46 -30 92 60">${out.join("")}</symbol>`;
void core;

const file = "index.html";
const html = readFileSync(file, "utf8");
const start = "<!-- station-plan:start -->";
const end = "<!-- station-plan:end -->";
const i = html.indexOf(start);
const j = html.indexOf(end);
if (i < 0 || j < 0) throw new Error("station-plan markers not found in index.html");
const next = html.slice(0, i + start.length) + `\n<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false"><defs>${symbol}</defs></svg>\n` + html.slice(j);
writeFileSync(file, next);
console.log(`station-plan symbol: ${(symbol.length / 1024).toFixed(1)} KiB`);
