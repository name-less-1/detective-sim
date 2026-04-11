// src/engine/actionResolver.js
// ─────────────────────────────────────────────────────────────
// Resolves player actions into clues and suspect dialogues.
// Takes the case definition + current state and returns
// what the player discovers this turn.
// No Express, no session — pure logic only.
// ─────────────────────────────────────────────────────────────

const { getUnlockableClues } = require('./gameEngine');

// ── ACTION RESOLVER ───────────────────────────────────────────
/**
 * Finds the next clue to reveal for a given action.
 * Returns the first unlockable clue for that action type,
 * respecting prerequisite chains and already-found clues.
 *
 * @param {Object}      caseDefinition  - Validated case object
 * @param {Object}      state           - Current game state
 * @param {string}      action          - 'inspect_scene' | 'check_cctv' | 'analyze_phone' | 'interrogate'
 * @param {string|null} suspectId       - Required for interrogate, null otherwise
 * @returns {Object|null} Clue object or null if nothing new to reveal
 */
function resolveAction(caseDefinition, state, action, suspectId = null) {
  const candidates = getUnlockableClues(caseDefinition, state, action, suspectId);

  if (candidates.length === 0) return null;

  // Return the first candidate — clues are ordered narratively in the case file
  // Prerequisites already ensure the chain is respected
  return candidates[0];
}

// ── DIALOGUE RESOLVER ─────────────────────────────────────────
/**
 * Returns the most contextually appropriate dialogue for a suspect
 * based on what evidence has already been discovered.
 *
 * Dialogue priority (most specific wins):
 * 1. afterPhone  — if phone log evidence has been found
 * 2. afterCCTV   — if CCTV evidence has been found
 * 3. default     — always available
 *
 * @param {Object} caseDefinition
 * @param {Object} state
 * @param {string} suspectId
 * @returns {string} Dialogue line
 */
function resolveDialogue(caseDefinition, state, suspectId) {
  const suspect = caseDefinition.suspects.find(s => s.id === suspectId);

  if (!suspect) {
    throw new Error(`resolveDialogue: unknown suspectId "${suspectId}"`);
  }

  const d = suspect.dialogues;

  // Check what evidence categories have been found
  const hasPhoneEvidence = caseDefinition.clues.some(
    clue => clue.action === 'analyze_phone' && state.discoveredClueIds.includes(clue.id)
  );
  const hasCCTVEvidence = caseDefinition.clues.some(
    clue => clue.action === 'check_cctv' && state.discoveredClueIds.includes(clue.id)
  );

  if (hasPhoneEvidence && d.afterPhone) return d.afterPhone;
  if (hasCCTVEvidence  && d.afterCCTV)  return d.afterCCTV;

  return d.default;
}

// ── ACTION AVAILABILITY ───────────────────────────────────────
/**
 * Returns a map of which actions currently have unlockable clues.
 * Used by the view to disable action buttons when there's nothing left to find.
 *
 * @param {Object} caseDefinition
 * @param {Object} state
 * @returns {Object} { inspect_scene: bool, check_cctv: bool, analyze_phone: bool, interrogate: bool }
 */
function getActionAvailability(caseDefinition, state) {
  const actions = ['inspect_scene', 'check_cctv', 'analyze_phone', 'interrogate'];

  const availability = {};

  actions.forEach(action => {
    if (action === 'interrogate') {
      // Interrogate is available if ANY suspect has unlockable clues
      availability[action] = caseDefinition.suspects.some(suspect =>
        getUnlockableClues(caseDefinition, state, 'interrogate', suspect.id).length > 0
      );
    } else {
      availability[action] = getUnlockableClues(caseDefinition, state, action).length > 0;
    }
  });

  return availability;
}

/**
 * Returns which specific suspects still have unlockable interrogation clues.
 * Used by the view to show/grey-out individual suspect interrogation buttons.
 *
 * @param {Object} caseDefinition
 * @param {Object} state
 * @returns {Object} { suspect_01: bool, suspect_02: bool, ... }
 */
function getSuspectInterrogationAvailability(caseDefinition, state) {
  const availability = {};

  caseDefinition.suspects.forEach(suspect => {
    availability[suspect.id] =
      getUnlockableClues(caseDefinition, state, 'interrogate', suspect.id).length > 0;
  });

  return availability;
}

// ── NO CLUE MESSAGES ──────────────────────────────────────────
// Shown to the player when an action reveals nothing new.
const NO_CLUE_MESSAGES = {
  inspect_scene:  "You comb through the crime scene again but find nothing you haven't already noted.",
  check_cctv:     "You review the remaining footage but there's nothing new to extract from the recordings.",
  analyze_phone:  "You dig deeper into the phone records but find no further leads at this time.",
  interrogate:    "You press further but the suspect repeats their story without adding anything new."
};

/**
 * Returns the appropriate "nothing found" message for an action.
 */
function getNoClueMessage(action) {
  return NO_CLUE_MESSAGES[action] || "You investigate further but find nothing new.";
}

// ── ACTION LABELS ─────────────────────────────────────────────
// Human-readable labels for action types — used in history log
const ACTION_LABELS = {
  inspect_scene:  '🔍 Inspected Crime Scene',
  check_cctv:     '📹 Checked CCTV Footage',
  analyze_phone:  '📱 Analyzed Phone Logs',
  interrogate:    '🗣️  Interrogated Suspect'
};

/**
 * Returns a human-readable label for an action type.
 */
function getActionLabel(action) {
  return ACTION_LABELS[action] || action;
}

module.exports = {
  resolveAction,
  resolveDialogue,
  getActionAvailability,
  getSuspectInterrogationAvailability,
  getNoClueMessage,
  getActionLabel
};