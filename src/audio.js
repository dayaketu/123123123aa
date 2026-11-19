// Sonido: todo se sintetiza en el navegador (sin archivos). Música suave y generativa,
// viento, agua, pájaros, grillos y las notas del canto.
const SCALE = [0, 2, 4, 7, 9];            // pentatónica mayor
const CHORDS = [[0, 7, 16], [-3, 4, 12], [5, 12, 21], [-5, 7, 14], [0, 9, 16]];

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.root = 146.83; this.deg = 5;
    this.s = { speed: 0, night: 0, water: 0, glide: 0, fire: 0, sit: 0, high: 0 };
    this.nextNote = 0; this.nextBird = 0; this.nextChord = 0; this.nextCricket = 0; this.chord = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC(), now = ctx.currentTime;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, now, 1.5);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    // reverberación: impulso de ruido que decae
    const len = Math.floor(ctx.sampleRate * 3.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    const rg = ctx.createGain(); rg.gain.value = 0.55; this.rev.connect(rg); rg.connect(this.master);
    // ruido para viento / agua / pasos
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    };
    this.wind = loop('bandpass', 420, 0.5); this.water = loop('lowpass', 520, 0.3); this.rain = loop('highpass', 2400, 0.2);
    // colchón armónico
    this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 700;
    this.padG = ctx.createGain(); this.padG.gain.value = 0; this.padG.gain.setTargetAtTime(0.11, now, 4);
    this.padF.connect(this.padG); this.padG.connect(this.master); this.padG.connect(this.rev);
    this.pad = CHORDS[0].map((st, i) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sine'; o2.type = 'triangle'; o2.detune.value = 6 + i * 3;
      o.frequency.value = o2.frequency.value = this.root / 2 * 2 ** (st / 12);
      g.gain.value = 0.28; l.frequency.value = 0.07 + i * 0.045; lg.gain.value = 0.16;
      l.connect(lg); lg.connect(g.gain); o.connect(g); o2.connect(g); g.connect(this.padF);
      o.start(); o2.start(); l.start();
      return [o, o2];
    });
    this.nextChord = now + 26; this.nextNote = now + 3; this.nextBird = now + 5;
    this.timer = setInterval(() => this.tick(), 200);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.3);
  }

  freq(deg, oct = 0) {
    const n = SCALE.length, o = Math.floor(deg / n);
    return this.root * 2 ** ((SCALE[((deg % n) + n) % n] + 12 * (o + oct)) / 12);
  }

  // Una voz simple: oscilador + envolvente + paneo, con algo de reverberación.
  tone(f, when, dur, vol, type = 'sine', pan = 0, wet = 0.7, f2 = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, when);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    let out = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
    out.connect(this.master);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; out.connect(w); w.connect(this.rev); }
    o.start(when); o.stop(when + dur + 0.05);
  }

  bell(deg, { vol = 0.2, pan = 0, oct = 0, when = 0, soft = false } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when, f = this.freq(deg, oct);
    this.tone(f, t, soft ? 2.6 : 2.0, vol, 'sine', pan, 0.9);
    this.tone(f * 2, t, 1.1, vol * 0.3, 'sine', pan, 0.8);
    this.tone(f * 3.01, t, 0.5, vol * 0.1, 'sine', pan, 0.6);
    if (!soft) this.tone(f * 0.5, t, 1.4, vol * 0.25, 'triangle', pan, 0.5);
  }

  // Tu canto: cada nota da un pasito por la escala. Devuelve el grado tocado.
  call() {
    const step = [-2, -1, -1, 1, 1, 2, 3][(Math.random() * 7) | 0];
    this.deg = Math.max(2, Math.min(11, this.deg + step));
    this.bell(this.deg, { vol: 0.24 });
    return this.deg;
  }
  answer(deg, pan, vol, delay = 0, oct = 0) { this.bell(deg, { vol: 0.2 * vol, pan, when: delay, oct, soft: true }); }

  lit() { [0, 2, 4, 5, 7].forEach((d, i) => this.bell(5 + d, { vol: 0.14, when: i * 0.13, soft: true, pan: (i - 2) * 0.2 })); }
  chime(n = 5, vol = 0.1) { for (let i = 0; i < n; i++) this.bell(10 + ((Math.random() * 6) | 0), { vol, when: i * (0.12 + Math.random() * 0.14), oct: 0, soft: true, pan: Math.random() * 2 - 1 }); }
  circle(i) { this.bell(i, { vol: 0.16, oct: -1, soft: true, pan: Math.sin(i) }); }

  burst(dur, freq, vol, type = 'lowpass', pan = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  step(swim) { if (swim) this.burst(0.25, 900, 0.05, 'bandpass'); else this.burst(0.07, 700 + Math.random() * 300, 0.035); }
  land() { this.burst(0.16, 420, 0.07); }

  tick() {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, s = this.s, day = 1 - s.night;
    // acordes que se deslizan despacio
    if (now > this.nextChord) {
      this.chord = (this.chord + 1 + ((Math.random() * 2) | 0)) % CHORDS.length;
      CHORDS[this.chord].forEach((st, i) => this.pad[i].forEach((o) => o.frequency.setTargetAtTime(this.root / 2 * 2 ** (st / 12), now, 2.5)));
      this.nextChord = now + 22 + Math.random() * 14;
    }
    this.padF.frequency.setTargetAtTime(420 + 520 * day + 200 * s.sit, now, 2);
    // melodía escasa
    if (now > this.nextNote) {
      const base = CHORDS[this.chord][(Math.random() * 3) | 0];
      const deg = 5 + ((Math.random() * 9) | 0), n = Math.random() < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const f = this.freq(deg + i * (Math.random() < 0.5 ? 1 : 2), s.night > 0.5 ? -1 : 0), t = now + i * (0.28 + Math.random() * 0.2);
        this.tone(f, t, 2.4, 0.045 + 0.02 * day, 'triangle', Math.random() * 1.2 - 0.6, 1);
        this.tone(f * 2, t, 1.2, 0.012, 'sine', 0, 1);
      }
      void base;
      this.nextNote = now + (2.2 + Math.random() * 5) * (1 + s.night * 0.8) * (s.sit > 0.5 ? 0.7 : 1);
    }
    // pájaros de día
    if (day > 0.5 && now > this.nextBird) {
      const f0 = 2200 + Math.random() * 2200, n = 2 + ((Math.random() * 4) | 0), pan = Math.random() * 2 - 1, v = 0.012 + Math.random() * 0.02;
      for (let i = 0; i < n; i++) this.tone(f0 * (1 + (Math.random() - 0.5) * 0.1), now + i * (0.11 + Math.random() * 0.05), 0.07 + Math.random() * 0.05, v, 'sine', pan, 0.5, f0 * (1.15 + Math.random() * 0.4));
      this.nextBird = now + 3 + Math.random() * 9;
    }
    // grillos de noche
    if (s.night > 0.4 && now > this.nextCricket) {
      const f = 4100 + ((Math.random() * 3) | 0) * 260, pan = Math.random() * 2 - 1;
      for (let i = 0; i < 3; i++) this.tone(f, now + i * 0.045, 0.03, 0.012 * s.night, 'sine', pan, 0.25);
      this.nextCricket = now + 0.35 + Math.random() * 0.6;
    }
    // chisporroteo de fogata
    if (s.fire > 0.05 && Math.random() < 0.5) this.burst(0.03 + Math.random() * 0.04, 1800 + Math.random() * 2500, 0.05 * s.fire, 'highpass');
    // viento y agua
    const gust = 0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.071);
    this.wind.g.gain.setTargetAtTime(0.02 + gust * 0.03 + s.speed * 0.004 + s.glide * 0.09 + s.high * 0.05, now, 0.6);
    this.wind.f.frequency.setTargetAtTime(340 + gust * 260 + s.glide * 500, now, 0.8);
    this.water.g.gain.setTargetAtTime(s.water * (0.1 + 0.04 * Math.sin(now * 0.8)), now, 0.8);
  }
}
