// src/engine/gameEngine.js
// ─────────────────────────────────────────────────────────────
// Pure functions that manage game state.
// No Express, no session, no side effects.
// Every function takes state in and returns new state out.
// The route layer is responsible for reading/writing session.
// ─────────────────────────────────────────────────────────────

// ── GAME CREATION ─────────────────────────────────────────────
/**
 * Creates a brand new game state from a case object.
 * @param {Object} caseDefinition - A validated case object
 * @returns {Object} Fresh game state
 */
function createGame(caseDefinition) {
  if (!caseDefinition || !caseDefinition.id) {
    throw new Error('createGame requires a valid case definition');
  }

  return {
    caseId:                caseDefinition.id,
    phase:                 'investigation',  // 'investigation' | 'accusation' | 'ended'
    turnsTotal:            caseDefinition.turnsAllowed,
    turnsUsed:             0,
    discoveredClueIds:     [],
    actionHistory:         [],
    interrogatedSuspects:  [],
    accusation:            null,
    verdict:               null,
    startedAt:             new Date().toISOString()
  };
}

// ── TURN HELPERS ──────────────────────────────────────────────
/**
 * Returns how many turns the player has left.
 */
function turnsLeft(state) {
  return state.turnsTotal - state.turnsUsed;
}

/**
 * Returns true if the player has no turns remaining.
 */
function isOutOfTurns(state) {
  return turnsLeft(state) <= 0;
}

/**
 * Returns true if the game is still in the investigation phase.
 */
function isInvestigating(state) {
  return state.phase === 'investigation';
}

/**
 * Returns true if it's time for the player to make an accusation.
 */
function isAccusationPhase(state) {
  return state.phase === 'accusation';
}

/**
 * Returns true if the game has ended (verdict given).
 */
function isEnded(state) {
  return state.phase === 'ended';
}

// ── CLUE HELPERS ──────────────────────────────────────────────
/**
 * Returns true if the player has already discovered this clue.
 */
function hasClue(state, clueId) {
  return state.discoveredClueIds.includes(clueId);
}

/**
 * Returns true if a clue's prerequisite has been met.
 * A null prerequisite means it's always available.
 */
function isPrerequisiteMet(state, clue) {
  if (clue.prerequisite === null || clue.prerequisite === undefined) {
    return true;
  }
  return hasClue(state, clue.prerequisite);
}

/**
 * Returns true if a clue can currently be unlocked:
 * - Not already discovered
 * - Prerequisite clue has been found (if any)
 */
function isClueUnlockable(state, clue) {
  if (hasClue(state, clue.id)) return false;
  if (!isPrerequisiteMet(state, clue)) return false;
  return true;
}

/**
 * Returns all clues that are currently unlockable for a given action.
 * @param {Object} caseDefinition
 * @param {Object} state
 * @param {string} action
 * @param {string|null} suspectId - Required for interrogate actions
 */
function getUnlockableClues(caseDefinition, state, action, suspectId = null) {
  return caseDefinition.clues.filter(clue => {
    if (clue.action !== action) return false;
    if (action === 'interrogate' && clue.suspectId !== suspectId) return false;
    return isClueUnlockable(state, clue);
  });
}

/**
 * Returns full clue objects for all discovered clue IDs.
 * Safe to pass to views — contains no sensitive data.
 */
function getDiscoveredClues(caseDefinition, state) {
  return state.discoveredClueIds
    .map(id => caseDefinition.clues.find(c => c.id === id))
    .filter(Boolean); // remove any undefined (safety net)
}

// ── STATE TRANSITIONS ─────────────────────────────────────────
/**
 * Applies an action to the current state and returns a NEW state object.
 * Does not mutate the original state.
 *
 * @param {Object} state         - Current game state
 * @param {string} action        - Action type performed
 * @param {string|null} target   - suspectId for interrogations, null otherwise
 * @param {Object|null} resolvedClue - The clue unlocked by this action (or null if nothing new)
 * @returns {Object} New game state
 */
function applyAction(state, action, target, resolvedClue) {
  // Shallow copy — never mutate the original session state directly
  const newState = { ...state };

  // Increment turn counter
  newState.turnsUsed = state.turnsUsed + 1;

  // Append to action history
  newState.actionHistory = [
    ...state.actionHistory,
    {
      turn:    newState.turnsUsed,
      action,
      target:  target || null,
      clueId:  resolvedClue ? resolvedClue.id : null,
      foundAt: new Date().toISOString()
    }
  ];

  // Add the newly discovered clue (if any)
  if (resolvedClue) {
    newState.discoveredClueIds = [...state.discoveredClueIds, resolvedClue.id];
  }

  // Track interrogated suspects
  if (action === 'interrogate' && target) {
    newState.interrogatedSuspects = [
      ...new Set([...state.interrogatedSuspects, target])
    ];
  }

  // Transition to accusation phase when turns run out
  if (newState.turnsUsed >= newState.turnsTotal) {
    newState.phase = 'accusation';
  }

  return newState;
}

/**
 * Transitions the game to the accusation phase manually.
 * Called when the player chooses to accuse before turns run out.
 * Returns new state.
 */
function enterAccusationPhase(state) {
  return { ...state, phase: 'accusation' };
}

/**
 * Applies the final verdict to the state and marks the game as ended.
 * Returns new state.
 */
function applyVerdict(state, accusedSuspectId, verdict) {
  return {
    ...state,
    phase:      'ended',
    accusation: accusedSuspectId,
    verdict,
    endedAt:    new Date().toISOString()
  };
}

// ── SUMMARY HELPERS ───────────────────────────────────────────
/**
 * Returns a summary of the current game state suitable for logging/debugging.
 * Never includes guiltyId.
 */
function getGameSummary(state) {
  return {
    caseId:           state.caseId,
    phase:            state.phase,
    turnsUsed:        state.turnsUsed,
    turnsTotal:       state.turnsTotal,
    turnsLeft:        turnsLeft(state),
    cluesFound:       state.discoveredClueIds.length,
    suspectQuestioned: state.interrogatedSuspects.length,
    startedAt:        state.startedAt
  };
}

/**
 * Returns which actions the player has used this game and how many times.
 * Useful for showing action history in the view.
 */
function getActionCounts(state) {
  const counts = {
    inspect_scene:  0,
    check_cctv:     0,
    analyze_phone:  0,
    interrogate:    0
  };
  state.actionHistory.forEach(entry => {
    if (counts[entry.action] !== undefined) {
      counts[entry.action]++;
    }
  });
  return counts;
}

module.exports = {
  // Game creation
  createGame,

  // Turn helpers
  turnsLeft,
  isOutOfTurns,
  isInvestigating,
  isAccusationPhase,
  isEnded,

  // Clue helpers
  hasClue,
  isPrerequisiteMet,
  isClueUnlockable,
  getUnlockableClues,
  getDiscoveredClues,

  // State transitions
  applyAction,
  enterAccusationPhase,
  applyVerdict,

  // Summary helpers
  getGameSummary,
  getActionCounts
};