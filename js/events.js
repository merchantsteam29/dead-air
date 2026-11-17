// Night events (one per night, picked from the seed, so every browser knows it without a message), the moon, and the
// ceiling lights (the nearest few working fixtures get a real light; a power cut turns them all off).
//   fog        thick fog all night; footage x1.3
//   storm      for ~90 s mid-night: wind, rain, lightning that lights everything up
//   power      for ~75 s mid-night every light goes out and headlamps stutter
//   bloodmoon  a red moon: creatures 25% faster, footage x2 all night
//   bloodrain  chaos.js: red rain that drains stamina and battery outside (footage x2 out in it)
import * as THREE from 'three';
import { rng } from './util.js';

export const EVENT_INFO = {
  none: null,
  fog: { tag: '🌫 FOG', text: 'Thick fog tonight. You can barely see, but viewers love it.' },
  storm: { tag: '⛈ STORM', text: 'A storm is coming in later tonight.' },
  power: { tag: '🔌 BAD WIRING', text: 'The power here is unreliable...' },
  bloodmoon: { tag: '🌕 BLOOD MOON', text: 'BLOOD MOON. Everything out there is faster tonight, and every view counts double.' },
  bloodrain: { tag: '🩸 RED SKY', text: 'The sky looks wrong tonight.' },
};

export class NightEvents {
  constructor(g) {
    this.g = g;
    const r = rng((g.seed ^ 0xe7e7) >>> 0);
    const indoor = g.world.type !== 'lot';
    const roll = r();
    const table = g.night === 1
      ? [['none', 0.45], ['fog', 0.15], ['storm', 0.15], ['power', 0.15], ['bloodrain', 0.1]]
      : [['none', 0.2], ['fog', 0.15], ['storm', 0.15], ['power', indoor ? 0.22 : 0.12], ['bloodmoon', 0.12], ['bloodrain', 0.16]];
    let acc = 0; this.kind = 'none';
    const total = table.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of table) { acc += w / total; if (roll < acc) { this.kind = k; break; } }
    if (new URLSearchParams(location.search).get('event')) this.kind = new URLSearchParams(location.search).get('event'); // (testing)
    this.info = EVENT_INFO[this.kind];
    this.start = 60 + r() * 140; this.dur = this.kind === 'storm' ? 90 : 75;
    this.mult = this.kind === 'fog' ? 1.3 : this.kind === 'bloodmoon' ? 2 : 1;
    this.speedK = this.kind === 'bloodmoon' ? 1.25 : 1;
    this.power = true; this.storming = false; this.flash = 0; this.boltT = 3; this.announced = false;
    const s = g.scene;
    // the moon
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(this.kind === 'bloodmoon' ? 9 : 6, 20, 14), new THREE.MeshBasicMaterial({ color: this.kind === 'bloodmoon' ? 0xc8201a : 0xe8ecff, fog: false }));
    this.moon.position.set(g.world.W / 2 + 60, 70, -90); s.add(this.moon);
    if (this.kind === 'fog') s.fog.density = 0.075;
    if (this.kind === 'bloodmoon') { g.hemi.color.setHex(0xc06060); s.fog.color.setHex(0x1a0808); s.background.setHex(0x1a0808); }
    this.hemiBase = g.hemi.intensity;
    // the light pool for ceiling fixtures
    this.pool = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xfff0d0, 0, 9, 1.6); l.position.y = 2.7; s.add(l); return l; });
    this.poolT = 0;
  }

  update(dt) {
    const g = this.g, t = g.time;
    if (!this.announced && t > 9 && this.info) { this.announced = true; g.toast(this.info.text, 5); }
    // timed events
    const live = t > this.start && t < this.start + this.dur;
    if (this.kind === 'storm') {
      if (live && !this.storming) { this.storming = true; g.toast('The storm is here.', 3); g.sfx.startRain(); g.sfx.play('thunder'); }
      if (!live && this.storming) { this.storming = false; g.sfx.stopRain(); }
      if (this.storming) {
        g.sfx.rainLevel(g.world.indoor(g.me.x, g.me.z) ? 0.3 : 0.8);
        this.boltT -= dt;
        if (this.boltT <= 0) { this.boltT = 4 + Math.random() * 7; this.flash = 1; setTimeout(() => g.sfx.play('thunder'), 300 + Math.random() * 1200); }
      }
    }
    if (this.kind === 'power') {
      const was = this.power;
      this.power = !live;
      if (was && !this.power) { g.toast('The power just went out.', 3); g.sfx.play('slam'); this.stutter = 3; }
      if (!was && this.power) g.toast('The lights come back on.', 2);
    }
    this.stutter = Math.max(0, (this.stutter || 0) - dt);
    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    g.hemi.intensity = this.hemiBase + this.flash * (Math.random() < 0.5 ? 2.5 : 1.5);
    // ceiling lights: the nearest working fixtures get the pool
    this.poolT -= dt;
    const fx = g.world.fixtures;
    if (this.poolT <= 0) {
      this.poolT = 0.4;
      const c = g.camera.position;
      this.near = fx.filter((f) => !f.dead).map((f) => ({ f, d: Math.hypot(f.x - c.x, f.z - c.z) })).filter((o) => o.d < 22).sort((a, b) => a.d - b.d).slice(0, this.pool.length).map((o) => o.f);
      for (const f of fx) if (!f.flicker || !this.power || f.dead) f.set?.(!f.dead && this.power);
    }
    this.pool.forEach((l, i) => {
      const f = this.near?.[i];
      if (!f || !this.power) { l.intensity = 0; return; }
      l.position.set(f.x, (f.y ?? 2.7) - 0.15, f.z); l.distance = f.post ? 15 : 9;
      const fl = f.flicker ? (Math.random() < 0.08 ? 0.1 : 1) : 1;
      l.intensity = (f.post ? 7 : 3.2) * fl;
      if (f.flicker) f.set?.(fl > 0.5);
    });
  }
  // headlamps stutter when the power goes
  lampK() { return this.stutter > 0 ? (Math.random() < 0.5 ? 0 : 1) : 1; }
  dispose() { const s = this.g.scene; s.remove(this.moon); for (const l of this.pool) s.remove(l); if (this.storming) this.g.sfx.stopRain(); }
}
