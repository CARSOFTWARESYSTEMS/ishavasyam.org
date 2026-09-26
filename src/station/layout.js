/**
 * Conceptual station layout — the single source of truth shared by the 3D
 * hero model (model.js) and the plan-view engineering schematic
 * (tools/gen-schematic.mjs). Units are metres.
 *
 * Frame: +X runs along the integrated truss, +Y is zenith (away from Earth),
 * +Z is the direction of flight along the pressurised module stack.
 *
 * This is an original, illustrative architecture. It is not a model of any
 * flown, planned or commercial station and carries no engineering validation.
 */

export const TRUSS = {
  halfLength: 40,
  side: 3.4, // triangular lattice cross-section (flat face toward zenith)
  bay: 3.4, // bay length between frames
  y: 5.4, // truss centroid height above the module axis
};
/** Zenith face / nadir apex of the triangular truss, relative to the module axis. */
export const TRUSS_TOP = TRUSS.y + (TRUSS.side * Math.sqrt(3)) / 6;
export const TRUSS_BOTTOM = TRUSS.y - (TRUSS.side * Math.sqrt(3)) / 3;

/** Pressurised elements along the flight axis (z0 → z1). */
export const MODULES = [
  { id: "service", kind: "service", z0: -23.5, z1: -14.6, r: 2.0, label: "Service & propulsion module" },
  { id: "hab", kind: "module", z0: -14.6, z1: -3.1, r: 2.15, label: "Habitation module" },
  { id: "core", kind: "node", z0: -3.1, z1: 3.1, r: 2.35, label: "Core node" },
  { id: "lab", kind: "module", z0: 3.1, z1: 15.2, r: 2.15, label: "Research laboratory module" },
  { id: "fwd", kind: "node", z0: 15.2, z1: 20.2, r: 1.9, label: "Forward docking node" },
];

/** Lateral element on the core node's starboard (−X) berthing port. */
export const SIDE_MODULE = { id: "side", x0: -2.35, x1: -10.8, r: 1.85, label: "Systems research module" };

/** Docking / berthing interfaces: position + outward axis. */
export const PORTS = [
  { id: "fwd-axial", at: [0, 0, 20.2], dir: [0, 0, 1], kind: "docking" },
  { id: "fwd-zenith", at: [0, 1.9, 17.7], dir: [0, 1, 0], kind: "docking" },
  { id: "fwd-nadir", at: [0, -1.9, 17.7], dir: [0, -1, 0], kind: "docking" },
  { id: "core-port", at: [2.35, 0, 0], dir: [1, 0, 0], kind: "expansion" },
  { id: "side-end", at: [-10.8, 0, 0], dir: [-1, 0, 0], kind: "expansion" },
];

/** Earth-facing observation module on the core node nadir port. */
export const OBSERVATION = { length: 3.0, r: 1.45 };

/** Deployable photovoltaic wings at each truss end, rotating about the truss axis. */
export const ARRAYS = {
  hubX: 36.4, // wing centreline (±X)
  width: 13.6, // roll-out blanket width along X, tensioned between two edge booms
  root: 2.8, // blanket root offset from the truss centreline
  length: 23.5, // blanket length
};

/** Thermal radiator wings extending aft from the truss. */
export const RADIATORS = {
  x: 17.5, // ±X
  width: 3.6,
  panels: 3,
  panelLength: 5.4,
  gap: 0.45,
  z0: -2.2, // first panel starts here and runs toward -Z
  tilt: 0.42, // rad, about the wing's long axis
};

/** External payload platforms on the truss (zenith side). */
export const PAYLOADS = [
  { id: "pl-1", x: 9.5, z: 0 },
  { id: "pl-2", x: -12.5, z: 0 },
  { id: "pl-3", x: 25.5, z: 0 },
];

/** Robotic manipulator on a truss base (plan-view joint path, metres). */
export const ARM = {
  baseX: -5.6,
  // joint chain in station coordinates (base → shoulder → elbow → wrist → end effector)
  joints: [
    [-5.6, 6.8, 0.4],
    [-6.4, 9.2, 3.2],
    [-9.8, 10.6, 9.0],
    [-11.6, 8.2, 13.4],
    [-11.9, 7.0, 14.6],
  ],
};

/** High-gain communications antenna on a truss mast. */
export const COMMS = { x: 4.4, mast: 2.8, dish: 1.25 };

/** Distributed health-monitoring sensor sites (for the station-health schematic). */
export const SENSORS = [
  [-36.4, 0], [36.4, 0], [-8, 0], [-17.5, -7.5], [17.5, -7.5], [0, 0], [0, 9], [0, -9], [0, 17.7],
  [0, -19], [9.5, 0], [-12.5, 0], [25.5, 0], [-24, 0], [-5.6, 0.4],
];

export const BOUNDS = { xMin: -44, xMax: 44, zMin: -28, zMax: 28 };
