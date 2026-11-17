// Two browsers: the Intern (stalks a loner, exposed on camera), the Mascot (frozen while filmed), the ghost dog (fetch).
// node tools/creatures2.mjs (needs internet for PeerJS)
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
await A.ev(`document.getElementById('btnHost').click()`);
let code = null;
for (let i = 0; i < 30 && !code; i++) { await sleep(500); code = await A.ev(`return window.__da.session?.net?.code || null`); }
for (let tries = 0; tries < 4; tries++) { // (the free PeerJS server is sometimes slow: try again)
  await B.ev(`document.getElementById('msgOk')?.click(); document.getElementById('joinCode').value = '${code}'; document.getElementById('btnJoin').click();`);
  let n = 0; for (let i = 0; i < 40; i++) { await sleep(500); n = await A.ev(`return window.__da.session.roster.length`); if (n === 2 || await B.ev(`return document.body.dataset.screen === 'msg'`)) break; }
  if (n === 2) break; console.log('join retry');
}
A.check(await A.ev(`return window.__da.session.roster.length`) === 2, 'friend joined');
await A.ev(`document.getElementById('btnStart').click()`);
await sleep(6000);
const g = 'window.__da.game';
const waitGame = async (X, secs, cond = 'false') => { const t0 = await X.ev(`return ${g}.time`); for (let i = 0; i < 400; i++) { await sleep(250); if (await X.ev(`return (${g}.time - ${t0} > ${secs}) || (${cond})`)) break; } return X.ev(`return ${cond}`); };
console.log('START', await B.ev(`return JSON.stringify({ game: !!window.__da.game, screen: document.body.dataset.screen, msg: document.getElementById('msgText').textContent })`));
// an open spot: plain ground with a clear 14 m view north
const OPEN = `(() => { const W = ${g}.world; for (let z = W.H - 20; z > 20; z--) for (let x = 10; x < W.W - 10; x++) { let ok = true; for (let d = -2; d <= 16 && ok; d++) for (let dx = -2; dx <= 2 && ok; dx++) if (W.cell(x + dx + 0.5, z - d + 0.5) !== 0) ok = false; if (ok && !W.inVan(x, z)) return { x: x + 0.5, z: z + 0.5 }; } return { x: W.van.x, z: W.van.z - 7 }; })()`;
// clear the night: no other creatures
await A.ev(`const G = ${g}; G.schedule = []; for (const t of [...G.things.list]) G.things.remove(t); G.rain.plan = null; G.dons.next = 1e9;`);
// ---- the ghost dog: the host throws a bucket
await A.ev(`const G = ${g}; const W = G.world; const o = ${OPEN}; window.__o = o; G.me.x = o.x; G.me.z = o.z; G.me.yaw = 0; G.me.pitch = 0.1;
  window.__dog = G.things.spawn('dog', G.me.x + 2, G.me.z - 1); const b = G.items.add('bucket', G.me.x, G.me.z); b.holder = G.myId;`);
await B.ev(`const G = ${g}; const o = ${OPEN}; G.me.x = o.x + 1.5; G.me.z = o.z + 1; G.me.yaw = 0.4;`);
await sleep(800);
await A.ev(`window.__da.input.lmbHit = true;`);
A.check(await waitGame(A, 8, `__dog.s === 2`), 'the dog picked up the thrown bucket');
await A.shot('1-dog-fetch');
A.check(await waitGame(A, 15, `__dog.s === 3`), 'the dog brought it back');
await B.shot('1-friend-sees-dog');
console.log('STATE', await A.ev(`return JSON.stringify({ roster: window.__da.session.roster.map(r => r.id), players: [...${g}.players.keys()], away: [...window.__da.session.net.away.keys()] })`), await B.ev(`return JSON.stringify({ game: !!window.__da.game, closed: window.__da.session?.net?.closed, screen: document.body.dataset.screen, msg: document.getElementById('msgText').textContent })`));
// ---- the mascot: awake, frozen while the host films it
await A.ev(`const G = ${g}; G.things.remove(__dog); const c = G.items.list.find(i => i.kind === 'cam'); c.holder = G.myId; c.batt = 100;
  window.__m = G.things.spawn('mascot', G.me.x, G.me.z - 9, { yaw: 0, s: 1 }); G.me.yaw = 0; G.me.pitch = 0; window.__da.input.rmb = true;`);
A.check(await waitGame(A, 4, `__m.s === 2`), 'the mascot froze while filmed');
const z0 = await A.ev(`return __m.z`);
await waitGame(A, 2);
A.check(Math.abs(await A.ev(`return __m.z`) - z0) < 0.05, 'the mascot did not move while filmed');
await A.shot('2-mascot-frozen');
await A.ev(`window.__da.input.rmb = false;`);
await waitGame(A, 1.5);
A.check(await A.ev(`return __m.s === 1 && Math.abs(__m.z - ${z0}) > 0.3`), 'the mascot moves when nobody films it');
await A.shot('3-mascot-moving');
console.log('STATE', await A.ev(`return JSON.stringify({ roster: window.__da.session.roster.map(r => r.id), players: [...${g}.players.keys()], away: [...window.__da.session.net.away.keys()] })`), await B.ev(`return JSON.stringify({ game: !!window.__da.game, closed: window.__da.session?.net?.closed, screen: document.body.dataset.screen, msg: document.getElementById('msgText').textContent })`));
// ---- the intern: the friend wanders off alone, the intern follows; the friend films it and exposes it
await A.ev(`const G = ${g}; G.things.remove(__m); G.me.x = G.world.van.x; G.me.z = G.world.van.z;
  window.__in = G.things.spawn('intern', 0, 0, { s: 5, wake: G.time, y: -10 });`);
await B.ev(`const G = ${g}; const o = ${OPEN}; G.me.x = o.x; G.me.z = o.z - 14; G.me.yaw = Math.PI;`);
A.check(await waitGame(A, 25, `__in.s === 1`), 'the intern goes after the friend on their own');
console.log('intern copies look', await A.ev(`return __in.a`), 'friend color', await A.ev(`return ${g}.players.get('p1').color`));
await A.ev(`const G = ${g}; const c = G.items.list.find(i => i.kind === 'cam'); c.holder = 'p1';`);
await sleep(1500);
const aimB = `const G = ${g}; const t = G.things.list.find(t => t.kind === 'intern'); G.me.yaw = Math.atan2(-(t.rx - G.me.x), -(t.rz - G.me.z)); G.me.pitch = -0.05; window.__da.input.rmb = true;`;
await B.ev(aimB); const track = setInterval(() => B.ev(aimB).catch(() => {}), 300);
await sleep(700); await B.shot('4-friend-films-intern');
A.check(await waitGame(A, 6, `__in.s === 2 || __in.s === 4`), 'filming the intern exposed it');
clearInterval(track);
await B.shot('5-exposed');
await waitGame(A, 6, `__in.s === 4`);
console.log('friend dead?', await A.ev(`return ${g}.players.get('p1').dead`));
srv.kill();
console.log('FRIEND ERRORS', JSON.stringify(B.errs.slice(0, 3)));
await B.close();
await A.done();
