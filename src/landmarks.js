// Lugares que encuentras al caminar: faroles de piedra, círculos de piedras, árboles viejos,
// fogatas y luces con un buen deseo. Nada de esto es una "misión": solo están ahí.
import * as THREE from 'three';
import { heightAt, landmarkAt, biomeAt, LM } from './world.js';
import { makeGlow } from './fx.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const MAT = {
  stone: lam(0x9d9aa8), stone2: lam(0x84818f), moss: lam(0x7f9a78), off: lam(0x4c4a56),
  on: new THREE.MeshBasicMaterial({ color: 0xffdc96 }), wood: lam(0x6b4c3a), bark: lam(0x6a5142),
  f1: new THREE.MeshBasicMaterial({ color: 0xff9a3c }), f2: new THREE.MeshBasicMaterial({ color: 0xffe28a }),
  leaf: { green: lam(0x4f9a58), pink: lam(0xf29cba), amber: lam(0xe39a3e) },
};
const GEO = {
  base: new THREE.CylinderGeometry(0.7, 0.86, 0.35, 6), pillar: new THREE.CylinderGeometry(0.2, 0.27, 1.3, 6),
  plat: new THREE.CylinderGeometry(0.62, 0.46, 0.2, 6), lamp: new THREE.BoxGeometry(0.66, 0.56, 0.66),
  roof: new THREE.ConeGeometry(0.98, 0.55, 4).rotateY(Math.PI / 4), box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  ico: new THREE.IcosahedronGeometry(1, 0), ico1: new THREE.IcosahedronGeometry(1, 1),
  log: new THREE.CylinderGeometry(0.13, 0.13, 1.3, 5).rotateZ(Math.PI / 2), flame: new THREE.ConeGeometry(0.34, 1, 5).translate(0, 0.5, 0),
  trunk: new THREE.CylinderGeometry(1.15, 2.3, 10, 7).translate(0, 5, 0), slab: new THREE.CylinderGeometry(1.5, 1.6, 0.25, 7),
};
export const WISH_COLORS = [0xfff2c0, 0xffd2e2, 0xcfe8ff, 0xd8ffd2, 0xf0dcff];
export const WISH_COUNT = 12;
const mesh = (parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
};

export class Landmarks {
  constructor(scene, fx, sound, save, panOf) {
    this.scene = scene; this.fx = fx; this.sound = sound; this.save = save; this.panOf = panOf;
    this.active = new Map(); this.ci = 1e9; this.cj = 1e9; this.t = 0;
    this.lights = [];            // luces dejadas por ti o por otras personas: {x,z,w,from,obj}
    this.scan = 0; this.near = null; this.fireNear = 0; this.warm = new THREE.PointLight(0xffb060, 0, 26, 1.5);
    scene.add(this.warm);
    for (const l of save.lights || []) this.lights.push({ x: l.x, z: l.z, w: l.w, from: 'me', obj: null });
  }

  build(lm) {
    const g = new THREE.Group(); g.position.set(lm.x, lm.h, lm.z);
    const o = { lm, g, type: lm.type, col: [], t: lm.seed * 100 };
    const S = Math.floor(lm.seed * 1e6);
    if (lm.type === 'lantern') {
      mesh(g, GEO.base, MAT.stone, 0, 0.12); mesh(g, GEO.pillar, MAT.stone2, 0, 0.95); mesh(g, GEO.plat, MAT.stone, 0, 1.7);
      o.lamp = mesh(g, GEO.lamp, MAT.off, 0, 2.08); mesh(g, GEO.roof, MAT.stone2, 0, 2.63); mesh(g, GEO.ico, MAT.moss, 0, 2.98, 0, 0.12);
      o.glow = makeGlow(0xffc878, 7, 0); o.glow.position.y = 2.1; g.add(o.glow);
      o.ember = makeGlow(0xffb060, 0.9, 0.5); o.ember.position.y = 2.08; g.add(o.ember);
      o.lit = !!this.save.lit[lm.key]; this.setLit(o, o.lit);
      o.col.push({ x: lm.x, z: lm.z, r: 0.8 });
    } else if (lm.type === 'circle') {
      o.stones = [];
      mesh(g, GEO.slab, MAT.stone, 0, 0.05);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.283 + lm.seed * 6, x = Math.cos(a) * 6.5, z = Math.sin(a) * 6.5;
        const hh = 2.5 + ((S >> i) & 3) * 0.4, y = heightAt(lm.x + x, lm.z + z) - lm.h - 0.3;
        const s = mesh(g, GEO.box, i % 2 ? MAT.stone : MAT.stone2, x, y, z, 1.0, hh, 0.62);
        s.rotation.set(((S >> (i + 3)) & 3) * 0.04 - 0.06, -a + 1.57, ((S >> (i + 5)) & 3) * 0.04 - 0.06);
        const gl = makeGlow(0xbfe0ff, 3.2, 0); gl.position.set(x, y + hh + 0.3, z); g.add(gl);
        o.stones.push({ gl, x: lm.x + x, z: lm.z + z, y: lm.h + y + hh });
        o.col.push({ x: lm.x + x, z: lm.z + z, r: 0.7 });
      }
      o.seq = -1; o.awake = 0;
    } else if (lm.type === 'tree') {
      const b = biomeAt(lm.x, lm.z), leaf = b.blossom > 0.4 ? MAT.leaf.pink : b.gold > 0.4 ? MAT.leaf.amber : MAT.leaf.green;
      mesh(g, GEO.trunk, MAT.bark, 0, -0.5);
      for (let i = 0; i < 5; i++) { const a = i * 1.257 + lm.seed; mesh(g, GEO.ico, MAT.bark, Math.cos(a) * 2.1, 0.2, Math.sin(a) * 2.1, 0.9, 0.7, 0.9); }
      mesh(g, GEO.ico1, leaf, 0, 13, 0, 8, 5.4, 8);
      for (let i = 0; i < 5; i++) { const a = i * 1.257 + lm.seed * 3; mesh(g, GEO.ico1, leaf, Math.cos(a) * 6.2, 10 + (i % 2) * 1.6, Math.sin(a) * 6.2, 4.2, 3.2, 4.2); }
      o.chimes = [];
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + lm.seed * 2, c = makeGlow(0xfff0c0, 1.5, 0.7);
        c.position.set(Math.cos(a) * 4.6, 5.4 + (i % 3) * 0.5, Math.sin(a) * 4.6); g.add(c); o.chimes.push(c);
      }
      o.col.push({ x: lm.x, z: lm.z, r: 2.4 }); o.ring = 0;
    } else if (lm.type === 'fire') {
      for (let i = 0; i < 7; i++) { const a = i * 0.898; mesh(g, GEO.ico, i % 2 ? MAT.stone : MAT.stone2, Math.cos(a) * 0.9, 0.08, Math.sin(a) * 0.9, 0.27, 0.2, 0.27); }
      for (let i = 0; i < 3; i++) { const l = mesh(g, GEO.log, MAT.wood, 0, 0.16, 0); l.rotation.y = i * 1.047; l.rotation.z = 0.25; }
      o.fl = [mesh(g, GEO.flame, MAT.f1, 0, 0.15, 0, 1, 1.05, 1), mesh(g, GEO.flame, MAT.f2, 0.05, 0.15, 0.04, 0.6, 0.7, 0.6)];
      o.glow = makeGlow(0xff9a48, 8, 0.4); o.glow.position.y = 0.8; g.add(o.glow);
      for (let i = 0; i < 2; i++) {
        const a = lm.seed * 6 + i * 2.6, x = Math.cos(a) * 2.8, z = Math.sin(a) * 2.8;
        const s = mesh(g, GEO.log, MAT.wood, x, heightAt(lm.x + x, lm.z + z) - lm.h + 0.26, z, 1.7, 2.2, 2.2); s.rotation.y = -a + 1.57;
        o.col.push({ x: lm.x + x, z: lm.z + z, r: 0.5 });
      }
      o.col.push({ x: lm.x, z: lm.z, r: 1.05 });
    } else if (lm.type === 'wish') {
      this.buildWish(o, Math.floor(lm.seed * 997) % WISH_COUNT, 'world');
    }
    this.scene.add(g);
    return o;
  }

  buildWish(o, w, from) {
    const g = o.g, col = WISH_COLORS[w % WISH_COLORS.length];
    mesh(g, GEO.ico, MAT.stone, 0, 0.1, 0, 0.34, 0.2, 0.3); mesh(g, GEO.ico, MAT.stone2, 0.03, 0.32, 0, 0.24, 0.15, 0.22); mesh(g, GEO.ico, MAT.stone, 0, 0.5, 0.02, 0.15, 0.1, 0.14);
    o.orb = mesh(g, GEO.ico1, new THREE.MeshBasicMaterial({ color: col }), 0, 1.35, 0, 0.17);
    o.glow = makeGlow(col, 3, 0.6); o.glow.position.y = 1.35; g.add(o.glow);
    o.w = w; o.from = from; o.type = 'wish';
  }

  setLit(o, lit) {
    o.lit = lit; o.lamp.material = lit ? MAT.on : MAT.off;
    o.glow.material.opacity = lit ? 0.55 : 0; o.ember.visible = !lit;
  }

  // Deja una luz tuya en el mundo.
  addLight(x, z, w, from = 'me') {
    const l = { x, z, w, from, obj: null };
    this.lights.push(l); this.scan = 0;
    if (from === 'me') {
      this.save.lights = this.lights.filter((q) => q.from === 'me').slice(-80).map((q) => ({ x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10, w: q.w }));
      this.fx.motes.burst(x, heightAt(x, z) + 1.3, z, WISH_COLORS[w % WISH_COLORS.length], 26, 2.4, 2.4);
      this.fx.rings.spawn(x, z, WISH_COLORS[w % WISH_COLORS.length], 9, 2.4);
      this.sound.lit();
    }
    return l;
  }

  refresh(px, pz) {
    const ci = Math.floor(px / LM), cj = Math.floor(pz / LM);
    if (ci === this.ci && cj === this.cj) return;
    this.ci = ci; this.cj = cj;
    const want = new Set();
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const lm = landmarkAt(ci + di, cj + dj);
      if (!lm) continue;
      want.add(lm.key);
      if (!this.active.has(lm.key)) this.active.set(lm.key, this.build(lm));
    }
    for (const [k, o] of this.active) if (!want.has(k)) { this.scene.remove(o.g); this.active.delete(k); }
  }

  update(dt, p, night) {
    this.t += dt; const t = this.t;
    this.refresh(p.x, p.z);
    // luces sueltas: crear las cercanas, soltar las lejanas
    if ((this.scan -= dt) <= 0) {
      this.scan = 1.5;
      for (const l of this.lights) {
        const d = Math.hypot(l.x - p.x, l.z - p.z);
        if (d < 420 && !l.obj) {
          const h = heightAt(l.x, l.z);
          const o = { g: new THREE.Group(), t: l.x, col: [] }; o.g.position.set(l.x, Math.max(h, 0), l.z);
          this.buildWish(o, l.w, l.from); this.scene.add(o.g); l.obj = o;
        } else if (d > 470 && l.obj) { this.scene.remove(l.obj.g); l.obj = null; }
      }
    }
    let near = null, nd = 7, fire = 0, warm = null, wd = 45;
    const wish = (o, x, z) => {
      const b = Math.sin(t * 1.3 + o.t) * 0.12;
      o.orb.position.y = 1.35 + b; o.glow.position.y = 1.35 + b;
      o.glow.material.opacity = 0.35 + 0.35 * night + 0.1 * Math.sin(t * 2 + o.t);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < nd) { nd = d; near = o; }
    };
    for (const l of this.lights) if (l.obj) wish(l.obj, l.x, l.z);
    for (const o of this.active.values()) {
      const lm = o.lm, d = Math.hypot(lm.x - p.x, lm.z - p.z);
      if (o.type === 'wish') wish(o, lm.x, lm.z);
      else if (o.type === 'lantern') {
        if (o.lit) { o.glow.material.opacity = (0.3 + 0.5 * night) * (0.9 + 0.1 * Math.sin(t * 5 + o.t)); if (d < wd) { wd = d; warm = o; } }
        else o.ember.material.opacity = 0.25 + 0.25 * Math.sin(t * 2.4 + o.t);
      } else if (o.type === 'fire') {
        const f = 1 + 0.18 * Math.sin(t * 11 + o.t) + 0.1 * Math.sin(t * 17.3);
        o.fl[0].scale.y = 1.05 * f; o.fl[1].scale.y = 0.72 * (2 - f); o.fl[0].rotation.y = t * 2;
        o.glow.material.opacity = (0.28 + 0.4 * night) * f;
        if (d < 60 && Math.random() < dt * 5) this.fx.motes.spawn(lm.x + (Math.random() - 0.5) * 0.5, lm.h + 0.8, lm.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 0xffa850, 1.6 + Math.random(), 0.3);
        fire = Math.max(fire, 1 - d / 22);
        if (d < wd) { wd = d; warm = o; }
      } else if (o.type === 'tree') {
        o.ring = Math.max(0, o.ring - dt * 0.4);
        o.chimes.forEach((c, i) => { c.material.opacity = 0.35 + 0.4 * night + o.ring * 0.5 * (0.5 + 0.5 * Math.sin(t * 9 + i * 2)); c.position.y = 5.4 + (i % 3) * 0.5 + Math.sin(t * (1 + o.ring * 3) + i) * 0.12; });
        if (d < 90 && night > 0.2 && Math.random() < dt * 6 * night) {
          const a = Math.random() * 6.283, r = 2.5 + Math.random() * 9;
          this.fx.motes.spawn(lm.x + Math.cos(a) * r, lm.h + 0.6 + Math.random() * 6, lm.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.5, 0xdcff8a, 3 + Math.random() * 3);
        }
      } else if (o.type === 'circle') {
        if (o.seq >= 0) {
          o.seqT -= dt;
          if (o.seqT <= 0) {
            const s = o.stones[o.seq]; s.lit = 1;
            this.sound.circle(o.seq + 3);
            this.fx.motes.burst(s.x, s.y, s.z, 0xbfe0ff, 10, 1.6, 2.2);
            o.seq++; o.seqT = 0.42;
            if (o.seq >= o.stones.length) {
              o.seq = -1; o.awake = 40; this.fx.rings.spawn(lm.x, lm.z, 0xbfe0ff, 26, 4.5);
              for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, r = 1.5 + Math.random() * 8; this.fx.flowers.add(lm.x + Math.cos(a) * r, lm.z + Math.sin(a) * r); }
            }
          }
        }
        if (o.awake > 0) {
          o.awake -= dt;
          if (Math.random() < dt * 14) { const a = t * 0.8 + Math.random() * 6.283, r = 2 + Math.random() * 4.5; this.fx.motes.spawn(lm.x + Math.cos(a) * r, lm.h + 0.3, lm.z + Math.sin(a) * r, -Math.sin(a) * 0.8, 1 + Math.random(), Math.cos(a) * 0.8, 0xcfe6ff, 3.5, 0.15); }
        }
        for (const s of o.stones) { s.lit = o.awake > 0 ? Math.min(1, o.awake / 5) : Math.max(0, (s.lit || 0) - (o.seq < 0 ? dt * 0.5 : 0)); s.gl.material.opacity = (s.lit || 0) * (0.6 + 0.15 * Math.sin(t * 3 + s.x)); }
      }
    }
    this.near = near; this.fireNear = Math.max(0, fire);
    if (warm) {
      this.warm.position.set(warm.lm.x, warm.lm.h + (warm.type === 'fire' ? 1 : 2.2), warm.lm.z);
      this.warm.intensity = (10 + 60 * night) * Math.max(0, 1 - wd / 45) * (0.9 + 0.1 * Math.sin(t * 13));
    } else this.warm.intensity = 0;
  }

  // El canto despierta lo que hay cerca. Devuelve true si algo respondió.
  onCall(p) {
    let any = false;
    for (const o of this.active.values()) {
      const lm = o.lm, d = Math.hypot(lm.x - p.x, lm.z - p.z);
      if (o.type === 'lantern' && !o.lit && d < 13) {
        this.setLit(o, true); this.save.lit[lm.key] = 1; any = true;
        this.sound.lit(); this.fx.motes.burst(lm.x, lm.h + 2.2, lm.z, 0xffd080, 34, 3, 2.6); this.fx.rings.spawn(lm.x, lm.z, 0xffc070, 18, 3);
      } else if (o.type === 'circle' && d < 10 && o.seq < 0 && o.awake <= 0) { o.seq = 0; o.seqT = 0.5; any = true; }
      else if (o.type === 'tree' && d < 20) {
        o.ring = 1; any = true; this.sound.chime(6, 0.09);
        for (let i = 0; i < 30; i++) { const a = Math.random() * 6.283, r = Math.random() * 8; this.fx.motes.spawn(lm.x + Math.cos(a) * r, lm.h + 8 + Math.random() * 4, lm.z + Math.sin(a) * r, (Math.random() - 0.5), -0.6 - Math.random(), (Math.random() - 0.5), 0xfff0c0, 4 + Math.random() * 2, -0.1); }
      } else if (o.type === 'fire' && d < 12) {
        any = true; this.fx.motes.burst(lm.x, lm.h + 0.8, lm.z, 0xffb060, 26, 3.2, 2.2);
      }
    }
    return any;
  }

  collide(p, rad) {
    for (const o of this.active.values()) for (const c of o.col) {
      const ex = p.x - c.x, ez = p.z - c.z, d2 = ex * ex + ez * ez, m = c.r + rad;
      if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = (m - d) / d; p.x += ex * k; p.z += ez * k; }
    }
  }

  // Sitios agradables para que los viajeros se sienten (fogatas, árboles viejos).
  restSpots() { const out = []; for (const o of this.active.values()) if (o.type === 'fire' || o.type === 'tree') out.push(o.lm); return out; }
}
