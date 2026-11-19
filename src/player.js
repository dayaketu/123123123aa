// Tu zorrito: caminar, trotar, saltar, planear, nadar y sentarse. Y la cámara que lo sigue.
import * as THREE from 'three';
import { heightAt } from './world.js';
import { makeAnimal, FOX, FOX_COLORS } from './creatures.js';
import { makeGlow, GLOW } from './fx.js';
import { angDiff, clamp } from './noise.js';

const SWIM_Y = -0.42;

export class Player {
  constructor(scene, colorIdx = 0) {
    this.scene = scene;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.heading = 0;
    this.onGround = true; this.gliding = false; this.swimming = false; this.sitting = false;
    this.speed = 0; this.moveT = 0; this.sing = 0; this.sitTime = 0; this.stepPhase = 0;
    this.setColor(colorIdx);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: GLOW, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    this.shadow.renderOrder = 1; scene.add(this.shadow);
    this.light = new THREE.PointLight(0xffe2b0, 0, 16, 1.6); scene.add(this.light);
  }
  setColor(i) {
    this.colorIdx = i;
    if (this.fox) this.scene.remove(this.fox.g);
    this.fox = makeAnimal(FOX(FOX_COLORS[i % FOX_COLORS.length]));
    this.fox.g.scale.setScalar(1.2);
    this.glow = makeGlow(0xffe6b8, 4, 0.18); this.glow.position.y = 0.7; this.fox.g.add(this.glow);
    this.scene.add(this.fox.g);
  }
  place(x, z) { this.pos.set(x, Math.max(heightAt(x, z), SWIM_Y), z); this.vel.set(0, 0, 0); }
  sit(on) { if (on && (!this.onGround || this.swimming)) return; this.sitting = on; this.sitTime = 0; }

  update(dt, inp, look, camYaw, world, night, ev) {
    const mag = Math.min(1, Math.hypot(inp.mx, inp.my));
    if (this.sitting && (mag > 0.1 || look.jump)) this.sit(false);
    const sn = Math.sin(camYaw), cs = Math.cos(camYaw);
    let wx = -sn * inp.my + cs * inp.mx, wz = -cs * inp.my - sn * inp.mx;
    const moving = mag > 0.05 && !this.sitting;
    this.moveT = moving ? this.moveT + dt : 0;
    // velocidad: paseo → trote suave tras un momento; Mayús = correr
    let top = 4.6 + 3.6 * clamp((this.moveT - 0.8) / 1.6, 0, 1);
    if (inp.run) top = 11.5;
    if (this.swimming) top *= 0.55;
    const g0 = heightAt(this.pos.x, this.pos.z);
    if (moving && this.onGround) {      // cuesta arriba, un poco más lento
      const g1 = heightAt(this.pos.x + wx / mag * 0.8, this.pos.z + wz / mag * 0.8);
      top *= clamp(1 - (g1 - g0) * 0.55, 0.45, 1.15);
    }
    let tvx = 0, tvz = 0;
    if (moving) { tvx = wx * top; tvz = wz * top; }
    if (this.gliding) {
      const hx = moving ? wx / mag : Math.sin(this.heading), hz = moving ? wz / mag : Math.cos(this.heading);
      tvx = hx * 10.5; tvz = hz * 10.5;
    }
    const k = Math.min(1, dt * (this.onGround ? 9 : 2.2));
    this.vel.x += (tvx - this.vel.x) * k; this.vel.z += (tvz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    world.collide(this.pos, 0.4);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.4) this.heading += angDiff(Math.atan2(this.vel.x, this.vel.z), this.heading) * Math.min(1, dt * 10);

    const g = heightAt(this.pos.x, this.pos.z), floor = Math.max(g, SWIM_Y);
    const wasSwim = this.swimming;
    if (this.onGround) {
      this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 18);
      this.swimming = g < SWIM_Y - 0.12;
      this.gliding = false;
      if (look.jump && !this.sitting) { this.vel.y = this.swimming ? 5 : 10; this.onGround = false; ev.jump && ev.jump(); }
    } else {
      this.vel.y -= 22 * dt;
      this.gliding = inp.jumpHeld && this.vel.y < -0.5;
      if (this.gliding) this.vel.y += (-1.2 - this.vel.y) * Math.min(1, dt * 7);
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= floor) {
        this.pos.y = floor; this.vel.y = 0; this.onGround = true; this.gliding = false;
        this.swimming = g < SWIM_Y - 0.12;
        ev.land && ev.land(this.swimming);
      }
    }
    if (this.swimming && !wasSwim) ev.splash && ev.splash();
    if (this.sitting) this.sitTime += dt;

    // pasos
    if (this.onGround && this.speed > 1) {
      this.stepPhase += dt * (5 + this.speed * 1.35);
      if (this.stepPhase > Math.PI) { this.stepPhase -= Math.PI; ev.step && ev.step(this.swimming); }
    }
    this.sing = Math.max(0, this.sing - dt * 1.4);

    const f = this.fox;
    f.g.position.copy(this.pos); f.g.rotation.y = this.heading;
    // inclinarse con la pendiente (solo cabeceo, suave)
    const ahead = heightAt(this.pos.x + Math.sin(this.heading) * 0.7, this.pos.z + Math.cos(this.heading) * 0.7);
    const pitch = this.onGround && !this.swimming ? clamp(-(ahead - g) / 0.7, -0.6, 0.6) * 0.7 : this.gliding ? 0.12 : 0;
    f.g.rotation.x += (pitch - f.g.rotation.x) * Math.min(1, dt * 8);
    f.g.rotation.order = 'YXZ';
    f.animate(dt, { speed: this.speed, sit: this.sitting ? 1 : 0, air: this.onGround ? 0 : 1, swim: this.swimming ? 1 : 0, sing: this.sing > 0.4 ? 1 : 0 });
    this.glow.material.opacity = 0.1 + 0.4 * night + this.sing * 0.3;
    this.light.position.set(this.pos.x, this.pos.y + 1.3, this.pos.z);
    this.light.intensity = (2 + 14 * night) * (1 + this.sing * 0.8);
    const sh = clamp(1 - (this.pos.y - floor) / 9, 0, 1) * (this.swimming ? 0 : 1);
    this.shadow.position.set(this.pos.x, floor + 0.06, this.pos.z);
    this.shadow.material.opacity = 0.34 * sh * (1 - night * 0.6);
    this.shadow.scale.setScalar(1 + (this.pos.y - floor) * 0.12);
  }
}

export class CameraRig {
  constructor(camera) {
    this.cam = camera; this.yaw = 2.4; this.pitch = 0.3; this.dist = 9; this.target = new THREE.Vector3(); this.want = new THREE.Vector3();
    this.first = true;
  }
  update(dt, player, look, input, cinematic) {
    this.yaw -= look.lookX * 0.0052;
    this.pitch = clamp(this.pitch + look.lookY * 0.004, -0.12, 1.25);
    this.dist = clamp(this.dist + look.zoom, 3.5, 22);
    // si caminas sin tocar la cámara, se acomoda detrás poco a poco
    if (player.speed > 2 && input.idle > 2.2 && !player.sitting) {
      this.yaw += angDiff(player.heading + Math.PI, this.yaw) * Math.min(1, dt * 0.55);
    }
    if (player.sitting && input.idle > 3) this.yaw += dt * 0.045;
    if (cinematic) this.yaw += dt * 0.06;
    const p = player.pos, t = this.target;
    const ty = p.y + 1.25 + (player.sitting ? -0.2 : 0);
    if (this.first) { t.set(p.x, ty, p.z); }
    else { const k = 1 - Math.exp(-dt * 9); t.x += (p.x - t.x) * k; t.z += (p.z - t.z) * k; t.y += (ty - t.y) * (1 - Math.exp(-dt * 6)); }
    const d = this.dist * (player.gliding ? 1.25 : 1), cp = Math.cos(this.pitch);
    this.want.set(t.x + Math.sin(this.yaw) * cp * d, t.y + Math.sin(this.pitch) * d, t.z + Math.cos(this.yaw) * cp * d);
    const minY = Math.max(heightAt(this.want.x, this.want.z) + 0.8, 0.5);
    if (this.want.y < minY) this.want.y = minY;
    if (this.first) { this.cam.position.copy(this.want); this.first = false; }
    else this.cam.position.lerp(this.want, 1 - Math.exp(-dt * 10));
    this.cam.lookAt(t.x, t.y + 0.35, t.z);
  }
}
