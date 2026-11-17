// The location: a seeded grid (1 m cells) fenced in by a tree line, with the crew's van at the south edge. A lot (3-4
// small buildings) or a mall / hospital / school (one big building of many rooms, furnished). Every browser builds the same map from the seed.
import * as THREE from 'three';
import { rng, pick, shuffle, clamp } from './util.js';

export const GROUND = 0, FLOOR = 1, WALL = 2, EDGE = 3, SOLID = 4, DOOR = 5, FURN = 6; // FURN: furniture (blocks walking, not sight)
export const WALL_H = 3;
const N = 84;

const PLACE_A = ['Pinegrove', 'Hollis', 'Saint Agnes', 'Blackwater', 'Merriweather', 'Cold Spring', 'Ashby', 'Lantern Hill', 'Greyfield', 'Willow Bend', 'Crane Lake', 'Dunmore'];
// Location types. lot: open ground with 3-4 small buildings. mall / hospital / school: one big building of many rooms
// (BSP split: `min` smallest room side, `depth` how many times it splits, `door` doorway width) with a car park.
export const TYPES = {
  lot: { names: ['Motel', 'Summer Camp', 'Farm', 'Rest Stop', 'Trailer Park', 'Holiday Village', 'Scout Lodge', 'Truck Stop', 'Bible Camp', 'Mini Golf'], walls: [0x8a7a68, 0x6f7f74, 0x8c6f6a, 0x7a7486, 0x857f62, 0x6b7a86], floor: 'wood', furn: 'table' },
  mall: { names: ['Mall', 'Galleria', 'Outlet Center', 'Shopping Plaza'], walls: [0xc8b8d8, 0xb8d0d8, 0xd8c8b0], floor: 'tile', furn: 'shelf', min: 6, depth: 4, door: 3, unique: 'cart', props: ['bag', 'head', 'bag'] },
  hospital: { names: ['General Hospital', 'Sanatorium', 'Memorial Hospital', 'Care Home'], walls: [0xa8c8b4, 0xbcd0c4, 0xc0c8c8], floor: 'lino', furn: 'bed', min: 4, depth: 6, door: 2, unique: 'xray', props: ['clipboard', 'bedpan', 'clipboard'] },
  school: { names: ['High School', 'Elementary', 'Academy', 'Middle School'], walls: [0xd8c888, 0xd0c0a0, 0xb8c8d8], floor: 'wood', furn: 'desk', min: 5, depth: 5, door: 2, unique: 'chalkboard', props: ['ball', 'book', 'globe'] },
};

export class World {
  constructor(seed) {
    this.seed = seed;
    for (let attempt = 0; attempt < 20; attempt++) if (this.generate(seed + attempt * 7919)) return;
    throw new Error('Could not generate a location');
  }

  generate(seed) {
    const r = rng(seed);
    this.W = this.H = N;
    this.grid = new Uint8Array(N * N);
    this.bid = new Int16Array(N * N).fill(-1);
    this.buildings = [];
    this.rooms = [];
    this.furniture = [];
    const tr = r();
    this.type = tr < 0.4 ? 'lot' : tr < 0.6 ? 'mall' : tr < 0.8 ? 'hospital' : 'school';
    const force = typeof location !== 'undefined' && new URLSearchParams(location.search).get('place'); // (testing: ?place=mall)
    if (TYPES[force]) this.type = force;
    const T = this.T = TYPES[this.type];
    this.name = `${pick(r, PLACE_A)} ${pick(r, T.names)}`;
    const g = this.grid;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (x < 3 || z < 3 || x >= N - 3 || z >= N - 3) g[z * N + x] = EDGE;

    // The van, parked at the south edge facing north.
    const vx = N / 2, vz = N - 8;
    this.van = { x: vx, z: vz, r: 5 };
    for (let z = vz - 3; z <= vz + 1; z++) for (let x = vx - 1; x <= vx; x++) g[z * N + x] = SOLID;

    if (this.type === 'lot') {
      const want = 4 + (r() < 0.55 ? 1 : 0);
      for (let tries = 0; tries < 400 && this.buildings.length < want; tries++) {
        const w = 11 + Math.floor(r() * 8), h = 9 + Math.floor(r() * 7);
        const x0 = 5 + Math.floor(r() * (N - 10 - w)), z0 = 5 + Math.floor(r() * (N - 22 - h));
        if (this.buildings.some((b) => x0 < b.x0 + b.w + 4 && x0 + w + 4 > b.x0 && z0 < b.z0 + b.h + 4 && z0 + h + 4 > b.z0)) continue;
        this.addBuilding(r, x0, z0, w, h, { min: 4, depth: 3, door: 1 });
      }
      if (this.buildings.length < 4) return false;
    } else {
      // one big building, the car park in front
      this.addBuilding(r, 5, 5, N - 10, 54 + Math.floor(r() * 4), { min: T.min, depth: T.depth, door: T.door, front: true });
    }

    // Trees between everything (fewer round a big building).
    for (let i = 0; i < (this.type === 'lot' ? 70 : 25); i++) {
      const x = 4 + Math.floor(r() * (N - 8)), z = 4 + Math.floor(r() * (N - 8));
      if (!this.clearAround(x, z, 2)) continue;
      if (Math.hypot(x - vx, z - vz) < 9) continue;
      g[z * N + x] = SOLID;
    }
    // lamp posts out on the ground, well apart
    this.posts = [];
    for (let i = 0; i < 300 && this.posts.length < (this.type === 'lot' ? 9 : 6); i++) {
      const x = 5 + Math.floor(r() * (N - 10)), z = 5 + Math.floor(r() * (N - 10));
      if (!this.clearAround(x, z, 1) || Math.hypot(x - vx, z - vz) < 7 || this.posts.some((p) => Math.hypot(p.x - x, p.z - z) < 12)) continue;
      g[z * N + x] = SOLID; this.posts.push({ x: x + 0.5, z: z + 0.5, y: 3.4, post: true, dead: r() < 0.15, flicker: r() < 0.25 });
    }
    this.furnish(r);

    // Everything walkable must be reachable from the van.
    const reach = this.flood(vx, vz + 4);
    for (let i = 0; i < N * N; i++) if ((g[i] === FLOOR || g[i] === DOOR) && !reach[i]) return false;
    this.reach = reach;
    // a ceiling light in every room: some dead, some flickering
    this.fixtures = this.rooms.map((rm) => ({ x: rm.x0 + rm.w / 2, z: rm.z0 + rm.h / 2, y: 2.7, dead: r() < 0.18, flicker: r() < 0.2 })).concat(this.posts);
    return true;
  }

  clearAround(x, z, d) {
    for (let zz = z - d; zz <= z + d; zz++) for (let xx = x - d; xx <= x + d; xx++) {
      if (xx < 0 || zz < 0 || xx >= N || zz >= N) return false;
      if (this.grid[zz * N + xx] !== GROUND) return false;
    }
    return true;
  }

  // o: { min (smallest room side), depth, door (inside doorway width), front (big building: doors face the van) }
  addBuilding(r, x0, z0, w, h, o) {
    const g = this.grid, id = this.buildings.length, m = o.min, dw = o.door;
    const b = { id, x0, z0, w, h, color: pick(r, this.T.walls), rooms: [] };
    this.buildings.push(b);
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + h - 1;
      g[z * N + x] = edge ? WALL : FLOOR;
      this.bid[z * N + x] = id;
    }
    const room = (rx, rz, rw, rh) => { const rm = { b: id, x0: rx, z0: rz, w: rw, h: rh }; b.rooms.push(rm); this.rooms.push(rm); };
    // Split the inside into rooms.
    const split = (rx, rz, rw, rh, depth) => {
      const canV = rw >= m * 2 + 1, canH = rh >= m * 2;
      if ((!canV && !canH) || depth > o.depth || (depth > 1 && r() < 0.22)) { room(rx, rz, rw, rh); return; }
      const vertical = canV && (!canH || rw > rh || (rw === rh && r() < 0.5));
      for (let t = 0; t < 12; t++) {
        if (vertical) {
          const sx = rx + m + Math.floor(r() * (rw - m * 2));
          if (g[(rz - 1) * N + sx] === DOOR || g[(rz + rh) * N + sx] === DOOR) continue;
          for (let z = rz; z < rz + rh; z++) g[z * N + sx] = WALL;
          const d = Math.min(dw, rh - 2), dz = rz + 1 + Math.floor(r() * (rh - 1 - d));
          for (let i = 0; i < d; i++) g[(dz + i) * N + sx] = DOOR;
          split(rx, rz, sx - rx, rh, depth + 1); split(sx + 1, rz, rx + rw - sx - 1, rh, depth + 1);
          return;
        }
        const sz = rz + m + Math.floor(r() * (rh - m * 2));
        if (g[sz * N + rx - 1] === DOOR || g[sz * N + rx + rw] === DOOR) continue;
        for (let x = rx; x < rx + rw; x++) g[sz * N + x] = WALL;
        const d = Math.min(dw, rw - 2), dx = rx + 1 + Math.floor(r() * (rw - 1 - d));
        for (let i = 0; i < d; i++) g[sz * N + dx + i] = DOOR;
        split(rx, rz, rw, sz - rz, depth + 1); split(rx, sz + 1, rw, rz + rh - sz - 1, depth + 1);
        return;
      }
      room(rx, rz, rw, rh);
    };
    split(x0 + 1, z0 + 1, w - 2, h - 2, 0);
    // Doors to the outside (two cells wide), never into an inside wall. A big building gets two at the front.
    const door = (s) => {
      for (let t = 0; t < 30; t++) {
        let cells;
        if (s === 'n' || s === 's') {
          const x = x0 + 2 + Math.floor(r() * (w - 5)), z = s === 'n' ? z0 : z0 + h - 1, iz = s === 'n' ? z + 1 : z - 1;
          if (g[iz * N + x] !== FLOOR || g[iz * N + x + 1] !== FLOOR) continue;
          cells = [[x, z], [x + 1, z]];
        } else {
          const z = z0 + 2 + Math.floor(r() * (h - 5)), x = s === 'w' ? x0 : x0 + w - 1, ix = s === 'w' ? x + 1 : x - 1;
          if (g[z * N + ix] !== FLOOR || g[(z + 1) * N + ix] !== FLOOR) continue;
          cells = [[x, z], [x, z + 1]];
        }
        for (const [x, z] of cells) g[z * N + x] = DOOR;
        return true;
      }
      return false;
    };
    if (o.front) { door('s'); door('s'); door(pick(r, ['e', 'w'])); }
    else { let made = 0; for (const s of shuffle(r, ['n', 's', 'e', 'w'])) { if (made >= 2 + (r() < 0.4 ? 1 : 0)) break; if (door(s)) made++; } }
  }

  // Furniture: only inside a room's outer ring of cells, so the ring (and every doorway) stays walkable.
  furnish(r) {
    const g = this.grid, kind = this.T.furn;
    for (const rm of this.rooms) {
      if (rm.w < 5 || rm.h < 5) continue;
      const put = (cells, k, rot) => {
        if (cells.some(([x, z]) => x <= rm.x0 || z <= rm.z0 || x >= rm.x0 + rm.w - 1 || z >= rm.z0 + rm.h - 1 || g[z * N + x] !== FLOOR)) return false;
        for (const [x, z] of cells) g[z * N + x] = FURN;
        this.furniture.push({ x: cells[0][0], z: cells[0][1], k, rot, n: cells.length });
        return true;
      };
      if (kind === 'bed') for (let z = rm.z0 + 2; z < rm.z0 + rm.h - 2; z += 3) put([[rm.x0 + 1 + 1, z], [rm.x0 + 3, z]], 'bed', 0) && r() < 0.5 && put([[rm.x0 + rm.w - 4, z], [rm.x0 + rm.w - 3, z]], 'bed', 0);
      if (kind === 'desk') { let n = 0; for (let z = rm.z0 + 2; z < rm.z0 + rm.h - 2; z += 2) for (let x = rm.x0 + 2; x < rm.x0 + rm.w - 2; x += 2) if (n < 16 && r() < 0.8 && put([[x, z]], 'desk', 0)) n++; } // a classroom, not a gym full of desks
      if (kind === 'shelf') for (let x = rm.x0 + 2; x < rm.x0 + rm.w - 2; x += 3) if (r() < 0.75) put([[x, rm.z0 + 2], [x, rm.z0 + 3]], 'shelf', 1);
      if (kind === 'table') { // a lived-in room: a table, a sofa, a cabinet (some of them)
        const at = () => [rm.x0 + 1 + Math.floor(r() * Math.max(1, rm.w - 3)), rm.z0 + 1 + Math.floor(r() * Math.max(1, rm.h - 3))];
        if (r() < 0.75) { const [x, z] = at(); put([[x, z]], 'table', 0); }
        if (r() < 0.6) { const [x, z] = at(); put([[x, z], [x + 1, z]], 'sofa', 0); }
        if (r() < 0.5) { const [x, z] = at(); put([[x, z]], 'cabinet', 0); }
      }
    }
  }

  flood(sx, sz) {
    const seen = new Uint8Array(N * N), q = [sz * N + sx];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * N + nx;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || seen[j] || !this.walkCell(nx, nz)) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return seen;
  }

  cell(x, z) { const cx = Math.floor(x), cz = Math.floor(z); return cx < 0 || cz < 0 || cx >= N || cz >= N ? EDGE : this.grid[cz * N + cx]; }
  walkCell(cx, cz) { if (cx < 0 || cz < 0 || cx >= N || cz >= N) return false; const c = this.grid[cz * N + cx]; return c === GROUND || c === FLOOR || c === DOOR; }
  solidCell(cx, cz) { return !this.walkCell(cx, cz); }
  indoor(x, z) { const c = this.cell(x, z); return c === FLOOR || c === DOOR && this.bid[Math.floor(z) * N + Math.floor(x)] >= 0; }
  buildingAt(x, z) { const cx = Math.floor(x), cz = Math.floor(z); return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : this.bid[cz * N + cx]; }
  inVan(x, z) { return Math.hypot(x - this.van.x, z - this.van.z) < this.van.r; }

  // Push a circle (radius r) out of solid cells. Returns true if it hit something.
  collide(p, r) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const cx = Math.floor(p.x), cz = Math.floor(p.z);
      for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
        if (!this.solidCell(x, z)) continue;
        const nx = clamp(p.x, x, x + 1), nz = clamp(p.z, z, z + 1);
        let dx = p.x - nx, dz = p.z - nz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        hit = true;
        if (d < 1e-5) { // centre inside the cell: push out the shortest way
          const l = p.x - x, rr = x + 1 - p.x, t = p.z - z, b = z + 1 - p.z, m = Math.min(l, rr, t, b);
          if (m === l) p.x = x - r; else if (m === rr) p.x = x + 1 + r; else if (m === t) p.z = z - r; else p.z = z + 1 + r;
          continue;
        }
        dx /= d; dz /= d;
        p.x = nx + dx * r; p.z = nz + dz * r;
        if (p.nx !== undefined) { p.nx = dx; p.nz = dz; }
      }
    }
    return hit;
  }

  // Line of sight at eye height: walls, trees and the van block it; doorways don't.
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n, c = this.cell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (c === WALL || c === EDGE || c === SOLID) return false;
    }
    return true;
  }

  // Shortest walk (BFS over cells, no corner cutting) -> [{x, z}] cell centres, shortened where there's a clear line.
  path(ax, az, bx, bz, maxNodes = 6000) {
    const sx = Math.floor(ax), sz = Math.floor(az), tx = Math.floor(bx), tz = Math.floor(bz);
    if (!this.walkCell(tx, tz)) return null;
    const prev = new Int32Array(N * N).fill(-1), start = sz * N + sx, goal = tz * N + tx;
    prev[start] = start;
    const q = [start];
    let head = 0;
    while (head < q.length && head < maxNodes) {
      const i = q[head++];
      if (i === goal) break;
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * N + nx;
        if (!this.walkCell(nx, nz) || prev[j] >= 0) continue;
        if (dx && dz && (!this.walkCell(x + dx, z) || !this.walkCell(x, z + dz))) continue;
        prev[j] = i; q.push(j);
      }
    }
    if (prev[goal] < 0) return null;
    const out = [];
    for (let i = goal; i !== start; i = prev[i]) out.push({ x: (i % N) + 0.5, z: ((i / N) | 0) + 0.5 });
    out.reverse();
    // Skip corners we can see past.
    const s = [];
    let from = { x: ax, z: az };
    for (let i = 0; i < out.length; i++) {
      const nxt = out[i + 1];
      if (nxt && this.clearWalk(from.x, from.z, nxt.x, nxt.z)) continue;
      s.push(out[i]); from = out[i];
    }
    return s;
  }

  // A 0.7 m wide body can walk straight from a to b.
  clearWalk(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.3);
    const px = -(bz - az) / (d || 1) * 0.35, pz = (bx - ax) / (d || 1) * 0.35;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (this.solidCell(Math.floor(x + px), Math.floor(z + pz)) || this.solidCell(Math.floor(x - px), Math.floor(z - pz))) return false;
    }
    return true;
  }

  // A random walkable spot: 'in' (a room), 'out' (open ground), or either. Keeps away from the van.
  spot(r, where = 'any', awayVan = 12) {
    for (let t = 0; t < 400; t++) {
      let x, z;
      if (where === 'in' || (where === 'any' && r() < 0.6)) {
        const room = pick(r, this.rooms);
        x = room.x0 + 0.6 + r() * (room.w - 1.2); z = room.z0 + 0.6 + r() * (room.h - 1.2);
      } else { x = 4 + r() * (N - 8); z = 4 + r() * (N - 8); }
      const c = this.cell(x, z);
      if (where === 'out' && c !== GROUND) continue;
      if (c !== GROUND && c !== FLOOR) continue;
      if (Math.hypot(x - this.van.x, z - this.van.z) < awayVan) continue;
      if (!this.reach[Math.floor(z) * N + Math.floor(x)]) continue;
      // keep off walls
      if (this.solidCell(Math.floor(x + 0.5), Math.floor(z)) || this.solidCell(Math.floor(x - 0.5), Math.floor(z)) || this.solidCell(Math.floor(x), Math.floor(z + 0.5)) || this.solidCell(Math.floor(x), Math.floor(z - 0.5))) continue;
      return { x, z, room: this.roomAt(x, z) };
    }
    return { x: this.van.x, z: this.van.z - 8, room: null };
  }
  roomAt(x, z) { return this.rooms.find((rm) => x >= rm.x0 && x < rm.x0 + rm.w && z >= rm.z0 && z < rm.z0 + rm.h) || null; }
  // The room furthest (by straight line) from a point.
  farRoom(x, z, r) {
    const rs = this.rooms.slice().sort((a, b) => Math.hypot(b.x0 + b.w / 2 - x, b.z0 + b.h / 2 - z) - Math.hypot(a.x0 + a.w / 2 - x, a.z0 + a.h / 2 - z));
    return rs[Math.floor(r() * Math.min(3, rs.length))];
  }
}

// ---------- Drawing it ----------

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function speckle(ctx, w, h, base, cols, n, size) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { ctx.fillStyle = cols[i % cols.length]; const s = size * (0.5 + Math.random()); ctx.fillRect(Math.random() * w, Math.random() * h, s, s * (0.6 + Math.random())); }
}

export function vanSign() {
  return canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8e1d0'; c.font = 'bold 40px Impact, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('DEAD AIR', w / 2 - 14, h / 2 + 2);
    c.fillStyle = '#e33'; c.beginPath(); c.arc(w - 26, h / 2, 9, 0, 7); c.fill();
  });
}

export function buildScene(world, scene) {
  const N = world.W, group = new THREE.Group();
  const grass = canvasTex(128, 128, (c, w, h) => speckle(c, w, h, '#1d2a1c', ['#243523', '#162114', '#2b3a25', '#1a2418'], 900, 3), N / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(N + 60, N + 60), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(N / 2, 0, N / 2);
  group.add(ground);

  const wood = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#4a3828'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { c.fillStyle = y % 32 ? '#3f2f21' : '#54402c'; c.fillRect(0, y, w, 15); c.fillStyle = '#2a1e14'; c.fillRect(0, y + 15, w, 1); c.fillRect((y * 37) % w, y, 1, 15); }
  }, 1);
  const wallTex = canvasTex(64, 128, (c, w, h) => {
    speckle(c, w, h, '#ffffff', ['#e6e2da', '#d8d2c6', '#f2efe8'], 300, 3);
    c.fillStyle = 'rgba(60,40,20,0.25)'; c.fillRect(0, h - 22, w, 22); // grime at the bottom
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(70,50,30,0.18)'; c.fillRect(Math.random() * w, Math.random() * h * 0.7, 2, 20 + Math.random() * 40); }
  });

  // Walls (one instanced box per cell, tinted per building).
  const wallCells = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (world.grid[z * N + x] === WALL) wallCells.push([x, z]);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), new THREE.MeshLambertMaterial({ map: wallTex }), wallCells.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  wallCells.forEach(([x, z], i) => {
    m.makeTranslation(x + 0.5, WALL_H / 2, z + 0.5); walls.setMatrixAt(i, m);
    col.setHex(world.buildings[world.bid[z * N + x]].color).multiplyScalar(0.85 + ((x * 7 + z * 13) % 5) * 0.04);
    walls.setColorAt(i, col);
  });
  group.add(walls);

  const tile = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#d8d4cc'; c.fillRect(0, 0, w, h); c.fillStyle = '#b8b4ac'; c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h); c.fillStyle = 'rgba(80,70,60,0.15)'; for (let i = 0; i < 40; i++) c.fillRect(Math.random() * w, Math.random() * h, 3, 3); });
  const lino = canvasTex(128, 128, (c, w, h) => speckle(c, w, h, '#9fb4a4', ['#8fa494', '#afc4b4', '#94a898'], 700, 3));
  const floorTex = { wood, tile, lino }[world.T.floor] || wood;

  // Floors, door lintels and roofs.
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2526 });
  const lintelMat = new THREE.MeshLambertMaterial({ color: 0x3a3029 });
  for (const b of world.buildings) {
    const fm = floorMat.clone(); fm.map = floorTex.clone(); fm.map.needsUpdate = true; fm.map.repeat.set(b.w / 2, b.h / 2);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), fm);
    f.rotation.x = -Math.PI / 2; f.position.set(b.x0 + b.w / 2, 0.01, b.z0 + b.h / 2);
    group.add(f);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.3, b.h + 0.6), roofMat);
    roof.position.set(b.x0 + b.w / 2, WALL_H + 0.15, b.z0 + b.h / 2);
    group.add(roof);
    if (world.type !== 'lot') continue; // a big building has a flat roof
    // a gable: a triangular prism along the building's length, apex up
    const pg = new THREE.CylinderGeometry(1, 1, b.w + 0.6, 3, 1); pg.rotateZ(Math.PI / 2); pg.rotateX(-Math.PI / 2);
    const prism = new THREE.Mesh(pg, roofMat);
    prism.scale.set(1, 1.6, (b.h + 0.6) / 1.74);
    prism.position.set(b.x0 + b.w / 2, WALL_H + 0.3 + 0.8, b.z0 + b.h / 2);
    group.add(prism);
  }
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (world.grid[z * N + x] !== DOOR) continue;
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), lintelMat);
    l.position.set(x + 0.5, WALL_H - 0.4, z + 0.5);
    group.add(l);
  }

  // Trees: a tall dark ring at the edge, single trees inside.
  const treeGeo = new THREE.ConeGeometry(1.4, 5, 6, 1); treeGeo.translate(0, 3.2, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5); trunkGeo.translate(0, 0.6, 0);
  const pine = new THREE.MeshLambertMaterial({ color: 0x0f2117, flatShading: true });
  const bark = new THREE.MeshLambertMaterial({ color: 0x2a1f17 });
  const trees = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = world.grid[z * N + x];
    if (c === SOLID && !world.inVan(x + 0.5, z + 0.5)) trees.push([x + 0.5, z + 0.5, 1]);
    if (c === EDGE && (x + z) % 2 === 0 && (x === 2 || z === 2 || x === N - 3 || z === N - 3 || ((x * 31 + z * 17) % 5 === 0))) trees.push([x + 0.5, z + 0.5, 1.4]);
  }
  const tm = new THREE.InstancedMesh(treeGeo, pine, trees.length), bm = new THREE.InstancedMesh(trunkGeo, bark, trees.length);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  trees.forEach(([x, z, k], i) => {
    const h = k * (0.8 + ((x * 13 + z * 7) % 10) / 20);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), x * z);
    s.set(k, h, k); p.set(x, 0, z);
    m.compose(p, q, s); tm.setMatrixAt(i, m); bm.setMatrixAt(i, m);
  });
  group.add(tm, bm);

  buildFurniture(world, group);
  // ceiling lights (events.js lights the nearest few and turns them off in a power cut)
  // windows on the outside walls: some still lit
  const lit = new THREE.MeshBasicMaterial({ color: 0xffd890 }), dark = new THREE.MeshLambertMaterial({ color: 0x0c1420 });
  const winGeo = new THREE.PlaneGeometry(0.6, 0.7);
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    if (world.grid[z * N + x] !== WALL || (x * 7 + z * 3) % 3) continue;
    for (const [dx, dz, ry] of [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]]) {
      if (world.grid[(z + dz) * N + x + dx] !== GROUND) continue;
      if ([[dx, dz], [-dx, -dz]].some(([a, b]) => world.grid[(z + a) * N + x + b] !== WALL)) continue; // not at corners or doors
      const w = new THREE.Mesh(winGeo, ((x * 13 + z * 29) % 10) < 3 ? lit : dark);
      w.position.set(x + 0.5 + dx * 0.51, 1.7, z + 0.5 + dz * 0.51); w.rotation.y = ry;
      group.add(w);
    }
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3e44 });
  for (const fx of world.fixtures) {
    const mat = new THREE.MeshBasicMaterial({ color: fx.dead ? 0x222222 : 0xfff4d8 });
    if (fx.post) { // a lamp post
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.5, 6), poleMat); pole.position.set(fx.x, 1.75, fx.z); group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), mat); head.position.set(fx.x, 3.5, fx.z); group.add(head);
      fx.mat = mat; continue;
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), mat);
    lamp.position.set(fx.x, WALL_H - 0.05, fx.z);
    group.add(lamp);
    fx.mat = mat;
  }
  group.add(buildVan(world));
  scene.add(group);
  return group;
}

// Instanced furniture: hospital beds, school desks (with a chair), shop shelves, tables.
function buildFurniture(world, group) {
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const parts = {
    bed: [[new THREE.BoxGeometry(1.9, 0.12, 0.9), lam(0xc8ccd0), 1, 0.5, 0.5], [new THREE.BoxGeometry(1.8, 0.16, 0.85), lam(0xe8ecee), 1, 0.64, 0.5], [new THREE.BoxGeometry(0.35, 0.12, 0.6), lam(0xffffff), 0.3, 0.78, 0.5], [new THREE.BoxGeometry(0.06, 0.9, 0.9), lam(0x9aa0a6), 1.95, 0.45, 0.5]],
    desk: [[new THREE.BoxGeometry(0.8, 0.05, 0.55), lam(0x9a7448), 0.5, 0.72, 0.4], [new THREE.BoxGeometry(0.7, 0.68, 0.05), lam(0x6a6a70), 0.5, 0.36, 0.15], [new THREE.BoxGeometry(0.42, 0.05, 0.42), lam(0x3a5a9a), 0.5, 0.45, 0.85], [new THREE.BoxGeometry(0.42, 0.45, 0.05), lam(0x3a5a9a), 0.5, 0.68, 1.05]],
    shelf: [[new THREE.BoxGeometry(0.6, 1.8, 1.9), lam(0x8a8e94), 0.5, 0.9, 1], [new THREE.BoxGeometry(0.62, 0.2, 1.7), lam(0xc85a4a), 0.5, 0.6, 1], [new THREE.BoxGeometry(0.62, 0.2, 1.7), lam(0x4a8ac8), 0.5, 1.15, 1], [new THREE.BoxGeometry(0.62, 0.2, 1.7), lam(0xd8c04a), 0.5, 1.6, 1]],
    table: [[new THREE.BoxGeometry(0.9, 0.06, 0.9), lam(0x6a4a2a), 0.5, 0.75, 0.5], [new THREE.BoxGeometry(0.08, 0.72, 0.08), lam(0x4a3220), 0.5, 0.36, 0.5]],
    sofa: [[new THREE.BoxGeometry(1.8, 0.4, 0.8), lam(0x6a3a4a), 1, 0.3, 0.5], [new THREE.BoxGeometry(1.8, 0.5, 0.2), lam(0x5a2e3c), 1, 0.65, 0.85], [new THREE.BoxGeometry(0.2, 0.55, 0.8), lam(0x5a2e3c), 0.15, 0.4, 0.5], [new THREE.BoxGeometry(0.2, 0.55, 0.8), lam(0x5a2e3c), 1.85, 0.4, 0.5]],
    cabinet: [[new THREE.BoxGeometry(0.8, 1.4, 0.5), lam(0x5a4028), 0.5, 0.7, 0.5], [new THREE.BoxGeometry(0.7, 0.02, 0.02), lam(0xc8a040), 0.5, 0.9, 0.24]],
  };
  const m = new THREE.Matrix4();
  for (const [k, list] of Object.entries(parts)) {
    const items = world.furniture.filter((f) => f.k === k);
    if (!items.length) continue;
    for (const [geo, mat, ox, oy, oz] of list) {
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((f, i) => { m.makeTranslation(f.x + ox, oy, f.z + oz); im.setMatrixAt(i, m); });
      im.castShadow = im.receiveShadow = true;
      group.add(im);
    }
  }
}

function buildVan(world) {
  const v = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0xd8d0b8, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x16181c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x223040, emissive: 0x0a1a28 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 4.6), paint); body.position.y = 1.25; v.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.0, 0.8), paint); nose.position.set(0, 0.85, -2.6); v.add(nose);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.05), glass); wind.position.set(0, 1.75, -2.31); wind.rotation.x = -0.25; v.add(wind);
  for (const [x, z] of [[-0.95, -1.6], [0.95, -1.6], [-0.95, 1.5], [0.95, 1.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); v.add(w);
  }
  const sign = new THREE.MeshBasicMaterial({ map: vanSign(), color: 0xbbbbbb });
  for (const sx of [-1.01, 1.01]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), sign); s.position.set(sx, 1.45, 0.2); s.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2; v.add(s); }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.1, 0.25, 10), new THREE.MeshLambertMaterial({ color: 0xcccccc })); dish.position.set(0, 2.4, 0.9); dish.rotation.x = 0.5; v.add(dish);
  // back doors open, a warm light inside: home.
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.4), new THREE.MeshBasicMaterial({ color: 0x5a3a1a })); inner.position.set(0, 1.25, 2.31); v.add(inner);
  const lamp = new THREE.PointLight(0xffb060, 6, 9, 1.4); lamp.position.set(0, 1.6, 3.2); v.add(lamp);
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.06), paint); d.position.set(sx * 1.35, 1.2, 2.55); d.rotation.y = sx * 1.1; v.add(d); }
  // a little ring on the ground: the van zone
  const ring = new THREE.Mesh(new THREE.RingGeometry(world.van.r - 0.15, world.van.r, 48), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.18, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  v.add(ring);
  v.position.set(world.van.x, 0, world.van.z);
  v.userData.lamp = lamp;
  return v;
}
