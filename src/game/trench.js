// trench.js — infinite greebled trench built from recycling segments.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TRENCH = { HALF_W: 13, FLOOR_Y: -7, WALL_TOP: 11, SEG_LEN: 26, SEG_COUNT: 24, START_Z: 52 };

const structMat = new THREE.MeshStandardMaterial({ color: 0x4a5364, metalness: 0.62, roughness: 0.52 });
const surfMat   = new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.6, roughness: 0.58 });
const stripMat  = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x66d0ff, emissiveIntensity: 1.7, roughness: 0.4 });
const glowMat   = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb84d, emissiveIntensity: 1.4, roughness: 0.4 });

function pushBox(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const e = new THREE.Euler(rx, ry, rz);
  const m = new THREE.Matrix4().makeRotationFromEuler(e);
  m.setPosition(x, y, z);
  geo.applyMatrix4(m);
  list.push(geo);
}

function buildSegmentGeometry() {
  const { HALF_W, FLOOR_Y, WALL_TOP, SEG_LEN } = TRENCH;
  const L = SEG_LEN;
  const struct = [];   // metal
  const surf = [];     // surface slabs (slightly different tone → merged separately? keep with struct)
  const lights = [];   // emissive
  const wallH = WALL_TOP - FLOOR_Y;
  const midY = FLOOR_Y + wallH / 2;

  // floor
  pushBox(struct, HALF_W * 2, 2, L, 0, FLOOR_Y - 1, 0);
  // side walls
  pushBox(struct, 2, wallH, L, -HALF_W, midY, 0);
  pushBox(struct, 2, wallH, L, HALF_W, midY, 0);
  // top flanking "Death Star surface" slabs extending outward from the rim
  pushBox(surf, 44, 2, L, -HALF_W - 22, WALL_TOP, 0);
  pushBox(surf, 44, 2, L, HALF_W + 22, WALL_TOP, 0);

  // wall greebles (panels / pipes protruding inward)
  for (let i = 0; i < 10; i++) {
    const s = Math.random() < 0.5 ? -1 : 1;
    const y = FLOOR_Y + 0.5 + Math.random() * (wallH - 1);
    const z = -L / 2 + Math.random() * L;
    const w = 0.4 + Math.random() * 0.5;
    const h = 0.4 + Math.random() * 1.6;
    const d = 0.8 + Math.random() * 2.4;
    pushBox(struct, w, h, d, s * (HALF_W - 0.9), y, z);
  }
  // floor greebles
  for (let i = 0; i < 5; i++) {
    const x = (Math.random() * 2 - 1) * (HALF_W - 1.5);
    const z = -L / 2 + Math.random() * L;
    pushBox(struct, 0.6 + Math.random(), 0.5 + Math.random(), 0.8 + Math.random() * 2, x, FLOOR_Y + 0.3, z);
  }
  // surface greebles (towers/blocks on the Death Star surface flanking the trench)
  for (let i = 0; i < 8; i++) {
    const s = Math.random() < 0.5 ? -1 : 1;
    const x = s * (HALF_W + 4 + Math.random() * 30);
    const z = -L / 2 + Math.random() * L;
    const h = 0.6 + Math.random() * 3.5;
    pushBox(surf, 1 + Math.random() * 3, h, 1 + Math.random() * 3, x, WALL_TOP + 1 + h / 2, z);
  }
  // occasional cross-brace over the trench
  if (Math.random() < 0.4) {
    pushBox(struct, HALF_W * 2, 0.7, 1.2, 0, WALL_TOP - 0.6, -L / 2 + Math.random() * L);
  }

  // emissive light strips running the length of both walls (2 heights)
  for (const s of [-1, 1]) {
    pushBox(lights, 0.18, 0.18, L, s * (HALF_W - 0.6), FLOOR_Y + 2.2, 0);
    pushBox(lights, 0.18, 0.18, L, s * (HALF_W - 0.6), FLOOR_Y + 6.5, 0);
  }
  // center floor guide strip
  pushBox(lights, 0.35, 0.1, L, 0, FLOOR_Y + 0.1, 0);

  const structGeo = mergeGeometries(struct.concat(surf), false);
  const lightGeo = mergeGeometries(lights, false);
  // amber warning glows sprinkled on the surface
  const glows = [];
  for (let i = 0; i < 3; i++) {
    const s = Math.random() < 0.5 ? -1 : 1;
    pushBox(glows, 0.4, 0.4, 0.4, s * (HALF_W + 6 + Math.random() * 24), WALL_TOP + 1.2, -L / 2 + Math.random() * L);
  }
  const glowGeo = mergeGeometries(glows, false);
  return { structGeo, lightGeo, glowGeo };
}

export function buildTrench(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const segments = [];
  for (let i = 0; i < TRENCH.SEG_COUNT; i++) {
    const seg = new THREE.Group();
    const { structGeo, lightGeo, glowGeo } = buildSegmentGeometry();
    seg.add(new THREE.Mesh(structGeo, structMat));
    seg.add(new THREE.Mesh(lightGeo, stripMat));
    if (glowGeo) seg.add(new THREE.Mesh(glowGeo, glowMat));
    seg.position.z = TRENCH.START_Z - i * TRENCH.SEG_LEN;
    group.add(seg);
    segments.push(seg);
  }
  const recycleAt = TRENCH.START_Z + TRENCH.SEG_LEN;

  // Move every segment toward the camera by dz; any that passes the recycle
  // plane is re-stacked behind the farthest-back segment for an endless trench.
  function update(dz) {
    let minZ = Infinity;
    for (const seg of segments) if (seg.position.z < minZ) minZ = seg.position.z;
    for (const seg of segments) {
      seg.position.z += dz;
      if (seg.position.z > recycleAt) { minZ -= TRENCH.SEG_LEN; seg.position.z = minZ; }
    }
  }

  return { group, update, TRENCH };
}
