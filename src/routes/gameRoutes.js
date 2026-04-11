// src/routes/gameRoutes.js
// ─────────────────────────────────────────────────────────────
// All /game/* routes.
// Routes are deliberately thin — they only:
//   1. Read state from session
//   2. Call engine functions
//   3. Write state back to session
//   4. Redirect or render
// All business logic lives in the engine layer.
// ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

// Engine
const {
    createGame,
    turnsLeft,
    isOutOfTurns,
    getDiscoveredClues,
    applyAction,
    enterAccusationPhase,
    applyVerdict,
    getGameSummary,
    getActionCounts
} = require('../engine/gameEngine');

const {
    resolveAction,
    resolveDialogue,
    getActionAvailability,
    getSuspectInterrogationAvailability,
    getNoClueMessage,
    getActionLabel
} = require('../engine/actionResolver');

const { evaluateAccusation, buildLeaderboardEntry } = require('../engine/verdictEngine');

// Case generator + fallback
const { generateCase } = require('../services/caseGenerator');

// Phase guards
const {
    requireInvestigation,
    requireAccusation,
    requireEnded
} = require('../middleware/gameGuard');

// ── HELPER: safe case getter from session ─────────────────────
function getActiveCase(req) {
    return req.session.activeCase || null;
}

// ── GET /game/loading ─────────────────────────────────────────
// Shown while the AI generates a case.
// The page auto-polls /game/status until the case is ready.
router.get('/loading', (req, res) => {
    if (!req.session.generatingCase) return res.redirect('/');
    res.render('loading', {
        difficulty: req.session.pendingDifficulty || 'medium'
    });
});

// ── GET /game/status ──────────────────────────────────────────
// Polled by the loading page to check if case generation is done.
router.get('/status', (req, res) => {
    if (req.session.generationReady && req.session.gameState && req.session.activeCase) {
        return res.json({ ready: true });
    }
    if (req.session.generationError) {
        return res.json({ ready: true, error: req.session.generationError });
    }
    res.json({ ready: false });
});

// ── POST /game/start ──────────────────────────────────────────
// Kicks off AI case generation and redirects to loading screen.
router.post('/start', async (req, res) => {
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty)
        ? req.body.difficulty
        : 'medium';

    req.session.gameState = null;
    req.session.activeCase = null;
    req.session.generatingCase = true;
    req.session.pendingDifficulty = difficulty;
    req.session.generationError = null;

    // Save session before redirecting
    req.session.save(() => {
        res.redirect('/game/loading');
    });
});

// ── POST /game/generate/start ─────────────────────────────
// Loading page calls this to kick off generation.
// Responds immediately with 200, runs generation in background.
router.post('/generate/start', (req, res) => {
    console.log('🔥 /generate/start hit — difficulty:', req.session.pendingDifficulty);
    const difficulty = req.session.pendingDifficulty || 'medium';

    // Mark as generating
    req.session.generatingCase = true;
    req.session.generationReady = false;

    req.session.save(() => {
        res.sendStatus(200); // respond immediately

        // Now run generation — session is saved so writes will work
        generateCase(difficulty)
            .then(({ case: generatedCase, usedFallback }) => {
                req.session.activeCase = generatedCase;
                req.session.gameState = createGame(generatedCase);
                req.session.generatingCase = false;
                req.session.generationReady = true;
                if (usedFallback) {
                    req.session.flash = {
                        clue: null,
                        dialogue: null,
                        notice: '⚠️ AI failed — loaded a classic case instead.'
                    };
                }
                req.session.save((err) => {
                    if (err) console.error('Session save error:', err);
                    else console.log('✅ Case saved to session successfully');
                });
            })
            .catch(err => {
                console.error('Generation failed:', err);
                req.session.generationError = err.message;
                req.session.generatingCase = false;
                req.session.generationReady = false;
                req.session.save(() => { });
            });
    });
});

// ── GET /game ─────────────────────────────────────────────────
// Main game view — the investigation board.
router.get('/', (req, res) => {
    const state = req.session.gameState;
    const caseData = getActiveCase(req);

    if (!state || !caseData) return res.redirect('/');

    // If game just ended (out of turns), push into accusation phase
    if (isOutOfTurns(state) && state.phase === 'investigation') {
        req.session.gameState = enterAccusationPhase(state);
    }

    // If already ended redirect to verdict
    if (state.phase === 'ended') return res.redirect('/game/verdict');

    const updatedState = req.session.gameState;

    // Build view data — NEVER pass guiltyId or guilty:true to the view
    const safeSuspects = caseData.suspects.map(({ id, name, role, age, alibi, appearance }) => ({
        id, name, role, age, alibi, appearance
    }));

    const discoveredClues = getDiscoveredClues(caseData, updatedState);
    const actionAvailability = getActionAvailability(caseData, updatedState);
    const suspectAvailability = getSuspectInterrogationAvailability(caseData, updatedState);
    const actionCounts = getActionCounts(updatedState);

    res.render('game', {
        // Case info
        caseId: caseData.id,
        caseTitle: caseData.title,
        synopsis: caseData.synopsis,
        difficulty: caseData.difficulty,

        // Suspects (safe — no guilty field)
        suspects: safeSuspects,

        // Evidence board
        clues: discoveredClues,

        // Turn info
        turnsLeft: turnsLeft(updatedState),
        turnsTotal: updatedState.turnsTotal,
        turnsUsed: updatedState.turnsUsed,

        // Phase
        phase: updatedState.phase,

        // Action availability
        actionAvailability,
        suspectAvailability,
        actionCounts,

        // History log
        actionHistory: updatedState.actionHistory.map(entry => ({
            ...entry,
            actionLabel: getActionLabel(entry.action)
        })),

        // Flash (latest clue + dialogue from previous action)
        flash: res.locals.flash
    });
});

// ── POST /game/action ─────────────────────────────────────────
// Player performs an investigation action.
router.post('/action', requireInvestigation, (req, res) => {
    const { action, suspectId } = req.body;
    const state = req.session.gameState;
    const caseData = getActiveCase(req);

    if (!state || !caseData) return res.redirect('/');

    // Validate action type
    const validActions = ['inspect_scene', 'check_cctv', 'analyze_phone', 'interrogate'];
    if (!validActions.includes(action)) {
        return res.redirect('/game');
    }

    // Interrogate requires a valid suspectId
    if (action === 'interrogate') {
        const validSuspect = caseData.suspects.some(s => s.id === suspectId);
        if (!validSuspect) return res.redirect('/game');
    }

    // Resolve what clue (if any) this action unlocks
    const resolvedClue = resolveAction(
        caseData,
        state,
        action,
        action === 'interrogate' ? suspectId : null
    );

    // Resolve suspect dialogue for interrogations
    let dialogue = null;
    if (action === 'interrogate' && suspectId) {
        const suspect = caseData.suspects.find(s => s.id === suspectId);
        dialogue = {
            suspectName: suspect?.name || '',
            text: resolveDialogue(caseData, state, suspectId)
        };
    }

    // Apply action to state
    req.session.gameState = applyAction(state, action, suspectId || null, resolvedClue);

    // Set flash for the next render
    req.session.flash = {
        clue: resolvedClue || null,
        dialogue: dialogue || null,
        notice: resolvedClue ? null : getNoClueMessage(action)
    };

    res.redirect('/game');
});

// ── POST /game/accuse ─────────────────────────────────────────
// Player makes their final accusation.
router.post('/accuse', requireAccusation, (req, res) => {
    const { suspectId } = req.body;
    const state = req.session.gameState;
    const caseData = getActiveCase(req);

    if (!state || !caseData) return res.redirect('/');

    // Validate accused suspect exists
    const validSuspect = caseData.suspects.some(s => s.id === suspectId);
    if (!validSuspect) return res.redirect('/game');

    // Evaluate accusation
    const verdict = evaluateAccusation(caseData, state, suspectId);

    // Apply verdict to state
    req.session.gameState = applyVerdict(state, suspectId, verdict);

    // Append to game history (optional leaderboard tracking)
    if (!req.session.gameHistory) req.session.gameHistory = [];
    req.session.gameHistory.push(buildLeaderboardEntry(verdict, caseData.title));

    res.redirect('/game/verdict');
});

// ── GET /game/verdict ─────────────────────────────────────────
// Shows the final verdict and reasoning.
router.get('/verdict', requireEnded, (req, res) => {
    const state = req.session.gameState;
    const caseData = getActiveCase(req);

    if (!state || !caseData) return res.redirect('/');

    res.render('verdict', {
        verdict: state.verdict,
        caseTitle: caseData.title,
        difficulty: caseData.difficulty,
        suspects: caseData.suspects.map(({ id, name, role }) => ({ id, name, role }))
    });
});

// ── POST /game/restart ────────────────────────────────────────
// Clears the current game and sends player back to home.
router.post('/restart', (req, res) => {
    req.session.gameState = null;
    req.session.activeCase = null;
    res.redirect('/');
});

// ── GET /game/debug ───────────────────────────────────────────
// Dev-only route — shows full game state for debugging.
// Disabled in production.
router.get('/debug', (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: 'Debug route disabled in production' });
    }

    const state = req.session.gameState;
    const caseData = getActiveCase(req);

    res.json({
        summary: state ? getGameSummary(state) : null,
        fullState: state,
        caseId: caseData?.id || null,
        caseTitle: caseData?.title || null
        // Note: activeCase is NOT fully dumped here to avoid exposing guiltyId in browser
    });
});

module.exports = router;