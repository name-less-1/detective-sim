// src/routes/authRoutes.js
// ─────────────────────────────────────────────────────────────
// Handles optional player identity.
// No real authentication — just lets the player set a name
// that persists in session for leaderboard/history display.
// Easy to upgrade to real auth later (passport.js, etc.)
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();

// ── POST /auth/setname ────────────────────────────────────────
// Sets the player's display name in session.
router.post('/setname', (req, res) => {
  const name = (req.body.playerName || '').trim().slice(0, 30); // max 30 chars

  if (name.length < 1) {
    req.session.flash = {
      clue:     null,
      dialogue: null,
      notice:   'Please enter a valid name.'
    };
    return res.redirect('/');
  }

  req.session.playerName = name;

  // Redirect to where they were going, or home
  const redirectTo = req.session.redirectTo || '/';
  delete req.session.redirectTo;

  res.redirect(redirectTo);
});

// ── POST /auth/clearname ──────────────────────────────────────
// Clears the player name from session.
router.post('/clearname', (req, res) => {
  delete req.session.playerName;
  res.redirect('/');
});

// ── GET /auth/history ─────────────────────────────────────────
// Shows the player's past game results from session history.
router.get('/history', (req, res) => {
  const history = req.session.gameHistory || [];

  res.render('history', {
    playerName: req.session.playerName || 'Detective',
    history:    history.slice().reverse() // most recent first
  });
});

// ── POST /auth/clearhistory ───────────────────────────────────
// Wipes the player's game history from session.
router.post('/clearhistory', (req, res) => {
  req.session.gameHistory = [];
  res.redirect('/auth/history');
});

module.exports = router;