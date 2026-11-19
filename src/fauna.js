// Vida alrededor: mariposas, luciérnagas, pájaros, venados y lo que flota en el aire
// (pétalos, hojas, polen, nieve) según el lugar donde estés.
import * as THREE from 'three';
import { heightAt, biomeAt, slopeAt } from './world.js';
import { makeAnimal, DEER } from './creatures.js';
import { GLOW } from './fx.js';
import { angDiff, smooth } from './noise.js';

const wingGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.1, 0.3, 0, 0.16, 0.2, 0, -0.04, 0, 0, 0.02, 0.2, 0, -0.04, 0.14, 0, -0.2]), 3));
  return g;
})();
function flyer(color, scale) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const r = new THREE.Mesh(wingGeo, m), l = new THREE.Mesh(wingGeo, m); l.scale.x = -1;
  g.add(r, l); g.scale.setScalar(scale);
  return { g, r, l, m };
}
const BF_COLORS = [0xffd24a, 0xff9fc2, 0xffffff, 0x8fc8ff, 0xff8a4a, 0xc9a6ff];

export class Fauna {
  constructor(scene, q, sound, panOf) {
    this.scene = scene; this.sound = sound; this.panOf = panOf; this.t = 0;
    // mariposas
    this.bfs = [];
    for (let i = 0; i < (q.mobile ? 7 : 12); i++) {
      const f = flyer(BF_COLORS[i % BF_COLORS.length], 0.75 + Math.random() * 0.4);
      scene.add(f.g);
      this.bfs.push({ ...f, p: new THREE.Vector3(0, -50, 0), tg: new THREE.Vector3(), timer: 0, ph: Math.random() * 6, far: true });
    }
    // luciérnagas y partículas del aire (cajas que envuelven al jugador)
    this.ff = this.cloud(q.mobile ? 50 : 90, 0.42, true);
    this.air = this.cloud(q.mobile ? 140 : 260, 0.2, false);
    this.airCol = new THREE.Color(0xffffff); this.airTarget = new THREE.Color(0xffffff); this.airAmt = 0; this.airFall = 0.3; this.bio = {};
    this.bioTimer = 0;
    // pájaros
    this.birds = [];
    for (let i = 0; i < 6; i++) { const f = flyer(0x39424f, 2.6); scene.add(f.g); this.birds.push({ ...f, ph: i * 1.3 }); }
    this.flock = { x: 0, z: 0, a: 0, swoop: 0, y: 45 };
    this.deer = []; this.deerTimer = 2;
    this.tmp = new THREE.Vector3();
  }

  cloud(n, size, additive) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 56; pos[i * 3 + 1] = -100; pos[i * 3 + 2] = (Math.random() - 0.5) * 56;
      seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = -1e9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, fog: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, alphaTest: additive ? 0 : 0.02 }));
    pts.frustumCulled = false; this.scene.add(pts);
    return { n, pos, col, seed, pts };
  }

  update(dt, player, sky, cam) {
    this.t += dt;
    const t = this.t, p = player.pos, night = sky.night, day = 1 - night;

    // --- mariposas ---
    for (const b of this.bfs) {
      const d = b.p.distanceTo(p);
      b.timer -= dt;
      if (d > 48 || b.far) {            // reaparece cerca, fuera del centro de la vista
        const a = Math.random() * 6.283, r = 14 + Math.random() * 16, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = heightAt(x, z);
        if (h > 1.5 && h < 44) { b.p.set(x, h + 1, z); b.far = false; b.timer = 0; } else continue;
      }
      if (b.timer <= 0) {
        const sitNear = player.sitting && player.sitTime > 5, r = sitNear ? 1 + Math.random() * 3 : 4 + Math.random() * 12, a = Math.random() * 6.283;
        const x = (sitNear ? p.x : b.p.x) + Math.cos(a) * r, z = (sitNear ? p.z : b.p.z) + Math.sin(a) * r, h = heightAt(x, z);
        b.tg.set(x, Math.max(h, 0.3) + 0.5 + Math.random() * 1.6, z); b.timer = 2 + Math.random() * 4;
      }
      this.tmp.copy(b.tg).sub(b.p); const dl = this.tmp.length();
      if (dl > 0.1) { b.p.addScaledVector(this.tmp, Math.min(1, (1.6 * dt) / dl)); b.g.rotation.y += angDiff(Math.atan2(this.tmp.x, this.tmp.z), b.g.rotation.y) * Math.min(1, dt * 4); }
      b.ph += dt * 16;
      const w = Math.sin(b.ph) * 1.05;
      b.r.rotation.z = w; b.l.rotation.z = -w;
      b.g.position.set(b.p.x, b.p.y + Math.sin(b.ph * 0.5) * 0.08, b.p.z);
      b.g.visible = day > 0.35;
    }

    // --- luciérnagas ---
    this.wrap(this.ff, p, 28, (i, o, s, pos, col) => {
      const gy = s[i * 4 + 3];
      pos[o + 1] = gy + 0.5 + s[i * 4 + 1] * 2.6 + Math.sin(t * 0.7 + i) * 0.4;
      pos[o] += Math.sin(t * 0.5 + i * 1.7) * dt * 0.5; pos[o + 2] += Math.cos(t * 0.43 + i * 2.3) * dt * 0.5;
      const k = night * Math.max(0, Math.sin(t * (0.8 + s[i * 4]) + i * 3)) ** 2 * (gy > 0.5 ? 1 : 0);
      col[o] = 0.85 * k; col[o + 1] = 1.0 * k; col[o + 2] = 0.45 * k;
    });

    // --- lo que flota en el aire ---
    if ((this.bioTimer -= dt) <= 0) {
      this.bioTimer = 1;
      const b = biomeAt(p.x, p.z, this.bio), high = smooth(46, 58, p.y);
      if (high > 0.3) { this.airTarget.set(0xffffff); this.airAmtT = high; this.airFallT = 1.3; }
      else if (b.blossom > 0.3) { this.airTarget.set(0xffb3cf); this.airAmtT = b.blossom; this.airFallT = 0.7; }
      else if (b.gold > 0.3) { this.airTarget.set(0xf0a040); this.airAmtT = b.gold * 0.8; this.airFallT = 0.9; }
      else if (b.forest > 0.4) { this.airTarget.set(0xcfe89a); this.airAmtT = 0.35; this.airFallT = 0.35; }
      else if (b.lav > 0.3) { this.airTarget.set(0xd8c4ff); this.airAmtT = 0.5; this.airFallT = 0.12; }
      else { this.airTarget.set(0xfffbe0); this.airAmtT = 0.45; this.airFallT = 0.08; }
    }
    this.airCol.lerp(this.airTarget, Math.min(1, dt * 0.8));
    this.airAmt += ((this.airAmtT || 0) - this.airAmt) * Math.min(1, dt * 0.8);
    this.airFall += ((this.airFallT || 0.2) - this.airFall) * Math.min(1, dt * 0.8);
    const lum = 0.35 + 0.65 * day, ac = this.airCol;
    this.wrapBox(this.air, cam.position, 24, 12, (i, o, s, pos, col) => {
      pos[o + 1] -= (0.3 + s[i * 4] * 0.9) * this.airFall * dt;
      pos[o] += (0.6 + Math.sin(t * 0.8 + i) * 0.7) * dt; pos[o + 2] += (0.25 + Math.cos(t * 0.6 + i * 1.3) * 0.6) * dt;
      const k = s[i * 4 + 1] < this.airAmt ? lum : 0;
      col[o] = ac.r * k; col[o + 1] = ac.g * k; col[o + 2] = ac.b * k;
    });
    this.air.pts.material.opacity = 0.85;

    // --- pájaros ---
    const fl = this.flock;
    fl.x += (p.x - fl.x) * Math.min(1, dt * 0.25); fl.z += (p.z - fl.z) * Math.min(1, dt * 0.25);
    fl.a += dt * 0.22; fl.swoop = Math.max(0, fl.swoop - dt * 0.08);
    const fy = Math.max(p.y, 0) + 42 - 30 * smooth(0, 1, fl.swoop), fr = 44 - 26 * smooth(0, 1, fl.swoop);
    this.birds.forEach((b, i) => {
      const a = fl.a - i * 0.09 * (i % 2 ? 1 : -1) - Math.floor((i + 1) / 2) * 0.05, r = fr + Math.floor((i + 1) / 2) * (i % 2 ? 3 : -3);
      b.g.position.set(fl.x + Math.cos(a) * r, fy + Math.sin(t * 0.6 + i) * 1.5, fl.z + Math.sin(a) * r);
      b.g.rotation.y = -a;
      const w = Math.sin(t * 7 + b.ph) * 0.7; b.r.rotation.z = w; b.l.rotation.z = -w;
      b.g.visible = day > 0.4;
    });

    // --- venados ---
    if ((this.deerTimer -= dt) <= 0) {
      this.deerTimer = 4;
      if (this.deer.length < 3) {
        const a = Math.random() * 6.283, r = 55 + Math.random() * 35, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = heightAt(x, z);
        if (h > 2.5 && h < 40 && slopeAt(x, z) < 0.4) {
          const an = makeAnimal(DEER()); an.g.scale.setScalar(1.1); this.scene.add(an.g);
          this.deer.push({ an, x, z, hd: Math.random() * 6.283, state: 'graze', timer: 3 + Math.random() * 5, tx: x, tz: z, sp: 0 });
        }
      }
    }
    for (let i = this.deer.length - 1; i >= 0; i--) {
      const d = this.deer[i], dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
      if (dist > 150) { this.scene.remove(d.an.g); this.deer.splice(i, 1); continue; }
      d.timer -= dt;
      let look = 0, graze = 0, want = 0;
      if (d.state !== 'flee' && dist < 6.5 && player.speed > 7.5) { d.state = 'flee'; d.timer = 2.2; d.tx = d.x - (dx / dist) * 16; d.tz = d.z - (dz / dist) * 16; }
      if (d.state === 'graze' && player.sitting && player.sitTime > 7 && dist < 34) { d.state = 'come'; d.timer = 40; }
      if (d.state === 'graze') {
        graze = dist > 15 ? 1 : 0;
        if (dist <= 15) look = Math.max(-1.2, Math.min(1.2, angDiff(Math.atan2(dx, dz), d.hd)));
        if (d.timer <= 0) { const a = Math.random() * 6.283, r = 3 + Math.random() * 7; d.tx = d.x + Math.cos(a) * r; d.tz = d.z + Math.sin(a) * r; d.timer = 6 + Math.random() * 9; }
        want = Math.hypot(d.tx - d.x, d.tz - d.z) > 0.6 ? 1.3 : 0;
      } else if (d.state === 'come') {
        d.tx = p.x; d.tz = p.z; want = dist > 4 ? 2.6 : 0;
        if (dist <= 4) look = Math.max(-1.2, Math.min(1.2, angDiff(Math.atan2(dx, dz), d.hd)));
        if (d.timer <= 0) { d.state = 'graze'; d.timer = 4; d.tx = d.x; d.tz = d.z; }
      } else { want = 7; if (d.timer <= 0) { d.state = 'graze'; d.timer = 6; d.tx = d.x; d.tz = d.z; } }
      if (want > 0) {
        const tx = d.tx - d.x, tz = d.tz - d.z, tl = Math.hypot(tx, tz) || 1;
        d.hd += angDiff(Math.atan2(tx, tz), d.hd) * Math.min(1, dt * 4);
        const nx = d.x + Math.sin(d.hd) * want * dt, nz = d.z + Math.cos(d.hd) * want * dt;
        if (heightAt(nx, nz) > 0.4) { d.x = nx; d.z = nz; } else { d.tx = d.x; d.tz = d.z; }
        void tl;
      }
      d.sp += (want - d.sp) * Math.min(1, dt * 5);
      d.an.g.position.set(d.x, heightAt(d.x, d.z), d.z); d.an.g.rotation.y = d.hd;
      d.an.animate(dt, { speed: d.sp, graze: d.sp < 0.3 ? graze : 0, look });
    }
  }

  // caja toroidal pegada al suelo (luciérnagas)
  wrap(c, p, R, fn) {
    const { pos, col, seed, n } = c;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      let moved = seed[i * 4 + 3] < -1e8;
      if (pos[o] - p.x > R) { pos[o] -= 2 * R; moved = true; } else if (pos[o] - p.x < -R) { pos[o] += 2 * R; moved = true; }
      if (pos[o + 2] - p.z > R) { pos[o + 2] -= 2 * R; moved = true; } else if (pos[o + 2] - p.z < -R) { pos[o + 2] += 2 * R; moved = true; }
      if (moved) { if (Math.abs(pos[o] - p.x) > R) pos[o] = p.x + (Math.random() - 0.5) * 2 * R; if (Math.abs(pos[o + 2] - p.z) > R) pos[o + 2] = p.z + (Math.random() - 0.5) * 2 * R; seed[i * 4 + 3] = heightAt(pos[o], pos[o + 2]); }
      fn(i, o, seed, pos, col);
    }
    c.pts.geometry.attributes.position.needsUpdate = true; c.pts.geometry.attributes.color.needsUpdate = true;
  }
  // caja toroidal en el aire, alrededor de la cámara
  wrapBox(c, p, R, H, fn) {
    const { pos, col, seed, n } = c;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      fn(i, o, seed, pos, col);
      for (const [k, q, r] of [[0, p.x, R], [1, p.y + H * 0.4, H], [2, p.z, R]]) {
        const d = pos[o + k] - q;
        if (d > r || d < -r) pos[o + k] = Math.abs(d) > 3 * r ? q + (Math.random() - 0.5) * 2 * r : pos[o + k] - Math.sign(d) * 2 * r;
      }
    }
    c.pts.geometry.attributes.position.needsUpdate = true; c.pts.geometry.attributes.color.needsUpdate = true;
  }

  onCall(p, deg) {
    for (const b of this.bfs) if (b.p.distanceTo(p) < 22) { const a = Math.random() * 6.283; b.tg.set(p.x + Math.cos(a) * 2, p.y + 1 + Math.random() * 1.5, p.z + Math.sin(a) * 2); b.timer = 3 + Math.random() * 2; }
    this.flock.swoop = Math.min(1, this.flock.swoop + 0.5);
    let any = false;
    for (const d of this.deer) {
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < 48 && d.state !== 'come') { d.state = 'come'; d.timer = 35; any = true; this.sound.answer(deg - 5, this.panOf(d.x, d.z), Math.max(0.25, 1 - dist / 60), 0.7 + Math.random() * 0.5, -1); }
    }
    return any;
  }
}
