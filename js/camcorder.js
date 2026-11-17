// Filming: hold right click with the camcorder to raise it. The view goes through the viewfinder (grain, REC,
// optional night vision), the battery runs down, and whatever weird is in frame earns views for that tape.
// Views are worked out here, on the filming player's browser, and sent to the host as 'film' {id, p, b}.
import * as THREE from 'three';
import { KINDS } from './things.js';
import { TapeRec, TAPE_FPS } from './tape.js';
import { clamp, fmt } from './util.js';
import { say, username, userColor } from './chat.js';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
uniform sampler2D tDiffuse; uniform float time; uniform float nv; uniform float low; uniform float hit;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 37.0) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 - 0.035 * dot(c, c));                     // a little lens bulge
  float tear = step(0.985 - hit * 0.2, h(vec2(floor(uv.y * 80.0), floor(time * 9.0))));
  uv.x += tear * 0.012 * (h(vec2(uv.y, time)) - 0.5);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(0.0018, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(0.0018, 0.0)).b;
  if (nv > 0.5) {
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    l = pow(clamp(l * 6.0, 0.0, 4.0), 0.7);
    col = vec3(0.25, 1.0, 0.35) * l;
  } else col *= 1.35; // the camcorder's auto gain
  col += (h(uv * 400.0) - 0.5) * (nv > 0.5 ? 0.18 : 0.07);
  col *= 0.94 + 0.06 * sin(uv.y * 900.0);
  col *= 1.0 - 0.55 * dot(c, c) * 2.0;
  col *= 1.0 - low * step(0.5, fract(time * 2.0)) * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Camcorder {
  constructor(game) {
    this.g = game;
    this.aiming = false; this.nv = false;
    this.fresh = new Map();          // thing id -> how fresh it still is (filming the same thing pays less and less)
    this.tickT = 0; this.sendT = 0; this.frameT = 0; this.pending = 0;
    this.rate = 0; this.viewers = 0; this.chatT = 1; this.quiet = 0;
    this.lastTag = 'idle'; this.frameTags = new Set(); this.framePts = 0;
    this.recSecs = 0;
    this.tape = game.tape;           // TapeRec, kept across nights by main.js
    this.el = {
      vf: document.getElementById('vf'), rec: document.getElementById('vfRec'), batt: document.getElementById('vfBatt'),
      live: document.getElementById('vfLive'), chat: document.getElementById('chat'), pops: document.getElementById('pops'), nv: document.getElementById('vfNv'), tape: document.getElementById('vfTape'),
    };
    this.el.chat.innerHTML = '';
    const size = game.renderer.getDrawingBufferSize(new THREE.Vector2());
    // the viewfinder renders at 60% resolution: it's a grainy camcorder picture anyway
    this.rt = new THREE.WebGLRenderTarget(Math.ceil(size.x * 0.6), Math.ceil(size.y * 0.6), { type: THREE.HalfFloatType });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, time: { value: 0 }, nv: { value: 0 }, low: { value: 0 }, hit: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    }));
    this.quad.frustumCulled = false;
    this.post = new THREE.Scene(); this.post.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.v = new THREE.Vector3();
  }

  resize() {
    const size = this.g.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(Math.ceil(size.x * 0.6), Math.ceil(size.y * 0.6));
  }

  // my camcorder item, if I'm holding one
  myCam() { const it = this.g.items.carriedBy(this.g.myId); return it && it.kind === 'cam' ? it : null; }

  update(dt, wantAim, toggleNv) {
    const g = this.g, cam = this.myCam(), me = g.me;
    const can = cam && me && !me.dead && !me.down && cam.batt > 0;
    const aim = !!(can && wantAim);
    if (aim !== this.aiming) {
      this.aiming = aim;
      g.sfx.play(aim ? 'recOn' : 'recOff');
      if (aim) { this.tape.start(cam.id); this.addChat(say(this.viewers < 5 ? 'idle' : 'idle')); }
      else this.tape.stop();
    }
    this.el.vf.classList.toggle('on', this.aiming);
    document.body.classList.toggle('filming', this.aiming);
    if (!cam && this.pending) this.flush(null);
    if (!this.aiming) { this.rate *= Math.exp(-dt * 0.5); return; }
    if (toggleNv) { this.nv = !this.nv; g.sfx.play('click'); if (this.nv) this.addChat(say('nv')); }
    // battery (mine to run down while I hold it; the host keeps the number)
    cam.batt = Math.max(0, cam.batt - dt * (this.nv ? 0.6 : 0.32) - (g.rain?.outside ? dt * 2.2 : 0)); // blood rain eats batteries
    this.recSecs += dt;
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = 0.2; this.tick(cam); }
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 1; this.flush(cam); }
    // chat
    this.chatT -= dt;
    if (this.chatT <= 0) {
      const busy = this.rate > 20;
      this.chatT = busy ? 0.5 + Math.random() * 0.9 : 1.4 + Math.random() * 2.2;
      this.quiet = this.rate < 4 ? this.quiet + 1 : 0;
      this.addChat(say(this.quiet > 3 ? 'bored' : busy ? this.lastTag : Math.random() < 0.4 ? this.lastTag : 'idle'));
    }
    // viewfinder text (10 times a second is plenty)
    this.uiT = (this.uiT || 0) - dt;
    if (this.uiT > 0) { this.frameT -= dt; return; }
    this.uiT = 0.1;
    const s = Math.floor(this.recSecs), mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    this.el.rec.textContent = `● REC  ${mm}:${ss}`;
    const b = Math.ceil(cam.batt);
    this.el.batt.textContent = `${'▮'.repeat(Math.ceil(b / 25))}${'▯'.repeat(4 - Math.ceil(b / 25))} ${b}%`;
    this.el.batt.classList.toggle('low', b < 20);
    this.viewers += ((this.rate * 9 + 2 + (g.nightViews || 0) / 40) - this.viewers) * Math.min(1, dt * 0.8);
    this.el.live.textContent = `LIVE · 👁 ${fmt(Math.max(1, this.viewers + Math.sin(g.time * 3) * 2))}`;
    this.el.nv.style.display = this.nv ? '' : 'none';
    this.el.tape.textContent = `TAPE ${cam.id} · ${fmt(cam.tape + this.pending)} views`;
    // frames for the highlight reel
    this.frameT -= dt;
  }

  // after rendering: grab a frame for the tape now and then
  afterRender() {
    if (!this.aiming || this.frameT > 0) return;
    this.frameT = 1 / TAPE_FPS;
    this.tape.frame(this.g.renderer.domElement, this.framePts, [...this.frameTags], this.g.stamp(), this.nv);
    this.framePts = 0; this.frameTags.clear();
  }

  // Is a world point in frame? -> its distance from the centre (0..1) or -1.
  inFrame(x, y, z) {
    const v = this.v.set(x, y, z).project(this.g.camera);
    if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) return -1;
    return Math.max(Math.abs(v.x), Math.abs(v.y));
  }
  visible(x, y, z) {
    const c = this.g.camera.position, d = Math.hypot(x - c.x, z - c.z);
    if (d > 30) return -1;
    const f = this.inFrame(x, y, z);
    if (f < 0) return -1;
    if (d > 0.8 && !this.g.world.los(c.x, c.z, x, z)) return -1;
    return f;
  }
  // is it lit (my light, a friend's light, night vision, or it glows)?
  lit(x, z, glows) {
    if (this.nv || glows) return 1;
    for (const P of this.g.players.values()) {
      if (!P.flash || P.dead) continue;
      const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
      if (d < 3) return 1;
      if (d < 16) { const a = Math.atan2(-dx, -dz) - P.yaw; const w = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(w) < 0.5) return 1; }
    }
    if (this.g.world.inVan(x, z)) return 1;
    return 0.35;
  }

  tick(cam) {
    const g = this.g, c = g.camera.position;
    let pts = 0, best = 0, tag = null;
    const tags = new Set(), seen = [];
    const add = (p, t) => { pts += p; tags.add(t); if (p > best) { best = p; tag = t; } };
    for (const th of g.things.byId.values()) {
      if (!(th.ry > -5)) continue;
      const K = KINDS[th.kind], hy = K.hy ?? (th.kind === 'hand' ? 0.3 : th.kind === 'balloon' ? th.ry : th.kind === 'applause' ? 1.9 : th.kind === 'chair' ? 1.2 : 0.9);
      const f = this.visible(th.rx, hy, th.rz);
      const fr = this.fresh.get(th.id) ?? 1;
      if (f < 0) { this.fresh.set(th.id, Math.min(1, fr + 0.0018)); continue; } // ~2 minutes to be fresh again
      const d = Math.hypot(th.rx - c.x, th.rz - c.z);
      seen.push({ kind: th.kind, d });
      const near = clamp(1.5 - d / 14, 0.25, 1.3), frame = 1 - f * 0.55;
      const glows = th.kind === 'tv' && th.s || th.kind === 'balloon' || th.kind === 'applause' && (th.s === 3 || th.s === 5);
      const p = K.worth * K.act(th, g.time) * frame * near * this.lit(th.rx, th.rz, glows) * fr * 0.2;
      this.fresh.set(th.id, Math.max(0.12, fr - (th.kind === 'applause' ? 0.012 : 0.03)));
      let t = th.kind;
      if (th.kind === 'applause') t = th.s === 3 ? 'pose' : th.s === 2 ? 'chase' : 'applause';
      if (th.kind === 'hand' && th.s === 2) t = 'steal';
      if (th.kind === 'intern' && th.s !== 2) { if (th.s === 5) continue; t = 'intern'; }
      if (th.kind === 'mascot' && th.s === 2) t = 'mascotFreeze';
      add(p, t);
    }
    for (const P of g.players.values()) {
      if (P.id === g.myId) continue;
      const f = this.visible(P.x, P.y + 1, P.z);
      if (f < 0) continue;
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      if (P.dead) { add(1, 'body'); continue; }
      if (d > 14) continue;
      if (P.v > 0.12) add(14 * 0.2 * Math.min(1, P.v * 3), 'scream');
      if (P.down) add(18 * 0.2, 'fall');
      if (P.emote) add((P.emote === 'dance' ? 7 : 5) * 0.2, P.emote === 'dance' || P.emote === 'flex' ? 'dance' : P.emote === 'scream' ? 'scream' : P.emote === 'sit' ? 'idle' : 'wave');
      if (P.carrying) add(4 * 0.2, 'carry');
    }
    if (g.me && g.me.v > 0.1) add(3 * 0.2, 'narrate');
    // out in the blood rain: everything is worth double
    if (g.rain?.exposed(c.x, c.z)) { pts *= 2; add(2 * 0.2, 'rain'); }
    pts *= g.events?.mult || 1; // fog x1.3, blood moon x2
    if (g.events?.kind === 'bloodmoon' || g.events?.kind === 'fog') tags.add(g.events.kind);
    if (this.nv) tags.add('nv');
    if (!Number.isFinite(pts)) pts = 0;
    g.dons?.progress(0.2, tags, seen);
    this.rate += (pts * 5 - this.rate) * 0.25;
    if (tag) { this.lastTag = tag; this.frameTags.add(tag); }
    this.pending += pts; this.framePts += pts;
    if (pts > 6) this.pop(`+${Math.round(pts)}`, false);
  }

  // A one-off moment (the host's events): worth a lot if it happens in frame.
  moment(ev) {
    if (!this.aiming) return;
    const g = this.g;
    let at = null, worth = 0, tag = null;
    if (ev.k === 'dead') { const P = g.players.get(ev.id); if (P) { at = [P.x, P.y + 0.6, P.z]; worth = 450; tag = 'kill'; } }
    if (ev.k === 'down') { const P = g.players.get(ev.id); if (P && ev.id !== g.myId) { at = [P.x, P.y + 0.8, P.z]; worth = 45; tag = String(ev.by).startsWith('p:') ? 'bonk' : 'fall'; } }
    if (ev.k === 'steal') { const th = g.things.byId.get(ev.th); if (th) { at = [th.rx, 0.3, th.rz]; worth = 120; tag = 'steal'; } }
    if (ev.k === 'pop') { const th = g.things.byId.get(ev.id); if (th) { at = [th.rx, th.ry, th.rz]; worth = 50; tag = 'pop'; } }
    if (ev.k === 'revive') { const P = g.players.get(ev.id); if (P) { at = [ev.x, 1, ev.z]; worth = 220; tag = 'revive'; } }
    if (ev.k === 'exposed') { const th = g.things.byId.get(ev.id); if (th) { at = [th.rx, 1.1, th.rz]; worth = 160; tag = 'exposed'; } }
    if (ev.k === 'struck') { const th = g.things.byId.get(ev.id); if (th) { at = [th.rx, 1.2, th.rz]; worth = th.kind === 'applause' ? 90 : 50; tag = 'bonk'; } }
    if (!at || this.visible(...at) < 0) return;
    const cam = this.myCam();
    if (!cam) return;
    this.pending += worth; this.framePts += worth; this.frameTags.add(tag); this.lastTag = tag;
    g.dons?.moment(tag);
    this.pop(`+${worth} ${tag === 'kill' ? 'VIRAL MOMENT' : tag.toUpperCase()}`, true);
    g.sfx.play('big');
    for (let i = 0; i < 3; i++) setTimeout(() => this.addChat(say(tag)), i * 250);
  }

  flush(cam) {
    if (!cam) { this.pending = 0; return; } // (sent every second while filming, even with no views: it carries the battery)
    this.g.send({ t: 'film', id: cam.id, p: Math.round(this.pending * 10) / 10, b: Math.round(cam.batt * 10) / 10 });
    if (this.pending > 12) this.g.sfx.play('views');
    this.pending = 0;
  }

  pop(text, big) {
    const d = document.createElement('div');
    d.className = 'pop' + (big ? ' big' : '');
    d.textContent = text;
    d.style.left = (40 + Math.random() * 20) + '%';
    this.el.pops.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }

  addChat(text, special = false) {
    for (let i = 0; i < 3 && text === this.lastChat && !special; i++) text = say('idle');
    this.lastChat = text;
    const d = document.createElement('div');
    if (special) d.className = 'don';
    const u = document.createElement('b'); u.textContent = username(); u.style.color = userColor();
    d.append(u, document.createTextNode(' ' + text));
    this.el.chat.appendChild(d);
    while (this.el.chat.children.length > 9) this.el.chat.firstChild.remove();
  }

  // Draw the scene through the viewfinder.
  render(scene, camera) {
    const r = this.g.renderer, u = this.quad.material.uniforms;
    u.time.value = performance.now() / 1000;
    u.nv.value = this.nv ? 1 : 0;
    u.low.value = (this.myCam()?.batt ?? 100) < 20 ? 1 : 0;
    u.hit.value = this.g.danger || 0;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    r.setRenderTarget(null); r.render(this.post, this.ortho);
  }

  dispose() {
    if (this.aiming) this.tape.stop();
    document.body.classList.remove('filming');
    this.el.vf.classList.remove('on');
    this.rt.dispose();
  }
}
