// hud.js — 2D targeting-computer overlay + HTML gauge updates.
export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, DPR = 1;

  const el = {
    hull: document.getElementById('hull-fill'),
    shield: document.getElementById('shield-fill'),
    throttle: document.getElementById('throttle-fill'),
    energy: document.getElementById('energy-fill'),
    dist: document.getElementById('dist-fill'),
    score: document.getElementById('score'),
    kills: document.getElementById('kills'),
    lock: document.getElementById('lock-status'),
    banner: document.getElementById('banner'),
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function bracket(x, y, s, color, lw) {
    const h = s / 2, c = s * 0.32;
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * h, y + sy * h - sy * c);
      ctx.lineTo(x + sx * h, y + sy * h);
      ctx.lineTo(x + sx * h - sx * c, y + sy * h);
      ctx.stroke();
    }
  }

  function render(s) {
    ctx.clearRect(0, 0, W, H);
    if (!s) return;

    // enemy target boxes
    for (const t of s.targets) {
      if (t.locked) {
        bracket(t.x, t.y, t.size, 'rgba(255,60,48,0.95)', 2.2);
        // rotating lock ticks
        ctx.strokeStyle = 'rgba(255,90,60,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.size * 0.62, 0, Math.PI * 2); ctx.stroke();
      } else {
        bracket(t.x, t.y, t.size, 'rgba(120,200,255,0.5)', 1.4);
      }
    }

    // lead pip for locked target
    if (s.lead) {
      ctx.strokeStyle = 'rgba(255,220,80,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.lead.x, s.lead.y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.lead.x - 12, s.lead.y); ctx.lineTo(s.lead.x - 4, s.lead.y);
      ctx.moveTo(s.lead.x + 4, s.lead.y); ctx.lineTo(s.lead.x + 12, s.lead.y); ctx.stroke();
    }

    // central reticle (aim convergence)
    if (s.reticle && !s.reticle.behind) {
      const r = s.reticle, anyLock = s.targets.some(t => t.locked);
      const col = anyLock ? '#ff5a3c' : '#ffe81f';
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r.x - 24, r.y); ctx.lineTo(r.x - 9, r.y);
      ctx.moveTo(r.x + 9, r.y); ctx.lineTo(r.x + 24, r.y);
      ctx.moveTo(r.x, r.y - 24); ctx.lineTo(r.x, r.y - 9);
      ctx.moveTo(r.x, r.y + 9); ctx.lineTo(r.x, r.y + 24);
      ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(r.x - 1.5, r.y - 1.5, 3, 3);
    }

    // exhaust-port lock reticle
    if (s.port) {
      const p = s.port, R = Math.min(p.size, 180);
      ctx.strokeStyle = p.locked ? '#ff3b30' : '#ffd34d';
      ctx.lineWidth = 2.5;
      bracket(p.x, p.y, R * 1.6, ctx.strokeStyle, 2.5);
      // lock progress arc
      ctx.strokeStyle = p.locked ? '#ff3b30' : 'rgba(255,211,77,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * 0.9, -Math.PI / 2, -Math.PI / 2 + p.lock * Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,211,77,0.25)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.9, 0, Math.PI * 2); ctx.stroke();
    }

    // damage vignette
    if (s.hurt > 0) {
      const a = Math.min(0.5, s.hurt);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,20,20,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // boost speed streaks
    if (s.boosting) {
      ctx.strokeStyle = 'rgba(160,210,255,0.35)'; ctx.lineWidth = 2;
      const cx = W / 2, cy = H * 0.5;
      for (let i = 0; i < 14; i++) {
        const ang = i * 0.7;
        const r0 = Math.min(W, H) * 0.35, r1 = r0 + 60;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
    }
  }

  let bannerT = 0;
  function banner(text, warn) {
    el.banner.textContent = text;
    el.banner.classList.toggle('warn', !!warn);
    el.banner.classList.add('show');
    bannerT = 2.2;
  }
  function updateFrame(run, dt) {
    el.hull.style.transform = `scaleX(${Math.max(0, run.hull) / 100})`;
    el.shield.style.transform = `scaleX(${Math.max(0, run.shields) / 100})`;
    el.score.textContent = run.score;
    el.kills.textContent = run.kills;
    const thr = Math.min(1, (run.speed - 30) / 70);
    el.throttle.style.transform = `scaleX(${Math.max(0.05, thr)})`;
    if (el.energy) el.energy.style.transform = `scaleX(${Math.max(0, run.energy) / 100})`;
    el.dist.style.transform = `scaleX(${Math.min(1, run.distance / run.diff.target)})`;
    // lock status text
    if (run.finale) {
      el.lock.classList.remove('hidden');
      el.lock.textContent = run.locked ? 'TORPEDO LOCK — FIRE' : 'ACQUIRING LOCK…';
      el.lock.classList.toggle('locked', run.locked);
    } else el.lock.classList.add('hidden');
    // banner fade
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
  }

  return { render, updateFrame, banner, resize };
}
