/**
 * EmotionDex — Express Server
 *
 * Serves static frontend files AND the REST API.
 * Run: node server.js  (or: npm run dev)
 * Open: http://localhost:3000
 */

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const apiRoutes  = require('./routes/api');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & parsing ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
    }
  }
}));

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ──────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      60,         // 60 requests per minute
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests — please slow down.' }
});

app.use('/api', apiLimiter);

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Pages removed (Dashboard + Analytics) ──────────────────────────────────
// Keep old bookmarks working by redirecting to the Scanner (main demo).
app.get(['/dashboard', '/dashboard.html', '/analytics', '/analytics.html'], (req, res) =>
  res.redirect(302, '/scanner')
);

// ── Serve static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// Explicit page routes (support direct URL navigation)
const pages = ['scanner', 'pokedex', 'ai-replies', 'about'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', `${page}.html`));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({
    error:   err.message || 'Internal server error',
    status
  });
});

// ── 404 for unknown API routes ─────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  ⚡  EmotionDex Server Started           ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  🌐  http://localhost:${PORT}               ║`);
  console.log(`║  📊  API:       http://localhost:${PORT}/api  ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});

module.exports = app;
