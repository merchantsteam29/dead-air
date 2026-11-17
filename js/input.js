// Keyboard + mouse (pointer lock), every kind of controller, and touch screens, read once a frame.
// Controllers: Xbox, PlayStation, Steam Deck / Steam Controller, Switch Pro, plus anything the browser maps as
// "standard". Raw pads from known vendors are remapped. Wheels, flight sticks and pedals are ignored, and an axis
// only counts once it has been seen centred (a wheel or joystick resting off-centre used to spin the camera).
//
// The game reads one `pad` object a frame: mx/mz (move), jump, use / useHeld, drop, light, aim (held), throw,
// sprint, nv, wave, pause, tab. `label(key, padButton)` names a control for prompts on the device in use.
const BAD_PAD = /wheel|flight|pedal|tablet|throttle|rudder|hotas|g29|g920|g923|t300|t150|wacom|yoke|racing/i;
const VENDOR = (id) => { const m = /vendor:\s*([0-9a-f]{4})/i.exec(id) || /^([0-9a-f]{4})-/i.exec(id); return m ? m[1].toLowerCase() : ''; };
export function padKind(id) {
  const v = VENDOR(id);
  if (v === '054c' || /dualsense|dualshock|playstation|ps[345] controller|sony/i.test(id)) return 'ps';
  if (v === '28de' || /steam deck|valve/i.test(id)) return /deck|1205/i.test(id) ? 'deck' : 'steam';
  if (v === '057e' || /nintendo|switch|pro controller|joy-con/i.test(id)) return 'switch';
  return 'xbox';
}
// what the Xbox names below are called on each pad
const NAMES = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', View: 'View', Menu: 'Menu', L3: 'L3', Up: 'D-pad ↑' },
  ps: { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'Share', Menu: 'Options', L3: 'L3', Up: 'D-pad ↑' },
  deck: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'View', Menu: 'Menu', L3: 'L3', Up: 'D-pad ↑' },
  steam: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', View: 'Back', Menu: 'Start', L3: 'L3', Up: 'D-pad ↑' },
  switch: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', View: '−', Menu: '+', L3: 'L3', Up: 'D-pad ↑' },
};
const TOUCH_NAMES = { E: 'USE', Q: 'DROP', LMB: 'THROW', RMB: 'FILM', N: 'NV', F: 'LIGHT', G: 'WAVE' };

function normalize(g, kind) {
  if (g.mapping === 'standard') return { b: g.buttons.map((x) => ({ p: !!(x && x.pressed), v: x ? x.value : 0 })), a: [g.axes[0] || 0, g.axes[1] || 0, g.axes[2] || 0, g.axes[3] || 0] };
  const B = (i) => ({ p: !!(g.buttons[i] && g.buttons[i].pressed), v: g.buttons[i] ? g.buttons[i].value : 0 });
  const trig = (bi, ai) => { const b = B(bi), a = g.axes[ai]; const v = Math.max(b.v, a !== undefined && a !== 0 ? (a + 1) / 2 : 0); return { p: b.p || v > 0.4, v }; };
  let b, ry;
  if (kind === 'ps') { b = [B(1), B(2), B(0), B(3), B(4), B(5), trig(6, 3), trig(7, 4), B(8), B(9), B(10), B(11), B(12)]; ry = g.axes.length > 5 ? g.axes[5] : g.axes[3] || 0; }
  else if (kind === 'switch') { b = [B(1), B(0), B(3), B(2), B(4), B(5), B(6), B(7), B(8), B(9), B(10), B(11), B(12)]; ry = g.axes[3] || 0; }
  else { b = [B(0), B(1), B(2), B(3), B(4), B(5), trig(6, 2), trig(7, 5), B(8), B(9), B(10), B(11), B(12)]; ry = g.axes.length > 4 ? g.axes[4] : g.axes[3] || 0; }
  const dpad = [false, false, false, false];
  if (g.buttons.length >= 16 && kind !== 'ps') for (let i = 0; i < 4; i++) dpad[i] = !!(g.buttons[12 + i] && g.buttons[12 + i].pressed);
  const hat = g.axes.length > 9 ? g.axes[9] : null;
  if (hat !== null && Math.abs(hat) <= 1.01 && Math.abs(hat) > 0.05) {
    const s = Math.round((hat + 1) * 3.5);
    if (hat <= 1.0 && s <= 7) { dpad[0] = s === 0 || s === 1 || s === 7; dpad[3] = s >= 1 && s <= 3; dpad[1] = s >= 3 && s <= 5; dpad[2] = s >= 5 && s <= 7; }
  }
  while (b.length < 13) b.push({ p: false, v: 0 });
  for (const d of dpad) b.push({ p: d, v: d ? 1 : 0 });
  const rx = kind === 'ps' || kind === 'switch' ? g.axes[2] || 0 : g.axes.length > 4 ? g.axes[3] || 0 : g.axes[2] || 0;
  return { b, a: [g.axes[0] || 0, g.axes[1] || 0, rx, ry] };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.lmb = false; this.rmb = false; this.lmbHit = false;
    this.pads = true; this.padMode = false; this.padSt = {}; this.padIdx = -1; this.pad = null; this.padSens = 1; this.kind = 'xbox'; this.gp = null;
    this.touchMode = false; this.touch = { stick: null, look: null, held: {}, hit: {}, aim: false }; this.touchSens = 1;
    this.onKind = null;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code); this.setMode('keys');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; this.touch.held = {}; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; this.setMode('keys'); } });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.lmb = true; this.lmbHit = true; } if (e.button === 2) this.rmb = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  setMode(m) {
    const was = this.mode;
    this.padMode = m === 'pad'; if (m === 'touch') this.touchMode = true; if (m === 'keys') this.touchMode = false;
    if (was !== m) { document.body.classList.remove('input-keys', 'input-pad', 'input-touch'); document.body.classList.add('input-' + m); this.onKind?.(m, this.kind); }
  }
  get mode() { return this.padMode ? 'pad' : this.touchMode ? 'touch' : 'keys'; }
  get locked() { return document.pointerLockElement === this.canvas; }
  lock() {
    if (this.locked || this.touchMode || this.padMode || !this.canvas.requestPointerLock) return;
    const plain = () => { try { const r = this.canvas.requestPointerLock(); r?.catch?.(() => {}); } catch { /* needs a click first */ } };
    try { const r = this.canvas.requestPointerLock({ unadjustedMovement: true }); r?.catch?.(plain); } catch { plain(); }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  // A control's name on the device in use: label('E', 'X') -> "E", "X", "□" or "USE".
  label(key, padBtn) {
    if (this.padMode) return `[${(NAMES[this.kind] || NAMES.xbox)[padBtn] || padBtn}]`;
    if (this.touchMode) return `[${TOUCH_NAMES[key] || key}]`;
    return `[${key === 'LMB' ? 'Click' : key === 'RMB' ? 'Right click' : key}]`;
  }

  pollPad(dt) {
    this.pad = null;
    if (this.pads && navigator.getGamepads) {
      let cur = null;
      for (const g of navigator.getGamepads()) {
        if (!g || !g.connected || BAD_PAD.test(g.id)) continue;
        const kind = padKind(g.id);
        if (g.mapping !== 'standard' && !/054c|28de|057e|045e|xbox|x-box|xinput|dualsense|dualshock|steam|valve|nintendo/i.test(g.id)) continue;
        const n = normalize(g, kind);
        const st = this.padSt[g.index] || (this.padSt[g.index] = { c: n.a.map(() => false), prev: n.b.map(() => true), kind });
        n.a.forEach((v, i) => { if (Math.abs(v) < 0.2) st.c[i] = true; });
        const fresh = n.b.some((b, i) => b.p && !st.prev[i]), moved = n.a.some((v, i) => st.c[i] && Math.abs(v) > 0.5);
        if (fresh || moved) { this.padIdx = g.index; if (this.kind !== kind || !this.padMode) { this.kind = kind; this.setMode('pad'); this.onKind?.('pad', kind); } }
        if (g.index === this.padIdx) cur = { g, st, n }; else st.prev = n.b.map((b) => b.p);
      }
      if (cur) {
        const { g, st, n } = cur, prev = st.prev; st.prev = n.b.map((b) => b.p); this.gp = g;
        const ax = (i) => { const v = st.c[i] ? n.a[i] : 0; return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85; };
        const btn = (i) => !!(n.b[i] && n.b[i].p), hit = (i) => btn(i) && !prev[i];
        // A jump, B drop, X use, Y light, LB sprint (or L3), RB night vision, LT film, RT throw, D-pad up wave, View crew, Menu pause
        this.pad = { mx: ax(0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0), mz: -ax(1), lx: ax(2), ly: ax(3),
          jump: hit(0), drop: hit(1), use: hit(2), useHeld: btn(2), light: hit(3), sprint: btn(4) || btn(10), nv: hit(5), aim: btn(6), throw: hit(7),
          tab: btn(8), talk: btn(11), pause: hit(9), up: hit(12), downB: hit(13), a: hit(0), b: hit(1), left: hit(14), right: hit(15) };
        const k = 380 * this.padSens * dt;
        this.dx += Math.sign(this.pad.lx) * this.pad.lx * this.pad.lx * k * 6; this.dy += Math.sign(this.pad.ly) * this.pad.ly * this.pad.ly * k * 4;
        if (this.padMode) return;
      }
    }
    if (this.touchMode) {
      const T = this.touch, s = T.stick, held = T.held, hit = T.hit;
      this.pad = { mx: s ? s.x : 0, mz: s ? -s.y : 0, lx: 0, ly: 0, jump: !!hit.jump, drop: !!hit.drop, use: !!hit.use, useHeld: !!held.use, light: !!hit.light, sprint: !!held.sprint || (s && Math.hypot(s.x, s.y) > 0.95),
        nv: !!hit.nv, aim: T.aim, throw: !!hit.throw, emote: !!hit.emote, talk: !!held.talk, tab: !!held.tab, pause: !!hit.pause, touch: true };
      if (hit.film) T.aim = !T.aim;
      T.hit = {};
    }
  }

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (!this.padMode || !this.gp) return;
    const a = this.gp.vibrationActuator;
    try { if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => {}); } catch { /* not supported */ }
  }

  // ---------- touch: left thumb stick (wherever you put it down), right side drags to look ----------
  bindTouch(root) {
    const T = this.touch, stickEl = root.querySelector('#tStick'), knob = root.querySelector('#tKnob'), zone = root.querySelector('#tZone');
    const press = (name, on) => { if (on && !T.held[name]) T.hit[name] = true; T.held[name] = on; };
    root.querySelectorAll('[data-t]').forEach((b) => {
      const name = b.dataset.t;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.setMode('touch'); press(name, true); b.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); press(name, false); b.classList.remove('on'); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    });
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.setMode('touch');
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && !T.stick) { T.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 }; stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; stickEl.classList.add('on'); }
        else if (!T.look) T.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (T.stick && t.identifier === T.stick.id) {
          let x = (t.clientX - T.stick.ox) / 56, y = (t.clientY - T.stick.oy) / 56; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
          T.stick.x = x; T.stick.y = y; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
        } else if (T.look && t.identifier === T.look.id) {
          this.dx += (t.clientX - T.look.x) * 2.2 * this.touchSens; this.dy += (t.clientY - T.look.y) * 2.2 * this.touchSens; T.look.x = t.clientX; T.look.y = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (T.stick && t.identifier === T.stick.id) { T.stick = null; stickEl.classList.remove('on'); knob.style.transform = ''; }
        if (T.look && t.identifier === T.look.id) T.look = null;
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.lmbHit = false; }
}
