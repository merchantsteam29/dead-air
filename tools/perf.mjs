// Frame time, draw calls and triangles in a few spots (headless, so the numbers only matter relative to each other).
// node tools/perf.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(500);
const { ev, done, url, send } = await open(import.meta.url);
const g = 'window.__da.game';
const measure = async (label, setup) => {
  await ev(setup); await sleep(2500);
  const r = await ev(`return new Promise((res) => { const R = window.__da.renderer; let n = 0, t0 = performance.now(), calls = 0, tris = 0;
    const f = () => { n++; calls = R.info.render.calls; tris = R.info.render.triangles; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(JSON.stringify({ ms: Math.round((performance.now() - t0) / n), calls, tris, progs: R.info.programs.length, geos: R.info.memory.geometries })); };
    requestAnimationFrame(f); })`);
  console.log(label.padEnd(26), r);
};
for (const place of ['lot', 'mall']) {
  await send('Page.navigate', { url: url + `&nomic&autostart&place=${place}&event=none` });
  await sleep(8000);
  await ev(`window.__da.renderer.info.autoReset = true; localStorage.setItem('deadair.tutorial', '1');`);
  await measure(place + ' outside', `const G = ${g}; G.schedule = []; G.me.x = G.world.van.x; G.me.z = G.world.van.z - 6; G.me.yaw = 0; G.me.pitch = 0;`);
  await measure(place + ' inside', `const G = ${g}; const rm = G.world.rooms[Math.floor(G.world.rooms.length / 2)]; G.me.x = rm.x0 + 1; G.me.z = rm.z0 + rm.h - 1; G.me.yaw = 0.7;`);
  await measure(place + ' filming', `const G = ${g}; const c = G.items.list.find(i => i.kind === 'cam'); c.holder = G.myId; window.__da.input.rmb = true;`);
  await ev(`window.__da.input.rmb = false;`);
}
srv.kill(); await done();
