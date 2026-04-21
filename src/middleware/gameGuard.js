// src/middleware/gameGuard.js
// ─────────────────────────────────────────────────────────────
// Protects all /game/* routes.
// Redirects to home if there is no active game in the session.
// Also handles phase enforcement — prevents players from accessing
// routes that don't match the current game phase.
// ─────────────────────────────────────────────────────────────

/**
 * Base guard — ensures an active game exists in the session.
 * Attach to all /game/* routes in app.js.
 */
function gameGuard(req, res, next) {
  // These routes don't need an active game
  const openPaths = ['/loading', '/status', '/start', '/generate/start', '/ai-solve'];
  if (openPaths.includes(req.path)) return next();

  if (!req.session.gameState || !req.session.activeCase) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect('/');
  }
  next();
}

/**
 * Phase guard — ensures the game is in the 'investigation' phase.
 * Attach to action routes that shouldn't fire during accusation or ended phases.
 */
function requireInvestigation(req, res, next) {
  const state = req.session.gameState;

  if (!state || state.phase !== 'investigation') {
    return res.redirect('/game');
  }
  next();
}

/**
 * Phase guard — ensures the game is in the 'accusation' phase.
 * Attach to the /game/accuse POST route.
 */
function requireAccusation(req, res, next) {
  const state = req.session.gameState;

  if (!state || state.phase !== 'accusation') {
    return res.redirect('/game');
  }
  next();
}

/**
 * Phase guard — ensures the game has ended.
 * Attach to the /game/verdict GET route.
 */
function requireEnded(req, res, next) {
  const state = req.session.gameState;

  if (!state || state.phase !== 'ended') {
    return res.redirect('/game');
  }
  next();
}

module.exports = {
  gameGuard,
  requireInvestigation,
  requireAccusation,
  requireEnded
};