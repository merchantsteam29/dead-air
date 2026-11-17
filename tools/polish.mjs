// The tutorial steps, push to talk, and the bigger / brighter lot map. node tools/polish.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const { ev, shot, done, url, send, check } = await open(import.meta.url, { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const g = 'window.__da.game';
await send('Page.navigate', { url: url + '&autostart&place=lot&event=none' });
await sleep(8000);
check(await ev(`return !!${g}.tut && !document.getElementById('coach').hidden`), 'the tutorial runs on the first night');
const step = () => ev(`return ${g}.tut.i`);
await shot('1-tutorial-start');
// 1: grab the camcorder
await ev(`const G = ${g}; const c = G.items.list.find(i => i.kind === 'cam'); G.me.x = c.x; G.me.z = c.z + 1.2; G.me.yaw = 0; G.me.pitch = -0.9;`);
await sleep(500); await ev(`window.__da.input.pressed.add('KeyE')`); await sleep(1200);
check(await step() === 1, 'step 1 done: picked up the camcorder');
// 2: film the chair
await ev(`const G = ${g}; const t = G.things.list.find(t => t.kind === 'chair'); G.me.x = t.x; G.me.z = t.z + 4; G.me.yaw = 0; G.me.pitch = 0.05; window.__da.input.rmb = true;`);
for (let i = 0; i < 40 && await step() < 2; i++) await sleep(500);
await shot('2-tutorial-film');
check(await step() === 2, 'step 2 done: filmed the chair');
await ev(`window.__da.input.rmb = false; ${g}.tut.threw = true;`); await sleep(800);
await ev(`window.__da.input.keys.add('KeyG')`); await ev(`window.__da.input.pressed.add('KeyG')`); await sleep(800); await ev(`window.__da.input.keys.delete('KeyG')`);
check(await step() >= 4, 'step 4 done: an emote');
await shot('3-tutorial-last');
check(await ev(`return ${g}.schedule.every(s => s.t >= 100)`), 'the dangerous ones come later during the tutorial');
// push to talk: the mic track is off until V is held
await ev(`window.__da.settings.mic = 'ptt';`); await sleep(400);
const trackOn = () => ev(`return window.__da.micTrack ? window.__da.micTrack() : null`);
console.log('ptt off:', await trackOn());
await ev(`window.__da.input.keys.add('KeyV')`); await sleep(300);
console.log('ptt held:', await trackOn());
await ev(`window.__da.input.keys.delete('KeyV'); window.__da.settings.mic = 'open';`); await sleep(300);
await shot('4-ptt');
// outside at night: lamp posts and windows
await ev(`const G = ${g}; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 8; G.me.yaw = 0.3; G.me.pitch = 0.05;`);
await sleep(2000); await shot('5-outside');
// inside a furnished room
await ev(`const G = ${g}; const rm = G.world.rooms.find(r => G.world.furniture.some(f => f.x > r.x0 && f.x < r.x0 + r.w && f.z > r.z0 && f.z < r.z0 + r.h)); G.me.x = rm.x0 + 0.7; G.me.z = rm.z0 + rm.h - 0.7; G.me.yaw = Math.atan2(-(rm.w), -(-rm.h)); G.me.pitch = -0.15;`);
await sleep(2000); await shot('6-room');
srv.kill(); await done();
