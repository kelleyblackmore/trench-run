# TRENCH RUN — Death Star Assault

A Star Wars–inspired, browser-based arcade shooter. Pilot your X-wing down the
Death Star trench: dodge the turbolaser towers, blast TIE fighters, survive the
gauntlet, then put a proton torpedo straight into the exhaust port.

**Pure client-side** — a single static page (HTML + CSS + vanilla JS + canvas).
No build step, no dependencies, no assets. Sound is synthesized live with the
Web Audio API. Runs anywhere, works offline, and plays on desktop **and** phones.

## Play

- **Desktop:** `← → ↑ ↓` or `WASD` to fly · `SPACE` (or hold mouse) to fire · `P` to pause.
- **Touch:** drag anywhere to fly · auto-fire is on (or mash the **FIRE** button).
- Reach the end of the trench, then line your reticle up on the glowing exhaust
  port and fire while it's in range. **Stay on target.**

Mute with the ♪ button (top-right). Your best score is saved locally.

## Run locally

It's a static site — just open `index.html`, or serve the folder:

```bash
python -m http.server 8000   # then visit http://localhost:8000
```

## Deploy (GitHub Pages)

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that
publishes the site on every push to `main`.

1. Push to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. The site goes live at `https://<user>.github.io/<repo>/`.

(`.nojekyll` is included so Pages serves the files as-is.)

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup, HUD, and menu screens |
| `style.css`  | Theme, HUD, responsive + touch layout |
| `game.js`    | Engine: render, physics, audio, game loop |

---

*Not affiliated with or endorsed by Lucasfilm/Disney. A fan-made homage for personal play.*
