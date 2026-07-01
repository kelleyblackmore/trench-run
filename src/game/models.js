// models.js — procedural ship & structure geometry (no external assets).
import * as THREE from 'three';

const metal = (c, m = 0.6, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
const emissive = (c, i = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i, roughness: 0.4 });

// shared materials
const M = {
  hull:    metal(0xd7dde6, 0.55, 0.55),
  hullDk:  metal(0x8b93a1, 0.6, 0.5),
  panel:   metal(0x5b6472, 0.7, 0.45),
  red:     new THREE.MeshStandardMaterial({ color: 0xd23b2f, metalness: 0.3, roughness: 0.6 }),
  glass:   new THREE.MeshStandardMaterial({ color: 0x0a1420, metalness: 0.1, roughness: 0.15, emissive: 0x2a4866, emissiveIntensity: 0.6 }),
  engine:  emissive(0x59d4ff, 3.4),
  tie:     metal(0x2b2f39, 0.5, 0.55),
  tieDk:   metal(0x171a22, 0.5, 0.6),
  tieGlow: emissive(0x7fa8c8, 0.7),
  towerA:  metal(0x3a4250, 0.65, 0.5),
  towerB:  metal(0x232935, 0.6, 0.55),
  warn:    emissive(0xff5a2f, 2.6),
  portGlow: emissive(0xffd34d, 3.0),
};

// ---------------- X-WING ----------------
export function buildXWing() {
  const g = new THREE.Group();

  // fuselage
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 3.0, 10), M.hull);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  // nose cone
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.34, 1.5, 10), M.hullDk);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -2.15;
  g.add(nose);

  // cockpit canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
  canopy.scale.set(1, 0.7, 1.5);
  canopy.position.set(0, 0.24, -0.5);
  g.add(canopy);

  // astromech bump
  const r2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.panel);
  r2.position.set(0, 0.26, 0.35);
  g.add(r2);

  // engine block + 4 glowing thrusters at the rear
  const eBlock = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.8), M.hullDk);
  eBlock.position.z = 1.5;
  g.add(eBlock);
  const thrusterGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.34, 12);
  const glowGeo = new THREE.CircleGeometry(0.15, 14);
  const engineNodes = [];
  for (const [x, y] of [[-0.34, 0.26], [0.34, 0.26], [-0.34, -0.26], [0.34, -0.26]]) {
    const t = new THREE.Mesh(thrusterGeo, M.hullDk);
    t.rotation.x = Math.PI / 2; t.position.set(x, y, 1.85);
    g.add(t);
    const gl = new THREE.Mesh(glowGeo, M.engine);
    gl.position.set(x, y, 2.03); gl.rotation.y = Math.PI;
    g.add(gl); engineNodes.push(gl);
  }

  // 4 S-foil wings in X formation, each with a cannon at the tip
  const wingCannons = [];
  const wingGeo = new THREE.BoxGeometry(2.4, 0.06, 0.9);
  const cannonGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8);
  const stripeGeo = new THREE.BoxGeometry(2.0, 0.07, 0.12);
  const configs = [
    { side: -1, up: 1 }, { side: 1, up: 1 }, { side: -1, up: -1 }, { side: 1, up: -1 },
  ];
  for (const c of configs) {
    const wing = new THREE.Group();
    const panel = new THREE.Mesh(wingGeo, M.hull);
    panel.position.x = c.side * 1.3;
    wing.add(panel);
    const stripe = new THREE.Mesh(stripeGeo, M.red);
    stripe.position.set(c.side * 1.55, 0.05, 0.2);
    wing.add(stripe);
    // cannon along the ship's forward axis at the wingtip
    const cannon = new THREE.Mesh(cannonGeo, M.hullDk);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(c.side * 2.45, 0, -0.55);
    wing.add(cannon);
    // muzzle marker (used to spawn laser origins)
    const muzzle = new THREE.Object3D();
    muzzle.position.set(c.side * 2.45, 0, -1.3);
    wing.add(muzzle);
    wingCannons.push(muzzle);
    wing.position.z = 0.9;
    wing.rotation.z = c.up * (c.side > 0 ? -0.28 : 0.28); // spread into an X
    g.add(wing);
  }

  g.userData.engineNodes = engineNodes;
  g.userData.wingCannons = wingCannons;
  g.scale.setScalar(0.62);
  return g;
}

// ---------------- TIE FIGHTER ----------------
export function buildTIE() {
  const g = new THREE.Group();
  // ball cockpit
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), M.tie);
  g.add(pod);
  // window
  const win = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 8), M.tieDk);
  win.rotation.x = Math.PI / 2; win.position.z = -0.56;
  g.add(win);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), M.tieGlow);
  eye.position.z = -0.63;
  g.add(eye);
  // hex wing panels
  const wingGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.08, 6);
  const strutGeo = new THREE.BoxGeometry(0.5, 0.16, 0.16);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, M.tieDk);
    wing.rotation.z = Math.PI / 2; wing.rotation.y = Math.PI / 2;
    wing.position.x = s * 1.15;
    g.add(wing);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 6), M.tie);
    rim.rotation.y = Math.PI / 2; rim.position.x = s * 1.19;
    g.add(rim);
    const strut = new THREE.Mesh(strutGeo, M.tie);
    strut.position.x = s * 0.6;
    g.add(strut);
  }
  g.userData.eye = eye;
  return g;
}

// ---------------- TURBOLASER TOWER ----------------
export function buildTower() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.2), M.towerA);
  g.add(base);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.7), M.towerB);
  head.position.y = 1.5;
  g.add(head);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.0, 8), M.towerB);
  barrel.rotation.x = Math.PI / 2.4; barrel.position.set(0, 1.7, -0.9);
  g.add(barrel);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), M.warn);
  light.position.set(0, 2.2, 0);
  g.add(light);
  // greeble strips
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.14, 0.4), M.towerB);
    s.position.set(0, -0.9 + i * 0.7, 0);
    g.add(s);
  }
  g.userData.light = light;
  return g;
}

// ---------------- EXHAUST PORT ----------------
export function buildPort() {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 5.5), M.towerA);
  g.add(housing);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 3.4), M.towerB);
  recess.position.y = 0.35;
  g.add(recess);
  const ringGeo = new THREE.TorusGeometry(1.15, 0.16, 10, 28);
  const ring = new THREE.Mesh(ringGeo, M.portGlow);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.85;
  g.add(ring);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x1a0f00, emissiveIntensity: 0.4 }));
  hole.rotation.x = -Math.PI / 2; hole.position.y = 0.86;
  g.add(hole);
  // corner greebles
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), M.towerB);
    b.position.set(sx * 2.2, 0.4, sz * 2.2);
    g.add(b);
  }
  g.userData.ring = ring;
  g.userData.hole = hole;
  return g;
}

export { M };
