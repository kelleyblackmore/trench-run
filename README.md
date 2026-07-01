# TRENCH RUN — Death Star Assault

A real-time **3D** Star Wars–inspired trench-run shooter, playable in the browser.
Pilot an X-wing in third-person chase view down the Death Star trench: dogfight
TIE fighters, dodge turbolaser towers, then lock a proton torpedo onto the
exhaust port.

Built with **Three.js** (WebGL) — cinematic bloom + FXAA post-processing, a
procedurally-modelled X-wing and TIEs, a recycling greebled trench, synthesized
audio, and a targeting-computer HUD. **No build step, no external requests:**
Three.js is vendored locally, so the whole thing is static and offline-capable.

**▶ Play:** https://kelleyblackmore.github.io/trench-run/

## Controls

| | |
|---|---|
| **Steer / bank** | `W A S D` · arrow keys · mouse · gamepad left-stick · touch stick |
| **Fire lasers** | `Space` / `L` / left-click (auto-fire on touch) |
| **Boost** | `Shift` (or the BOOST button on touch) |
| **Proton torpedo** (finale) | `F` / right-click / gamepad / the TORPEDO button |
| **Pause** | `P` / `Esc` |

Keep an enemy centred to build a **target lock** — the lead pip shows where to
shoot moving TIEs. At the exhaust port, hold your aim until **TORPEDO LOCK**,
then fire.

Three difficulty tiers (Cadet / Pilot / Ace) and a graphics-quality toggle
(High / Medium / Low — lower disables bloom for weaker GPUs). Best score is
saved locally.

## Run locally

Static site — serve the folder over HTTP (ES modules need `http://`, not `file://`):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Project layout

```
index.html            import map + HUD markup + menus
styles.css            HUD / menu / touch styling
vendor/three/         Three.js r160 + postprocessing addons (vendored)
src/
  main.js             bootstrap, state machine, render loop
  game/engine.js      renderer, camera, bloom/FXAA, quality tiers
  game/models.js      procedural X-wing / TIE / tower / port
  game/trench.js      recycling greebled trench segments
  game/systems.js     flight, enemy AI, projectiles, particles, finale
  game/input.js       keyboard / mouse / touch-stick / gamepad
  game/audio.js       synthesized SFX + engine drone
  game/hud.js         2D targeting-computer overlay + gauges
  game/starfield.js   backdrop stars
```

Append `?debug` to the URL to expose a `window.__TR` harness (step the loop,
inspect state, capture frames) used for headless verification.

## Deploy

A GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes to Pages on
every push to `main`. Enable **Settings → Pages → Source: GitHub Actions**.

---

*Not affiliated with or endorsed by Lucasfilm/Disney. A fan-made homage for personal play.*
