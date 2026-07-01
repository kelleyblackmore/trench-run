// main.js — bootstrap, state machine, menu wiring, and the render loop.
import { createEngine } from './game/engine.js';
import { buildTrench } from './game/trench.js';
import { buildStarfield } from './game/starfield.js';
import { createSystems } from './game/systems.js';
import { createInput } from './game/input.js';
import { createAudio } from './game/audio.js';
import { createHud } from './game/hud.js';

const $ = id => document.getElementById(id);
const sceneCanvas = $('scene');
const hudCanvas = $('hud');

const reduceMotionMQ = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = reduceMotionMQ.matches;
if (reduceMotionMQ.addEventListener) reduceMotionMQ.addEventListener('change', e => { reduceMotion = e.matches; });

let engine;
try {
  engine = createEngine(sceneCanvas);
} catch (e) {
  const l = document.getElementById('loading');
  if (l) l.innerHTML = '<p class="loading-txt">This game needs WebGL. Try a different browser, or turn on hardware acceleration.</p>';
  throw e;
}
const trench = buildTrench(engine.scene);
buildStarfield(engine.scene);
const audio = createAudio();
const input = createInput(sceneCanvas);
const hud = createHud(hudCanvas);

const systems = createSystems({
  scene: engine.scene, camera: engine.camera, engine, audio, input,
  reduceMotion: () => reduceMotion,
  onWin: () => finish(true),
  onLose: () => finish(false),
  onBanner: (t, warn) => hud.banner(t, warn),
});

// ---------------- persisted settings ----------------
const LS = {
  best: +(localStorage.getItem('trenchrun3d.best') || 0),
  quality: localStorage.getItem('trenchrun3d.quality'),
  muted: localStorage.getItem('trenchrun3d.muted') === '1',
  diff: localStorage.getItem('trenchrun3d.diff') || 'pilot',
};
// first-time visitors get an auto-selected tier; phones / low-core / reduced-motion step down
const autoDefault = reduceMotion ? 'low'
  : (engine.coarse || (navigator.hardwareConcurrency || 8) <= 4) ? 'medium' : 'high';
let quality = ['low', 'medium', 'high'].includes(LS.quality) ? LS.quality : autoDefault;
let difficulty = LS.diff;
engine.setQuality(quality);
$('quality-btn').textContent = quality.toUpperCase();
audio.setMuted(LS.muted);
$('sound-btn').textContent = LS.muted ? '🔇' : '♪';
$('sound-btn').classList.toggle('off', LS.muted);
$('sound-btn').setAttribute('aria-pressed', String(LS.muted));
$('title-best').textContent = LS.best;
document.querySelectorAll('.diff').forEach(b => b.classList.toggle('sel', b.dataset.diff === difficulty));

// ---------------- state machine ----------------
let state = 'loading';
const screens = ['loading', 'title', 'howto', 'pause', 'result'];
function showScreen(name) {
  $('overlay').classList.toggle('hidden', name === null);
  screens.forEach(s => $(s).classList.toggle('hidden', s !== name));
}
function setPlayingUI(on) {
  $('frame').classList.toggle('hidden', !on);
  $('pause-btn').classList.toggle('hidden', !on);
  if (input.state.isTouch) $('touch').classList.toggle('hidden', !on);
}

function toTitle() {
  state = 'title'; showScreen('title'); setPlayingUI(false);
  $('torp-btn').classList.add('hidden');
  audio.stopEngine(); input.resetEdges();
  $('title-best').textContent = LS.best;
}
function startRun() {
  audio.init(); audio.startEngine();
  systems.reset(difficulty);
  input.resetEdges();   // drop any pause/torpedo edge armed on a menu (e.g. Esc)
  state = 'playing'; showScreen(null); setPlayingUI(true);
}
let finaleTouchUI = false;
function finish(won) {
  if (state !== 'playing') return;
  state = 'result';
  if (systems.run.score > LS.best) { LS.best = systems.run.score; localStorage.setItem('trenchrun3d.best', LS.best); }
  const title = $('result-title');
  title.textContent = won ? 'DIRECT HIT' : 'X-WING DOWN';
  title.classList.toggle('fail', !won);
  $('result-msg').textContent = won
    ? 'The port is breached — the Death Star is destroyed. Great shot, kid, that was one in a million!'
    : 'Your fighter was lost over the trench. The Rebellion needs every pilot it can find.';
  $('r-score').textContent = systems.run.score;
  $('r-kills').textContent = systems.run.kills;
  $('r-best').textContent = LS.best;
  setPlayingUI(false);
  audio.stopEngine();
  // brief delay so the explosion reads before the panel
  setTimeout(() => { if (state === 'result') showScreen('result'); }, won ? 700 : 900);
}
function togglePause(force) {
  if (state === 'playing' && force !== false) { state = 'paused'; showScreen('pause'); audio.stopEngine(); input.clearAll(); }
  else if (state === 'paused' && force !== true) { state = 'playing'; showScreen(null); audio.startEngine(); }
}

// ---------------- menu buttons ----------------
$('play-btn').addEventListener('click', startRun);
$('again-btn').addEventListener('click', startRun);
$('menu-btn').addEventListener('click', toTitle);
$('how-btn').addEventListener('click', () => { state = 'howto'; showScreen('howto'); });
$('how-back').addEventListener('click', toTitle);
$('resume-btn').addEventListener('click', () => togglePause(false));
$('abort-btn').addEventListener('click', toTitle);
$('pause-btn').addEventListener('click', () => togglePause());
document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => {
  difficulty = b.dataset.diff; localStorage.setItem('trenchrun3d.diff', difficulty);
  document.querySelectorAll('.diff').forEach(x => x.classList.toggle('sel', x === b));
}));
$('sound-btn').addEventListener('click', () => {
  const m = !audio.muted; audio.setMuted(m); localStorage.setItem('trenchrun3d.muted', m ? '1' : '0');
  $('sound-btn').textContent = m ? '🔇' : '♪';
  $('sound-btn').classList.toggle('off', m);
  $('sound-btn').setAttribute('aria-pressed', String(m));
  $('sound-btn').setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
});
$('quality-btn').addEventListener('click', () => {
  const order = ['low', 'medium', 'high'];
  quality = order[(order.indexOf(quality) + 1) % 3];
  engine.setQuality(quality); localStorage.setItem('trenchrun3d.quality', quality);
  $('quality-btn').textContent = quality.toUpperCase();
});
// touch buttons
$('boost-btn').addEventListener('touchstart', e => { e.preventDefault(); input.touchBtn.boostDown(); }, { passive: false });
$('boost-btn').addEventListener('touchend', () => input.touchBtn.boostUp());
$('torp-btn').addEventListener('touchstart', e => { e.preventDefault(); audio.init(); input.touchBtn.torpedo(); }, { passive: false });

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(true); });
window.addEventListener('blur', () => { if (state === 'playing') togglePause(true); });

// ---------------- idle (menu) animation ----------------
let idleT = 0;
function idle(dt) {
  if (reduceMotion) dt = 0;   // hold a static frame for reduced-motion users
  idleT += dt;
  const sh = systems.ship;
  sh.position.x = Math.sin(idleT * 0.35) * 2.2;
  sh.position.y = 0.4 + Math.sin(idleT * 0.6) * 0.7;
  sh.rotation.z = -Math.cos(idleT * 0.35) * 0.18;
  sh.rotation.y = Math.sin(idleT * 0.35) * 0.1;
  for (const n of sh.userData.engineNodes) n.material.emissiveIntensity = 2.6 + Math.sin(idleT * 30) * 0.3;
  const cam = engine.camera;
  cam.position.x += (Math.sin(idleT * 0.25) * 3 - cam.position.x) * Math.min(1, 2 * dt);
  cam.position.y += (3 - cam.position.y) * Math.min(1, 2 * dt);
  cam.position.z += (9 - cam.position.z) * Math.min(1, 2 * dt);
  cam.lookAt(sh.position.x * 0.6, sh.position.y * 0.4 + 0.3, -24);
  trench.update(34 * dt);
}

// ---------------- main loop ----------------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  const { W, H } = engine.size;

  try {
    if (W > 0 && H > 0 && !engine.lost) {
      if (state === 'playing') {
        input.update();
        if (input.state.pausePressed) { togglePause(); input.resetEdges(); }
        else {
          // finale touch UI toggle
          if (systems.run.finale && input.state.isTouch && $('torp-btn').classList.contains('hidden')) $('torp-btn').classList.remove('hidden');
          systems.update(dt);
          trench.update(systems.run.speed * dt);
          hud.updateFrame(systems.run, dt);
          hud.render(systems.hudSnapshot());
          input.resetEdges();
        }
      } else if (state === 'paused') {
        // frozen; keep last HUD
      } else {
        idle(dt);
        hud.render(null);
        if (state === 'playing') {}
      }
      engine.render();
    }
  } catch (e) { console.error('TrenchRun loop error:', e); if (window.__TRERR !== undefined) window.__TRERR = String(e && e.stack || e); }

  requestAnimationFrame(frame);
}

// kick off after first layout
window.addEventListener('load', () => engine.resize());
requestAnimationFrame(frame);

// reveal title once the module is running
setTimeout(() => { if (state === 'loading') toTitle(); }, 350);

// ---------------- debug hook (?debug) ----------------
if (/[?&]debug\b/.test(location.search)) {
  window.__TRERR = null;
  window.__TR = {
    engine, systems, input, audio, hud,
    info: () => ({ state, ...snapshotRun(), err: window.__TRERR }),
    start: (d) => { if (d) difficulty = d; startRun(); },
    setState: (s) => { state = s; },
    finale: () => systems.startFinaleNow(),
    // run N playing frames deterministically without rAF
    step: (frames, dt = 0.016) => {
      const errs = [];
      for (let i = 0; i < (frames || 1); i++) {
        try {
          input.update();
          systems.update(dt);
          trench.update(systems.run.speed * dt);
          hud.updateFrame(systems.run, dt);
          hud.render(systems.hudSnapshot());
          input.resetEdges();
          engine.render();
        } catch (e) { errs.push(String(e && e.stack || e)); break; }
      }
      return errs;
    },
    render: () => engine.render(),
    snap: () => sceneCanvas.toDataURL('image/jpeg', 0.5),
  };
  function snapshotRun() {
    const r = systems.run;
    return { run: { hull: Math.round(r.hull), shields: Math.round(r.shields), score: r.score, kills: r.kills,
      distance: Math.round(r.distance), speed: Math.round(r.speed), finale: r.finale, over: r.over, locked: r.locked, lock: +r.lock.toFixed(2) },
      W: engine.size.W, H: engine.size.H, quality };
  }
}
