// Small helpers shared by every module.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Seeded random numbers (mulberry32): every browser builds the same location from the same seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Forward direction for a yaw (Three's camera looks down -z).
export const fwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
export const r2 = (v) => Math.round(v * 100) / 100;

// 8-bit mu-law for sending tape audio between browsers.
export function muEncode(f32) {
  const out = new Uint8Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    let s = clamp(f32[i], -1, 1);
    const sign = s < 0 ? 0x80 : 0;
    s = Math.abs(s);
    const m = Math.log1p(255 * s) / Math.log1p(255);
    out[i] = sign | Math.round(m * 127);
  }
  return out;
}
export function muDecode(u8) {
  const out = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) {
    const b = u8[i], m = (b & 0x7f) / 127;
    const v = (Math.pow(256, m) - 1) / 255;
    out[i] = b & 0x80 ? -v : v;
  }
  return out;
}
// PeerJS delivers binary as Uint8Array, ArrayBuffer or a plain array depending on the browser.
export function bytesOf(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (Array.isArray(x)) return Uint8Array.from(x);
  return new Uint8Array(0);
}
