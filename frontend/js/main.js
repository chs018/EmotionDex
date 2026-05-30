// ═══════════════════════════════════════════════
//  EmotionDex — Shared JS
//  Backend API + GSAP Animations + NLP Engine
// ═══════════════════════════════════════════════

// ── API base URL (auto-detects server vs Live Server vs file://) ───────────
const DEV_API_BASE = 'http://localhost:3000/api';
let _apiBasePromise = null;

function fetchWithTimeout(url, options = {}, timeoutMs = 900) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(t));
}

async function resolveApiBase() {
  if (_apiBasePromise) return _apiBasePromise;

  _apiBasePromise = (async () => {
    // If opened directly from disk, we must target the dev server explicitly.
    if (window.location.protocol === 'file:') return DEV_API_BASE;

    // Try same-origin first (normal case when served by Express).
    try {
      const r = await fetchWithTimeout('/api/health', { cache: 'no-store' }, 700);
      if (r.ok) return '/api';
    } catch {}

    // VS Code Live Server / other port: fall back to the Express dev server.
    try {
      const r = await fetchWithTimeout(`${DEV_API_BASE}/health`, { cache: 'no-store', mode: 'cors' }, 700);
      if (r.ok) return DEV_API_BASE;
    } catch {}

    // Default to same-origin (keeps production behavior).
    return '/api';
  })();

  return _apiBasePromise;
}

// ── Backend API client ─────────────────────────────────────────────────────
const API = {
  async scan(text) {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/scan`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text })
    });
    if (!res.ok) throw new Error(`Scan API error ${res.status}`);
    return res.json();
  },

  async reply(text, mode = 'calm') {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/reply`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, mode })
    });
    if (!res.ok) throw new Error(`Reply API error ${res.status}`);
    return res.json();
  },

  async escalate(emotionKey, message) {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/escalate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ emotionKey, message })
    });
    if (!res.ok) throw new Error(`Escalate API error ${res.status}`);
    return res.json();
  },

  async health() {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/health`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Health API error ${res.status}`);
    return res.json();
  },

  async transformerStatus() {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/transformer-status`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Transformer status error ${res.status}`);
    return res.json();
  },

  async classify(text) {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error(`Classify API error ${res.status}`);
    return res.json();
  }
};

// ── Particles (Canvas) ────────────────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  // Force the particles canvas to stay out of normal document flow.
  // (Some pages/bundlers can override the CSS and accidentally push content down.)
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.right = '0';
  canvas.style.bottom = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';

  const ctx = canvas.getContext('2d', { alpha: true });

  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isDashboard = page.includes('dashboard');

  // Allow per-page override via: <html data-particles="off|low|high">
  const mode = (document.documentElement.dataset.particles || (isDashboard ? 'low' : 'high')).toLowerCase();
  if (mode === 'off') return;

  const colors = ['#FFCB05', '#2A75BB', '#FF66C4', '#9B5DE5', '#6BCB77'];

  const cfg = {
    fps: mode === 'low' ? 24 : 40,
    count: mode === 'low' ? 26 : 60,
    maxDpr: mode === 'low' ? 1.0 : 1.25,
  };

  let particles = [];
  let rafId = null;
  let lastTs = 0;
  let resizeTimer = null;

  function setCanvasSize() {
    const dpr = Math.min(cfg.maxDpr, window.devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    // Draw in CSS pixel coordinates (keeps math cheap and consistent)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  function makeParticles() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = [];

    // Scale particle count down on small screens to reduce CPU
    const area = Math.max(1, w * h);
    const capByArea = Math.max(12, Math.floor(area / 45000));
    const n = Math.min(cfg.count, capByArea);

    for (let i = 0; i < n; i++) {
      p.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        color: colors[(Math.random() * colors.length) | 0],
        alpha: Math.random() * 0.45 + 0.15
      });
    }
    return p;
  }

  function drawFrame() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    for (const pt of particles) {
      ctx.globalAlpha = pt.alpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();

      pt.x += pt.vx;
      pt.y += pt.vy;
      if (pt.x < 0) pt.x = w;
      else if (pt.x > w) pt.x = 0;
      if (pt.y < 0) pt.y = h;
      else if (pt.y > h) pt.y = 0;
    }

    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (document.hidden) return;

    const minDt = 1000 / cfg.fps;
    if (ts - lastTs < minDt) return;
    lastTs = ts;

    drawFrame();
  }

  function start() {
    setCanvasSize();
    particles = makeParticles();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Kick off
  start();

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(start, 150);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
}

// ── GSAP Animations ───────────────────────────────────────────────────────
function initGSAP() {
  if (typeof gsap === 'undefined') return;

  // Navbar entrance
  gsap.from('.navbar', {
    y: -80, opacity: 0, duration: 0.8, ease: 'power3.out'
  });

  // Hero elements stagger
  gsap.from('.hero h1, .hero-badge, .hero-tagline, .hero-buttons', {
    y: 40, opacity: 0, duration: 0.9, stagger: 0.15, ease: 'power3.out', delay: 0.3
  });

  // Pokédex demo float-in
  gsap.from('.pokedex-demo', {
    scale: 0.8, opacity: 0, duration: 1, ease: 'back.out(1.7)', delay: 0.8
  });

  // Floating emotion icons
  document.querySelectorAll('.float-icon').forEach((el, i) => {
    gsap.to(el, {
      y: '+=18', duration: 2.5 + i * 0.3,
      ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.4
    });
  });

  // Section title reveal on scroll (ScrollTrigger fallback via IntersectionObserver)
  const canObserve = (typeof IntersectionObserver !== 'undefined');
  document.querySelectorAll('.section-title, .animate-on-scroll').forEach(el => {
    if (!canObserve) {
      // Old/embedded browsers: avoid crashing the page
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(el, { opacity: 0, y: 30 });
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          gsap.to(e.target, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    obs.observe(el);
  });

  // Feature cards hover lift
  document.querySelectorAll('.feature-card, .glass-card').forEach(card => {
    card.addEventListener('mouseenter', () =>
      gsap.to(card, { y: -8, scale: 1.02, duration: 0.3, ease: 'power2.out' })
    );
    card.addEventListener('mouseleave', () =>
      gsap.to(card, { y: 0, scale: 1, duration: 0.3, ease: 'power2.out' })
    );
  });

  // Emotion type cards stagger (only if ScrollTrigger is available)
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    gsap.from('.emotion-type-card', {
      y: 50, opacity: 0, duration: 0.6, stagger: 0.1,
      ease: 'power3.out', delay: 0.5,
      scrollTrigger: { trigger: '.emotion-map', start: 'top 80%' }
    });
  }

  // KPI cards stagger (dashboard)
  gsap.from('.kpi-card', {
    scale: 0.85, opacity: 0, duration: 0.5, stagger: 0.1,
    ease: 'back.out(1.4)', delay: 0.4
  });

  // Scan card pop
  gsap.from('.scan-card', {
    x: 40, opacity: 0, duration: 0.6, stagger: 0.15,
    ease: 'power3.out', delay: 0.5
  });

  // Badge cards
  gsap.from('.badge-card', {
    scale: 0.7, opacity: 0, duration: 0.5, stagger: 0.06,
    ease: 'back.out(1.7)', delay: 0.4
  });
}

// ── GSAP Scan Result Animation ────────────────────────────────────────────
function animateScanResult(emotionColor) {
  if (typeof gsap === 'undefined') return;
  gsap.from('#result-state', {
    scale: 0.8, opacity: 0, duration: 0.6, ease: 'back.out(1.7)'
  });
  gsap.to('.emotion-big-icon', {
    scale: 1.3, duration: 0.3, ease: 'power2.out',
    yoyo: true, repeat: 1
  });
}

// ── GSAP Flip Card ────────────────────────────────────────────────────────
function animateFlipCard(cardEl) {
  if (typeof gsap === 'undefined') return;
  gsap.to(cardEl.querySelector('.flip-inner'), {
    rotateY: cardEl.classList.contains('flipped') ? 180 : 0,
    duration: 0.6, ease: 'power2.inOut'
  });
}

// ── Fallback emotion engine (used if backend unreachable) ─────────────────
const EMOTIONS = {
  angry: {
    label:'Angry', type:'Fire', typeClass:'type-fire', icon:'🔥', color:'#FF4D4D',
    priority:'CRITICAL', priorityScore:95, urgency:'Immediate',
    action:'Escalate to human agent immediately',
    keywords:['angry','furious','unacceptable','terrible','hate','worst','useless','scam','fraud','ridiculous','outrageous']
  },
  sad: {
    label:'Sad', type:'Water', typeClass:'type-water', icon:'💧', color:'#4D96FF',
    priority:'HIGH', priorityScore:75, urgency:'Within 15 mins',
    action:'Provide empathetic support',
    keywords:['sad','disappointed','upset','let down','unhappy','heartbroken','broken','regret']
  },
  happy: {
    label:'Happy', type:'Electric', typeClass:'type-electric', icon:'⚡', color:'#FFD93D',
    priority:'POSITIVE', priorityScore:20, urgency:'Standard',
    action:'Maintain positive engagement',
    keywords:['happy','great','excellent','amazing','wonderful','fantastic','love','awesome','perfect','brilliant','thank']
  },
  calm: {
    label:'Calm', type:'Grass', typeClass:'type-grass', icon:'🌿', color:'#6BCB77',
    priority:'NORMAL', priorityScore:40, urgency:'Within 1 hour',
    action:'Standard support resolution',
    keywords:['okay','ok','alright','fine','question','help','how','when','where']
  },
  anxious: {
    label:'Anxious', type:'Psychic', typeClass:'type-psychic', icon:'🔮', color:'#9B5DE5',
    priority:'HIGH', priorityScore:80, urgency:'Within 10 mins',
    action:'Immediate reassurance and clear timeline',
    keywords:['worried','anxious','scared','fear','nervous','concerned','urgent','emergency','asap','immediately']
  },
  love: {
    label:'Love', type:'Fairy', typeClass:'type-fairy', icon:'✨', color:'#FF66C4',
    priority:'POSITIVE', priorityScore:10, urgency:'Scheduled',
    action:'Leverage loyalty, request referral',
    keywords:['love','adore','obsessed','loyal','forever','recommend','fan','dedicated']
  }
};

function detectEmotion(text) {
  const lower = text.toLowerCase();
  const scores = {};
  Object.entries(EMOTIONS).forEach(([key, em]) => {
    scores[key] = em.keywords.filter(kw => lower.includes(kw)).length;
  });
  if (/\d+\s*(day|hour|week)s?\s*(wait|waiting|ago)/.test(lower)) scores.angry = (scores.angry||0)+3;
  if (/nobody|no one|no response|ignored|ghost/.test(lower)) scores.angry = (scores.angry||0)+2;
  const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  if (sorted[0][1] === 0) return EMOTIONS.calm;
  return EMOTIONS[sorted[0][0]];
}

function getConfidence(text, emotion) {
  const lower = text.toLowerCase();
  const hits = emotion.keywords.filter(kw => lower.includes(kw)).length;
  return Math.min(95, 50 + hits * 15 + Math.floor(Math.random()*5));
}

// ── Team Rocket alert ─────────────────────────────────────────────────────
function showRocketAlert(message) {
  let alert = document.getElementById('rocket-alert');
  if (!alert) {
    alert = document.createElement('div');
    alert.id = 'rocket-alert';
    alert.className = 'rocket-alert';
    document.body.appendChild(alert);
  }
  alert.innerHTML = `
    <div style="font-family:'Orbitron',monospace;font-size:0.75rem;margin-bottom:0.25rem;">⚠ TEAM ROCKET ALERT</div>
    <div style="font-size:0.85rem;">${message}</div>`;
  alert.classList.add('show');

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(alert, { x: 300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' });
    setTimeout(() => {
      gsap.to(alert, { x: 300, opacity: 0, duration: 0.4, ease: 'power2.in',
        onComplete: () => alert.classList.remove('show') });
    }, 4000);
  } else {
    setTimeout(() => alert.classList.remove('show'), 4000);
  }
}

// ── Animated counter ──────────────────────────────────────────────────────
function animateCounter(el, target, duration = 1500) {
  if (typeof gsap !== 'undefined') {
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target, duration: duration / 1000, ease: 'power1.out',
      onUpdate: () => { el.textContent = Math.floor(obj.val).toLocaleString(); }
    });
  } else {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { start = target; clearInterval(timer); }
      el.textContent = Math.floor(start).toLocaleString();
    }, 16);
  }
}

// ── HP bar fill ───────────────────────────────────────────────────────────
function fillHPBar(barEl, percent, color) {
  barEl.style.background = color;
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(barEl, { width: '0%' }, {
      width: percent + '%', duration: 1.2, ease: 'power2.out', delay: 0.1
    });
  } else {
    barEl.style.width = '0%';
    setTimeout(() => { barEl.style.width = percent + '%'; }, 100);
  }
}

// ── Scroll animations fallback ─────────────────────────────────────────────
function initScrollAnimations() {
  if (typeof gsap !== 'undefined') return; // GSAP handles this
  if (typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// ── Backend status indicator ──────────────────────────────────────────────
async function checkBackendStatus() {
  const indicator = document.getElementById('backend-status');
  if (!indicator) return;

  try {
    await API.health();
    indicator.innerHTML = `<span style="color:var(--calm);">● API Online</span>`;
  } catch {
    indicator.innerHTML = `<span style="color:rgba(248,249,250,0.4);">● File Mode</span>
      <span style="font-size:0.7rem;color:rgba(248,249,250,0.3);margin-left:0.5rem;">(run server.js for backend)</span>`;
  }
}

// ── Shared nav renderer ───────────────────────────────────────────────────
function renderNav() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const links = [
    { href: '/',            label: 'Home' },
    { href: '/scanner',     label: 'Emotion Scanner' },
    { href: '/pokedex',     label: 'Emotion Pokédex' },
    { href: '/ai-replies',  label: 'AI Replies' },
    { href: '/about',       label: 'About' },
  ];
  const navEl = document.getElementById('main-nav');
  if (!navEl) return;
  navEl.innerHTML = `
    <a href="/" class="nav-logo">
      <div class="pokeball-icon"></div>
      EmotionDex
    </a>
    <ul class="nav-links">
      ${links.map(l => `<li><a href="${l.href}" ${l.href===path?'class="active"':''}>${l.label}</a></li>`).join('')}
    </ul>
    <div style="display:flex;align-items:center;gap:0.75rem;">
      <div id="backend-status" style="font-family:'Rajdhani',sans-serif;font-size:0.78rem;"></div>
      <button class="btn-primary" onclick="window.location='/scanner'"
        style="padding:0.5rem 1.2rem;font-size:0.75rem;">⚡ Scan Emotion</button>
    </div>`;

  // Mark active link
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  checkBackendStatus();
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initScrollAnimations();
  // GSAP init runs after GSAP script loads (each page calls initGSAP())
});
