// The second wave of weird: the Intern, the Mascot, the phone, the bathtub, the portrait and the ghost dog.
// things.js calls buildMore / hostMore / drawMore for these kinds (same rules: the host runs them, everyone draws).
import * as THREE from 'three';
import { Crew, HATS } from './models.js';
import { clamp, angDiff, yawTo } from './util.js';

import { lam } from './mats.js';
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

export const MORE = {
  intern:   { worth: 70, name: 'the extra crew member', act: (th) => [0.6, 1.4, 3, 1, 3.5, 0][th.s] ?? 1, danger: true, hy: 1 },
  mascot:   { worth: 55, name: 'the hot dog mascot', act: (th) => [0.6, 1.3, 2.4, 3.5, 1.5][th.s] ?? 1, danger: true, hy: 1.5 },
  phone:    { worth: 28, name: 'the phone', act: (th) => [0.4, 2, 4][th.s] ?? 1, hy: 0.9 },
  bathtub:  { worth: 30, name: 'the bathtub', act: (th) => (th.s ? 4 : 0.4 + th.a), hy: 0.6 },
  portrait: { worth: 24, name: 'the portrait', act: (th, t) => (t - (th.ch || -99) < 4 ? 3 : 1), hy: 1.6 },
  dog:      { worth: 34, name: 'the ghost dog', act: (th) => [1, 2, 2.6, 1.6][th.s] ?? 1, hy: 0.5 },
};

// ---------- models ----------
export function buildMore(kind, th) {
  const g = new THREE.Group(), p = {};
  if (kind === 'intern') {
    // a crew member (whoever it copies: a = colour * 10 + hat), plus the face the camera sees
    const ci = Math.floor((th.a || 0) / 10), hi = (th.a || 0) % 10;
    p.crew = new Crew(ci, HATS[hi] || 'cap'); g.add(p.crew.root); p.look = th.a;
    p.truth = new THREE.Group();
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), black); e.position.set(sx * 0.085, 1.16, -0.41); e.rotation.y = Math.PI; e.scale.y = 1.6; p.truth.add(e); }
    const grin = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), new THREE.MeshBasicMaterial({ map: canvasTex(64, 20, (c, w, h) => { c.fillStyle = '#5a0008'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; for (let i = 0; i < 10; i++) c.fillRect(2 + i * 6.2, 2, 4, 7); for (let i = 0; i < 10; i++) c.fillRect(4 + i * 6.2, 11, 4, 7); }) }));
    grin.position.set(0, 1.0, -0.4); grin.rotation.y = Math.PI; p.truth.add(grin);
    p.truth.visible = false; p.crew.tilt.add(p.truth);
  }
  if (kind === 'mascot') {
    // a giant hot dog costume: bun, sausage with a cartoon face, a squiggle of mustard, white gloves, big shoes
    const bun = lam(0xd89a52), dog = lam(0xb4442c), glove = lam(0xf4f4f4), shoe = lam(0xe33a2a);
    p.body = new THREE.Group(); p.body.position.y = 0.55; g.add(p.body);
    for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.15, 4, 10), bun); b.position.set(sx * 0.3, 0.85, 0.05); b.scale.z = 0.8; p.body.add(b); }
    const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.35, 4, 12), dog); sausage.position.y = 0.95; p.body.add(sausage);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(40, 46, 18, 22, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(88, 46, 18, 22, 0, 0, 7); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(44, 52, 8, 0, 7); c.fill(); c.beginPath(); c.arc(84, 52, 8, 0, 7); c.fill();
      c.fillStyle = '#3a0a06'; c.beginPath(); c.arc(64, 82, 30, 0.1, Math.PI - 0.1); c.fill(); c.fillStyle = '#fff'; c.fillRect(42, 82, 44, 7);
    }) }));
    face.position.set(0, 1.45, -0.31); face.rotation.y = Math.PI; p.body.add(face);
    const mustard = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([0, 1, 2, 3, 4, 5, 6].map((i) => new THREE.Vector3((i % 2 ? 0.12 : -0.12), 0.45 + i * 0.12, -0.3))), 30, 0.03, 5), lam(0xffd21a));
    p.body.add(mustard);
    const limb = (len, r, m) => { const gg = new THREE.CapsuleGeometry(r, len, 3, 6); gg.translate(0, -len / 2, 0); return new THREE.Mesh(gg, m); };
    p.arms = [-1, 1].map((sx) => { const a = new THREE.Group(); a.position.set(sx * 0.52, 1.1, 0); a.add(limb(0.5, 0.07, dog)); const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glove); h.position.y = -0.62; a.add(h); p.body.add(a); return a; });
    p.legs = [-1, 1].map((sx) => { const l = new THREE.Group(); l.position.set(sx * 0.18, 0.6, 0); l.add(limb(0.4, 0.08, dog)); const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), shoe); s.scale.set(1, 0.6, 1.6); s.position.set(0, -0.55, -0.08); l.add(s); g.add(l); return l; });
    // the chair it sits slumped in
    const wood = lam(0x4a2e1c);
    p.chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.8), wood); seat.position.y = 0.45; p.chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.08), wood); back.position.set(0, 0.95, 0.4); p.chair.add(back);
    for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), wood); l.position.set(x, 0.22, z); p.chair.add(l); }
  }
  if (kind === 'phone') {
    const wood = lam(0x5a3a22);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.5), wood); top.position.y = 0.72; g.add(top);
    for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.04), wood); l.position.set(x, 0.36, z); g.add(l); }
    p.base = new THREE.Group(); p.base.position.y = 0.75; g.add(p.base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.2), lam(0x8a1010)); body.position.y = 0.05; p.base.add(body);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), lam(0xe8e0d0)); dial.position.set(0, 0.11, -0.03); p.base.add(dial);
    p.rx = new THREE.Group(); p.rx.position.set(0, 0.14, 0.03); p.base.add(p.rx);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.05), lam(0x8a1010)); p.rx.add(hand);
    for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 8), lam(0x8a1010)); cup.position.set(sx * 0.12, -0.03, 0); p.rx.add(cup); }
  }
  if (kind === 'bathtub') {
    const white = lam(0xe8e6e0);
    // a hollow tub: a floor and four sides
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.75), white); floor.position.y = 0.1; g.add(floor);
    for (const [w, d, x, z] of [[1.6, 0.08, 0, -0.335], [1.6, 0.08, 0, 0.335], [0.08, 0.75, -0.76, 0], [0.08, 0.75, 0.76, 0]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), white); s.position.set(x, 0.32, z); g.add(s); }
    for (const [x, z] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lam(0xc8a040)); f.position.set(x, 0.04, z); g.add(f); }
    p.water = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.58), new THREE.MeshLambertMaterial({ color: 0x5a0610, emissive: 0x200004 })); p.water.rotation.x = -Math.PI / 2; p.water.position.y = 0.62; g.add(p.water);
    // the hand that comes up out of it
    p.arm = new THREE.Group(); p.arm.position.set(0.2, 0.3, 0); g.add(p.arm);
    const skin = lam(0x9ab0a0);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 3, 6), skin); fore.position.y = 0.3; p.arm.add(fore);
    p.fingers = [-0.05, -0.017, 0.017, 0.05].map((x) => { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.12, 2, 4), skin); f.position.set(x, 0.7, 0); p.arm.add(f); return f; });
    p.arm.visible = false;
    p.bubbles = [0, 1, 2, 3, 4].map(() => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshLambertMaterial({ color: 0x8a1020 })); g.add(b); return b; });
  }
  if (kind === 'portrait') {
    p.faces = [0, 1, 2, 3].map((n) => canvasTex(96, 128, (c, w, h) => {
      c.fillStyle = '#2a2018'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3c2e22'; c.fillRect(0, h * 0.7, w, h * 0.3);
      if (n === 3) { c.fillStyle = '#1a120c'; c.fillRect(20, 20, 56, 70); return; } // the sitter has left the painting
      c.fillStyle = '#d8c0a0'; c.beginPath(); c.ellipse(48, 52, 24, 30, 0, 0, 7); c.fill();
      c.fillStyle = '#2a1a10'; c.beginPath(); c.ellipse(48, 30, 26, 14, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#1a1a1a'; c.fillRect(30, 96, 36, 32);
      c.strokeStyle = '#4a2a1a'; c.lineWidth = 2; c.beginPath();
      if (n === 0) { c.moveTo(38, 70); c.lineTo(58, 70); }
      if (n === 1) { c.arc(48, 64, 12, 0.2, Math.PI - 0.2); }
      c.stroke();
      if (n === 2) { c.fillStyle = '#200'; c.beginPath(); c.ellipse(48, 72, 8, 13, 0, 0, 7); c.fill(); }
    }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.06), lam(0x8a6a2a)); g.add(frame);
    p.canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshLambertMaterial({ map: p.faces[0] })); p.canvas.position.z = -0.035; p.canvas.rotation.y = Math.PI; g.add(p.canvas);
    p.eyes = [-1, 1].map((sx) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(sx * 0.07, 0.09, -0.04); g.add(e); return e; });
    g.position.y = 1.6;
  }
  if (kind === 'dog') {
    const ghost = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x2a4a6a, transparent: true, opacity: 0.6, depthWrite: false });
    p.body = new THREE.Group(); p.body.position.y = 0.45; g.add(p.body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 4, 8), ghost); torso.rotation.x = Math.PI / 2; p.body.add(torso);
    p.head = new THREE.Group(); p.head.position.set(0, 0.2, -0.38); p.body.add(p.head);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), ghost); p.head.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), ghost); snout.position.set(0, -0.03, -0.14); p.head.add(snout);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), ghost); ear.position.set(sx * 0.09, 0.13, 0.02); ear.rotation.z = -sx * 0.4; p.head.add(ear); }
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: 0x123 })); e.position.set(sx * 0.06, 0.04, -0.13); p.head.add(e); }
    p.legs = [[-0.1, -0.22], [0.1, -0.22], [-0.1, 0.22], [0.1, 0.22]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, -0.08, z); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 2, 5), ghost); m.position.y = -0.17; l.add(m); p.body.add(l); return l; });
    p.tail = new THREE.Group(); p.tail.position.set(0, 0.08, 0.33); const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 2, 5), ghost); tm.position.y = 0.12; p.tail.add(tm); p.tail.rotation.x = -0.6; p.body.add(p.tail);
    p.carry = new THREE.Group(); p.carry.position.set(0, -0.1, -0.2); p.head.add(p.carry);
  }
  g.userData.p = p;
  return g;
}

// ---------- host ----------
export function hostMore(T, th, dt, living, near) {
  const g = T.g, W = g.world, n0 = near[0];
  switch (th.kind) {
    case 'phone': {
      th.ring = (th.ring ?? 8 + T.r() * 10) - dt;
      if (th.s === 0 && th.ring <= 0) { th.s = 1; th.t = 0; }
      if (th.s === 1) {
        if (th.t % 3 < dt) g.sound('ring', th.x, 1, th.z);
        if (n0 && n0.d < 1.6) { th.s = 2; th.t = 0; g.sound('giggle', th.x, 1.2, th.z); g.sound('laugh', th.x, 1, th.z); }
        else if (th.t > 15) { th.s = 0; th.ring = 20 + T.r() * 20; }
      }
      if (th.s === 2 && th.t > 4) { th.s = 0; th.ring = 25 + T.r() * 25; }
      break;
    }
    case 'bathtub': {
      // it fills while people are near; full, a hand comes up and waves, then it drains
      if (th.s === 1) { if (th.t > 5) { th.s = 0; th.a = 0; g.sound('slam', th.x, 0.5, th.z); } break; }
      th.a = clamp(th.a + dt * (n0 && n0.d < 10 ? 0.06 : 0.015), 0, 1);
      if (n0 && n0.d < 6 && T.r() < dt * 0.5) g.sound('glug', th.x, 0.6, th.z);
      if (th.a >= 1) { th.s = 1; th.t = 0; g.sound('shriek', th.x, 0.8, th.z); }
      break;
    }
    case 'portrait': {
      // it changes its face whenever nobody's looking
      const seen = living.some((P) => T.sees(P, th.x, th.z, 20, 0.9));
      if (!seen && th.cd <= 0 && n0 && n0.d < 20) { th.s = (th.s + 1 + Math.floor(T.r() * 3)) % 4; th.ch = g.time; th.cd = 6; }
      break;
    }
    case 'dog': return dog(T, th, dt, living, near);
    case 'intern': return intern(T, th, dt, living, near);
    case 'mascot': return mascot(T, th, dt, living, near);
  }
}

// The ghost dog: plays fetch with anything you throw.
function dog(T, th, dt, living, near) {
  const g = T.g;
  if (th.s === 1) { // run to the thrown thing
    const it = g.items.byId.get(th.fetch);
    if (!it || it.holder) { th.s = 0; return; }
    if (T.walk(th, it.x, it.z, 5.5, dt) < 0.6 && it.y < 0.6) { it.holder = 'T' + th.id; th.s = 2; th.t = 0; g.sound('bark', th.x, 0.5, th.z); }
    return;
  }
  if (th.s === 2) { // bring it back
    const P = g.players.get(th.owner);
    const it = g.items.carriedBy('T' + th.id);
    if (!it) { th.s = 0; return; }
    if (!P || P.dead || th.t > 20) { g.dropFromThing(th); th.s = 0; return; }
    if (T.walk(th, P.x, P.z, 4.5, dt) < 1.3) { g.dropFromThing(th); th.s = 3; th.t = 0; g.sound('bark', th.x, 0.5, th.z); }
    return;
  }
  if (th.s === 3 && th.t < 2) return; // tail going
  th.s = 0;
  // anything flying?
  for (const it of g.items.list) {
    if (it.holder || it.rest || !it.thrower || g.time - it.throwT > 3 || Math.hypot(it.x - th.x, it.z - th.z) > 18) continue;
    th.s = 1; th.fetch = it.id; th.owner = it.thrower; g.sound('bark', th.x, 0.5, th.z); return;
  }
  // otherwise trot after someone
  const n0 = near[0];
  if (n0 && n0.d < 25 && n0.d > 2.5) T.walk(th, n0.P.x, n0.P.z, n0.d > 8 ? 3.5 : 1.6, dt);
  else if (n0) th.yaw += angDiff(th.yaw, yawTo(n0.P.x - th.x, n0.P.z - th.z)) * Math.min(1, dt * 4);
  if (T.r() < dt * 0.04) g.sound('bark', th.x, 0.5, th.z);
}

// The Intern: wears a friend's look and walks with the crew. Anyone on their own gets taken. Filmed for 1.5 s up
// close it's exposed and rushes whoever is filming; hit it with something and it slinks off. Then it comes back as
// someone else. States: 0 blending in, 1 stalking a loner, 2 exposed, 3 hit, 4 took someone, 5 gone.
function intern(T, th, dt, living, near) {
  const g = T.g, W = g.world;
  if (th.s === 5) {
    th.y = -10;
    if (g.time > th.wake && living.length >= 2) disguise(T, th, living);
    return;
  }
  if (th.s === 3) { if (th.t > 2.5) { th.s = 5; th.wake = g.time + 30; g.sound('giggle', th.x, 1, th.z); } return; }
  if (th.s === 4) { if (th.t > 2.2) { th.s = 5; th.wake = g.time + 45; } return; }
  if (living.length < 2 && th.s !== 2) { th.s = 5; th.wake = g.time + 20; return; }
  // being filmed?
  if (th.s !== 2) {
    const filmer = living.find((P) => P.aim && T.sees(P, th.x, th.z, 12, 0.4));
    th.film = filmer ? (th.film || 0) + dt : Math.max(0, (th.film || 0) - dt);
    if (th.film > 1.5) { th.s = 2; th.t = 0; th.target = filmer.id; g.sound('shriek', th.x, 1.2, th.z); g.event({ k: 'exposed', id: th.id }); return; }
  }
  const n0 = near[0];
  if ((th.s === 1 || th.s === 2) && n0 && n0.d < 0.85) {
    th.s = 4; th.t = 0; g.kill(n0.P.id, th.id); g.sound('giggle', th.x, 1, th.z); return;
  }
  if (th.s === 2) {
    const P = living.find((x) => x.id === th.target) || n0?.P;
    if (!P || th.t > 8) { th.s = 5; th.wake = g.time + 30; return; }
    T.walk(th, P.x, P.z, 3.7, dt);
    return;
  }
  // a loner: nobody else within 10 m
  const lone = near.find((o) => o.d < 16 && !living.some((Q) => Q !== o.P && Math.hypot(Q.x - o.P.x, Q.z - o.P.z) < 10));
  if (lone) {
    if (th.s !== 1) g.sound('giggle', th.x, 1.2, th.z); // the only warning you get
    th.s = 1;
    T.walk(th, lone.P.x, lone.P.z, 2.7, dt); // a walk can just about stay ahead of it
    return;
  }
  th.s = 0;
  // tag along a few metres behind the nearest friend, like one of the crew
  if (n0) {
    if (n0.d > 5.5) T.walk(th, n0.P.x, n0.P.z, Math.min(3.3, 1 + n0.d * 0.3), dt);
    else th.yaw += angDiff(th.yaw, yawTo(n0.P.x - th.x, n0.P.z - th.z)) * Math.min(1, dt * 3);
  }
}
function disguise(T, th, living) {
  const g = T.g, W = g.world;
  const P = living[Math.floor(T.r() * living.length)];
  th.a = (P.color % 8) * 10 + Math.max(0, HATS.indexOf(P.hat));
  // somewhere 10-18 m from the crew that nobody is looking at
  // (pickier first, then less so; if nothing fits it tries again in a moment)
  for (let i = 0; i < 90; i++) {
    const s = W.spot(T.r, 'any', 0), far = i < 30 ? 20 : i < 60 ? 32 : 60;
    const d = Math.min(...living.map((Q) => Math.hypot(Q.x - s.x, Q.z - s.z)));
    if (d < 8 || d > far || (i < 60 && living.some((Q) => T.sees(Q, s.x, s.z, 30, 0.9)))) continue;
    Object.assign(th, { x: s.x, z: s.z, y: 0, s: 0, t: 0, film: 0, path: null });
    return;
  }
  th.wake = g.time + 2;
}

// The Mascot: sleeps slumped in a chair until you come close. Awake, it only moves while no camcorder is
// pointed at it (and freezes in a new pose each time one is). States: 0 asleep, 1 moving, 2 frozen (filmed),
// 3 took someone, 4 bonked.
function mascot(T, th, dt, living, near) {
  const g = T.g, n0 = near[0];
  th.home = th.home || { x: th.x, z: th.z, yaw: th.yaw };
  if (th.s === 3) { if (th.t > 2.5) { th.s = 1; th.t = 0; } return; }
  if (th.s === 4) { if (th.t > 2) { th.s = 1; th.t = 0; } return; }
  if (th.s === 0) { if (n0 && n0.d < 6.5) { th.s = 1; th.t = 0; g.sound('creak', th.x, 1, th.z); g.sound('squeak', th.x, 1, th.z); } return; }
  const watched = living.some((P) => P.aim && T.sees(P, th.x, th.z, 26, 0.5));
  if (watched) { if (th.s !== 2) { th.s = 2; th.t = 0; th.a = Math.floor(T.r() * 4); } return; }
  th.s = 1;
  if (n0 && n0.d < 0.9) { th.s = 3; th.t = 0; g.kill(n0.P.id, th.id); g.sound('squeak', th.x, 1.5, th.z); g.sound('laugh', th.x, 1.5, th.z); return; }
  if (n0 && n0.d < 30) { th.idle = 0; T.walk(th, n0.P.x, n0.P.z, 2.3 * (1 + (g.night - 1) * 0.05), dt); }
  else {
    th.idle = (th.idle || 0) + dt;
    if (th.idle > 10 && T.walk(th, th.home.x, th.home.z, 1.5, dt) < 0.4) { th.s = 0; th.yaw = th.home.yaw; th.x = th.home.x; th.z = th.home.z; }
  }
}

// ---------- drawing ----------
export function drawMore(T, th, p, t, dt) {
  const g = T.g, m = th.model;
  switch (th.kind) {
    case 'intern': {
      if (p.look !== th.a) { // it changed who it copies
        m.remove(p.crew.root); const fresh = buildMore('intern', th); const q = fresh.userData.p;
        m.add(q.crew.root); Object.assign(p, q);
      }
      const sp = Math.hypot(th.rx - (th.lx ?? th.rx), th.rz - (th.lz ?? th.rz)) / Math.max(dt, 1e-3); th.lx = th.rx; th.lz = th.rz;
      const exposed = th.s === 2;
      p.crew.update(dt, { speed: Math.min(sp, 6), down: th.s === 3, dead: false, talk: 0, light: false, emote: th.s === 4 ? 'flex' : null });
      // the camera sees what it really is (and so does everyone once it's exposed)
      p.truth.visible = exposed || g.cam.aiming;
      m.scale.set(1, exposed ? 1.25 : 1, 1);
      if (exposed) { p.crew.arms[0].rotation.set(-1.6, 0, -0.2); p.crew.arms[1].rotation.set(-1.6, 0, 0.2); p.crew.tilt.rotation.x = -0.3 + Math.sin(t * 30) * 0.05; }
      if (th.s === 0 && Math.random() < dt * 0.3) p.crew.tilt.rotation.z = (Math.random() - 0.5) * 0.6; // a twitch
      break;
    }
    case 'mascot': {
      if (!p.chair.parent) { g.scene.add(p.chair); p.chair.position.set(th.rx, 0, th.rz); p.chair.rotation.y = th.ryaw; } // where it sleeps
      const moving = th.s === 1, d = t * 6;
      p.body.rotation.set(0, 0, 0); p.body.position.y = 0.55;
      if (th.s === 0) { // slumped
        p.body.position.y = 0.05; p.body.rotation.set(0.35, 0, 0.25);
        p.legs[0].rotation.x = p.legs[1].rotation.x = -1.4; p.legs[0].position.y = p.legs[1].position.y = 0.55;
        p.arms[0].rotation.set(0.2, 0, -0.3); p.arms[1].rotation.set(0.2, 0, 0.6);
      } else {
        p.legs[0].position.y = p.legs[1].position.y = 0.6;
        if (moving) {
          p.legs[0].rotation.x = Math.sin(d) * 0.6; p.legs[1].rotation.x = -Math.sin(d) * 0.6;
          p.arms[0].rotation.set(-Math.sin(d) * 0.5, 0, -0.3); p.arms[1].rotation.set(Math.sin(d) * 0.5, 0, 0.3);
          p.body.rotation.z = Math.sin(d) * 0.08;
          th.stepD = (th.stepD || 0) + dt * 2.3;
          if (th.stepD > 0.8) { th.stepD = 0; g.sfx.play('squeak', { x: th.rx, y: 0.2, z: th.rz }); }
        } else { // frozen in one of four poses
          const P = [[[-2.6, 0, -0.3], [-0.2, 0, 0.3], 0.5, -0.3], [[-1.5, 0, -0.2], [-1.5, 0, 0.2], -0.2, 0.2], [[0.4, 0, -1.8], [0.4, 0, 1.8], 0, 0], [[-0.3, 0, -0.4], [-2.9, 0, 0.6], 0.3, 0.1]][th.a % 4];
          p.arms[0].rotation.set(...P[0]); p.arms[1].rotation.set(...P[1]);
          p.legs[0].rotation.x = P[2]; p.legs[1].rotation.x = P[3];
          p.body.rotation.z = th.a % 2 ? 0.12 : -0.12;
        }
        if (th.s === 3) { p.arms[0].rotation.set(-2.7, 0, 0); p.arms[1].rotation.set(-2.7, 0, 0); }
        if (th.s === 4) p.body.rotation.z = Math.sin(t * 12) * 0.2;
      }
      break;
    }
    case 'phone': {
      p.base.position.x = th.s === 1 ? Math.sin(t * 60) * 0.008 : 0;
      p.rx.position.y = th.s === 2 ? 0.14 + Math.min(0.5, th.st * 0.4) : th.s === 1 ? 0.14 + Math.abs(Math.sin(t * 30)) * 0.02 : 0.14;
      p.rx.rotation.z = th.s === 2 ? Math.sin(t * 2) * 0.4 : 0;
      break;
    }
    case 'bathtub': {
      p.water.position.y = 0.17 + th.a * 0.4; p.water.visible = th.a > 0.02;
      p.arm.visible = th.s === 1;
      if (th.s === 1) { p.arm.position.y = Math.min(0.3, -0.3 + th.st * 0.6); p.arm.rotation.z = Math.sin(t * 5) * 0.4; p.fingers.forEach((f, i) => { f.rotation.x = Math.sin(t * 8 + i) * 0.5; }); }
      p.bubbles.forEach((b, i) => { const ph = (t * 0.7 + i * 0.2) % 1; b.visible = th.a > 0.1; b.position.set(-0.5 + i * 0.25, p.water.position.y + ph * 0.05, Math.sin(i * 3) * 0.2); b.scale.setScalar(1 - ph); });
      break;
    }
    case 'portrait': {
      p.canvas.material.map = p.faces[th.s % 4]; m.position.y = 1.6;
      // the eyes follow whoever is closest
      const me = g.me;
      if (me) {
        const local = m.worldToLocal(new THREE.Vector3(me.x, 1.3, me.z));
        const a = Math.atan2(local.x, -local.z);
        p.eyes.forEach((e, i) => { e.visible = th.s !== 3; e.position.x = (i ? 0.07 : -0.07) + clamp(-a * 0.02, -0.015, 0.015); });
      }
      break;
    }
    case 'dog': {
      const run = th.s === 1 || th.s === 2 ? 1 : 0;
      const sp = Math.hypot(th.rx - (th.lx ?? th.rx), th.rz - (th.lz ?? th.rz)) / Math.max(dt, 1e-3); th.lx = th.rx; th.lz = th.rz;
      const k = clamp(sp / 3, 0, 1.5), d = t * 14;
      p.legs.forEach((l, i) => { l.rotation.x = Math.sin(d + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.5 : 0)) * 0.7 * k; });
      p.tail.rotation.z = Math.sin(t * (th.s === 3 ? 30 : 12)) * (th.s === 3 ? 0.8 : 0.4);
      p.body.position.y = 0.45 + Math.abs(Math.sin(d)) * 0.04 * k + Math.sin(t * 2) * 0.03;
      p.head.rotation.x = run ? -0.2 : Math.sin(t * 1.3) * 0.15;
      const carried = g.items.carriedBy('T' + th.id);
      if (carried && carried.model.parent !== p.carry) { p.carry.add(carried.model); carried.model.position.set(0, 0, 0); carried.model.scale.setScalar(0.7); }
      break;
    }
  }
}
