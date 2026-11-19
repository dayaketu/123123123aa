// Compañía: otros viajeros. Sin servidor, son zorritos del propio mundo que caminan,
// descansan, cantan y a veces te acompañan un rato. Con servidor (config.js), además
// aparecen personas reales. No hay chat: solo notas, presencia y luces con buenos deseos.
import * as THREE from 'three';
import { heightAt, slopeAt } from './world.js';
import { makeAnimal, FOX, FOX_COLORS } from './creatures.js';
import { makeGlow } from './fx.js';
import { angDiff } from './noise.js';

function makeFox(colorIdx, scene) {
  const an = makeAnimal(FOX(FOX_COLORS[colorIdx % FOX_COLORS.length]));
  an.g.scale.setScalar(1.2); an.g.rotation.order = 'YXZ';
  const glow = makeGlow(0xffe6b8, 3.6, 0.2); glow.position.y = 0.7; an.g.add(glow);
  scene.add(an.g);
  return { an, glow };
}

export class Travelers {
  constructor(scene, fx, sound, panOf, landmarks) {
    this.scene = scene; this.fx = fx; this.sound = sound; this.panOf = panOf; this.landmarks = landmarks;
    this.list = []; this.spawnT = 6; this.max = 3;
    this.remote = new Map();     // personas reales (id → fox)
    this.net = null;
  }

  spawn(p) {
    const a = Math.random() * 6.283, r = 80 + Math.random() * 50, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = heightAt(x, z);
    if (h < 2 || h > 42 || slopeAt(x, z) > 0.5) return;
    const used = this.list.map((t) => t.c), c = [1, 2, 3, 4, 5, 6, 0].find((k) => !used.includes(k)) ?? 1;
    const f = makeFox(c, this.scene);
    this.list.push({ ...f, c, x, z, y: h, hd: Math.random() * 6.283, state: 'walk', tx: x, tz: z, timer: 0, sp: 0, sing: 0, singT: 8 + Math.random() * 20, oct: c % 2 ? 0 : -1, deg: 4 + c, follow: 0, sit: 0 });
  }

  pickTarget(t, p) {
    const spots = this.landmarks.restSpots().filter((s) => Math.hypot(s.x - t.x, s.z - t.z) < 220 && Math.hypot(s.x - t.x, s.z - t.z) > 12);
    if (spots.length && Math.random() < 0.45) {
      const s = spots[(Math.random() * spots.length) | 0], a = Math.random() * 6.283, off = s.type === 'tree' ? 5 : 2.6;
      t.tx = s.x + Math.cos(a) * off; t.tz = s.z + Math.sin(a) * off; t.rest = 14 + Math.random() * 24; return;
    }
    for (let k = 0; k < 6; k++) {
      // tienden a quedarse en la zona donde andas
      const a = Math.random() * 6.283, r = 30 + Math.random() * 70, bx = t.x * 0.6 + p.x * 0.4, bz = t.z * 0.6 + p.z * 0.4;
      const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r, h = heightAt(x, z);
      if (h > 1.5 && h < 44) { t.tx = x; t.tz = z; t.rest = Math.random() < 0.5 ? 6 + Math.random() * 14 : 0; return; }
    }
  }

  emit(t, deg, delay = 0) {
    const d = Math.hypot(t.x - this.px, t.z - this.pz), vol = Math.max(0, 1 - d / 150) ** 1.5;
    if (vol <= 0.01) return;
    this.sound.answer(deg, this.panOf(t.x, t.z), vol, delay, t.oct);
    setTimeout(() => { t.sing = 1; this.fx.rings.spawn(t.x, t.z, 0xfff0c8, 10, 2.2); }, delay * 1000);
  }

  update(dt, player, night) {
    const p = player.pos; this.px = p.x; this.pz = p.z;
    const want = Math.max(0, this.max - this.remote.size);
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 5; if (this.list.length < want) this.spawn(p); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i], dx = p.x - t.x, dz = p.z - t.z, dist = Math.hypot(dx, dz);
      if (dist > 330) { this.scene.remove(t.an.g); this.list.splice(i, 1); continue; }
      t.timer -= dt; t.singT -= dt; t.sing = Math.max(0, t.sing - dt * 1.4);
      let speed = 0, sit = 0;
      if (t.state === 'follow') {
        t.follow -= dt;
        // camina a tu lado, un poco atrás
        const side = t.c % 2 ? 1 : -1, hx = Math.sin(player.heading), hz = Math.cos(player.heading);
        t.tx = p.x + hz * 2.4 * side - hx * 1.4; t.tz = p.z - hx * 2.4 * side - hz * 1.4;
        const td = Math.hypot(t.tx - t.x, t.tz - t.z);
        speed = td > 0.8 ? Math.min(11, 2 + td * 1.6) : 0;
        if (player.sitting && td < 4) { sit = 1; speed = 0; }
        if (t.follow <= 0 || dist > 90) { t.state = 'walk'; this.pickTarget(t, p); if (dist < 60) this.emit(t, t.deg + 2); }
      } else if (t.state === 'rest') {
        sit = 1;
        if (t.timer <= 0) { t.state = 'walk'; this.pickTarget(t, p); }
      } else {
        const td = Math.hypot(t.tx - t.x, t.tz - t.z);
        if (td < 1.5) { if (t.rest > 0) { t.state = 'rest'; t.timer = t.rest; } else this.pickTarget(t, p); }
        else speed = 4.4;
      }
      if (speed > 0) {
        t.hd += angDiff(Math.atan2(t.tx - t.x, t.tz - t.z), t.hd) * Math.min(1, dt * 5);
        const nx = t.x + Math.sin(t.hd) * speed * dt, nz = t.z + Math.cos(t.hd) * speed * dt, nh = heightAt(nx, nz);
        if (nh > 0.3 || t.state === 'follow') { t.x = nx; t.z = nz; } else this.pickTarget(t, p);
      }
      t.sp += (speed - t.sp) * Math.min(1, dt * 5);
      const h = heightAt(t.x, t.z), swim = h < -0.5;
      t.y = Math.max(h, -0.42);
      if (t.singT <= 0 && t.state !== 'follow') { t.singT = 22 + Math.random() * 40; t.deg = 3 + ((Math.random() * 7) | 0); this.emit(t, t.deg); }
      t.an.g.position.set(t.x, t.y, t.z); t.an.g.rotation.y = t.hd;
      let look = 0;
      if (dist < 14 && t.sp < 0.5) look = Math.max(-1.1, Math.min(1.1, angDiff(Math.atan2(dx, dz), t.hd)));
      t.an.animate(dt, { speed: t.sp, sit, swim: swim ? 1 : 0, sing: t.sing > 0.4 ? 1 : 0, look });
      t.glow.material.opacity = 0.12 + 0.4 * night + t.sing * 0.3;
    }
    // personas reales: interpolación suave
    for (const r of this.remote.values()) {
      const k = Math.min(1, dt * 8), ox = r.x, oz = r.z;
      r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.z += (r.tz - r.z) * k;
      r.hd += angDiff(r.th, r.hd) * k;
      const sp = Math.hypot(r.x - ox, r.z - oz) / Math.max(dt, 1e-3);
      r.sp += (sp - r.sp) * Math.min(1, dt * 6); r.sing = Math.max(0, r.sing - dt * 1.4);
      r.an.g.position.set(r.x, r.y, r.z); r.an.g.rotation.y = r.hd;
      r.an.animate(dt, { speed: r.sp, sit: r.s & 1, air: (r.s >> 1) & 1, swim: (r.s >> 2) & 1, sing: r.sing > 0.4 ? 1 : 0 });
      r.glow.material.opacity = 0.14 + 0.4 * night + r.sing * 0.3;
    }
  }

  // Cuando cantas, quien te oye responde; a veces se acerca a caminar contigo.
  onCall(p, deg) {
    let any = false;
    for (const t of this.list) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > 110) continue;
      any = true;
      this.emit(t, deg + (t.c % 2 ? 2 : 4), 0.7 + Math.random() * 0.9);
      if (t.state !== 'follow' && d < 80 && Math.random() < 0.85) { t.state = 'follow'; t.follow = 50 + Math.random() * 60; }
    }
    return any;
  }

  // ----- red -----
  peer(id, c) {
    let r = this.remote.get(id);
    if (!r) { r = { ...makeFox(c ?? 1, this.scene), x: 0, y: -50, z: 0, tx: 0, ty: -50, tz: 0, hd: 0, th: 0, s: 0, sp: 0, sing: 0, fresh: true }; this.remote.set(id, r); }
    return r;
  }
  peerState(id, x, y, z, h, s, c) {
    const r = this.peer(id, c);
    r.tx = x; r.ty = y; r.tz = z; r.th = h; r.s = s;
    if (r.fresh) { r.x = x; r.y = y; r.z = z; r.hd = h; r.fresh = false; }
  }
  peerLeave(id) { const r = this.remote.get(id); if (r) { this.scene.remove(r.an.g); this.remote.delete(id); } }
  peerCall(id, deg) {
    const r = this.remote.get(id); if (!r) return;
    const d = Math.hypot(r.x - this.px, r.z - this.pz), vol = Math.max(0, 1 - d / 160) ** 1.5;
    r.sing = 1; this.fx.rings.spawn(r.x, r.z, 0xfff0c8, 14, 2.2);
    if (vol > 0.01) this.sound.answer(deg, this.panOf(r.x, r.z), vol, 0, 0);
  }
}

// Conexión opcional con el servidor de presencia (ver server/server.js).
export class Net {
  constructor(url, travelers, landmarks, onCount) {
    this.url = url; this.tr = travelers; this.lm = landmarks; this.onCount = onCount; this.ws = null; this.sendT = 0; this.retry = 2; this.color = 0;
    if (url) this.connect();
  }
  connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch { return; }
    this.ws = ws;
    ws.onopen = () => { this.retry = 2; this.send({ t: 'hi', c: this.color }); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { for (const l of m.lights || []) this.lm.addLight(l.x, l.z, l.w, 'other'); }
      else if (m.t === 'ps') { for (const a of m.a) this.tr.peerState(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); this.onCount(this.tr.remote.size); }
      else if (m.t === 'leave') { this.tr.peerLeave(m.id); this.onCount(this.tr.remote.size); }
      else if (m.t === 'call') this.tr.peerCall(m.id, m.n);
      else if (m.t === 'light') this.lm.addLight(m.x, m.z, m.w, 'other');
    };
    ws.onclose = () => {
      this.ws = null; for (const id of [...this.tr.remote.keys()]) this.tr.peerLeave(id); this.onCount(0);
      setTimeout(() => this.connect(), this.retry * 1000); this.retry = Math.min(60, this.retry * 2);
    };
    ws.onerror = () => {};
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  update(dt, player) {
    if (!this.ws || (this.sendT -= dt) > 0) return;
    this.sendT = 0.12;
    const p = player.pos, r = (v) => Math.round(v * 100) / 100;
    this.send({ t: 'p', x: r(p.x), y: r(p.y), z: r(p.z), h: r(player.heading), s: (player.sitting ? 1 : 0) | (player.onGround ? 0 : 2) | (player.swimming ? 4 : 0) });
  }
}
