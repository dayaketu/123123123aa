// Cielo, sol, luna, estrellas, nubes, agua y la luz del día.
import * as THREE from 'three';
import { smooth, rng } from './noise.js';

const C = (h) => new THREE.Color(h);
// Claves por elevación del sol (e = sunDir.y). Se interpola entre ellas.
const KEYS = [
  { e: -0.32, top: C(0x0a1030), hor: C(0x24305c), fog: C(0x1c2648), sun: C(0x8ea6ff), si: 0.75, hs: C(0x44569c), hg: C(0x1c2236), hi: 1.15, cloud: C(0x39446f) },
  { e: -0.10, top: C(0x1b2456), hor: C(0x6d5a8c), fog: C(0x4a4a78), sun: C(0x9fa8e8), si: 0.5, hs: C(0x5c66a8), hg: C(0x2a2c44), hi: 1.3, cloud: C(0x6a5f8e) },
  { e: 0.00, top: C(0x34509a), hor: C(0xffa678), fog: C(0xdc9c8c), sun: C(0xff9a5e), si: 1.4, hs: C(0x8f8cc4), hg: C(0x5a4a4a), hi: 1.6, cloud: C(0xffa890) },
  { e: 0.13, top: C(0x4f86d2), hor: C(0xffd9a6), fog: C(0xf0d2b4), sun: C(0xffc98c), si: 2.5, hs: C(0xb4c8ee), hg: C(0x8a7a5e), hi: 1.9, cloud: C(0xffe6cc) },
  { e: 0.36, top: C(0x4a93e6), hor: C(0xcfeaff), fog: C(0xcbe4f4), sun: C(0xfff0d8), si: 3.0, hs: C(0xc2e0ff), hg: C(0x8e9a6c), hi: 2.1, cloud: C(0xffffff) },
  { e: 1.00, top: C(0x3f8ae4), hor: C(0xc4e6ff), fog: C(0xc6e2f6), sun: C(0xfff6e6), si: 3.2, hs: C(0xc8e4ff), hg: C(0x90a070), hi: 2.2, cloud: C(0xffffff) },
];
const DUSK_HOR = C(0xff8fa0), DUSK_FOG = C(0xe69aa6);

export class Sky {
  constructor(scene, camera, q) {
    this.scene = scene; this.camera = camera; this.q = q;
    this.time = 0.29;                 // 0 medianoche · 0.25 amanecer · 0.5 mediodía · 0.75 atardecer
    this.dayLength = 720;             // segundos por día completo
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
    this.night = 0;                   // 0..1
    this.cur = { top: C(0), hor: C(0), fog: C(0), sun: C(0), hs: C(0), hg: C(0), cloud: C(0), si: 1, hi: 1 };

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 2);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xcfe6f5, 60, q.fogFar);

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: C(0) }, uHor: { value: C(0) }, uSunDir: { value: this.sunDir }, uMoonDir: { value: this.moonDir },
        uSunCol: { value: C(0xffffff) }, uNight: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uTop, uHor, uSunDir, uMoonDir, uSunCol; uniform float uNight;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.25, 1.0);
          vec3 col = mix(uHor, uTop, pow(smoothstep(-0.02, 0.75, h), 0.65));
          col = mix(col, uHor * 0.92, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (smoothstep(0.9990, 0.9994, s) * 1.2 + pow(s, 420.0) * 0.5 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.08) * (1.0 - uNight * 0.9);
          float m = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.86, 0.9, 1.0) * (smoothstep(0.99955, 0.9997, m) * 0.95 + pow(m, 700.0) * 0.3 + pow(m, 40.0) * 0.07) * uNight;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false;
    scene.add(this.dome);

    // estrellas
    const r = rng(77), n = 1400, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), b = 0.45 + 0.55 * r() ** 2;
      sp[i * 3] = Math.cos(a) * s * 950; sp[i * 3 + 1] = u * 950; sp[i * 3 + 2] = Math.sin(a) * s * 950;
      sc[i * 3] = b; sc[i * 3 + 1] = b * (0.9 + 0.1 * r()); sc[i * 3 + 2] = b * (0.85 + 0.25 * r());
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.stars.renderOrder = -9; this.stars.frustumCulled = false;
    scene.add(this.stars);

    // nubes de baja poligonización
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false });
    this.clouds = [];
    const cg = [0, 1, 2].map((k) => {
      const parts = [], rr = rng(300 + k);
      for (let i = 0; i < 5 + k; i++) {
        const g = new THREE.IcosahedronGeometry(10 + rr() * 9, 1);
        g.scale(1.5, 0.62, 1.1); g.translate((rr() - 0.5) * 46, (rr() - 0.3) * 6, (rr() - 0.5) * 20);
        parts.push(g);
      }
      return mergeGeos(parts);
    });
    const N = q.mobile ? 12 : 20;
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(cg[i % 3], this.cloudMat);
      m.userData = { x: (r() - 0.5) * 1500, z: (r() - 0.5) * 1500, y: 150 + r() * 110 };
      m.scale.setScalar(0.8 + r() * 1.3); m.rotation.y = r() * 6.28;
      scene.add(m); this.clouds.push(m);
    }

    // agua
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uSky: { value: C(0) }, uDeep: { value: C(0x2a6f8e) }, uSunDir: { value: this.sunDir }, uSunCol: { value: C(0xffffff) },
        uFog: { value: C(0) }, uFogNear: { value: 60 }, uFogFar: { value: q.fogFar }, uCam: { value: new THREE.Vector3() }, uLight: { value: 1 },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        varying vec3 vW; uniform float uTime, uFogNear, uFogFar, uLight; uniform vec3 uSky, uDeep, uSunDir, uSunCol, uFog, uCam;
        float wave(vec2 p, float t){ return sin(p.x * 0.31 + t) * 0.5 + sin(p.y * 0.27 - t * 1.2) * 0.5 + sin((p.x + p.y) * 0.71 + t * 1.7) * 0.25 + sin((p.x - p.y) * 1.3 - t * 2.1) * 0.12; }
        void main(){
          vec3 V = uCam - vW; float dist = length(V); V /= dist;
          float t = uTime * 0.9, e = 0.35;
          float w0 = wave(vW.xz, t);
          vec3 N = normalize(vec3(w0 - wave(vW.xz + vec2(e, 0.0), t), 2.6, w0 - wave(vW.xz + vec2(0.0, e), t)));
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 col = mix(uDeep * uLight, uSky, 0.25 + 0.7 * fres);
          vec3 R = reflect(-uSunDir, N);
          float spec = pow(max(dot(R, V), 0.0), 90.0);
          col += uSunCol * spec * 0.9;
          col += uSky * 0.06 * smoothstep(0.55, 0.9, w0);
          float f = smoothstep(uFogNear, uFogFar, dist);
          gl_FragColor = vec4(mix(col, uFog, f), mix(0.78, 1.0, max(fres, f)));
          #include <colorspace_fragment>
        }`,
    }));
    this.water.renderOrder = 2;
    scene.add(this.water);
  }

  update(dt, focus) {
    this.time = (this.time + dt / this.dayLength) % 1;
    const a = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.88, Math.sin(a), 0.42).normalize();
    this.moonDir.set(-Math.cos(a) * 0.8, -Math.sin(a) * 0.9 + 0.12, -0.5).normalize();
    const e = this.sunDir.y, c = this.cur;
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const A = KEYS[i], B = KEYS[i + 1], t = smooth(A.e, B.e, e);
    for (const k of ['top', 'hor', 'fog', 'sun', 'hs', 'hg', 'cloud']) c[k].copy(A[k]).lerp(B[k], t);
    c.si = A.si + (B.si - A.si) * t; c.hi = A.hi + (B.hi - A.hi) * t;
    // el atardecer es más rosado que el amanecer
    const dusk = (this.time > 0.5 ? 1 : 0) * smooth(0.3, 0.02, Math.abs(e));
    c.hor.lerp(DUSK_HOR, dusk * 0.55); c.fog.lerp(DUSK_FOG, dusk * 0.5);
    this.night = smooth(0.06, -0.2, e);

    const useMoon = e < -0.06;
    const dir = useMoon ? this.moonDir : this.sunDir;
    this.sun.position.copy(focus).addScaledVector(dir, 200);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.si * (useMoon ? smooth(-0.06, -0.2, e) : smooth(-0.06, 0.05, e) * 0.9 + 0.1);
    this.hemi.color.copy(c.hs); this.hemi.groundColor.copy(c.hg); this.hemi.intensity = c.hi;
    this.scene.fog.color.copy(c.fog);

    const cam = this.camera.position, du = this.dome.material.uniforms;
    this.dome.position.copy(cam);
    du.uTop.value.copy(c.top); du.uHor.value.copy(c.fog).lerp(c.hor, 0.75); du.uSunCol.value.copy(c.sun); du.uNight.value = this.night;
    this.stars.position.copy(cam); this.stars.rotation.z = this.time * 6.283; this.stars.rotation.x = 0.6;
    this.stars.material.opacity = this.night * 0.95;

    this.cloudMat.color.copy(c.cloud);
    for (const m of this.clouds) {
      const u = m.userData;
      u.x += dt * 2.2; u.z += dt * 0.8;
      let rx = u.x - cam.x, rz = u.z - cam.z;
      rx = ((rx % 1500) + 2250) % 1500 - 750; rz = ((rz % 1500) + 2250) % 1500 - 750;
      m.position.set(cam.x + rx, u.y, cam.z + rz);
    }

    const wu = this.water.material.uniforms;
    this.water.position.set(Math.round(cam.x / 8) * 8, 0, Math.round(cam.z / 8) * 8);
    wu.uTime.value += dt; wu.uCam.value.copy(cam);
    wu.uSky.value.copy(c.hor).lerp(c.top, 0.45); wu.uSunCol.value.copy(c.sun).multiplyScalar(useMoon ? 0.35 : 1);
    wu.uFog.value.copy(c.fog); wu.uLight.value = 0.3 + 0.7 * (1 - this.night);
  }
}

function mergeGeos(list) {
  const n = list.reduce((s, g) => s + g.attributes.position.count, 0), p = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { p.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.computeBoundingSphere();
  return out;
}
