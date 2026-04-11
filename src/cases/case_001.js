// src/cases/case_001.js
// ─────────────────────────────────────────────────────────────
// CASE FILE #001 — The Midnight Gallery Theft
// This file is the SINGLE SOURCE OF TRUTH for this case.
// The game engine reads from it but NEVER modifies it.
// guiltyId is only ever read by verdictEngine.js — never expose it to views.
// ─────────────────────────────────────────────────────────────

module.exports = {
    id: 'case_001',
    title: 'The Midnight Gallery Theft',
    synopsis: `A priceless 17th-century painting — "The Silent Witness" — vanished
from the East Wing of the City Gallery sometime between 11:00 PM and 1:00 AM.
The security alarm was never triggered. You have 6 turns to investigate before
you must name your suspect. Choose your actions carefully.`,

    difficulty: 'medium',
    turnsAllowed: 6,

    // ── CRIME FACTS ───────────────────────────────────────────────
    // Ground truth. NEVER pass these fields to EJS views.
    crimeTime: '2024-03-15T00:30:00',
    crimeLocation: 'East Wing, City Gallery',
    guiltyId: 'suspect_02',
    motive: 'Insurance fraud — Holt was paid by an underground dealer to steal and replace the painting with a forgery.',
    method: 'Disabled the East Wing camera feed using his security credentials, then used a stolen keycard copy to access the storage room and swap the painting.',

    // ── SUSPECTS ──────────────────────────────────────────────────
    suspects: [
        {
            id: 'suspect_01',
            name: 'Diana Reeves',
            role: 'Gallery Curator',
            age: 47,
            alibi: 'Claims she attended a private dinner at Rosario\'s Restaurant until midnight, then went straight home.',
            appearance: 'Tall, sharp-eyed woman in her late 40s. Always composed — almost too composed.',
            // Dialogues shift based on what evidence the player has already found
            dialogues: {
                default: 'I have dedicated fifteen years to this gallery. The very suggestion that I had anything to do with this is insulting.',
                afterCCTV: 'Fine — yes, I was near the East Wing around 11:45. I had concerns about a water leak near the storage room. I called maintenance.',
                afterPhone: 'Yes, I made a call to the security desk. Standard procedure when I notice anything unusual. Ask them.'
            },
            guilty: false
        },
        {
            id: 'suspect_02',
            name: 'Marcus Holt',
            role: 'Night Security Guard',
            age: 34,
            alibi: 'Claims he was on patrol in the West Wing from 11:30 PM to 1:00 AM and never went near the East Wing.',
            appearance: 'Broad-shouldered, nervous energy. Keeps checking his watch. Avoids eye contact when asked direct questions.',
            dialogues: {
                default: 'I did my rounds like always. West Wing, lobby, basement. Everything was fine when I last checked the East Wing at 11:15.',
                afterCCTV: 'That timestamp must be wrong. The system glitches all the time — I\'ve filed complaints about it. Check the maintenance logs.',
                afterPhone: 'I... I pocket-dialled. It happens. That number belongs to a friend. It means absolutely nothing.'
            },
            guilty: true
        },
        {
            id: 'suspect_03',
            name: 'Priya Shah',
            role: 'Art Dealer & Visiting Appraiser',
            age: 39,
            alibi: 'Hotel key-card records show she entered the Meridian Hotel at 11:45 PM. The hotel is a 20-minute drive from the gallery.',
            appearance: 'Polished, confident. She appraised "The Silent Witness" two weeks ago and noted its value had tripled.',
            dialogues: {
                default: 'I was asleep at the hotel by midnight. Check their cameras — I\'m sure I\'m on them. I had no reason to steal what I could have simply bought.',
                afterCCTV: 'I don\'t know what you\'re implying. My alibi is airtight. Focus on someone who was actually in the building.',
                afterPhone: 'I don\'t know anything about any phone calls. I\'d like to speak to a lawyer now.'
            },
            guilty: false
        },
        {
            id: 'suspect_04',
            name: 'Leo Farris',
            role: 'Gallery Maintenance Technician',
            age: 28,
            alibi: 'Says he left the building at 10:30 PM after fixing a broken display light. Sign-out log confirms this.',
            appearance: 'Quiet, keeps to himself. Has a tattoo of a compass on his forearm. Recently paid off a large debt.',
            dialogues: {
                default: 'I clocked out at 10:30, you can check the log. I was home by 11. My girlfriend can confirm it.',
                afterCCTV: 'I told you, I wasn\'t there. Someone must have propped the side door — it has a faulty latch. I reported it last week.',
                afterPhone: 'I don\'t have anything to do with this. Stop trying to pin it on the guy who looks like he needs money.'
            },
            guilty: false
        }
    ],

    // ── CLUE BANK ─────────────────────────────────────────────────
    // Order matters — clues are served top-to-bottom within each action type.
    // prerequisite: null means it's always available for that action.
    // prerequisite: 'clue_id' means that clue must be found first.
    clues: [

        // ── INSPECT CRIME SCENE ─────────────────────────────────
        {
            id: 'clue_scene_01',
            action: 'inspect_scene',
            title: 'Scuff marks on the floor',
            description: 'Fresh scuff marks on the polished floor lead from the East Wing painting alcove directly to the fire exit — consistent with someone dragging a flat, rigid object.',
            pointsTo: 'suspect_02',
            prerequisite: null
        },
        {
            id: 'clue_scene_02',
            action: 'inspect_scene',
            title: 'Keycard scanner tampered',
            description: 'The keycard scanner on the East Wing storage room has faint scratches around the casing — someone accessed it recently using an unofficial card copy.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_scene_01'
        },

        // ── CHECK CCTV ──────────────────────────────────────────
        {
            id: 'clue_cctv_01',
            action: 'check_cctv',
            title: 'East Wing camera blackout',
            description: 'The East Wing CCTV feed shows a clean 4-minute blackout starting at exactly 12:28 AM. The blackout was triggered using valid security credentials — not a technical fault.',
            pointsTo: null,
            prerequisite: null
        },
        {
            id: 'clue_cctv_02',
            action: 'check_cctv',
            title: 'Guard spotted near East Wing at 12:25 AM',
            description: 'Footage from the corridor camera (not East Wing) shows a figure in a security uniform matching Marcus Holt\'s build walking toward the East Wing at 12:25 AM — three minutes before the blackout.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_cctv_01'
        },
        {
            id: 'clue_cctv_03',
            action: 'check_cctv',
            title: 'Fire exit door opened at 12:34 AM',
            description: 'The fire exit camera — on a separate, non-disabled system — shows the door opening at 12:34 AM. A rectangular shape consistent with a framed painting is briefly visible before the door closes.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_cctv_02'
        },

        // ── ANALYZE PHONE LOGS ──────────────────────────────────
        {
            id: 'clue_phone_01',
            action: 'analyze_phone',
            title: 'Holt made a call during the blackout',
            description: 'Marcus Holt\'s phone records show an outgoing call at 12:31 AM — during the camera blackout — lasting 94 seconds to an unlisted prepaid number.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_cctv_01'  // Phone logs only become suspicious after CCTV blackout is known
        },
        {
            id: 'clue_phone_02',
            action: 'analyze_phone',
            title: 'Prepaid number linked to known fence',
            description: 'The unlisted number has appeared in two prior theft investigations. It is associated with an underground art broker known to move stolen pieces across borders.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_phone_01'
        },
        {
            id: 'clue_phone_03',
            action: 'analyze_phone',
            title: 'Diana called security desk at 11:47 PM',
            description: 'Diana Reeves called the internal security desk at 11:47 PM — consistent with her claim about reporting a water leak. The call lasted 22 seconds.',
            pointsTo: null,  // Supports Diana's alibi — red herring resolution
            prerequisite: null
        },

        // ── INTERROGATE SUSPECTS ────────────────────────────────
        {
            id: 'clue_interrogate_diana_01',
            action: 'interrogate',
            suspectId: 'suspect_01',
            title: 'Diana tenses up about East Wing cameras',
            description: 'When asked specifically about the East Wing camera system, Diana breaks eye contact briefly and takes a long pause before answering. She knows more than she\'s letting on — but about what?',
            pointsTo: null,  // Red herring — she\'s nervous but not guilty
            prerequisite: null
        },
        {
            id: 'clue_interrogate_diana_02',
            action: 'interrogate',
            suspectId: 'suspect_01',
            title: 'Diana confirms Holt had camera access',
            description: 'Under further questioning, Diana confirms that Marcus Holt was one of only three staff members with credentials to access the camera control system. She assumed it was standard protocol.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_cctv_01'
        },
        {
            id: 'clue_interrogate_holt_01',
            action: 'interrogate',
            suspectId: 'suspect_02',
            title: 'Holt\'s patrol route doesn\'t add up',
            description: 'Holt claims he was in the West Wing from 11:30 PM to 1:00 AM, but the West Wing sign-in log shows no entry for him that night. When pressed, he says "the log system was down."',
            pointsTo: 'suspect_02',
            prerequisite: null
        },
        {
            id: 'clue_interrogate_holt_02',
            action: 'interrogate',
            suspectId: 'suspect_02',
            title: 'Holt changes his story when shown CCTV',
            description: 'Shown the corridor footage timestamp, Holt\'s composure cracks. He initially denies it\'s him, then says he "may have walked past" but "didn\'t enter." His hands are visibly shaking.',
            pointsTo: 'suspect_02',
            prerequisite: 'clue_cctv_01'
        },
        {
            id: 'clue_interrogate_priya_01',
            action: 'interrogate',
            suspectId: 'suspect_03',
            title: 'Priya knew the painting\'s new valuation',
            description: 'Priya confirms she appraised the painting two weeks ago at £2.3 million — triple its insured value. She seems irritated by the question, not anxious. Her alibi holds up under basic questioning.',
            pointsTo: null,
            prerequisite: null
        },
        {
            id: 'clue_interrogate_leo_01',
            action: 'interrogate',
            suspectId: 'suspect_04',
            title: 'Leo mentions the faulty side door',
            description: 'Leo volunteers that the gallery\'s east side door has a faulty latch he reported last week. He seems genuinely concerned — not like someone trying to create a cover story after the fact.',
            pointsTo: null,
            prerequisite: null
        }
    ],

    // ── REASONING RUBRIC ──────────────────────────────────────────
    // Used by verdictEngine.js to generate meaningful feedback.
    // keyEvidence: clues that, if found, strongly point to the guilty party
    // redHerrings: clues that seem suspicious but don't indicate guilt
    keyEvidence: [
        'clue_cctv_01',
        'clue_cctv_02',
        'clue_phone_01',
        'clue_interrogate_holt_02'
    ],
    redHerrings: [
        'clue_interrogate_diana_01',
        'clue_interrogate_priya_01'
    ],

    // ── SOLUTION SUMMARY ──────────────────────────────────────────
    // Shown to player after verdict regardless of outcome.
    solutionSummary: `Marcus Holt, the night security guard, used his legitimate access credentials
to disable the East Wing cameras at 12:28 AM. He had previously obtained a copy of the storage
room keycard. He removed the painting and exited via the fire door at 12:34 AM, where an
accomplice was waiting. The phone call at 12:31 AM was to confirm the handoff. Holt had been
approached six weeks earlier by an underground art broker and agreed to the theft in exchange
for £40,000 — enough to cover his debts and disappear.`
};