// Shared materials: every plain flat-shaded colour is made once and reused, so the renderer switches state less.
// (Only for materials nobody changes later. Anything with extras, like transparency, gets its own.)
import * as THREE from 'three';

const cache = new Map();
export function lam(color, extra = null) {
  if (extra && Object.keys(extra).length) return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  let m = cache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true }); cache.set(color, m); }
  return m;
}
