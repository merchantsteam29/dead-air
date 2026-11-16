// Every sound is synthesized (no files). Positional one-shots go through an HRTF panner at their spot.
// Buses: master (game sounds) -> compressor -> out; voiceBus (friends' voices, its own limiter);
// recMix: what the camcorder's microphone hears (game sounds + your mic + nearby friends), tapped by tape.js.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.8; this.lp = { x: 0, y: 1.6, z: 0 }; }

  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    this.out = ctx.createGain(); this.out.gain.value = this.vol;
    this.master.connect(comp).connect(this.out).connect(ctx.destination);
    this.voiceBus = ctx.createGain();
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 12;
    this.voiceBus.connect(lim).connect(ctx.destination);
    this.recMix = ctx.createGain();
    const toRec = ctx.createGain(); toRec.gain.value = 0.55;
    this.master.connect(toRec).connect(this.recMix);
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    const unlock = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); addEventListener('touchstart', unlock);
  }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  setVolume(v) { this.vol = v; if (this.out) this.out.gain.value = v; }
  listenerPos() { return this.lp; }

  setListener(x, y, z, yaw) {
    this.lp = { x, y, z };
    const L = this.ctx?.listener;
    if (!L) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (L.positionX) {
      const t = this.now;
      L.positionX.setTargetAtTime(x, t, 0.02); L.positionY.setTargetAtTime(y, t, 0.02); L.positionZ.setTargetAtTime(z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(0, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  }

  // A positional output at (x, y, z), or straight into the mix when no position.
  at(pos, ref = 2, roll = 1.3) {
    if (!pos) return this.master;
    const p = new PannerNode(this.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: roll, maxDistance: 80, positionX: pos.x, positionY: pos.y ?? 1, positionZ: pos.z });
    p.connect(this.master);
    setTimeout(() => p.disconnect(), 8000);
    return p;
  }
  // A long-lived positional source (creatures' hums); move it with setPos.
  emitter(ref = 2, roll = 1.2) {
    const p = new PannerNode(this.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: roll, maxDistance: 80 });
    const g = this.ctx.createGain(); g.connect(p).connect(this.master);
    return { in: g, p, setPos: (x, y, z) => { const t = this.now; p.positionX.setTargetAtTime(x, t, 0.05); p.positionY.setTargetAtTime(y, t, 0.05); p.positionZ.setTargetAtTime(z, t, 0.05); }, kill: () => { try { g.disconnect(); p.disconnect(); } catch { /* gone */ } } };
  }

  tone(dest, f, dur, { type = 'sine', vol = 0.3, to = null, at = 0, attack = 0.005 } = {}) {
    const ctx = this.ctx, t = this.now + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noise(dest, dur, { f = 1200, q = 1, type = 'bandpass', vol = 0.3, at = 0, attack = 0.005, to = null } = {}) {
    const ctx = this.ctx, t = this.now + at;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---------- the sounds ----------
  play(name, pos = null, k = 1) {
    if (!this.ctx) return;
    const f = this[name];
    if (typeof f === 'function') { try { f.call(this, pos, k); } catch (e) { console.warn('sound', name, e); } }
  }
  step(pos, k = 1) { const d = this.at(pos, 1.5, 1.6); this.noise(d, 0.09, { f: 300 + Math.random() * 300, q: 0.8, vol: 0.18 * k, type: 'lowpass' }); this.noise(d, 0.04, { f: 2200, q: 2, vol: 0.04 * k }); }
  jumpLand(pos) { const d = this.at(pos); this.noise(d, 0.15, { f: 220, type: 'lowpass', vol: 0.3 }); }
  thud(pos) { const d = this.at(pos, 3); this.tone(d, 110, 0.25, { type: 'sine', vol: 0.5, to: 45 }); this.noise(d, 0.2, { f: 400, type: 'lowpass', vol: 0.35 }); }
  bonk(pos) { const d = this.at(pos, 3); this.tone(d, 620, 0.18, { type: 'triangle', vol: 0.35, to: 300 }); this.noise(d, 0.08, { f: 1800, q: 3, vol: 0.2 }); }
  hit(pos) { const d = this.at(pos, 2.5); this.noise(d, 0.12, { f: 900, q: 1.2, vol: 0.35 }); this.tone(d, 180, 0.12, { type: 'square', vol: 0.08, to: 90 }); }
  whoosh(pos) { const d = this.at(pos, 2); this.noise(d, 0.3, { f: 600, to: 2400, q: 2, vol: 0.2, attack: 0.08 }); }
  grab(pos) { const d = this.at(pos, 1.5); this.noise(d, 0.06, { f: 1500, q: 1, vol: 0.12 }); this.tone(d, 300, 0.06, { type: 'triangle', vol: 0.06 }); }
  knock(pos) { const d = this.at(pos, 3, 1); for (let i = 0; i < 3; i++) { this.tone(d, 140, 0.12, { type: 'sine', vol: 0.55, to: 70, at: i * 0.22 }); this.noise(d, 0.06, { f: 700, q: 2, vol: 0.25, at: i * 0.22 }); } }
  creak(pos) { const d = this.at(pos, 3, 1); this.tone(d, 180, 0.9, { type: 'sawtooth', vol: 0.06, to: 260, attack: 0.2 }); this.tone(d, 182, 0.9, { type: 'sawtooth', vol: 0.05, to: 250, attack: 0.2 }); }
  slam(pos) { const d = this.at(pos, 4, 1); this.noise(d, 0.35, { f: 260, type: 'lowpass', vol: 0.8 }); this.tone(d, 70, 0.4, { vol: 0.6, to: 35 }); }
  honk(pos) { const d = this.at(pos, 3, 1); this.tone(d, 420, 0.22, { type: 'square', vol: 0.12, to: 380 }); this.tone(d, 640, 0.22, { type: 'square', vol: 0.06, to: 560 }); }
  pop(pos) { const d = this.at(pos, 3, 1); this.noise(d, 0.08, { f: 3000, q: 0.5, vol: 0.7, type: 'highpass' }); this.tone(d, 900, 0.05, { type: 'square', vol: 0.1, to: 200 }); }
  squeak(pos) { const d = this.at(pos, 2); this.tone(d, 900, 0.18, { type: 'sine', vol: 0.12, to: 1400 }); }
  scuttle(pos) { const d = this.at(pos, 2, 1.4); for (let i = 0; i < 5; i++) this.noise(d, 0.03, { f: 2500 + Math.random() * 1500, q: 4, vol: 0.18, at: i * 0.06 }); }
  shriek(pos) { const d = this.at(pos, 4, 1); this.tone(d, 1200, 0.5, { type: 'sawtooth', vol: 0.12, to: 700 }); this.noise(d, 0.5, { f: 3000, q: 3, vol: 0.12 }); }
  tvOn(pos) { const d = this.at(pos, 3, 1); this.noise(d, 1.2, { f: 4000, q: 0.4, vol: 0.18, type: 'highpass' }); this.tone(d, 15700, 1.2, { vol: 0.02 }); }
  giggle(pos) { const d = this.at(pos, 3, 1); for (let i = 0; i < 4; i++) this.tone(d, 520 - i * 30, 0.12, { type: 'triangle', vol: 0.12, at: i * 0.14, to: 460 - i * 30 }); }
  // Mr. Applause: the studio audience. k = length.
  applause(pos, k = 1) {
    const d = this.at(pos, 5, 0.8), dur = 2.2 * k;
    for (let i = 0; i < 60 * k; i++) this.noise(d, 0.03, { f: 1400 + Math.random() * 2600, q: 2.5, vol: 0.08 + Math.random() * 0.08, at: Math.random() * dur });
    this.noise(d, dur, { f: 1800, q: 0.6, vol: 0.06, attack: 0.3 });
  }
  laugh(pos) { // a laugh track: "ha ha ha" from a tinny crowd
    const d = this.at(pos, 5, 0.8);
    for (let i = 0; i < 6; i++) { const a = i * 0.17; this.noise(d, 0.13, { f: 700 + Math.random() * 300, q: 3, vol: 0.18, at: a }); this.tone(d, 210 + Math.random() * 40, 0.12, { type: 'sawtooth', vol: 0.03, at: a }); }
  }
  ding(pos) { const d = this.at(pos, 4, 1); this.tone(d, 1318, 0.6, { type: 'sine', vol: 0.18 }); this.tone(d, 1046, 0.8, { type: 'sine', vol: 0.15, at: 0.18 }); }
  jingle(pos) { // the show's theme, off-key
    const d = this.at(pos, 3, 1), notes = [523, 659, 784, 1046, 988, 784];
    notes.forEach((f, i) => this.tone(d, f * (0.985 + Math.random() * 0.03), 0.2, { type: 'triangle', vol: 0.12, at: i * 0.15 }));
  }
  sting() { const d = this.master; this.noise(d, 0.6, { f: 200, type: 'lowpass', vol: 0.5 }); this.tone(d, 60, 0.8, { vol: 0.5, to: 30 }); this.tone(d, 1800, 0.4, { type: 'sawtooth', vol: 0.05, to: 600 }); }
  recOn() { this.tone(this.master, 1760, 0.07, { type: 'square', vol: 0.05 }); }
  recOff() { this.tone(this.master, 990, 0.07, { type: 'square', vol: 0.05 }); }
  views() { this.tone(this.master, 1568, 0.08, { type: 'sine', vol: 0.06 }); this.tone(this.master, 2093, 0.12, { type: 'sine', vol: 0.05, at: 0.06 }); }
  big() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(this.master, f, 0.18, { type: 'triangle', vol: 0.09, at: i * 0.07 })); }
  click() { this.tone(this.master, 1200, 0.03, { type: 'square', vol: 0.04 }); }
  bad() { this.tone(this.master, 220, 0.3, { type: 'sawtooth', vol: 0.08, to: 110 }); }
  cash() { [1568, 2093, 2637].forEach((f, i) => this.tone(this.master, f, 0.14, { type: 'triangle', vol: 0.08, at: i * 0.06 })); this.noise(this.master, 0.12, { f: 6000, q: 2, vol: 0.05, at: 0.12 }); }
  revive(pos) { const d = this.at(pos, 4, 1); [523, 659, 784, 1046].forEach((f, i) => this.tone(d, f, 0.3, { type: 'sine', vol: 0.15, at: i * 0.1 })); this.tone(d, 80, 0.3, { vol: 0.4, to: 160 }); }
  thunder() { const p = { x: this.lp.x + (Math.random() - 0.5) * 60, y: 20, z: this.lp.z + (Math.random() - 0.5) * 60 }, d = this.at(p, 20, 0.5); this.noise(d, 2.8, { f: 140, type: 'lowpass', vol: 0.7, attack: 0.05 }); this.noise(d, 0.25, { f: 900, q: 0.5, vol: 0.25 }); }
  // blood rain: a hiss you can turn up (outside) and down (under a roof)
  startRain() {
    if (!this.ctx || this.rainNode) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(bp).connect(g).connect(this.master); s.start();
    this.rainNode = { s, g };
  }
  stopRain() { const r = this.rainNode; if (!r) return; this.rainNode = null; r.g.gain.setTargetAtTime(0, this.now, 0.6); setTimeout(() => { try { r.s.stop(); r.g.disconnect(); } catch { /* gone */ } }, 3000); }
  rainLevel(k) { if (this.rainNode) this.rainNode.g.gain.setTargetAtTime(0.25 * k, this.now, 0.3); }
  van() { this.tone(this.master, 90, 1.4, { type: 'sawtooth', vol: 0.12, to: 140, attack: 0.3 }); this.noise(this.master, 1.4, { f: 200, type: 'lowpass', vol: 0.2, attack: 0.3 }); }

  // ---------- loops ----------
  startAmbient() {
    if (!this.ctx || this.amb) return;
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const wob = ctx.createOscillator(), wg = ctx.createGain(); wob.frequency.value = 0.07; wg.gain.value = 160; wob.connect(wg).connect(lp.frequency); wob.start();
    const wg2 = ctx.createGain(); wg2.gain.value = 0.18;
    s.connect(lp).connect(wg2).connect(g); s.start();
    g.gain.setTargetAtTime(1, this.now, 1.5);
    this.amb = { g, s, wob, t: 0 };
  }
  stopAmbient() { if (!this.amb) return; const a = this.amb; a.g.gain.setTargetAtTime(0.0001, this.now, 0.4); setTimeout(() => { try { a.s.stop(); a.wob.stop(); a.g.disconnect(); } catch { /* gone */ } }, 1500); this.amb = null; }
  // crickets outside, a hum inside; call every frame
  ambient(dt, indoor) {
    if (!this.amb) return;
    this.amb.t -= dt;
    if (this.amb.t > 0) return;
    this.amb.t = indoor ? 2 + Math.random() * 4 : 0.6 + Math.random() * 1.6;
    if (indoor) { if (Math.random() < 0.3) this.creak({ x: this.lp.x + (Math.random() - 0.5) * 16, y: 2.5, z: this.lp.z + (Math.random() - 0.5) * 16 }); return; }
    const p = { x: this.lp.x + (Math.random() - 0.5) * 30, y: 0.3, z: this.lp.z + (Math.random() - 0.5) * 30 }, d = this.at(p, 4, 1);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.tone(d, f, 0.035, { vol: 0.025, at: i * 0.07, type: 'triangle' });
  }

  radioCurve() {
    const n = 256, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.2); }
    return c;
  }
}
export const sfxClamp = clamp;
