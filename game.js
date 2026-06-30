/* ============================================================
   TRENCH RUN — Death Star Assault
   A Star Wars-inspired pseudo-3D trench shooter.
   Pure vanilla JS + Canvas 2D + WebAudio. No assets, no deps.
   ============================================================ */
(() => {
  'use strict';

  // ---------- Canvas / sizing ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1;
  let vx = 0, vy = 0;           // vanishing point
  let UNIT = 1;                 // scale factor relative to a 900px reference
  let skyGrad = null;           // static background brush, rebuilt only on resize

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    W = w; H = h;
    vx = W / 2;
    vy = H * 0.40;
    UNIT = Math.min(W, H) / 720;
    skyGrad = ctx.createLinearGradient(0, 0, 0, H || 1);
    skyGrad.addColorStop(0, '#05070f');
    skyGrad.addColorStop(0.45, '#0a1020');
    skyGrad.addColorStop(1, '#02030a');
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Trench geometry (screen px at near plane, depth 0) ----------
  const F = 320;                // focal length (in depth units)
  const DMAX = 26;              // far plane depth
  function trenchHalfW() { return W * 0.62; }
  function trenchTop()   { return H * 0.62; } // wall height above vanishing
  function trenchFloor() { return H * 0.66; } // floor depth below vanishing
  function scaleAt(d) { return F / (F + d); }

  // project a world offset (wx,wy from trench axis) at depth d to screen
  function proj(wx, wy, d) {
    const s = scaleAt(d);
    return { x: vx + wx * s, y: vy + wy * s, s };
  }

  // ---------- Audio (synthesized) ----------
  const Audio = (() => {
    let actx = null, master = null, muted = false, engineNode = null, engineGain = null;
    function ensure() {
      if (actx) return;
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = 0.5;
        master.connect(actx.destination);
      } catch (e) { actx = null; }
    }
    function resume() { if (actx && actx.state === 'suspended') actx.resume(); }
    function blip(type, freq, dur, vol, slideTo) {
      if (!actx || muted) return;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), actx.currentTime + dur);
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(actx.currentTime + dur);
    }
    function noise(dur, vol, filterFreq) {
      if (!actx || muted) return;
      const n = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource(); src.buffer = buf;
      const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = actx.createGain(); g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    }
    return {
      init() { ensure(); resume(); },
      get muted() { return muted; },
      setMuted(m) { muted = m; if (engineGain) engineGain.gain.value = m ? 0 : 0.04; },
      laser() { blip('square', 900, 0.16, 0.18, 120); },
      enemyLaser() { blip('sawtooth', 500, 0.18, 0.10, 90); },
      hit() { noise(0.18, 0.25, 900); },
      explode() { noise(0.5, 0.4, 700); blip('sawtooth', 180, 0.5, 0.18, 40); },
      damage() { noise(0.3, 0.3, 500); blip('square', 120, 0.25, 0.2, 50); },
      torpedo() { blip('sine', 320, 0.45, 0.22, 80); },
      win() {
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip('square', f, 0.3, 0.18), i * 140));
      },
      startEngine() {
        if (!actx || engineNode) return;
        engineNode = actx.createOscillator();
        engineNode.type = 'sawtooth'; engineNode.frequency.value = 58;
        const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
        engineGain = actx.createGain(); engineGain.gain.value = muted ? 0 : 0.04;
        engineNode.connect(lp); lp.connect(engineGain); engineGain.connect(master);
        engineNode.start();
      },
      stopEngine() { if (engineNode) { try { engineNode.stop(); } catch (e) {} engineNode = null; engineGain = null; } }
    };
  })();

  // ---------- Starfield (parallax above the trench) ----------
  let stars = [];
  function seedStars() {
    stars = [];
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (vy + 40),
        z: Math.random() * 0.8 + 0.2,
        r: Math.random() * 1.4 + 0.3
      });
    }
  }
  seedStars();
  window.addEventListener('resize', seedStars);

  // ---------- Input ----------
  const keys = {};
  const input = { mx: 0, my: 0, pointerActive: false, firing: false, autofire: false };
  const isTouch = matchMedia('(pointer:coarse)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  input.autofire = isTouch;

  addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') input.firing = true;
    if (e.key.toLowerCase() === 'p') togglePause();
    if (e.key === 'Enter') { if (game.state === 'title') startGame(); else if (game.state === 'over' || game.state === 'won') startGame(); }
  });
  addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    if (e.key === ' ') input.firing = false;
  });

  let dragId = null;   // identifier of the touch currently steering the ship
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    let p = e;
    if (e.touches) {
      p = null;
      for (const t of e.touches) { if (t.identifier === dragId) { p = t; break; } }
      if (!p) p = e.touches[0];
    }
    if (!p) return null;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function onPointerDown(e) {
    Audio.init();
    if (game.state !== 'playing') return;
    if (e.changedTouches) dragId = e.changedTouches[0].identifier;
    const p = pointerPos(e);
    if (!p) return;
    input.pointerActive = true;
    input.mx = p.x; input.my = p.y;
    if (!isTouch) input.firing = true;
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!input.pointerActive) return;
    const p = pointerPos(e);
    if (!p) return;
    input.mx = p.x; input.my = p.y;
    e.preventDefault();
  }
  function onPointerUp(e) {
    // For touch: only release when the finger that owns the drag lifts; ignore
    // stray fingers (e.g. the FIRE button) so they can't cancel an active drag.
    if (e && e.changedTouches) {
      let owned = false;
      for (const t of e.changedTouches) { if (t.identifier === dragId) { owned = true; break; } }
      if (!owned && e.touches && e.touches.length) return;
    }
    dragId = null;
    input.pointerActive = false;
    if (!isTouch) input.firing = false;
  }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  addEventListener('touchend', onPointerUp);
  addEventListener('touchcancel', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  const fireBtn = document.getElementById('fire-btn');
  const pressFire = e => { Audio.init(); input.firing = true; e.preventDefault(); };
  const releaseFire = () => { input.firing = false; };
  fireBtn.addEventListener('touchstart', pressFire, { passive: false });
  fireBtn.addEventListener('touchend', releaseFire);
  fireBtn.addEventListener('touchcancel', releaseFire);
  fireBtn.addEventListener('mousedown', pressFire);
  fireBtn.addEventListener('mouseup', releaseFire);

  // ---------- Game state ----------
  const HISCORE_KEY = 'trenchrun.hiscore';
  const game = {
    state: 'title',      // title | playing | paused | over | won
    score: 0,
    shields: 100,
    distance: 0,
    targetDist: 2600,
    speed: 7.5,
    shake: 0,
    finale: false,
    hiscore: +(localStorage.getItem(HISCORE_KEY) || 0)
  };

  // player ship: world offset from trench axis
  const ship = { x: 0, y: trenchFloor() * 0.42, vx: 0, vy: 0, fireCd: 0, hurt: 0 };

  let lasers = [];      // player bolts
  let enemies = [];     // TIE fighters
  let towers = [];      // turbolaser towers / obstacles on walls/floor
  let eshots = [];      // enemy bolts
  let particles = [];
  let port = null;      // exhaust port (finale)
  let spawnTimer = 0, towerTimer = 0;
  let portResult = 0;   // 0 pending, 1 hit, -1 missed-pass

  function resetRun() {
    (game.winTimers || []).forEach(clearTimeout); game.winTimers = [];
    game.score = 0; game.shields = 100; game.distance = 0;
    game.speed = 7.5; game.shake = 0; game.finale = false;
    ship.x = 0; ship.y = trenchFloor() * 0.42; ship.vx = 0; ship.vy = 0; ship.fireCd = 0; ship.hurt = 0;
    lasers = []; enemies = []; towers = []; eshots = []; particles = [];
    port = null; spawnTimer = 0.6; towerTimer = 1.4; portResult = 0;
  }

  // ---------- Spawning ----------
  function spawnTie() {
    const hw = trenchHalfW() * 0.82, hh = trenchFloor() * 0.78;
    enemies.push({
      x: (Math.random() * 2 - 1) * hw,
      y: (Math.random() * 2 - 1) * hh - trenchTop() * 0.1,
      d: DMAX,
      drift: (Math.random() * 2 - 1) * 18,
      vy: (Math.random() * 2 - 1) * 10,
      fireCd: 0.8 + Math.random() * 1.6,
      hp: 1,
      dead: false
    });
  }
  function spawnTower() {
    // an obstacle block you must dodge: anchored to a wall or floor, occupies part of cross-section
    const side = Math.floor(Math.random() * 3); // 0 left wall, 1 right wall, 2 floor pillar
    const hw = trenchHalfW(), fl = trenchFloor();
    let bx, by, w, h;
    if (side === 0)      { bx = -hw * 0.7; by = (Math.random() * 0.7 - 0.2) * fl; w = hw * 0.6; h = fl * 0.5; }
    else if (side === 1) { bx =  hw * 0.7; by = (Math.random() * 0.7 - 0.2) * fl; w = hw * 0.6; h = fl * 0.5; }
    else                 { bx = (Math.random() * 2 - 1) * hw * 0.5; by = fl * 0.78; w = hw * 0.34; h = fl * 0.5; }
    towers.push({ x: bx, y: by, w, h, d: DMAX, hit: false });
  }

  function fireLaser() {
    if (ship.fireCd > 0) return;
    ship.fireCd = 0.16;
    lasers.push({ x: ship.x, y: ship.y, d: 0, t: 0 });
    Audio.laser();
  }

  // ---------- Effects ----------
  function burst(x, y, s, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (Math.random() * 120 + 40) * s;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, age: 0, color, r: (Math.random() * 2 + 1) * s });
    }
  }
  function damagePlayer(amount) {
    game.shields = Math.max(0, game.shields - amount);
    game.shake = Math.min(18, game.shake + amount * 0.6);
    ship.hurt = 0.35;
    Audio.damage();
    if (game.shields <= 0) endGame(false);
  }

  // ---------- Update ----------
  function update(dt) {
    // ----- difficulty / distance -----
    if (!game.finale) {
      game.speed = 7.5 + game.distance / 320;
      game.distance += game.speed * dt * 6;
      if (game.distance >= game.targetDist) startFinale();
    }
    const speed = game.speed;

    // ----- ship control -----
    const accel = 1800 * UNIT, maxv = 620 * UNIT, fric = 0.86;
    let ix = 0, iy = 0;
    if (keys['arrowleft'] || keys['a']) ix -= 1;
    if (keys['arrowright'] || keys['d']) ix += 1;
    if (keys['arrowup'] || keys['w']) iy -= 1;
    if (keys['arrowdown'] || keys['s']) iy += 1;

    if (input.pointerActive) {
      // pointer maps to a near-plane world offset. On touch, float the ship
      // above the fingertip (so the thumb never hides it) and expand vertical
      // reach so a finger in the lower screen still reaches the trench floor.
      const tx = input.mx - vx;
      let ty = input.my - vy;
      if (isTouch) ty = ty * 1.25 - 90 * UNIT;
      const k = 1 - Math.exp(-18 * dt);     // frame-rate-independent critical damping
      const nx = ship.x + (tx - ship.x) * k;
      const ny = ship.y + (ty - ship.y) * k;
      ship.vx = (nx - ship.x) / Math.max(dt, 1e-4);
      ship.vy = (ny - ship.y) / Math.max(dt, 1e-4);
      ship.x = nx; ship.y = ny;
    } else {
      ship.vx += ix * accel * dt;
      ship.vy += iy * accel * dt;
      ship.vx = Math.max(-maxv, Math.min(maxv, ship.vx));
      ship.vy = Math.max(-maxv, Math.min(maxv, ship.vy));
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      if (!ix) ship.vx *= fric;
      if (!iy) ship.vy *= fric;
    }

    // clamp within trench
    const hw = trenchHalfW() * 0.92, top = -trenchTop() * 0.78, fl = trenchFloor() * 0.9;
    if (ship.x < -hw) { ship.x = -hw; ship.vx = 0; }
    if (ship.x >  hw) { ship.x =  hw; ship.vx = 0; }
    if (ship.y < top) { ship.y = top; ship.vy = 0; }
    if (ship.y >  fl) { ship.y =  fl; ship.vy = 0; }

    // ----- firing -----
    ship.fireCd -= dt;
    if (input.firing || input.autofire) fireLaser();
    if (ship.hurt > 0) ship.hurt -= dt;

    // ----- spawns -----
    if (!game.finale) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTie();
        spawnTimer = Math.max(0.35, 1.5 - game.distance / 2200);
      }
      towerTimer -= dt;
      if (towerTimer <= 0) {
        spawnTower();
        towerTimer = Math.max(0.9, 2.6 - game.distance / 2600);
      }
    }

    // ----- lasers -----
    const lspeed = 46;
    for (const l of lasers) { l.d += lspeed * dt; l.t += dt; }
    lasers = lasers.filter(l => l.d < DMAX);

    // ----- enemies -----
    for (const e of enemies) {
      e.d -= speed * dt;
      e.x += e.drift * dt;
      e.y += e.vy * dt;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.d > 3 && e.d < DMAX * 0.8 && !game.finale) {
        e.fireCd = 1.4 + Math.random() * 1.8;
        eshots.push({ x: e.x, y: e.y, d: e.d, sx: e.x, sy: e.y });
        Audio.enemyLaser();
      }
      // laser hits
      for (const l of lasers) {
        if (Math.abs(l.d - e.d) < 1.2) {
          const dx = l.x - e.x, dy = l.y - e.y;
          const hr = 54 * scaleAt(e.d) + 16;
          if (dx * dx + dy * dy < hr * hr) {
            e.dead = true; l.d = DMAX + 1;
            const p = proj(e.x, e.y, e.d);
            burst(p.x, p.y, p.s + 0.3, '#ffb020', 16);
            Audio.explode();
            game.score += 100;
          }
        }
      }
      // reached player plane
      if (e.d <= 0.4 && !e.dead) {
        e.dead = true;
        const dx = e.x - ship.x, dy = e.y - ship.y;
        if (dx * dx + dy * dy < (70 * UNIT) * (70 * UNIT)) damagePlayer(18);
      }
    }
    enemies = enemies.filter(e => !e.dead && e.d > -1);

    // ----- towers / obstacles -----
    for (const t of towers) {
      t.d -= speed * dt;
      if (t.d <= 0.5 && !t.hit) {
        t.hit = true;
        // collision: is ship inside the block's world rect?
        if (ship.x > t.x - t.w / 2 && ship.x < t.x + t.w / 2 &&
            ship.y > t.y - t.h / 2 && ship.y < t.y + t.h / 2) {
          damagePlayer(26);
          const p = proj(ship.x, ship.y, 0.5);
          burst(p.x, p.y, 1.2, '#ff5a3c', 20);
        }
      }
    }
    towers = towers.filter(t => t.d > -1);

    // ----- enemy shots -----
    for (const s of eshots) {
      s.d -= (speed + 16) * dt;
      if (s.d <= 0.4) {
        s.dead = true;
        const dx = s.x - ship.x, dy = s.y - ship.y;
        if (dx * dx + dy * dy < (46 * UNIT) * (46 * UNIT)) damagePlayer(10);
      }
    }
    eshots = eshots.filter(s => !s.dead && s.d > -1);

    // ----- exhaust port (finale) -----
    if (port) {
      if (portResult === 0) {
        port.d -= (speed * 0.7) * dt;
        // torpedo / laser hit on port when close & aligned
        for (const l of lasers) {
          if (Math.abs(l.d - port.d) < 2.2 && port.d < 8) {
            const dx = l.x - port.x, dy = l.y - port.y;
            const hr = 52 * scaleAt(port.d) + 10;
            if (dx * dx + dy * dy < hr * hr) { winShot(); }
          }
        }
        if (port.d <= 0.3 && portResult === 0) {
          // missed this pass — loop around
          portResult = -1;
          port.flash = 0.8;
        }
      } else if (portResult === -1) {
        port.flash -= dt;
        if (port.flash <= 0) { // re-approach
          portResult = 0; port.d = DMAX; port.x = (Math.random() * 2 - 1) * trenchHalfW() * 0.3;
        }
      }
    }

    // ----- particles -----
    for (const p of particles) {
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
    particles = particles.filter(p => p.age < p.life);

    // ----- camera shake decay -----
    game.shake *= 0.88;

    // ----- starfield drift -----
    for (const st of stars) {
      st.x -= st.z * speed * 4 * dt;
      if (st.x < 0) { st.x = W; st.y = Math.random() * (vy + 40); }
    }

    updateHud();
  }

  function startFinale() {
    game.finale = true;
    enemies = []; towers = []; eshots = [];
    port = { x: 0, y: trenchFloor() * 0.55, d: DMAX, flash: 0 };
    portResult = 0;
    document.getElementById('targeting').classList.remove('hidden');
  }
  function winShot() {
    if (game.state !== 'playing') return;
    portResult = 1;
    game.score += 1500;
    const p = proj(port.x, port.y, port.d);
    burst(p.x, p.y, 2.5, '#fff2a0', 40);
    Audio.torpedo();
    game.shake = 26;
    // Track these so a restart within the win animation window can cancel them
    // (otherwise a stale timer would end a fresh run with a phantom win).
    game.winTimers = [
      setTimeout(() => { burst(W / 2, vy, 4, '#ffd34d', 70); Audio.win(); }, 250),
      setTimeout(() => endGame(true), 900)
    ];
  }

  // ---------- Render ----------
  function render() {
    ctx.save();
    let sx = 0, sy = 0;
    if (!reduceMotion && game.shake > 0.3) {
      sx = (Math.random() * 2 - 1) * game.shake;
      sy = (Math.random() * 2 - 1) * game.shake;
      ctx.translate(sx, sy);
    }

    // background sky (gradient is built once per resize, not per frame)
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // stars
    for (const st of stars) {
      ctx.globalAlpha = st.z;
      ctx.fillStyle = '#cdd9ff';
      ctx.fillRect(st.x, st.y, st.r, st.r);
    }
    ctx.globalAlpha = 1;

    drawTrench();

    // sort drawables far->near
    const order = [];
    for (const t of towers) order.push({ d: t.d, kind: 't', o: t });
    for (const e of enemies) order.push({ d: e.d, kind: 'e', o: e });
    for (const s of eshots) order.push({ d: s.d, kind: 's', o: s });
    if (port) order.push({ d: port.d, kind: 'p', o: port });
    order.sort((a, b) => b.d - a.d);
    for (const it of order) {
      if (it.kind === 't') drawTower(it.o);
      else if (it.kind === 'e') drawTie(it.o);
      else if (it.kind === 's') drawEnemyShot(it.o);
      else if (it.kind === 'p') drawPort(it.o);
    }

    drawLasers();
    drawParticles();
    if (game.state === 'playing' || game.state === 'paused') drawShip();

    ctx.restore();
  }

  function drawTrench() {
    const hw = trenchHalfW(), top = trenchTop(), fl = trenchFloor();
    const sFar = scaleAt(DMAX);
    // floor fill
    ctx.fillStyle = '#0b1018';
    ctx.beginPath();
    ctx.moveTo(vx - hw, vy + fl);
    ctx.lineTo(vx + hw, vy + fl);
    ctx.lineTo(vx + hw * sFar, vy + fl * sFar);
    ctx.lineTo(vx - hw * sFar, vy + fl * sFar);
    ctx.closePath(); ctx.fill();
    // walls
    ctx.fillStyle = '#0d121c';
    ctx.beginPath();
    ctx.moveTo(vx - hw, vy - top); ctx.lineTo(vx - hw, vy + fl);
    ctx.lineTo(vx - hw * sFar, vy + fl * sFar); ctx.lineTo(vx - hw * sFar, vy - top * sFar);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(vx + hw, vy - top); ctx.lineTo(vx + hw, vy + fl);
    ctx.lineTo(vx + hw * sFar, vy + fl * sFar); ctx.lineTo(vx + hw * sFar, vy - top * sFar);
    ctx.closePath(); ctx.fill();

    // scrolling depth frames (grid rushing toward viewer)
    const SEG = 1.7;
    const scroll = (game.distance * 0.10) % SEG;
    ctx.lineWidth = 1;
    for (let i = 1; i < 22; i++) {
      const d = i * SEG - scroll;
      if (d <= 0.05 || d > DMAX) continue;
      const s = scaleAt(d);
      const a = Math.max(0, Math.min(0.5, (1 - d / DMAX) * 0.6));
      ctx.strokeStyle = `rgba(90,150,210,${a})`;
      const lx = vx - hw * s, rx = vx + hw * s;
      const ty = vy - top * s, by = vy + fl * s;
      ctx.beginPath();
      ctx.moveTo(lx, ty); ctx.lineTo(lx, by);   // left vertical
      ctx.lineTo(rx, by); ctx.lineTo(rx, ty);   // floor + right vertical
      ctx.stroke();
    }
    // longitudinal lines on floor (perspective rails)
    ctx.strokeStyle = 'rgba(70,120,180,0.25)';
    for (let g = -2; g <= 2; g++) {
      const wxp = g / 2 * hw;
      ctx.beginPath();
      ctx.moveTo(vx + wxp, vy + fl);
      ctx.lineTo(vx + wxp * sFar, vy + fl * sFar);
      ctx.stroke();
    }
    // bright rims along the trench top edges
    ctx.strokeStyle = 'rgba(120,180,240,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx - hw, vy - top); ctx.lineTo(vx - hw * sFar, vy - top * sFar);
    ctx.moveTo(vx + hw, vy - top); ctx.lineTo(vx + hw * sFar, vy - top * sFar);
    ctx.stroke();
  }

  function drawTie(e) {
    const p = proj(e.x, e.y, e.d);
    if (p.s <= 0) return;
    const r = 26 * p.s + 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = Math.min(1, p.s * 6);
    // wings
    ctx.fillStyle = '#23262e';
    ctx.strokeStyle = '#5a6573';
    ctx.lineWidth = Math.max(1, 2 * p.s);
    ctx.fillRect(-r * 1.5, -r, r * 0.55, r * 2);
    ctx.strokeRect(-r * 1.5, -r, r * 0.55, r * 2);
    ctx.fillRect(r * 0.95, -r, r * 0.55, r * 2);
    ctx.strokeRect(r * 0.95, -r, r * 0.55, r * 2);
    // struts
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    // pod
    ctx.fillStyle = '#3a4150';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7c8898'; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#11151c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawTower(t) {
    const s = scaleAt(t.d);
    if (s <= 0) return;
    const cx = vx + t.x * s, cy = vy + t.y * s;
    const w = t.w * s, h = t.h * s;
    ctx.save();
    ctx.globalAlpha = Math.min(1, s * 7);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, '#2a2f3a'); g.addColorStop(0.5, '#3c4452'); g.addColorStop(1, '#1d222b');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = 'rgba(150,180,210,0.5)';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    // panel detail
    ctx.strokeStyle = 'rgba(120,140,170,0.3)';
    for (let i = 1; i < 3; i++) {
      const yy = cy - h / 2 + (h / 3) * i;
      ctx.beginPath(); ctx.moveTo(cx - w / 2, yy); ctx.lineTo(cx + w / 2, yy); ctx.stroke();
    }
    // warning glow when near
    if (t.d < 5) {
      ctx.globalAlpha = (5 - t.d) / 5 * 0.5;
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(cx - w / 2, cy - h / 2, w, 4 * s + 1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawEnemyShot(s) {
    const p = proj(s.x, s.y, s.d);
    const len = 22 * p.s + 4;
    ctx.strokeStyle = '#ff4030';
    ctx.lineWidth = Math.max(2, 4 * p.s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - len); ctx.lineTo(p.x, p.y + len);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawPort(port) {
    const p = proj(port.x, port.y, port.d);
    const r = 40 * p.s + 4;
    ctx.save();
    ctx.translate(p.x, p.y);
    // housing
    ctx.fillStyle = '#1a1f29';
    ctx.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
    ctx.strokeStyle = '#6b7686'; ctx.lineWidth = Math.max(1, 2 * p.s);
    ctx.strokeRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
    // the port hole
    const flash = portResult === 1 ? 1 : (portResult === -1 ? Math.max(0, port.flash) : 0.5 + 0.5 * Math.sin(performance.now() / 120));
    ctx.fillStyle = portResult === -1 ? '#ff4030' : '#222';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
    // glow ring: wide low-alpha underlay + bright ring (cheaper than shadowBlur)
    ctx.strokeStyle = portResult === -1 ? 'rgba(255,64,48,0.45)' : `rgba(255,211,77,${0.25 + flash * 0.35})`;
    ctx.lineWidth = Math.max(5, 11 * p.s);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = portResult === -1 ? '#ff6050' : `rgba(255,211,77,${0.4 + flash * 0.6})`;
    ctx.lineWidth = Math.max(2, 4 * p.s);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    // targeting brackets
    if (portResult === 0) {
      ctx.strokeStyle = '#ffe81f'; ctx.lineWidth = 2;
      const b = r * 1.7;
      for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
        ctx.beginPath();
        ctx.moveTo(dx * b, dy * b - dy * r * 0.5);
        ctx.lineTo(dx * b, dy * b);
        ctx.lineTo(dx * b - dx * r * 0.5, dy * b);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLasers() {
    ctx.lineCap = 'round';
    for (const l of lasers) {
      const p = proj(l.x, l.y, l.d);
      const len = 26 * (1 - l.d / DMAX) + 6;
      // cheap glow: a wide translucent underlay then a bright thin core (no shadowBlur)
      ctx.strokeStyle = 'rgba(255,43,43,0.35)';
      ctx.lineWidth = Math.max(4, 9 * p.s);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + len);
      ctx.stroke();
      ctx.strokeStyle = '#ff8a8a';
      ctx.lineWidth = Math.max(1.5, 3 * p.s);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + len);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawParticles() {
    for (const p of particles) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    // first-person X-wing: cockpit frame + cannons + targeting reticle at ship offset
    const rx = vx + ship.x, ry = vy + ship.y;

    // cockpit cannons firing lines (bottom corners -> reticle)
    const cl = { x: W * 0.16, y: H + 10 }, cr = { x: W * 0.84, y: H + 10 };
    if (ship.fireCd > 0.10) {
      ctx.strokeStyle = 'rgba(255,60,60,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cl.x, cl.y); ctx.lineTo(rx, ry);
      ctx.moveTo(cr.x, cr.y); ctx.lineTo(rx, ry); ctx.stroke();
    }

    // targeting reticle
    const hurt = ship.hurt > 0;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.strokeStyle = hurt ? '#ff4030' : '#ffe81f';
    ctx.lineWidth = 2;
    const R = 18 * UNIT;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 1.6, 0); ctx.lineTo(-R * 0.6, 0);
    ctx.moveTo(R * 0.6, 0); ctx.lineTo(R * 1.6, 0);
    ctx.moveTo(0, -R * 1.6); ctx.lineTo(0, -R * 0.6);
    ctx.moveTo(0, R * 0.6); ctx.lineTo(0, R * 1.6);
    ctx.stroke();
    ctx.fillStyle = hurt ? '#ff4030' : '#ffe81f';
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();

    // cockpit frame (subtle vignette struts at bottom)
    ctx.fillStyle = 'rgba(6,9,15,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, H * 0.86);
    ctx.quadraticCurveTo(W * 0.5, H * 0.99, W, H * 0.86);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // wing struts
    ctx.strokeStyle = 'rgba(40,52,70,0.9)'; ctx.lineWidth = 6 * UNIT;
    ctx.beginPath();
    ctx.moveTo(W * 0.16, H + 10); ctx.lineTo(W * 0.30, H * 0.9);
    ctx.moveTo(W * 0.84, H + 10); ctx.lineTo(W * 0.70, H * 0.9);
    ctx.stroke();
  }

  // ---------- HUD ----------
  const elShield = document.getElementById('shield-fill');
  const elDist = document.getElementById('dist-fill');
  const elScore = document.getElementById('score');
  function updateHud() {
    elShield.style.width = game.shields + '%';
    elShield.style.background = game.shields > 50
      ? 'linear-gradient(90deg,#6bff5a,#bfff5a)'
      : game.shields > 25 ? 'linear-gradient(90deg,#ffd34d,#ffe81f)'
      : 'linear-gradient(90deg,#ff3b30,#ff7a4d)';
    const pct = Math.min(100, (game.distance / game.targetDist) * 100);
    elDist.style.width = pct + '%';
    elScore.textContent = game.score;
  }

  // ---------- State transitions ----------
  const overlay = document.getElementById('overlay');
  const titleScreen = document.getElementById('title-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const endScreen = document.getElementById('end-screen');
  const hud = document.getElementById('hud');
  const touchControls = document.getElementById('touch-controls');
  const pauseToggle = document.getElementById('pause-toggle');
  const targeting = document.getElementById('targeting');

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function startGame() {
    Audio.init(); Audio.startEngine();
    resetRun();
    game.state = 'playing';
    hide(overlay); hide(titleScreen); hide(pauseScreen); hide(endScreen);
    show(hud); pauseToggle.classList.remove('hidden');
    if (isTouch) show(touchControls);
    hide(targeting);
  }
  function endGame(won) {
    if (game.state === 'won' || game.state === 'over') return;
    game.state = won ? 'won' : 'over';
    Audio.stopEngine();
    if (game.score > game.hiscore) { game.hiscore = game.score; localStorage.setItem(HISCORE_KEY, game.hiscore); }
    if (!won) Audio.explode();
    const endTitle = document.getElementById('end-title');
    endTitle.textContent = won ? 'DIRECT HIT!' : 'X-WING DOWN';
    endTitle.classList.toggle('fail', !won);
    document.getElementById('end-msg').textContent = won
      ? 'The exhaust port is breached — the Death Star is destroyed. Great shot, kid; that was one in a million!'
      : 'Your fighter was lost over the trench. The Rebellion needs another pilot…';
    document.getElementById('final-score').textContent = game.score;
    document.getElementById('final-best').textContent = game.hiscore;
    if (won) burst(W / 2, H / 2, 5, '#ffd34d', 80);
    setTimeout(() => { show(overlay); show(endScreen); }, won ? 300 : 700);
    hide(hud); hide(touchControls); hide(pauseScreen); pauseToggle.classList.add('hidden'); hide(targeting);
  }
  function togglePause() {
    if (game.state === 'playing') { game.state = 'paused'; show(overlay); show(pauseScreen); Audio.stopEngine(); }
    else if (game.state === 'paused') { game.state = 'playing'; hide(overlay); hide(pauseScreen); Audio.startEngine(); }
  }

  // buttons
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('again-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', togglePause);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  pauseToggle.addEventListener('click', togglePause);
  const muteBtn = document.getElementById('mute-btn');
  muteBtn.addEventListener('click', () => {
    const m = !Audio.muted; Audio.setMuted(m);
    muteBtn.textContent = m ? '🔇' : '♪';
    muteBtn.classList.toggle('off', m);
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
  });
  document.getElementById('title-hiscore').textContent = game.hiscore;

  function clearInput() {
    for (const k in keys) keys[k] = false;
    input.firing = false; input.pointerActive = false; dragId = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInput(); if (game.state === 'playing') togglePause(); }
  });
  window.addEventListener('blur', clearInput);

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp big gaps (tab-switch, lag spike)
    try {
      if (W && H) {                       // skip until viewport has real dimensions
        if (game.state === 'playing') update(dt);
        render();
      }
    } catch (e) { console.error('TrenchRun loop error:', e); }
    requestAnimationFrame(frame);
  }
  // a real browser sizes the viewport before first paint, but guard the case
  // where the initial resize() ran while innerWidth/innerHeight were still 0.
  window.addEventListener('load', resize);
  requestAnimationFrame(frame);

  // Debug hook — only exposed with ?debug, so the shipping build stays clean.
  // Lets a headless harness step the loop deterministically without rAF.
  if (/[?&]debug\b/.test(location.search)) {
    window.__TR = {
      info: () => ({ state: game.state, score: game.score, shields: game.shields,
        distance: Math.round(game.distance), finale: game.finale, enemies: enemies.length,
        towers: towers.length, lasers: lasers.length, eshots: eshots.length,
        particles: particles.length, port: !!port, W, H }),
      step: (frames, dt) => {
        const errs = [];
        for (let i = 0; i < (frames || 1); i++) {
          try { if (game.state === 'playing') update(dt || 0.016); render(); }
          catch (e) { errs.push(String((e && e.stack) || e)); break; }
        }
        return errs;
      },
      start: () => startGame(),
      resize: () => resize(),
      setDistance: (d) => { game.distance = d; },
      ship, getPort: () => port, fire: () => fireLaser(), damage: (n) => damagePlayer(n)
    };
  }
})();
