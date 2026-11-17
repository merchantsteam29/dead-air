// The chaos: blood rain, viewer donations, and carrying a friend's body back to the van to revive them.
import * as THREE from 'three';
import { KINDS } from './things.js';
import { clamp, rng, pick, r2, fmt } from './util.js';
import { username } from './chat.js';

// ---------- blood rain ----------
// The host plans it (about half the nights): a warning, then 40-55 s of red rain. Outside (not under a roof or
// right by the van) it drains your stamina and the camcorder's battery and paints the screen red, but anything
// filmed out in it is worth double. ev 'rain' {st: 'warn' | 'on' | 'off'}; the snapshot's `r` keeps late browsers in step.
export class BloodRain {
  constructor(g) {
    this.g = g;
    this.state = 'off'; this.k = 0; // k: 0..1 how heavy it is (eases in and out)
    const r = rng((g.seed ^ 0xb100d) >>> 0);
    const pw = r(), pd = r(); // (it's the night's event: events.js picks it)
    this.plan = g.events?.kind === 'bloodrain' ? { warn: 50 + pw * 150, dur: 40 + pd * 15 } : null;
    // red streaks around the camera
    const n = 1400, pos = new Float32Array(n * 6);
    this.drops = []; for (let i = 0; i < n; i++) this.drops.push({ x: (r() - 0.5) * 30, y: r() * 14, z: (r() - 0.5) * 30, v: 16 + r() * 8 });
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0x9a0a12, transparent: true, opacity: 0, fog: false }));
    this.lines.frustumCulled = false;
    g.scene.add(this.lines);
    this.fx = document.getElementById('rainFx');
    this.baseFog = g.scene.fog.color.clone(); this.baseBg = g.scene.background.clone(); this.red = new THREE.Color(0x3a0508);
    this.outside = false;
  }

  hostTick(dt) {
    const p = this.plan, t = this.g.time;
    if (!p) return;
    if (this.state === 'off' && !p.done && t > p.warn) { this.g.event({ k: 'rain', st: 'warn' }); p.warnAt = t; this.state = 'warn'; }
    else if (this.state === 'warn' && t > p.warnAt + 8) { this.g.event({ k: 'rain', st: 'on' }); this.state = 'on'; p.onAt = t; }
    else if (this.state === 'on' && t > p.onAt + p.dur) { this.g.event({ k: 'rain', st: 'off' }); this.state = 'off'; p.done = true; }
  }
  onEvent(e) {
    const g = this.g;
    if (!g.isHost) this.state = e.st;
    if (e.st === 'warn') { g.toast('The sky is turning red... get under a roof!', 5); g.sfx.play('thunder'); g.input.rumble(0.4, 0.2, 400); }
    if (e.st === 'on') { g.toast('BLOOD RAIN. Stay inside, or film it for double views.', 4); g.sfx.startRain(); }
    if (e.st === 'off') { g.toast('The rain stops.', 3); g.sfx.stopRain(); }
  }
  snapIn(r) { const st = ['off', 'warn', 'on'][r] || 'off'; if (st !== this.state && !this.g.isHost) { this.onEvent({ st }); } }
  snapOut() { return this.state === 'on' ? 2 : this.state === 'warn' ? 1 : 0; }

  // is (x, z) out in it? (under a roof, or right at the van's open back, is cover)
  exposed(x, z) {
    const W = this.g.world;
    return this.state === 'on' && !W.indoor(x, z) && Math.hypot(x - W.van.x, z - W.van.z) > 3.2;
  }

  update(dt) {
    const g = this.g, on = this.state === 'on';
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * (on ? 0.8 : 0.5));
    const me = g.me, cam = g.camera.position;
    this.outside = !me.dead && this.exposed(me.x, me.z);
    // the sky goes red
    g.scene.fog.color.copy(this.baseFog).lerp(this.red, this.k * 0.85);
    g.scene.background.copy(this.baseBg).lerp(this.red, this.k * 0.85);
    this.lines.material.opacity = this.k * (g.world.indoor(cam.x, cam.z) ? 0.25 : 0.75);
    this.lines.visible = this.k > 0.01;
    if (this.fx) this.fx.style.opacity = (this.outside ? this.k * 0.75 : this.k * 0.12).toFixed(2);
    g.sfx.rainLevel(this.k * (this.outside ? 1 : 0.35));
    if (!this.lines.visible) return;
    const a = this.geo.attributes.position.array;
    this.drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) { d.y = 12 + Math.random() * 3; d.x = (Math.random() - 0.5) * 30; d.z = (Math.random() - 0.5) * 30; }
      const x = cam.x + d.x, z = cam.z + d.z, o = i * 6;
      a[o] = x; a[o + 1] = d.y; a[o + 2] = z; a[o + 3] = x + 0.04; a[o + 4] = d.y + 0.55; a[o + 5] = z;
    });
    this.geo.attributes.position.needsUpdate = true;
    if (this.outside && Math.random() < dt * 0.15) g.sfx.play('thunder');
  }
  dispose() { this.g.scene.remove(this.lines); this.geo.dispose(); if (this.fx) this.fx.style.opacity = 0; this.g.sfx.stopRain(); }
}

// ---------- donations ----------
// The host picks a request every so often ("film the wardrobe up close!"); whoever films it first gets a bonus
// on their tape. ev 'req' {id, tag, text, user, amt, bonus, near, need, secs}, 'reqDone' {id, by, bonus}, 'reqEnd' {id}.
// Intent 'don' {id, cam} from the camcorder that did it.
const SAY = {
  chair: 'film the floating chair up close!!', tv: 'get the TV face on camera', flamingo: 'film the flamingos. closer.', wardrobe: 'film the wardrobe OPEN',
  balloon: 'film the balloon!!', dancer: 'film her dancing pls', applause: 'get mr applause on camera (stay safe lol)', hand: 'film the hand, it creeps me out',
  scream: 'make someone SCREAM on camera', fall: 'film someone falling over 😭', bonk: 'hit a monster with something', dance: 'film someone dancing',
  narrate: 'talk to chat for a bit', haunted: 'film the floating junk', critic: 'film the guy in the coat (only for a sec)', cart: 'film the cart that drives itself', xray: 'film the x-ray waving', chalkboard: 'film the chalkboard writing', intern: 'film the extra crew member', mascot: 'film the hot dog guy', phone: 'film the phone ringing', bathtub: 'film the bathtub', portrait: 'film the creepy painting', dog: 'film the ghost dog!!', nv: 'use night vision for a bit', rain: 'film the blood rain', revive: 'film a revive at the van',
};
export class Donations {
  constructor(g) {
    this.g = g; this.req = null; this.prog = 0; this.next = 40; this.n = 0;
    this.r = rng((g.seed ^ 0xd0e) >>> 0);
    this.el = document.getElementById('don');
    this.el.hidden = true;
  }
  hostTick(dt) {
    const g = this.g;
    if (this.req) {
      if (g.time > this.req.ends) { g.event({ k: 'reqEnd', id: this.req.id }); }
      return;
    }
    if (g.time < this.next) return;
    this.next = g.time + 45 + this.r() * 35;
    const crew = g.living().length, kinds = [...new Set(g.things.list.map((t) => t.kind))];
    const opts = kinds.map((k) => ({ tag: k, near: k === 'applause' ? 12 : 7, need: 3 }));
    if (crew > 1) opts.push({ tag: 'scream', need: 1.5 }, { tag: 'fall', moment: true }, { tag: 'dance', need: 2 });
    else opts.push({ tag: 'narrate', need: 4 });
    opts.push({ tag: 'nv', need: 5 });
    if (kinds.includes('applause') || kinds.includes('hand')) opts.push({ tag: 'bonk', moment: true });
    if (g.rain.state === 'on') opts.push({ tag: 'rain', need: 4 }, { tag: 'rain', need: 4 });
    if (g.players.size > 1 && [...g.players.values()].some((P) => P.dead)) opts.push({ tag: 'revive', moment: true });
    const o = pick(this.r, opts), amt = pick(this.r, [2, 5, 5, 10, 20, 50]);
    g.event({ k: 'req', id: ++this.n, tag: o.tag, text: SAY[o.tag], user: username(this.r), amt, bonus: 120 + amt * 6 + g.night * 30, near: o.near || 30, need: o.need || 0, secs: 45 });
  }
  onEvent(e) {
    const g = this.g;
    if (e.k === 'req') {
      this.req = { ...e, ends: g.time + e.secs }; this.prog = 0;
      g.sfx.play('cash'); g.cam.addChat(`💸 $${e.amt}: ${e.text}`, true);
    }
    if (e.k === 'reqDone' && this.req?.id === e.id) {
      this.req = null;
      const who = g.players.get(e.by)?.name || 'Someone';
      g.toast(`💸 ${e.by === g.myId ? 'You' : who} got the donation! +${fmt(e.bonus)} views`, 3);
      if (e.by === g.myId) { g.sfx.play('big'); g.cam.pop(`+${fmt(e.bonus)} DONATION`, true); }
    }
    if (e.k === 'reqEnd' && this.req?.id === e.id) { this.req = null; g.cam.addChat('💸 donation expired 😔'); }
  }
  // the camcorder reports what it saw this tick (tags + things in frame, close enough)
  progress(dt, tags, things) {
    const q = this.req;
    if (!q || !q.need) return;
    const hit = tags.has(q.tag) || things.some((t) => t.kind === q.tag && t.d <= q.near);
    if (hit) this.prog += dt;
    if (this.prog >= q.need) this.claim();
  }
  moment(tag) { if (this.req && this.req.tag === tag) this.claim(); }
  claim() {
    const g = this.g, cam = g.cam.myCam();
    if (!this.req || !cam || this.req.claimed) return;
    this.req.claimed = true;
    g.send({ t: 'don', id: this.req.id, cam: cam.id });
  }
  // host: someone says they did it
  hostClaim(P, m) {
    const g = this.g, q = this.req, it = g.items.byId.get(m.cam);
    if (!q || q.id !== m.id || !it || it.holder !== P.id) return;
    it.tape += q.bonus;
    g.event({ k: 'reqDone', id: q.id, by: P.id, bonus: q.bonus });
  }
  hud() {
    const q = this.req, el = this.el;
    el.hidden = !q;
    if (!q) return;
    const left = Math.max(0, Math.ceil(q.ends - this.g.time));
    el.innerHTML = `<b>💸 $${q.amt}</b> <span class="u">${esc(q.user)}:</span> "${esc(q.text)}" <span class="t">${left}s · +${fmt(q.bonus)}</span>${q.need ? `<i style="width:${clamp(this.prog / q.need, 0, 1) * 100}%"></i>` : ''}`;
  }
  dispose() { this.el.hidden = true; }
}

// ---------- bodies ----------
// A dead friend can be picked up (E), carried (slowly), dropped (Q) or thrown (click) - a thrown body knocks people
// over. A body that spends 2.5 s at the van comes back to life there. Host: P.carrier / C.carrying; intents 'carry'
// {id} and 'bodyDrop' {vx, vy, vz}; ev 'revive' {id, x, z}.
export class Bodies {
  constructor(g) { this.g = g; }
  hostCarry(C, id) {
    const g = this.g, P = g.players.get(id);
    if (!P || !P.dead || P.carrier || C.dead || C.down || C.carrying || g.items.heldBy(C.id)) return;
    if (Math.hypot(P.x - C.x, P.z - C.z) > 2.8) return;
    P.carrier = C.id; C.carrying = id; P.bv = null;
    g.sound('grab', P.x, 0.5, P.z);
  }
  hostDrop(C, m) {
    const g = this.g, P = C.carrying && g.players.get(C.carrying);
    C.carrying = null;
    if (!P) return;
    P.carrier = null;
    P.bv = { x: clamp(+m.vx || 0, -12, 12), y: clamp(+m.vy || 0, -2, 8), z: clamp(+m.vz || 0, -12, 12) };
    P.thrower = C.id; P.throwT = g.time;
    if (Math.hypot(P.bv.x, P.bv.z) > 4) g.sound('whoosh', P.x, 1, P.z);
  }
  hostTick(dt) {
    const g = this.g, W = g.world;
    for (const P of g.players.values()) {
      if (!P.dead) { if (P.carrying && !g.players.get(P.carrying)?.dead) P.carrying = null; continue; }
      if (P.carrier) {
        const C = g.players.get(P.carrier);
        if (!C || C.dead || C.down || C.carrying !== P.id) { P.carrier = null; if (C) C.carrying = null; P.bv = { x: 0, y: 0, z: 0 }; }
        else { // over the right shoulder, so the carrier can still see
          const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw), rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
          P.x = C.x + rx * 0.45 + fx * 0.15; P.z = C.z + rz * 0.45 + fz * 0.15; P.y = 0.5; P.yaw = C.yaw;
        }
      } else if (P.bv) { // flying or falling
        P.bv.y -= 18 * dt;
        P.x += P.bv.x * dt; P.y += P.bv.y * dt; P.z += P.bv.z * dt;
        const p = { x: P.x, z: P.z, nx: 0, nz: 0 };
        if (W.collide(p, 0.3)) { const d = P.bv.x * p.nx + P.bv.z * p.nz; if (d < 0) { P.bv.x -= 1.5 * d * p.nx; P.bv.z -= 1.5 * d * p.nz; } P.x = p.x; P.z = p.z; }
        if (P.y <= 0) { P.y = 0; if (P.bv.y < -5) g.sound('thud', P.x, 0.3, P.z); P.bv.y = P.bv.y < -3 ? -P.bv.y * 0.25 : 0; P.bv.x *= 0.55; P.bv.z *= 0.55; }
        const sp = Math.hypot(P.bv.x, P.bv.z);
        if (sp > 4.5) for (const Q of g.living()) {
          if (Q.id === P.thrower && g.time - P.throwT < 0.4) continue;
          if (Math.hypot(Q.x - P.x, Q.z - P.z) < 0.7) { g.knockDown(Q.id, 1.5, 'p:' + P.thrower, { x: P.bv.x, z: P.bv.z }); g.sound('bonk', Q.x, 1, Q.z); P.bv.x *= -0.3; P.bv.z *= -0.3; }
        }
        if (P.y === 0 && sp < 0.2 && P.bv.y === 0) P.bv = null;
      }
      // at the van: back to life
      if (!P.carrier && P.y < 0.3 || P.carrier) {
        if (W.inVan(P.x, P.z) && Math.hypot(P.x - W.van.x, P.z - W.van.z) < W.van.r) {
          P.reviveT = (P.reviveT || 0) + dt;
          if (P.reviveT > 2.5) this.revive(P);
        } else P.reviveT = 0;
      }
    }
  }
  revive(P) {
    const g = this.g, W = g.world;
    const C = P.carrier && g.players.get(P.carrier); if (C) C.carrying = null;
    P.carrier = null; P.bv = null; P.dead = false; P.down = false; P.reviveT = 0;
    P.x = W.van.x + 2.4 * (Math.random() < 0.5 ? -1 : 1); P.z = W.van.z + 0.5; P.y = 0;
    g.event({ k: 'revive', id: P.id, x: r2(P.x), z: r2(P.z) });
    g.sound('revive', P.x, 1, P.z);
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const KIND_NAMES = KINDS;
