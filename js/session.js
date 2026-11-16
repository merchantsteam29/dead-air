// A crew: alone (SoloNet, this browser is the host) or online (Net + VoiceChat). Holds everyone's look,
// routes messages to the game / the flow, and moves the highlight reels between browsers after a night.
import { Net, newCode, cleanCode, cleanName } from './net.js';
import { VoiceChat } from './vc.js';
import { muEncode, muDecode, bytesOf } from './util.js';

export class SoloNet {
  constructor(name) { this.isHost = true; this.id = 'h'; this.code = null; this.peer = null; this.roster = [{ id: 'h', name: cleanName(name), peer: null }]; this.onMessage = () => {}; this.onRoster = () => {}; this.onClose = () => {}; this.locked = false; }
  send(m) { queueMicrotask(() => this.onMessage(m, 'h')); }
  broadcast(m) { queueMicrotask(() => this.onMessage(m, 'h')); }
  sendTo(id, m) { queueMicrotask(() => this.onMessage(m, 'h')); }
  nameOf() { return this.roster[0].name; }
  destroy() {}
}

const FLOW = new Set(['start', 'review', 'lobby', 'season']);
const GAME = new Set(['st', 'grab', 'drop', 'film', 'leave', 'carry', 'bodyDrop', 'don', 'snap', 'ev', 'end', 'quit']);

export class Session {
  constructor({ sfx, mic, name, look }) {
    this.sfx = sfx; this.mic = mic; this.name = cleanName(name); this.look = look;
    this.info = {};          // player id -> { color, hat }
    this.onGame = () => {};  // (m, from)
    this.onFlow = () => {};  // (m)
    this.onLobby = () => {}; // ()
    this.onClose = () => {}; // (reason)
    this.hl = {};            // highlight key -> { meta, frames: [], audio: [], done }
    this.hlEnds = new Set();
    this.q = []; this.pumpT = null;
  }

  get isHost() { return this.net.isHost; }
  get myId() { return this.net.id; }
  get online() { return !(this.net instanceof SoloNet); }
  get roster() { return this.net.roster; }

  solo() { this.net = new SoloNet(this.name); this.wire(); this.info.h = { ...this.look }; }
  async host(code = newCode()) { this.net = new Net(); this.wire(); await this.net.host(code, this.name); this.info.h = { ...this.look }; this.startVoice(); this.onLobby(); }
  async join(code) {
    this.net = new Net(); this.wire();
    await this.net.join(cleanCode(code), this.name);
    this.startVoice();
    this.net.send({ t: 'me', look: this.look });
  }
  startVoice() {
    try { this.vc = new VoiceChat(this.net, this.sfx, this.mic); this.vc.sync(this.net.roster); } catch (e) { console.warn('voice chat', e); }
  }

  wire() {
    const n = this.net;
    n.onMessage = (m, from) => this.receive(m, from);
    n.onRoster = (r) => { this.vc?.sync(r); if (this.isHost) this.sendLobby(); this.onLobby(); };
    n.onClose = (why) => this.onClose(why);
  }

  sendLobby() {
    for (const id of Object.keys(this.info)) if (!this.net.roster.some((r) => r.id === id)) delete this.info[id];
    this.net.broadcast({ t: 'lobby', info: this.info, ...(this.lobbyExtra?.() || {}) }, { self: false });
  }
  setLook(look) { this.look = look; if (this.isHost) { this.info[this.myId] = { ...look }; this.sendLobby(); this.onLobby(); } else this.net.send({ t: 'me', look }); }

  receive(m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'me' && this.isHost) { this.info[from] = cleanLook(m.look); this.sendLobby(); this.onLobby(); return; }
    if (m.t === 'lobby' && !this.isHost) { this.info = m.info || {}; this.lobbyState = m; this.onLobby(); return; }
    if (m.t === 'hl') { this.hlPart(m, from); return; }
    if (m.t === 'hlEnd') { if (this.isHost) this.hlEnds.add(from); return; }
    if (FLOW.has(m.t)) { if (from === 'h') this.onFlow(m); return; }
    if (GAME.has(m.t)) this.onGame(m, from);
  }

  crew() {
    return this.net.roster.map((r, i) => ({ id: r.id, name: r.name, color: this.info[r.id]?.color ?? i, hat: this.info[r.id]?.hat ?? 'cap' }));
  }

  // ---------- highlights ----------
  // Send my best clips (one per saved camcorder) to everyone.
  shareHighlights(list) {
    this.hl = this.hl || {};
    for (const h of list) {
      const key = `${this.myId}-${h.cam}`;
      const audio = muEncode(h.audio), parts = [];
      for (let o = 0; o < audio.length; o += 16000) parts.push(audio.slice(o, o + 16000));
      const meta = { cam: h.cam, score: h.score, pts: h.pts, tags: h.tags, who: this.name, by: this.myId, nf: h.frames.length, na: parts.length };
      // my own copy, as is
      this.hl[key] = { meta, frames: h.frames.slice(), audio: [h.audio], done: true, local: true };
      if (!this.online) continue;
      this.queue({ t: 'hl', k: key, p: 'm', d: meta });
      h.frames.forEach((f, i) => this.queue({ t: 'hl', k: key, p: 'f', i, d: f }));
      parts.forEach((a, i) => this.queue({ t: 'hl', k: key, p: 'a', i, d: a }));
    }
    if (this.online) this.queue({ t: 'hlEnd' }); else this.hlEnds.add(this.myId);
  }
  hlPart(m, from) {
    if (typeof m.k !== 'string' || m.k.length > 40) return;
    if (this.isHost) {
      if (!m.k.startsWith(from + '-')) return; // only your own clips
      for (const id of this.net.conns?.keys?.() || []) if (id !== from) this.queueTo(id, m);
    }
    const h = this.hl[m.k] || (this.hl[m.k] = { meta: null, frames: [], audio: [], done: false });
    if (h.local) return;
    if (m.p === 'm') h.meta = m.d;
    if (m.p === 'f' && typeof m.d === 'string' && m.i < 64) h.frames[m.i] = m.d;
    if (m.p === 'a' && m.i < 32) h.audio[m.i] = muDecode(bytesOf(m.d));
    if (h.meta && h.frames.filter(Boolean).length >= h.meta.nf && h.audio.filter(Boolean).length >= h.meta.na) h.done = true;
  }
  hlReady(keys) { return keys.every((k) => this.hl[k]?.done); }
  resetHighlights() { this.hl = {}; this.hlEnds = new Set(); }
  // A finished highlight as { meta, frames, audio: Float32Array }.
  highlight(key) {
    const h = this.hl[key];
    if (!h?.done) return null;
    const n = h.audio.reduce((s, a) => s + a.length, 0), all = new Float32Array(n);
    let o = 0; for (const a of h.audio) { all.set(a, o); o += a.length; }
    return { meta: h.meta, frames: h.frames, audio: all };
  }

  // paced sending: one message every 25 ms so snapshots and voice don't stall behind a pile of frames
  queue(m) { this.q.push([null, m]); this.pump(); }
  queueTo(id, m) { this.q.push([id, m]); this.pump(); }
  pump() {
    if (this.pumpT) return;
    this.pumpT = setInterval(() => {
      const x = this.q.shift();
      if (!x) { clearInterval(this.pumpT); this.pumpT = null; return; }
      const [to, m] = x;
      if (to) this.net.sendTo(to, m); else this.net.send(m);
    }, 25);
  }

  leave() {
    clearInterval(this.pumpT); this.pumpT = null; this.q = [];
    try { this.vc?.dispose(); } catch { /* gone */ }
    try { this.net?.destroy(); } catch { /* gone */ }
  }
}

export function cleanLook(l) {
  return { color: Math.max(0, Math.min(7, (l?.color | 0))), hat: ['cap', 'beanie', 'bucket', 'none', 'antenna'].includes(l?.hat) ? l.hat : 'cap' };
}
