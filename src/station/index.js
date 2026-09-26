import {
  ACESFilmicToneMapping,
  BackSide,
  DirectionalLight,
  Mesh,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { createEarthBackdrop } from "./earth.js";
import { buildStation } from "./model.js";

/*
 * Conceptual space station hero — progressive enhancement layer.
 * The page's poster image (rendered from this same scene) remains the LCP
 * element and the fallback; this module only fades a live canvas over it.
 */

const DEG = Math.PI / 180;

/** Framings. `aspect`/`vfov` define a reference frame that is "cover"-fitted
 *  to the container, exactly like the poster's CSS object-fit: cover. */
export const COMPOSITIONS = {
  // 3:2 reference with the same horizontal field of view as a 16:9 / 31° frame, so every
  // landscape desktop from 3:2 to ultrawide keeps the station at the same share of the width.
  wide: { aspect: 3 / 2, vfov: 36.39, shift: [0.345, 0.045], dist: 156, az: 48, el: 13.5, roll: -4.5 },
  band: { aspect: 4 / 3, vfov: 37, shift: [-0.03, 0.08], dist: 131, az: 48, el: 14, roll: -3.5 },
  og: { aspect: 1200 / 630, vfov: 30, shift: [0.27, 0.06], dist: 152, az: 48, el: 13.5, roll: -4.5 },
};

export const TIERS = {
  high: { maxDpr: 1.75, shadow: 2048, land: 6, cloud: 6, fps: 60 },
  medium: { maxDpr: 1.25, shadow: 1024, land: 4, cloud: 4, fps: 30 },
};

const STATION_CENTER = new Vector3(0, 3.0, -1.5);

/** Give the main thread back between initialisation steps so input stays responsive. */
const pause = () =>
  new Promise((resolve) => (globalThis.scheduler && scheduler.yield ? scheduler.yield().then(resolve) : setTimeout(resolve, 0)));

function environment(renderer) {
  // Earth-lit environment for image-based lighting: bright blue-white below
  // the ~20° horizon dip, black space above with a thin limb band.
  const scene = new Scene();
  const mat = new ShaderMaterial({
    side: BackSide,
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vDir;
      void main(){
        float y = vDir.y; float hz = -0.347;
        vec3 earth = mix(vec3(0.20,0.34,0.56), vec3(0.10,0.20,0.38), smoothstep(hz, -1.0, y)) * 1.15;
        vec3 limb = vec3(0.35,0.55,1.0) * exp(-max(y - hz, 0.0) * 28.0) * 0.8;
        vec3 c = y < hz ? earth : limb;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new Mesh(new SphereGeometry(50, 48, 24), mat));
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 200);
  pmrem.dispose();
  mat.dispose();
  return rt.texture;
}

/**
 * Mount the live scene into `container`. Initialisation is split into yielded
 * steps and shaders compile in parallel (KHR_parallel_shader_compile where
 * available), so no single task blocks input for long.
 * @param {HTMLElement} container
 * @param {{ tier?: 'high'|'medium', composition?: 'wide'|'band'|'og', staticFrame?: boolean,
 *           time?: number, pixelRatio?: number, pointer?: boolean,
 *           onFirstFrame?: () => void, onDegrade?: (reason: string) => void }} [opts]
 */
export async function mountStation(container, opts = {}) {
  const tier = TIERS[opts.tier] || TIERS.high;
  let comp = COMPOSITIONS[opts.composition] || COMPOSITIONS.wide;
  const staticFrame = !!opts.staticFrame;

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: staticFrame,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x03040c, 1);
  let dpr = opts.pixelRatio || Math.min(window.devicePixelRatio || 1, tier.maxDpr);
  renderer.setPixelRatio(dpr);

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "station-canvas";
  canvas.style.cssText = "display:block;width:100%;height:100%";
  container.appendChild(canvas);
  await pause();

  const scene = new Scene();
  scene.environment = environment(renderer);
  scene.environmentIntensity = 0.55;
  await pause();

  const camera = new PerspectiveCamera(comp.vfov, comp.aspect, 1, 2000);
  const backdrop = createEarthBackdrop({ landOctaves: tier.land, cloudOctaves: tier.cloud });
  scene.add(backdrop.mesh);

  const { root, station, wings } = buildStation(renderer.capabilities.getMaxAnisotropy() > 4 ? 8 : 4);
  root.position.copy(STATION_CENTER).multiplyScalar(-1);
  scene.add(root);
  await pause();

  const sun = new DirectionalLight(0xfff6ea, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadow, tier.shadow);
  const sc = sun.shadow.camera;
  sc.left = -56;
  sc.right = 56;
  sc.top = 56;
  sc.bottom = -56;
  sc.near = 1;
  sc.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  // ---- camera framing -------------------------------------------------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const basis = { right: new Vector3(), up: new Vector3(), back: new Vector3() };
  const sunBase = new Vector3();

  function placeCamera(t) {
    const az = (comp.az + Math.sin(t * 0.021) * 1.4 + pointer.x * 1.6) * DEG;
    const el = (comp.el + Math.sin(t * 0.017 + 1.3) * 0.5 - pointer.y * 0.9) * DEG;
    camera.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(comp.dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(comp.roll * DEG);
    camera.updateMatrixWorld();
  }

  function frame(w, h) {
    const a = w / h;
    let vfov = comp.vfov;
    let [sx, sy] = comp.shift;
    if (a >= comp.aspect) {
      const tanH = Math.tan((comp.vfov / 2) * DEG) * comp.aspect;
      vfov = (2 * Math.atan(tanH / a)) / DEG;
      sy *= a / comp.aspect;
    } else {
      sx *= comp.aspect / a;
    }
    camera.fov = vfov;
    camera.aspect = a;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -sx;
    camera.projectionMatrix.elements[9] = -sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    backdrop.uniforms.uPixelAngle.value = ((vfov * DEG) / (h * dpr));
  }

  // Sun: high and to the right, slightly behind the camera — a raking key light.
  placeCamera(0);
  camera.matrixWorld.extractBasis(basis.right, basis.up, basis.back);
  sunBase.copy(basis.right).multiplyScalar(0.55).addScaledVector(basis.up, 0.62).addScaledVector(basis.back, 0.58).normalize();
  if (sunBase.y < 0.35) sunBase.y = 0.35;
  sunBase.normalize();

  let width = 0;
  let height = 0;
  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === width && h === height) return false;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    frame(w, h);
    return true;
  }

  const sunDir = new Vector3();
  const local = new Vector3();
  function update(t) {
    // station: extremely slow attitude drift
    station.rotation.y = Math.sin(t * 0.012) * 0.07;
    station.rotation.x = Math.sin(t * 0.009 + 0.6) * 0.018;
    station.rotation.z = Math.sin(t * 0.007 + 2.1) * 0.012;
    station.updateMatrixWorld();

    // sun: a few degrees of slow change over minutes
    sunDir.copy(sunBase).applyAxisAngle(new Vector3(0, 1, 0), Math.sin(t * 0.006) * 0.06).normalize();
    sun.position.copy(sunDir).multiplyScalar(160);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();

    // array wings rotate about the truss axis to face the Sun
    local.copy(sunDir).applyQuaternion(station.quaternion.clone().invert());
    const alpha = Math.atan2(-local.z, local.y);
    for (const w of wings) w.rotation.x = alpha;

    placeCamera(t);
    frame(width, height);
    backdrop.uniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    backdrop.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    backdrop.uniforms.uSunDir.value.copy(sunDir);
    backdrop.uniforms.uTime.value = t;
    backdrop.uniforms.uEarthRot.value = 0.35 + t * 0.0011;
  }

  resize();
  const t0 = opts.time || 0;
  update(t0);
  await renderer.compileAsync(scene, camera);
  await pause();

  if (staticFrame) {
    renderer.render(scene, camera);
    opts.onFirstFrame && opts.onFirstFrame();
    return { canvas, renderer, dispose: () => renderer.dispose() };
  }

  // ---- live loop --------------------------------------------------------
  let raf = 0;
  let running = false;
  let visible = true;
  let first = true;
  let last = 0;
  let clock = t0;
  const minDelta = 1000 / tier.fps - 2;
  const samples = [];
  let degraded = 0;

  function onPointer(e) {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }
  if (opts.pointer) window.addEventListener("pointermove", onPointer, { passive: true });

  function adapt(dt) {
    samples.push(dt);
    if (samples.length < 60) return;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples.length = 0;
    const budget = 1000 / tier.fps;
    if (avg > budget * 1.6) {
      if (degraded === 0 && dpr > 1) {
        degraded = 1;
        dpr = 1;
        renderer.setPixelRatio(dpr);
        width = 0;
        resize();
      } else if (degraded <= 1) {
        // still too slow: hold the current frame as a still image
        degraded = 2;
        stop();
        opts.onDegrade && opts.onDegrade("slow-frame-rate");
      }
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    const dt = now - last;
    if (dt < minDelta && !first) return;
    last = now;
    clock += Math.min(dt, 100) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    resize();
    update(clock);
    renderer.render(scene, camera);
    if (first) {
      first = false;
      opts.onFirstFrame && opts.onFirstFrame();
    } else {
      adapt(dt);
    }
  }

  function start() {
    if (running || degraded === 2) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      visible && !document.hidden ? start() : stop();
    },
    { threshold: 0 },
  );
  io.observe(container);
  function onVisibility() {
    document.hidden || !visible ? stop() : start();
  }
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    stop();
    opts.onDegrade && opts.onDegrade("context-lost");
  });

  start();

  return {
    canvas,
    renderer,
    setComposition(name) {
      if (COMPOSITIONS[name] && COMPOSITIONS[name] !== comp) {
        comp = COMPOSITIONS[name];
        width = 0;
        resize();
      }
    },
    dispose() {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      renderer.dispose();
      canvas.remove();
    },
  };
}
