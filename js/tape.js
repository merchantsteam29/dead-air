// The tape: while you film, it keeps small JPEG frames (6 a second) and what the camcorder's mic hears (16 kHz),
// and for each camcorder remembers the best 8 seconds (most views). Those are the highlights in the upload.
const RATE = 16000, FPS = 6, WIN = 8 * FPS, MAX_SEG = 50 * FPS;
export const TAPE_FPS = FPS, TAPE_RATE = RATE;

const WORKLET = `class TapRec extends AudioWorkletProcessor {
  constructor() { super(); this.b = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const c = inputs[0] && inputs[0][0];
    if (c) for (let k = 0; k < c.length; k++) { this.b[this.n++] = c[k]; if (this.n === 2048) { this.port.postMessage(this.b.slice(0)); this.n = 0; } }
    return true;
  }
}
registerProcessor('tap-rec', TapRec);`;

export class TapeRec {
  constructor(sfx) {
    this.sfx = sfx;
    this.seg = null;
    this.best = new Map();
    this.small = document.createElement('canvas'); this.small.width = 192; this.small.height = 108;
    this.sctx = this.small.getContext('2d');
    this.acc = 0; this.cnt = 0; this.frac = 0;
  }

  async init() {
    const ctx = this.sfx.ctx;
    if (!ctx || this.node || !ctx.audioWorklet) return;
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(ctx, 'tap-rec');
      this.sfx.recMix.connect(this.node);
      const z = ctx.createGain(); z.gain.value = 0;
      this.node.connect(z).connect(ctx.destination);
      this.node.port.onmessage = (e) => this.audio(e.data);
      this.ratio = ctx.sampleRate / RATE;
    } catch (e) { console.warn('tape audio unavailable', e); }
  }

  audio(f32) {
    const s = this.seg;
    if (!s) return;
    const out = new Float32Array(Math.ceil(f32.length / this.ratio) + 2);
    let n = 0;
    for (let i = 0; i < f32.length; i++) {
      this.acc += f32[i]; this.cnt++; this.frac += 1;
      if (this.frac >= this.ratio) { out[n++] = this.acc / this.cnt; this.acc = 0; this.cnt = 0; this.frac -= this.ratio; }
    }
    s.chunks.push(out.subarray(0, n)); s.n += n;
  }

  start(cam) { if (this.seg) this.stop(); this.seg = { cam, frames: [], chunks: [], n: 0 }; this.acc = this.cnt = this.frac = 0; }

  // Call 6 times a second while filming, right after the frame was drawn.
  frame(src, pts, tags, stamp, nv) {
    const s = this.seg;
    if (!s) return;
    const c = this.sctx, w = 192, h = 108;
    try { c.drawImage(src, 0, 0, w, h); } catch { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); }
    c.font = 'bold 10px monospace'; c.fillStyle = '#fff'; c.shadowColor = '#000'; c.shadowBlur = 2;
    c.fillText(stamp, 8, h - 8);
    c.fillStyle = '#ff3030'; c.beginPath(); c.arc(12, 12, 4, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillText('REC', 20, 16);
    if (nv) { c.fillStyle = '#9f9'; c.fillText('NV', w - 24, 16); }
    c.shadowBlur = 0;
    s.frames.push({ img: this.small.toDataURL('image/jpeg', 0.55), pts, tags, a: s.n });
    if (s.frames.length >= MAX_SEG) { const cam = s.cam; this.stop(); this.start(cam); }
  }

  stop() {
    const s = this.seg; this.seg = null;
    if (!s || s.frames.length < FPS * 1.5) return;
    // the 8 seconds with the most views
    let sum = 0, bestSum = -1, bestI = 0;
    const f = s.frames;
    for (let i = 0; i < f.length; i++) {
      sum += f[i].pts;
      if (i >= WIN) sum -= f[i - WIN].pts;
      if (i >= Math.min(WIN, f.length) - 1 && sum > bestSum) { bestSum = sum; bestI = Math.max(0, i - WIN + 1); }
    }
    const old = this.best.get(s.cam);
    if (bestSum < 25 || (old && old.score >= bestSum)) return;
    const slice = f.slice(bestI, bestI + WIN);
    const all = new Float32Array(s.n); let o = 0;
    for (const ch of s.chunks) { all.set(ch, o); o += ch.length; }
    // (on a slow machine the frames come slower than real time: never more than 8.5 s of sound)
    const a1 = Math.min(s.n, slice[slice.length - 1].a + Math.round(RATE / FPS)), a0 = Math.max(slice[0].a, a1 - Math.round(RATE * 8.5));
    const count = {};
    for (const fr of slice) for (const t of fr.tags) count[t] = (count[t] || 0) + 1;
    const tags = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 4);
    this.best.set(s.cam, { cam: s.cam, score: Math.round(bestSum), frames: slice.map((x) => x.img), pts: slice.map((x) => Math.round(x.pts)), audio: all.slice(a0, a1), tags });
  }

  highlights(cams) { this.stop(); return cams.map((c) => this.best.get(c)).filter(Boolean); }
  reset() { this.seg = null; this.best.clear(); }
}
