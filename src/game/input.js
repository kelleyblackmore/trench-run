// input.js — unified controls: keyboard, mouse-flight, touch stick, gamepad.
// Each source updates its own flags; update() combines them so nothing sticks.
export function createInput(canvas) {
  const isTouch = matchMedia('(pointer:coarse)').matches;
  const state = {
    axisX: 0, axisY: 0,        // velocity-style steering (-1..1)
    moveTo: null,              // {nx,ny} absolute mouse target (-1..1) or null
    fire: false, boost: false,
    torpedoHeld: false, torpedoEdge: false,
    pausePressed: false,
    isTouch, autofire: isTouch
  };
  const src = { kbFire: false, mouseFire: false, kbBoost: false, torpHeld: false, torpEdge: false, padTorpPrev: false };
  const keys = {};

  // ---------- keyboard ----------
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys[k] = true;
    if (k === ' ' || k === 'l') src.kbFire = true;
    if (k === 'f') { src.torpEdge = true; src.torpHeld = true; }
    if (k === 'shift') src.kbBoost = true;
    if (k === 'p' || k === 'escape') state.pausePressed = true;
    state.moveTo = null;
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === ' ' || k === 'l') src.kbFire = false;
    if (k === 'f') src.torpHeld = false;
    if (k === 'shift') src.kbBoost = false;
  });
  function keyAxes() {
    let x = 0, y = 0;
    if (keys['arrowleft'] || keys['a']) x -= 1;
    if (keys['arrowright'] || keys['d']) x += 1;
    if (keys['arrowup'] || keys['w']) y += 1;
    if (keys['arrowdown'] || keys['s']) y -= 1;
    return { x, y };
  }

  // ---------- mouse (desktop flight + fire) ----------
  if (!isTouch) {
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      state.moveTo = { nx: (e.clientX - r.left) / r.width * 2 - 1, ny: (e.clientY - r.top) / r.height * 2 - 1 };
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) src.mouseFire = true;
      else if (e.button === 2) { src.torpEdge = true; src.torpHeld = true; }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) src.mouseFire = false;
      else if (e.button === 2) src.torpHeld = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------- touch virtual stick ----------
  let stickId = null, stickActive = false, stickCX = 0, stickCY = 0;
  const zone = document.getElementById('stick-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  const R = 52;
  if (zone && base && knob) {
    zone.addEventListener('touchstart', e => {
      if (stickId !== null) return;   // a finger already owns the stick; ignore extras
      const t = e.changedTouches[0];
      stickId = t.identifier; stickActive = true; stickCX = t.clientX; stickCY = t.clientY;
      base.style.left = (stickCX - 59) + 'px'; base.style.top = (stickCY - 59) + 'px';
      base.classList.add('active'); knob.style.transform = 'translate(0,0)';
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - stickCX, dy = t.clientY - stickCY;
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(len, R);
        const kx = dx / len * cl, ky = dy / len * cl;
        knob.style.transform = `translate(${kx}px,${ky}px)`;
        // dead zone → output exactly 0 near centre so ship friction re-engages
        const dz = 0.12, mag = cl / R;
        const out = mag < dz ? 0 : (mag - dz) / (1 - dz);
        state.axisX = (dx / len) * out; state.axisY = -(dy / len) * out;
      }
      e.preventDefault();
    }, { passive: false });
    const endStick = e => {
      for (const t of e.changedTouches) if (t.identifier === stickId) {
        stickId = null; stickActive = false; state.axisX = 0; state.axisY = 0;
        base.classList.remove('active'); knob.style.transform = 'translate(0,0)';
      }
    };
    zone.addEventListener('touchend', endStick);
    zone.addEventListener('touchcancel', endStick);
  }
  // external hooks for the touch BOOST / TORPEDO buttons (wired in main)
  const touchBtn = {
    boostDown: () => { src.kbBoost = true; },
    boostUp: () => { src.kbBoost = false; },
    torpedo: () => { src.torpEdge = true; }
  };

  // ---------- per-frame combine ----------
  function update() {
    const ka = keyAxes();
    let gx = 0, gy = 0, padAxis = false, padFire = false, padBoost = false, padTorp = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = 0.18;
      gx = Math.abs(p.axes[0]) > dz ? p.axes[0] : 0;
      gy = Math.abs(p.axes[1]) > dz ? p.axes[1] : 0;
      padAxis = !!(gx || gy);
      padFire = !!((p.buttons[0] && p.buttons[0].pressed) || (p.buttons[7] && p.buttons[7].pressed));
      padBoost = !!((p.buttons[6] && p.buttons[6].pressed) || (p.buttons[1] && p.buttons[1].pressed));
      padTorp = !!((p.buttons[2] && p.buttons[2].pressed) || (p.buttons[3] && p.buttons[3].pressed));
      break;
    }

    if (ka.x || ka.y) { state.axisX = ka.x; state.axisY = ka.y; state.moveTo = null; }
    else if (stickActive) { /* axes set by touch handlers */ }
    else if (padAxis) { state.axisX = gx; state.axisY = -gy; state.moveTo = null; }
    else if (!isTouch) { state.axisX = 0; state.axisY = 0; } // mouse target drives instead
    else { state.axisX = 0; state.axisY = 0; }

    if (padTorp && !src.padTorpPrev) src.torpEdge = true;
    src.padTorpPrev = padTorp;

    state.fire = src.kbFire || src.mouseFire || padFire || (isTouch && state.autofire);
    state.boost = src.kbBoost || padBoost;
    state.torpedoHeld = src.torpHeld || padTorp;
    state.torpedoEdge = src.torpEdge;
  }

  function resetEdges() { src.torpEdge = false; state.torpedoEdge = false; state.pausePressed = false; }
  function clearAll() {
    for (const k in keys) keys[k] = false;
    src.kbFire = src.mouseFire = src.kbBoost = src.torpHeld = false;
    state.axisX = state.axisY = 0; state.fire = state.boost = false; state.moveTo = null;
  }

  return { state, update, resetEdges, clearAll, touchBtn };
}
