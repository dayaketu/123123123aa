// Animales de baja poligonización: el zorrito de luz (tú y los demás viajeros) y los venados.
import * as THREE from 'three';
import { makeGlow } from './fx.js';

export const FOX_COLORS = [0xe8854a, 0xf0d2a0, 0xe6ecf4, 0x7f9ccf, 0xe79aaa, 0x5fae9a, 0x9a86d8];

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const geoCache = {};
const G = (key, make) => geoCache[key] || (geoCache[key] = make());

export const FOX = (color = FOX_COLORS[0]) => ({
  len: 0.95, rad: 0.27, leg: 0.36, legR: 0.055, neck: 0.04, head: 0.24, snout: 0.27, earW: 0.105, earH: 0.27,
  color, light: 0xfff6ea, dark: 0x3b2c2c, tail: 'fox', glow: true,
});
export const DEER = () => ({
  len: 1.45, rad: 0.33, leg: 0.88, legR: 0.05, neck: 0.55, head: 0.2, snout: 0.26, earW: 0.08, earH: 0.24,
  color: 0xc79c6c, light: 0xf4e8d2, dark: 0x5a4636, tail: 'short', antlers: Math.random() < 0.5,
});

export function makeAnimal(cfg) {
  const g = new THREE.Group(), pose = new THREE.Group();
  g.add(pose);
  const mB = lam(cfg.color), mL = lam(cfg.light), mD = lam(cfg.dark), mEye = lam(0x1c1a22);
  const { len: L, rad: R, leg: LEG } = cfg, hipY = LEG + R * 0.7;
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const sph = G('sph', () => new THREE.SphereGeometry(1, 7, 5));

  const torso = new THREE.Group(); torso.position.set(0, hipY, -L * 0.5); pose.add(torso);
  const body = add(torso, sph, mB, 0, 0, L * 0.5); body.scale.set(R, R * 0.95, L * 0.6);
  const chest = add(torso, sph, mL, 0, -R * 0.22, L * 0.86); chest.scale.set(R * 0.72, R * 0.74, R * 0.8);

  const neck = new THREE.Group(); neck.position.set(0, R * 0.3, L * 0.95); torso.add(neck);
  if (cfg.neck > 0.2) {
    const n = add(neck, G('cyl', () => new THREE.CylinderGeometry(0.8, 1, 1, 6).translate(0, 0.5, 0)), mB);
    n.scale.set(R * 0.5, cfg.neck * 1.1, R * 0.5); n.rotation.x = 0.45;
  }
  const head = new THREE.Group(); head.position.set(0, cfg.neck * 0.95 + R * 0.3, cfg.neck * 0.5 + R * 0.25); neck.add(head);
  const hr = cfg.head;
  const skull = add(head, sph, mB); skull.scale.set(hr, hr * 0.9, hr * 1.05);
  const snout = add(head, G('snout', () => new THREE.ConeGeometry(1, 1, 5).rotateX(Math.PI / 2)), mL, 0, -hr * 0.22, hr * 0.7 + cfg.snout * 0.35);
  snout.scale.set(hr * 0.52, hr * 0.46, cfg.snout);
  const nose = add(head, sph, mEye, 0, -hr * 0.2, hr * 0.7 + cfg.snout * 0.82); nose.scale.setScalar(0.04);
  const eyes = [-1, 1].map((s) => { const e = add(head, sph, mEye, s * hr * 0.52, hr * 0.14, hr * 0.7); e.scale.setScalar(0.042); return e; });
  const earG = G('ear', () => new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0));
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Group(); e.position.set(s * hr * 0.55, hr * 0.62, -hr * 0.12); e.rotation.z = -s * 0.28; head.add(e);
    const o = add(e, earG, mB); o.scale.set(cfg.earW, cfg.earH, cfg.earW * 0.7);
    const tip = add(e, earG, mD, 0, cfg.earH * 0.55, 0); tip.scale.set(cfg.earW * 0.48, cfg.earH * 0.5, cfg.earW * 0.36);
    return e;
  });
  if (cfg.antlers) for (const s of [-1, 1]) {
    const cg = G('ant', () => new THREE.CylinderGeometry(0.5, 1, 1, 4).translate(0, 0.5, 0));
    const a = add(head, cg, mL, s * hr * 0.3, hr * 0.7, -hr * 0.25); a.scale.set(0.03, 0.5, 0.03); a.rotation.set(-0.3, 0, -s * 0.45);
    const b = add(head, cg, mL, s * hr * 0.3 + s * 0.11, hr * 0.7 + 0.22, -hr * 0.32); b.scale.set(0.025, 0.26, 0.025); b.rotation.set(0.5, 0, -s * 0.1);
  }

  const legG = G('leg', () => new THREE.CylinderGeometry(1, 0.8, 1, 5).translate(0, -0.5, 0));
  const legLen = LEG + R * 0.35;
  const mkLeg = (parent, x, y, z) => {
    const l = new THREE.Group(); l.position.set(x, y, z); parent.add(l);
    const up = add(l, legG, mB); up.scale.set(cfg.legR, legLen, cfg.legR);
    const sock = add(l, legG, mD, 0, -legLen * 0.55, 0); sock.scale.set(cfg.legR * 1.08, legLen * 0.46, cfg.legR * 1.08);
    return l;
  };
  const fl = mkLeg(torso, -R * 0.55, -R * 0.35, L * 0.86), fr = mkLeg(torso, R * 0.55, -R * 0.35, L * 0.86);
  const bl = mkLeg(pose, -R * 0.55, hipY - R * 0.35, -L * 0.36), br = mkLeg(pose, R * 0.55, hipY - R * 0.35, -L * 0.36);

  const tail = new THREE.Group(); tail.position.set(0, hipY + R * 0.15, -L * 0.52); pose.add(tail);
  let tipGlow = null;
  if (cfg.tail === 'fox') {
    const t = add(tail, sph, mB, 0, 0, -0.36); t.scale.set(0.15, 0.15, 0.4);
    const tp = add(tail, sph, mL, 0, 0, -0.68); tp.scale.set(0.115, 0.115, 0.17);
    if (cfg.glow) { tipGlow = makeGlow(0xfff0c8, 1.1, 0.7); tipGlow.position.set(0, 0, -0.74); tail.add(tipGlow); }
  } else {
    const t = add(tail, sph, mL, 0, 0, -0.06); t.scale.set(0.09, 0.09, 0.12);
  }

  const st = { phase: Math.random() * 6, t: Math.random() * 10, blink: 2 + Math.random() * 4, sit: 0, air: 0, swim: 0, sing: 0, graze: 0 };
  // in: { speed, sit, air, swim, sing, graze }  (objetivos 0..1; aquí se suavizan)
  function animate(dt, inp) {
    const ease = (k, target, rate = 6) => { st[k] += (target - st[k]) * Math.min(1, dt * rate); return st[k]; };
    const sit = ease('sit', inp.sit || 0, 4), air = ease('air', inp.air || 0, 8), swim = ease('swim', inp.swim || 0, 6);
    const sing = ease('sing', inp.sing || 0, 9), graze = ease('graze', inp.graze || 0, 2.5);
    const speed = inp.speed || 0;
    st.t += dt;
    st.phase += dt * (speed > 0.15 ? 5 + speed * 1.35 : 0) + dt * swim * 6;
    const amp = Math.min(1, speed / 4.5) * 0.75 * (1 - air) * (1 - sit) + swim * 0.5;
    const a = Math.sin(st.phase) * amp, b = Math.sin(st.phase + Math.PI) * amp;
    const stretch = air * 1.05;
    fl.rotation.x = a - stretch + 0.62 * sit; fr.rotation.x = b - stretch + 0.62 * sit;
    bl.rotation.x = b + stretch * 0.9 - 1.4 * sit; br.rotation.x = a + stretch * 0.9 - 1.4 * sit;
    fl.scale.y = fr.scale.y = 1 + 0.42 * sit;
    torso.rotation.x = -0.62 * sit - 0.12 * air + Math.sin(st.phase * 2) * 0.03 * amp;
    pose.position.y = -LEG * 0.66 * sit - (LEG + R * 0.25) * swim + Math.abs(Math.sin(st.phase)) * 0.05 * amp + Math.sin(st.t * 1.7) * 0.012;
    body.scale.y = R * 0.95 * (1 + Math.sin(st.t * 1.7) * 0.025);
    tail.rotation.x = 0.5 + 0.35 * air - 0.75 * sit + Math.sin(st.t * 1.1) * 0.08 - Math.min(0.35, speed * 0.04);
    tail.rotation.y = Math.sin(st.t * 1.4 + st.phase * 0.5) * (0.22 + 0.2 * amp) + 1.1 * sit;
    neck.rotation.x = 0.62 * sit * 0.9 + graze * 1.15;
    head.rotation.x = -0.55 * sing - graze * 0.2 + Math.sin(st.t * 0.9) * 0.04 + Math.sin(st.phase * 2) * 0.04 * amp;
    head.rotation.y += ((inp.look || 0) - head.rotation.y) * Math.min(1, dt * 4);
    st.blink -= dt;
    const bk = st.blink < 0.12 ? 0.15 : 1;
    if (st.blink < 0) st.blink = 2 + Math.random() * 5;
    eyes[0].scale.y = eyes[1].scale.y = 0.042 * bk * (1 - 0.7 * sing);
    const tw = Math.sin(st.t * 0.7) > 0.96 ? 0.25 : 0;
    ears[0].rotation.x = -tw; ears[1].rotation.x = -tw * 0.6;
    if (tipGlow) tipGlow.material.opacity = 0.55 + 0.25 * Math.sin(st.t * 2.2) + sing * 0.4;
  }
  return { g, pose, head, tail, animate, st, cfg, body: mB };
}
