// The weird stuff. Passive anomalies are worth views; two of them are dangerous.
// The host runs every thing's logic (hostUpdate) and sends [id, kind, x, y, z, yaw, s, a] in the snapshot;
// everyone (host included) draws them from that (render). `s` is the state, `a` a per-kind extra.
import * as THREE from 'three';
import { clamp, angDiff, yawTo, rng, r2 } from './util.js';
import { MORE, buildMore, hostMore, drawMore } from './creatures2.js';
import { MORE3, buildMore3, hostMore3, drawMore3 } from './creatures3.js';

import { lam } from './mats.js';

// worth: views a second at best framing; act(th, gameTime): how much more it's worth right now.
export const KINDS = {
  chair:    { worth: 32, name: 'the floating chair', act: (th) => (th.s ? 2.2 : 1) },
  tv:       { worth: 40, name: 'the TV', act: (th) => (th.s ? 2.6 : 0.6) },
  flamingo: { worth: 22, name: 'the flamingos', act: (th, t) => (t - th.a < 4 ? 2.5 : 1) },
  wardrobe: { worth: 30, name: 'the wardrobe', act: (th) => (th.s ? 4.5 : 0.5) },
  balloon:  { worth: 18, name: 'the balloon', act: (th) => (th.s ? 2 : 1) },
  dancer:   { worth: 45, name: 'the dancer', act: (th) => (th.s ? 3 : 0.4) },
  applause: { worth: 120, name: 'Mr. Applause', act: (th) => [1, 1.5, 2.2, 3.2, 1.2, 4, 0][th.s] ?? 1, danger: true },
  hand:     { worth: 60, name: 'the hand', act: (th) => [1, 1.4, 2.4, 0.8, 0.6][th.s] ?? 1, danger: true },
  ...MORE, // (append new kinds at the end: the snapshot sends the index)
  ...MORE3,
};
export const KIND_LIST = Object.keys(KINDS);

// ---------- shared textures ----------
let staticTex = null, staticCtx = null, staticT = 0;
function getStatic() {
  if (staticTex) return staticTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  staticCtx = c.getContext('2d');
  staticTex = new THREE.CanvasTexture(c); staticTex.magFilter = THREE.NearestFilter;
  return staticTex;
}
function tickStatic(dt) {
  if (!staticCtx) return;
  staticT -= dt; if (staticT > 0) return; staticT = 0.07;
  const img = staticCtx.createImageData(64, 48);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  staticCtx.putImageData(img, 0, 0); staticTex.needsUpdate = true;
}
function faceTex(draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const tvFace = () => faceTex((c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.beginPath(); c.ellipse(w * 0.36, h * 0.38, 9, 13, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(w * 0.64, h * 0.38, 9, 13, 0, 0, 7); c.fill();
  c.fillStyle = '#000'; c.beginPath(); c.arc(w * 0.36, h * 0.4, 5, 0, 7); c.fill(); c.beginPath(); c.arc(w * 0.64, h * 0.4, 5, 0, 7); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, h * 0.58, 26, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
});
const grinTex = () => faceTex((c, w, h) => {
  c.fillStyle = '#f2efe6'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#111'; c.beginPath(); c.arc(w * 0.38, h * 0.3, 4, 0, 7); c.fill(); c.beginPath(); c.arc(w * 0.62, h * 0.3, 4, 0, 7); c.fill();
  c.fillStyle = '#b01828'; c.beginPath(); c.moveTo(w * 0.12, h * 0.5); c.quadraticCurveTo(w / 2, h * 1.02, w * 0.88, h * 0.5); c.quadraticCurveTo(w / 2, h * 0.68, w * 0.12, h * 0.5); c.fill();
  c.fillStyle = '#fff';
  for (let i = 0; i < 13; i++) { const x = w * (0.18 + i * 0.05), y = h * 0.55 + Math.sin((i / 12) * Math.PI) * h * 0.1; c.fillRect(x, y, w * 0.035, h * 0.07); }
  c.strokeStyle = '#2a0a0a'; c.lineWidth = 2; c.beginPath(); c.moveTo(w * 0.12, h * 0.5); c.quadraticCurveTo(w / 2, h * 1.02, w * 0.88, h * 0.5); c.stroke();
  c.fillStyle = 'rgba(220,90,90,0.35)'; c.beginPath(); c.arc(w * 0.2, h * 0.45, 9, 0, 7); c.fill(); c.beginPath(); c.arc(w * 0.8, h * 0.45, 9, 0, 7); c.fill();
});

// ---------- models ----------
function build(kind, th) {
  if (MORE[kind]) return buildMore(kind, th);
  if (MORE3[kind]) return buildMore3(kind, th);
  const g = new THREE.Group(), p = {};
  if (kind === 'chair') {
    const m = lam(0x3a2418);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), m); g.add(s);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), m); b.position.set(0, 0.38, 0.22); g.add(b);
    for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), m); l.position.set(x, -0.27, z); g.add(l); }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x6a8aff, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; p.glow = glow;
  }
  if (kind === 'tv') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 0.6), lam(0x3a2c22)); box.position.y = 0.31 + 0.45; g.add(box);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.6), lam(0x5a4632)); stand.position.y = 0.225; g.add(stand);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: getStatic(), color: 0x9aa4b0 })); scr.position.set(0, 0.76, -0.305); scr.rotation.y = Math.PI; g.add(scr);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.44), new THREE.MeshBasicMaterial({ map: tvFace(), transparent: true, depthWrite: false })); face.position.set(0, 0.76, -0.307); face.rotation.y = Math.PI; g.add(face);
    const light = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0x8090ff, transparent: true, opacity: 0.08, depthWrite: false }));
    light.rotation.x = -Math.PI / 2; light.position.set(0, 0.02, -1.1); g.add(light);
    p.face = face; p.scr = scr;
  }
  if (kind === 'flamingo') {
    const pink = lam(0xff6fae);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pink); b.scale.set(0.8, 0.75, 1.3); b.position.y = 0.75; g.add(b);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), pink); tail.rotation.x = -1.9; tail.position.set(0, 0.8, 0.27); g.add(tail);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.82, -0.18), new THREE.Vector3(0, 1.1, -0.12), new THREE.Vector3(0, 1.2, -0.3), new THREE.Vector3(0, 1.32, -0.22)]), 10, 0.035, 6), pink); g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), pink); head.position.set(0, 1.34, -0.22); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 6), lam(0x111111)); beak.rotation.x = -2.2; beak.position.set(0, 1.3, -0.31); g.add(beak);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0x000000 })); eye.position.set(0.06, 1.36, -0.24); g.add(eye);
    for (const x of [-0.05, 0.05]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.62), lam(0x555555)); l.position.set(x, 0.31, 0); g.add(l); }
    p.head = head;
  }
  if (kind === 'wardrobe') {
    const w = lam(0x4a3020);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.6), w); box.position.y = 1.05; g.add(box);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.95), new THREE.MeshBasicMaterial({ color: 0x050505 })); inside.position.set(0, 1.05, -0.301); inside.rotation.y = Math.PI; g.add(inside);
    p.doors = [-1, 1].map((sx) => {
      const piv = new THREE.Group(); piv.position.set(sx * 0.58, 1.05, -0.31);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.57, 1.98, 0.04), lam(0x5a3a26)); d.position.x = -sx * 0.285; piv.add(d);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), lam(0xc8a040)); k.position.set(-sx * 0.5, 0, -0.03); piv.add(k);
      g.add(piv); return { piv, sx };
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    p.eyes = new THREE.Group();
    for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat); e.position.set(x, 1.55, -0.2); p.eyes.add(e); }
    g.add(p.eyes);
  }
  if (kind === 'balloon') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshLambertMaterial({ color: 0xe0102a, emissive: 0x300008 })); b.scale.y = 1.2; g.add(b);
    const k = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 6), lam(0xe0102a)); k.position.y = -0.36; k.rotation.x = Math.PI; g.add(k);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2), lam(0xdddddd)); str.position.y = -0.98; g.add(str);
    p.str = str;
  }
  if (kind === 'dancer') {
    const pale = lam(0xd8d0c4);
    p.hips = new THREE.Group(); p.hips.position.y = 0.95; g.add(p.hips);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 3, 8), pale); torso.position.y = 0.35; p.hips.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), pale); head.scale.y = 1.2; head.position.y = 0.82; p.hips.add(head); p.headM = head;
    const limb = (len) => { const gg = new THREE.CapsuleGeometry(0.05, len, 3, 6); gg.translate(0, -len / 2, 0); return new THREE.Mesh(gg, pale); };
    p.arms = [-1, 1].map((sx) => { const a = new THREE.Group(); a.position.set(sx * 0.22, 0.6, 0); a.add(limb(0.55)); p.hips.add(a); return a; });
    p.legs = [-1, 1].map((sx) => { const l = new THREE.Group(); l.position.set(sx * 0.1, 0.95, 0); l.add(limb(0.85)); g.add(l); return l; });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.06, 12), lam(0x222222)); base.position.y = 0.03; g.add(base);
  }
  if (kind === 'applause') {
    const suit = lam(0x1c1c28), shirt = lam(0xeeeeee);
    p.body = new THREE.Group(); p.body.position.y = 1.15; g.add(p.body);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.3), suit); torso.position.y = 0.42; p.body.add(torso);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.02), shirt); sh.position.set(0, 0.55, -0.16); p.body.add(sh);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.04), lam(0xc01a2a)); tie.position.set(0, 0.76, -0.18); p.body.add(tie);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.35), lam(0xe8e4da)); neck.position.y = 1.0; p.body.add(neck);
    p.head = new THREE.Group(); p.head.position.y = 1.32; p.body.add(p.head);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffffff, map: grinTex() }));
    hm.rotation.y = Math.PI / 2; hm.scale.set(1, 1.08, 1); p.head.add(hm); // the grin (the middle of the texture) faces -z, forward
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), lam(0x15110e)); hair.position.y = 0.04; p.head.add(hair);
    const limb = (len, r, m) => { const gg = new THREE.CapsuleGeometry(r, len, 3, 6); gg.translate(0, -len / 2, 0); return new THREE.Mesh(gg, m); };
    p.arms = [-1, 1].map((sx) => { const a = new THREE.Group(); a.position.set(sx * 0.33, 0.8, 0); a.add(limb(0.95, 0.06, suit)); const h = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lam(0xf2f0ea)); h.position.y = -1.05; a.add(h); p.body.add(a); return a; });
    const mic = new THREE.Group(); const ms = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.22), lam(0x333333)); mic.add(ms); const mh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lam(0x888888)); mh.position.y = 0.13; mic.add(mh);
    mic.position.set(0, -1.08, -0.05); p.arms[1].add(mic);
    p.legs = [-1, 1].map((sx) => { const l = new THREE.Group(); l.position.set(sx * 0.14, 1.15, 0); l.add(limb(1.05, 0.075, suit)); const sh2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), lam(0x0a0a0a)); sh2.position.set(0, -1.12, -0.05); l.add(sh2); g.add(l); return l; });
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.0, depthWrite: false }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.03; g.add(spot); p.spot = spot;
  }
  if (kind === 'hand') {
    const skin = lam(0xc89a82);
    p.palm = new THREE.Group(); p.palm.position.y = 0.32; g.add(p.palm);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.48), skin); p.palm.add(palm);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.25, 8), skin); wrist.rotation.x = Math.PI / 2; wrist.position.set(0, 0, 0.34); p.palm.add(wrist);
    const stump = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), lam(0x8a1a1a)); stump.position.set(0, 0, 0.47); p.palm.add(stump);
    p.fingers = [];
    const fx = [-0.17, -0.06, 0.05, 0.16], fl = [0.32, 0.38, 0.36, 0.28];
    fx.forEach((x, i) => {
      const f = new THREE.Group(); f.position.set(x, 0, -0.22);
      const gg = new THREE.CapsuleGeometry(0.045, fl[i], 3, 6); gg.rotateX(Math.PI / 2); gg.translate(0, 0, -fl[i] / 2);
      const m = new THREE.Mesh(gg, skin); f.add(m);
      const nail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), lam(0xe8d8c8)); nail.position.set(0, 0.04, -fl[i] - 0.02); f.add(nail);
      p.palm.add(f); p.fingers.push(f);
    });
    const th = new THREE.Group(); th.position.set(-0.22, 0, 0.02); th.rotation.y = 0.9;
    const tg = new THREE.CapsuleGeometry(0.05, 0.22, 3, 6); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -0.11); th.add(new THREE.Mesh(tg, skin));
    p.palm.add(th); p.fingers.push(th);
    p.carry = new THREE.Group(); p.carry.position.set(0, 0.25, 0); p.palm.add(p.carry);
  }
  g.userData.p = p;
  return g;
}

// ---------- the thing list ----------
export class Things {
  constructor(game) {
    this.g = game;
    this.list = [];            // host: the real things; clients: what the last snapshot said
    this.byId = new Map();
    this.nextId = 1;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.r = rng((game.seed ^ 0x5eed) >>> 0);
  }

  // ---- host ----
  spawn(kind, x, z, o = {}) {
    const th = { id: this.nextId++, kind, x, y: 0, z, yaw: o.yaw ?? this.r() * Math.PI * 2, s: o.s ?? 0, a: 0, t: 0, cd: 0, path: null, pathT: 0, ...o };
    Object.assign(th, { rx: th.x, ry: th.y, rz: th.z, ryaw: th.yaw, ps: th.s, st: 0 }); // drawn from these until the first snapshot
    this.list.push(th); this.byId.set(th.id, th);
    return th;
  }
  remove(th) {
    this.list = this.list.filter((t) => t !== th); this.byId.delete(th.id);
    if (th.model) this.group.remove(th.model);
    if (th.model?.userData.p?.glow) this.g.scene.remove(th.model.userData.p.glow);
  }

  snap() { return this.list.map((t) => [t.id, KIND_LIST.indexOf(t.kind), r2(t.x), r2(t.y), r2(t.z), r2(t.yaw), t.s, r2(t.a)]); }

  // Walk toward (tx, tz) along a path, at speed. Returns the distance left.
  walk(th, tx, tz, speed, dt) {
    const W = this.g.world;
    speed *= this.g.events?.speedK || 1; // (a blood moon)
    th.pathT -= dt;
    if (!th.path || th.pathT <= 0 || Math.hypot((th.goal?.x ?? 0) - tx, (th.goal?.z ?? 0) - tz) > 1.5) {
      th.path = W.clearWalk(th.x, th.z, tx, tz) ? [{ x: tx, z: tz }] : W.path(th.x, th.z, tx, tz) || [];
      th.goal = { x: tx, z: tz }; th.pathT = 0.7;
    }
    let wp = th.path[0];
    while (wp && Math.hypot(wp.x - th.x, wp.z - th.z) < 0.3) { th.path.shift(); wp = th.path[0]; }
    if (!wp) return Math.hypot(tx - th.x, tz - th.z);
    const dx = wp.x - th.x, dz = wp.z - th.z, d = Math.hypot(dx, dz), st = Math.min(d, speed * dt);
    th.x += (dx / d) * st; th.z += (dz / d) * st;
    const want = yawTo(dx, dz);
    th.yaw += angDiff(th.yaw, want) * Math.min(1, dt * 8);
    const p = { x: th.x, z: th.z }; W.collide(p, 0.3); th.x = p.x; th.z = p.z;
    return Math.hypot(tx - th.x, tz - th.z);
  }

  // Can player P see point (x, z)? (in front, in range, line of sight)
  sees(P, x, z, range = 25, cone = 0.9) {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 1.2 && Math.abs(angDiff(P.yaw, yawTo(dx, dz))) > cone) return false;
    return this.g.world.los(P.x, P.z, x, z);
  }

  hostUpdate(dt) {
    const g = this.g, living = g.living(), T = g.time;
    for (const th of [...this.list]) {
      th.t += dt; th.cd = Math.max(0, th.cd - dt);
      const near = living.map((P) => ({ P, d: Math.hypot(P.x - th.x, P.z - th.z) })).sort((a, b) => a.d - b.d);
      const n0 = near[0];
      switch (th.kind) {
        case 'chair': th.s = n0 && n0.d < 3.5 ? 1 : 0; break;
        case 'tv': {
          const on = n0 && n0.d < 6 && g.world.los(n0.P.x, n0.P.z, th.x, th.z) ? 1 : 0;
          if (on && !th.s) g.sound('tvOn', th.x, 0.8, th.z);
          th.s = on; break;
        }
        case 'flamingo': {
          if (th.cd > 0 || !n0) break;
          th.cd = 1.4 + this.r() * 1.6;
          const seen = living.some((P) => this.sees(P, th.x, th.z, 30, 1.0));
          if (seen) break;
          if (n0.d < 1.5 && !n0.P.down) { g.knockDown(n0.P.id, 1.3, th.id); g.sound('honk', th.x, 1, th.z); th.cd = 10; th.a = T; break; }
          if (n0.d < 2) break;
          const step = Math.min(1.8, n0.d - 1.2), dx = (n0.P.x - th.x) / n0.d, dz = (n0.P.z - th.z) / n0.d;
          if (!g.world.clearWalk(th.x, th.z, th.x + dx * step, th.z + dz * step)) break;
          th.x += dx * step; th.z += dz * step; th.yaw = yawTo(dx, dz); th.a = T;
          if (this.r() < 0.25) g.sound('honk', th.x, 1, th.z);
          break;
        }
        case 'wardrobe': {
          th.kt = (th.kt ?? 4 + this.r() * 6) - dt;
          if (th.kt <= 0 && !th.s) { th.kt = 7 + this.r() * 8; g.sound('knock', th.x, 1.2, th.z); }
          if (th.s && th.t > 2.8) { th.s = 0; th.cd = 9; g.sound('slam', th.x, 1, th.z); }
          else if (!th.s && !th.cd && n0 && n0.d < 3.3) { th.s = 1; th.t = 0; g.sound('creak', th.x, 1.2, th.z); }
          break;
        }
        case 'balloon': {
          let P = th.follow && living.find((x) => x.id === th.follow);
          if (!P && n0 && n0.d < 14) { P = n0.P; th.follow = P.id; }
          th.s = P ? 1 : 0;
          const bob = Math.sin(th.t * 1.3) * 0.25;
          if (P) {
            const f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }, tx = P.x - f.x * 1.6 + Math.sin(th.t * 0.7) * 0.5, tz = P.z - f.z * 1.6;
            th.x += (tx - th.x) * Math.min(1, dt * 0.9); th.z += (tz - th.z) * Math.min(1, dt * 0.9);
            th.yaw = P.yaw;
            if (this.r() < dt * 0.05) g.sound('squeak', th.x, 2, th.z);
          }
          th.y = 1.9 + bob;
          break;
        }
        case 'dancer': {
          const lit = living.some((P) => P.flash && this.sees(P, th.x, th.z, 11, 0.38));
          if (lit && !th.s && th.cd <= 0) { g.sound('giggle', th.x, 1.6, th.z); th.cd = 6; }
          th.s = lit ? 1 : 0;
          if (lit) th.a += dt;
          break;
        }
        case 'applause': this.applause(th, dt, living, near); break;
        case 'hand': this.hand(th, dt, living, near); break;
        default: if (MORE[th.kind]) hostMore(this, th, dt, living, near); else if (MORE3[th.kind]) hostMore3(this, th, dt, living, near); break;
      }
    }
  }

  // Mr. Applause: a game-show host with a too-big smile. He hears voices (and running), sees you up close,
  // poses for the camera (once in a while), and takes whoever he reaches. A thrown thing stuns him.
  applause(th, dt, living, near) {
    const g = this.g, W = g.world, night = g.night;
    if (th.s === 6) { th.y = -10; if (g.time > th.wake) { th.s = 0; th.y = 0; th.t = 0; } return; }
    th.poseCd = Math.max(0, (th.poseCd ?? 8) - dt);
    const speedK = 1 + (night - 1) * 0.06;
    if (th.s === 4) { if (th.t > 3) { th.s = 1; th.t = 0; } return; }                 // stunned
    if (th.s === 5) { if (th.t > 2.6) { th.s = 0; th.t = 0; th.cd = 4; } return; }    // taking a bow over a victim
    if (th.s === 3) { if (th.t > 2.4) { th.s = th.chase ? 2 : 1; th.t = 0; } return; } // posing for the camera
    // being filmed close up: pose
    if (!th.poseCd && living.some((P) => P.aim && this.sees(P, th.x, th.z, 12, 0.45))) {
      th.s = 3; th.t = 0; th.poseCd = 14 + this.r() * 10; g.sound('ding', th.x, 2, th.z); g.sound('laugh', th.x, 2, th.z); return;
    }
    // catch
    const n0 = near[0];
    if (n0 && n0.d < 0.85 && !th.cd) {
      th.s = 5; th.t = 0; th.yaw = yawTo(n0.P.x - th.x, n0.P.z - th.z);
      g.kill(n0.P.id, th.id); g.sound('applause', th.x, 1.5, th.z, 1.4); g.sound('laugh', th.x, 2, th.z);
      th.chase = null; th.heard = null; return;
    }
    // sight
    const seen = near.find((o) => o.d < 15 && W.los(th.x, th.z, o.P.x, o.P.z) && (o.d < 4 || Math.abs(angDiff(th.yaw, yawTo(o.P.x - th.x, o.P.z - th.z))) < 1.2));
    if (seen) { th.chase = seen.P.id; th.lost = 0; th.heard = { x: seen.P.x, z: seen.P.z }; }
    // hearing: voices and running
    for (const o of near) {
      const lvl = Math.max(o.P.v * 1.4, o.P.run ? 0.22 : 0);
      if (lvl < 0.07) continue;
      if (o.d < 3 + lvl * 45) { th.heard = { x: o.P.x, z: o.P.z }; if (th.s === 0) { th.s = 1; th.t = 0; } break; }
    }
    if (th.chase) {
      const P = living.find((x) => x.id === th.chase);
      if (!P) { th.chase = null; th.s = 0; return; }
      th.s = 2;
      if (!seen || seen.P.id !== P.id) th.lost += dt;
      if (th.lost > 4) { th.chase = null; th.s = 1; th.heard = { x: P.x, z: P.z }; return; }
      this.walk(th, P.x, P.z, 3.35 * speedK, dt);
    } else if (th.s === 1 && th.heard) {
      const left = this.walk(th, th.heard.x, th.heard.z, 2.3 * speedK, dt);
      if (left < 0.8) { th.heard = null; th.s = 0; th.t = 0; }
    } else {
      th.s = 0;
      if (!th.wander || th.t > 14) { th.wander = W.spot(this.r, 'any', 0); th.t = 0; }
      if (this.walk(th, th.wander.x, th.wander.z, 1.3, dt) < 0.8) th.wander = null;
    }
  }

  // The hand: goes for whoever is carrying something (the camera first), knocks them over and runs off with it.
  hand(th, dt, living, near) {
    const g = this.g, W = g.world;
    if (th.s === 3) { if (th.t > 25) { th.s = 0; th.t = 0; } return; } // knocked out (on its back)
    if (th.s === 4) { if (th.t > 14) { th.s = 0; th.t = 0; } return; } // resting
    if (th.s === 2) { // running off with something
      const left = this.walk(th, th.home.x, th.home.z, 4.4, dt);
      if (left < 0.7 || th.t > 25) { g.dropFromThing(th); th.s = 4; th.t = 0; }
      return;
    }
    const carriers = near.filter((o) => o.P.holding && o.d < 24).sort((a, b) => (b.P.holdingCam ? 1 : 0) - (a.P.holdingCam ? 1 : 0) || a.d - b.d);
    const tgt = carriers[0];
    if (tgt) {
      th.s = 1;
      if (tgt.d < 0.75 && !tgt.P.down) {
        const stole = g.stealFrom(tgt.P.id, th); // before the knock-down, which would drop it
        g.knockDown(tgt.P.id, 1.6, th.id);
        if (stole) { th.s = 2; th.t = 0; const rm = W.farRoom(th.x, th.z, this.r); th.home = { x: rm.x0 + 0.8 + this.r() * (rm.w - 1.6), z: rm.z0 + 0.8 + this.r() * (rm.h - 1.6) }; g.sound('giggle', th.x, 0.5, th.z); }
        return;
      }
      this.walk(th, tgt.P.x, tgt.P.z, 4.0, dt);
      if (this.r() < dt * 3) g.sound('scuttle', th.x, 0.2, th.z);
    } else {
      th.s = 0;
      if (!th.wander || th.t > 10) { th.wander = W.spot(this.r, 'in', 0); th.t = 0; }
      if (this.walk(th, th.wander.x, th.wander.z, 1.6, dt) < 0.8) th.wander = null;
    }
  }

  // A thrown thing hit th (host).
  struck(th) {
    const g = this.g;
    if (th.kind === 'applause' && th.s !== 6 && th.s !== 5) { th.s = 4; th.t = 0; g.sound('bonk', th.x, 2.2, th.z); g.sound('laugh', th.x, 2, th.z); g.event({ k: 'struck', id: th.id }); return true; }
    if (th.kind === 'hand' && th.s !== 3) { if (th.s === 2) g.dropFromThing(th); th.s = 3; th.t = 0; g.sound('shriek', th.x, 0.4, th.z); g.event({ k: 'struck', id: th.id }); return true; }
    if (th.kind === 'balloon') { g.sound('pop', th.x, th.y, th.z); g.event({ k: 'pop', id: th.id }); this.remove(th); return true; }
    if (th.kind === 'intern' && th.s <= 2) { th.s = 3; th.t = 0; g.sound('bonk', th.x, 1.2, th.z); g.sound('shriek', th.x, 1.2, th.z); g.event({ k: 'struck', id: th.id }); return true; }
    if (th.kind === 'mascot' && (th.s === 1 || th.s === 2)) { th.s = 4; th.t = 0; g.sound('bonk', th.x, 1.6, th.z); g.sound('squeak', th.x, 1.6, th.z); g.event({ k: 'struck', id: th.id }); return true; }
    if (th.kind === 'dog') return false; // it just wants to play
    if (th.kind === 'cart') { th.s = 2; th.t = 0; g.sound('hit', th.x, 0.6, th.z); return true; }
    if (th.kind === 'xray' || th.kind === 'chalkboard') { g.sound('bonk', th.x, 1.5, th.z); return false; }
    if (th.kind === 'tv' || th.kind === 'chair' || th.kind === 'flamingo' || th.kind === 'phone' || th.kind === 'bathtub' || th.kind === 'portrait') { g.sound('bonk', th.x, 1, th.z); return false; }
    return false;
  }

  // ---- everyone: draw from the snapshot ----
  applySnap(arr) {
    const seen = new Set();
    for (const [id, k, x, y, z, yaw, s, a] of arr) {
      seen.add(id);
      let th = this.byId.get(id);
      if (!th) {
        th = { id, kind: KIND_LIST[k], x, y, z, yaw, s, a, rx: x, ry: y, rz: z, ryaw: yaw, ps: s, st: 0 };
        th.model = build(th.kind, th); this.group.add(th.model);
        if (!this.g.isHost) { this.list.push(th); }
        this.byId.set(id, th);
      }
      if (!this.g.isHost) Object.assign(th, { x, y, z, yaw, s, a });
      if (!th.model) { th.model = build(th.kind, th); this.group.add(th.model); }
    }
    for (const th of [...this.byId.values()]) if (!seen.has(th.id)) { if (th.model) this.group.remove(th.model); if (th.model?.userData.p?.chair) this.g.scene.remove(th.model.userData.p.chair); this.byId.delete(th.id); this.list = this.list.filter((t) => t !== th); }
  }

  render(dt) {
    tickStatic(dt);
    const g = this.g, now = g.time;
    for (const th of this.byId.values()) {
      const m = th.model; if (!m) continue;
      const k = 1 - Math.exp(-dt * 12);
      th.rx += (th.x - th.rx) * k; th.rz += (th.z - th.rz) * k; th.ry += (th.y - th.ry) * k;
      th.ryaw += angDiff(th.ryaw, th.yaw) * k;
      if (th.kind === 'flamingo' && Math.hypot(th.x - th.rx, th.z - th.rz) > 0.05) { th.rx = th.x; th.rz = th.z; th.ryaw = th.yaw; } // it never moves while watched
      if (th.s !== th.ps) { th.st = 0; th.ps = th.s; } th.st += dt;
      const p = m.userData.p, t = performance.now() / 1000;
      m.position.set(th.rx, th.ry, th.rz); m.rotation.set(0, th.ryaw, 0);
      m.visible = th.y > -5;
      switch (th.kind) {
        case 'chair':
          m.position.y = 1.2 + Math.sin(t * 1.4 + th.id) * 0.15 + (th.s ? Math.sin(t * 40) * 0.03 : 0);
          m.rotation.set(Math.sin(t * 0.8) * 0.3 + (th.s ? Math.sin(t * 33) * 0.08 : 0), t * 0.5 + th.id, Math.cos(t * 0.6) * 0.25);
          if (!p.glow.parent) g.scene.add(p.glow);
          p.glow.position.set(th.rx, 0.03, th.rz); p.glow.material.opacity = 0.08 + Math.sin(t * 2) * 0.04 + (th.s ? 0.1 : 0);
          break;
        case 'tv': {
          const me = g.me;
          p.face.material.opacity = th.s ? (Math.random() < 0.08 ? 0.2 : 0.95) : 0;
          if (me) m.rotation.y = th.ryaw; // the set never moves; the face's eyes follow you
          break;
        }
        case 'wardrobe': {
          const open = th.s ? clamp(th.st * 3, 0, 1) : clamp(1 - th.st * 8, 0, 1);
          for (const d of p.doors) d.piv.rotation.y = d.sx * open * 1.6 * (0.8 + Math.sin(t * 9) * 0.05 * open);
          p.eyes.visible = open > 0.4; p.eyes.position.x = Math.sin(t * 2) * 0.05;
          m.rotation.z = th.s ? 0 : Math.max(0, 0.02 * Math.sin(t * 30) * (th.st < 0.3 ? 1 : 0));
          break;
        }
        case 'balloon': m.rotation.z = Math.sin(t * 1.2) * 0.12; m.rotation.x = Math.cos(t) * 0.1; break;
        case 'dancer': {
          if (th.s) {
            const d = t * 7;
            p.hips.rotation.z = Math.sin(d) * 0.25; p.hips.rotation.y = Math.sin(d * 0.5) * 0.6;
            p.arms[0].rotation.set(Math.sin(d) * 1.5, 0, -0.6 - Math.abs(Math.sin(d * 0.5)) * 1.8);
            p.arms[1].rotation.set(-Math.sin(d) * 1.5, 0, 0.6 + Math.abs(Math.cos(d * 0.5)) * 1.8);
            p.legs[0].rotation.x = Math.max(0, Math.sin(d)) * 0.9; p.legs[1].rotation.x = Math.max(0, -Math.sin(d)) * 0.9;
            p.headM.rotation.z = Math.sin(d * 2) * 0.4;
            p.hips.position.y = 0.95 + Math.abs(Math.sin(d)) * 0.08;
          }
          break;
        }
        case 'applause': this.drawApplause(th, p, t, dt); break;
        default: if (MORE[th.kind]) drawMore(this, th, p, t, dt); else if (MORE3[th.kind]) drawMore3(this, th, p, t, dt); break;
        case 'hand': {
          const crawl = th.s === 1 || th.s === 2 ? 1 : th.s === 0 ? 0.4 : 0;
          p.fingers.forEach((f, i) => { f.rotation.x = Math.sin(t * 22 * crawl + i * 1.3) * 0.5 * crawl - (th.s === 3 ? 1.2 : 0) + 0.35; });
          p.palm.rotation.z = th.s === 3 ? Math.PI : 0;
          p.palm.position.y = th.s === 3 ? 0.2 : 0.32 + Math.abs(Math.sin(t * 22)) * 0.04 * crawl;
          const carried = g.items.carriedBy('T' + th.id);
          if (carried && carried.model.parent !== p.carry) { p.carry.add(carried.model); carried.model.position.set(0, 0, 0); }
          break;
        }
      }
    }
  }

  drawApplause(th, p, t, dt) {
    const walk = th.s === 1 ? 1.4 : th.s === 2 ? 2.2 : th.s === 0 ? 0.9 : 0;
    const d = t * 4.2 * walk;
    p.legs[0].rotation.x = Math.sin(d) * 0.55 * Math.min(1, walk); p.legs[1].rotation.x = -Math.sin(d) * 0.55 * Math.min(1, walk);
    p.body.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, Math.sin(t * 0.7) * 0.25);
    p.spot.material.opacity = 0;
    if (th.s === 3) { // a bow and a wave, under a spotlight
      p.body.rotation.x = -Math.min(0.9, th.st * 2) * (th.st < 1.4 ? 1 : 0.3);
      p.arms[0].rotation.set(0.3, 0, -2.6 + Math.sin(t * 10) * 0.25); p.arms[1].rotation.set(-0.4, 0, 0.3);
      p.spot.material.opacity = 0.35;
    } else if (th.s === 5) { // holding up its catch, then bowing
      p.arms[0].rotation.set(-2.5, 0, 0); p.arms[1].rotation.set(-2.5, 0, 0);
      p.body.rotation.x = th.st > 1.3 ? -0.8 : 0; p.spot.material.opacity = 0.4;
    } else if (th.s === 4) { // stunned: wobbling, head spinning
      p.body.rotation.z = Math.sin(t * 7) * 0.2; p.head.rotation.y = t * 9;
      p.arms[0].rotation.set(0, 0, -0.5); p.arms[1].rotation.set(0, 0, 0.5);
    } else if (th.s === 2) { // running, arms out
      p.arms[0].rotation.set(-1.3 + Math.sin(d) * 0.3, 0, -0.2); p.arms[1].rotation.set(-1.3 - Math.sin(d) * 0.3, 0, 0.2);
      p.body.rotation.x = -0.25;
    } else {
      p.arms[0].rotation.set(Math.sin(d) * 0.4, 0, -0.08); p.arms[1].rotation.set(-0.9, 0, 0.15); // mic up, always presenting
    }
    // he hums the show's jingle while he looks for you
    th.hum = (th.hum ?? 3) - dt;
    if (th.hum <= 0 && th.y > -5) { th.hum = th.s === 2 ? 2.2 : 5 + Math.random() * 4; this.g.sfx.play(th.s === 2 ? 'laugh' : 'jingle', { x: th.rx, y: 2, z: th.rz }); }
  }

  dispose() { this.g.scene.remove(this.group); for (const th of this.byId.values()) if (th.model?.userData.p?.glow) this.g.scene.remove(th.model.userData.p.glow); }
}
