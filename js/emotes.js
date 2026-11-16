// Emotes. Keyboard: hold Z, move the mouse toward one, let go (G is a quick wave). Controller: the D-pad
// (up wave, left dance, right point, down sit). Touch: the EMOTE button opens the wheel; tap one.
// The chosen emote goes out in 'st' (e: index + 1) and comes back in the snapshot.
export const EMOTES = ['wave', 'point', 'dance', 'sit', 'scream', 'flex'];
export const EMOTE_ICONS = { wave: '👋', point: '👉', dance: '🕺', sit: '🪑', scream: '😱', flex: '💪' };
export const EMOTE_SECS = { wave: 1.8, point: 2.2, dance: 20, sit: 40, scream: 2.2, flex: 2.6 };

export class EmoteWheel {
  constructor(input) {
    this.input = input;
    this.el = document.getElementById('emoteWheel');
    this.open = false; this.vx = 0; this.vy = 0; this.sel = -1; this.touchOpen = false;
    this.el.innerHTML = EMOTES.map((e, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
      return `<button data-e="${i}" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%"><span>${EMOTE_ICONS[e]}</span>${e}</button>`;
    }).join('') + '<div class="mid">EMOTE</div>';
    this.picked = null;
    this.el.querySelectorAll('[data-e]').forEach((b) => {
      const pick = (ev) => { ev.preventDefault(); ev.stopPropagation(); this.picked = EMOTES[+b.dataset.e]; this.close(); };
      b.addEventListener('touchstart', pick, { passive: false });
      b.addEventListener('mousedown', pick);
    });
  }
  close() { this.open = false; this.touchOpen = false; this.el.classList.remove('on'); this.sel = -1; }

  // once a frame: returns an emote name when one was chosen. While the wheel is open the mouse doesn't turn you.
  update(blocked) {
    const I = this.input, pad = I.pad;
    let chosen = this.picked; this.picked = null;
    if (blocked) { if (this.open) this.close(); return chosen; }
    if (pad && !pad.touch) {
      if (pad.up) chosen = 'wave'; if (pad.left) chosen = 'dance'; if (pad.right) chosen = 'point'; if (pad.downB) chosen = 'sit';
    }
    if (pad?.touch && pad.emote) { if (this.touchOpen) this.close(); else { this.touchOpen = true; this.open = true; this.el.classList.add('on'); } }
    if (I.hit('KeyG')) chosen = 'wave';
    const z = I.down('KeyZ');
    if (z && !this.open) { this.open = true; this.vx = this.vy = 0; this.el.classList.add('on'); }
    if (this.open && !this.touchOpen) {
      this.vx += I.dx; this.vy += I.dy; I.dx = 0; I.dy = 0;
      const l = Math.hypot(this.vx, this.vy);
      if (l > 140) { this.vx *= 140 / l; this.vy *= 140 / l; }
      this.sel = l > 35 ? Math.round(((Math.atan2(this.vy, this.vx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * EMOTES.length) % EMOTES.length : -1;
      this.el.querySelectorAll('[data-e]').forEach((b, i) => b.classList.toggle('sel', i === this.sel));
      if (!z) { if (this.sel >= 0) chosen = EMOTES[this.sel]; this.close(); }
    }
    return chosen;
  }
  dispose() { this.close(); }
}
