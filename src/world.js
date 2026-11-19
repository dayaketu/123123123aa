// El mundo: función de altura, biomas, trozos de terreno (chunks), árboles y pasto.
// Todo es determinista a partir de SEED: el mismo mundo para todas las personas.
import * as THREE from 'three';
import { makeNoise, hash2, rng, smooth, clamp } from './noise.js';

export const SEED = 1117;
export const CH = 64;          // tamaño de un chunk (unidades ≈ metros)
export const LM = 150;         // tamaño de celda de "lugares" (faroles, fogatas…)
const S0 = 32, S1 = 8;         // segmentos por chunk: cerca / lejos

const nCont = makeNoise(SEED + 1), nHill = makeNoise(SEED + 2), nRidge = makeNoise(SEED + 3),
  nTemp = makeNoise(SEED + 4), nMoist = makeNoise(SEED + 5), nDet = makeNoise(SEED + 6), nLake = makeNoise(SEED + 7);

function fbm(n, x, z, oct) {
  let a = 1, f = 1, s = 0, t = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, z * f); t += a; a *= 0.5; f *= 2.03; }
  return s / t;
}

// 0 = mar profundo … 1 = alta montaña
function landAt(x, z) {
  let c = fbm(nCont, x * 0.0011, z * 0.0011, 3) * 0.75 + 0.5;
  const sp = smooth(320, 90, Math.hypot(x, z));   // cerca del origen: pradera amable
  return c + (0.56 - c) * sp;
}

export function heightAt(x, z) {
  const land = landAt(x, z);
  let h = (land - 0.38) * 75;
  h += fbm(nHill, x * 0.006, z * 0.006, 4) * 11 * smooth(0.3, 0.5, land);
  const m = smooth(0.62, 0.92, land);
  if (m > 0) { const r = 1 - Math.abs(fbm(nRidge, x * 0.0035, z * 0.0035, 4)); h += m * r * r * 85; }
  const lake = smooth(0.35, 0.7, nLake(x * 0.0042, z * 0.0042));
  h -= lake * 15 * (1 - m);
  h += nDet(x * 0.045, z * 0.045) * 0.55;
  if (h < 0) h *= 0.45;
  return h;
}

export function slopeAt(x, z) {
  return Math.hypot(heightAt(x + 1.5, z) - heightAt(x - 1.5, z), heightAt(x, z + 1.5) - heightAt(x, z - 1.5)) / 3;
}

// Pesos de bioma (0..1). El resto es pradera.
export function biomeAt(x, z, out = {}) {
  const temp = fbm(nTemp, x * 0.0017, z * 0.0017, 2);
  const moist = fbm(nMoist, x * 0.0021 + 50, z * 0.0021 - 30, 2);
  const forest = smooth(0.02, 0.24, moist);
  const gold = smooth(-0.06, -0.26, moist) * smooth(-0.15, 0.1, temp);
  const blossom = smooth(0.14, 0.32, temp) * (1 - forest) * (1 - gold);
  const lav = smooth(-0.14, -0.32, temp) * (1 - forest * 0.7);
  out.forest = forest; out.gold = gold; out.blossom = blossom; out.lav = lav;
  return out;
}

const C = (hex) => new THREE.Color(hex);
const COL = {
  meadow: C(0x7fbf66), meadow2: C(0xa6d67c), forest: C(0x4c8a55), gold: C(0xdcb95c), blossom: C(0xa3d98e),
  lav: C(0x95b590), sand: C(0xf0e2b4), rock: C(0x96929e), rock2: C(0x77738a), snow: C(0xf6f8fd),
  seabed: C(0x7cc4b6), deep: C(0x2f7088),
};
const TIP = { meadow: C(0xcdea8c), forest: C(0x86c672), gold: C(0xf6df94), blossom: C(0xd6f2a6), lav: C(0xbdd6a8) };

function groundColor(x, z, h, slope, b, out) {
  const v = nDet(x * 0.02 + 9, z * 0.02 - 4) * 0.5 + 0.5;
  out.copy(COL.meadow).lerp(COL.meadow2, v);
  out.lerp(COL.forest, b.forest * 0.85).lerp(COL.gold, b.gold).lerp(COL.blossom, b.blossom * 0.8).lerp(COL.lav, b.lav * 0.8);
  out.lerp(COL.sand, smooth(2.3, 0.9, h));
  if (h < 0.3) out.lerp(COL.seabed, smooth(0.3, -1.2, h)).lerp(COL.deep, smooth(-1.2, -6.5, h));
  const rk = Math.max(smooth(0.6, 0.95, slope), smooth(38, 52, h));
  out.lerp(v > 0.5 ? COL.rock : COL.rock2, rk);
  out.lerp(COL.snow, smooth(56, 66, h + v * 6) * (1 - smooth(1.1, 1.7, slope)));
  return out;
}

// ---------- Lugares deterministas (faroles, círculos, árboles viejos, fogatas, luces) ----------
const FIXED = {
  '0,0': { type: 'lantern', x: 34, z: 26 }, '-1,0': { type: 'wish', x: -20, z: 16 },
  '0,-1': { type: 'fire', x: 58, z: -52 }, '-1,-1': { type: 'tree', x: -72, z: -64 },
};
const lmCache = new Map();
export function landmarkAt(ci, cj) {
  const k = ci + ',' + cj;
  if (lmCache.has(k)) return lmCache.get(k);
  let res = null;
  const fx = FIXED[k], r = hash2(ci, cj, 71);
  const type = fx ? fx.type : r < 0.2 ? 'lantern' : r < 0.3 ? 'circle' : r < 0.38 ? 'tree' : r < 0.49 ? 'fire' : r < 0.76 ? 'wish' : null;
  if (type) for (let a = 0; a < 7 && !res; a++) {
    let x, z;
    if (fx) { x = fx.x + (a ? (hash2(ci, cj, 80 + a) - 0.5) * 80 : 0); z = fx.z + (a ? (hash2(ci, cj, 90 + a) - 0.5) * 80 : 0); }
    else { x = (ci + 0.15 + 0.7 * hash2(ci, cj, 80 + a)) * LM; z = (cj + 0.15 + 0.7 * hash2(ci, cj, 90 + a)) * LM; }
    const h = heightAt(x, z);
    if (h < 2.6 || h > 44 || slopeAt(x, z) > (type === 'wish' ? 0.5 : 0.28)) continue;
    res = { type, x, z, h, key: k, seed: hash2(ci, cj, 99) };
  }
  lmCache.set(k, res);
  return res;
}

// ---------- Uniforms compartidos por los shaders de vegetación ----------
export const shared = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
  uCall: { value: new THREE.Vector4(0, 0, -100, 0) },   // x, z, radio actual, fuerza
};

export function pickQuality() {
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560;
  const dpr = window.devicePixelRatio || 1;
  let force = new URLSearchParams(location.search).get('q');   // ?q=high o ?q=low
  try { force = force || localStorage.getItem('tt-quality'); } catch { /* sin almacenamiento */ }
  return (force === 'low' || force === 'high' ? force === 'low' : mobile)
    ? { mobile, hi: 2, far: 5, grass: 1, grassGrid: 30, blades: 3, dpr: Math.min(dpr, 1.5), fogFar: 300 }
    : { mobile, hi: 3, far: 7, grass: 1, grassGrid: 46, blades: 4, dpr: Math.min(dpr, 2), fogFar: 450 };
}

// ---------- Plantillas de vegetación (geometría de baja poligonización) ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function M(x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rz = 0) {
  _q.setFromEuler(_e.set(0, ry, rz));
  return _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz)).clone();
}
function part(geo, m, c0, c1, sw0 = 0, sw1 = 0) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.applyMatrix4(m);
  const p = geo.attributes.position.array, n = p.length / 3;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { y0 = Math.min(y0, p[i * 3 + 1]); y1 = Math.max(y1, p[i * 3 + 1]); }
  const a = C(c0), b = C(c1), t = new THREE.Color();
  const c = new Float32Array(n * 3), w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = (p[i * 3 + 1] - y0) / (y1 - y0 || 1);
    t.copy(a).lerp(b, k); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
    w[i] = sw0 + (sw1 - sw0) * k;
  }
  return { p: new Float32Array(p), c, w, n };
}
function tpl(...parts) {
  const n = parts.reduce((s, q) => s + q.n, 0);
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3), w = new Float32Array(n);
  let o = 0;
  for (const q of parts) { p.set(q.p, o * 3); c.set(q.c, o * 3); w.set(q.w, o); o += q.n; }
  return { p, c, w, n };
}
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const cyl = (a, b, h, s = 5) => new THREE.CylinderGeometry(a, b, h, s, 1, true);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);

function roundTree(trunk, lo, hi) {
  return tpl(
    part(cyl(0.22, 0.4, 3.4), M(0, 1.6, 0), trunk, trunk),
    part(ico(1.9, 1), M(0, 4.5, 0, 1, 0.86, 1), lo, hi, 0.1, 0.28),
    part(ico(1.25), M(1.25, 3.6, 0.4), lo, hi, 0.08, 0.2),
    part(ico(1.1), M(-0.95, 3.9, -0.8), lo, hi, 0.08, 0.2));
}
export const TPL = {
  round: roundTree(0x7a5a44, 0x4f9a55, 0x93d46c),
  dark: roundTree(0x66503f, 0x3d7f55, 0x6fba6a),
  autumn: roundTree(0x6e5040, 0xdd8338, 0xf5c650),
  red: roundTree(0x6e5040, 0xc2523a, 0xee9450),
  pine: tpl(
    part(cyl(0.2, 0.34, 2.4), M(0, 1.1, 0), 0x6b4f3d, 0x6b4f3d),
    part(cone(2.0, 3.0), M(0, 3.1, 0), 0x2c6753, 0x3f8763, 0.03, 0.1),
    part(cone(1.55, 2.7), M(0, 4.8, 0, 1, 1, 1, 0.5), 0x33725a, 0x4a966c, 0.08, 0.16),
    part(cone(1.05, 2.4), M(0, 6.4, 0, 1, 1, 1, 1.0), 0x3b7d60, 0x5cab78, 0.14, 0.26)),
  blossom: tpl(
    part(cyl(0.2, 0.36, 2.6), M(0, 1.2, 0), 0x5a4038, 0x5a4038),
    part(ico(2.0, 1), M(0, 3.7, 0, 1.18, 0.72, 1.18), 0xf08fb0, 0xffdbe8, 0.1, 0.26),
    part(ico(1.2), M(1.45, 3.1, 0.3), 0xf29cba, 0xffe3ee, 0.08, 0.2),
    part(ico(1.0), M(-1.15, 3.3, -0.9), 0xee86aa, 0xffd3e2, 0.08, 0.2)),
  birch: tpl(
    part(cyl(0.12, 0.19, 4.4), M(0, 2.1, 0), 0xd9d5c8, 0xf1eee6),
    part(ico(1.05), M(0, 4.8, 0), 0x9ccb70, 0xd0ea9c, 0.12, 0.3),
    part(ico(0.8), M(0.65, 3.9, 0.3), 0x9ccb70, 0xc6e492, 0.1, 0.22),
    part(ico(0.7), M(-0.55, 4.2, -0.4), 0x93c468, 0xc6e492, 0.1, 0.22)),
  bush: tpl(
    part(ico(0.8), M(0, 0.45, 0, 1.2, 0.8, 1.2), 0x4d8f52, 0x86c96a, 0.02, 0.08),
    part(ico(0.5), M(0.65, 0.35, 0.2), 0x4d8f52, 0x7cc064, 0.02, 0.06)),
  rock: tpl(part(ico(1), M(0, 0.3, 0, 1.3, 0.8, 1.0), 0x7d7a88, 0xb0adb8)),
};

// ---------- Materiales ----------
function floraMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = 'attribute float aSway;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float swPh = (position.x + modelMatrix[3].x) * 0.13 + (position.z + modelMatrix[3].z) * 0.11;
      transformed.x += sin(uTime * 1.1 + swPh) * aSway;
      transformed.z += cos(uTime * 0.9 + swPh * 1.3) * aSway * 0.7;`);
  };
  return m;
}
function grassMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uPlayer = shared.uPlayer; sh.uniforms.uCall = shared.uCall;
    sh.vertexShader = 'attribute vec3 aOff;\nuniform float uTime;\nuniform vec3 uPlayer;\nuniform vec4 uCall;\n' + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
      vec3 gRoot = (modelMatrix * vec4(position, 1.0)).xyz;
      float gScale = 1.0 - smoothstep(42.0, 62.0, distance(gRoot.xz, uPlayer.xz));
      float gRip = uCall.w * (1.0 - smoothstep(0.0, 3.0, abs(distance(gRoot.xz, uCall.xy) - uCall.z)));
      vColor.rgb *= 1.0 + gRip * 0.7 * step(0.05, aOff.y);`)
      .replace('#include <begin_vertex>', `
      vec3 gOff = aOff * gScale * (1.0 + gRip * 0.6);
      float gPh = gRoot.x * 0.21 + gRoot.z * 0.17;
      vec2 gWind = vec2(sin(uTime * 1.6 + gPh) + 0.5 * sin(uTime * 2.9 + gPh * 1.7), cos(uTime * 1.3 + gPh * 1.3)) * 0.15;
      gWind += vec2(0.42, 0.26) * smoothstep(0.2, 1.0, sin(uTime * 0.45 + gRoot.x * 0.035 + gRoot.z * 0.028));
      vec2 gDp = gRoot.xz - uPlayer.xz;
      float gPd = length(gDp);
      vec2 gPush = (gDp / max(gPd, 0.001)) * (1.0 - smoothstep(0.3, 1.7, gPd)) * 0.9 * (1.0 - smoothstep(0.6, 2.2, uPlayer.y - gRoot.y));
      vec3 transformed = position + gOff + vec3(gWind.x + gPush.x, -length(gPush) * 0.35, gWind.y + gPush.y) * gOff.y;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  return m;
}

// Flores por bioma: [color, forma] forma: 0 copa, 1 margarita, 2 espiga
const FL = {
  meadow: [[0xffffff, 1], [0xffd84a, 0], [0xf2634e, 0], [0xffffff, 1], [0xa6cdff, 0]],
  blossom: [[0xff9fc2, 0], [0xffffff, 1], [0xe96aa8, 0], [0xffc4d8, 1]],
  gold: [[0xff9b3d, 0], [0xffd24a, 0], [0xfff0c0, 1]],
  lav: [[0x9a7be0, 2], [0xb99cf0, 2], [0x8466d6, 2], [0xffffff, 1]],
  forest: [[0x86aaff, 0], [0xffffff, 1]],
};
for (const k in FL) FL[k] = FL[k].map(([c, s]) => [C(c), s]);
const STEM = C(0x5f9a4e);

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.lod = -1;
    this.terrain = null; this.flora = null; this.grass = null;
    this.trees = []; this.H = null; this.col = null; this.B = null;
  }
  // altura bilineal desde la rejilla (coordenadas locales al chunk)
  sampleH(lx, lz) {
    const st = CH / S0, W = S0 + 3, fx = lx / st + 1, fz = lz / st + 1;
    const i = clamp(Math.floor(fx), 0, W - 2), j = clamp(Math.floor(fz), 0, W - 2);
    const u = fx - i, v = fz - j, H = this.H;
    const a = H[i + j * W], b = H[i + 1 + j * W], c = H[i + (j + 1) * W], d = H[i + 1 + (j + 1) * W];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  vert(lx, lz) {
    const st = CH / S0;
    return clamp(Math.round(lx / st), 0, S0) + clamp(Math.round(lz / st), 0, S0) * (S0 + 1);
  }
}

export class World {
  constructor(scene, q) {
    this.scene = scene; this.q = q;
    this.chunks = new Map(); this.queue = [];
    this.pcx = 1e9; this.pcz = 1e9;
    this.matTerrain = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.matFlora = floraMaterial();
    this.matGrass = grassMaterial();
  }

  update(px, pz, budget = 5) {
    const pcx = Math.floor(px / CH), pcz = Math.floor(pz / CH);
    if (pcx !== this.pcx || pcz !== this.pcz) { this.pcx = pcx; this.pcz = pcz; this.plan(); }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budget) this.run(this.queue.shift());
  }
  prime(px, pz) { this.update(px, pz, 1e9); }

  plan() {
    const { hi, far, grass } = this.q, { pcx, pcz } = this;
    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > far + 1) { this.dispose(c); this.chunks.delete(k); }
    }
    const jobs = [];
    for (let dz = -far; dz <= far; dz++) for (let dx = -far; dx <= far; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dz)), k = (pcx + dx) + ',' + (pcz + dz);
      let c = this.chunks.get(k);
      if (!c) { c = new Chunk(pcx + dx, pcz + dz); this.chunks.set(k, c); }
      const lod = d <= hi || (c.lod === 0 && d <= hi + 1) ? 0 : 1;   // con histéresis
      if (c.lod !== lod) jobs.push({ c, lod, d });
      if (lod === 0 && d <= grass && !c.grass) jobs.push({ c, grass: true, d: d + 0.5 });
      if (c.grass && d > grass + 1) this.drop(c, 'grass');
    }
    this.queue = jobs.sort((a, b) => a.d - b.d);
  }

  run(job) {
    const c = job.c;
    if (job.grass) { if (c.lod === 0 && !c.grass) this.buildGrass(c); return; }
    this.drop(c, 'terrain'); this.drop(c, 'flora');
    if (job.lod === 1) { this.drop(c, 'grass'); c.H = c.col = c.B = null; c.trees = []; }
    this.buildTerrain(c, job.lod);
    if (job.lod === 0) this.buildFlora(c);
  }

  drop(c, name) {
    const m = c[name];
    if (m) { this.scene.remove(m); m.geometry.dispose(); c[name] = null; }
  }
  dispose(c) { this.drop(c, 'terrain'); this.drop(c, 'flora'); this.drop(c, 'grass'); }

  add(c, name, geo, mat) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.cx * CH, 0, c.cz * CH);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.scene.add(mesh); c[name] = mesh;
    return mesh;
  }

  buildTerrain(c, lod) {
    const S = lod === 0 ? S0 : S1, st = CH / S, W = S + 3, ox = c.cx * CH, oz = c.cz * CH;
    const H = new Float32Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) H[i + j * W] = heightAt(ox + (i - 1) * st, oz + (j - 1) * st);
    const nv = (S + 1) * (S + 1), nsk = 4 * (S + 1), depth = lod === 0 ? 5 : 16;
    const pos = new Float32Array((nv + nsk) * 3), col = new Float32Array((nv + nsk) * 3);
    const B = lod === 0 ? new Float32Array(nv * 4) : null;
    const b = {}, cc = new THREE.Color();
    let k = 0;
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++, k++) {
      const h = H[i + 1 + (j + 1) * W];
      const sx = (H[i + 2 + (j + 1) * W] - H[i + (j + 1) * W]) / (2 * st), sz = (H[i + 1 + (j + 2) * W] - H[i + 1 + j * W]) / (2 * st);
      const wx = ox + i * st, wz = oz + j * st;
      biomeAt(wx, wz, b);
      groundColor(wx, wz, h, Math.hypot(sx, sz), b, cc);
      pos[k * 3] = i * st; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * st;
      col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
      if (B) { B[k * 4] = b.forest; B[k * 4 + 1] = b.gold; B[k * 4 + 2] = b.blossom; B[k * 4 + 3] = b.lav; }
    }
    const idx = new Uint16Array(S * S * 6 + 4 * S * 6);
    let n = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = i + j * (S + 1), bb = a + 1, cI = a + S + 1, d = cI + 1;
      idx[n++] = a; idx[n++] = cI; idx[n++] = bb; idx[n++] = bb; idx[n++] = cI; idx[n++] = d;
    }
    // faldones: tapan las rendijas entre chunks de distinta resolución
    const edge = [(t) => t, (t) => t + S * (S + 1), (t) => t * (S + 1), (t) => S + t * (S + 1)];
    for (let e = 0; e < 4; e++) for (let t = 0; t <= S; t++) {
      const src = edge[e](t), dst = nv + e * (S + 1) + t;
      pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - depth; pos[dst * 3 + 2] = pos[src * 3 + 2];
      col[dst * 3] = col[src * 3]; col[dst * 3 + 1] = col[src * 3 + 1]; col[dst * 3 + 2] = col[src * 3 + 2];
      if (t < S) {
        const a = src, bb = edge[e](t + 1), a2 = dst, b2 = dst + 1;
        idx[n++] = a; idx[n++] = a2; idx[n++] = bb; idx[n++] = bb; idx[n++] = a2; idx[n++] = b2;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.add(c, 'terrain', geo, this.matTerrain);
    c.lod = lod;
    if (lod === 0) { c.H = H; c.col = col; c.B = B; }
  }

  buildFlora(c) {
    const r = rng((hash2(c.cx, c.cz, 3) * 4294967296) >>> 0);
    const N = 8, cell = CH / N, ox = c.cx * CH, oz = c.cz * CH, inst = [];
    c.trees = [];
    let total = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const lx = (i + 0.12 + 0.76 * r()) * cell, lz = (j + 0.12 + 0.76 * r()) * cell;
      const rr = r(), rt = r(), rs = r(), ra = r() * 6.283, rc = r();
      const h = c.sampleH(lx, lz);
      if (h < 1.9 || h > 54) continue;
      const slope = Math.hypot(c.sampleH(lx + 1, lz) - c.sampleH(lx - 1, lz), c.sampleH(lx, lz + 1) - c.sampleH(lx, lz - 1)) / 2;
      if (slope > 0.75) continue;
      const wx = ox + lx, wz = oz + lz;
      if (wx * wx + wz * wz < 90) continue;
      const lm = landmarkAt(Math.floor(wx / LM), Math.floor(wz / LM));
      if (lm && lm.type !== 'wish' && (wx - lm.x) ** 2 + (wz - lm.z) ** 2 < (lm.type === 'tree' ? 200 : 110)) continue;
      const v = c.vert(lx, lz) * 4, bf = c.B[v], bg = c.B[v + 1], bb = c.B[v + 2], bl = c.B[v + 3];
      const alt = smooth(34, 50, h);
      const dens = (0.07 + 0.62 * bf + 0.3 * bb + 0.05 * bg + 0.1 * bl) * (1 - alt * 0.8) * smooth(1.9, 3.6, h);
      const rockP = 0.035 + alt * 0.14 + smooth(0.4, 0.7, slope) * 0.2;
      let t = null, s = 0.75 + 0.7 * rs, coll = 0;
      if (rr < dens) {
        const wm = Math.max(0.05, 1 - bf - bb - bg - bl), sum = bf + bb + bg + bl + wm;
        let x = rt * sum;
        if (alt > 0.5) t = TPL.pine;
        else if ((x -= bf) < 0) t = rc < 0.68 ? TPL.pine : TPL.dark;
        else if ((x -= bb) < 0) t = rc < 0.8 ? TPL.blossom : TPL.bush;
        else if ((x -= bg) < 0) t = rc < 0.5 ? TPL.autumn : rc < 0.8 ? TPL.red : TPL.bush;
        else if ((x -= bl) < 0) t = rc < 0.75 ? TPL.birch : TPL.bush;
        else t = rc < 0.6 ? TPL.round : rc < 0.75 ? TPL.birch : TPL.bush;
        if (rs > 0.95) s *= 1.35;
        coll = t === TPL.bush ? 0 : 0.42 * s;
      } else if (rr < dens + rockP) { t = TPL.rock; s = 0.5 + rs * rs * 2.4; coll = 0.95 * s; }
      else if (rr < dens + rockP + 0.04 && alt < 0.3) { t = TPL.bush; }
      if (!t) continue;
      inst.push({ t, x: lx, y: h - 0.08, z: lz, s, sy: s * (0.9 + 0.25 * rc), rot: ra, tr: 0.9 + 0.2 * rt, tg: 0.93 + 0.14 * rc });
      total += t.n;
      if (coll) c.trees.push({ x: wx, z: wz, r: coll });
    }
    if (!total) return;
    const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), sw = new Float32Array(total);
    let o = 0;
    for (const it of inst) {
      const { p, c: tc, w, n } = it.t, cs = Math.cos(it.rot), sn = Math.sin(it.rot);
      for (let vI = 0; vI < n; vI++, o++) {
        const x = p[vI * 3] * it.s, y = p[vI * 3 + 1] * it.sy, z = p[vI * 3 + 2] * it.s;
        pos[o * 3] = x * cs + z * sn + it.x; pos[o * 3 + 1] = y + it.y; pos[o * 3 + 2] = -x * sn + z * cs + it.z;
        col[o * 3] = tc[vI * 3] * it.tr; col[o * 3 + 1] = tc[vI * 3 + 1] * it.tg; col[o * 3 + 2] = tc[vI * 3 + 2] * it.tr;
        sw[o] = w[vI] * it.s;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    geo.computeBoundingSphere();
    this.add(c, 'flora', geo, this.matFlora);
  }

  buildGrass(c) {
    const G = this.q.grassGrid, NB = this.q.blades, cell = CH / G, ox = c.cx * CH, oz = c.cz * CH;
    const r = rng((hash2(c.cx, c.cz, 5) * 4294967296) >>> 0);
    const max = G * G * (NB * 3 + 15);
    const pos = new Float32Array(max * 3), off = new Float32Array(max * 3), col = new Float32Array(max * 3), nor = new Float32Array(max * 3);
    const base = new THREE.Color(), tip = new THREE.Color(), fc = new THREE.Color();
    let o = 0, rx = 0, ry = 0, rz = 0, nx = 0, ny = 1, nz = 0;
    const put = (ax, ay, az, cl, k = 1) => {
      pos[o * 3] = rx; pos[o * 3 + 1] = ry; pos[o * 3 + 2] = rz;
      off[o * 3] = ax; off[o * 3 + 1] = ay; off[o * 3 + 2] = az;
      col[o * 3] = cl.r * k; col[o * 3 + 1] = cl.g * k; col[o * 3 + 2] = cl.b * k;
      nor[o * 3] = nx; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nz; o++;
    };
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const lx = (i + r()) * cell, lz = (j + r()) * cell, rd = r(), rf = r(), rk = r();
      const h = c.sampleH(lx, lz);
      if (h < 1.75 || h > 46) continue;
      const sx = (c.sampleH(lx + 1, lz) - c.sampleH(lx - 1, lz)) / 2, sz = (c.sampleH(lx, lz + 1) - c.sampleH(lx, lz - 1)) / 2;
      if (Math.hypot(sx, sz) > 0.62) continue;
      const v = c.vert(lx, lz), bf = c.B[v * 4], bg = c.B[v * 4 + 1], bb = c.B[v * 4 + 2], bl = c.B[v * 4 + 3];
      if (rd > (1 - 0.4 * bf) * smooth(1.75, 3, h) * (1 - smooth(36, 46, h))) continue;
      const il = 1 / Math.hypot(sx, 1, sz); nx = -sx * il; ny = il; nz = -sz * il;
      base.setRGB(c.col[v * 3], c.col[v * 3 + 1], c.col[v * 3 + 2]);
      tip.copy(TIP.meadow).lerp(TIP.forest, bf).lerp(TIP.gold, bg).lerp(TIP.blossom, bb).lerp(TIP.lav, bl);
      tip.lerp(base, 0.35);
      const tall = (0.5 + 0.5 * rk) * (1 + 0.9 * bg + 0.2 * bl);
      for (let b = 0; b < NB; b++) {
        const a = r() * 6.283, ca = Math.cos(a), sa = Math.sin(a), dx = (r() - 0.5) * 1.3, dz = (r() - 0.5) * 1.3;
        const w = 0.07 + 0.06 * r(), ln = (r() - 0.5) * 0.5, hh = tall * (0.7 + 0.6 * r());
        rx = lx + dx; rz = lz + dz; ry = h + sx * dx + sz * dz - 0.03;
        put(-ca * w, 0, -sa * w, base, 0.92); put(ca * w, 0, sa * w, base, 0.92); put(sa * ln, hh, ca * ln, tip);
      }
      // flores, agrupadas en manchas
      const patch = smooth(-0.15, 0.45, nDet((ox + lx) * 0.031, (oz + lz) * 0.031));
      const fp = (0.07 + 0.42 * bl + 0.08 * bb + 0.03 * bg - 0.04 * bf) * patch;
      if (rf < fp) {
        const set = bl > 0.5 ? FL.lav : bb > 0.5 ? FL.blossom : bg > 0.5 ? FL.gold : bf > 0.5 ? FL.forest : FL.meadow;
        const [fcol, shape] = set[Math.floor(rk * 997) % set.length];
        const fh = 0.45 + 0.45 * rk + (shape === 2 ? 0.2 : 0), s = 0.11 + 0.06 * rd, a = rk * 40, ca = Math.cos(a), sa = Math.sin(a);
        rx = lx; rz = lz; ry = h - 0.03;
        fc.copy(fcol);
        put(-0.03, 0, 0, STEM); put(0.03, 0, 0, STEM); put(0, fh, 0, STEM);
        if (shape === 1) {        // margarita: cuadradito mirando al cielo
          put(-s, fh, -s, fc); put(s, fh + 0.03, -s, fc); put(s, fh, s, fc);
          put(-s, fh, -s, fc); put(s, fh, s, fc); put(-s, fh + 0.03, s, fc);
        } else if (shape === 2) { // espiga
          put(-ca * 0.06, fh * 0.55, -sa * 0.06, fc, 0.85); put(ca * 0.06, fh * 0.55, sa * 0.06, fc, 0.85); put(0, fh * 1.25, 0, fc, 1.1);
          put(-sa * 0.06, fh * 0.55, ca * 0.06, fc, 0.85); put(sa * 0.06, fh * 0.55, -ca * 0.06, fc, 0.85); put(0, fh * 1.25, 0, fc, 1.1);
        } else {                  // copa: dos triángulos cruzados
          put(-ca * s, fh + s, -sa * s, fc); put(ca * s, fh + s, sa * s, fc); put(0, fh - s * 0.5, 0, fc, 0.8);
          put(-sa * s, fh + s, ca * s, fc); put(sa * s, fh + s, -ca * s, fc); put(0, fh - s * 0.5, 0, fc, 0.8);
        }
      }
    }
    if (!o) { c.grass = null; return; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, o * 3), 3));
    geo.setAttribute('aOff', new THREE.BufferAttribute(off.slice(0, o * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.slice(0, o * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, o * 3), 3));
    geo.computeBoundingSphere(); geo.boundingSphere.radius += 2.5;
    this.add(c, 'grass', geo, this.matGrass);
  }

  // Empuja un punto fuera de troncos y rocas cercanos.
  collide(p, rad) {
    const cx = Math.floor(p.x / CH), cz = Math.floor(p.z / CH);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!c) continue;
      for (const t of c.trees) {
        const ex = p.x - t.x, ez = p.z - t.z, d2 = ex * ex + ez * ez, m = t.r + rad;
        if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = (m - d) / d; p.x += ex * k; p.z += ez * k; }
      }
    }
  }
}
