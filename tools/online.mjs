// Two browsers: Quick Play (host a public crew, find it in the list, join) and rejoining after a drop mid-night.
// node tools/online.mjs (needs internet for PeerJS)
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
const g = 'window.__da.game';
// Quick Play: host a public crew
await A.ev(`document.getElementById('btnQuick').click()`); await sleep(500);
await A.ev(`document.getElementById('quickHost').click()`);
let code = null;
for (let i = 0; i < 40 && !code; i++) { await sleep(500); code = await A.ev(`return window.__da.session?.net?.code || null`); }
console.log('public room', code);
A.check(/^QQ/.test(code || ''), 'hosted on a public code');
// the friend finds it in the list
await B.ev(`document.getElementById('btnQuick').click()`);
let listed = false;
for (let i = 0; i < 30 && !listed; i++) { await sleep(500); listed = await B.ev(`return !!document.querySelector('[data-q="${code}"]')`); }
B.check(listed, 'the public crew shows up in Quick Play');
await B.shot('1-quick-list');
for (let tries = 0; tries < 4; tries++) {
  await B.ev(`document.getElementById('msgOk')?.click(); const b = document.querySelector('[data-q="${code}"]'); if (b) b.click(); else window.__da.joinCrew('${code}');`);
  let n = 0; for (let i = 0; i < 40; i++) { await sleep(500); n = await A.ev(`return window.__da.session.roster.length`); if (n === 2 || await B.ev(`return document.body.dataset.screen === 'msg'`)) break; }
  if (n === 2) break; console.log('join retry');
}
A.check(await A.ev(`return window.__da.session.roster.length`) === 2, 'friend joined through Quick Play');
// start a night, the friend walks somewhere, then drops
await A.ev(`localStorage.setItem('deadair.tutorial', '1'); document.getElementById('btnStart').click()`);
await sleep(7000);
await B.ev(`const G = ${g}; G.me.x = G.world.van.x + 6; G.me.z = G.world.van.z - 9;`);
await sleep(2000);
const before = await A.ev(`const P = ${g}.players.get('p1'); return [Math.round(P.x), Math.round(P.z), Math.round(${g}.time)]`);
console.log('friend before drop (host view)', before);
await B.ev(`window.__da.session.net.hostConn.close()`);
let back = false;
for (let i = 0; i < 80 && !back; i++) { await sleep(500); back = await B.ev(`return !!window.__da.game && window.__da.game.time > ${before[2]} && document.body.dataset.screen === 'game'`); }
B.check(back, 'friend got back into the same night');
const after = await B.ev(`const G = ${g}; return [Math.round(G.me.x), Math.round(G.me.z), Math.round(G.time)]`);
console.log('friend after rejoin', after);
B.check(Math.abs(after[0] - before[0]) < 3 && Math.abs(after[1] - before[1]) < 3, 'friend is standing where they were');
await sleep(2000);
A.check(await A.ev(`return window.__da.session.roster.length === 2 && ${g}.players.has('p1')`), 'host still has the friend');
await B.shot('2-rejoined');
console.log('FRIEND ERRORS', JSON.stringify(B.errs.slice(0, 3)));
srv.kill();
await B.close();
await A.done();
