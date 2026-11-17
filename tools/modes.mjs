// Endless night (alone: check-ins pass and fail) and Play as the monster (two browsers: the friend drives Mr. Applause
// and grabs the host). node tools/modes.mjs (needs internet for the monster part)
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
const g = 'window.__da.game';
const waitGame = async (X, secs, cond = 'false') => { const t0 = await X.ev(`return ${g}.time`); for (let i = 0; i < 400; i++) { await sleep(250); if (await X.ev(`return (${g}.time - ${t0} > ${secs}) || (${cond})`)) break; } return X.ev(`return ${cond}`); };
// ---- endless, alone
await sleep(3000);
await A.ev(`localStorage.setItem('deadair.tutorial', '1'); document.getElementById('btnEndless').click();`);
await sleep(8000);
A.check(await A.ev(`return ${g}.mode === 'endless'`), 'endless night started');
await A.ev(`const G = ${g}; G.schedule = []; const c = G.items.list.find(i => i.kind === 'cam'); c.tape = 5000; G.nextCheck = G.time + 1;`);
A.check(await waitGame(A, 6, `${g}.checks === 1`), 'first check-in passed');
const n = await A.ev(`return ${g}.things.list.length`);
await A.shot('1-endless');
await A.ev(`const G = ${g}; G.items.list.find(i => i.kind === 'cam').tape = 0; G.nextCheck = G.time + 1;`);
let rv = false; for (let i = 0; i < 60 && !rv; i++) { await sleep(500); rv = await A.ev(`return !document.getElementById('rvSummary').hidden`); }
A.check(rv, 'a failed check-in ends the run with the summary');
await A.shot('2-endless-summary');
console.log('summary', await A.ev(`return document.getElementById('rvStats').innerText.slice(0, 160)`));
// ---- the monster: host + friend
await A.ev(`document.getElementById('rvNext').click()`); await sleep(1500);
const B = await open(import.meta.url, { args, tag: '-friend' });
await sleep(3000);
await A.ev(`document.getElementById('btnHost').click()`);
let code = null; for (let i = 0; i < 30 && !code; i++) { await sleep(500); code = await A.ev(`return window.__da.session?.net?.code || null`); }
for (let tries = 0; tries < 4; tries++) {
  await B.ev(`document.getElementById('msgOk')?.click(); document.getElementById('joinCode').value = '${code}'; document.getElementById('btnJoin').click();`);
  let k = 0; for (let i = 0; i < 40; i++) { await sleep(500); k = await A.ev(`return window.__da.session.roster.length`); if (k === 2 || await B.ev(`return document.body.dataset.screen === 'msg'`)) break; }
  if (k === 2) break; console.log('join retry');
}
A.check(await A.ev(`return window.__da.session.roster.length`) === 2, 'friend joined');
await A.ev(`const s = document.getElementById('modePick'); s.value = 'monster'; s.dispatchEvent(new Event('change'));`);
await sleep(500);
// make sure the friend is the monster (it's random)
await A.ev(`const orig = Math.random; let first = true; Math.random = () => { if (first) { first = false; return 0.99; } return orig(); }; document.getElementById('btnStart').click(); Math.random = orig;`);
await sleep(7000);
const mon = await A.ev(`return ${g}.monsterId`);
console.log('monster', mon);
A.check(mon === 'p1' && await B.ev(`return ${g}.isMonster`), 'the friend plays Mr. Applause');
// the friend walks up to the host and grabs
await A.ev(`const G = ${g}; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 10;`);
await sleep(1000);
await B.ev(`const G = ${g}; const h = G.players.get('h'); G.me.x = h.x; G.me.z = h.z + 1.0; G.me.yaw = 0; G.me.pitch = 0;`);
await sleep(1500);
await B.shot('3-monster-view');
await B.ev(`window.__da.input.lmbHit = true;`);
A.check(await waitGame(A, 6, `${g}.me.dead`), 'the monster grabbed the host');
await B.shot('4-monster-grab');
console.log('FRIEND ERRORS', JSON.stringify(B.errs.slice(0, 3)));
srv.kill();
await B.close();
await A.done();
