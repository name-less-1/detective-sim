// src/routes/gameRoutes.js

const express = require("express");
const router = express.Router();

const {
  createGame,
  turnsLeft,
  isOutOfTurns,
  getDiscoveredClues,
  applyAction,
  enterAccusationPhase,
  applyVerdict,
  getGameSummary,
  getActionCounts,
} = require("../engine/gameEngine");

const {
  resolveAction,
  resolveDialogue,
  getActionAvailability,
  getSuspectInterrogationAvailability,
  getNoClueMessage,
  getActionLabel,
} = require("../engine/actionResolver");

const {
  evaluateAccusation,
  buildLeaderboardEntry,
} = require("../engine/verdictEngine");
const { generateCase } = require("../services/caseGenerator");
const {
  requireInvestigation,
  requireAccusation,
  requireEnded,
} = require("../middleware/gameGuard");

function getActiveCase(req) {
  return req.session.activeCase || null;
}

// ── GET /game/loading ─────────────────────────────────────────
router.get("/loading", (req, res) => {
  if (!req.session.generatingCase) return res.redirect("/");
  res.render("loading", {
    difficulty: req.session.pendingDifficulty || "medium",
  });
});

// ── GET /game/status ──────────────────────────────────────────
router.get("/status", (req, res) => {
  if (
    req.session.generationReady &&
    req.session.gameState &&
    req.session.activeCase
  ) {
    return res.json({ ready: true });
  }
  if (req.session.generationError) {
    return res.json({ ready: true, error: req.session.generationError });
  }
  res.json({ ready: false });
});

// ── POST /game/start ──────────────────────────────────────────
router.post("/start", async (req, res) => {
  const difficulty = ["easy", "medium", "hard"].includes(req.body.difficulty)
    ? req.body.difficulty
    : "medium";

  req.session.gameState = null;
  req.session.activeCase = null;
  req.session.generatingCase = true;
  req.session.generationReady = false;
  req.session.pendingDifficulty = difficulty;
  req.session.generationError = null;

  req.session.save(() => {
    res.redirect("/game/loading");
  });
});

// ── POST /game/generate/start ─────────────────────────────────
router.post("/generate/start", (req, res) => {
  const difficulty = req.session.pendingDifficulty || "medium";

  req.session.generatingCase = true;
  req.session.generationReady = false;

  req.session.save(() => {
    res.sendStatus(200);

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
            notice: "⚠️ AI failed — loaded a classic case instead.",
          };
        }
        req.session.save((err) => {
          if (err) console.error("Session save error:", err);
          else console.log("✅ Case saved to session successfully");
        });
      })
      .catch((err) => {
        console.error("Generation failed:", err);
        req.session.generationError = err.message;
        req.session.generatingCase = false;
        req.session.generationReady = false;
        req.session.save(() => {});
      });
  });
});

// ── GET /game ─────────────────────────────────────────────────
router.get("/", (req, res) => {
  const state = req.session.gameState;
  const caseData = getActiveCase(req);

  if (!state || !caseData) return res.redirect("/");

  if (isOutOfTurns(state) && state.phase === "investigation") {
    req.session.gameState = enterAccusationPhase(state);
  }

  if (state.phase === "ended") return res.redirect("/game/verdict");

  const updatedState = req.session.gameState;

  const safeSuspects = caseData.suspects.map(
    ({ id, name, role, age, alibi, appearance }) => ({
      id,
      name,
      role,
      age,
      alibi,
      appearance,
    }),
  );

  const discoveredClues = getDiscoveredClues(caseData, updatedState);
  const actionAvailability = getActionAvailability(caseData, updatedState);
  const suspectAvailability = getSuspectInterrogationAvailability(
    caseData,
    updatedState,
  );
  const actionCounts = getActionCounts(updatedState);

  res.render("game", {
    caseId: caseData.id,
    caseTitle: caseData.title,
    synopsis: caseData.synopsis,
    difficulty: caseData.difficulty,
    suspects: safeSuspects,
    clues: discoveredClues,
    turnsLeft: turnsLeft(updatedState),
    turnsTotal: updatedState.turnsTotal,
    turnsUsed: updatedState.turnsUsed,
    phase: updatedState.phase,
    actionAvailability,
    suspectAvailability,
    actionCounts,
    actionHistory: updatedState.actionHistory.map((entry) => ({
      ...entry,
      actionLabel: getActionLabel(entry.action),
    })),
    flash: res.locals.flash,
  });
});

// ── POST /game/action ─────────────────────────────────────────
router.post("/action", requireInvestigation, (req, res) => {
  const { action, suspectId } = req.body;
  const state = req.session.gameState;
  const caseData = getActiveCase(req);

  if (!state || !caseData) return res.redirect("/");

  const validActions = [
    "inspect_scene",
    "check_cctv",
    "analyze_phone",
    "interrogate",
  ];
  if (!validActions.includes(action)) return res.redirect("/game");

  if (action === "interrogate") {
    const validSuspect = caseData.suspects.some((s) => s.id === suspectId);
    if (!validSuspect) return res.redirect("/game");
  }

  const resolvedClue = resolveAction(
    caseData,
    state,
    action,
    action === "interrogate" ? suspectId : null,
  );

  let dialogue = null;
  if (action === "interrogate" && suspectId) {
    const suspect = caseData.suspects.find((s) => s.id === suspectId);
    dialogue = {
      suspectName: suspect?.name || "",
      text: resolveDialogue(caseData, state, suspectId),
    };
  }

  req.session.gameState = applyAction(
    state,
    action,
    suspectId || null,
    resolvedClue,
  );
  req.session.flash = {
    clue: resolvedClue || null,
    dialogue: dialogue || null,
    notice: resolvedClue ? null : getNoClueMessage(action),
  };

  res.redirect("/game");
});

// ── POST /game/accuse ─────────────────────────────────────────
router.post("/accuse", requireAccusation, (req, res) => {
  const { suspectId } = req.body;
  const state = req.session.gameState;
  const caseData = getActiveCase(req);

  if (!state || !caseData) return res.redirect("/");

  const validSuspect = caseData.suspects.some((s) => s.id === suspectId);
  if (!validSuspect) return res.redirect("/game");

  const verdict = evaluateAccusation(caseData, state, suspectId);
  req.session.gameState = applyVerdict(state, suspectId, verdict);

  if (!req.session.gameHistory) req.session.gameHistory = [];
  req.session.gameHistory.push(buildLeaderboardEntry(verdict, caseData.title));

  res.redirect("/game/verdict");
});

// ── GET /game/verdict ─────────────────────────────────────────
router.get("/verdict", requireEnded, (req, res) => {
  const state = req.session.gameState;
  const caseData = getActiveCase(req);

  if (!state || !caseData) return res.redirect("/");

  res.render("verdict", {
    verdict: state.verdict,
    caseTitle: caseData.title,
    difficulty: caseData.difficulty,
    suspects: caseData.suspects.map(({ id, name, role }) => ({
      id,
      name,
      role,
    })),
  });
});

// ── POST /game/restart ────────────────────────────────────────
router.post("/restart", (req, res) => {
  req.session.gameState = null;
  req.session.activeCase = null;
  res.redirect("/");
});

// ── POST /game/ai-solve ───────────────────────────────────────
router.post("/ai-solve", requireInvestigation, async (req, res) => {
  const state = req.session.gameState;
  const caseData = getActiveCase(req);

  if (!state || !caseData)
    return res.status(400).json({ error: "No active game" });

  const Groq = require("groq-sdk");
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const safeSuspects = caseData.suspects
    .map((s) => `- ${s.id}: ${s.name} (${s.role}) — alibi: "${s.alibi}"`)
    .join("\n");

  const availableClues = caseData.clues
    .filter((c) => !state.discoveredClueIds.includes(c.id))
    .map(
      (c) =>
        `- ${c.id} [${c.action}${c.suspectId ? ", suspectId:" + c.suspectId : ""}]: ${c.title}`,
    )
    .join("\n");

  const turnsRemaining = state.turnsTotal - state.turnsUsed;

  const prompt = `You are an expert detective. Analyze this case and decide the best sequence of actions.

CASE: "${caseData.title}"
SYNOPSIS: ${caseData.synopsis}

SUSPECTS:
${safeSuspects}

UNDISCOVERED CLUES (you can find these):
${availableClues}

TURNS REMAINING: ${turnsRemaining}
ALREADY FOUND CLUES:
${
  state.discoveredClueIds
    .map((id) => {
      const clue = caseData.clues.find((c) => c.id === id);
      return clue ? `- ${clue.title}: ${clue.description}` : "";
    })
    .filter(Boolean)
    .join("\n") || "none"
}

Reply ONLY with a JSON object:
{
  "reasoning": "Your overall deduction in 2-3 sentences",
  "actions": [
    { "action": "inspect_scene", "suspectId": null, "reason": "why" },
    { "action": "interrogate", "suspectId": "suspect_01", "reason": "why" }
  ],
  "accusation": "suspect_id",
  "accusationReason": "Why you think this suspect is guilty"
}

Valid action types: inspect_scene, check_cctv, analyze_phone, interrogate
For interrogate, suspectId must be a valid suspect id. For all others, suspectId must be null.
Maximum ${turnsRemaining} actions.`;

  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a detective AI. Output only valid JSON, no markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1000,
    });

    let raw = completion.choices[0]?.message?.content || "";
    raw = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in response");

    const plan = JSON.parse(raw.slice(start, end + 1));

    const validActions = [
      "inspect_scene",
      "check_cctv",
      "analyze_phone",
      "interrogate",
    ];
    const suspectIds = new Set(caseData.suspects.map((s) => s.id));

    plan.actions = (plan.actions || [])
      .filter((a) => validActions.includes(a.action))
      .filter((a) => a.action !== "interrogate" || suspectIds.has(a.suspectId))
      .slice(0, turnsRemaining);

    if (!suspectIds.has(plan.accusation)) {
      plan.accusation = caseData.suspects[0].id;
      plan.accusationReason = "Best guess based on available evidence.";
    }

    res.json({ success: true, plan });
  } catch (err) {
    console.error("AI solve error:", err.message);
    res.status(500).json({ error: "AI solver failed: " + err.message });
  }
});

// ── GET /game/debug ───────────────────────────────────────────
router.get("/debug", (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res
      .status(403)
      .json({ error: "Debug route disabled in production" });
  }
  const state = req.session.gameState;
  const caseData = getActiveCase(req);
  res.json({
    summary: state ? getGameSummary(state) : null,
    fullState: state,
    caseId: caseData?.id || null,
    caseTitle: caseData?.title || null,
  });
});

module.exports = router;
