// Efectos de luz: resplandores, ondas del canto, motas y flores que brotan.
import * as THREE from 'three';
import { heightAt } from './world.js';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const GLOW = glowTexture();

export function makeGlow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
  s.scale.setScalar(size);
  return s;
}

// Onda de luz que recorre el suelo al cantar.
const SEG = 56;
export class Rings {
  constructor(scene, n = 8) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const pos = new Float32Array((SEG + 1) * 2 * 3), col = new Float32Array((SEG + 1) * 2 * 3), idx = [];
      for (let s = 0; s < SEG; s++) { const a = s * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, c, b, d); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
      this.items.push({ mesh, t: 1, dur: 1, x: 0, z: 0, maxR: 10, color: new THREE.Color() });
    }
    this.next = 0;
  }
  spawn(x, z, color, maxR = 14, dur = 2.2) {
    const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    it.x = x; it.z = z; it.t = 0; it.dur = dur; it.maxR = maxR; it.color.set(color); it.mesh.visible = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt / it.dur;
      if (it.t >= 1) { it.mesh.visible = false; continue; }
      const k = 1 - (1 - it.t) ** 2.2, r = 0.6 + it.maxR * k, f = (1 - it.t) ** 1.6, hgt = 0.35 + 0.5 * f;
      const p = it.mesh.geometry.attributes.position.array, c = it.mesh.geometry.attributes.color.array;
      for (let s = 0; s <= SEG; s++) {
        const a = (s / SEG) * 6.2832, x = it.x + Math.cos(a) * r, z = it.z + Math.sin(a) * r, y = Math.max(heightAt(x, z), 0) + 0.06, o = s * 6;
        p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x; p[o + 4] = y + hgt; p[o + 5] = z;
        c[o] = it.color.r * f; c[o + 1] = it.color.g * f; c[o + 2] = it.color.b * f;
      }
      it.mesh.geometry.attributes.position.needsUpdate = true; it.mesh.geometry.attributes.color.needsUpdate = true;
    }
  }
}

// Motas de luz (chispas, luciérnagas de un instante, brillos).
export class Motes {
  constructor(scene, n = 500) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n * 3);
    this.grav = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: GLOW, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.points.frustumCulled = false; scene.add(this.points);
    this.tmp = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, color, life = 2, grav = 0) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.tmp.set(color); this.base[i * 3] = this.tmp.r; this.base[i * 3 + 1] = this.tmp.g; this.base[i * 3 + 2] = this.tmp.b;
    this.life[i] = this.max[i] = life; this.grav[i] = grav;
  }
  burst(x, y, z, color, count = 12, speed = 2, life = 1.8) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.283, u = Math.random() * 0.9 + 0.1, s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * s * (1 - u * 0.6), u * s, Math.sin(a) * s * (1 - u * 0.6), color, life * (0.6 + Math.random() * 0.6), -0.4);
    }
  }
  update(dt) {
    const { pos, vel, col, life, max, base, grav } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const k = Math.max(0, life[i] / max[i]), f = Math.min(1, k * 3) * Math.min(1, (1 - k) * 8 + 0.2), o = i * 3;
      vel[o + 1] += grav[i] * dt;
      vel[o] *= 1 - dt * 0.8; vel[o + 2] *= 1 - dt * 0.8;
      pos[o] += vel[o] * dt + Math.sin(life[i] * 3 + i) * dt * 0.25; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt + Math.cos(life[i] * 2.6 + i) * dt * 0.25;
      col[o] = base[o] * f; col[o + 1] = base[o + 1] * f; col[o + 2] = base[o + 2] * f;
      if (life[i] <= 0) { col[o] = col[o + 1] = col[o + 2] = 0; }
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// Flores que brotan donde cantas o te sientas. Se guardan y siguen ahí cuando vuelves.
const PETALS = [0xffffff, 0xffd84a, 0xff9fc2, 0xf2634e, 0xb99cf0, 0xa6cdff, 0xffb45e];
export class SungFlowers {
  constructor(scene, cap = 700) {
    this.cap = cap; this.list = []; this.next = 0; this.anim = [];
    const stem = new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4).translate(0, 0.25, 0).toNonIndexed();
    const head = new THREE.ConeGeometry(0.17, 0.2, 5, 1, true).rotateX(Math.PI).translate(0, 0.56, 0).toNonIndexed();
    const core = new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.58, 0);
    const parts = [[stem, 0x5f9a4e], [head, 0xffffff], [core, 0xffe27a]];
    const n = parts.reduce((s, [g]) => s + g.attributes.position.count, 0);
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), col = new THREE.Color();
    let o = 0;
    for (const [g, hex] of parts) {
      const a = g.attributes.position.array; col.set(hex);
      for (let i = 0; i < a.length / 3; i++, o++) { p[o * 3] = a[i * 3]; p[o * 3 + 1] = a[i * 3 + 1]; p[o * 3 + 2] = a[i * 3 + 2]; c[o * 3] = col.r; c[o * 3 + 1] = col.g; c[o * 3 + 2] = col.b; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.col = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  set(i, f, k) {
    this.q.setFromAxisAngle(this.up, f.r);
    this.m.compose(this.v.set(f.x, f.y, f.z), this.q, this.s.setScalar(f.s * k));
    this.mesh.setMatrixAt(i, this.m);
  }
  add(x, z, ci = (Math.random() * PETALS.length) | 0, instant = false) {
    const y = heightAt(x, z);
    if (y < 1.6 || y > 50) return false;
    const i = this.next; this.next = (i + 1) % this.cap;
    const f = { x, y: y - 0.02, z, c: ci % PETALS.length, r: Math.random() * 6.28, s: 0.8 + Math.random() * 0.7, t: instant ? 1 : 0 };
    this.list[i] = f;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.set(i, f, instant ? 1 : 0.001);
    this.mesh.setColorAt(i, this.col.set(PETALS[f.c]));
    this.mesh.instanceColor.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true;
    if (!instant) this.anim.push(i);
    return true;
  }
  update(dt) {
    if (!this.anim.length) return;
    for (let k = this.anim.length - 1; k >= 0; k--) {
      const i = this.anim[k], f = this.list[i];
      f.t = Math.min(1, f.t + dt * 1.6);
      const e = 1 - (1 - f.t) ** 3, over = 1 + Math.sin(f.t * Math.PI) * 0.25;
      this.set(i, f, Math.max(0.001, e * over));
      if (f.t >= 1) this.anim.splice(k, 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  save() { return this.list.filter(Boolean).slice(-400).map((f) => [Math.round(f.x * 10) / 10, Math.round(f.z * 10) / 10, f.c]); }
  load(arr) { for (const [x, z, c] of arr || []) this.add(x, z, c, true); }
}
