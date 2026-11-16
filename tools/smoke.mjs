// Smoke test: title screen, then a solo night (no mic). Screenshots in tools/shots/smoke/.
// node tools/smoke.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const { ev, shot, done, check, url, send } = await open(import.meta.url);
await sleep(4000);
await shot('1-title');
await send('Page.navigate', { url: url + '&nomic&autostart' });
await sleep(7000);
const g = 'window.__da.game';
check(await ev(`return !!${g}`), 'game started');
await shot('2-start');
console.log(await ev(`const g = ${g}; return JSON.stringify({ name: g.world.name, things: g.things.list.map(t => t.kind), items: g.items.list.length, me: [g.me.x, g.me.z] })`));
// walk forward and look around
await ev(`window.__da.input.keys.add('KeyW')`); await sleep(1500); await ev(`window.__da.input.keys.delete('KeyW')`);
await shot('3-walk');
// grab the camcorder: teleport next to it, look at it, press E
await ev(`const g = ${g}; const c = g.items.list.find(i => i.kind === 'cam'); g.me.x = c.x; g.me.z = c.z + 1.2; g.me.yaw = 0; g.me.pitch = -0.9;`);
await sleep(400); await ev(`window.__da.input.pressed.add('KeyE')`);
await sleep(800);
check(await ev(`const g = ${g}; return !!g.items.carriedBy(g.myId)`), 'picked up the camcorder');
// film the nearest weird thing
await ev(`const g = ${g}; const t = g.things.list.find(t => t.kind !== 'balloon' && t.kind !== 'applause') || g.things.list[0]; const a = Math.random()*6.28; g.me.x = t.x + Math.sin(a)*3; g.me.z = t.z + Math.cos(a)*3; window.__tgt = t;
  const p = {x: g.me.x, z: g.me.z}; g.world.collide(p, 0.32); g.me.x = p.x; g.me.z = p.z;
  g.me.yaw = Math.atan2(-(t.x - g.me.x), -(t.z - g.me.z)); g.me.pitch = -0.1; window.__da.input.rmb = true; return t.kind;`);
await sleep(3500);
await shot('4-filming');
console.log('filming', await ev(`const g = ${g}; const c = g.items.carriedBy(g.myId); return JSON.stringify({ aiming: g.cam.aiming, tape: c && c.tape, batt: c && c.batt, kind: window.__tgt.kind, rate: g.cam.rate })`));
await ev(`window.__da.input.rmb = false`);
// spawn Mr. Applause right in front and film him
await ev(`const g = ${g}; const f = {x: -Math.sin(g.me.yaw), z: -Math.cos(g.me.yaw)}; g.things.spawn('applause', g.me.x + f.x * 4, g.me.z + f.z * 4); window.__da.input.rmb = true;`);
await sleep(2500);
await shot('5-applause');
await sleep(3000);
console.log('after applause', await ev(`const g = ${g}; return JSON.stringify({ dead: g.me.dead, tape: g.items.list.filter(i=>i.kind==='cam').map(i=>i.tape) })`));
await shot('6-after');
// end the night
await ev(`window.__da.input.rmb = false; const g = ${g}; g.end('time')`);
await sleep(9000);
await shot('7-review');
console.log('screen', await ev(`return document.body.dataset.screen + ' review hidden=' + document.getElementById('review').hidden`));
await sleep(8000);
await shot('8-summary');
srv.kill();
await done();
