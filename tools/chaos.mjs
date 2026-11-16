// Two browsers: ragdoll knock-downs, emotes, carrying a body to the van (revive), blood rain, donations.
// node tools/chaos.mjs (needs internet for PeerJS)
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const A = await open(import.meta.url, { tag: '-host' });
const B = await open(import.meta.url, { tag: '-friend' });
for (const X of [A, B]) await X.send('Page.navigate', { url: X.url + '&nomic' });
await sleep(4000);
await A.ev(`document.getElementById('btnHost').click()`);
let code = null;
for (let i = 0; i < 30 && !code; i++) { await sleep(500); code = await A.ev(`return window.__da.session?.net?.code || null`); }
await B.ev(`document.getElementById('joinCode').value = '${code}'; document.getElementById('btnJoin').click();`);
for (let i = 0; i < 30; i++) { await sleep(500); if (await A.ev(`return window.__da.session.roster.length`) === 2) break; }
await A.ev(`document.getElementById('btnStart').click()`);
await sleep(6000);
const g = 'window.__da.game';
const waitGame = async (X, secs, cond = 'false') => { const t0 = await X.ev(`return ${g}.time`); for (let i = 0; i < 300; i++) { await sleep(250); if (await X.ev(`return (${g}.time - ${t0} > ${secs}) || (${cond})`)) break; } };
// stand facing each other in the open
await A.ev(`const G = ${g}; G.schedule = []; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 10; G.me.yaw = Math.PI; G.me.pitch = -0.1;`);
await B.ev(`const G = ${g}; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 6.5; G.me.yaw = 0;`);
await sleep(1500);
// 1. the friend dances
await B.ev(`const G = ${g}; G.p.emote = 'dance'; G.p.emoteT = 20;`);
await sleep(1500);
A.check(await A.ev(`return ${g}.players.get('p1').emote === 'dance'`), 'host sees the friend dancing');
await A.shot('1-dance');
// 2. knock the friend over (ragdoll)
await A.ev(`${g}.knockDown('p1', 3, 'test', { x: 0, z: 8 })`);
await sleep(500); await A.shot('2-ragdoll-a'); await sleep(700); await A.shot('2-ragdoll-b');
await waitGame(A, 3.5);
// 3. the friend dies; the host carries the body to the van
await A.ev(`${g}.kill('p1', 'test')`);
await sleep(1500);
await A.ev(`const G = ${g}; const P = G.players.get('p1'); G.me.x = P.x; G.me.z = P.z + 1.4; G.me.yaw = 0; G.me.pitch = -0.6;`);
await sleep(500); await A.ev(`window.__da.input.pressed.add('KeyE')`); await sleep(800);
A.check(await A.ev(`return ${g}.players.get('p1').carrier === 'h'`), 'host is carrying the body');
await A.ev(`${g}.me.pitch = -0.1;`); await sleep(600);
await A.shot('3-carry');
await B.shot('3-friend-carried');
await A.ev(`const G = ${g}; G.me.x = G.world.van.x + 2.5; G.me.z = G.world.van.z;`);
await waitGame(A, 4, `!${g}.players.get('p1').dead`);
await sleep(1000);
B.check(await B.ev(`return !${g}.me.dead`), 'friend revived at the van');
// 4. blood rain + a donation
await A.ev(`const G = ${g}; G.rain.plan = { warn: G.time, dur: 60 }; G.dons.next = 0;`);
await waitGame(A, 10, `${g}.rain.state === 'on'`);
await B.ev(`const G = ${g}; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 12; G.me.yaw = 0;`);
await sleep(3000);
B.check(await B.ev(`return ${g}.rain.state === 'on' && ${g}.rain.outside`), 'friend is out in the blood rain');
B.check(await B.ev(`return !!${g}.dons.req`), 'friend sees a donation request');
console.log('friend stamina', await B.ev(`return Math.round(${g}.p.stam)`), 'donation:', await B.ev(`return ${g}.dons.req && ${g}.dons.req.text`));
await B.shot('4-rain');
// 5. the emote wheel opens on Z
await B.ev(`window.__da.input.keys.add('KeyZ')`); await sleep(400); await B.ev(`window.__da.input.dx = 60; window.__da.input.dy = -20;`); await sleep(400);
await B.shot('5-wheel');
await B.ev(`window.__da.input.keys.delete('KeyZ')`); await sleep(400);
console.log('friend emote after wheel', await B.ev(`return ${g}.p.emote`));
srv.kill();
await B.close();
await A.done();
