// Entrada: teclado, ratón y táctil (joystick a la izquierda, mirar a la derecha).
export class Input {
  constructor(canvas, joy) {
    this.keys = new Set(); this.mx = 0; this.my = 0; this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.jump = false; this.jumpHeld = false; this.run = false; this.actions = []; this.idle = 0;
    this.joy = null; this.look = new Map(); this.joyEl = joy; this.knob = joy.firstElementChild;
    this.enabled = false; this.pinch = 0;

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.metaKey || e.ctrlKey) return;
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'Space') this.jump = true;
      const act = { KeyE: 'sing', KeyF: 'sing', Enter: 'sing', KeyC: 'sit', KeyQ: 'sit', KeyL: 'light', KeyM: 'mute', KeyH: 'help', Escape: 'close', KeyP: 'photo' }[k];
      if (act) this.actions.push(act);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.42 && !this.joy) {
        this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.joyEl.style.left = e.clientX + 'px'; this.joyEl.style.top = e.clientY + 'px'; this.joyEl.classList.add('on');
        this.knob.style.transform = 'translate(-50%,-50%)';
      } else {
        this.look.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, btn: e.button });
        this.pinch = 0;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
        const d = Math.hypot(dx, dy), R = 52;
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.jx = dx / R; this.jy = -dy / R;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        return;
      }
      const p = this.look.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (this.look.size >= 2) {          // pellizco para acercar
        const [a, b] = [...this.look.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoom += (this.pinch - d) * 0.03;
        this.pinch = d;
      } else { this.lookX += dx; this.lookY += dy; this.idle = 0; }
    });
    const up = (e) => {
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.jx = this.jy = 0; this.joyEl.classList.remove('on'); return; }
      const p = this.look.get(e.pointerId);
      if (!p) return;
      this.look.delete(e.pointerId); this.pinch = 0;
      if (e.type === 'pointerup' && p.moved < 8 && performance.now() - p.t < 350 && p.btn === 0) this.actions.push('sing');
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY) * 1.2; }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.jx = this.jy = 0;
  }

  // botón en pantalla que se puede mantener pulsado (saltar / planear)
  bindHold(el) {
    const down = (e) => { e.preventDefault(); this.jump = true; this.btnHeld = true; };
    const upf = () => { this.btnHeld = false; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', upf); el.addEventListener('pointerleave', upf); el.addEventListener('pointercancel', upf);
  }

  poll(dt) {
    const k = this.keys, h = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    let x = h('KeyD', 'ArrowRight') - h('KeyA', 'ArrowLeft'), y = h('KeyW', 'ArrowUp') - h('KeyS', 'ArrowDown');
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (this.joy) { x = this.jx; y = this.jy; }
    this.mx = x; this.my = y;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight');
    this.jumpHeld = k.has('Space') || !!this.btnHeld;
    this.idle += dt;
  }
  consume() { const o = { lookX: this.lookX, lookY: this.lookY, zoom: this.zoom, jump: this.jump }; this.lookX = this.lookY = this.zoom = 0; this.jump = false; return o; }
}
