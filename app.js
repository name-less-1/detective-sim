const express = require('express');
const session = require('express-session');
const path = require('path');

const gameRoutes = require('./src/routes/gameRoutes');
const authRoutes = require('./src/routes/authRoutes');
const { gameGuard } = require('./src/middleware/gameGuard');

const app = express();

// ── VIEW ENGINE ────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── STATIC FILES ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── BODY PARSING ───────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Skip ngrok browser warning
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// ── SESSION ────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60,  // 1 hour
    httpOnly: true
  }
}));

// ── FLASH MIDDLEWARE ───────────────────────────────────────────
// Moves one-time flash data from session into res.locals
// so EJS templates can access it, then clears it
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// ── GLOBAL TEMPLATE VARIABLES ─────────────────────────────────
// Makes these available in every EJS template automatically
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.hasActiveGame = !!req.session.gameState;
  next();
});

// ── ROUTES ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('home');
});

app.use('/auth', authRoutes);
app.use('/game', gameGuard, gameRoutes);

// ── 404 HANDLER ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404');
});

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).render('error', {
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong.'
  });
});

module.exports = app;