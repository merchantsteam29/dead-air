// Every kind of place and night event: a screenshot inside and outside each. node tools/places.mjs
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
const runs = [['mall', 'none'], ['hospital', 'power'], ['school', 'fog'], ['lot', 'bloodmoon'], ['mall', 'storm']];
for (const [place, event] of runs) {
  await send('Page.navigate', { url: url + `&nomic&autostart&place=${place}&event=${event}` });
  await sleep(7000);
  const info = await ev(`const G = ${g}; return JSON.stringify({ type: G.world.type, name: G.world.name, rooms: G.world.rooms.length, furn: G.world.furniture.length, event: G.events.kind, things: G.things.list.map(t => t.kind) })`);
  console.log(info);
  check(JSON.parse(info).type === place, place + ' generated');
  // stand in the middle of a room (with a light), facing into it
  await ev(`const G = ${g}; G.schedule = []; const rm = G.world.rooms.filter(r => r.w >= 6 && r.h >= 6)[2] || G.world.rooms[0]; const f = G.world.fixtures.find(f => Math.abs(f.x - (rm.x0 + rm.w/2)) < 0.1 && Math.abs(f.z - (rm.z0 + rm.h/2)) < 0.1); if (f) f.dead = false;
    G.me.x = rm.x0 + 1.5; G.me.z = rm.z0 + rm.h - 1.5; G.me.yaw = Math.atan2(-(rm.w/2 - 1.5), -(-(rm.h/2) + 1.5)); G.me.pitch = -0.1;
    if ('${event}' !== 'none') { G.events.start = G.time - 1; }`);
  await sleep(2500);
  await shot(`${place}-${event}-inside`);
  // outside, looking at the building
  await ev(`const G = ${g}; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 6; G.me.yaw = 0; G.me.pitch = 0.05;`);
  await sleep(2000);
  await shot(`${place}-${event}-outside`);
}
// the channel page
await send('Page.navigate', { url: url + '&nomic' });
await sleep(4000);
await ev(`localStorage.setItem('deadair.stats', JSON.stringify({ nights: 7, views: 18340, best: { views: 4210, title: 'S1 E2: Ashby Mall (GONE WRONG)' }, taken: 3, revived: 1, renewed: 1, cancelled: 1, longest: 5, places: { mall: 3, lot: 4 }, uploads: [{ title: 'S2 E2: Ashby Mall (GONE WRONG)', views: 4210, date: '2026-11-16', dead: 2 }, { title: 'S2 E1: Hollis Farm (REAL FOOTAGE)', views: 1900, date: '2026-11-16', dead: 0 }] })); document.getElementById('btnChannel').click();`);
await sleep(1500);
await shot('channel');
srv.kill(); await done();
