// src/services/caseGenerator.js
// ─────────────────────────────────────────────────────────────
// Generates detective cases using Groq API (DeepSeek R1 or Llama).
// Fast, reliable, no local model needed.
// ─────────────────────────────────────────────────────────────

const Groq   = require('groq-sdk');
const path   = require('path');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'llama-3.3-70b-versatile'; // fast + smart on Groq

// ── DIFFICULTY CONFIG ─────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { suspects: 3, clues: 6,  turns: 7 },
  medium: { suspects: 4, clues: 9,  turns: 6 },
  hard:   { suspects: 5, clues: 12, turns: 5 }
};

// ── PROMPT BUILDER ────────────────────────────────────────────
function buildPrompt(difficulty) {
  const cfg = DIFFICULTY_CONFIG[difficulty];

  return `You are a crime writer. Generate a detective mystery case as a single valid JSON object.

REQUIREMENTS:
- ${cfg.suspects} suspects (exactly 1 guilty)
- ${cfg.clues} clues spread across 4 action types: inspect_scene, check_cctv, analyze_phone, interrogate
- Each action type must have at least 1 clue
- Interrogate clues must have a suspectId matching one of the suspects
- ${cfg.turns} turns allowed

Return ONLY a JSON object, no markdown, no explanation, no \`\`\`json fences. Just raw JSON.

Use exactly this structure:
{
  "id": "case_XXXXX",
  "title": "Case Title",
  "synopsis": "Brief description of the crime",
  "difficulty": "${difficulty}",
  "turnsAllowed": ${cfg.turns},
  "crimeLocation": "Location name",
  "guiltyId": "suspect_01",
  "motive": "Why they did it",
  "method": "How they did it",
  "solutionSummary": "Full explanation of what happened",
  "suspects": [
    {
      "id": "suspect_01",
      "name": "Full Name",
      "role": "Job title",
      "age": 35,
      "alibi": "Where they claim to have been",
      "appearance": "Brief physical description",
      "guilty": true,
      "dialogues": {
        "default": "What they say when first questioned",
        "afterCCTV": "What they say after CCTV evidence found",
        "afterPhone": "What they say after phone evidence found"
      }
    }
  ],
  "clues": [
    {
      "id": "clue_01",
      "action": "inspect_scene",
      "title": "Clue Title",
      "description": "What the detective finds",
      "suspectId": null,
      "pointsTo": "suspect_01",
      "prerequisite": null
    },
    {
      "id": "clue_02",
      "action": "interrogate",
      "title": "Clue Title",
      "description": "What the detective learns",
      "suspectId": "suspect_01",
      "pointsTo": null,
      "prerequisite": null
    }
  ],
  "keyEvidence": ["clue_01", "clue_03"],
  "redHerrings": ["clue_05"]
}

Rules:
- guiltyId must match the id of the suspect with guilty:true
- suspectId on interrogate clues must match a real suspect id
- pointsTo must be null or a real suspect id
- prerequisite must be null or a real clue id
- keyEvidence and redHerrings must contain real clue ids
- Make the mystery interesting and the guilty suspect non-obvious
- All string values for suspectId, pointsTo, prerequisite must be actual IDs or null (not the string "null")`;
}

// ── MAIN GENERATOR ────────────────────────────────────────────
async function generateCase(difficulty = 'medium') {
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

  console.log(`🎲 Generating case (difficulty: ${difficulty}, model: ${MODEL})...`);

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a crime fiction writer. You output only valid JSON objects with no extra text, no markdown formatting, no code fences.'
        },
        {
          role: 'user',
          content: buildPrompt(difficulty)
        }
      ],
      temperature:  0.8,
      max_tokens:   4000,
      stream:       false
    });

    const raw = completion.choices[0]?.message?.content || '';
    console.log('🤖 Raw response (first 300 chars):', raw.slice(0, 300));

    // Extract JSON
    const caseData = extractJSON(raw);

    // Sanitize
    const sanitized = sanitizeCase(caseData, difficulty, cfg);

    // Validate
    const errors = validateCase(sanitized);
    if (errors.length > 0) {
      console.warn('⚠️  Validation warnings:', errors);
      // Don't hard fail — just warn and continue
    }

    console.log(`✅ Case generated: "${sanitized.title}"`);
    return { case: sanitized, usedFallback: false };

  } catch (err) {
    console.error('❌ Case generation failed:', err.message);
    console.log('📦 Loading fallback case...');
    const fallback = require('../cases/case_001');
    return { case: fallback, usedFallback: true };
  }
}

// ── JSON EXTRACTOR ────────────────────────────────────────────
function extractJSON(raw) {
  // Strip <think> blocks (DeepSeek reasoning)
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown fences
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // Find first { to last }
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');

  if (start === -1 || end === -1) {
    throw new Error('No valid JSON object found in model response');
  }

  const jsonStr = text.slice(start, end + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON parse error: ${e.message}`);
  }
}

// ── SANITIZER ─────────────────────────────────────────────────
// Cleans up common LLM mistakes before validation
function sanitizeCase(c, difficulty, cfg) {
  const nullify = v => (!v || v === 'null' || v === 'undefined') ? null : v;

  return {
    id:              c.id || `case_${Math.floor(Math.random() * 99999)}`,
    title:           c.title || 'Untitled Case',
    synopsis:        c.synopsis || '',
    difficulty,
    turnsAllowed:    cfg.turns,
    crimeLocation:   c.crimeLocation || 'Unknown Location',
    guiltyId:        c.guiltyId || '',
    motive:          c.motive || '',
    method:          c.method || '',
    solutionSummary: c.solutionSummary || '',
    keyEvidence:     Array.isArray(c.keyEvidence) ? c.keyEvidence : [],
    redHerrings:     Array.isArray(c.redHerrings) ? c.redHerrings : [],

    suspects: (c.suspects || []).map(s => ({
      id:         s.id,
      name:       s.name,
      role:       s.role || '',
      age:        s.age || 30,
      alibi:      s.alibi || '',
      appearance: s.appearance || '',
      guilty:     s.guilty === true,
      dialogues: {
        default:    s.dialogues?.default    || 'I have nothing to say.',
        afterCCTV:  s.dialogues?.afterCCTV  || s.dialogues?.default || 'I have nothing to say.',
        afterPhone: s.dialogues?.afterPhone || s.dialogues?.default || 'I have nothing to say.'
      }
    })),

    clues: (c.clues || []).map(clue => ({
      id:          clue.id,
      action:      clue.action,
      title:       clue.title || '',
      description: clue.description || '',
      suspectId:   nullify(clue.suspectId),
      pointsTo:    nullify(clue.pointsTo),
      prerequisite: nullify(clue.prerequisite)
    }))
  };
}

// ── VALIDATOR ─────────────────────────────────────────────────
// Returns array of warning strings (not hard errors)
function validateCase(c) {
  const warnings = [];
  const suspectIds = new Set(c.suspects.map(s => s.id));
  const clueIds    = new Set(c.clues.map(cl => cl.id));

  // Check guiltyId
  if (!suspectIds.has(c.guiltyId)) {
    warnings.push(`guiltyId "${c.guiltyId}" doesn't match any suspect`);
  }

  // Check exactly one guilty suspect
  const guiltyCount = c.suspects.filter(s => s.guilty).length;
  if (guiltyCount !== 1) {
    warnings.push(`Expected 1 guilty suspect, found ${guiltyCount}`);
  }

  // Check clue references
  c.clues.forEach((clue, i) => {
    if (clue.pointsTo && !suspectIds.has(clue.pointsTo)) {
      warnings.push(`clue[${i}] pointsTo unknown suspect "${clue.pointsTo}"`);
    }
    if (clue.suspectId && !suspectIds.has(clue.suspectId)) {
      warnings.push(`clue[${i}] suspectId unknown "${clue.suspectId}"`);
    }
    if (clue.prerequisite && !clueIds.has(clue.prerequisite)) {
      warnings.push(`clue[${i}] prerequisite unknown "${clue.prerequisite}"`);
    }
  });

  return warnings;
}

module.exports = { generateCase };