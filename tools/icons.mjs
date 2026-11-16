// Renders icons/icon.svg to the PNGs the app manifest needs, and cover.png (the title screen). node tools/icons.mjs
import { open, sleep } from './harness.mjs';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: port }, stdio: 'ignore' });
process.env.SH_URL = `http://localhost:${port}/`;
await sleep(600);
const { ev, send, done } = await open(import.meta.url, { size: [1280, 720] });
await sleep(5000);
await ev(`document.querySelector('#title .card').style.visibility = 'hidden'; document.querySelector('.foot').style.visibility = 'hidden';`);
await sleep(800);
const c = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(root, 'cover.png'), Buffer.from(c.result.data, 'base64'));
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
await send('Page.navigate', { url: 'about:blank' }); await sleep(800);
const png = async (file, size, pad = 0, bleed = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await ev(`document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:${bleed ? '#0b1020' : 'transparent'}'; const d = document.createElement('div'); d.style.cssText = 'width:${size}px;height:${size}px;display:grid;place-items:center'; d.innerHTML = ${JSON.stringify(svg)}; const s = d.firstElementChild; s.setAttribute('width', ${size - pad * 2}); s.setAttribute('height', ${size - pad * 2}); document.body.appendChild(d);`);
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  fs.writeFileSync(path.join(root, file), Buffer.from(r.result.data, 'base64'));
};
await png('icons/icon-512.png', 512); await png('icons/icon-192.png', 192); await png('icons/apple-touch-icon.png', 180, 0, true); await png('icons/maskable-512.png', 512, 60, true);
srv.kill(); await done();
