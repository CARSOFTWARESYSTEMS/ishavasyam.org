import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Mesh, ShaderMaterial, Vector3 } from "three";

/*
 * Earth, atmospheric limb and a very restrained star field, drawn as one
 * full-screen pass. Each pixel's view ray is intersected analytically with a
 * 6371 km sphere seen from 420 km altitude, so the horizon dip (~20°) and
 * limb curvature are geometrically correct and no textures are downloaded.
 * The surface is procedural (simplex fBm) and illustrative only.
 */

const vertexShader = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vNdc;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uEarthRot;
uniform float uPixelAngle;

#define R 6371.0
#define ALT 420.0

// Simplex noise — Ashima Arts / Stefan Gustavson (MIT licence)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbmLand(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < LAND_OCT; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float fbmCloud(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < CLOUD_OCT; i++) { s += a * snoise(p); p = p * 2.11 + 3.1; a *= 0.52; }
  return s;
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float stars(vec3 rd) {
  const float K = 180.0;
  vec3 p = rd * K;
  vec3 id = floor(p);
  float h = hash13(id);
  if (h < 0.9935) return 0.0;
  vec3 c = id + 0.5 + (vec3(hash13(id + 1.7), hash13(id + 9.2), hash13(id + 4.4)) - 0.5) * 0.7;
  float d = length(p - c) / K;
  float w = max(uPixelAngle * 0.7, 1e-5);
  return exp(-(d * d) / (w * w)) * (0.12 + 0.5 * (h - 0.9935) / 0.0065);
}

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

// Fade a noise band out once it approaches the pixel footprint (prevents shimmer near the horizon).
float band(float freq, float fw) { return smoothstep(0.55, 0.12, fw * freq); }

vec3 surface(vec3 n, vec3 rd, vec3 sun, float mu) {
  vec3 q = rotX(uEarthRot) * n;
  float fw = length(fwidth(q));
  float warp = snoise(q * 2.4 + 4.0);
  float cont = fbmLand(q * 3.2 + warp * 0.35);
  cont += (snoise(q * 90.0) * 0.03 + snoise(q * 260.0) * 0.012 * band(260.0, fw)) * band(90.0, fw);
  float land = smoothstep(0.14, 0.17, cont);
  float shelf = smoothstep(0.06, 0.15, cont) * (1.0 - land);
  float tone = snoise(q * 22.0) * 0.5 + snoise(q * 90.0) * 0.3 * band(90.0, fw);
  vec3 ocean = mix(vec3(0.003, 0.016, 0.05), vec3(0.01, 0.06, 0.1), shelf);
  vec3 veg = vec3(0.03, 0.042, 0.02);
  vec3 arid = vec3(0.1, 0.082, 0.056);
  vec3 ground = mix(veg, arid, smoothstep(-0.4, 0.6, tone + cont * 1.2));
  vec3 albedo = mix(ocean, ground, land);

  // weather: large systems whose edges and interiors are broken up by band-limited detail
  vec3 cq = q * 4.2 + vec3(uTime * 0.0035, 0.0, uTime * 0.002);
  float sys = snoise(cq * 0.4 + 2.0);
  float cl = fbmCloud(cq + vec3(sys * 0.8, sys * 0.35, 0.0));
  float cover = smoothstep(-0.02, 0.4, cl + sys * 0.32);
  float det = snoise(q * 150.0 + cl * 2.0) * 0.55 * band(150.0, fw) + snoise(q * 430.0) * 0.3 * band(430.0, fw);
  float cloud = cover * smoothstep(-0.55, 0.15, det * 0.7 + cover * 0.6 - 0.3);
  float thin = smoothstep(-0.2, 0.25, cl) * 0.12 * (1.0 - cloud);
  cloud = clamp(cloud + thin, 0.0, 1.0);

  float ndl = dot(n, sun);
  float diff = max(ndl, 0.0);
  float term = smoothstep(-0.12, 0.18, ndl);

  vec3 col = albedo * diff * 2.4;
  // sun glint on open ocean
  vec3 hv = normalize(sun - rd);
  float spec = pow(max(dot(n, hv), 0.0), 240.0) * (1.0 - land) * (1.0 - cloud);
  float fres = 0.02 + 0.98 * pow(1.0 - mu, 5.0);
  col += vec3(1.0, 0.94, 0.85) * spec * 1.6 * term;
  col += vec3(0.35, 0.55, 0.9) * fres * 0.06 * term * (1.0 - land);
  // clouds: bright tops with a warm terminator
  vec3 cloudLit = mix(vec3(1.0, 0.72, 0.5), vec3(1.0), smoothstep(0.0, 0.35, ndl)) * (0.03 + diff * 1.2);
  col = mix(col, cloudLit, cloud);
  return col * (0.02 + term);
}

void main() {
  vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * normalize(v.xyz / v.w));
  vec3 ro = vec3(0.0, R + ALT, 0.0);
  vec3 sun = normalize(uSunDir);

  float b = dot(ro, rd);
  float c = ALT * (2.0 * R + ALT);
  float disc = b * b - c;

  // point of closest approach along the ray → tangent altitude
  float tc = max(-b, 0.0);
  vec3 pc = ro + rd * tc;
  float hc = length(pc) - R;
  float lit = smoothstep(-0.35, 0.3, dot(normalize(pc), sun));

  vec3 ray = vec3(0.16, 0.38, 1.0);
  vec3 col;
  if (disc > 0.0 && b < 0.0) {
    float t = -b - sqrt(disc);
    vec3 n = normalize(ro + rd * t);
    float mu = max(dot(n, -rd), 0.0);
    col = surface(n, rd, sun, mu);
    // aerial perspective: optical depth grows toward the horizon
    float day = smoothstep(-0.15, 0.35, dot(n, sun));
    float haze = 1.0 - exp(-0.05 / (mu + 0.02));
    vec3 hazeCol = mix(vec3(0.16, 0.34, 0.8), vec3(0.6, 0.76, 1.0), exp(-mu * 22.0)) * 0.85 * day;
    col = mix(col, hazeCol, clamp(haze, 0.0, 1.0));
    col += vec3(0.55, 0.75, 1.0) * exp(-mu * 70.0) * 0.55 * day;
  } else {
    float h = max(hc, 0.0);
    vec3 glow = ray * exp(-h / 11.0) * 1.25
              + vec3(0.55, 0.74, 1.0) * exp(-h / 3.0) * 0.9
              + ray * exp(-h / 45.0) * 0.07;
    col = glow * lit;
    // warm band where the limb meets the terminator
    col += vec3(1.0, 0.45, 0.2) * exp(-h / 6.0) * 0.25 * smoothstep(0.35, 0.0, abs(dot(normalize(pc), sun) - 0.02)) * lit;
    col += vec3(stars(rd)) * clamp(1.0 - exp(-h / 70.0) * 3.0, 0.0, 1.0);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createEarthBackdrop({ landOctaves = 6, cloudOctaves = 6 } = {}) {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: { LAND_OCT: landOctaves, CLOUD_OCT: cloudOctaves },
    uniforms: {
      uInvProj: { value: new Matrix4() },
      uCamRot: { value: new Matrix3() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uEarthRot: { value: 0 },
      uPixelAngle: { value: 0.001 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, uniforms: material.uniforms };
}
