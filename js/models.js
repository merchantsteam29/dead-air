// Low-poly models: the crew (wobbly beans with faces), the camcorder and the throwable junk.
import * as THREE from 'three';
import { clamp } from './util.js';

export const COLORS = [0xe0483a, 0x3a8ee0, 0xf0c030, 0x40c070, 0xb060e0, 0xff8a30, 0x30d0d0, 0xf070b0];
export const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Teal', 'Pink'];
export const HATS = ['cap', 'beanie', 'bucket', 'none', 'antenna'];

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const BLACK = lam(0x111111), WHITE = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 }), SKIN = lam(0xf1c9a5);

// ---------- the crew ----------
export class Crew {
  constructor(colorIdx = 0, hat = 'cap') {
    const color = COLORS[colorIdx % COLORS.length];
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); this.root.add(this.tilt);
    const suit = lam(color), dark = lam(new THREE.Color(color).multiplyScalar(0.55).getHex());
    // body + head in one bean
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 4, 10), suit);
    body.position.y = 0.78; this.tilt.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), SKIN);
    face.position.set(0, 1.12, -0.322); face.rotation.y = Math.PI; face.scale.set(1.15, 0.9, 1); this.tilt.add(face);
    // eyes
    this.eyes = [];
    this.pupils = [];
    this.xs = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), WHITE); e.position.set(sx * 0.085, 1.16, -0.33); this.tilt.add(e); this.eyes.push(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), BLACK); p.position.set(sx * 0.085, 1.16, -0.385); this.tilt.add(p); this.pupils.push(p);
      const x = new THREE.Group();
      for (const r of [0.8, -0.8]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.02), BLACK); b.rotation.z = r; x.add(b); }
      x.position.set(sx * 0.085, 1.16, -0.4); x.visible = false; this.tilt.add(x); this.xs.push(x);
    }
    this.mouth = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), lam(0x3a1414));
    this.mouth.position.set(0, 1.03, -0.326); this.mouth.rotation.y = Math.PI; this.mouth.scale.set(1.2, 0.25, 1); this.tilt.add(this.mouth);
    // headlamp
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 16), BLACK); band.position.y = 1.28; band.rotation.x = Math.PI / 2; this.tilt.add(band);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), this.lampMat); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 1.28, -0.31); this.tilt.add(lamp);
    this.lamp = new THREE.Object3D(); this.lamp.position.set(0, 1.28, -0.34); this.tilt.add(this.lamp);
    this.addHat(hat, dark, suit);
    // arms and legs on pivots
    const limb = (len, r, mat) => { const g = new THREE.CapsuleGeometry(r, len, 3, 6); g.translate(0, -len / 2 - r * 0.5, 0); return new THREE.Mesh(g, mat); };
    this.arms = [-1, 1].map((sx) => {
      const piv = new THREE.Group(); piv.position.set(sx * 0.36, 0.98, 0); piv.add(limb(0.3, 0.07, suit));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), SKIN); hand.position.y = -0.46; piv.add(hand);
      this.tilt.add(piv); return piv;
    });
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.46, -0.05); this.arms[1].add(this.hand);
    this.legs = [-1, 1].map((sx) => { const piv = new THREE.Group(); piv.position.set(sx * 0.14, 0.38, 0); piv.add(limb(0.18, 0.09, dark)); this.tilt.add(piv); return piv; });
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // state
    this.phase = 0; this.flop = 0; this.flopV = 0; this.lean = 0; this.leanV = 0; this.roll = 0; this.talk = 0; this.lastSpeed = 0; this.held = null;
    this.blink = 2 + Math.random() * 3;
  }

  addHat(hat, dark, suit) {
    const g = new THREE.Group(); g.position.y = 1.36;
    if (hat === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark); g.add(c); const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.22), dark); b.position.set(0, 0.01, -0.33); g.add(b); }
    if (hat === 'beanie') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark); c.scale.y = 1.25; g.add(c); const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lam(0xf4f4f4)); p.position.y = 0.4; g.add(p); }
    if (hat === 'bucket') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.2, 12), dark); c.position.y = 0.1; g.add(c); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 14), dark); b.position.y = 0.01; g.add(b); }
    if (hat === 'antenna') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35), BLACK); s.position.y = 0.2; g.add(s); const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 })); b.position.y = 0.4; g.add(b); }
    this.tilt.add(g);
  }

  // what's in the right hand: a model (camcorder / prop) or null
  hold(obj) {
    if (this.held === obj && (!obj || obj.parent === this.hand)) return;
    if (this.held && this.held.parent === this.hand) this.hand.remove(this.held);
    this.held = obj;
    if (obj) { this.hand.add(obj); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); }
  }

  // s: { speed (m/s), down, dead, talk (0..1), aim, holding, pitch, air }
  update(dt, s) {
    // walk cycle
    const sp = s.down || s.dead ? 0 : s.speed;
    this.phase += dt * clamp(sp, 0, 7) * 2.6;
    const sw = Math.sin(this.phase) * clamp(sp / 3, 0, 1);
    this.legs[0].rotation.x = sw * 0.8; this.legs[1].rotation.x = -sw * 0.8;
    // lean with speed changes, springy
    const acc = (sp - this.lastSpeed) / Math.max(dt, 0.001); this.lastSpeed = sp;
    const leanT = clamp(-acc * 0.02, -0.35, 0.35) - clamp(sp * 0.03, 0, 0.18);
    this.leanV += ((leanT - this.lean) * 90 - this.leanV * 9) * dt; this.lean += this.leanV * dt;
    // flop over when knocked down or dead, with a bounce
    const flopT = s.dead || s.down ? 1 : 0;
    this.flopV += ((flopT - this.flop) * 120 - this.flopV * (flopT ? 7 : 14)) * dt; this.flop += this.flopV * dt;
    if (s.dead || s.down) this.roll += (0.5 - this.roll) * dt * 3; else this.roll += (0 - this.roll) * dt * 6;
    this.tilt.rotation.x = this.lean * (1 - clamp(this.flop, 0, 1)) + this.flop * 1.5;
    this.tilt.rotation.z = this.roll * clamp(this.flop, 0, 1) + Math.sin(this.phase * 0.5) * 0.04 * clamp(sp / 3, 0, 1);
    this.tilt.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * clamp(sp / 3, 0, 1) + (s.air ? 0.05 : 0) - clamp(this.flop, 0, 1) * 0.1;
    // arms
    const aL = this.arms[0], aR = this.arms[1];
    if (s.dead || s.down) { aL.rotation.set(-2.6, 0, -0.5 + Math.sin(this.phase * 3) * 0.1); aR.rotation.set(-2.6, 0, 0.5); }
    else if (s.aim) { aR.rotation.set(-Math.PI / 2 - (s.pitch || 0) * 0.9, 0, 0.35); aL.rotation.set(-Math.PI / 2 - (s.pitch || 0) * 0.9, 0, -0.4); }
    else if (s.holding === 'prop') { aR.rotation.set(-1.3, 0, 0.25); aL.rotation.set(-1.3, 0, -0.25); }
    else if (s.holding === 'cam') { aR.rotation.set(-0.7, 0, 0.1); aL.rotation.set(-sw * 0.7, 0, -0.08); }
    else { aR.rotation.set(sw * 0.7, 0, 0.08 + (s.wave ? 2.6 + Math.sin(this.phase * 4) * 0.3 : 0)); aL.rotation.set(-sw * 0.7, 0, -0.08); }
    // mouth flaps when talking; eyes blink; X eyes when dead
    this.talk += ((s.talk || 0) - this.talk) * Math.min(1, dt * 18);
    this.mouth.scale.y = 0.25 + clamp(this.talk * 4, 0, 1) * (0.8 + Math.sin(performance.now() / 45) * 0.25);
    this.blink -= dt;
    const shut = this.blink < 0.12;
    if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    for (let i = 0; i < 2; i++) { this.eyes[i].visible = !s.dead; this.pupils[i].visible = !s.dead && !shut; this.xs[i].visible = !!s.dead; this.eyes[i].scale.y = shut ? 0.15 : 1; }
    this.lampMat.color.setHex(s.light ? 0xfff2c0 : 0x333333);
  }
}

// ---------- the camcorder ----------
export function makeCamcorder() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.28), lam(0x2a2a2e)); g.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), lam(0x111111)); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.01, -0.17); g.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), new THREE.MeshBasicMaterial({ color: 0x3a5a8a })); glass.position.set(0, 0.01, -0.212); glass.rotation.y = Math.PI; g.add(glass);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.09, 0.12), lam(0x1a1a1a)); screen.position.set(-0.075, 0.01, -0.02); g.add(screen);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.2), lam(0x111111)); strap.position.set(0.075, 0, 0); g.add(strap);
  const recMat = new THREE.MeshBasicMaterial({ color: 0x441111 });
  const rec = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), recMat); rec.position.set(0.04, 0.08, -0.1); g.add(rec);
  g.userData.setRec = (on) => recMat.color.setHex(on ? (performance.now() % 1000 < 600 ? 0xff2020 : 0x661111) : 0x441111);
  return g;
}

// ---------- junk you can pick up and throw ----------
const PROPS = {
  chair: { r: 0.35, build() { const g = new THREE.Group(), m = lam(0x7a5636); const s = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), m); s.position.y = 0.05; g.add(s); const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), m); b.position.set(0, 0.3, 0.2); g.add(b); for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), m); l.position.set(x, -0.2, z); g.add(l); } return g; } },
  bucket: { r: 0.22, build() { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 10, 1, true), lam(0x3a7ad0, { side: THREE.DoubleSide })); return m; } },
  box: { r: 0.28, build() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.42), lam(0xb08a58))); const t = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.06, 0.1), lam(0xd8c8a0)); t.position.y = 0.2; g.add(t); return g; } },
  cone: { r: 0.2, build() { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), lam(0xff6a1a)); c.position.y = 0.05; g.add(c); const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), lam(0xff6a1a)); b.position.y = -0.2; g.add(b); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.07, 10), lam(0xf4f4f4)); s.position.y = 0.08; g.add(s); return g; } },
  duck: { r: 0.17, build() { const g = new THREE.Group(), y = lam(0xffd21a); const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), y); b.scale.set(1, 0.8, 1.2); g.add(b); const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), y); h.position.set(0, 0.16, -0.1); g.add(h); const k = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), lam(0xff7a1a)); k.rotation.x = -Math.PI / 2; k.position.set(0, 0.15, -0.22); g.add(k); return g; } },
  tire: { r: 0.33, build() { const m = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 6, 14), lam(0x1a1a1a)); m.rotation.x = Math.PI / 2; return m; } },
  gnome: { r: 0.2, build() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 8), lam(0x2a5ad0)); b.position.y = -0.08; g.add(b); const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), SKIN); f.position.y = 0.1; g.add(f); const beard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 8), lam(0xf4f4f4)); beard.rotation.x = Math.PI; beard.position.set(0, 0.03, -0.05); g.add(beard); const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), lam(0xd02a2a)); h.position.y = 0.28; g.add(h); return g; } },
  bottle: { r: 0.12, build() { const g = new THREE.Group(), m = lam(0x2a7a3a, { transparent: true, opacity: 0.85 }); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), m); g.add(b); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.1, 8), m); n.position.y = 0.15; g.add(n); return g; } },
  radio: { r: 0.22, build() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.14), lam(0x8a2a2a))); const s = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), lam(0x222222)); s.position.set(-0.08, 0, -0.071); s.rotation.y = Math.PI; g.add(s); const a = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4), lam(0xaaaaaa)); a.position.set(0.15, 0.3, 0); a.rotation.z = -0.4; g.add(a); return g; } },
  pumpkin: { r: 0.24, build() { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lam(0xe0701a)); p.scale.y = 0.8; g.add(p); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1), lam(0x3a5a1a)); s.position.y = 0.22; g.add(s); return g; } },
};
export const PROP_KINDS = Object.keys(PROPS);
export const propRadius = (k) => (k === 'cam' ? 0.18 : PROPS[k]?.r || 0.25);
export function makeProp(kind) {
  if (kind === 'cam') return makeCamcorder();
  const m = PROPS[kind]?.build() || new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lam(0x888888));
  const g = new THREE.Group(); g.add(m);
  return g;
}
