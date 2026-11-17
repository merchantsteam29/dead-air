// The Critic (only on camera: views first, then it drains them, creeps closer, cancels you) and haunted junk.
// node tools/critic.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const { ev, shot, done, url, send, check } = await open(import.meta.url);
const g = 'window.__da.game';
const waitGame = async (secs, cond = 'false') => { const t0 = await ev(`return ${g}.time`); for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`return (${g}.time - ${t0} > ${secs}) || (${cond})`)) break; } return ev(`return ${cond}`); };
await ev(`localStorage.setItem('deadair.tutorial', '1')`);
await send('Page.navigate', { url: url + '&nomic&autostart&place=lot&event=none' });
await sleep(8000);
// open ground north of the van, nothing else around
await ev(`const G = ${g}; G.schedule = []; for (const t of [...G.things.list]) G.things.remove(t); G.dons.next = 1e9;
  const W = G.world; let o = null; for (let z = W.H - 20; z > 20 && !o; z--) for (let x = 10; x < W.W - 10 && !o; x++) { let ok = true; for (let d = -2; d <= 14 && ok; d++) for (let dx = -2; dx <= 2 && ok; dx++) if (W.cell(x + dx + 0.5, z - d + 0.5) !== 0) ok = false; if (ok && !W.inVan(x, z)) o = { x: x + 0.5, z: z + 0.5 }; }
  window.__o = o; G.me.x = o.x; G.me.z = o.z; G.me.yaw = 0; G.me.pitch = 0;
  const c = G.items.list.find(i => i.kind === 'cam'); c.holder = G.myId; c.tape = 500;
  window.__cr = G.things.spawn('critic', o.x, o.z - 11, { yaw: Math.PI });`);
await sleep(1000);
check(await ev(`return !window.__cr.model.visible`), 'the Critic is invisible without the camcorder up');
await ev(`window.__da.input.rmb = true;`);
await sleep(1500);
check(await ev(`return window.__cr.model.visible`), 'the Critic shows up through the camcorder');
await shot('1-critic-on-camera');
const t1 = await waitGame(1.5); const tapeA = await ev(`return ${g}.items.list.find(i => i.kind === 'cam').tape`);
await waitGame(5);
const tapeB = await ev(`return ${g}.items.list.find(i => i.kind === 'cam').tape`);
console.log('tape after a moment', tapeA, 'after lingering', tapeB, 'critic distance', await ev(`return Math.round(Math.hypot(__cr.x - ${g}.me.x, __cr.z - ${g}.me.z))`));
check(tapeB < tapeA, 'lingering on the Critic drains views');
check(await waitGame(25, `__cr.s === 2`), 'the Critic got close and cancelled me');
console.log('tape after cancel', await ev(`return ${g}.items.list.find(i => i.kind === 'cam').tape`));
await ev(`window.__da.input.rmb = false;`);
// haunted junk
await ev(`const G = ${g}; G.things.remove(__cr); G.me.down = false; G.p.downT = 0; window.__hb = G.items.add('bucket', G.me.x + 2, G.me.z - 3); __hb.haunt = true; G.me.yaw = -0.6;`);
check(await waitGame(8, `__hb.hs === 1`), 'the haunted bucket wakes up and floats');
await sleep(800); await shot('2-haunted');
check(await waitGame(20, `__hb.hs === 2`), 'it throws itself');
console.log('was I knocked over?', await waitGame(3, `${g}.me.down`));
srv.kill(); await done();
