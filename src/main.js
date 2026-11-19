// Tierra Tibia — punto de entrada. Une el mundo, el cielo, tu zorrito, los lugares,
// la fauna, los otros viajeros y el sonido.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { World, shared, pickQuality, heightAt, slopeAt } from './world.js';
import { Sky } from './sky.js';
import { Rings, Motes, SungFlowers } from './fx.js';
import { Player, CameraRig } from './player.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Landmarks, WISH_COUNT } from './landmarks.js';
import { Fauna } from './fauna.js';
import { Travelers, Net } from './social.js';
import { FOX_COLORS } from './creatures.js';
import { smooth } from './noise.js';

const $ = (id) => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;
document.title = CONFIG.name;
$('title').textContent = CONFIG.name; $('tagline').textContent = CONFIG.tagline;

// ---------- guardado local ----------
const KEY = 'tierra-tibia-v1';
const save = (() => {
  const d = { color: 0, lit: {}, lights: [], flowers: [], seen: {}, x: null, z: null, t: null };
  try { return Object.assign(d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return d; }
})();
function persist() {
  try {
    save.x = player.pos.x; save.z = player.pos.z; save.t = sky.time; save.flowers = fx.flowers.save();
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch { /* almacenamiento bloqueado: no pasa nada */ }
}

// ---------- escena ----------
const q = pickQuality();
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(q.dpr);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1800);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const sound = new Sound();
const _v = new THREE.Vector3(), _r = new THREE.Vector3();
// paneo estéreo de un punto del mundo respecto a la cámara
const panOf = (x, z) => {
  camera.getWorldDirection(_v); _r.set(-_v.z, 0, _v.x).normalize();
  const dx = x - camera.position.x, dz = z - camera.position.z, l = Math.hypot(dx, dz) || 1;
  return Math.max(-1, Math.min(1, ((dx * _r.x + dz * _r.z) / l) * 0.9));
};

const world = new World(scene, q);
const sky = new Sky(scene, camera, q);
if (save.t != null) sky.time = save.t;
const fx = { rings: new Rings(scene), motes: new Motes(scene, q.mobile ? 300 : 600), flowers: new SungFlowers(scene) };
const landmarks = new Landmarks(scene, fx, sound, save, panOf);
const fauna = new Fauna(scene, q, sound, panOf);
const travelers = new Travelers(scene, fx, sound, panOf, landmarks);
const player = new Player(scene, save.color);
const rig = new CameraRig(camera);
const inp = new Input(canvas, $('joy'));
let net = null, started = false;

function findStart() {
  for (let r = 0; r < 240; r += 6) for (let a = 0; a < 12; a++) {
    const x = 10 + Math.cos(a * 0.5236) * r, z = 8 + Math.sin(a * 0.5236) * r, h = heightAt(x, z);
    if (h > 3 && h < 25 && slopeAt(x, z) < 0.15) return [x, z];
  }
  return [10, 8];
}
const [sx, sz] = save.x != null ? [save.x, save.z] : findStart();
player.place(sx, sz); player.heading = rig.yaw + Math.PI; player.sit(true);
fx.flowers.load(save.flowers);

// ---------- avisos ----------
const toastEl = $('toast'), hintEl = $('hint');
let toastT = 0, hintT = 0;
function toast(msg, ms = 5200) { toastEl.textContent = msg; toastEl.classList.add('on'); toastT = ms / 1000; }
function hint(msg) { if (msg !== hintEl.textContent) hintEl.textContent = msg; hintEl.classList.add('on'); hintT = 0.8; }
const KEYS = touch ? { sing: 'Toca ♪', sit: 'Toca ◡', light: 'Toca ✦' } : { sing: 'Canta (E)', sit: 'Siéntate (C)', light: 'Deja una luz (L)' };

const WISHES = [
  'Que hoy encuentres un momento de calma.', 'Alguien pensó en ti al encender esta luz.', 'Que tu cuerpo descanse y tu mente se aligere.',
  'Que haya risas pronto, de las que se contagian.', 'Gracias por estar aquí.', 'Que tengas el valor suave de empezar de nuevo.',
  'Que lo que te preocupa pese un poco menos mañana.', 'Que nunca te falte un lugar tibio donde volver.', 'Respira. Aquí no hay prisa.',
  'Que seas amable contigo hoy.', 'Que algo bonito te sorprenda en el camino.', 'Que la gente que quieres esté bien.',
];
if (WISHES.length < WISH_COUNT) throw new Error('faltan deseos');

// ---------- acciones ----------
let callCd = 0, callT = 0, lightCd = 0, flowerT = 0, photoReq = false, lastWish = null;

function sing() {
  if (!started || callCd > 0) return;
  callCd = 0.55;
  const p = player.pos, deg = sound.call();
  player.sing = 1; callT = 0.0001;
  shared.uCall.value.set(p.x, p.z, 0, 1);
  fx.rings.spawn(p.x, p.z, 0xfff0c8, 17, 2.4);
  fx.motes.burst(p.x, p.y + 1.1, p.z, 0xfff0c8, 10, 1.6, 1.6);
  const hit = landmarks.onCall(p);
  fauna.onCall(p, deg); travelers.onCall(p, deg);
  if (hit) save.seen.sung = 1;
  if (player.onGround && !player.swimming && !player.gliding) {
    for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283, r = 1.4 + Math.random() * 3.6; fx.flowers.add(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); }
  }
  if (net) net.send({ t: 'call', n: deg });
}
function sit() { if (started) player.sit(!player.sitting); }
function leaveLight() {
  if (!started || lightCd > 0) return;
  if (player.swimming || !player.onGround) { toast('Mejor en tierra firme.', 2500); return; }
  lightCd = 3;
  const x = player.pos.x + Math.sin(player.heading) * 1.6, z = player.pos.z + Math.cos(player.heading) * 1.6, w = (Math.random() * WISH_COUNT) | 0;
  landmarks.addLight(x, z, w, 'me'); save.seen.light = 1;
  if (net) net.send({ t: 'light', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, w });
  toast('Dejaste una luz. Alguien la encontrará.', 3500);
}
function toggleMute() { sound.setMuted(!sound.muted); $('bMute').classList.toggle('off', sound.muted); }
function toggleHelp(on) { const h = $('help'); h.hidden = on === undefined ? !h.hidden : !on; }

$('bSing').onpointerdown = (e) => { e.preventDefault(); inp.actions.push('sing'); };
$('bSit').onpointerdown = (e) => { e.preventDefault(); inp.actions.push('sit'); };
$('bLight').onpointerdown = (e) => { e.preventDefault(); inp.actions.push('light'); };
inp.bindHold($('bJump'));
$('bMute').onclick = toggleMute; $('bHelp').onclick = () => toggleHelp(); $('helpClose').onclick = () => toggleHelp(false);
$('bPhoto').onclick = () => { photoReq = true; };
$('helpList').innerHTML = touch
  ? '<li>Arrastra a la <b>izquierda</b> para caminar</li><li>Arrastra a la <b>derecha</b> para mirar; pellizca para acercar</li><li><b>♪</b> canta · <b>↑</b> salta (mantén para planear) · <b>◡</b> siéntate · <b>✦</b> deja una luz</li>'
  : '<li><kbd>W A S D</kbd> caminar · <kbd>Shift</kbd> correr</li><li>Arrastra con el ratón para mirar · rueda para acercar</li><li><kbd>E</kbd> o clic: cantar</li><li><kbd>Espacio</kbd> saltar (mantén en el aire para planear)</li><li><kbd>C</kbd> sentarte · <kbd>L</kbd> dejar una luz</li><li><kbd>P</kbd> foto · <kbd>M</kbd> sonido · <kbd>H</kbd> esta ayuda</li>';
$('introKeys').textContent = touch ? 'Izquierda: caminar · Derecha: mirar · ♪ cantar' : 'WASD caminar · E cantar · C sentarte · Espacio saltar y planear';
if (CONFIG.support && CONFIG.support.url) { const a = $('support'); a.href = CONFIG.support.url; a.textContent = CONFIG.support.label || 'Apoyar'; a.hidden = false; }

// ---------- portada ----------
const sw = $('swatches');
FOX_COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = '#' + c.toString(16).padStart(6, '0'); b.setAttribute('aria-label', 'Color ' + (i + 1));
  b.className = i === save.color ? 'sel' : '';
  b.onclick = () => { save.color = i; player.setColor(i); player.sit(true); [...sw.children].forEach((x, k) => x.classList.toggle('sel', k === i)); };
  sw.appendChild(b);
});

world.update(sx, sz, 0);
const totalJobs = Math.max(1, world.queue.length);
let ready = false;
const go = $('go');
go.onclick = () => {
  if (!ready || started) return;
  started = true; inp.enabled = true; sound.init();
  $('intro').classList.add('gone'); $('hud').classList.remove('off');
  setTimeout(() => { $('intro').style.display = 'none'; }, 1600);
  player.sit(false);
  if (CONFIG.server) {
    net = new Net(CONFIG.server, travelers, landmarks, (n) => { const el = $('presence'); el.classList.toggle('on', n > 0); el.textContent = n + (n === 1 ? ' viajero contigo' : ' viajeros contigo'); });
    net.color = save.color;
  }
  setTimeout(() => toast(touch ? 'Arrastra a la izquierda para caminar.' : 'Camina con W A S D. Con E puedes cantar.', 6000), 1800);
};

// ---------- eventos del jugador ----------
const ev = {
  step: (swim) => sound.step(swim),
  land: (swim) => { sound.land(); if (swim) ev.splash(); },
  jump: () => sound.burst(0.1, 600, 0.03),
  splash: () => {
    const p = player.pos; sound.burst(0.5, 1100, 0.09, 'bandpass');
    fx.rings.spawn(p.x, p.z, 0xbfe8ff, 6, 1.6); fx.motes.burst(p.x, 0.2, p.z, 0xcfeeff, 14, 2.4, 1.2);
  },
};

// ---------- bucle ----------
let waterT = 0, hintCheck = 0, saveT = 0, water = 0, last = performance.now();
const noLook = { lookX: 0, lookY: 0, zoom: 0, jump: false };
const dirs = [[12, 0], [-12, 0], [0, 12], [0, -12]];

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  inp.poll(dt);
  for (const a of inp.actions.splice(0)) {
    if (a === 'sing') sing(); else if (a === 'sit') sit(); else if (a === 'light') leaveLight();
    else if (a === 'mute') toggleMute(); else if (a === 'help') toggleHelp(); else if (a === 'close') toggleHelp(false); else if (a === 'photo') photoReq = true;
  }
  const look = started ? inp.consume() : noLook;
  callCd -= dt; lightCd -= dt;
  const night = sky.night;

  player.update(dt, inp, look, rig.yaw, world, night, ev);
  landmarks.collide(player.pos, 0.4);
  rig.update(dt, player, look, inp, !started);
  world.update(player.pos.x, player.pos.z, started ? 8 : 26);
  sky.update(dt, player.pos);

  shared.uTime.value += dt; shared.uPlayer.value.copy(player.pos);
  if (callT > 0) {
    callT += dt / 2.2;
    if (callT >= 1) { callT = 0; shared.uCall.value.set(0, 0, -100, 0); }
    else shared.uCall.value.set(shared.uCall.value.x, shared.uCall.value.y, callT * 36, (1 - callT) ** 1.4);
  }
  landmarks.update(dt, player.pos, night);
  fauna.update(dt, player, sky, camera);
  travelers.update(dt, player, night);
  fx.rings.update(dt); fx.motes.update(dt); fx.flowers.update(dt);
  if (net) net.update(dt, player);

  // al sentarte un rato, brotan flores a tu alrededor
  if (player.sitting && player.sitTime > 3 && (flowerT -= dt) <= 0) {
    flowerT = 3.5; const a = Math.random() * 6.283, r = 1 + Math.random() * 2.6;
    fx.flowers.add(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r);
  }
  // agua cerca → sonido de agua
  if ((waterT -= dt) <= 0) {
    waterT = 0.3; let n = 0;
    for (const [dx, dz] of dirs) if (heightAt(player.pos.x + dx, player.pos.z + dz) < 0) n++;
    water = n / 4 + (player.swimming ? 0.5 : 0);
  }
  const s = sound.s;
  s.speed = player.speed; s.night = night; s.water = Math.min(1, water); s.glide = player.gliding ? 1 : 0;
  s.fire = landmarks.fireNear; s.sit = player.sitting ? 1 : 0; s.high = smooth(40, 60, player.pos.y);
  if (player.swimming && player.speed > 1.2 && Math.random() < dt * 1.5) fx.rings.spawn(player.pos.x, player.pos.z, 0xbfe8ff, 4, 1.4);

  // textos contextuales
  if ((toastT -= dt) <= 0) toastEl.classList.remove('on');
  if ((hintT -= dt) <= 0) hintEl.classList.remove('on');
  if (started && (hintCheck -= dt) <= 0) {
    hintCheck = 0.4; contextHint();
  }
  if ((saveT -= dt) <= 0) { saveT = 8; if (started) persist(); }

  // preparación del mundo
  if (!ready) {
    const prog = 1 - world.queue.length / totalJobs;
    $('barFill').style.width = Math.round(prog * 100) + '%';
    if (prog > 0.3 || now > 12000) {
      ready = true; go.disabled = false; go.textContent = 'Entrar'; $('barFill').parentElement.classList.add('done');
    }
  }
  renderer.render(scene, camera);
  if (photoReq) { photoReq = false; takePhoto(); }
}

function contextHint() {
  const near = landmarks.near;
  if (near && near !== lastWish && near.w != null) {
    lastWish = near;
    if (near.from === 'me' && lightCd > -6) return;   // la que acabas de dejar: ya lo sabes
    toast((near.from === 'me' ? 'Tu luz: ' : near.from === 'other' ? 'Luz de otra persona: ' : '') + '“' + WISHES[near.w % WISHES.length] + '”', 7000);
    return;
  }
  if (!near) lastWish = null;
  const p = player.pos;
  let msg = '';
  for (const o of landmarks.active.values()) {
    const d = Math.hypot(o.lm.x - p.x, o.lm.z - p.z);
    if (!save.seen.sung && ((o.type === 'lantern' && !o.lit && d < 13) || (o.type === 'circle' && d < 10) || (o.type === 'tree' && d < 20))) msg = KEYS.sing + ' para despertar este lugar';
    else if (!save.seen.sit && o.type === 'fire' && d < 7) msg = KEYS.sit + ' junto al fuego';
  }
  if (msg) hint(msg);
}

function takePhoto() {
  canvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = CONFIG.name.replace(/\s+/g, '-').toLowerCase() + '.png';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Foto guardada.', 2500);
  });
}

// panel de pruebas de rendimiento (temporal): FPS + calidad. Quitar cuando termine la prueba.
{
  const store = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* nada */ } };
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const box = document.createElement('div'); box.id = 'perf';
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;display:flex;gap:4px;align-items:center;font:12px monospace;color:#fff;touch-action:manipulation';
  const mk = (txt, on) => {
    const b = document.createElement('button');
    b.textContent = txt; b.style.cssText = 'font:12px monospace;color:#fff;background:#0007;border:1px solid #fff4;border-radius:6px;padding:3px 7px;cursor:pointer';
    b.onclick = on; box.appendChild(b); return b;
  };
  const info = document.createElement('span');
  info.style.cssText = 'background:#0007;padding:3px 8px;border-radius:6px;pointer-events:none;white-space:nowrap';
  let showFps = read('tt-fps') !== '0';
  const bFps = mk('FPS', () => { showFps = !showFps; store('tt-fps', showFps ? '1' : '0'); paint(); });
  box.appendChild(info);
  const cur = new URLSearchParams(location.search).get('q') || read('tt-quality') || 'auto';
  const opts = [['auto', 'Auto'], ['low', 'Baja'], ['high', 'Alta']].map(([v, l]) => mk(l, () => { store('tt-quality', v === 'auto' ? null : v); location.search = ''; }));
  function paint() {
    info.style.display = showFps ? '' : 'none'; bFps.style.opacity = showFps ? 1 : 0.55;
    opts.forEach((b, i) => { b.style.background = ['auto', 'low', 'high'][i] === cur ? '#f2a869cc' : '#0007'; });
  }
  paint(); document.body.appendChild(box);
  let n = 0, t0 = performance.now(), worst = 0, prev = t0;
  (function loop(now) {
    n++; worst = Math.max(worst, now - prev); prev = now;
    if (now - t0 > 1000) { info.textContent = Math.round(n * 1000 / (now - t0)) + ' fps · peor ' + Math.round(worst) + ' ms · ' + (q.mobile ? 'baja' : 'alta'); n = 0; worst = 0; t0 = now; }
    requestAnimationFrame(loop);
  })(t0);
}
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
// ganchos para pruebas automáticas
window.__game = { player, world, sky, landmarks, fauna, travelers, rig, fx, sound, save, sing, leaveLight, sit, get ready() { return ready; }, start: () => go.click() };
requestAnimationFrame(frame);
