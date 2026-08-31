// Spoken English viva rubric (from Paul's rubric pack, 2026-08).
// Data only — feeds the generic pipeline. `interaction` is the internal id; it is
// graded as "Responsiveness" in v1 (record-and-submit has no live interlocutor).
import { VivaRubric } from '../types';

export const SPOKEN_ENGLISH_RUBRIC: VivaRubric = {
  examId: 'spoken_english',
  scaleId: 'cefr_6',

  // §3 — CEFR level → 0–100 score (GSE 10–90 space, used directly).
  levelToScore: {
    below_a1: 15, a1: 25, a2: 33, 'a2+': 39, b1: 46, 'b1+': 54,
    b2: 62, 'b2+': 71, c1: 80, c2: 87,
  },

  // §4 — guardrails.
  guardrails: {
    minWords: 5,
    shortWords: 25,
    shortCap: 'a2',
    offTopicCap: 'a2',
    offTopicCappedSubskills: ['interaction', 'coherence'],
    withholdNoResponseCount: 4,
  },

  // §2 — 6 subskills × level descriptors (condensed; drive the competence grader prompt).
  subskills: [
    {
      id: 'range', label: 'Range',
      descriptors: {
        below_a1: 'Isolated words, memorised fragments; cannot form a clause.',
        a1: 'Basic phrases about self/family/surroundings; heavy repetition.',
        a2: 'Enough for routine everyday topics; simple sentences, mostly present, joined with and/but/because.',
        b1: 'Talks about familiar topics without obvious word-search; plain, repetitive on unfamiliar ground; can opine/describe/narrate.',
        b2: 'Broad range to describe/argue/explain without conspicuous searching; varied structures; some idiom.',
        c1: 'Wide range, flexible reformulation; fine shades of meaning; little restriction.',
        c2: 'Full flexibility; precise, idiomatic, effortless reformulation.',
      },
    },
    {
      id: 'accuracy', label: 'Accuracy',
      descriptors: {
        below_a1: 'No systematic grammar.',
        a1: 'A few memorised patterns; systematic basic errors throughout.',
        a2: 'Simple structures mostly correct; basic errors (tense/agreement/articles/prepositions) but meaning usually clear.',
        b1: 'Reasonable control of common structures; errors under pressure/complexity but rarely obscure meaning.',
        b2: 'Good control; occasional, non-systematic, often self-corrected errors; no misunderstanding.',
        c1: 'Consistently high accuracy; rare, hard-to-spot errors.',
        c2: 'Consistent control of complex language even while multitasking.',
      },
    },
    {
      id: 'fluency', label: 'Fluency',
      descriptors: {
        below_a1: 'Cannot sustain speech.',
        a1: 'Very short isolated utterances; heavy pausing, frequent restarts.',
        a2: 'Understood in short turns; pausing/hesitation/reformulation very evident.',
        b1: 'Keeps going comprehensibly; pausing for grammar/vocab noticeable in longer stretches.',
        b2: 'Fairly even tempo; few long pauses; hesitation doesn’t strain the listener.',
        c1: 'Fluent and spontaneous; almost effortless; only hard content slows delivery.',
        c2: 'Natural, effortless, well-paced throughout.',
      },
    },
    {
      id: 'interaction', label: 'Responsiveness',
      descriptors: {
        below_a1: 'Response bears no relation to the prompt.',
        a1: 'Answers only the most literal part, in a word/phrase.',
        a2: 'Answers partially — misses a sub-part or answers a simpler question; little listener orientation.',
        b1: 'Answers the whole question; some signposting; register broadly appropriate.',
        b2: 'Fully addresses the prompt incl. implied parts; clear listener orientation — frames, signposts, closes the turn.',
        c1: 'Handles with nuance; anticipates listener needs; adjusts register naturally.',
        c2: 'Complete control; shapes the response around the listener throughout.',
      },
    },
    {
      id: 'coherence', label: 'Coherence',
      descriptors: {
        below_a1: 'No connected discourse.',
        a1: 'Words/phrases linked with basic connectors (and, then).',
        a2: 'Links a short sequence into a simple, mostly linear account.',
        b1: 'Clear connected discourse; sequencing may jump, linking can be repetitive.',
        b2: 'Clear, well-structured; range of linking/organisational devices; ideas develop logically.',
        c1: 'Controlled organisational patterns and cohesive devices; smooth, well-shaped.',
        c2: 'Coherent and cohesive throughout with full control of structuring devices.',
      },
    },
    {
      id: 'phonology', label: 'Phonological Control',
      descriptors: {
        below_a1: 'Unintelligible.',
        a1: 'Limited repertoire understandable only with effort from a sympathetic listener.',
        a2: 'Generally intelligible despite noticeable accent; listener sometimes needs repetition.',
        b1: 'Clearly intelligible throughout; accent evident; some sounds/stress mispronounced.',
        b2: 'Clear, natural pronunciation/intonation; accent present but doesn’t affect intelligibility.',
        c1: 'Varies intonation and stress to express fine shades of meaning.',
        c2: 'Full range of phonological features with high control (stress, rhythm, intonation).',
      },
    },
  ],
};

// Grader guidance carried into the prompt (accent/Indian-English fairness — §2 notes).
export const SPOKEN_ENGLISH_GRADER_NOTES = [
  'Do not penalise standard Indian English usage (e.g. "I am having a doubt", "do the needful", present continuous for habitual). Penalise only what would impede a non-Indian listener.',
  'Accent is NOT an error. Score intelligibility and prosody, never accent proximity to a British/American norm. A strong regional accent that is fully intelligible is B2.',
  'Score each subskill independently on its own evidence. Half-steps (a2+, b1+, b2+) are allowed. Do not average in your head.',
].join(' ');
