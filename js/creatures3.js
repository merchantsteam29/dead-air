// Weird things that only turn up in one kind of place: the shopping cart (mall), the X-ray lightbox (hospital)
// and the chalkboard (school). Same rules as creatures2.js: things.js calls build / host / draw.
import * as THREE from 'three';
import { clamp, angDiff, yawTo } from './util.js';

import { lam } from './mats.js';

export const MORE3 = {
  cart:       { worth: 26, name: 'the shopping cart', act: (th) => [0.5, 2.2, 3][th.s] ?? 1, hy: 0.6 },
  xray:       { worth: 32, name: 'the X-ray', act: (th) => (th.s ? 3 : 0.6), hy: 1.6 },
  chalkboard: { worth: 28, name: 'the chalkboard', act: (th) => ((th.st ?? 99) < 4 ? 3.2 : 0.8), hy: 1.6 },
  // only exists on camera: worth a lot for a moment, then it starts taking views away (camcorder.js)
  critic:     { worth: 85, name: 'the Critic', act: (th) => (th.s === 1 ? 1.3 : 1), hy: 1.6, onlyOnCamera: true },
};
// what the chalkboard writes ({n} = a crew member's name)
export const CHALK = ['{n} IS NEXT', 'LOOK BEHIND YOU', '{n} + ME = BFFS', 'STAY AFTER CLASS {n}', 'SMILE FOR THE CAMERA', 'WHO LET THE DOG OUT', '{n} HAS DETENTION', 'I CAN SEE YOU', '7 x 6 = {n}', 'NO RUNNING IN THE HALLS', 'HELP ME', '{n} FORGOT THEIR HOMEWORK'];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, x: c.getContext('2d'), t }; }

// a skeleton on an X-ray: arms down (0) or one waving (1); kind 1 has far too many ribs
function skeleton(x, w, h, wave, odd) {
  x.fillStyle = '#0a1418'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#cfe8ff'; x.fillStyle = '#cfe8ff'; x.lineWidth = 3; x.lineCap = 'round';
  x.beginPath(); x.arc(w / 2, 26, 14, 0, 7); x.stroke();
  x.fillStyle = '#0a1418'; x.fillRect(w / 2 - 6, 24, 4, 4); x.fillRect(w / 2 + 2, 24, 4, 4);
  x.beginPath(); x.moveTo(w / 2, 40); x.lineTo(w / 2, 120); x.stroke();
  const ribs = odd ? 11 : 5;
  for (let i = 0; i < ribs; i++) { const y = 50 + i * (50 / ribs); x.beginPath(); x.ellipse(w / 2, y, 18 - i * 0.6, 4, 0, 0, Math.PI); x.stroke(); }
  x.beginPath(); x.moveTo(w / 2 - 20, 46); x.lineTo(w / 2 + 20, 46); x.stroke();
  x.beginPath(); x.moveTo(w / 2 - 20, 46); x.lineTo(w / 2 - 28, 90); x.lineTo(w / 2 - 30, 120); x.stroke();
  x.beginPath(); x.moveTo(w / 2 + 20, 46);
  if (wave) { x.lineTo(w / 2 + 34, 30); x.lineTo(w / 2 + 40, 6); } else { x.lineTo(w / 2 + 28, 90); x.lineTo(w / 2 + 30, 120); }
  x.stroke();
  x.beginPath(); x.ellipse(w / 2, 124, 18, 8, 0, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(w / 2 - 10, 130); x.lineTo(w / 2 - 14, 180); x.lineTo(w / 2 - 14, 220); x.moveTo(w / 2 + 10, 130); x.lineTo(w / 2 + 14, 180); x.lineTo(w / 2 + 14, 220); x.stroke();
}

export function buildMore3(kind, th) {
  const g = new THREE.Group(), p = {};
  if (kind === 'cart') {
    const metal = lam(0xb8bcc0);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.85), new THREE.MeshLambertMaterial({ color: 0xb8bcc0, wireframe: true }));
    basket.position.y = 0.72; g.add(basket);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.8), metal); bottom.position.y = 0.52; g.add(bottom);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), lam(0xc83a2a)); handle.rotation.z = Math.PI / 2; handle.position.set(0, 1.0, 0.48); g.add(handle);
    for (const [x, z] of [[-0.22, -0.35], [0.22, -0.35], [-0.22, 0.35], [0.22, 0.35]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), lam(0x222222)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.06, z); g.add(w); const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.02), metal); leg.position.set(x, 0.3, z); g.add(leg); }
    // a sad balloon tied to it
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lam(0x2a8ad0)); b.position.set(0.2, 1.7, 0.45); g.add(b);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.65), lam(0xdddddd)); str.position.set(0.2, 1.33, 0.45); g.add(str);
  }
  if (kind === 'xray') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.08), lam(0x9aa0a6)); g.add(box);
    p.frames = [0, 1].map((wave) => { const c = canvas(128, 230); skeleton(c.x, 128, 230, wave, th?.a === 1); c.t.needsUpdate = true; return c.t; });
    p.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.86), new THREE.MeshBasicMaterial({ map: p.frames[0], color: 0x9fb8c8 }));
    p.screen.position.z = -0.045; p.screen.rotation.y = Math.PI; g.add(p.screen);
    g.position.y = 1.55;
  }
  if (kind === 'critic') {
    const coat = lam(0xb8a478), dark = lam(0x2a2620); // (light: it has to read through a dark viewfinder)
    p.body = new THREE.Group(); g.add(p.body);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 1.5, 8), coat); c.position.y = 0.95; p.body.add(c);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.2, 8), coat); collar.position.y = 1.75; p.body.add(collar);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe8e6e0 })); head.scale.y = 1.25; head.position.y = 2.0; p.body.add(head);
    const frown = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), new THREE.MeshBasicMaterial({ color: 0x111111 })); frown.position.set(0, 1.93, -0.185); p.body.add(frown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14), dark); brim.position.y = 2.2; p.body.add(brim);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 12), dark); hat.position.y = 2.32; p.body.add(hat);
    p.arm = new THREE.Group(); p.arm.position.set(0.3, 1.6, 0); p.body.add(p.arm);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), coat); a.position.y = -0.3; p.arm.add(a);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), lam(0xf4f2e8)); pad.position.set(0, -0.6, -0.1); pad.rotation.x = -0.6; p.arm.add(pad);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 4), lam(0x111111)); pen.position.set(-0.4, 1.0, -0.2); pen.rotation.z = 0.8; p.body.add(pen); p.pen = pen;
  }
  if (kind === 'chalkboard') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.25, 0.06), lam(0x6a4a2a)); g.add(frame);
    p.c = canvas(512, 240);
    p.board = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.1), new THREE.MeshLambertMaterial({ map: p.c.t }));
    p.board.position.z = -0.035; p.board.rotation.y = Math.PI; g.add(p.board);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.1), lam(0x5a3a1a)); ledge.position.set(0, -0.62, -0.06); g.add(ledge);
    g.position.y = 1.6;
    p.text = ''; p.shown = -1;
  }
  g.userData.p = p;
  return g;
}

export function hostMore3(T, th, dt, living, near) {
  const g = T.g, n0 = near[0];
  if (th.kind === 'cart') {
    // rolls (squeakily) at whoever is near; a hit knocks you over, then it backs off
    if (th.s === 2) { if (th.t > 4) th.s = 0; else T.walk(th, th.x + Math.sin(th.yaw) * 2, th.z + Math.cos(th.yaw) * 2, 1.2, dt); return; }
    if (n0 && n0.d < 12) {
      th.s = 1;
      T.walk(th, n0.P.x, n0.P.z, 2.4, dt);
      if (T.r() < dt * 1.5) g.sound('squeak', th.x, 0.5, th.z);
      if (n0.d < 0.75 && !n0.P.down) { g.knockDown(n0.P.id, 1.1, th.id); g.sound('hit', th.x, 0.6, th.z); th.s = 2; th.t = 0; }
    } else th.s = 0;
    return;
  }
  if (th.kind === 'xray') {
    const on = n0 && n0.d < 5 ? 1 : 0;
    if (on && !th.s) g.sound('tvOn', th.x, 1.5, th.z);
    th.s = on;
    return;
  }
  if (th.kind === 'critic') {
    // 0 lurking behind the crew, 1 being filmed (creeps at whoever films it), 2 gone (after cancelling someone)
    if (th.s === 2) { th.y = -10; if (th.t > 30) { const s = g.world.spot(T.r, 'any', 0); Object.assign(th, { x: s.x, z: s.z, y: 0, s: 0, t: 0, path: null }); } return; }
    const filmers = living.filter((P) => P.aim && T.sees(P, th.x, th.z, 26, 0.45)).map((P) => ({ P, d: Math.hypot(P.x - th.x, P.z - th.z) })).sort((a, b) => a.d - b.d);
    if (filmers.length) {
      th.s = 1;
      const F = filmers[0];
      T.walk(th, F.P.x, F.P.z, 1.5, dt);
      if (F.d < 2.2) { // cancelled
        const cam = g.items.heldBy(F.P.id), lost = cam && cam.kind === 'cam' ? Math.round(cam.tape * 0.25) : 0;
        if (lost) cam.tape -= lost;
        g.knockDown(F.P.id, 1.6, th.id);
        g.event({ k: 'cancel', id: F.P.id, lost, th: th.id });
        g.sound('shriek', th.x, 1.8, th.z);
        th.s = 2; th.t = 0;
      }
      return;
    }
    th.s = 0;
    // lurk behind whoever is nearest, out of the way of their camera
    if (n0) { const tx = n0.P.x + Math.sin(n0.P.yaw) * 9, tz = n0.P.z + Math.cos(n0.P.yaw) * 9; if (g.world.walkCell(Math.floor(tx), Math.floor(tz))) T.walk(th, tx, tz, 1.1, dt); }
    return;
  }
  if (th.kind === 'chalkboard') {
    // writes something new now and then (a = message * 10 + whose name); s counts the messages
    th.next = th.next ?? 6 + T.r() * 6;
    th.next -= dt;
    const close = n0 && n0.d < 14;
    if (th.next <= 0 && close) {
      th.next = 16 + T.r() * 14;
      const ids = [...g.players.keys()], who = ids.indexOf(living[Math.floor(T.r() * living.length)]?.id);
      th.a = Math.floor(T.r() * CHALK.length) * 10 + Math.max(0, who);
      th.s = (th.s + 1) % 1000;
      g.sound('chalk', th.x, 1.6, th.z);
    }
  }
}

export function drawMore3(T, th, p, t, dt) {
  const g = T.g, m = th.model;
  if (th.kind === 'cart') {
    m.rotation.z = th.s === 1 ? Math.sin(t * 25) * 0.015 : 0;
  }
  if (th.kind === 'xray') {
    p.screen.material.map = th.s && Math.floor(t * 3) % 2 ? p.frames[1] : p.frames[0];
    p.screen.material.color.setHex(th.s ? 0xd0e8ff : 0x7f98a8);
    m.position.y = 1.55;
  }
  if (th.kind === 'critic') {
    m.visible = th.y > -5 && (g.cam.aiming || (g.role === 'tech' && Math.hypot(th.rx - g.me.x, th.rz - g.me.z) < 15)); // only through the camcorder (or the Tech's eyes, up close)
    p.body.rotation.z = Math.sin(t * 1.3) * 0.04;
    p.pen.rotation.z = 0.8 + Math.sin(t * 9) * 0.3; // scribbling notes
    p.arm.rotation.x = -0.4 + Math.sin(t * 9) * 0.05;
  }
  if (th.kind === 'chalkboard') {
    m.position.y = 1.6;
    if (p.shown !== th.s) { // a new message: write it out over 2.5 s
      p.shown = th.s; p.wt = 0;
      const ids = [...g.players.keys()], name = (g.players.get(ids[th.a % 10]) || g.me)?.name || 'YOU';
      p.text = th.s ? CHALK[Math.floor(th.a / 10) % CHALK.length].replace('{n}', name.toUpperCase()) : '';
    }
    p.wt += dt;
    const n = Math.floor(clamp(p.wt / 2.5, 0, 1) * p.text.length);
    if (n !== p.drawn) {
      p.drawn = n;
      const x = p.c.x, w = 512, h = 240;
      x.fillStyle = '#1e3a2a'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 30; i++) x.fillRect((i * 97) % w, (i * 53) % h, 60, 3); // old rubbed-out chalk
      x.fillStyle = '#f0f0e8'; x.font = 'bold 44px "Comic Sans MS", "Chalkboard", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const s = p.text.slice(0, n), words = s.split(' '), lines = [''];
      for (const wd of words) { if ((lines[lines.length - 1] + ' ' + wd).length > 16) lines.push(wd); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + wd).trim(); }
      lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 52));
      p.c.t.needsUpdate = true;
    }
  }
}
