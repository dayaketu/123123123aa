// Servidor de presencia de Tierra Tibia. Retransmite posiciones, cantos y luces.
// No hay chat, ni cuentas, ni nombres: solo animales y luz. Guarda las últimas luces en disco.
//   cd server && npm install && PORT=8787 node server.js
// Detrás de nginx/Caddy con TLS se publica como wss://tu-dominio/tierra  (ver README).
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = +process.env.PORT || 8787;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean); // vacío = cualquiera
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 150;
const MAX_LIGHTS = 400, WISHES = 12, NEAR = 600, TICK_MS = 125, MAX_PER_IP = 4;
const FILE = join(dirname(fileURLToPath(import.meta.url)), 'lights.json');

let lights = [];
try { if (existsSync(FILE)) lights = JSON.parse(readFileSync(FILE, 'utf8')).slice(-MAX_LIGHTS); } catch { lights = []; }
let dirty = false;
setInterval(() => { if (dirty) { dirty = false; try { writeFileSync(FILE, JSON.stringify(lights)); } catch (e) { console.error('no pude guardar luces', e.message); } } }, 10000);

const wss = new WebSocketServer({ port: PORT, maxPayload: 512, perMessageDeflate: false });
const players = new Map(); // ws → { id, x, y, z, h, s, c, lastCall, lastLight }
const perIp = new Map();
let nextId = 1;
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if ((ORIGINS.length && !ORIGINS.includes(origin)) || players.size >= MAX_PLAYERS || (perIp.get(ip) || 0) >= MAX_PER_IP) return ws.close(1008, 'no');
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  const me = { id: nextId++, x: 0, y: 0, z: 0, h: 0, s: 0, c: 0, lastCall: 0, lastLight: 0, ready: false, msgs: 0 };
  players.set(ws, me);
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    if (++me.msgs > 40) return;                       // límite por segundo (se reinicia abajo)
    let m; try { m = JSON.parse(data); } catch { return; }
    const now = Date.now();
    if (m.t === 'hi') {
      me.c = Math.max(0, Math.min(6, m.c | 0)); me.ready = true;
      ws.send(JSON.stringify({ t: 'welcome', id: me.id, lights }));
    } else if (m.t === 'p' && me.ready) {
      const x = num(m.x, -1e5, 1e5), y = num(m.y, -100, 400), z = num(m.z, -1e5, 1e5), h = num(m.h, -10, 10);
      if (x === null || y === null || z === null || h === null) return;
      me.x = x; me.y = y; me.z = z; me.h = h; me.s = m.s & 7;
    } else if (m.t === 'call' && me.ready && now - me.lastCall > 400) {
      me.lastCall = now;
      const msg = JSON.stringify({ t: 'call', id: me.id, n: Math.max(0, Math.min(14, m.n | 0)) });
      for (const [w, o] of players) if (w !== ws && w.readyState === 1 && Math.hypot(o.x - me.x, o.z - me.z) < NEAR) w.send(msg);
    } else if (m.t === 'light' && me.ready && now - me.lastLight > 8000) {
      const x = num(m.x, -1e5, 1e5), z = num(m.z, -1e5, 1e5), w = m.w | 0;
      if (x === null || z === null || w < 0 || w >= WISHES) return;
      me.lastLight = now;
      const l = { x, z, w };
      lights.push(l); if (lights.length > MAX_LIGHTS) lights.shift(); dirty = true;
      const msg = JSON.stringify({ t: 'light', ...l });
      for (const [o, q] of players) if (o !== ws && q.ready && o.readyState === 1) o.send(msg);
    }
  });
  ws.on('close', () => {
    players.delete(ws); perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
    const msg = JSON.stringify({ t: 'leave', id: me.id });
    for (const w of players.keys()) if (w.readyState === 1) w.send(msg);
  });
  ws.on('error', () => {});
});

// Estado de los viajeros cercanos, 8 veces por segundo.
setInterval(() => {
  for (const [ws, me] of players) {
    if (!me.ready || ws.readyState !== 1) continue;
    const a = [];
    for (const [w, o] of players) {
      if (w === ws || !o.ready) continue;
      if (Math.hypot(o.x - me.x, o.z - me.z) < NEAR) a.push([o.id, o.x, o.y, o.z, o.h, o.s, o.c]);
      if (a.length >= 30) break;
    }
    ws.send(JSON.stringify({ t: 'ps', a }));
  }
}, TICK_MS);
setInterval(() => { for (const m of players.values()) m.msgs = 0; }, 1000);
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

console.log(`Tierra Tibia: servidor de presencia en el puerto ${PORT}`);
