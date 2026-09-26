import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { ARM, ARRAYS, COMMS, MODULES, OBSERVATION, PAYLOADS, PORTS, RADIATORS, SIDE_MODULE, TRUSS, TRUSS_BOTTOM, TRUSS_TOP } from "./layout.js";
import { foilTexture, radiatorTexture, shieldTexture, solarTexture } from "./textures.js";

const UP = new Vector3(0, 1, 0);

function makeMaterials(anisotropy) {
  const shieldMap = shieldTexture(anisotropy);
  shieldMap.repeat.set(3, 2);
  const foilMap = foilTexture(anisotropy);
  foilMap.repeat.set(3, 1);
  return {
    shield: new MeshStandardMaterial({ map: shieldMap, roughness: 0.84, metalness: 0.0 }),
    nodeShield: new MeshStandardMaterial({ map: shieldMap, color: 0xf2f0ea, roughness: 0.8, metalness: 0.0 }),
    metal: new MeshStandardMaterial({ color: 0xa9aeb6, roughness: 0.4, metalness: 0.78 }),
    darkMetal: new MeshStandardMaterial({ color: 0x40444c, roughness: 0.5, metalness: 0.6 }),
    truss: new MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.46, metalness: 0.7 }),
    white: new MeshStandardMaterial({ color: 0xe6e6e1, roughness: 0.55, metalness: 0.0 }),
    solar: new MeshStandardMaterial({ map: solarTexture(anisotropy), roughness: 0.3, metalness: 0.35 }),
    solarBack: new MeshStandardMaterial({ color: 0x8f9296, roughness: 0.75, metalness: 0.1 }),
    radiator: new MeshStandardMaterial({ map: radiatorTexture(anisotropy), roughness: 0.42, metalness: 0.0 }),
    foil: new MeshStandardMaterial({ map: foilMap, roughness: 0.34, metalness: 0.85 }),
    glass: new MeshStandardMaterial({ color: 0x0b1018, roughness: 0.07, metalness: 0.9 }),
  };
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Cylinder spanning two points. */
function strut(a, b, r, mat, radial = 10) {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new Mesh(new CylinderGeometry(r, r, len, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return shadowed(m);
}

/** Pressurised shell profile revolved about Y, then laid along Z. */
function shellGeometry(r, len, { endR = 1.05, taperAft = false } = {}) {
  const h = len / 2;
  const pts = [
    [endR, -h],
    [endR + 0.14, -h + 0.06],
    [endR + 0.14, -h + 0.34],
    [taperAft ? r * 0.72 : r * 0.9, -h + 0.95],
    [r, -h + (taperAft ? 2.4 : 1.35)],
    [r, h - 1.35],
    [r * 0.9, h - 0.95],
    [endR + 0.14, h - 0.34],
    [endR + 0.14, h - 0.06],
    [endR, h],
  ].map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(pts, 48);
  g.rotateX(Math.PI / 2);
  return g;
}

function buildModules(mats) {
  const g = new Group();
  for (const m of MODULES) {
    const len = m.z1 - m.z0;
    const zc = (m.z0 + m.z1) / 2;
    const isNode = m.kind === "node";
    const mesh = shadowed(
      new Mesh(
        shellGeometry(m.r, len, { endR: isNode ? 1.0 : 1.05, taperAft: m.kind === "service" }),
        isNode ? mats.nodeShield : mats.shield,
      ),
    );
    mesh.position.z = zc;
    g.add(mesh);

    // circumferential berthing rings where elements meet
    for (const z of [m.z0, m.z1]) {
      const ring = shadowed(new Mesh(new TorusGeometry(1.2, 0.09, 8, 40), mats.metal));
      ring.position.z = z;
      g.add(ring);
    }

    if (m.kind === "service") {
      // aft thermal blanket + propulsion
      const aft = shadowed(new Mesh(new CylinderGeometry(m.r * 0.74, m.r * 0.86, 2.2, 40, 1, true), mats.foil));
      aft.rotation.x = Math.PI / 2;
      aft.position.z = m.z0 + 1.3;
      g.add(aft);
      const nozzle = new CylinderGeometry(0.16, 0.34, 0.7, 16, 1, true);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const n = shadowed(new Mesh(nozzle, mats.darkMetal));
        n.rotation.x = -Math.PI / 2;
        n.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, m.z0 - 0.25);
        g.add(n);
      }
      const mainEngine = shadowed(new Mesh(new CylinderGeometry(0.28, 0.62, 1.1, 24, 1, true), mats.darkMetal));
      mainEngine.rotation.x = -Math.PI / 2;
      mainEngine.position.z = m.z0 - 0.5;
      g.add(mainEngine);
      // body-mounted avionics / tank bays
      for (const s of [-1, 1]) {
        const bay = shadowed(new Mesh(new BoxGeometry(0.5, 1.2, 3.8), mats.white));
        bay.position.set(s * (m.r + 0.2), 0, zc + 0.6);
        g.add(bay);
      }
    }

    if (m.id === "lab") {
      // external experiment attach points on the lab module
      for (const s of [-1, 1]) {
        const pallet = shadowed(new Mesh(new BoxGeometry(1.6, 0.25, 2.4), mats.metal));
        pallet.position.set(s * (m.r + 0.35), -0.4, zc + 2.4);
        pallet.rotation.z = s * 0.25;
        g.add(pallet);
        const box = shadowed(new Mesh(new BoxGeometry(1.1, 0.8, 1.2), s > 0 ? mats.foil : mats.white));
        box.position.set(s * (m.r + 0.55), 0.1, zc + 2.2);
        g.add(box);
      }
    }
  }

  // lateral module on the core node, laid along −X
  const sm = SIDE_MODULE;
  const sLen = Math.abs(sm.x1 - sm.x0);
  const side = shadowed(new Mesh(shellGeometry(sm.r, sLen), mats.shield));
  side.rotation.y = Math.PI / 2;
  side.position.x = (sm.x0 + sm.x1) / 2;
  g.add(side);
  for (const x of [sm.x0, sm.x1]) {
    const ring = shadowed(new Mesh(new TorusGeometry(1.2, 0.09, 8, 40), mats.metal));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    g.add(ring);
  }
  const rack = shadowed(new Mesh(new BoxGeometry(3.2, 0.9, 1.0), mats.foil));
  rack.position.set((sm.x0 + sm.x1) / 2 - 0.8, sm.r * 0.55, -sm.r - 0.2);
  g.add(rack);
  return g;
}

function buildPorts(mats) {
  const g = new Group();
  for (const p of PORTS) {
    const dir = new Vector3(...p.dir);
    const at = new Vector3(...p.at);
    const q = new Quaternion().setFromUnitVectors(UP, dir);
    const adapter = shadowed(new Mesh(new CylinderGeometry(0.95, 1.05, 0.9, 32), mats.metal));
    adapter.quaternion.copy(q);
    adapter.position.copy(at).addScaledVector(dir, 0.35);
    g.add(adapter);
    const ring = shadowed(new Mesh(new TorusGeometry(0.92, 0.1, 10, 36), mats.darkMetal));
    ring.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir));
    ring.position.copy(at).addScaledVector(dir, 0.85);
    g.add(ring);
    const cap = shadowed(
      new Mesh(new CylinderGeometry(0.82, 0.82, 0.06, 32), p.kind === "expansion" ? mats.white : mats.darkMetal),
    );
    cap.quaternion.copy(q);
    cap.position.copy(at).addScaledVector(dir, 0.82);
    g.add(cap);
  }
  return g;
}

function buildObservation(mats) {
  const g = new Group();
  const core = MODULES.find((m) => m.id === "core");
  const top = -core.r + 0.2;
  const body = shadowed(new Mesh(new CylinderGeometry(OBSERVATION.r, OBSERVATION.r, OBSERVATION.length, 40), mats.shield));
  body.position.y = top - OBSERVATION.length / 2;
  g.add(body);
  const dome = shadowed(new Mesh(new SphereGeometry(OBSERVATION.r * 0.94, 36, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.glass));
  dome.position.y = top - OBSERVATION.length;
  g.add(dome);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = strut(
      new Vector3(Math.cos(a) * OBSERVATION.r * 0.95, top - OBSERVATION.length, Math.sin(a) * OBSERVATION.r * 0.95),
      new Vector3(Math.cos(a) * 0.3, top - OBSERVATION.length - OBSERVATION.r * 0.85, Math.sin(a) * 0.3),
      0.06,
      mats.metal,
      6,
    );
    g.add(rib);
  }
  const ring = shadowed(new Mesh(new TorusGeometry(OBSERVATION.r, 0.1, 8, 40), mats.metal));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = top - OBSERVATION.length;
  g.add(ring);
  return g;
}

/** Triangular lattice truss as one instanced mesh (longerons, frames, diagonals). */
function buildTruss(mats) {
  const g = new Group();
  const L = TRUSS.halfLength;
  const a = TRUSS.side / 2;
  const hTop = (TRUSS.side * Math.sqrt(3)) / 6;
  const members = [];
  // (y, z) of the three longerons: flat zenith face, apex toward nadir
  const corners = [
    [hTop, -a],
    [hTop, a],
    [-2 * hTop, 0],
  ];
  for (const [y, z] of corners) members.push([new Vector3(-L, y, z), new Vector3(L, y, z), 0.13]);
  const bays = Math.round((2 * L) / TRUSS.bay);
  const step = (2 * L) / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -L + i * step;
    for (let k = 0; k < 3; k++) {
      const [y0, z0] = corners[k];
      const [y1, z1] = corners[(k + 1) % 3];
      members.push([new Vector3(x, y0, z0), new Vector3(x, y1, z1), 0.085]);
      if (i < bays) {
        const flip = (i + k) % 2 === 0;
        members.push([
          new Vector3(x, flip ? y0 : y1, flip ? z0 : z1),
          new Vector3(x + step, flip ? y1 : y0, flip ? z1 : z0),
          0.065,
        ]);
      }
    }
  }
  const box = new BoxGeometry(1, 1, 1);
  const inst = shadowed(new InstancedMesh(box, mats.truss, members.length));
  const m = new Matrix4();
  const q = new Quaternion();
  const X = new Vector3(1, 0, 0);
  members.forEach(([p0, p1, t], i) => {
    const d = new Vector3().subVectors(p1, p0);
    const len = d.length();
    q.setFromUnitVectors(X, d.normalize());
    m.compose(new Vector3().addVectors(p0, p1).multiplyScalar(0.5), q, new Vector3(len, t * 2, t * 2));
    inst.setMatrixAt(i, m);
  });
  inst.position.y = TRUSS.y;
  g.add(inst);
  // utility spine inside the lattice (power and data harness trays)
  const spine = shadowed(new Mesh(new BoxGeometry(2 * L - 2, 0.45, 0.6), mats.darkMetal));
  spine.position.y = TRUSS.y - 0.2;
  g.add(spine);

  // utility trays / orbital replacement units on the nadir face
  const oru = [
    [-27, mats.white, 2.2],
    [-21, mats.foil, 1.6],
    [-8.5, mats.white, 2.6],
    [12.5, mats.white, 2.2],
    [20.5, mats.foil, 1.4],
    [28.5, mats.white, 2.0],
  ];
  for (const [x, mat, w] of oru) {
    const b = shadowed(new Mesh(new BoxGeometry(w, 0.8, 1.5), mat));
    b.position.set(x, TRUSS_BOTTOM - 0.35, 0);
    g.add(b);
  }
  // structural adapter between truss and core node
  const core = MODULES.find((mm) => mm.id === "core");
  const adapter = shadowed(new Mesh(new BoxGeometry(2.4, TRUSS_BOTTOM - core.r + 0.5, 2.4), mats.metal));
  adapter.position.y = (TRUSS_BOTTOM + core.r - 0.5) / 2;
  g.add(adapter);
  // alpha joints (rotary joints feeding the array wings)
  for (const sx of [-1, 1]) {
    const joint = shadowed(new Mesh(new CylinderGeometry(2.0, 2.0, 1.4, 32), mats.metal));
    joint.rotation.z = Math.PI / 2;
    joint.position.set(sx * (ARRAYS.hubX - ARRAYS.width / 2 - 1.2), TRUSS.y, 0);
    g.add(joint);
  }
  return g;
}

/** Four roll-out photovoltaic wings; returns hub groups that rotate about X to track the Sun. */
function buildArrays(mats) {
  const wings = [];
  const g = new Group();
  const blanket = new PlaneGeometry(ARRAYS.width - 0.5, ARRAYS.length);
  blanket.rotateX(-Math.PI / 2); // lie in XZ, cells facing +Y
  const back = blanket.clone();
  back.rotateX(Math.PI);
  for (const sx of [-1, 1]) {
    const hub = new Group();
    hub.position.set(sx * ARRAYS.hubX, TRUSS.y, 0);
    hub.add(shadowed(new Mesh(new BoxGeometry(ARRAYS.width * 0.5, 1.3, 2.4), mats.metal)));
    for (const dz of [-1, 1]) {
      const zc = dz * (ARRAYS.root + ARRAYS.length / 2);
      const front = shadowed(new Mesh(blanket, mats.solar));
      front.position.set(0, 0.03, zc);
      const rear = shadowed(new Mesh(back, mats.solarBack));
      rear.position.set(0, -0.03, zc);
      hub.add(front, rear);
      // roll-out edge booms tension the blanket; mandrel at the root, tip spreader bar
      for (const ex of [-1, 1]) {
        const x = (ex * ARRAYS.width) / 2;
        hub.add(strut(new Vector3(x, 0, dz * 1.2), new Vector3(x, 0, dz * (ARRAYS.root + ARRAYS.length + 0.3)), 0.16, mats.metal, 10));
      }
      const tip = shadowed(new Mesh(new BoxGeometry(ARRAYS.width + 0.4, 0.26, 0.4), mats.metal));
      tip.position.z = dz * (ARRAYS.root + ARRAYS.length + 0.25);
      const root = shadowed(new Mesh(new CylinderGeometry(0.42, 0.42, ARRAYS.width + 0.3, 16), mats.darkMetal));
      root.rotation.z = Math.PI / 2;
      root.position.z = dz * (ARRAYS.root - 0.2);
      hub.add(tip, root);
      hub.add(strut(new Vector3(0, 0, dz * 1.1), new Vector3(0, 0, dz * (ARRAYS.root - 0.2)), 0.22, mats.metal, 8));
    }
    g.add(hub);
    wings.push(hub);
  }
  return { group: g, wings };
}

function buildRadiators(mats) {
  const g = new Group();
  for (const sx of [-1, 1]) {
    const wing = new Group();
    wing.position.set(sx * RADIATORS.x, TRUSS_BOTTOM - 0.2, 0);
    wing.rotation.z = sx * RADIATORS.tilt;
    const totalLen = RADIATORS.panels * (RADIATORS.panelLength + RADIATORS.gap);
    wing.add(
      strut(new Vector3(0, 0, 0.8), new Vector3(0, 0, RADIATORS.z0 - totalLen), 0.1, mats.metal, 6),
    );
    for (let i = 0; i < RADIATORS.panels; i++) {
      const p = shadowed(new Mesh(new BoxGeometry(RADIATORS.width, 0.08, RADIATORS.panelLength), mats.radiator));
      p.position.z = RADIATORS.z0 - RADIATORS.panelLength / 2 - i * (RADIATORS.panelLength + RADIATORS.gap);
      wing.add(p);
    }
    const joint = shadowed(new Mesh(new CylinderGeometry(0.45, 0.45, 1.0, 20), mats.darkMetal));
    joint.rotation.x = Math.PI / 2;
    joint.position.z = -0.4;
    wing.add(joint);
    g.add(wing);
  }
  return g;
}

function buildPayloads(mats) {
  const g = new Group();
  const top = TRUSS_TOP;
  const kit = [
    [1.0, 0.7, 0.9, "white", -0.6, -0.4],
    [0.7, 1.0, 0.7, "foil", 0.5, 0.3],
    [0.5, 0.5, 0.5, "darkMetal", 0.6, -0.6],
  ];
  for (const p of PAYLOADS) {
    const pallet = shadowed(new Mesh(new BoxGeometry(2.8, 0.22, 2.4), mats.metal));
    pallet.position.set(p.x, top + 0.2, p.z);
    g.add(pallet);
    kit.forEach(([w, h, d, mat, ox, oz], i) => {
      const b = shadowed(new Mesh(new BoxGeometry(w, h, d), mats[mat]));
      const flip = p.x < 0 ? -1 : 1;
      b.position.set(p.x + ox * flip, top + 0.3 + h / 2, p.z + oz + (i === 2 ? 0 : 0));
      g.add(b);
    });
    const sensor = shadowed(new Mesh(new CylinderGeometry(0.22, 0.22, 0.9, 16), mats.white));
    sensor.position.set(p.x - 0.9, top + 0.75, p.z + 0.7);
    sensor.rotation.x = -0.5;
    g.add(sensor);
  }
  return g;
}

function buildArm(mats) {
  const g = new Group();
  const top = TRUSS_TOP;
  const base = shadowed(new Mesh(new BoxGeometry(2.2, 0.5, 2.6), mats.darkMetal));
  base.position.set(ARM.baseX, top + 0.25, 0);
  g.add(base);
  const pts = ARM.joints.map((j) => new Vector3(...j));
  const radii = [0.3, 0.24, 0.22, 0.2];
  for (let i = 0; i < pts.length - 1; i++) {
    g.add(strut(pts[i], pts[i + 1], radii[i], i === 1 || i === 2 ? mats.white : mats.metal, 14));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const j = shadowed(new Mesh(new SphereGeometry(radii[i] * 1.55, 16, 12), mats.metal));
    j.position.copy(pts[i]);
    g.add(j);
  }
  const eff = shadowed(new Mesh(new CylinderGeometry(0.32, 0.32, 0.7, 16), mats.darkMetal));
  eff.position.copy(pts[pts.length - 1]);
  eff.quaternion.setFromUnitVectors(UP, new Vector3().subVectors(pts[pts.length - 1], pts[pts.length - 2]).normalize());
  g.add(eff);
  return g;
}

function buildComms(mats) {
  const g = new Group();
  const top = TRUSS_TOP;
  const a = new Vector3(COMMS.x, top, 0.6);
  const b = new Vector3(COMMS.x, top + COMMS.mast, 0.6);
  g.add(strut(a, b, 0.12, mats.metal, 8));
  const dish = new Group();
  const f = 0.6;
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const r = (i / 12) * COMMS.dish;
    prof.push(new Vector2(r, (r * r) / (4 * f)));
  }
  const bowl = shadowed(new Mesh(new LatheGeometry(prof, 40), new MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5, side: DoubleSide })));
  dish.add(bowl);
  const focus = new Vector3(0, f, 0);
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2;
    dish.add(strut(new Vector3(Math.cos(t) * COMMS.dish, (COMMS.dish * COMMS.dish) / (4 * f), Math.sin(t) * COMMS.dish), focus, 0.025, mats.metal, 5));
  }
  const feed = shadowed(new Mesh(new CylinderGeometry(0.1, 0.14, 0.25, 12), mats.darkMetal));
  feed.position.copy(focus);
  dish.add(feed);
  dish.position.copy(b);
  dish.rotation.set(-0.55, 0.4, 0.35);
  g.add(dish);
  // small low-gain antennas
  for (const [x, z] of [
    [-2.2, 1.2],
    [15.5, -1.0],
  ]) {
    g.add(strut(new Vector3(x, top, z), new Vector3(x, top + 1.4, z), 0.04, mats.metal, 5));
  }
  return g;
}

/**
 * Build the complete conceptual station. Returns the root group plus the
 * array wings (rotated each frame to track the Sun).
 */
export function buildStation(anisotropy = 4) {
  const mats = makeMaterials(anisotropy);
  const root = new Object3D();
  const station = new Group();
  root.add(station);
  station.add(buildModules(mats), buildPorts(mats), buildObservation(mats), buildTruss(mats), buildRadiators(mats), buildPayloads(mats), buildArm(mats), buildComms(mats));
  const arrays = buildArrays(mats);
  station.add(arrays.group);
  return { root, station, wings: arrays.wings };
}
