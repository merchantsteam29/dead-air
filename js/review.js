// After a night: the upload. Plays the best clips from every saved tape (the frames and the sound the camcorder
// heard, so your screams are in it), with comments, then the night's numbers against the season quota.
import { comments } from './chat.js';
import { fmt, rng } from './util.js';
import { TAPE_FPS, TAPE_RATE } from './tape.js';

const TITLES = ['(NOT CLICKBAIT)', '(GONE WRONG)', '(3AM CHALLENGE)', '(REAL FOOTAGE)', '(WE ALMOST DIED)', '(MUST WATCH)', '(EMOTIONAL)', '(POLICE CALLED?)'];

export class Review {
  constructor(sfx) {
    this.sfx = sfx;
    this.el = document.getElementById('review');
    this.canvas = document.getElementById('rvCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.stopped = true;
  }

  // clips: [{ meta, frames, audio }], info: { title, night, season, end, seasonViews, quota, nightOf, names }
  async play(clips, info) {
    this.stopped = false;
    const r = rng(info.seed || 1);
    const el = this.el;
    el.hidden = false;
    const $ = (id) => document.getElementById(id);
    $('rvTitle').textContent = `S${info.season} E${info.night}: ${info.place} ${TITLES[Math.floor(r() * TITLES.length)]}`;
    $('rvComments').innerHTML = '';
    $('rvSummary').hidden = true;
    $('rvPlayer').hidden = false;
    $('rvViews').textContent = '0 views';
    let shown = 0;
    if (!clips.length) {
      await this.staticCard('NO USABLE FOOTAGE', info.end.views ? 'the tapes made it, but nothing worth a clip' : 'nobody brought a tape back');
    }
    for (const c of clips) {
      if (this.stopped) return;
      $('rvBy').textContent = `📼 filmed by ${c.meta.who} · ${fmt(c.meta.score)} views in 8 seconds`;
      for (const cm of comments(c.meta.tags || [], 3, r)) this.comment(cm);
      await this.staticCard('', '', 0.5);
      await this.clip(c, (k) => { shown = Math.max(shown, k); });
      $('rvViews').textContent = `${fmt(info.end.views * Math.min(1, (clips.indexOf(c) + 1) / clips.length))} views`;
    }
    if (this.stopped) return;
    for (const cm of comments(['idle', 'kill', 'scream'].filter((t, i) => i === 0 || info.end.dead.length), 2, r)) this.comment(cm);
    this.summary(info);
  }

  comment(c) {
    const d = document.createElement('div');
    d.className = 'cm';
    const u = document.createElement('b'); u.textContent = '@' + c.user; u.style.color = c.color;
    const t = document.createElement('p'); t.textContent = c.text;
    const l = document.createElement('small'); l.textContent = `👍 ${c.likes}`;
    d.append(u, t, l);
    const box = document.getElementById('rvComments');
    box.prepend(d);
    while (box.children.length > 12) box.lastChild.remove();
  }

  staticCard(big, small, secs = 1.6) {
    return new Promise((res) => {
      const c = this.ctx, w = this.canvas.width, h = this.canvas.height, t0 = performance.now();
      const img = c.createImageData(w / 4, h / 4);
      const draw = () => {
        if (this.stopped) return res();
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        c.putImageData(img, 0, 0); c.drawImage(this.canvas, 0, 0, w / 4, h / 4, 0, 0, w, h);
        if (big) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, h / 2 - 40, w, 80); c.fillStyle = '#fff'; c.font = 'bold 30px VT323, monospace'; c.textAlign = 'center'; c.fillText(big, w / 2, h / 2); c.font = '18px VT323, monospace'; c.fillText(small, w / 2, h / 2 + 26); c.textAlign = 'left'; }
        if (performance.now() - t0 < secs * 1000) requestAnimationFrame(draw); else res();
      };
      draw();
    });
  }

  clip(c, onFrame) {
    return new Promise(async (res) => {
      const imgs = await Promise.all(c.frames.map((src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; })));
      const ctx = this.sfx.ctx;
      let src = null;
      if (ctx && c.audio && c.audio.length > 100) {
        const b = ctx.createBuffer(1, c.audio.length, TAPE_RATE);
        b.getChannelData(0).set(c.audio);
        src = ctx.createBufferSource(); src.buffer = b;
        const g = ctx.createGain(); g.gain.value = 1.4;
        src.connect(g).connect(ctx.destination);
        src.start();
      }
      this.src = src;
      const t0 = performance.now(), dur = Math.max(imgs.length / TAPE_FPS, (c.audio?.length || 0) / TAPE_RATE);
      const w = this.canvas.width, h = this.canvas.height;
      const bar = document.getElementById('rvBar');
      const draw = () => {
        if (this.stopped) { try { src?.stop(); } catch { /* done */ } return res(); }
        const t = (performance.now() - t0) / 1000;
        const i = Math.min(imgs.length - 1, Math.floor(t * TAPE_FPS));
        if (imgs[i]) { this.ctx.imageSmoothingEnabled = false; this.ctx.drawImage(imgs[i], 0, 0, w, h); }
        bar.style.width = Math.min(100, (t / dur) * 100) + '%';
        onFrame(i);
        if (t < dur + 0.3) requestAnimationFrame(draw); else res();
      };
      draw();
    });
  }

  summary(info) {
    const $ = (id) => document.getElementById(id);
    const e = info.end;
    $('rvPlayer').hidden = true;
    $('rvSummary').hidden = false;
    const reason = { leave: 'You drove off with the tapes.', time: '6 a.m. The van left.', dead: 'Nobody made it back to the van.' }[e.reason] || '';
    const lines = [
      `<div class="big">+${fmt(e.views)} <small>views tonight</small></div>`,
      `<p>${reason}</p>`,
      e.lost ? `<p class="bad">📼 ${fmt(e.lost)} views lost on tapes left behind.</p>` : '',
      e.dead.length ? `<p class="bad">💀 Lost: ${e.dead.map((id) => esc(info.names[id] || 'someone')).join(', ')}. (They'll be back tomorrow night. Probably.)</p>` : '<p>Nobody died. Viewers were a little disappointed.</p>',
    ];
    const total = info.seasonViews, pct = Math.min(100, (total / info.quota) * 100);
    lines.push(`<div class="quota"><div class="qbar"><i style="width:${pct}%"></i></div><span>Season ${info.season}: ${fmt(total)} / ${fmt(info.quota)} views · night ${info.night} of ${info.nightOf}</span></div>`);
    if (info.verdict === 'renewed') lines.push(`<div class="verdict good">RENEWED FOR SEASON ${info.season + 1}</div><p>The network wants more. The quota goes up.</p>`);
    if (info.verdict === 'cancelled') lines.push(`<div class="verdict bad">CHANNEL TERMINATED</div><p>${fmt(total)} of ${fmt(info.quota)} views. You lasted ${info.season - 1} season${info.season === 2 ? '' : 's'} and ${info.night} night${info.night === 1 ? '' : 's'}.</p>`);
    $('rvStats').innerHTML = lines.join('');
    this.sfx.play(info.verdict === 'cancelled' ? 'bad' : 'big');
  }

  hide() { this.stopped = true; try { this.src?.stop(); } catch { /* done */ } this.el.hidden = true; }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
