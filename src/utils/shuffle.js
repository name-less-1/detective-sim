// src/utils/shuffle.js
// ─────────────────────────────────────────────────────────────
// Utility functions for randomisation.
// Used to shuffle clue order, randomise suspect lists,
// and pick random elements — keeps gameplay feeling fresh
// even when the same case is replayed.
// ─────────────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle — returns a NEW shuffled array.
 * Does not mutate the original array.
 *
 * @param {Array} array - Any array
 * @returns {Array} New shuffled array
 */
function shuffle(array) {
  const arr = [...array]; // copy — never mutate the original
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Returns a random element from an array.
 *
 * @param {Array} array
 * @returns {*} Random element
 */
function pickRandom(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Returns n unique random elements from an array.
 * If n >= array.length, returns a shuffled copy of the whole array.
 *
 * @param {Array}  array
 * @param {number} n - How many to pick
 * @returns {Array}
 */
function pickRandomN(array, n) {
  if (!array || array.length === 0) return [];
  return shuffle(array).slice(0, n);
}

/**
 * Shuffles suspects in a case definition copy.
 * Useful so the guilty suspect isn't always in the same
 * position in the UI across replays.
 *
 * @param {Object} caseDefinition
 * @returns {Object} New case object with shuffled suspects
 */
function shuffleSuspects(caseDefinition) {
  return {
    ...caseDefinition,
    suspects: shuffle(caseDefinition.suspects)
  };
}

/**
 * Returns a random integer between min and max (inclusive).
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { shuffle, pickRandom, pickRandomN, shuffleSuspects, randomInt };