// systems.js — gameplay: flight, enemies, projectiles, particles, finale.
import * as THREE from 'three';
import { buildXWing, buildTIE, buildTower, buildPort } from './models.js';
import { TRENCH } from './trench.js';

const XMAX = TRENCH.HALF_W - 2.5;
const YMIN = TRENCH.FLOOR_Y + 2.5;   // -4.5
const YMAX = TRENCH.WALL_TOP - 3;    // 8
const YMID = (YMIN + YMAX) / 2;
const CONVERGE = 92;                 // laser convergence distance ahead

const DIFF = {
  cadet: { spawn: 1.9, fire: 2.6, espeed: 26, dmg: 0.7, regen: 9, target: 2400 },
  pilot: { spawn: 1.35, fire: 1.8, espeed: 32, dmg: 1.0, regen: 6, target: 3000 },
  ace:   { spawn: 0.95, fire: 1.2, espeed: 40, dmg: 1.35, regen: 3.5, target: 3600 },
};

export function createSystems(ctx) {
  const { scene, camera, audio, input, onWin, onLose, onBanner } = ctx;
  const reduceMotion = ctx.reduceMotion || (() => false);
  let camRoll = 0;

  // ---- player ----
  const ship = buildXWing();
  scene.add(ship);
  const shipVel = new THREE.Vector2(0, 0);

  // ---- pools ----
  const mkLaser = (color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 4.5, roughness: 0.4 }));
    m.visible = false; scene.add(m); return m;
  };
  const pLasers = Array.from({ length: 48 }, () => ({ mesh: mkLaser(0xff2b2b), active: false, vel: new THREE.Vector3() }));
  const eLasers = Array.from({ length: 48 }, () => ({ mesh: mkLaser(0x7dff4a), active: false, vel: new THREE.Vector3() }));
  const enemies = Array.from({ length: 20 }, () => {
    const g = buildTIE(); g.visible = false; scene.add(g);
    return { grp: g, active: false, vel: new THREE.Vector3(), prev: new THREE.Vector3(),
      evel: new THREE.Vector3(), hp: 0, fireCd: 0, phase: 0, weaveF: 1, dead: false };
  });
  const towers = Array.from({ length: 8 }, () => {
    const g = buildTower(); g.visible = false; scene.add(g);
    return { grp: g, light: g.userData.light, active: false, hp: 0, fireCd: 0 };
  });
  const shardGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const particles = Array.from({ length: 240 }, () => {
    const m = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa030, emissiveIntensity: 3, roughness: 0.5 }));
    m.visible = false; scene.add(m);
    return { mesh: m, active: false, vel: new THREE.Vector3(), life: 0, max: 1, spin: new THREE.Vector3() };
  });

  // ---- port (finale) ----
  const port = buildPort(); port.visible = false; scene.add(port);
  const torpedo = mkLaser(0xfff2a0); torpedo.geometry = new THREE.BoxGeometry(0.5, 0.5, 1.6);

  // ---- run state ----
  const run = {
    diff: DIFF.pilot, hull: 100, shields: 100, score: 0, kills: 0,
    distance: 0, speed: 46, time: 0, finale: false, over: false,
    spawnT: 1.2, towerT: 3, hurt: 0, shieldCd: 0, energy: 100,
    lock: 0, locked: false, torpActive: false, torpZ: 0, portPassed: 0
  };

  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  const _muzzle = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const worldMuzzle = () => {
    const c = ship.userData.wingCannons;
    for (let i = 0; i < c.length; i++) c[i].getWorldPosition(_muzzle[i]);
    return _muzzle;
  };

  function reset(diffName) {
    run.diff = DIFF[diffName] || DIFF.pilot;
    run.hull = 100; run.shields = 100; run.score = 0; run.kills = 0;
    run.distance = 0; run.speed = run.diff.espeed + 14; run.time = 0;
    run.finale = false; run.over = false; run.spawnT = 1.0; run.towerT = 2.6;
    run.hurt = 0; run.shieldCd = 0; run.energy = 100; run.lock = 0; run.locked = false;
    run.torpActive = false; run.portPassed = 0;
    ship.position.set(0, 0, 0); ship.rotation.set(0, 0, 0); shipVel.set(0, 0);
    pLasers.concat(eLasers).forEach(l => { l.active = false; l.mesh.visible = false; });
    enemies.forEach(e => { e.active = false; e.grp.visible = false; });
    towers.forEach(t => { t.active = false; t.grp.visible = false; });
    particles.forEach(p => { p.active = false; p.mesh.visible = false; });
    port.visible = false; torpedo.visible = false;
    fireCd = 0;
  }

  // ---------------- player control ----------------
  let fireCd = 0;
  function updatePlayer(dt) {
    const s = input.state;
    if (s.moveTo) {
      const tx = s.moveTo.nx * XMAX;
      const ty = THREE.MathUtils.clamp(YMID - s.moveTo.ny * (YMAX - YMID + 2.0), YMIN, YMAX);
      const k = 1 - Math.exp(-14 * dt);
      const nx = ship.position.x + (tx - ship.position.x) * k;
      const ny = ship.position.y + (ty - ship.position.y) * k;
      shipVel.x = (nx - ship.position.x) / Math.max(dt, 1e-4);
      shipVel.y = (ny - ship.position.y) / Math.max(dt, 1e-4);
      ship.position.x = nx; ship.position.y = ny;
    } else {
      const accel = 64, maxv = 34, fric = 0.86;
      shipVel.x += s.axisX * accel * dt;
      shipVel.y += s.axisY * accel * dt;
      shipVel.x = THREE.MathUtils.clamp(shipVel.x, -maxv, maxv);
      shipVel.y = THREE.MathUtils.clamp(shipVel.y, -maxv, maxv);
      ship.position.x += shipVel.x * dt;
      ship.position.y += shipVel.y * dt;
      if (!s.axisX) shipVel.x *= fric;
      if (!s.axisY) shipVel.y *= fric;
    }
    // clamp to trench
    if (ship.position.x < -XMAX) { ship.position.x = -XMAX; shipVel.x = 0; }
    if (ship.position.x > XMAX) { ship.position.x = XMAX; shipVel.x = 0; }
    if (ship.position.y < YMIN) { ship.position.y = YMIN; shipVel.y = 0; }
    if (ship.position.y > YMAX) { ship.position.y = YMAX; shipVel.y = 0; }

    // banking / pitch from velocity
    const targetRoll = THREE.MathUtils.clamp(-shipVel.x * 0.05, -0.7, 0.7);
    const targetPitch = THREE.MathUtils.clamp(-shipVel.y * 0.02, -0.25, 0.25);
    const targetYaw = THREE.MathUtils.clamp(shipVel.x * 0.012, -0.2, 0.2);
    ship.rotation.z += (targetRoll - ship.rotation.z) * Math.min(1, 10 * dt);
    ship.rotation.x += (targetPitch - ship.rotation.x) * Math.min(1, 10 * dt);
    ship.rotation.y += (targetYaw - ship.rotation.y) * Math.min(1, 10 * dt);

    // engine glow flicker
    const boost = s.boost ? 1 : 0;
    const glow = 2.8 + boost * 2.0 + Math.sin(run.time * 40) * 0.3;
    for (const n of ship.userData.engineNodes) n.material.emissiveIntensity = glow;

    // firing lasers
    fireCd -= dt;
    if (s.fire && fireCd <= 0) { firePlayerLasers(); fireCd = 0.11; }
  }

  function firePlayerLasers() {
    const muzzles = worldMuzzle();
    let n = 0;
    for (const l of pLasers) {
      if (l.active) continue;
      l.mesh.position.copy(muzzles[n]);
      l.vel.set(0, 0, -360);          // parallel down -Z: aim is depth-independent
      l.mesh.rotation.set(0, 0, 0);   // bolt box is long on Z already
      l.active = true; l.mesh.visible = true; l.ttl = 1.6;
      n++; if (n >= 4) break;
    }
    audio.laser();
  }

  // ---------------- enemies ----------------
  function spawnTie() {
    const e = enemies.find(x => !x.active); if (!e) return;
    const inTrench = Math.random() < 0.7;
    const x = (Math.random() * 2 - 1) * (inTrench ? XMAX : TRENCH.HALF_W + 6);
    const y = inTrench ? YMIN + Math.random() * (YMAX - YMIN) : YMAX + Math.random() * 4;
    e.grp.position.set(x, y, -430 - Math.random() * 120);
    e.vel.set(0, 0, run.diff.espeed * (0.7 + Math.random() * 0.5));
    e.hp = 1 + (Math.random() < 0.3 ? 1 : 0);
    e.fireCd = 0.7 + Math.random() * run.diff.fire;
    e.phase = Math.random() * Math.PI * 2;
    e.weaveF = 0.6 + Math.random() * 0.9;
    e.active = true; e.dead = false; e.grp.visible = true;
  }
  function spawnTower() {
    const t = towers.find(x => !x.active); if (!t) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    t.grp.position.set(side * (TRENCH.HALF_W - 1), TRENCH.FLOOR_Y + 1.2, -430);
    t.grp.rotation.y = side < 0 ? 0.4 : -0.4;
    t.hp = 4; t.fireCd = 1.5 + Math.random(); t.active = true; t.grp.visible = true;
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.active) continue;
      e.prev.copy(e.grp.position);
      const prevZ = e.grp.position.z;
      e.grp.position.z += (run.speed + e.vel.z) * dt;
      // weave toward player laterally
      const tx = ship.position.x + Math.sin(run.time * e.weaveF + e.phase) * 5;
      const ty = ship.position.y + Math.cos(run.time * e.weaveF * 0.8 + e.phase) * 3;
      e.grp.position.x += (tx - e.grp.position.x) * Math.min(1, 1.4 * dt);
      e.grp.position.y += (ty - e.grp.position.y) * Math.min(1, 1.2 * dt);
      e.evel.copy(e.grp.position).sub(e.prev).multiplyScalar(1 / Math.max(dt, 1e-4));
      e.grp.rotation.z += dt * 1.5;
      // fire at player
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.grp.position.z < -30 && !run.finale) {
        e.fireCd = 1.0 + Math.random() * run.diff.fire;
        fireEnemyLaser(e.grp.position);
      }
      // ram: detect crossing the ship plane (z=4) so a fast pass can't tunnel through
      if (prevZ < 4 && e.grp.position.z >= 4) {
        const dx = e.grp.position.x - ship.position.x, dy = e.grp.position.y - ship.position.y;
        const R = 3.2, d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const overlap = 1 - Math.sqrt(d2) / R;        // 1 = dead-centre, 0 = grazing
          hurtPlayer(8 + overlap * 18);
          explode(e.grp.position, false);
        }
        killEnemy(e, false);
      } else if (e.grp.position.z > 10) {
        killEnemy(e, false);
      }
    }
  }

  function killEnemy(e, scored) {
    e.active = false; e.grp.visible = false;
    if (scored) { run.score += 100; run.kills += 1; explode(e.grp.position, false); audio.explosion(false); }
  }

  function fireEnemyLaser(fromPos) {
    const l = eLasers.find(x => !x.active); if (!l) return;
    // aim at a lightly-led player position
    const aim = V.copy(ship.position); aim.z += 0;
    l.mesh.position.copy(fromPos);
    l.vel.copy(aim).sub(fromPos).normalize().multiplyScalar(150);
    l.mesh.lookAt(V2.copy(fromPos).add(l.vel));
    l.active = true; l.mesh.visible = true; l.ttl = 4;
    audio.enemyLaser();
  }

  // ---------------- towers ----------------
  function updateTowers(dt) {
    for (const t of towers) {
      if (!t.active) continue;
      t.grp.position.z += run.speed * dt;
      if (t.light) t.light.material.emissiveIntensity = 2 + Math.sin(run.time * 8) * 1.2;
      t.fireCd -= dt;
      if (t.fireCd <= 0 && t.grp.position.z < -40 && !run.finale) {
        t.fireCd = 1.6 + Math.random();
        fireEnemyLaser(V.copy(t.grp.position).add(V2.set(0, 2, 0)));
      }
      if (t.grp.position.z > 12) { t.active = false; t.grp.visible = false; }
    }
  }

  // ---------------- projectiles ----------------
  function updateLasers(dt) {
    for (const l of pLasers) {
      if (!l.active) continue;
      l.mesh.position.addScaledVector(l.vel, dt);
      l.ttl -= dt;
      if (l.ttl <= 0 || l.mesh.position.z > 20) { l.active = false; l.mesh.visible = false; continue; }
      // hit enemies
      for (const e of enemies) {
        if (!e.active) continue;
        if (l.mesh.position.distanceToSquared(e.grp.position) < 6) {   // aim-assist radius ~2.45u
          e.hp -= 1; l.active = false; l.mesh.visible = false;
          spark(l.mesh.position);
          if (e.hp <= 0) killEnemy(e, true); else audio.hit();
          break;
        }
      }
      if (!l.active) continue;
      for (const t of towers) {
        if (!t.active) continue;
        if (l.mesh.position.distanceToSquared(V.copy(t.grp.position).add(V2.set(0, 2, 0))) < 6) {
          t.hp -= 1; l.active = false; l.mesh.visible = false; spark(l.mesh.position);
          if (t.hp <= 0) { t.active = false; t.grp.visible = false; run.score += 250; explode(t.grp.position, true); audio.explosion(true); }
          else audio.hit();
          break;
        }
      }
    }
    for (const l of eLasers) {
      if (!l.active) continue;
      l.mesh.position.addScaledVector(l.vel, dt);
      l.ttl -= dt;
      if (l.ttl <= 0 || l.mesh.position.z > 20) { l.active = false; l.mesh.visible = false; continue; }
      if (l.mesh.position.distanceToSquared(ship.position) < 2.2) {
        l.active = false; l.mesh.visible = false; hurtPlayer(9); spark(ship.position);
      }
    }
  }

  // ---------------- particles ----------------
  function explode(pos, big) {
    const count = big ? 26 : 16;
    let made = 0;
    for (const p of particles) {
      if (p.active) continue;
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() * 2 - 1), (Math.random() * 2 - 1), (Math.random() * 2 - 1)).multiplyScalar(big ? 22 : 15);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      p.mesh.material.emissiveIntensity = big ? 4 : 3;
      p.mesh.scale.setScalar(big ? 1.4 : 1);
      p.life = 0; p.max = 0.5 + Math.random() * 0.4; p.active = true; p.mesh.visible = true;
      if (++made >= count) break;
    }
  }
  function spark(pos) {
    let made = 0;
    for (const p of particles) {
      if (p.active) continue;
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() * 2 - 1), (Math.random() * 2 - 1), (Math.random() * 2 - 1)).multiplyScalar(8);
      p.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.mesh.material.emissiveIntensity = 3; p.mesh.scale.setScalar(0.5);
      p.life = 0; p.max = 0.2 + Math.random() * 0.2; p.active = true; p.mesh.visible = true;
      if (++made >= 5) break;
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.position.z += run.speed * dt;
      p.vel.multiplyScalar(0.92);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt;
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(Math.max(0.01, k) * (p.mesh.scale.x > 1 ? 1.4 : 1));
      if (p.life >= p.max) { p.active = false; p.mesh.visible = false; }
    }
  }

  // ---------------- damage ----------------
  function hurtPlayer(amount) {
    amount *= run.diff.dmg;
    run.shieldCd = 2.2;
    if (run.shields > 0) {
      run.shields -= amount;
      if (run.shields < 0) { run.hull += run.shields; run.shields = 0; }
    } else {
      run.hull -= amount;
    }
    run.hurt = 0.4;
    audio.damage();
    if (run.hull <= 0 && !run.over) { run.hull = 0; run.over = true; explode(ship.position, true); audio.explosion(true); onLose(); }
  }

  // ---------------- finale ----------------
  function startFinale() {
    run.finale = true;
    enemies.forEach(e => { e.active = false; e.grp.visible = false; });
    towers.forEach(t => { t.active = false; t.grp.visible = false; });
    eLasers.forEach(l => { l.active = false; l.mesh.visible = false; });
    port.position.set(0, TRENCH.FLOOR_Y + 4, -420);   // inside the flyable Y band so lock is reachable
    port.visible = true; run.lock = 0; run.locked = false; run.portPassed = 0;
    onBanner('APPROACHING TARGET — STAND BY', false);
  }
  function updateFinale(dt) {
    port.position.z += run.speed * 0.55 * dt;
    if (port.userData.ring) port.userData.ring.material.emissiveIntensity = 2.4 + Math.sin(run.time * 5) * 1.0;
    // lock: aligned in x/y and within range
    const dx = port.position.x - ship.position.x, dy = port.position.y - ship.position.y;
    const aligned = Math.abs(dx) < 3.2 && Math.abs(dy) < 3.2;
    const inRange = port.position.z > -160 && port.position.z < -8;
    if (aligned && inRange) {
      run.lock = Math.min(1, run.lock + dt / 0.9);
      if (run.lock >= 1 && !run.locked) { run.locked = true; audio.locked(); }
      else if (run.lock < 1 && Math.random() < 0.25) audio.lockTick();
    } else {
      run.lock = Math.max(0, run.lock - dt * 1.4); run.locked = false;
    }
    // fire torpedo (F / right-click / gamepad / touch TORPEDO button)
    if (input.state.torpedoEdge && !run.torpActive && inRange) launchTorpedo();
    if (run.torpActive) {
      torpedo.position.z -= 220 * dt;
      torpedo.position.x += (port.position.x - torpedo.position.x) * Math.min(1, 6 * dt);
      torpedo.position.y += (port.position.y - torpedo.position.y) * Math.min(1, 6 * dt);
      if (torpedo.position.z <= port.position.z + 2) {
        run.torpActive = false; torpedo.visible = false;
        if (run.torpLocked || (Math.abs(dx) < 2.2 && Math.abs(dy) < 2.2)) winSequence();
        else onBanner('MISS — COME AROUND', true);
      }
    }
    // port passed without a hit → you get a few passes, then the run fails
    if (port.position.z > 14 && !run.over) {
      run.portPassed++;
      if (run.portPassed >= 3) {
        run.over = true;
        onBanner('THE STATION HAS CLEARED THE TRENCH — MISSION FAILED', true);
        onLose();
        return;
      }
      port.position.z = -420; port.position.x = (Math.random() * 2 - 1) * 4;
      run.lock = 0; run.locked = false;
    }
  }
  function launchTorpedo() {
    run.torpActive = true; run.torpLocked = run.locked;
    torpedo.position.copy(ship.position); torpedo.position.z -= 2;
    torpedo.visible = true;
    audio.torpedo();
  }
  function winSequence() {
    if (run.over) return;
    run.over = true;
    run.score += 2000;
    explode(port.position, true); explode(V.copy(port.position).add(V2.set(2, 1, 0)), true);
    audio.explosion(true); audio.win();
    onBanner('DIRECT HIT!', false);
    onWin();
  }

  // ---------------- camera ----------------
  function updateCamera(dt) {
    const f = Math.min(1, 5 * dt);
    camera.position.x += (ship.position.x * 0.55 - camera.position.x) * f;
    camera.position.y += (2.4 + ship.position.y * 0.4 - camera.position.y) * f;
    camera.position.z += (8 - camera.position.z) * f;
    // look toward the aim column so the reticle stays near screen centre
    camera.lookAt(ship.position.x, ship.position.y * 0.55 + 0.4, -22);
    // gentle, rate-limited bank (or none under reduced motion)
    const targetRoll = reduceMotion() ? 0 : -ship.rotation.z * 0.12;
    camRoll += (targetRoll - camRoll) * Math.min(1, 4 * dt);
    camera.rotateZ(camRoll);
  }

  // ---------------- main update ----------------
  function update(dt) {
    if (run.over) { updateParticles(dt); return; }
    run.time += dt;
    // speed / boost — boost draws a rechargeable energy reserve
    const boosting = input.state.boost && run.energy > 0;
    if (boosting) run.energy = Math.max(0, run.energy - 34 * dt);
    else run.energy = Math.min(100, run.energy + 16 * dt);
    const targetSpeed = (run.finale ? run.diff.espeed + 8 : run.diff.espeed + 16) * (boosting ? 1.5 : 1);
    run.speed += (targetSpeed - run.speed) * Math.min(1, 2 * dt);
    audio.setThrottle(boosting ? 1 : 0.45);

    if (!run.finale) {
      run.distance += run.speed * dt;
      if (run.distance >= run.diff.target) startFinale();
      // spawn director
      run.spawnT -= dt;
      if (run.spawnT <= 0) { spawnTie(); run.spawnT = Math.max(0.4, run.diff.spawn - run.distance / 6000); }
      run.towerT -= dt;
      if (run.towerT <= 0) { spawnTower(); run.towerT = Math.max(1.4, 3.2 - run.distance / 5000); }
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateTowers(dt);
    updateLasers(dt);
    if (run.finale) updateFinale(dt);
    updateParticles(dt);
    updateCamera(dt);

    // shield regen
    run.shieldCd -= dt;
    if (run.shieldCd <= 0 && run.shields < 100) run.shields = Math.min(100, run.shields + run.diff.regen * dt);
    if (run.hurt > 0) run.hurt -= dt;
  }

  // ---------------- HUD snapshot ----------------
  const size = () => ctx.engine.size;
  function toScreen(v) {
    const p = V2.copy(v).project(camera);
    const { W, H } = size();
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, behind: p.z > 1 };
  }
  function hudSnapshot() {
    const { W, H } = size();
    // reticle = convergence point ahead of ship
    const conv = V.copy(ship.position); conv.z -= CONVERGE;
    const ret = toScreen(conv);
    // enemy target boxes; pick locked = nearest to reticle within threshold
    const targets = [];
    let best = null, bestD = 90;
    for (const e of enemies) {
      if (!e.active) continue;
      const sp = toScreen(e.grp.position);
      if (sp.behind) continue;
      const depth = -e.grp.position.z;
      const boxSize = THREE.MathUtils.clamp(1600 / (depth + 20), 16, 120);
      const d = Math.hypot(sp.x - ret.x, sp.y - ret.y);
      const t = { x: sp.x, y: sp.y, size: boxSize, locked: false, hp: e.hp };
      targets.push(t);
      if (d < bestD && depth > 8) { best = { t, e, sp }; bestD = d; }
    }
    let lead = null;
    if (best) {
      best.t.locked = true;
      // lead: project where the TIE will be when a bolt reaches it (closing speed)
      const depth = -best.e.grp.position.z;
      const tHit = depth / (360 + run.speed);
      const future = V.copy(best.e.grp.position).addScaledVector(best.e.evel, tHit);
      const lp = toScreen(future);
      // only show the pip when it meaningfully differs from the target box
      if (Math.hypot(lp.x - best.sp.x, lp.y - best.sp.y) > 4) lead = { x: lp.x, y: lp.y };
    }
    let portHud = null;
    if (run.finale && port.visible) {
      const sp = toScreen(port.position);
      if (!sp.behind) {
        const depth = -port.position.z;
        portHud = { x: sp.x, y: sp.y, size: THREE.MathUtils.clamp(9000 / (depth + 20), 40, 320), lock: run.lock, locked: run.locked };
      }
    }
    return {
      reticle: ret, targets, lead, port: portHud,
      hurt: run.hurt, boosting: input.state.boost,
      finale: run.finale, W, H
    };
  }

  return { reset, update, run, ship, hudSnapshot, startFinaleNow: startFinale, port, enemies };
}
