// Your channel: what this device has filmed (localStorage only, nothing to unlock). Recorded after every upload.
import { fmt } from './util.js';

const KEY = 'deadair.stats';
const blank = () => ({ nights: 0, views: 0, best: null, taken: 0, revived: 0, renewed: 0, cancelled: 0, longest: 0, places: {}, uploads: [] });

export function loadStats() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return blank(); }
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }

// info: the review's info ({ end, season, night, verdict, place }), me: my player id, title: the upload's title
export function recordNight(info, me, title, type) {
  const s = loadStats(), e = info.end;
  s.nights++;
  s.views += e.views;
  if (!s.best || e.views > s.best.views) s.best = { views: e.views, title };
  if (e.dead.includes(me)) s.taken++;
  if (info.verdict === 'renewed') s.renewed++;
  if (info.verdict === 'cancelled') { s.cancelled++; s.longest = Math.max(s.longest, (info.season - 1) * info.nightOf + info.night); }
  else s.longest = Math.max(s.longest, (info.season - 1) * info.nightOf + info.night);
  if (type) s.places[type] = (s.places[type] || 0) + 1;
  s.uploads.unshift({ title, views: e.views, date: new Date().toISOString().slice(0, 10), dead: e.dead.length });
  s.uploads = s.uploads.slice(0, 25);
  save(s);
}
export function noteRevive() { const s = loadStats(); s.revived++; save(s); }

// The channel page.
export function renderChannel(el, name, color) {
  const s = loadStats();
  const subs = Math.floor(s.views / 40);
  const places = { lot: 'Lots', mall: 'Malls', hospital: 'Hospitals', school: 'Schools' };
  el.innerHTML = `
    <div class="chHead"><i style="background:${color}"></i><div><h2>DEAD AIR · ${esc(name)}</h2><p>${fmt(subs)} subscribers · ${fmt(s.views)} views · ${s.nights} upload${s.nights === 1 ? '' : 's'}</p></div></div>
    <div class="chStats">
      <div><b>${s.best ? fmt(s.best.views) : 0}</b><span>best night</span></div>
      <div><b>${s.longest}</b><span>longest run (nights)</span></div>
      <div><b>${s.renewed}</b><span>seasons renewed</span></div>
      <div><b>${s.cancelled}</b><span>times cancelled</span></div>
      <div><b>${s.taken}</b><span>times you were taken</span></div>
      <div><b>${s.revived}</b><span>times revived</span></div>
    </div>
    ${Object.keys(s.places).length ? `<p class="hint">Filmed at: ${Object.entries(s.places).map(([k, n]) => `${places[k] || k} ${n}`).join(' · ')}</p>` : ''}
    <h3>Uploads</h3>
    <div class="chList">${s.uploads.length ? s.uploads.map((u) => `<div><span class="thumb">▶</span><div><b>${esc(u.title)}</b><small>${fmt(u.views)} views · ${u.date}${u.dead ? ` · 💀 ${u.dead}` : ''}</small></div></div>`).join('') : '<p class="hint">Nothing yet. Go film something.</p>'}</div>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
