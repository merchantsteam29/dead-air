// The van's kit (flash camera, spare battery, EMF meter), the van at full upgrades, roles and the new looks.
// node tools/gear.mjs
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
// a big channel (van level 5), the Tech, a hazmat suit
await sleep(2000);
await ev(`localStorage.setItem('deadair.tutorial', '1'); localStorage.setItem('deadair.stats', JSON.stringify({ views: 130000, nights: 30 }));
  const s = JSON.parse(localStorage.getItem('deadair.settings') || '{}'); Object.assign(s, { color: 3, hat: 'crown', outfit: 'hazmat', acc: 'glasses', role: 'tech' }); localStorage.setItem('deadair.settings', JSON.stringify(s));`);
await send('Page.navigate', { url });
await sleep(4500);
await shot('1-title-looks');
await send('Page.navigate', { url: url + '&nomic&autostart&place=lot&event=none' });
await sleep(8000);
const kit = await ev(`return JSON.stringify(${g}.items.list.filter(i => ['walkie','emf','flash','battery'].includes(i.kind)).map(i => i.kind))`);
console.log('kit', kit, 'van level', await ev(`return ${g}.vanLvl`), 'zone', await ev(`return ${g}.world.van.r`));
check(JSON.parse(kit).length === 7, 'van level 5 kit: 2 walkies, EMF, 2 flashes, 2 batteries');
check(await ev(`return ${g}.role === 'tech' && !document.getElementById('emf').hidden`), 'the Tech has the EMF meter on screen');
// the van, from behind
await ev(`const G = ${g}; G.schedule = []; G.me.x = G.world.van.x + 5.5; G.me.z = G.world.van.z + 1; G.me.yaw = Math.PI / 2 - 0.15; G.me.pitch = -0.05; G.p.flash = true;`);
await sleep(2000); await shot('2-van-level5');
// flash camera: Mr. Applause in front gets stunned
await ev(`const G = ${g}; for (const t of [...G.things.list]) G.things.remove(t); const W = G.world; G.me.x = W.van.x; G.me.z = W.van.z - 8; G.me.yaw = 0; G.me.pitch = 0;
  const f = G.items.list.find(i => i.kind === 'flash'); f.holder = G.myId; window.__ap = G.things.spawn('applause', G.me.x, G.me.z - 5, { yaw: Math.PI });`);
await sleep(700); await ev(`window.__da.input.lmbHit = true;`);
check(await waitGame(2, `__ap.s === 4`), 'the flash stunned Mr. Applause');
console.log('flashes left', await ev(`return ${g}.items.list.find(i => i.kind === 'flash' && i.holder === ${g}.myId).batt`));
// spare battery into a camcorder on the ground next to me
await ev(`const G = ${g}; G.things.remove(__ap); const f = G.items.list.find(i => i.kind === 'flash' && i.holder === G.myId); f.holder = '';
  const c = G.items.list.find(i => i.kind === 'cam'); c.holder = ''; c.x = G.me.x + 1; c.z = G.me.z; c.batt = 20; c.rest = true;
  const b = G.items.list.find(i => i.kind === 'battery'); b.holder = G.myId; window.__bid = b.id;`);
await sleep(700); await ev(`window.__da.input.lmbHit = true;`); await sleep(1000);
check(await ev(`return ${g}.items.list.find(i => i.kind === 'cam').batt === 80 && !${g}.items.byId.has(__bid)`), 'the spare battery charged the camcorder and was used up');
// EMF near something weird
await ev(`const G = ${g}; G.things.spawn('chair', G.me.x, G.me.z - 3);`); await sleep(1200);
check(await ev(`return document.querySelectorAll('#emf i.on').length >= 4`), 'the EMF meter lights up near the chair');
await shot('3-emf');
srv.kill(); await done();
