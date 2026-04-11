// src/engine/verdictEngine.js
// ─────────────────────────────────────────────────────────────
// Evaluates the player's accusation against the case ground truth.
// Builds detailed reasoning feedback based on what evidence
// was collected, missed, or wasted on red herrings.
// No Express, no session — pure logic only.
// ─────────────────────────────────────────────────────────────

// ── GRADE THRESHOLDS ──────────────────────────────────────────
const GRADES = [
  { min: 90, grade: 'S', label: 'Master Detective',    color: 'gold'   },
  { min: 75, grade: 'A', label: 'Senior Investigator', color: 'green'  },
  { min: 55, grade: 'B', label: 'Field Detective',     color: 'blue'   },
  { min: 35, grade: 'C', label: 'Junior Detective',    color: 'orange' },
  { min: 0,  grade: 'D', label: 'Rookie Mistake',      color: 'red'    }
];

// ── SCORE WEIGHTS ─────────────────────────────────────────────
const SCORE_WEIGHTS = {
  correctAccusation:    40,  // Base points for naming the right suspect
  keyEvidenceMax:       40,  // Points for collecting key evidence (split across clues)
  efficiencyBonus:      20   // Bonus for solving with turns to spare
};

// ── HELPERS ───────────────────────────────────────────────────
function getSuspectById(caseDefinition, suspectId) {
  return caseDefinition.suspects.find(s => s.id === suspectId) || null;
}

function getClueById(caseDefinition, clueId) {
  return caseDefinition.clues.find(c => c.id === clueId) || null;
}

function getGrade(score) {
  return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];
}

// ── MAIN EVALUATOR ────────────────────────────────────────────
/**
 * Evaluates the player's accusation and returns a full verdict object.
 *
 * @param {Object} caseDefinition - Validated case object
 * @param {Object} state          - Final game state
 * @param {string} accusedId      - The suspect ID the player accused
 * @returns {Object} Verdict object
 */
function evaluateAccusation(caseDefinition, state, accusedId) {
  const isCorrect    = accusedId === caseDefinition.guiltyId;
  const accusedName  = getSuspectById(caseDefinition, accusedId)?.name  || 'Unknown';
  const guiltyName   = getSuspectById(caseDefinition, caseDefinition.guiltyId)?.name || 'Unknown';
  const guiltySuspect = getSuspectById(caseDefinition, caseDefinition.guiltyId);

  // ── EVIDENCE ANALYSIS ──────────────────────────────────────
  const foundKeyIds   = caseDefinition.keyEvidence.filter(id => state.discoveredClueIds.includes(id));
  const missedKeyIds  = caseDefinition.keyEvidence.filter(id => !state.discoveredClueIds.includes(id));
  const foundRedIds   = caseDefinition.redHerrings.filter(id => state.discoveredClueIds.includes(id));

  const foundKeyClues  = foundKeyIds.map(id  => getClueById(caseDefinition, id)).filter(Boolean);
  const missedKeyClues = missedKeyIds.map(id => getClueById(caseDefinition, id)).filter(Boolean);
  const foundRedClues  = foundRedIds.map(id  => getClueById(caseDefinition, id)).filter(Boolean);

  // ── SCORING ────────────────────────────────────────────────
  // 1. Correct accusation: 40 points flat
  const accusationScore = isCorrect ? SCORE_WEIGHTS.correctAccusation : 0;

  // 2. Key evidence: up to 40 points proportional to how many key clues were found
  const keyEvidenceScore = caseDefinition.keyEvidence.length > 0
    ? Math.round((foundKeyIds.length / caseDefinition.keyEvidence.length) * SCORE_WEIGHTS.keyEvidenceMax)
    : 0;

  // 3. Efficiency bonus: up to 20 points for turns saved
  //    Full bonus if 2+ turns left, scaled down otherwise
  const turnsRemaining  = state.turnsTotal - state.turnsUsed;
  const efficiencyScore = isCorrect && turnsRemaining >= 1
    ? Math.min(Math.round((turnsRemaining / state.turnsTotal) * SCORE_WEIGHTS.efficiencyBonus * 2), SCORE_WEIGHTS.efficiencyBonus)
    : 0;

  const totalScore = Math.min(accusationScore + keyEvidenceScore + efficiencyScore, 100);
  const gradeInfo  = getGrade(totalScore);

  // ── REASONING LINES ────────────────────────────────────────
  const reasoning = [];

  // Verdict headline
  if (isCorrect) {
    reasoning.push({
      type: 'success',
      text: `Correct. ${guiltyName} is guilty — you got the right person.`
    });
  } else {
    reasoning.push({
      type: 'failure',
      text: `Wrong. You accused ${accusedName}, but ${guiltyName} was the guilty party.`
    });
  }

  // Key evidence found
  if (foundKeyClues.length > 0) {
    reasoning.push({
      type: 'positive',
      text: `Strong work on the evidence — you found ${foundKeyClues.length} of ${caseDefinition.keyEvidence.length} key clues: ${foundKeyClues.map(c => `"${c.title}"`).join(', ')}.`
    });
  }

  // Key evidence missed
  if (missedKeyClues.length > 0) {
    reasoning.push({
      type: 'negative',
      text: `You missed critical evidence that would have ${isCorrect ? 'strengthened your case' : 'pointed you to the truth'}: ${missedKeyClues.map(c => `"${c.title}"`).join(', ')}.`
    });
  }

  // Red herrings chased
  if (foundRedClues.length > 0) {
    reasoning.push({
      type: 'warning',
      text: `You spent turns on ${foundRedClues.length} red herring${foundRedClues.length > 1 ? 's' : ''}: ${foundRedClues.map(c => `"${c.title}"`).join(', ')}. These were intentional misdirections.`
    });
  }

  // Efficiency comment
  if (isCorrect && turnsRemaining >= 2) {
    reasoning.push({
      type: 'positive',
      text: `Efficient investigation — you solved the case with ${turnsRemaining} turn${turnsRemaining > 1 ? 's' : ''} to spare.`
    });
  } else if (!isCorrect && turnsRemaining === 0) {
    reasoning.push({
      type: 'warning',
      text: `You used all your turns without finding the key evidence needed to identify the real culprit.`
    });
  }

  // Wrong suspect — explain why they were innocent
  if (!isCorrect) {
    const accusedSuspect = getSuspectById(caseDefinition, accusedId);
    if (accusedSuspect) {
      reasoning.push({
        type: 'info',
        text: `${accusedName}'s alibi: "${accusedSuspect.alibi}" — this held up under investigation.`
      });
    }
  }

  // Motive reveal
  reasoning.push({
    type: 'info',
    text: `Motive: ${caseDefinition.motive}`
  });

  // Method reveal
  reasoning.push({
    type: 'info',
    text: `Method: ${caseDefinition.method}`
  });

  // ── ACTION BREAKDOWN ───────────────────────────────────────
  const actionCounts = { inspect_scene: 0, check_cctv: 0, analyze_phone: 0, interrogate: 0 };
  state.actionHistory.forEach(entry => {
    if (actionCounts[entry.action] !== undefined) {
      actionCounts[entry.action]++;
    }
  });

  // ── ASSEMBLE VERDICT ───────────────────────────────────────
  return {
    isCorrect,
    accusedId,
    accusedName,
    guiltyId:         caseDefinition.guiltyId,
    guiltyName,
    guiltyRole:       guiltySuspect?.role || '',
    score:            totalScore,
    grade:            gradeInfo.grade,
    gradeLabel:       gradeInfo.label,
    gradeColor:       gradeInfo.color,
    accusationScore,
    keyEvidenceScore,
    efficiencyScore,
    turnsUsed:        state.turnsUsed,
    turnsTotal:       state.turnsTotal,
    turnsRemaining,
    reasoning,
    foundKeyEvidence:  foundKeyClues,
    missedKeyEvidence: missedKeyClues,
    redHerringsCaught: foundRedClues,
    actionCounts,
    solutionSummary:  caseDefinition.solutionSummary,
    totalCluesFound:  state.discoveredClueIds.length,
    totalCluesInCase: caseDefinition.clues.length
  };
}

// ── LEADERBOARD ENTRY BUILDER ─────────────────────────────────
/**
 * Builds a lightweight leaderboard entry from a verdict.
 * Store these in session history if you want to track past games.
 */
function buildLeaderboardEntry(verdict, caseTitle) {
  return {
    caseTitle,
    isCorrect:  verdict.isCorrect,
    score:      verdict.score,
    grade:      verdict.grade,
    gradeLabel: verdict.gradeLabel,
    turnsUsed:  verdict.turnsUsed,
    turnsTotal: verdict.turnsTotal,
    playedAt:   new Date().toISOString()
  };
}

module.exports = { evaluateAccusation, buildLeaderboardEntry, GRADES };