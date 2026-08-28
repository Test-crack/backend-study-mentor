# Spoken English diagnostic viva — draft new prompt versions (for Sarthak review)

Draft only — not seeded. One new version per existing sequence slot (1–7), matching
the style/difficulty/timing already live for that slot. Audio not recorded yet;
`audio_url` is a placeholder path following the existing naming convention.

---

## Slot 1 · Warm-up (audio, version 3)

> "Hi, thanks for joining. Let's get started — could you tell me your name, the city
> you live in, and one thing you enjoy doing on your day off?"

- `prep_seconds: 0`, `speak_seconds: 45`, `is_warmup: true`, `display: audio`
- `min_words: 5`
- audio path: `/diagnostics/spoken-english/Prompt_1_Introductions/se_diag_v3_p1_stimulus.wav`

---

## Slot 2 · Read-aloud (text, version 3) — scored on phonology + fluency only

> "Learning a new language becomes easier when you practise speaking every day and
> are not afraid of making mistakes along the way."

- `prep_seconds: 20`, `speak_seconds: 60`, `display: text`
- `scored_subskills: ["phonology","fluency"]`
- `min_words: 8`
- audio path (grader reference recording): `/diagnostics/spoken-english/Prompt_2_ReadAloud/se_diag_v3_p2_stimulus.wav`

---

## Slot 3 · Narration (audio, version 3)

> "Think about a time you learned a new skill or hobby. Describe what it was, how you
> learned it, and what was the hardest part about getting started."

- `prep_seconds: 15`, `speak_seconds: 75`, `display: audio`
- `min_words: 25`
- audio path: `/diagnostics/spoken-english/Prompt_3_Narrative/se_diag_v3_p3_stimulus.wav`

---

## Slot 4 · Opinion (audio, version 3)

> "Some people think social media has made communication easier and more connected,
> while others think it has made people more isolated. What is your opinion, and why?"

- `prep_seconds: 20`, `speak_seconds: 90`, `display: audio`
- `min_words: 25`
- audio path: `/diagnostics/spoken-english/Prompt_4_Opinion/se_diag_v3_p4_stimulus.wav`

---

## Slot 5 · Workplace / functional roleplay (audio, version 3)

> "You booked a hotel room for a work trip, but on arrival the hotel says they have no
> record of your booking and the property is fully occupied. Call the reservations
> desk, explain the situation calmly, and ask them to resolve it immediately."

- `prep_seconds: 20`, `speak_seconds: 90`, `display: audio`
- `min_words: 25`
- audio path: `/diagnostics/spoken-english/Prompt_5_Workplace/se_diag_v3_p5_stimulus.wav`

---

## Slot 6 · Voice message reply (audio, version 6) — needs Responsiveness evidence

> Message the student hears: "Hey, quick question — I've been asked to relocate to
> our company's branch in another country for two years. It's a huge opportunity and
> the package is great, but I'd be far from my parents, who aren't in the best health.
> I don't know what to prioritise. What would you tell me to do?"

- `prep_seconds: 20`, `speak_seconds: 90`, `display: audio`, `listen_first: true`
- `min_words: 25`
- audio path: `/diagnostics/spoken-english/Prompt_6_VoiceMessage/se_diag_v6_p6_stimulus.wav`

---

## Slot 7 · Proposal (audio, version 3)

> "Your neighbourhood has seen a rise in complaints about noise and litter in the local
> park during weekends. Present a structured proposal to your residents' association
> outlining two practical changes to fix this."

- `prep_seconds: 25`, `speak_seconds: 105`, `display: audio`
- `min_words: 25`
- audio path: `/diagnostics/spoken-english/Prompt_7_Proposal/se_diag_v3_p7_stimulus.wav`

---

## Open questions for Sarthak

1. Do all 7 slots actually need a 3rd (or 6th, for slot 6) version now, or should we
   prioritise specific slots?
2. Who records the audio and on what timeline — content team, per the implementation
   plan?
3. Should we also revisit the missing 8th prompt (`se_p8`, "Abstract" task) that exists
   in `src/services/viva/prompts/spokenEnglish.ts` but was never seeded into
   `diagnostic_questions`? Separate decision, flagging here so it isn't lost.
