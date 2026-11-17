// One night at a location. The same code runs alone and online: the host (or the only player) runs the
// creatures, the junk's physics and the rules, and sends a snapshot 15 times a second; every player moves
// themselves and sends where they are ('st'). Messages: client -> host: st, grab, drop, film, leave, carry, bodyDrop, don, quit.
// Host -> everyone: snap, ev (sounds, knock-downs, deaths, thefts, revives, rain, donations...), end.
import * as THREE from 'three';
import { World, buildScene } from './world.js';
import { Crew, makeProp, BASIC_PROPS } from './models.js';
import { Things } from './things.js';
import { Items } from './items.js';
import { Camcorder } from './camcorder.js';
import { BloodRain, Donations, Bodies } from './chaos.js';
import { NightEvents } from './events.js';
import { noteRevive } from './stats.js';
import { EmoteWheel, EMOTES, EMOTE_SECS } from './emotes.js';
import { clamp, angDiff, rng, pick, shuffle, r2, fmt } from './util.js';

const EYE = 1.25, WALK = 3.0, RUN = 5.3, JUMP = 4.8, GRAV = 14;
export const NIGHT_SECS = 360;
const PASSIVE = ['chair', 'tv', 'wardrobe', 'dancer', 'balloon', 'flamingo', 'phone', 'bathtub', 'portrait', 'dog'];
const BLOCKERS = { wardrobe: 0.65, tv: 0.5, dancer: 0.35, applause: 0.3, bathtub: 0.75, phone: 0.35, mascot: 0.45, cart: 0.4 };

export class Game {
  constructor(o) {
    Object.assign(this, { renderer: o.renderer, sfx: o.sfx, input: o.input, net: o.net, vc: o.vc, tape: o.tape, settings: o.settings, micLevel: o.micLevel || (() => 0) });
    this.isHost = o.net.isHost;
    this.myId = o.myId;
    this.seed = o.seed; this.night = o.night; this.season = o.season; this.quota = o.quota; this.seasonViews = o.seasonViews || 0; this.nightOf = o.nightOf || 3;
    this.onEnd = o.onEnd || (() => {});
    this.time = 0; this.left = NIGHT_SECS; this.over = false; this.danger = 0; this.nightViews = 0;

    // scene and light: a moon with a (static) shadow so the insides of buildings are dark, plus everyone's headlamp
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);
    scene.fog = new THREE.FogExp2(0x0b1020, 0.034);
    this.hemi = new THREE.HemisphereLight(0x8090c0, 0x202018, 0.24); scene.add(this.hemi);
    this.world = new World(this.seed);
    const W = this.world;
    const moon = new THREE.DirectionalLight(0xa8b8ff, 0.95);
    moon.position.set(W.W / 2 + 20, 60, W.H / 2 + 10); moon.target.position.set(W.W / 2, 0, W.H / 2);
    moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 140 });
    moon.shadow.bias = -0.0015; moon.shadow.normalBias = 0.05;
    scene.add(moon, moon.target);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false;
    this.level = buildScene(W, scene);
    this.level.traverse((m) => { if (m.isMesh || m.isInstancedMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.renderer.shadowMap.needsUpdate = true;

    this.camera = new THREE.PerspectiveCamera(this.settings.fov || 75, innerWidth / innerHeight, 0.05, 140);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
    this.flash = new THREE.SpotLight(0xfff1d0, 14, 26, 0.5, 0.55, 1.1);
    this.flash.position.set(0.12, -0.08, 0.1); this.flash.target.position.set(0, -0.3, -5);
    this.camera.add(this.flash, this.flash.target);
    // friends' headlamps (always in the scene, so no shader rebuilds)
    this.lamps = [0, 1, 2].map(() => { const l = new THREE.SpotLight(0xfff1d0, 0, 22, 0.48, 0.55, 1.1); scene.add(l, l.target); return l; });
    // what I hold, in first person
    this.view = new THREE.Group(); this.camera.add(this.view);
    this.viewLight = new THREE.PointLight(0xffffff, 0.4, 1.5); this.view.add(this.viewLight); // so it's never pitch black
    this.viewItem = null; this.viewKind = null;

    // the crew
    this.players = new Map();
    o.crew.forEach((c, i) => {
      const P = { id: c.id, name: c.name, color: c.color, hat: c.hat, x: W.van.x + (i % 2 ? 2.4 : -2.4), y: 0, z: W.van.z - 2 + Math.floor(i / 2) * 1.6, yaw: 0, pitch: 0, vx: 0, vz: 0, v: 0, aim: false, flash: true, run: false, wave: false, nv: false, down: false, dead: false, downUntil: 0, emote: null, carrier: null, carrying: null };
      P.rx = P.x; P.rz = P.z; P.ry = 0; P.ryaw = 0; P.stepD = 0; P.slot = -1;
      if (c.id !== this.myId) { P.model = new Crew(c.color, c.hat); scene.add(P.model.root); P.slot = this.players.size - (this.players.has(this.myId) ? 1 : 0); }
      this.players.set(c.id, P);
    });
    let slot = 0; for (const P of this.players.values()) if (P.id !== this.myId) P.slot = slot++;
    this.me = this.players.get(this.myId);
    const me = this.me;
    this.p = { emote: null, emoteT: 0, vy: 0, ground: true, stam: 100, downT: 0, stepD: 0, bob: 0, holdE: 0, waveT: 0, flash: true, spec: 0, roll: 0, eye: EYE };

    this.things = new Things(this);
    this.items = new Items(this);
    this.cam = new Camcorder(this);
    this.events = new NightEvents(this);
    this.rain = new BloodRain(this);
    this.dons = new Donations(this);
    this.bodies = new Bodies(this);
    this.wheel = new EmoteWheel(this.input);
    if (this.isHost) this.populate(o.crew.length);
    this.snapT = 0; this.stT = 0; this.hudT = 0; this.endT = null;

    this.hud = {
      root: document.getElementById('hud'), clock: document.getElementById('hClock'), night: document.getElementById('hNight'), views: document.getElementById('hViews'),
      prompt: document.getElementById('prompt'), stam: document.getElementById('stam'), stamBar: document.querySelector('#stam i'), toast: document.getElementById('toast'),
      tab: document.getElementById('tabBox'), crew: document.getElementById('tabCrew'), van: document.getElementById('vanArrow'), spec: document.getElementById('spec'),
      down: document.getElementById('downFx'), danger: document.getElementById('dangerFx'),
    };
    this.hud.root.hidden = false;
    this.toast(`${W.name} · Night ${this.night}`, 4);
    setTimeout(() => !this.over && this.toast(this.crewSize() > 1 ? 'Grab the camcorder. Film anything weird. Get back to the van by 6 a.m.' : 'Grab the camcorder. Film anything weird. Get back to the van by 6 a.m.', 6), 4200);
    this.sfx.startAmbient();
    me.x = me.rx; me.z = me.rz;
  }

  crewSize() { return this.players.size; }
  living() { return [...this.players.values()].filter((P) => !P.dead); }
  stamp() { return `NIGHT ${this.night}  ${this.clock()}`; }
  clock() {
    const m = Math.floor((this.time / NIGHT_SECS) * 360), h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
    return `${h === 0 ? 12 : h}:${mm} AM`;
  }

  // ---------- host: set the night up ----------
  populate(nCrew) {
    const W = this.world, r = rng((this.seed * 31 + 7) >>> 0), T = this.things, I = this.items;
    // camcorders at the van
    const cams = nCrew <= 2 ? 1 : 2;
    for (let i = 0; i < cams; i++) I.add('cam', W.van.x + 1.7 + i * 0.7, W.van.z + 3.3);
    // junk
    const junk = W.T.props ? [...BASIC_PROPS, ...W.T.props, ...W.T.props, ...W.T.props] : BASIC_PROPS;
    for (let i = 0; i < 30; i++) { const s = W.spot(r, 'any', 6); I.add(pick(r, junk), s.x, s.z); }
    // the weird stuff: different rooms
    const rooms = shuffle(r, W.rooms.slice());
    let ri = 0;
    const nextRoom = () => rooms[ri++ % rooms.length];
    const kinds = shuffle(r, PASSIVE.slice()).slice(0, Math.min(7, 4 + this.night));
    for (const k of kinds) {
      if (k === 'chair' || k === 'dancer') { const rm = nextRoom(); T.spawn(k, rm.x0 + rm.w / 2 + (r() - 0.5), rm.z0 + rm.h / 2 + (r() - 0.5)); }
      if (k === 'tv' || k === 'wardrobe') { const at = this.againstWall(r, nextRoom(), k === 'wardrobe' ? 0.75 : 0.45); if (at) T.spawn(k, at.x, at.z, { yaw: at.yaw }); }
      if (k === 'balloon') { const s = W.spot(r, 'out', 14); T.spawn('balloon', s.x, s.z, { y: 1.9 }); }
      if (k === 'phone') { const rm = nextRoom(); T.spawn('phone', rm.x0 + rm.w / 2 + (r() - 0.5) * 2, rm.z0 + rm.h / 2 + (r() - 0.5) * 2); }
      if (k === 'bathtub') { const at = this.againstWall(r, nextRoom(), 0.5); if (at) T.spawn('bathtub', at.x, at.z, { yaw: at.yaw }); }
      if (k === 'portrait') { const at = this.againstWall(r, nextRoom(), 0.08); if (at) T.spawn('portrait', at.x, at.z, { yaw: at.yaw }); }
      if (k === 'dog') { const s = W.spot(r, 'out', 12); T.spawn('dog', s.x, s.z); }
      if (k === 'flamingo') { const s = W.spot(r, 'out', 16); for (let i = 0; i < 3; i++) { const p = { x: s.x + (i - 1) * 1.1, z: s.z + (i % 2) * 0.8 }; if (W.walkCell(Math.floor(p.x), Math.floor(p.z))) T.spawn('flamingo', p.x, p.z, { a: -99 }); } }
    }
    // what only this kind of place has
    const u = W.T.unique;
    for (let i = 0; u && i < 2; i++) {
      if (u === 'cart') { const s = W.spot(r, 'in', 10); T.spawn('cart', s.x, s.z); }
      else { const at = this.againstWall(r, nextRoom(), 0.06); if (at) T.spawn(u, at.x, at.z, { yaw: at.yaw, a: u === 'xray' ? (r() < 0.3 ? 1 : 0) : 0 }); }
    }
    if (this.night >= 4) { const rm = nextRoom(); T.spawn('chair', rm.x0 + rm.w / 2, rm.z0 + rm.h / 2); }
    // the dangerous ones arrive later
    this.schedule = [{ t: this.night === 1 ? 45 : 30, k: 'applause' }];
    if (this.night >= 2) this.schedule.push({ t: 75, k: 'hand' });
    if (this.night >= 3) this.schedule.push({ t: 170, k: 'applause' });
    if (this.night >= 5) this.schedule.push({ t: 120, k: 'hand' });
    // the mascot sleeps in a far room (half of night 1s, every night after); the Intern needs a crew to hide in
    if (this.night >= 2 || r() < 0.5) { const rm = W.farRoom(W.van.x, W.van.z, r); T.spawn('mascot', rm.x0 + rm.w / 2, rm.z0 + rm.h / 2, { yaw: r() * 6.28 }); }
    if (nCrew >= 2 && this.night >= 2) this.schedule.push({ t: 100, k: 'intern' });
    if (nCrew >= 2 && this.night === 1) this.schedule.push({ t: 200, k: 'intern' });
    this.spawnR = r;
  }

  againstWall(r, rm, depth) {
    const W = this.world;
    for (let t = 0; t < 20; t++) {
      const side = Math.floor(r() * 4);
      let x, z, yaw, bx, bz;
      if (side === 0) { x = rm.x0 + 1 + r() * (rm.w - 2); z = rm.z0 + depth; yaw = Math.PI; bx = x; bz = rm.z0 - 0.5; }
      if (side === 1) { x = rm.x0 + 1 + r() * (rm.w - 2); z = rm.z0 + rm.h - depth; yaw = 0; bx = x; bz = rm.z0 + rm.h + 0.5; }
      if (side === 2) { z = rm.z0 + 1 + r() * (rm.h - 2); x = rm.x0 + depth; yaw = -Math.PI / 2; bx = rm.x0 - 0.5; bz = z; }
      if (side === 3) { z = rm.z0 + 1 + r() * (rm.h - 2); x = rm.x0 + rm.w - depth; yaw = Math.PI / 2; bx = rm.x0 + rm.w + 0.5; bz = z; }
      // not in front of a doorway
      const near = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]].some(([dx, dz]) => W.cell(bx + dx, bz + dz) === 5 || W.cell(x + dx, z + dz) === 5);
      if (!near && W.walkCell(Math.floor(x), Math.floor(z))) return { x, z, yaw };
    }
    return null;
  }

  spawnHostile(k) {
    const W = this.world, r = this.spawnR;
    // somewhere far from everyone
    let best = null, bd = -1;
    for (let i = 0; i < 12; i++) {
      const s = W.spot(r, k === 'hand' ? 'in' : 'any', 18);
      const d = Math.min(...this.living().map((P) => Math.hypot(P.x - s.x, P.z - s.z)), 99);
      if (d > bd) { bd = d; best = s; }
    }
    if (k === 'intern') { this.things.spawn('intern', best.x, best.z, { s: 5, wake: this.time, y: -10 }); return; }
    this.things.spawn(k, best.x, best.z);
    if (k === 'applause') this.sound('jingle', best.x, 2, best.z);
  }

  // ---------- host helpers (called by things / items) ----------
  sound(s, x, y, z, n = 1) { this.broadcast({ t: 'ev', k: 'snd', s, x: r2(x), y: r2(y), z: r2(z), n }); }
  event(e) { this.broadcast({ t: 'ev', ...e }); }
  noise(x, z, radius) { for (const th of this.things.list) if (th.kind === 'applause' && !th.chase && Math.hypot(th.x - x, th.z - z) < radius) { th.heard = { x, z }; if (th.s === 0) th.s = 1; } }
  // dir: which way they go flying ({x, z}, any length; stronger = further)
  knockDown(id, d, by, dir = null) {
    const P = this.players.get(id);
    if (!P || P.dead || P.down) return;
    if (!dir) { const th = this.things.byId.get(by); dir = th ? { x: P.x - th.x, z: P.z - th.z } : { x: Math.random() - 0.5, z: Math.random() - 0.5 }; }
    const dl = Math.hypot(dir.x, dir.z) || 1, f = clamp(dl / 4, 0.6, 2.5);
    P.down = true; P.downUntil = this.time + d;
    const it = this.items.heldBy(id);
    if (it) this.items.release(P, { x: P.x, y: P.y + 1, z: P.z, vx: (Math.random() - 0.5) * 3, vy: 3, vz: (Math.random() - 0.5) * 3 });
    this.event({ k: 'down', id, d, by, dx: r2(dir.x / dl * f), dz: r2(dir.z / dl * f) });
  }
  kill(id, by) {
    const P = this.players.get(id);
    if (!P || P.dead) return;
    P.dead = true; P.down = false; P.y = 0;
    const it = this.items.heldBy(id);
    if (it) this.items.release(P, { x: P.x, y: P.y + 1, z: P.z, vy: 2 });
    const th = this.things.byId.get(by), dx = th ? P.x - th.x : 0, dz = th ? P.z - th.z : 0, dl = Math.hypot(dx, dz) || 1;
    this.event({ k: 'dead', id, by, dx: r2(dx / dl * 1.5), dz: r2(dz / dl * 1.5) });
  }
  stealFrom(id, th) {
    const it = this.items.heldBy(id);
    if (!it) return false;
    it.holder = 'T' + th.id;
    this.event({ k: 'steal', th: th.id, id, item: it.id });
    return true;
  }
  dropFromThing(th) {
    const it = this.items.carriedBy('T' + th.id);
    if (!it) return;
    Object.assign(it, { holder: '', x: th.x, z: th.z, y: 0.6, vx: 0, vy: 2, vz: 0, rest: false });
  }

  // ---------- network ----------
  send(m) { this.net.send(m); }
  broadcast(m) { if (this.isHost) this.net.broadcast(m); }

  hostHandle(m, from) {
    const P = this.players.get(from);
    if (m.t === 'quit') { this.dropPlayer(m.id); return; }
    if (!P) return;
    switch (m.t) {
      case 'st': {
        if (from === this.myId) return;
        P.emote = EMOTES[(m.e | 0) - 1] || null;
        if (P.dead) { P.v = clamp(m.v || 0, 0, 1); break; } // a body goes where the host says
        const dt = Math.max(0.03, (performance.now() - (P.stAt || 0)) / 1000); P.stAt = performance.now();
        P.vx = clamp((m.x - P.x) / dt, -9, 9); P.vz = clamp((m.z - P.z) / dt, -9, 9);
        Object.assign(P, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, v: clamp(m.v || 0, 0, 1) });
        this.flagsIn(P, m.f);
        break;
      }
      case 'grab': if (!P.carrying && this.items.grab(P, m.id)) this.sound('grab', P.x, 1, P.z); break;
      case 'carry': this.bodies.hostCarry(P, m.id); break;
      case 'bodyDrop': this.bodies.hostDrop(P, m); break;
      case 'don': this.dons.hostClaim(P, m); break;
      case 'drop': { const it = this.items.release(P, m); if (it && Math.hypot(m.vx || 0, m.vz || 0) > 5) this.sound('whoosh', P.x, 1.3, P.z); break; }
      case 'film': {
        const it = this.items.byId.get(m.id);
        if (it && it.kind === 'cam' && it.holder === from) { it.tape += clamp(+m.p || 0, 0, 1500); it.batt = clamp(+m.b, 0, 100); }
        break;
      }
      case 'leave': if (!this.over && this.time > 20 && this.everyoneIn()) this.end('leave'); break;
    }
  }
  flagsIn(P, f) { P.aim = !!(f & 1); P.flash = !!(f & 2); P.run = !!(f & 4); P.wave = !!(f & 8); P.nv = !!(f & 16); }
  flagsOut(P) { return (P.aim ? 1 : 0) | (P.flash ? 2 : 0) | (P.run ? 4 : 0) | (P.wave ? 8 : 0) | (P.nv ? 16 : 0); }

  everyoneIn() { const L = this.living(); return L.length > 0 && L.every((P) => this.world.inVan(P.x, P.z)); }

  dropPlayer(id) {
    const P = this.players.get(id);
    if (!P || id === this.myId) return;
    const it = this.items.heldBy(id);
    if (it) this.items.release(P, { x: P.x, y: 1, z: P.z });
    this.event({ k: 'left', id });
  }

  onNet(m, from) {
    if (m.t === 'snap') return this.applySnap(m);
    if (m.t === 'ev') return this.onEvent(m);
    if (m.t === 'end') { this.finish(m); return; }
    if (this.isHost) this.hostHandle(m, from);
  }

  applySnap(m) {
    if (!this.isHost) this.left = m.l;
    for (const [id, x, y, z, yaw, pitch, f, v, dn, dd, e, car, cing] of m.p) {
      const P = this.players.get(id);
      if (!P) continue;
      if (!this.isHost && id !== this.myId) { Object.assign(P, { x, y, z, yaw, pitch, v }); this.flagsIn(P, f); P.emote = EMOTES[e - 1] || null; }
      if (!this.isHost && id === this.myId && dd) Object.assign(P, { x, y, z }); // my body: where the host has it
      if (!this.isHost) { P.down = !!dn; P.dead = !!dd; P.carrier = car || null; P.carrying = cing || null; }
    }
    if (m.r !== undefined) this.rain.snapIn(m.r);
    this.things.applySnap(m.th);
    this.items.applySnap(m.it);
    this.nightViews = this.items.list.reduce((s, i) => s + (i.kind === 'cam' ? i.tape : 0), 0);
  }

  onEvent(e) {
    const me = this.me;
    if (e.k === 'snd') { this.sfx.play(e.s, { x: e.x, y: e.y, z: e.z }, e.n); if (this.isHost && e.s === 'hit') this.noise(e.x, e.z, 12); return; }
    if (e.k === 'down') {
      const P = this.players.get(e.id); if (P) P.down = true;
      if (e.id === this.myId) { this.p.downT = e.d; this.p.emote = null; this.sfx.play('thud', null); this.hud.down.classList.add('on'); this.me.vx += (e.dx || 0) * 4; this.me.vz += (e.dz || 0) * 4; this.p.vy = 3; this.p.ground = false; this.p.rollDir = Math.sign((e.dx || 0) * Math.cos(this.me.yaw) - (e.dz || 0) * Math.sin(this.me.yaw)) || 1; this.input.rumble(0.7, 0.5, 250); }
      else if (P) { this.sfx.play('thud', { x: P.x, y: 0.5, z: P.z }); P.model?.knock(e.dx || 0, e.dz || 0); }
    }
    if (e.k === 'dead') {
      const P = this.players.get(e.id); if (P) { P.dead = true; P.down = false; P.model?.knock(e.dx || 0, e.dz || 0); }
      if (e.id === this.myId) { this.sfx.play('sting'); this.toast(this.crewSize() > 1 ? 'You got taken. Dead crew can still talk to each other.' : 'You got taken.', 6); this.p.spec = 0; this.p.deathT = 0; this.killer = e.by; this.input.rumble(1, 1, 500); }
      else if (P) this.toast(`${P.name} is gone.`, 3);
    }
    if (e.k === 'revive') {
      const P = this.players.get(e.id);
      if (P) { P.dead = false; P.down = false; P.carrier = null; P.x = P.rx = e.x; P.z = P.rz = e.z; P.y = 0; }
      if (e.id === this.myId) { Object.assign(this.p, { downT: 0, deathT: 99, emote: null, vy: 0 }); this.killer = null; this.hud.spec.hidden = true; this.hud.down.classList.remove('on'); this.toast("You're back! The crew dragged you to the van.", 4); this.sfx.play('big'); noteRevive(); }
      else if (P) this.toast(`${P.name} is back!`, 3);
    }
    if (e.k === 'rain') this.rain.onEvent(e);
    if (e.k === 'exposed') { this.toast('That is NOT one of the crew!!', 3); this.sfx.play('sting'); }
    if (e.k === 'req' || e.k === 'reqDone' || e.k === 'reqEnd') this.dons.onEvent(e);
    if (e.k === 'steal' && e.id === this.myId) this.toast('The hand took it! Get it back (throw something at it).', 4);
    if (e.k === 'left') { const P = this.players.get(e.id); if (P) { if (P.model) this.scene.remove(P.model.root); this.players.delete(e.id); this.toast(`${P.name} left.`, 3); } }
    this.cam.moment(e);
  }

  // ---------- every frame ----------
  frame(dt) {
    if (!this.over) this.time += dt;
    this.controls(dt);
    if (this.isHost && !this.over) this.hostTick(dt);
    else if (!this.isHost) {
      this.stT -= dt;
      if (this.stT <= 0) { this.stT = 1 / 15; const me = this.me; this.send({ t: 'st', x: r2(me.x), y: r2(me.y), z: r2(me.z), yaw: r2(me.yaw), pitch: r2(me.pitch), f: this.flagsOut(me), v: r2(me.v), e: EMOTES.indexOf(me.emote) + 1 }); }
    }
    this.drawPlayers(dt);
    this.things.render(dt);
    this.items.render(dt);
    this.rain.update(dt);
    this.events.update(dt);
    this.viewModel(dt);
    this.voices();
    this.updateHud(dt);
  }

  hostTick(dt) {
    this.left -= dt;
    while (this.schedule.length && this.time >= this.schedule[0].t) this.spawnHostile(this.schedule.shift().k);
    this.schedule.sort((a, b) => a.t - b.t);
    for (const P of this.players.values()) {
      if (P.down && this.time > P.downUntil) P.down = false;
      const it = this.items.heldBy(P.id); // (the hand goes for whoever carries something)
      P.holding = !!it; P.holdingCam = it?.kind === 'cam';
    }
    this.things.hostUpdate(dt);
    this.items.hostUpdate(dt);
    this.bodies.hostTick(dt);
    this.rain.hostTick(dt);
    this.dons.hostTick(dt);
    if (this.left <= 0) this.end('time');
    else if (!this.living().length) { this.endT = (this.endT ?? 4) - dt; if (this.endT <= 0) this.end('dead'); }
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 1 / 15;
      const p = [...this.players.values()].map((P) => [P.id, r2(P.x), r2(P.y), r2(P.z), r2(P.yaw), r2(P.pitch), this.flagsOut(P), r2(P.v), P.down ? 1 : 0, P.dead ? 1 : 0, EMOTES.indexOf(P.emote) + 1, P.carrier || '', P.carrying || '']);
      this.broadcast({ t: 'snap', l: Math.round(this.left * 10) / 10, r: this.rain.snapOut(), p, th: this.things.snap(), it: this.items.snap() });
    }
  }

  end(reason) {
    if (this.over) return;
    const W = this.world;
    // anyone still outside when the van leaves is left behind
    if (reason === 'time') for (const P of this.living()) if (!W.inVan(P.x, P.z)) this.kill(P.id, 'left');
    const cams = this.items.list.filter((i) => i.kind === 'cam').map((i) => {
      const P = i.holder && this.players.get(i.holder);
      const saved = P ? !P.dead && W.inVan(P.x, P.z) : !i.holder && W.inVan(i.x, i.z);
      return { id: i.id, tape: Math.round(i.tape), saved: !!saved };
    });
    const msg = {
      t: 'end', reason,
      views: cams.filter((c) => c.saved).reduce((s, c) => s + c.tape, 0),
      lost: cams.filter((c) => !c.saved).reduce((s, c) => s + c.tape, 0),
      cams, survivors: this.living().map((P) => P.id), dead: [...this.players.values()].filter((P) => P.dead).map((P) => P.id),
    };
    this.broadcast(msg);
  }

  finish(m) {
    if (this.over) return;
    this.over = true;
    this.cam.update(0, false, false);
    this.sfx.play(m.reason === 'leave' || m.reason === 'time' ? 'van' : 'sting');
    this.onEnd(m);
  }

  // ---------- me ----------
  controls(dt) {
    const I = this.input, me = this.me, p = this.p, W = this.world, pad = I.pad;
    const sens = (this.settings.sens || 1) * 0.0022;
    if (!this.over) { me.yaw -= I.dx * sens; me.pitch = clamp(me.pitch - I.dy * sens, -1.45, 1.45); }
    me.v = this.micLevel();
    if (this.over) return;
    if (me.dead) { this.spectate(dt); return; }
    // knocked down
    if (p.downT > 0) {
      p.downT -= dt;
      if (p.downT <= 0) { this.hud.down.classList.remove('on'); me.down = false; }
    }
    const down = p.downT > 0 || me.down;
    const held = this.items.carriedBy(this.myId);
    const body = me.carrying && this.players.get(me.carrying);
    const k = (c) => I.down(c);
    let mx = 0, mz = 0;
    if (!down) {
      mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0) + (pad ? pad.mx : 0);
      mz = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0) + (pad ? pad.mz : 0);
    }
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    const aimWant = !down && !body && (I.rmb || (pad && pad.aim));
    const wantRun = !down && (k('ShiftLeft') || k('ShiftRight') || (pad && pad.sprint)) && mz > 0.3 && !this.cam.aiming;
    const run = wantRun && p.stam > 0 && !p.tired;
    p.stam = clamp(p.stam + (run ? -22 : 14) * dt - (this.rain.outside ? 30 * dt : 0), 0, 100);
    if (p.stam <= 0) p.tired = true; if (p.tired && p.stam > 35) p.tired = false;
    let speed = run ? RUN : WALK;
    if (held && held.kind !== 'cam') speed *= 0.88;
    if (body) speed *= 0.72;
    if (this.cam.aiming) speed *= 0.6;
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const wx = (rx * mx + fx * mz) * speed, wz = (rz * mx + fz * mz) * speed;
    const acc = p.ground ? 14 : 3;
    me.vx += (wx - me.vx) * Math.min(1, acc * dt); me.vz += (wz - me.vz) * Math.min(1, acc * dt);
    if (down) { me.vx *= Math.exp(-dt * 4); me.vz *= Math.exp(-dt * 4); }
    if (!down && p.ground && (I.hit('Space') || (pad && pad.jump))) { p.vy = JUMP; p.ground = false; }
    p.vy -= GRAV * dt; me.y += p.vy * dt;
    if (me.y <= 0) { if (!p.ground && p.vy < -6) this.sfx.play('jumpLand', null); me.y = 0; p.vy = 0; p.ground = true; }
    me.x += me.vx * dt; me.z += me.vz * dt;
    const pos = { x: me.x, z: me.z };
    W.collide(pos, 0.32);
    for (const th of this.things.byId.values()) { const r = BLOCKERS[th.kind]; if (!r) continue; const dx = pos.x - th.rx, dz = pos.z - th.rz, d = Math.hypot(dx, dz); if (d < r + 0.32 && d > 1e-4) { pos.x = th.rx + (dx / d) * (r + 0.32); pos.z = th.rz + (dz / d) * (r + 0.32); } }
    for (const P of this.players.values()) { if (P === me || P.dead) continue; const dx = pos.x - P.rx, dz = pos.z - P.rz, d = Math.hypot(dx, dz); if (d < 0.6 && d > 1e-4) { pos.x += (dx / d) * (0.6 - d) * 0.5; pos.z += (dz / d) * (0.6 - d) * 0.5; } }
    W.collide(pos, 0.32);
    me.x = pos.x; me.z = pos.z; me.rx = me.x; me.rz = me.z;
    me.run = run && Math.hypot(me.vx, me.vz) > 4;
    // footsteps
    const sp = Math.hypot(me.vx, me.vz);
    if (p.ground) { p.stepD += sp * dt; if (p.stepD > (run ? 1.9 : 1.5)) { p.stepD = 0; this.sfx.play('step', null, run ? 0.8 : 0.45); if (run && this.isHost) this.noise(me.x, me.z, 9); } }
    p.bob += sp * dt * 2.3;
    // buttons
    if (!down) {
      if (I.hit('KeyF') || (pad && pad.light)) { p.flash = !p.flash; this.sfx.play('click'); }
      const target = body ? null : this.lookTarget();
      if ((I.hit('KeyE') || (pad && pad.use)) && target && !held) {
        if (target.kind === 'body') this.send({ t: 'carry', id: target.P.id }); else this.send({ t: 'grab', id: target.id });
      }
      if (body && (I.hit('KeyQ') || (pad && pad.drop))) this.dropBody(2);
      if (body && (I.lmbHit || (pad && pad.throw))) this.dropBody(8);
      if (held && (I.hit('KeyQ') || (pad && pad.drop))) this.throwIt(held, 2.5);
      if (held && held.kind !== 'cam' && (I.lmbHit || (pad && pad.throw))) this.throwIt(held, 13);
      if (held && held.kind === 'cam' && !this.cam.aiming && (I.lmbHit || (pad && pad.throw))) this.throwIt(held, 9);
      // the van: hold E with everyone in
      const inVan = W.inVan(me.x, me.z), holdE = k('KeyE') || (pad && pad.useHeld);
      if (inVan && holdE && !target && this.time > 20) { p.holdE += dt; if (p.holdE > 1.2) { p.holdE = -99; this.send({ t: 'leave' }); } }
      else if (p.holdE > 0 || !holdE) p.holdE = 0;
    }
    // emotes
    const chose = this.wheel.update(down || me.dead);
    if (chose) { p.emote = chose; p.emoteT = EMOTE_SECS[chose]; if (chose === 'scream') this.sfx.play('squeak', null); }
    p.emoteT -= dt;
    if (p.emote && (p.emoteT <= 0 || down || ((p.emote === 'dance' || p.emote === 'sit') && (Math.hypot(mx, mz) > 0.2 || !p.ground)))) p.emote = null;
    me.emote = p.emote; me.wave = p.emote === 'wave';
    me.flash = p.flash;
    this.cam.update(dt, aimWant, !down && (I.hit('KeyN') || (pad && pad.nv)));
    me.aim = this.cam.aiming; me.nv = this.cam.nv;
    // camera
    const eyeT = down ? 0.35 : p.emote === 'sit' ? EYE - 0.4 : EYE - (this.cam.aiming ? 0.05 : 0);
    p.eye += (eyeT - p.eye) * Math.min(1, dt * (down ? 9 : 6));
    p.roll += ((down ? 0.9 * (p.rollDir || 1) : 0) - p.roll) * Math.min(1, dt * 7);
    const bob = p.ground ? Math.sin(p.bob) * 0.04 * clamp(sp / 3, 0, 1) : 0;
    this.camera.position.set(me.x, me.y + p.eye + bob, me.z);
    this.camera.rotation.set(me.pitch, me.yaw, p.roll);
    const fov = (this.settings.fov || 75) * (this.cam.aiming ? 0.8 : 1);
    if (Math.abs(this.camera.fov - fov) > 0.1) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10); this.camera.updateProjectionMatrix(); }
    this.flash.intensity = p.flash ? 14 * this.events.lampK() : 0;
    this.sfx.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, me.yaw);
    this.sfx.ambient(dt, W.indoor(me.x, me.z));
  }

  throwIt(it, power) {
    const me = this.me, cp = Math.cos(me.pitch);
    const dx = -Math.sin(me.yaw) * cp, dy = Math.sin(me.pitch), dz = -Math.cos(me.yaw) * cp;
    const c = this.camera.position;
    this.send({ t: 'drop', id: it.id, x: r2(c.x + dx * 0.6), y: r2(c.y + dy * 0.6 - 0.15), z: r2(c.z + dz * 0.6), vx: r2(dx * power + me.vx * 0.5), vy: r2(dy * power + (power > 5 ? 2.2 : 1)), vz: r2(dz * power + me.vz * 0.5) });
    if (power > 5) this.sfx.play('whoosh', null);
    this.cam.update(0, false, false);
  }

  dropBody(power) {
    const me = this.me, cp = Math.cos(me.pitch);
    const dx = -Math.sin(me.yaw) * cp, dz = -Math.cos(me.yaw) * cp;
    this.send({ t: 'bodyDrop', vx: r2(dx * power + me.vx * 0.5), vy: r2(power > 4 ? 3 + Math.sin(me.pitch) * power : 0.5), vz: r2(dz * power + me.vz * 0.5) });
    if (power > 4) this.sfx.play('whoosh', null);
  }

  // the nearest thing I could pick up, roughly where I'm looking
  lookTarget() {
    const me = this.me, c = this.camera.position, cp = Math.cos(me.pitch);
    const dx = -Math.sin(me.yaw) * cp, dy = Math.sin(me.pitch), dz = -Math.cos(me.yaw) * cp;
    let best = null, bs = 0;
    for (const it of this.items.byId.values()) {
      if (it.holder) continue;
      const vx = it.rx - c.x, vy = it.ry - c.y, vz = it.rz - c.z, d = Math.hypot(vx, vy, vz);
      if (d > 2.6 || Math.hypot(vx, vz) > 2.3) continue;
      const dot = (vx * dx + vy * dy + vz * dz) / d;
      const s = dot - d * 0.08 + (it.kind === 'cam' ? 0.05 : 0);
      if (dot > 0.82 && s > bs) { bs = s; best = it; }
    }
    // a friend's body
    for (const P of this.players.values()) {
      if (!P.dead || P.carrier || P.id === this.myId) continue;
      const vx = P.rx - c.x, vy = 0.3 - c.y, vz = P.rz - c.z, d = Math.hypot(vx, vy, vz);
      if (Math.hypot(vx, vz) > 2.4) continue;
      const dot = (vx * dx + vy * dy + vz * dz) / d, s = dot - d * 0.08 + 0.1;
      if (dot > 0.7 && s > bs) { bs = s; best = { kind: 'body', P }; }
    }
    return best;
  }

  spectate(dt) {
    const I = this.input, pad = I.pad, p = this.p;
    const alive = this.living();
    // first, a few seconds on the floor watching whatever got you take its bow
    p.deathT = (p.deathT ?? 99) + dt;
    const K = this.things.byId.get(this.killer);
    if (p.deathT < 4.5 && K) {
      const me = this.me, dx = me.x - K.rx, dz = me.z - K.rz, d = Math.hypot(dx, dz) || 1;
      this.camera.position.set(me.x + (dx / d) * 0.9, 0.45, me.z + (dz / d) * 0.9);
      this.camera.up.set(Math.sin(p.deathT) * 0.2, 1, 0);
      this.camera.lookAt(K.rx, { applause: 2.2, mascot: 1.9, intern: 1.1 }[K.kind] ?? 0.4, K.rz);
      this.camera.up.set(0, 1, 0);
      this.flash.intensity = 6; this.hud.spec.hidden = true;
      this.cam.update(dt, false, false);
      const c = this.camera.position; this.sfx.setListener(c.x, c.y, c.z, this.me.yaw);
      return;
    }
    if (I.hit('Space') || (pad && pad.jump)) p.spec++;
    const T = alive.length ? alive[((p.spec % alive.length) + alive.length) % alive.length] : null;
    this.cam.update(dt, false, false);
    this.flash.intensity = 0;
    if (T) {
      const fx = -Math.sin(T.yaw), fz = -Math.cos(T.yaw);
      const want = new THREE.Vector3(T.rx - fx * 2.8, 2.3, T.rz - fz * 2.8);
      const back = { x: want.x, z: want.z };
      if (!this.world.los(T.rx, T.rz, back.x, back.z)) { want.x = T.rx - fx * 0.6; want.z = T.rz - fz * 0.6; }
      this.camera.position.lerp(want, Math.min(1, dt * 5));
      this.camera.lookAt(T.rx, 1.3, T.rz);
      this.hud.spec.textContent = `Watching ${T.name} · ${this.input.label('Space', 'A')} next`;
    } else {
      const W = this.world, a = this.time * 0.1;
      this.camera.position.set(W.van.x + Math.sin(a) * 7, 5, W.van.z - 3 + Math.cos(a) * 7);
      this.camera.lookAt(W.van.x, 1, W.van.z);
      this.hud.spec.textContent = 'Everyone is gone...';
    }
    this.hud.spec.hidden = false;
    const c = this.camera.position;
    this.sfx.setListener(c.x, c.y, c.z, Math.atan2(-(T ? T.rx - c.x : 0), -(T ? T.rz - c.z : 1)));
  }

  drawPlayers(dt) {
    const k = 1 - Math.exp(-dt * 14);
    let danger = 0;
    for (const P of this.players.values()) {
      if (P.id === this.myId) continue;
      const ox = P.rx, oz = P.rz;
      P.rx += (P.x - P.rx) * k; P.rz += (P.z - P.rz) * k; P.ry += (P.y - P.ry) * k;
      P.ryaw += angDiff(P.ryaw, P.yaw) * k;
      const sp = Math.hypot(P.rx - ox, P.rz - oz) / Math.max(dt, 1e-3);
      const it = this.items.carriedBy(P.id);
      const m = P.model;
      if (P.carrier) { P.rx = P.x; P.rz = P.z; P.ry = P.y; P.ryaw = P.yaw; } // held: no lag behind the carrier
      m.hold(it ? it.model : null);
      if (it) it.model.rotation.set(it.kind === 'cam' ? 0 : 0.3, 0, 0);
      m.root.position.set(P.rx, P.ry, P.rz); m.root.rotation.y = P.ryaw;
      m.update(dt, { speed: sp, down: P.down, dead: P.dead, carried: !!P.carrier, talk: P.dead ? 0 : P.v, aim: P.aim, holding: P.carrying ? 'body' : it ? (it.kind === 'cam' ? 'cam' : 'prop') : null, pitch: P.pitch, air: P.ry > 0.1 && !P.dead, light: P.flash && !P.dead, emote: P.emote });
      // steps
      if (!P.dead && P.ry < 0.1) { P.stepD += sp * dt; if (P.stepD > 1.6) { P.stepD = 0; this.sfx.play('step', { x: P.rx, y: 0.1, z: P.rz }, sp > 4 ? 1 : 0.6); } }
      // headlamp
      const L = this.lamps[P.slot];
      if (L) {
        L.intensity = P.flash && !P.dead ? 12 * this.events.lampK() : 0;
        m.lamp.getWorldPosition(L.position);
        const cp = Math.cos(P.pitch);
        L.target.position.set(L.position.x - Math.sin(P.ryaw) * cp * 5, L.position.y + Math.sin(P.pitch) * 5 - 0.3, L.position.z - Math.cos(P.ryaw) * cp * 5);
      }
    }
    // how close is something nasty (for the viewfinder's tearing and the red edge)
    const me = this.me;
    for (const th of this.things.byId.values()) {
      if (th.kind !== 'applause' && th.kind !== 'hand' && th.kind !== 'mascot' && th.kind !== 'intern') continue;
      if (th.ry < -5) continue;
      if (th.kind === 'intern' && th.s !== 1 && th.s !== 2) continue; // (it's one of us... right?)
      if (th.kind === 'mascot' && th.s === 0) continue;
      const d = Math.hypot(th.rx - me.x, th.rz - me.z);
      danger = Math.max(danger, clamp(1 - d / (th.kind === 'hand' ? 6 : th.kind === 'intern' ? 8 : 12), 0, 1) * (th.s === 2 || th.s === 1 ? 1 : 0.4));
    }
    this.danger = me.dead ? 0 : danger;
  }

  // what's in my hands, drawn in front of the camera
  viewModel(dt) {
    const it = this.me.dead ? null : this.items.carriedBy(this.myId);
    const kind = it ? it.kind : null;
    if (kind !== this.viewKind || (it && this.viewItemId !== it.id)) {
      if (this.viewItem) this.view.remove(this.viewItem);
      this.viewItem = kind ? makeProp(kind) : null;
      this.viewKind = kind; this.viewItemId = it?.id;
      if (this.viewItem) { this.view.add(this.viewItem); this.sfx.play('grab', null); }
    }
    if (!this.viewItem) return;
    const v = this.viewItem, t = performance.now() / 1000, sp = Math.hypot(this.me.vx, this.me.vz);
    const bob = Math.sin(this.p.bob) * 0.015 * clamp(sp / 3, 0, 1);
    if (kind === 'cam') { v.position.set(0.26, -0.24 + bob, -0.45); v.rotation.set(0.05, 0.12, 0); v.visible = !this.cam.aiming; v.userData.setRec(false); }
    else { v.position.set(0.05, -0.38 + bob, -0.75); v.rotation.set(0.2, t * 0.0, 0); v.visible = true; }
  }

  voices() {
    const vc = this.vc; if (!vc) return;
    const me = this.me;
    for (const P of this.players.values()) {
      if (P.id === this.myId) continue;
      const on = me.dead ? P.dead : !P.dead;
      const d = Math.hypot(P.rx - (me.dead ? this.camera.position.x : me.x), P.rz - (me.dead ? this.camera.position.z : me.z));
      const both = me.dead && P.dead;
      const vol = both ? 1 : clamp(1 - (d - 6) / 34, 0, 1);
      const rec = this.cam.aiming ? clamp(1 - d / 14, 0, 1) : 0;
      vc.route(P.id, { on: on && !this.over || this.over, pos: { x: P.rx, y: P.ry + 1.2, z: P.rz }, volume: this.over ? 1 : vol, occluded: !both && !this.world.los(me.x, me.z, P.rx, P.rz), rec });
    }
  }

  updateHud(dt) {
    const h = this.hud, me = this.me, W = this.world;
    // every frame: the stamina bar, the van prompt
    h.stam.style.opacity = this.p.stam < 99 ? 1 : 0;
    h.stamBar.style.width = this.p.stam + '%';
    h.stam.classList.toggle('tired', !!this.p.tired);
    h.danger.style.opacity = (this.danger * 0.9).toFixed(2);
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const left = Math.max(0, this.left);
    h.clock.textContent = this.clock();
    h.clock.classList.toggle('late', left < 60);
    h.night.textContent = `Night ${this.night} of ${this.nightOf} · ${W.name}${this.events.info ? ' · ' + this.events.info.tag : ''}`;
    h.views.textContent = `Tonight's tapes: ${fmt(this.nightViews)} views · Season ${fmt(this.seasonViews)} / ${fmt(this.quota)}`;
    if (!me.dead) h.spec.hidden = true;
    // prompt
    let prompt = '';
    const held = this.items.carriedBy(this.myId), tgt = !me.dead && !held && this.lookTarget();
    const K = (key, pad) => this.input.label(key, pad);
    if (me.dead) prompt = '';
    else if (me.carrying) prompt = `Carrying ${this.players.get(me.carrying)?.name || 'a body'} · bring them to the van to revive · ${K('LMB', 'RT')} throw · ${K('Q', 'B')} drop`;
    else if (tgt && tgt.kind === 'body') prompt = `${K('E', 'X')} carry ${tgt.P.name} (the van brings them back)`;
    else if (tgt) prompt = tgt.kind === 'cam' ? `${K('E', 'X')} pick up the camcorder (tape: ${fmt(tgt.tape)} views)` : `${K('E', 'X')} pick up the ${tgt.kind}`;
    else if (held && held.kind === 'cam') prompt = this.cam.aiming ? `${K('N', 'RB')} night vision · ${K('Q', 'B')} drop` : `${K('RMB', 'LT')} hold to film · ${K('LMB', 'RT')} throw · ${K('Q', 'B')} drop`;
    else if (held) prompt = `${K('LMB', 'RT')} throw · ${K('Q', 'B')} drop`;
    if (!me.dead && W.inVan(me.x, me.z) && !tgt && !me.carrying && this.time > 20) {
      const all = this.everyoneIn();
      prompt = all ? `Hold ${K('E', 'X')} to drive away${this.p.holdE > 0 ? ' ' + '▮'.repeat(Math.ceil(this.p.holdE / 0.2)) : ''}` : 'Everyone still alive has to be at the van to leave.';
    }
    if (this.rain.outside) prompt = (prompt ? prompt + ' · ' : '') + '🩸 get under a roof!';
    this.dons.hud();
    h.prompt.textContent = prompt;
    h.prompt.hidden = !prompt;
    // the van arrow: with Tab, or in the last minute
    const showVan = (this.input.down('Tab') || this.input.pad?.tab || left < 60) && !me.dead;
    h.van.hidden = !showVan;
    if (showVan) {
      const dx = W.van.x - me.x, dz = W.van.z - me.z, d = Math.hypot(dx, dz);
      const a = angDiff(me.yaw, Math.atan2(-dx, -dz));
      h.van.innerHTML = `<span style="display:inline-block;transform:rotate(${(-a * 180 / Math.PI).toFixed(0)}deg)">⬆</span> VAN ${Math.round(d)} m`;
    }
    // Tab: the crew
    const tab = this.input.down('Tab') || this.input.pad?.tab;
    h.tab.hidden = !tab;
    if (tab) {
      h.crew.innerHTML = [...this.players.values()].map((P) => {
        const st = P.dead ? (P.carrier ? 'being carried' : 'gone') : P.down ? 'knocked over' : W.inVan(P.x, P.z) ? 'at the van' : 'out there';
        const it = this.items.carriedBy(P.id);
        return `<div class="${P.dead ? 'dead' : ''}"><i style="background:#${new THREE.Color(colorOf(P.color)).getHexString()}"></i>${esc(P.name)}<span>${st}${it ? ' · ' + (it.kind === 'cam' ? '📹' : it.kind) : ''}</span></div>`;
      }).join('') + this.items.list.filter((i) => i.kind === 'cam').map((i) => `<div class="tape">📼 Tape ${i.id}: ${fmt(i.tape)} views · ${Math.round(i.batt)}% battery</div>`).join('');
    }
  }

  toast(text, secs = 3) {
    const t = this.hud.toast;
    t.textContent = text; t.classList.add('on');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('on'), secs * 1000);
  }

  render() {
    if (this.cam.aiming) this.cam.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    this.cam.afterRender();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.cam.resize();
  }

  dispose() {
    this.over = true;
    this.cam.dispose();
    this.things.dispose(); this.items.dispose();
    this.rain.dispose(); this.dons.dispose(); this.wheel.dispose(); this.events.dispose();
    this.sfx.stopAmbient();
    this.hud.root.hidden = true;
    this.hud.down.classList.remove('on');
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

import { COLORS } from './models.js';
const colorOf = (i) => COLORS[i % COLORS.length];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
