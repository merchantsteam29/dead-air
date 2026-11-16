// Two browsers: host + friend over PeerJS (needs internet). Fake mics (beeps). node tools/mp.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const A = await open(import.meta.url, { args, tag: '-host' });
const B = await open(import.meta.url, { args, tag: '-friend' });
await sleep(4000);
await A.ev(`document.getElementById('nameIn').value = 'Hosty'; document.getElementById('nameIn').dispatchEvent(new Event('change')); document.getElementById('btnHost').click();`);
let code = null;
for (let i = 0; i < 30 && !code; i++) { await sleep(500); code = await A.ev(`return window.__da.session?.net?.code || null`); }
console.log('code', code);
A.check(!!code, 'host got a room code');
await B.ev(`document.getElementById('nameIn').value = 'Frendo'; document.getElementById('nameIn').dispatchEvent(new Event('change')); document.getElementById('joinCode').value = '${code}'; document.getElementById('btnJoin').click();`);
let n = 0;
for (let i = 0; i < 30 && n < 2; i++) { await sleep(500); n = await A.ev(`return window.__da.session.roster.length`); }
A.check(n === 2, 'friend joined');
await sleep(1000);
await A.shot('1-lobby');
await A.ev(`document.getElementById('btnStart').click()`);
await sleep(6000);
A.check(await B.ev(`return !!window.__da.game`), 'friend is in the night');
// friend walks, grabs the camcorder, films the host
await B.ev(`const g = window.__da.game; const c = g.items.list.find(i => i.kind === 'cam'); g.me.x = c.x; g.me.z = c.z + 1.2; g.me.yaw = 0; g.me.pitch = -0.9;`);
await sleep(600); await B.ev(`window.__da.input.pressed.add('KeyE')`); await sleep(1500);
B.check(await B.ev(`const g = window.__da.game; return !!g.items.carriedBy(g.myId)`), 'friend picked up the camcorder');
await B.ev(`const g = window.__da.game; const h = g.players.get('h'); g.me.x = h.x; g.me.z = h.z + 3; g.me.yaw = 0; g.me.pitch = -0.15; window.__da.input.rmb = true;`);
await sleep(4000);
await B.shot('2-friend-films-host');
await A.shot('2-host-view');
console.log('host sees friend at', await A.ev(`const g = window.__da.game; const p = g.players.get('p1'); return JSON.stringify([p.x, p.z, p.aim, g.items.list.map(i => i.kind === 'cam' ? [i.holder, Math.round(i.tape)] : null).filter(Boolean)])`));
// a weird thing in front of the friend's camera
await A.ev(`const g = window.__da.game; const p = g.players.get('p1'); g.things.spawn('chair', p.x, p.z - 3); g.things.spawn('dancer', p.x + 0.8, p.z - 4).s = 1;`);
await sleep(5000);
await B.shot('3-friend-films-chair');
console.log('tape', await A.ev(`const g = window.__da.game; return JSON.stringify(g.items.list.filter(i => i.kind === 'cam').map(i => [i.holder, Math.round(i.tape), Math.round(i.batt)]))`));
// the friend walks back to the van, everyone leaves
await B.ev(`window.__da.input.rmb = false; const g = window.__da.game; g.me.x = g.world.van.x + 2.4; g.me.z = g.world.van.z;`);
await A.ev(`const g = window.__da.game; g.me.x = g.world.van.x - 2.4; g.me.z = g.world.van.z;`);
await sleep(1500);
await A.ev(`window.__da.game.end('leave')`);
let scr = '';
for (let i = 0; i < 40 && !/review/.test(scr); i++) { await sleep(1000); scr = await B.ev(`return document.getElementById('review').hidden ? document.body.dataset.screen : 'review'`); }
await sleep(2500);
await B.shot('4-friend-review');
await A.shot('4-host-review');
console.log('host hl', await A.ev(`const s = window.__da.session; return JSON.stringify(Object.entries(s.hl).map(([k, h]) => [k, h.done, h.meta, h.frames.filter(Boolean).length, h.audio.filter(Boolean).length, h.audio.length]))`));
console.log('friend hl', await B.ev(`const s = window.__da.session; return JSON.stringify(Object.entries(s.hl).map(([k, h]) => [k, h.done, h.meta && h.meta.score, h.frames.length, h.audio.length]))`));
await sleep(12000);
await A.shot('5-host-summary');
await A.ev(`document.getElementById('rvNext').click()`);
await sleep(6000);
A.check(await B.ev(`return !!window.__da.game && window.__da.game.night === 2`), 'night 2 started for the friend');
await B.shot('6-night2');
srv.kill();
await B.close();
await A.done();
