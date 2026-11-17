// Menus, settings, the crew's season (host), and the frame loop.
import * as THREE from 'three';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Game, NIGHT_SECS } from './game.js';
import { Session, cleanLook } from './session.js';
import { TapeRec } from './tape.js';
import { Review } from './review.js';
import { recordNight, renderChannel } from './stats.js';
import { tutorialWanted, resetTutorial } from './tutorial.js';
import { Crew, COLORS, COLOR_NAMES, HATS } from './models.js';
import { cleanCode, cleanName, QUICK_CODES, probe } from './net.js';
import { fmt, clamp } from './util.js';
import { createGovernor } from '../perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const NIGHTS = 3;

// ---------- settings ----------
const DEFAULTS = { name: '', color: Math.floor(Math.random() * 8), hat: 'cap', sens: 1, fov: 75, vol: 0.8, voiceVol: 1, voiceMode: 'clear', mic: 'open', pads: true, quality: 'auto', bright: 1, padSens: 1 };
const settings = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('deadair.settings') || '{}') }; } catch { return { ...DEFAULTS }; } })();
if (!settings.name) settings.name = 'Crew' + Math.floor(100 + Math.random() * 900);
const save = () => { try { localStorage.setItem('deadair.settings', JSON.stringify(settings)); } catch { /* private mode */ } };
const records = (() => { try { return JSON.parse(localStorage.getItem('deadair.records') || '{}'); } catch { return {}; } })();
const saveRecords = () => { try { localStorage.setItem('deadair.records', JSON.stringify(records)); } catch { /* private mode */ } };

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15 * settings.bright;
const basePR = () => Math.min(devicePixelRatio, settings.quality === 'low' ? 0.75 : settings.quality === 'high' ? 2 : 1.5);
renderer.setPixelRatio(basePR());
renderer.setSize(innerWidth, innerHeight);
const gov = createGovernor({ apply: (s) => { renderer.setPixelRatio(basePR() * s); renderer.setSize(innerWidth, innerHeight); game?.resize(); } });

const sfx = new Sfx();
sfx.vol = settings.vol;
const input = new Input(canvas);
input.pads = settings.pads; input.padSens = settings.padSens;
document.body.classList.add('input-keys');
input.bindTouch($('touch'));
if (matchMedia('(pointer: coarse)').matches) input.setMode('touch');
const review = new Review(sfx);
let tape = null;

// ---------- title screen 3D: the crew standing around the van ----------
const title = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100) };
(() => {
  const s = title.scene;
  s.background = new THREE.Color(0x0b1020); s.fog = new THREE.FogExp2(0x0b1020, 0.07);
  s.add(new THREE.HemisphereLight(0x8090c0, 0x202018, 0.5));
  const key = new THREE.SpotLight(0xfff1d0, 30, 20, 0.6, 0.6, 1.2); key.position.set(2, 4, 4); s.add(key, key.target);
  const g = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshLambertMaterial({ color: 0x1d2a1c })); g.rotation.x = -Math.PI / 2; s.add(g);
  title.crew = [0, 1, 2, 3].map((i) => { const c = new Crew([0, 1, 2, 3][i], HATS[i]); c.root.position.set([-3.3, -2.2, 2.2, 3.3][i], 0, i === 0 || i === 3 ? 0.4 : 0); c.root.rotation.y = Math.PI + [-0.5, -0.2, 0.2, 0.5][i] * -1; s.add(c.root); return c; });
  for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.2, 5, 6), new THREE.MeshLambertMaterial({ color: 0x0f2117, flatShading: true })); t.position.set(-8 + i * 2 + Math.random(), 2.5, -5 - Math.random() * 3); s.add(t); }
  title.cam.position.set(0, 1.4, 5); title.cam.lookAt(0, 1, 0);
})();
function drawTitle(dt) {
  const t = performance.now() / 1000;
  // the one on the left is you: rebuilt when your colour or hat changes
  const look = settings.color + '/' + settings.hat;
  if (title.look !== look) {
    title.look = look;
    const old = title.crew[0], n = new Crew(settings.color, settings.hat);
    n.root.position.copy(old.root.position); n.root.rotation.y = old.root.rotation.y;
    title.scene.remove(old.root); title.scene.add(n.root); title.crew[0] = n;
  }
  title.crew.forEach((c, i) => {
    c.update(dt, { speed: 0, talk: Math.max(0, Math.sin(t * 2 + i * 2)) * 0.12 * (Math.sin(t * 0.5 + i) > 0.3 ? 1 : 0), light: true, wave: i === 2 && Math.sin(t * 0.4) > 0.6 });
  });
  title.cam.position.x = Math.sin(t * 0.15) * 0.6;
  title.cam.lookAt(0, 1, 0);
  renderer.render(title.scene, title.cam);
}

// ---------- screens ----------
const SCREENS = ['title', 'lobby', 'howto', 'settings', 'pause', 'uploading', 'msg', 'channel', 'quick', 'rejoining'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; document.body.dataset.screen = id || 'game'; }
function msg(text, back = 'title') { $('msgText').textContent = text; show('msg'); $('msgOk').onclick = () => { sfx.play('click'); show(back); }; }

let session = null, game = null, run = null, mic = null, micLevel = () => 0, micRaw = () => 0, micMuted = false, micOpen = true, paused = false, endInfo = null;

// Push to talk: the mic track is only on while V / R3 / TALK is held. (The same track feeds voice chat and the tape.)
function updateMicGate() {
  const held = input.down('KeyV') || !!input.pad?.talk;
  const open = !micMuted && (settings.mic !== 'ptt' || held);
  document.body.classList.toggle('ptt', settings.mic === 'ptt');
  if (open === micOpen) return;
  micOpen = open;
  if (mic) for (const t of mic.getAudioTracks()) t.enabled = open;
  const ind = $('micInd');
  ind.classList.toggle('talking', open && settings.mic === 'ptt');
}

// ---------- the microphone ----------
async function getMic() {
  if (mic !== null || params.has('nomic')) return mic;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) { mic = false; console.warn('no mic', e); return null; }
  const ctx = sfx.ctx, src = ctx.createMediaStreamSource(mic), an = ctx.createAnalyser();
  an.fftSize = 512; src.connect(an);
  src.connect(sfx.recMix); // the camcorder hears you
  const buf = new Float32Array(an.fftSize);
  let lvl = 0, last = 0;
  micRaw = () => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return clamp((Math.sqrt(s / buf.length) - 0.012) * 7, 0, 1); };
  micLevel = () => {
    if (micMuted || !micOpen) return 0;
    const now = performance.now();
    if (now - last < 30) return lvl;
    last = now;
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length), v = clamp((rms - 0.012) * 7, 0, 1);
    lvl = v > lvl ? v : lvl * 0.85 + v * 0.15;
    return lvl;
  };
  return mic;
}
function setMute(m) {
  micMuted = m;
  $('micInd').classList.toggle('muted', m);
  micOpen = null; updateMicGate(); micLabel();
}

function micLabel() {
  $('micInd').textContent = micMuted ? '🎤✕ muted (M)' : settings.mic === 'ptt' ? `🎤 hold ${input.label('V', 'R3').replace(/[\[\]]/g, '')} to talk` : '🎤';
}

async function boot() {
  sfx.init();
  if (!tape) { tape = new TapeRec(sfx); await tape.init(); }
  sfx.setVolume(settings.vol);
}

// ---------- starting a crew ----------
async function playAlone() {
  await boot(); await getMic();
  session = new Session({ sfx, mic: mic || null, name: settings.name, look: cleanLook(settings) });
  session.solo();
  wireSession();
  newRun();
  startNight();
}
// Quick Play: there's no server, so public rooms use a fixed set of codes. probe() looks in all of them at once.
let quickT = null;
async function listQuick() {
  clearTimeout(quickT);
  const box = $('quickList');
  box.innerHTML = '<p class="hint">Looking for public crews...</p>';
  const r = await probe(QUICK_CODES, 6000);
  if ($('quick').hidden) return;
  const rooms = r.open.map((c) => ({ code: c, ...(r.info[c] || {}) })).filter((x) => x.mode !== 'private');
  box.innerHTML = rooms.length ? rooms.map((x) => `<div class="qrow"><b>${esc(x.host || 'Room ' + x.code)}'s crew</b><span>${'●'.repeat(x.n || 1)}${'○'.repeat(Math.max(0, (x.max || 4) - (x.n || 1)))}</span><small>${x.started ? 'out filming' : 'in the lobby'}${x.map ? ' · ' + esc(x.map) : ''}</small><button data-q="${x.code}" ${x.started || (x.n || 1) >= (x.max || 4) ? 'disabled' : ''}>${(x.n || 1) >= (x.max || 4) ? 'Full' : x.started ? 'Filming' : 'Join'}</button></div>`).join('')
    : '<p class="hint">No public crews right now. Host one and others can find you here.</p>';
  box.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { sfx.play('click'); clearTimeout(quickT); joinCrew(b.dataset.q); });
  quickT = setTimeout(() => { if (!$('quick').hidden) listQuick(); }, 20000);
}

async function hostCrew(code, isPublic = false) {
  await boot(); await getMic();
  session = new Session({ sfx, mic: mic || null, name: settings.name, look: cleanLook(settings) });
  wireSession();
  $('lobbyStatus').textContent = 'Opening a room...';
  show('lobby');
  session.public = isPublic;
  try { await session.host(code); } catch (e) { session = null; msg(e.message); return; }
  newRun();
  session.lobbyExtra = () => ({ run: run && { season: run.season, night: run.night, quota: run.quota, seasonViews: run.seasonViews } });
  renderLobby();
  history.replaceState(null, '', location.pathname + '?join=' + session.net.code);
}
async function joinCrew(code) {
  code = cleanCode(code);
  if (code.length !== 4) { msg('Room codes are 4 letters.'); return; }
  await boot(); await getMic();
  session = new Session({ sfx, mic: mic || null, name: settings.name, look: cleanLook(settings) });
  wireSession();
  $('lobbyStatus').textContent = 'Joining ' + code + '...';
  show('lobby');
  try { await session.join(code); } catch (e) { session = null; msg(e.message); return; }
  renderLobby();
}
// Dropped out of a night: try to get back in (the host keeps your place for 45 s), else back to the title.
async function lostConnection(why) {
  if (!session || session.isHost || !session.online || !session.net.secret || !(game || !$('review').hidden || !$('uploading').hidden)) { leaveCrew(why); return; }
  const was = session;
  endGame(); review.hide(); input.unlock();
  show('rejoining');
  const ok = await was.rejoin((i) => { $('rejoinText').textContent = `Lost the connection. Getting you back in${'.'.repeat(1 + (i % 3))} (try ${i + 1})`; });
  if (session !== was) return; // they left meanwhile
  if (!ok) { leaveCrew('Lost the connection to the host, and could not get back in.'); return; }
  $('rejoinText').textContent = 'Back in! Waiting for the host...';
  // the host sends tonight's start again ('resume'); between nights we just land in the lobby
  setTimeout(() => { if (session === was && !game && !$('rejoining').hidden) { show('lobby'); renderLobby(); } }, 6000);
}
let lastStart = null;

function leaveCrew(why) {
  endGame();
  review.hide();
  session?.leave(); session = null; run = null;
  history.replaceState(null, '', location.pathname);
  input.unlock();
  if (why) msg(why); else show('title');
}

function wireSession() {
  session.onLobby = () => { if (!game && $('lobby').hidden === false) renderLobby(); };
  session.onClose = (why) => lostConnection(why || 'Lost the connection.');
  session.onRejoin = (id) => { // host: a friend is back; put them straight back into tonight
    if (!game || game.over || !lastStart) return;
    const P = game.players.get(id);
    session.net.sendTo(id, { ...lastStart, resume: { time: game.time, x: P?.x, z: P?.z, yaw: P?.yaw } });
    game.toast(`${P?.name || 'Someone'} is back.`, 3);
  };
  session.peekInfo = () => ({ mode: session.public ? 'public' : 'private', map: run ? `Season ${run.season} · night ${run.night}` : '' });
  session.onGame = (m, from) => {
    if (m.t === 'quit' && session.isHost && !game) { session.sendLobby(); return; }
    game?.onNet(m, from);
  };
  session.onFlow = (m) => {
    if (m.t === 'start') beginNight(m);
    if (m.t === 'review') showReview(m);
    if (m.t === 'lobby') { endGame(); review.hide(); show('lobby'); renderLobby(); }
  };
}

function newRun() {
  run = { season: 1, night: 1, seasonViews: 0, quota: quotaFor(1), seed: Math.floor(Math.random() * 1e9) };
}
function quotaFor(season) {
  const n = Math.max(1, session?.roster.length || 1);
  return Math.round(((2400 + 1100 * (n - 1)) * (1 + 0.6 * (season - 1))) / 100) * 100;
}

// host: begin the next night for everyone
function startNight() {
  if (!session?.isHost) return;
  if (run.night === 1 && run.seasonViews === 0) run.quota = quotaFor(run.season); // the crew size can change between seasons
  session.net.locked = true;
  session.resetHighlights();
  lastStart = { t: 'start', seed: (run.seed + run.season * 1013 + run.night * 7919) >>> 0, night: run.night, season: run.season, quota: run.quota, seasonViews: run.seasonViews, nightOf: NIGHTS, crew: session.crew() };
  session.net.broadcast(lastStart);
}

function beginNight(m) {
  endGame();
  review.hide();
  if (!m.resume) { session.resetHighlights(); tape.reset(); }
  show(null);
  paused = false;
  run = run || {};
  Object.assign(run, { season: m.season, night: m.night, quota: m.quota, seasonViews: m.seasonViews });
  game = new Game({ renderer, sfx, input, net: session.net, vc: session.vc, tape, myId: session.myId, crew: m.crew, seed: m.seed, night: m.night, season: m.season, quota: m.quota, seasonViews: m.seasonViews, nightOf: m.nightOf, settings, micLevel: () => micLevel(), onEnd: onNightEnd, tutorial: !session.online && m.night === 1 && m.season === 1 && (tutorialWanted() || params.has('tutorial')) });
  if (session.vc) { session.vc.mode = settings.voiceMode; session.vc.volume = settings.voiceVol; }
  gov.reset();
  micLabel();
  if (!input.touchMode && !input.padMode) input.lock();
  if (m.resume) { // back after a drop: pick up where the night is, standing where we were
    game.time = m.resume.time;
    if (m.resume.x !== undefined) { game.me.x = game.me.rx = m.resume.x; game.me.z = game.me.rz = m.resume.z; game.me.yaw = m.resume.yaw || 0; }
    game.toast("You're back in.", 3);
  }
  if (TEST) window.__da.game = game;
}

function endGame() {
  if (!game) return;
  game.dispose(); game = null;
}

// ---------- after a night ----------
function onNightEnd(end) {
  endInfo = end;
  input.unlock();
  setTimeout(() => {
    if (!game) return;
    show('uploading');
    $('upText').textContent = end.reason === 'dead' ? 'Nobody came back...' : 'Driving back. Uploading the tapes...';
    const saved = end.cams.filter((c) => c.saved).map((c) => c.id);
    session.shareHighlights(tape.highlights(saved));
    if (session.isHost) hostAfterNight(end);
  }, 2600);
}

function hostAfterNight(end) {
  run.seasonViews += end.views;
  const lastNight = run.night >= NIGHTS;
  const verdict = lastNight ? (run.seasonViews >= run.quota ? 'renewed' : 'cancelled') : null;
  const names = Object.fromEntries(session.roster.map((r) => [r.id, r.name]));
  const t0 = performance.now();
  const wait = setInterval(() => {
    const ids = session.roster.map((r) => r.id);
    const allIn = ids.every((id) => session.hlEnds.has(id));
    const keys = Object.keys(session.hl).filter((k) => session.hl[k].meta);
    const ready = allIn && session.hlReady(keys);
    if (!(ready || performance.now() - t0 > 25000)) return;
    clearInterval(wait);
    const sorted = keys.filter((k) => session.hl[k].done).sort((a, b) => session.hl[b].meta.score - session.hl[a].meta.score).slice(0, 4);
    session.net.broadcast({ t: 'review', keys: sorted, info: { season: run.season, night: run.night, nightOf: NIGHTS, quota: run.quota, seasonViews: run.seasonViews, end, verdict, names, place: game?.world.name || '', type: game?.world.type, seed: run.seed + run.night } });
    if (verdict === 'cancelled') { records.best = Math.max(records.best || 0, (run.season - 1) * NIGHTS + run.night); saveRecords(); }
    session.net.locked = false;
  }, 300);
}

async function showReview(m) {
  // wait (a little) for clips still on the way
  const t0 = performance.now();
  while (!session.hlReady(m.keys) && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 250));
  endGame();
  show(null);
  const info = m.info;
  if (!session.isHost) Object.assign(run || (run = {}), { season: info.season, night: info.night, seasonViews: info.seasonViews, quota: info.quota });
  $('rvNext').hidden = !session.isHost; $('rvLobby').hidden = !session.isHost || !session.online; $('rvWait').hidden = session.isHost;
  $('rvNext').textContent = info.verdict === 'cancelled' ? (session.online ? 'Back to the lobby' : 'Back to the title') : info.verdict === 'renewed' ? `Start season ${info.season + 1}` : `Next night (${info.night + 1} of ${info.nightOf})`;
  $('rvNext').dataset.v = info.verdict || '';
  const clips = m.keys.map((k) => session.highlight(k)).filter(Boolean);
  review.play(clips, info);
  try { recordNight(info, session.myId, review.title, info.type); } catch (e) { console.warn('stats', e); }
}

$('rvNext').onclick = () => {
  sfx.play('click');
  if (!session?.isHost) return;
  const v = $('rvNext').dataset.v;
  if (v === 'cancelled') {
    newRun();
    if (session.online) { session.net.broadcast({ t: 'lobby' }); } else leaveCrew();
    return;
  }
  if (v === 'renewed') { run.season++; run.night = 1; run.seasonViews = 0; run.quota = quotaFor(run.season); }
  else run.night++;
  startNight();
};
$('rvLobby').onclick = () => { sfx.play('click'); newRun(); session?.net.broadcast({ t: 'lobby' }); };
$('rvSkip').onclick = () => { review.stopped = true; };

// ---------- lobby ----------
function renderLobby() {
  if (!session) return;
  const code = session.net.code;
  $('lobbyStatus').textContent = session.isHost ? (session.public ? 'Public crew: anyone on Quick Play can join. Or share the code:' : 'You are the host. Friends join with this code:') : 'In the crew. Waiting for the host to start.';
  $('lobbyCode').textContent = code || '';
  const link = `${location.origin}${location.pathname}?join=${code}`;
  $('lobbyLink').value = link;
  const r = session.isHost ? run : session.lobbyState?.run;
  $('lobbyRun').textContent = r ? `Season ${r.season} · next: night ${r.night} of ${NIGHTS} · ${fmt(r.seasonViews)} / ${fmt(r.quota)} views` : '';
  $('lobbyList').innerHTML = session.crew().map((c) => `<li><i style="background:#${new THREE.Color(COLORS[c.color]).getHexString()}"></i>${esc(c.name)}${c.id === session.myId ? ' <em>(you)</em>' : ''}${c.id === 'h' ? ' <span>host</span>' : ''}</li>`).join('');
  $('btnStart').hidden = !session.isHost;
  $('btnStart').textContent = session.roster.length > 1 ? `Start night (${session.roster.length} crew)` : 'Start night (just you? invite someone!)';
}
function lookPicker(root) {
  root.innerHTML = COLORS.map((c, i) => `<button class="sw${settings.color === i ? ' on' : ''}" data-c="${i}" title="${COLOR_NAMES[i]}" style="background:#${new THREE.Color(c).getHexString()}"></button>`).join('')
    + `<select data-hat>${HATS.map((h) => `<option ${settings.hat === h ? 'selected' : ''}>${h}</option>`).join('')}</select>`;
  root.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { settings.color = +b.dataset.c; save(); sfx.play('click'); lookPicker(root); session?.setLook(cleanLook(settings)); });
  root.querySelector('[data-hat]').onchange = (e) => { settings.hat = e.target.value; save(); session?.setLook(cleanLook(settings)); };
}

// ---------- buttons ----------
const click = (id, f) => $(id).addEventListener('click', (e) => { sfx.init(); sfx.play('click'); f(e); });
click('btnSolo', () => playAlone());
click('btnHost', () => hostCrew());
click('btnJoin', () => joinCrew($('joinCode').value));
$('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCrew($('joinCode').value); });
click('btnHow', () => show('howto'));
click('btnQuick', () => { show('quick'); listQuick(); });
click('quickBack', () => { clearTimeout(quickT); show('title'); });
click('quickRefresh', () => listQuick());
click('quickHost', async () => {
  $('quickList').innerHTML = '<p class="hint">Finding a free public room...</p>';
  const r = await probe(QUICK_CODES, 5000);
  const code = r.free[Math.floor(Math.random() * r.free.length)];
  if (!code) { $('quickList').innerHTML = '<p class="hint">Every public room is busy. Try one of them, or host a private crew.</p>'; return; }
  clearTimeout(quickT);
  await hostCrew(code, true);
});
click('btnChannel', () => { renderChannel($('chBody'), settings.name, '#' + new THREE.Color(COLORS[settings.color]).getHexString()); show('channel'); });
click('chBack', () => show('title'));
click('btnSettings', () => { settingsBack = game ? 'pause' : 'title'; fillSettings(); show('settings'); });
click('howBack', () => show('title'));
click('btnTutorial', () => { resetTutorial(); $('btnTutorial').textContent = 'Done: the next Play alone starts with it'; });
click('btnStart', () => startNight());
click('btnLeaveLobby', () => leaveCrew());
click('btnCopy', () => { navigator.clipboard?.writeText($('lobbyLink').value).then(() => { $('btnCopy').textContent = 'Copied!'; setTimeout(() => $('btnCopy').textContent = 'Copy invite link', 1500); }).catch(() => $('lobbyLink').select()); });
click('pResume', () => resume());
click('pSettings', () => { settingsBack = 'pause'; fillSettings(); show('settings'); });
click('pLeave', () => leaveCrew());
click('pMute', () => setMute(!micMuted));
let settingsBack = 'title';
click('setBack', () => show(settingsBack));
click('micTestBtn', async () => { await boot(); await getMic(); $('micTestNote').textContent = mic ? 'Say something: the bar should move.' : 'No microphone (or it was blocked). You can still play.'; });
$('nameIn').value = settings.name;
$('nameIn').addEventListener('change', () => { settings.name = cleanName($('nameIn').value); $('nameIn').value = settings.name; save(); });
lookPicker($('lookPick'));
lookPicker($('lookPick2'));
if (records.best) $('bestLine').textContent = `Longest run: ${records.best} night${records.best === 1 ? '' : 's'}`;

function fillSettings() {
  const s = settings;
  const rows = [
    ['Mouse sensitivity', 'range', 'sens', 0.2, 3, 0.05],
    ['Controller look speed', 'range', 'padSens', 0.3, 2.5, 0.05],
    ['Field of view', 'range', 'fov', 60, 100, 1],
    ['Volume', 'range', 'vol', 0, 1, 0.05],
    ["Friends' voices", 'range', 'voiceVol', 0, 1.5, 0.05],
    ['Brightness', 'range', 'bright', 0.6, 1.8, 0.05],
    ['Microphone', 'select', 'mic', [['open', 'Open mic (always on)'], ['ptt', 'Push to talk (hold V / R3 / TALK)']]],
    ["How friends' voices sound", 'select', 'voiceMode', [['clear', 'Clear (like a call, best quality)'], ['3d', '3D (comes from where they are)']]],
    ['Graphics', 'select', 'quality', [['auto', 'Auto'], ['high', 'Sharp'], ['low', 'Fast']]],
    ['Controllers', 'select', 'pads', [['true', 'On'], ['false', 'Off (ignore every gamepad)']]],
  ];
  $('setRows').innerHTML = rows.map(([label, type, key, a, b, st]) => type === 'range'
    ? `<label>${label}<input type="range" data-k="${key}" min="${a}" max="${b}" step="${st}" value="${s[key]}"><output>${(+s[key]).toFixed(2).replace(/\.?0+$/, '')}</output></label>`
    : `<label>${label}<select data-k="${key}">${a.map(([v, t]) => `<option value="${v}" ${String(s[key]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('');
  $('setRows').querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => {
    const k = el.dataset.k;
    s[k] = el.type === 'range' ? +el.value : el.value === 'true' ? true : el.value === 'false' ? false : el.value;
    if (el.nextElementSibling?.tagName === 'OUTPUT') el.nextElementSibling.textContent = (+el.value).toFixed(2).replace(/\.?0+$/, '');
    applySettings(); save();
  }));
}
function applySettings() {
  sfx.setVolume(settings.vol);
  renderer.toneMappingExposure = 1.15 * settings.bright;
  input.pads = settings.pads; input.padSens = settings.padSens;
  micOpen = null; updateMicGate(); micLabel();
  if (session?.vc) { session.vc.mode = settings.voiceMode; session.vc.volume = settings.voiceVol; }
  renderer.setPixelRatio(basePR() * gov.scale); renderer.setSize(innerWidth, innerHeight); game?.resize();
}

// ---------- pause ----------
function openPause() {
  if (!game || game.over || paused) return;
  paused = true;
  input.unlock();
  $('pMute').textContent = micMuted ? 'Unmute mic' : 'Mute mic';
  $('pauseNote').textContent = session.online ? `Room ${session.net.code} · the night goes on while you're here.` : 'Paused.';
  show('pause');
}
function resume() {
  paused = false;
  show(null);
  if (!input.touchMode && !input.padMode) input.lock();
}
document.addEventListener('pointerlockchange', () => { if (!input.locked && game && !game.over && !paused && input.mode === 'keys' && document.body.dataset.screen === 'game') openPause(); });
canvas.addEventListener('click', () => { if (game && !paused && !game.over) input.lock(); });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && game) setMute(!micMuted);
  if (e.code === 'Escape' && paused && game) resume();
});

// ---------- the loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, raw);
  input.pollPad(dt);
  updateMicGate();
  if (!$('settings').hidden) $('micBar').style.width = (micRaw() * 100).toFixed(0) + '%';
  if (input.pad?.pause && game && !game.over) { if (paused) resume(); else openPause(); }
  if (game) {
    if (paused && !session.online) { /* frozen alone */ }
    else {
      if (paused) { input.dx = input.dy = 0; input.pressed.clear(); input.lmbHit = false; }
      game.frame(dt);
    }
    game.render();
    gov.tick(raw);
  } else if (!$('title').hidden || !$('lobby').hidden || !$('settings').hidden || !$('howto').hidden || !$('channel').hidden) drawTitle(dt);
  input.endFrame();
}
requestAnimationFrame(loop);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); title.cam.aspect = innerWidth / innerHeight; title.cam.updateProjectionMatrix(); game?.resize(); });

// ---------- start ----------
show('title');
document.body.classList.add('ready');
const joinParam = params.get('join');
if (joinParam) { $('joinCode').value = cleanCode(joinParam); $('joinHint').hidden = false; }
if (TEST) window.__da = { get session() { return session; }, settings, playAlone, hostCrew, joinCrew, startNight, sfx, input, renderer, get run() { return run; }, micTrack: () => mic ? mic.getAudioTracks()[0].enabled : null };
if (params.has('autostart')) playAlone();

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export { NIGHT_SECS };
