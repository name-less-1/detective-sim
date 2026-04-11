// src/services/llmService.js
// ─────────────────────────────────────────────────────────────
// Handles dynamic dialogue generation using DeepSeek R1 via Ollama.
// This is separate from caseGenerator.js which generates full cases.
// llmService.js is used mid-game for richer, context-aware suspect
// responses when the player interrogates someone.
//
// Currently the actionResolver.js uses pre-written dialogues from
// the case definition. Plug this in when you're ready for fully
// dynamic interrogation responses.
// ─────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL  || 'http://localhost:11434';
const MODEL      = process.env.OLLAMA_MODEL || 'deepseek-r1:8b';
const TIMEOUT_MS = 30000; // 30 seconds — dialogue needs to be fast

// ── HELPERS ───────────────────────────────────────────────────
/**
 * Strips DeepSeek R1's <think>...</think> reasoning block
 * and returns only the final response text.
 */
function extractResponse(rawText) {
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

/**
 * Core Ollama call — low temperature for consistent in-character responses.
 */
async function callOllama(prompt) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: {
          temperature:    0.6,  // Lower than case gen — stay in character
          top_p:          0.85,
          repeat_penalty: 1.1,
          num_predict:    200   // Short — dialogue should be 2-3 sentences max
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return extractResponse(data.response || '');

  } finally {
    clearTimeout(timeout);
  }
}

// ── DIALOGUE GENERATOR ────────────────────────────────────────
/**
 * Generates a dynamic, context-aware dialogue line for a suspect.
 * Falls back to the pre-written dialogue if the LLM call fails.
 *
 * @param {Object}   suspect     - Suspect object from case definition
 * @param {Array}    knownClues  - Array of clue objects discovered so far
 * @param {string}   caseContext - Brief synopsis of the case
 * @returns {Promise<string>}    Dialogue line
 */
async function generateDialogue(suspect, knownClues, caseContext) {
  // Build a summary of what evidence the detective has
  const evidenceSummary = knownClues.length > 0
    ? knownClues.map(c => `- ${c.title}: ${c.description}`).join('\n')
    : 'No evidence collected yet.';

  // Flag evidence that directly points to this suspect
  const incriminatingClues = knownClues.filter(c => c.pointsTo === suspect.id);
  const isUnderPressure    = incriminatingClues.length > 0;

  const prompt = `You are roleplaying as ${suspect.name}, ${suspect.role}.
Case context: ${caseContext}
Your alibi: ${suspect.alibi}
You are ${suspect.guilty ? 'GUILTY' : 'INNOCENT'}.

The detective has found the following evidence:
${evidenceSummary}

${isUnderPressure
  ? `WARNING: Some of this evidence points directly at you. You are under pressure. Be evasive, defensive, or try to explain it away — but do NOT confess.`
  : `You are not directly implicated by the current evidence. Respond calmly and stick to your alibi.`
}

Rules:
- Stay completely in character as ${suspect.name}
- Respond in first person
- Keep your answer to 2-3 sentences maximum
- Do NOT break character or mention that you are an AI
- Do NOT confess even if guilty — be subtle and evasive
- Sound like a real person under questioning, not a robot

Your response:`;

  try {
    const response = await callOllama(prompt);

    // Basic safety check — if response is empty or too short, use fallback
    if (!response || response.length < 10) {
      throw new Error('Response too short');
    }

    return response;

  } catch (err) {
    console.warn(`llmService: dialogue generation failed for ${suspect.name} — using fallback. Error: ${err.message}`);

    // Fall back to pre-written dialogue from case definition
    return suspect.dialogues?.default || `I have nothing more to say to you.`;
  }
}

// ── REASONING EVALUATOR ───────────────────────────────────────
/**
 * Generates richer, narrative verdict feedback using the LLM.
 * Falls back to the rule-based reasoning from verdictEngine.js if it fails.
 *
 * @param {Object} caseDefinition
 * @param {Object} verdict        - Verdict object from verdictEngine.js
 * @returns {Promise<string>}     A paragraph of narrative feedback
 */
async function generateVerdictNarrative(caseDefinition, verdict) {
  const evidenceList = verdict.foundKeyEvidence.map(c => c.title).join(', ') || 'none';
  const missedList   = verdict.missedKeyEvidence.map(c => c.title).join(', ') || 'none';

  const prompt = `You are a seasoned detective chief reviewing a junior detective's case work.

Case: "${caseDefinition.title}"
Guilty party: ${verdict.guiltyName} (${caseDefinition.suspects.find(s => s.id === verdict.guiltyId)?.role})
Motive: ${caseDefinition.motive}

The detective accused: ${verdict.accusedName}
Result: ${verdict.isCorrect ? 'CORRECT' : 'WRONG'}
Score: ${verdict.score}/100 (${verdict.gradeLabel})

Key evidence found: ${evidenceList}
Key evidence missed: ${missedList}
Turns used: ${verdict.turnsUsed} of ${verdict.turnsTotal}

Write a 3-4 sentence narrative review of this detective's performance. Be direct, professional,
and slightly dramatic — like a film noir chief of police. If they got it right, acknowledge their
work but point out what they missed. If they got it wrong, explain what they should have focused on.
Do not use bullet points. Just flowing prose.`;

  try {
    const response = await callOllama(prompt);
    if (!response || response.length < 20) throw new Error('Response too short');
    return response;

  } catch (err) {
    console.warn(`llmService: verdict narrative failed — skipping. Error: ${err.message}`);
    return null; // verdictEngine.js reasoning will be used instead
  }
}

module.exports = { generateDialogue, generateVerdictNarrative };