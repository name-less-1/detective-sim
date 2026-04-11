// src/cases/caseSchema.js
// ─────────────────────────────────────────────────────────────
// Validates AI-generated case objects before they touch the game engine.
// If the AI returns broken/incomplete JSON, this catches it early
// and triggers a regeneration instead of crashing mid-game.
// ─────────────────────────────────────────────────────────────

// ── CONSTANTS ─────────────────────────────────────────────────
const VALID_ACTIONS = ['inspect_scene', 'check_cctv', 'analyze_phone', 'interrogate'];
const MIN_SUSPECTS = 3;
const MAX_SUSPECTS = 5;
const MIN_CLUES = 6;
const MAX_CLUES = 16;
const MIN_TURNS = 4;
const MAX_TURNS = 8;

// ── HELPERS ───────────────────────────────────────────────────
function isNonEmptyString(val) {
    return typeof val === 'string' && val.trim().length > 0;
}

function isPositiveInt(val) {
    return Number.isInteger(val) && val > 0;
}

// ── MAIN VALIDATOR ────────────────────────────────────────────
/**
 * Validates a case object (AI-generated or static).
 * Returns { valid: true } or { valid: false, errors: string[] }
 */
function validateCase(c) {
    const errors = [];

    // ── TOP LEVEL FIELDS ────────────────────────────────────────
    if (!isNonEmptyString(c.id)) errors.push('Missing or empty: id');
    if (!isNonEmptyString(c.title)) errors.push('Missing or empty: title');
    if (!isNonEmptyString(c.synopsis)) errors.push('Missing or empty: synopsis');
    if (!isNonEmptyString(c.guiltyId)) errors.push('Missing or empty: guiltyId');
    if (!isNonEmptyString(c.motive)) errors.push('Missing or empty: motive');
    if (!isNonEmptyString(c.method)) errors.push('Missing or empty: method');
    if (!isNonEmptyString(c.solutionSummary)) errors.push('Missing or empty: solutionSummary');

    if (!isPositiveInt(c.turnsAllowed)) errors.push('turnsAllowed must be a positive integer');
    if (c.turnsAllowed < MIN_TURNS || c.turnsAllowed > MAX_TURNS) {
        errors.push(`turnsAllowed must be between ${MIN_TURNS} and ${MAX_TURNS}`);
    }

    // ── SUSPECTS ────────────────────────────────────────────────
    if (!Array.isArray(c.suspects)) {
        errors.push('suspects must be an array');
    } else {
        if (c.suspects.length < MIN_SUSPECTS || c.suspects.length > MAX_SUSPECTS) {
            errors.push(`suspects array must have ${MIN_SUSPECTS}–${MAX_SUSPECTS} entries, got ${c.suspects.length}`);
        }

        const suspectIds = new Set();
        let guiltyCount = 0;

        c.suspects.forEach((s, i) => {
            const prefix = `suspects[${i}]`;

            if (!isNonEmptyString(s.id)) errors.push(`${prefix}: missing id`);
            if (!isNonEmptyString(s.name)) errors.push(`${prefix}: missing name`);
            if (!isNonEmptyString(s.role)) errors.push(`${prefix}: missing role`);
            if (!isNonEmptyString(s.alibi)) errors.push(`${prefix}: missing alibi`);
            if (typeof s.guilty !== 'boolean') errors.push(`${prefix}: guilty must be boolean`);

            // Dialogues
            if (!s.dialogues || typeof s.dialogues !== 'object') {
                errors.push(`${prefix}: missing dialogues object`);
            } else {
                if (!isNonEmptyString(s.dialogues.default)) {
                    errors.push(`${prefix}: dialogues.default is required`);
                }
            }

            if (s.id) {
                if (suspectIds.has(s.id)) errors.push(`Duplicate suspect id: ${s.id}`);
                suspectIds.add(s.id);
            }

            if (s.guilty === true) guiltyCount++;
        });

        // Exactly one guilty suspect
        if (guiltyCount !== 1) {
            errors.push(`Exactly 1 suspect must be guilty, found ${guiltyCount}`);
        }

        // guiltyId must match a real suspect
        if (c.guiltyId && !suspectIds.has(c.guiltyId)) {
            errors.push(`guiltyId "${c.guiltyId}" does not match any suspect id`);
        }

        // guilty: true must match guiltyId
        if (c.guiltyId) {
            const guiltyFlagSuspect = c.suspects.find(s => s.guilty === true);
            if (guiltyFlagSuspect && guiltyFlagSuspect.id !== c.guiltyId) {
                errors.push(`guiltyId "${c.guiltyId}" does not match suspect with guilty:true ("${guiltyFlagSuspect.id}")`);
            }
        }

        // ── CLUES ─────────────────────────────────────────────────
        if (!Array.isArray(c.clues)) {
            errors.push('clues must be an array');
        } else {
            if (c.clues.length < MIN_CLUES || c.clues.length > MAX_CLUES) {
                errors.push(`clues array must have ${MIN_CLUES}–${MAX_CLUES} entries, got ${c.clues.length}`);
            }

            const clueIds = new Set();

            c.clues.forEach((clue, i) => {
                const prefix = `clues[${i}]`;

                if (!isNonEmptyString(clue.id)) errors.push(`${prefix}: missing id`);
                if (!isNonEmptyString(clue.title)) errors.push(`${prefix}: missing title`);
                if (!isNonEmptyString(clue.description)) errors.push(`${prefix}: missing description`);

                // Action must be valid
                if (!VALID_ACTIONS.includes(clue.action)) {
                    errors.push(`${prefix}: invalid action "${clue.action}". Must be one of: ${VALID_ACTIONS.join(', ')}`);
                }

                // Interrogate clues must reference a valid suspect
                if (clue.action === 'interrogate') {
                    if (!isNonEmptyString(clue.suspectId) || clue.suspectId === 'null') {
                        errors.push(`${prefix}: interrogate clues must have a suspectId`);
                    } else if (!suspectIds.has(clue.suspectId)) {
                        errors.push(`${prefix}: suspectId "${clue.suspectId}" does not match any suspect`);
                    }
                }

                // pointsTo must reference a valid suspect (if set)
                if (clue.pointsTo !== null && clue.pointsTo !== undefined && clue.pointsTo !== 'null') {
                    if (!suspectIds.has(clue.pointsTo)) {
                        errors.push(`${prefix}: pointsTo "${clue.pointsTo}" does not match any suspect id`);
                    }
                }

                // Duplicate clue ids
                if (clue.id) {
                    if (clueIds.has(clue.id)) errors.push(`Duplicate clue id: ${clue.id}`);
                    clueIds.add(clue.id);
                }
            });

            // prerequisite must reference a real clue id
            c.clues.forEach((clue, i) => {
                if (clue.prerequisite !== null && clue.prerequisite !== undefined && clue.prerequisite !== 'null') {
                    if (!clueIds.has(clue.prerequisite)) {
                        errors.push(`clues[${i}]: prerequisite "${clue.prerequisite}" does not match any clue id`);
                    }
                    // Prevent self-referencing prerequisites
                    if (clue.prerequisite === clue.id) {
                        errors.push(`clues[${i}]: clue cannot be its own prerequisite`);
                    }
                }
            });

            // Each action type must have at least one clue with no prerequisite (entry point)
            const actionsWithEntryPoint = new Set(
                c.clues
                    .filter(clue => !clue.prerequisite || clue.prerequisite === 'null')
                    .map(clue => clue.action)
            );
            VALID_ACTIONS.forEach(action => {
                if (!actionsWithEntryPoint.has(action)) {
                    console.warn(`⚠️  Action "${action}" has no entry-point clue — skipping this check`);
                }
            });
        }

        // ── KEY EVIDENCE & RED HERRINGS ───────────────────────────
        if (!Array.isArray(c.keyEvidence) || c.keyEvidence.length === 0) {
            errors.push('keyEvidence must be a non-empty array');
        } else {
            const clueIds = new Set((c.clues || []).map(cl => cl.id));
            c.keyEvidence.forEach(id => {
                if (!clueIds.has(id)) errors.push(`keyEvidence references unknown clue id: "${id}"`);
            });
        }

        if (!Array.isArray(c.redHerrings)) {
            errors.push('redHerrings must be an array (can be empty)');
        } else {
            const clueIds = new Set((c.clues || []).map(cl => cl.id));
            c.redHerrings.forEach(id => {
                if (!clueIds.has(id)) errors.push(`redHerrings references unknown clue id: "${id}"`);
            });
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, errors: [] };
}

// ── SANITISER ─────────────────────────────────────────────────
/**
 * Strips any fields that shouldn't exist on a validated case
 * before it gets stored in the session (e.g. removes any extra
 * fields the AI hallucinated that aren't part of the schema).
 */
function sanitizeCase(c) {
    return {
        id: c.id,
        title: c.title,
        synopsis: c.synopsis,
        difficulty: c.difficulty || 'medium',
        turnsAllowed: c.turnsAllowed,
        crimeTime: c.crimeTime || null,
        crimeLocation: c.crimeLocation || null,
        guiltyId: c.guiltyId,
        motive: c.motive,
        method: c.method,
        solutionSummary: c.solutionSummary,
        suspects: c.suspects.map(s => ({
            id: s.id,
            name: s.name,
            role: s.role,
            age: s.age || null,
            alibi: s.alibi,
            appearance: s.appearance || null,
            dialogues: s.dialogues,
            guilty: s.guilty
        })),
        clues: c.clues.map(clue => ({
            id: clue.id,
            action: clue.action,
            suspectId: (!clue.suspectId || clue.suspectId === 'null') ? null : clue.suspectId,
            title: clue.title,
            description: clue.description,
            pointsTo: (!clue.pointsTo || clue.pointsTo === 'null') ? null : clue.pointsTo,
            prerequisite: (!clue.prerequisite || clue.prerequisite === 'null') ? null : clue.prerequisite
        })),
        keyEvidence: c.keyEvidence,
        redHerrings: c.redHerrings
    };
}

module.exports = { validateCase, sanitizeCase, VALID_ACTIONS };