// Throwing, stunning Mr. Applause, the hand stealing the camcorder. node tools/creatures.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const { ev, shot, done, url, send, check } = await open(import.meta.url);
await send('Page.navigate', { url: url + '&nomic&autostart' });
await sleep(6000);
const g = 'window.__da.game';
const waitGame = async (secs, cond = 'false') => { const t0 = await ev(`return ${g}.time`); for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`return (${g}.time - ${t0} > ${secs}) || (${cond})`)) break; } console.log('  waited', (await ev(`return ${g}.time`) - t0).toFixed(1), 'game s'); };
// open ground in front of the van, facing north
await ev(`const g = ${g}; g.schedule = []; g.me.x = g.world.van.x; g.me.z = g.world.van.z - 6; g.me.yaw = 0; g.me.pitch = 0;
  for (const t of [...g.things.list]) g.things.remove(t);`);
await sleep(300);
// hold a bucket, Applause 6 m ahead
await ev(`const g = ${g}; const b = g.items.add('bucket', g.me.x, g.me.z - 0.5); b.holder = g.myId; window.__ap = g.things.spawn('applause', g.me.x, g.me.z - 6, { yaw: Math.PI });`);
await sleep(800);
await ev(`window.__da.input.lmbHit = true;`);
await sleep(100); await ev(`window.__da.input.lmbHit = true;`);
await sleep(1500);
console.log('applause after throw', await ev(`return JSON.stringify({ s: __ap.s, x: __ap.x, z: __ap.z, me: [${g}.me.x, ${g}.me.z] })`));
await shot('1-stunned');
check(await ev(`return __ap.s === 4 || __ap.s === 3`), 'Applause stunned (or posing) after the throw');
// let him come and get me while I'm loud
await ev(`const g = ${g}; g.micLevel = () => 0.6;`);
await waitGame(12, `${g}.me.dead`);
console.log('me dead?', await ev(`return ${g}.me.dead`));
await shot('2-caught');
// hand steals
await ev(`const g = ${g}; g.me.dead = false; g.micLevel = () => 0; for (const t of [...g.things.list]) g.things.remove(t); g.me.x = g.world.van.x; g.me.z = g.world.van.z - 8;
  const c = g.items.list.find(i => i.kind === 'cam'); c.holder = g.myId; window.__hand = g.things.spawn('hand', g.me.x + 4, g.me.z);`);
await waitGame(6, `__hand.s === 2`);
console.log('hand', await ev(`const g = ${g}; const c = g.items.list.find(i => i.kind === 'cam'); return JSON.stringify({ s: __hand.s, holder: c.holder, down: g.me.down })`));
check(await ev(`const g = ${g}; return g.items.list.find(i => i.kind === 'cam').holder === 'T' + __hand.id`), 'the hand stole the camcorder');
await shot('3-stolen');
srv.kill(); await done();
