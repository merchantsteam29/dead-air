// Things you can pick up: the camcorders and the junk. The host runs the physics (throws, bounces, bonks)
// and sends [id, kind, x, y, z, yaw, holder, battery, tape] in the snapshot.
// holder: '' (lying around), a player id, or 'T<thing id>' (the hand has it).
import * as THREE from 'three';
import { PROP_KINDS, makeProp, propRadius } from './models.js';
import { rng, r2, clamp } from './util.js';

export const ITEM_KINDS = ['cam', ...PROP_KINDS];
const G = 18;

export class Items {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.byId = new Map();
    this.nextId = 1;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.r = rng((game.seed ^ 0x17e5) >>> 0);
  }

  // ---- host ----
  add(kind, x, z, o = {}) {
    const it = { id: this.nextId++, kind, x, y: propRadius(kind), z, vx: 0, vy: 0, vz: 0, yaw: this.r() * 6.28, spin: 0, holder: '', rest: true, batt: 100, tape: 0, thrower: null, throwT: 0, ...o };
    this.list.push(it); this.byId.set(it.id, it);
    return it;
  }
  heldBy(id) { return this.list.find((i) => i.holder === id) || null; }
  carriedBy(holder) { for (const i of this.byId.values()) if (i.holder === holder) return i; return null; }

  hostUpdate(dt) {
    const g = this.g, W = g.world, living = g.living();
    for (const it of this.list) {
      if (it.holder) {
        if (it.holder[0] === 'T') { const th = g.things.byId.get(+it.holder.slice(1)); if (th) { it.x = th.x; it.z = th.z; it.y = 0.7; } else it.holder = ''; }
        else {
          const P = g.players.get(it.holder);
          if (!P || P.dead) { it.holder = ''; it.rest = false; }
          else { const f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }; it.x = P.x + f.x * 0.45; it.z = P.z + f.z * 0.45; it.y = P.y + 1.0; it.yaw = P.yaw; }
        }
        continue;
      }
      const r = propRadius(it.kind);
      // players shove things lying on the floor
      for (const P of living) {
        if (P.y > 0.5) continue;
        const dx = it.x - P.x, dz = it.z - P.z, d = Math.hypot(dx, dz), min = r + 0.34;
        if (d >= min || d < 1e-4 || it.y > r + 0.6) continue;
        it.x += (dx / d) * (min - d); it.z += (dz / d) * (min - d);
        const sp = Math.hypot(P.vx || 0, P.vz || 0);
        it.vx += (dx / d) * (1.5 + sp * 0.9); it.vz += (dz / d) * (1.5 + sp * 0.9); it.vy = Math.max(it.vy, sp > 4 ? 2.2 : 0.8);
        if (it.rest && sp > 1) g.sound('hit', it.x, it.y, it.z);
        it.rest = false;
      }
      if (it.rest) continue;
      it.vy -= G * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      it.yaw += it.spin * dt;
      const speed = Math.hypot(it.vx, it.vy, it.vz);
      // walls
      const p = { x: it.x, z: it.z, nx: 0, nz: 0 };
      if (W.collide(p, r)) {
        const dot = it.vx * p.nx + it.vz * p.nz;
        if (dot < 0) { it.vx -= 1.6 * dot * p.nx; it.vz -= 1.6 * dot * p.nz; }
        it.x = p.x; it.z = p.z;
        if (speed > 4) g.sound('hit', it.x, it.y, it.z);
      }
      // floor
      if (it.y < r) {
        it.y = r;
        if (it.vy < -4) { g.sound('hit', it.x, it.y, it.z); g.noise(it.x, it.z, 14); }
        it.vy = it.vy < -1.5 ? -it.vy * 0.35 : 0;
        it.vx *= 0.7; it.vz *= 0.7; it.spin *= 0.6;
        if (Math.hypot(it.vx, it.vz) < 0.15 && Math.abs(it.vy) < 0.1) { it.vx = it.vz = it.vy = 0; it.spin = 0; it.rest = true; }
      }
      // bonks: a fast thing hits a person or a creature
      if (speed > 5.5) {
        for (const P of living) {
          if (P.id === it.thrower && g.time - it.throwT < 0.4) continue;
          if (Math.hypot(P.x - it.x, P.z - it.z) < r + 0.38 && it.y < P.y + 1.6 && it.y > P.y - 0.2) {
            g.knockDown(P.id, 1.4, 'p:' + (it.thrower || ''));
            g.sound('bonk', it.x, it.y, it.z);
            it.vx *= -0.3; it.vz *= -0.3; it.vy = 2;
          }
        }
        for (const th of g.things.list) {
          const ty = th.kind === 'balloon' ? th.y : th.kind === 'hand' ? 0.3 : 1.2;
          if (Math.hypot(th.x - it.x, th.z - it.z) < r + 0.5 && Math.abs(it.y - ty) < 1.1 && g.things.struck(th)) { it.vx *= -0.3; it.vz *= -0.3; it.vy = 2; break; }
        }
      }
      if (it.y < -5 || it.x < 0 || it.z < 0 || it.x > W.W || it.z > W.H) { Object.assign(it, { x: W.van.x + 2, z: W.van.z + 4, y: 1, vx: 0, vy: 0, vz: 0 }); }
    }
  }

  // Host: P picks up item id. Returns true if they got it.
  grab(P, id) {
    const it = this.byId.get(id);
    if (!it || it.holder || P.dead || P.down || this.heldBy(P.id)) return false;
    if (Math.hypot(it.x - P.x, it.z - P.z) > 2.8) return false;
    it.holder = P.id; it.rest = false;
    return true;
  }
  // Host: P lets go of what they hold, at (x, y, z) with velocity v.
  release(P, m) {
    const it = this.heldBy(P.id);
    if (!it) return null;
    it.holder = '';
    let x = m.x ?? P.x, z = m.z ?? P.z;
    if (this.g.world.solidCell(Math.floor(x), Math.floor(z)) || !this.g.world.los(P.x, P.z, x, z)) { x = P.x; z = P.z; }
    Object.assign(it, { x, z, y: clamp(m.y ?? P.y + 1.2, 0.2, 3), vx: m.vx || 0, vy: m.vy || 0, vz: m.vz || 0, spin: (this.r() - 0.5) * 12, rest: false, thrower: P.id, throwT: this.g.time });
    return it;
  }

  snap() { return this.list.map((i) => [i.id, ITEM_KINDS.indexOf(i.kind), r2(i.x), r2(i.y), r2(i.z), r2(i.yaw), i.holder, Math.round(i.batt), Math.round(i.tape)]); }

  // ---- everyone ----
  applySnap(arr) {
    for (const [id, k, x, y, z, yaw, holder, batt, tape] of arr) {
      let it = this.byId.get(id);
      if (!it) { it = { id, kind: ITEM_KINDS[k], x, y, z, yaw, holder, batt, tape }; if (!this.g.isHost) this.list.push(it); this.byId.set(id, it); }
      // the battery of the camcorder in my hands runs down here; the host's number lags a second behind
      if (!this.g.isHost) Object.assign(it, { x, y, z, yaw, holder, batt: holder === this.g.myId && it.holder === holder ? Math.min(it.batt, batt) : batt, tape });
      if (!it.model) { it.model = makeProp(it.kind); it.rx = x; it.ry = y; it.rz = z; it.ryaw = yaw; this.group.add(it.model); }
    }
  }

  render(dt) {
    const g = this.g, k = 1 - Math.exp(-dt * 16), t = performance.now() / 1000;
    for (const it of this.byId.values()) {
      const m = it.model; if (!m) continue;
      const ph = it.holder;
      if (ph && ph[0] === 'T') continue; // the hand draws it
      if (ph) {
        // my own is drawn in first person; a friend's sits in their model's hand (game.js puts it there)
        if (ph === g.myId) { if (m.parent !== this.group) this.group.add(m); m.visible = false; it.rx = it.x; it.ry = it.y; it.rz = it.z; continue; }
        if (g.players.get(ph)?.model) { m.visible = true; if (it.kind === 'cam') m.userData.setRec(!!g.players.get(ph).aim); continue; }
      }
      if (m.parent !== this.group) { this.group.add(m); it.rx = it.x; it.ry = it.y; it.rz = it.z; }
      m.visible = true;
      it.rx += (it.x - it.rx) * k; it.ry += (it.y - it.ry) * k; it.rz += (it.z - it.rz) * k;
      m.position.set(it.rx, it.ry, it.rz);
      m.rotation.set(0, it.yaw, Math.abs(it.y - (it.ry ?? 0)) > 0.05 ? Math.sin(t * 9) * 0.6 : 0);
      if (it.kind === 'cam') m.userData.setRec(false);
    }
  }

  dispose() { this.g.scene.remove(this.group); }
}
