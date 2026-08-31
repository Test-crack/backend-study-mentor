// Spoken English diagnostic viva — the 8-prompt universal set (not level-tagged).
// Source: docs/spoken-english/spoken-english-rubric-and-content.md §5. The ladder
// spans A1→C1 in one sitting (1–3 answerable at A1–A2, 4–6 need B1, 7–8 need B2+),
// so a student's ceiling shows up naturally. Content, not code — editing this list
// changes the diagnostic; adding an exam adds its own prompt file (see registry.ts).
import { VivaPrompt } from '../types';

export const SPOKEN_ENGLISH_PROMPTS: VivaPrompt[] = [
  { id: 'se_p1', order: 1, type: 'Warm-up', isWarmup: true,
    text: "Tell us about yourself — your name, where you're from, and what you do.",
    prepSeconds: 0, speakSeconds: 45 },
  { id: 'se_p2', order: 2, type: 'Routine',
    text: 'Describe a typical day for you, from morning to evening.',
    prepSeconds: 10, speakSeconds: 60 },
  { id: 'se_p3', order: 3, type: 'Description',
    text: 'Describe a place you know well — your home, your neighbourhood, or your workplace. What does it look like, and what do you like about it?',
    prepSeconds: 15, speakSeconds: 75 },
  { id: 'se_p4', order: 4, type: 'Narration',
    text: 'Tell us about a journey or a day you remember clearly. What happened, and why has it stayed with you?',
    prepSeconds: 20, speakSeconds: 90 },
  { id: 'se_p5', order: 5, type: 'Opinion',
    text: 'If you could change one thing about the place you live, what would it be and why?',
    prepSeconds: 20, speakSeconds: 90 },
  { id: 'se_p6', order: 6, type: 'Reply task',
    // The student hears a ~20s voice message (a friend asking for advice about taking a
    // new job in another city) before replying. This is the only prompt that carries
    // real Responsiveness evidence — the audio asset is required (seeded by content).
    text: 'Listen to the voice message from your friend, then reply. Give them your advice and your reasons.',
    prepSeconds: 20, speakSeconds: 90, listenAssetUrl: '' },
  { id: 'se_p7', order: 7, type: 'Compare',
    text: 'Some people prefer learning in a classroom, others prefer learning online. Compare the two, and say which suits you better.',
    prepSeconds: 25, speakSeconds: 105 },
  { id: 'se_p8', order: 8, type: 'Abstract',
    text: 'Imagine you were put in charge of education in your state for one year. What would you change — and what do you think would be difficult about actually doing it?',
    prepSeconds: 30, speakSeconds: 120 },
];
