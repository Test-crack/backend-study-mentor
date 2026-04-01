export type DiagnosticLevel = 'A' | 'B' | 'C';

export interface QuestionDef {
  id: string;
  type: 'mcq' | 'tfng';
  text: string;
  options?: string[];
  answer_key?: string;
}

export interface ListeningData {
  audio_url: string;
  questions: QuestionDef[];
}

export interface ReadingData {
  passage: string;
  questions: QuestionDef[];
}

export interface WritingData {
  topic: string;
  image_url?: string;
  minWords: number;
}

export interface SpeakingData {
  prompts: string[];
}

export interface DiagnosticSet {
  listening: ListeningData;
  reading: ReadingData;
  writing: WritingData;
  speaking: SpeakingData;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO SCRIPTS (for reference when recording / sourcing audio files)
//
// LEVEL A — Hotel booking telephone conversation (~2 min, slow clear speech)
//   Receptionist: "Good morning, Riverside Hotel. How can I help you?"
//   Caller: "Hello. I'd like to book a room, please."
//   Receptionist: "Of course. How many nights will you be staying?"
//   Caller: "Three nights, please. From Friday the fourteenth of March."
//   Receptionist: "Let me check... yes, we have a double room available. That's
//     eighty-five pounds per night."
//   Caller: "Does that include breakfast?"
//   Receptionist: "Yes, breakfast is included in the room price."
//   Caller: "Great. Does the hotel have a swimming pool?"
//   Receptionist: "Yes, the pool is open daily. It closes at nine o'clock in
//     the evening."
//   Caller: "And what about parking?"
//   Receptionist: "Free parking is available in our car park on level two."
//
// LEVEL B — University lecturer announcing a group assignment (~3 min, natural pace)
//   Lecturer: "Right, I want to go over the details for your group research
//     project. The submission deadline is the fifteenth of November — that's a
//     firm date, so please plan accordingly. Each group must have between four
//     and five members; no exceptions. Your final presentation should run for
//     exactly twenty minutes. All academic sources you cite must be from the
//     last ten years — anything older will not be accepted. I need you to email
//     me your confirmed group lists by this Friday at the latest. And I should
//     warn you — late submissions will be penalised ten percent per day, so
//     please don't leave things to the last minute."
//
// LEVEL C — Two academics discussing a research paper (~4 min, fast natural speech,
//   overlapping, technical vocabulary)
//   Dr Marsh: "What struck me most about the methodology was the use of a
//     longitudinal cohort design — very robust over the fifteen-year period."
//   Dr Okafor: "Agreed, and the headline figure — that attention spans declined
//     by forty percent — is striking, though I think the more nuanced finding
//     is the distinction between passive scrolling and active engagement. The
//     data consistently show passive consumption is significantly more
//     detrimental."
//   Dr Marsh: "That said, my concern is the familiar correlation-causation
//     problem. We cannot simply attribute the decline to social media use
//     without ruling out concurrent variables."
//   Dr Okafor: "Fair point. I'd advocate for rolling out digital literacy
//     programmes in schools as a near-term intervention while the causal
//     picture is clarified."
//   Dr Marsh: "The next phase of the research is a cross-cultural comparison
//     study — that should tell us a great deal more."
// ─────────────────────────────────────────────────────────────────────────────

export const diagnosticQuestionSets: Record<DiagnosticLevel, DiagnosticSet> = {

  // ═══════════════════════════════════════════════════════
  // LEVEL A  ·  IELTS Band 3–4  ·  Beginner / Elementary
  // ═══════════════════════════════════════════════════════
  A: {
    listening: {
      audio_url: "/diagnostics/audio/Level-A.mp3",
      questions: [
        {
          id: "A-L-1",
          type: "mcq",
          text: "How many nights does the caller want to book?",
          options: ["A. Two nights", "B. Three nights", "C. Four nights", "D. Five nights"],
          answer_key: "B"
        },
        {
          id: "A-L-2",
          type: "mcq",
          text: "What is the guest's check-in date?",
          options: [
            "A. Thursday the thirteenth",
            "B. Friday the fourteenth",
            "C. Saturday the fifteenth",
            "D. Sunday the sixteenth"
          ],
          answer_key: "B"
        },
        {
          id: "A-L-3",
          type: "mcq",
          text: "How much does a room cost per night?",
          options: ["A. £75", "B. £80", "C. £85", "D. £90"],
          answer_key: "C"
        },
        {
          id: "A-L-4",
          type: "mcq",
          text: "What is included in the room price?",
          options: ["A. Dinner", "B. Lunch", "C. Breakfast", "D. All meals"],
          answer_key: "C"
        },
        {
          id: "A-L-5",
          type: "mcq",
          text: "What time does the hotel swimming pool close?",
          options: ["A. 8:00 PM", "B. 8:30 PM", "C. 9:00 PM", "D. 10:00 PM"],
          answer_key: "C"
        },
        {
          id: "A-L-6",
          type: "mcq",
          text: "On which level is the hotel car park located?",
          options: ["A. Level 1", "B. Level 2", "C. Level 3", "D. Level 4"],
          answer_key: "B"
        }
      ]
    },

    reading: {
      passage:
        "Coffee is one of the most popular beverages in the world. It is produced from " +
        "roasted coffee beans, which are the seeds of berries from the Coffea plant. Brazil " +
        "is currently the world's largest producer of coffee, supplying approximately one-third " +
        "of all coffee consumed globally. The two most widely consumed varieties are Arabica and " +
        "Robusta. Arabica beans are prized for their smooth, mild flavour, while Robusta beans " +
        "contain significantly more caffeine and have a stronger, more bitter taste. Coffee houses " +
        "first appeared in the Middle East during the fifteenth century and gradually spread to " +
        "Europe during the seventeenth century.",
      questions: [
        {
          id: "A-R-1",
          type: "tfng",
          text: "Coffee beans are the seeds of the Coffea plant.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "A"
        },
        {
          id: "A-R-2",
          type: "tfng",
          text: "Brazil supplies more than half of the world's coffee.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        },
        {
          id: "A-R-3",
          type: "tfng",
          text: "Arabica beans contain more caffeine than Robusta beans.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        },
        {
          id: "A-R-4",
          type: "tfng",
          text: "Coffee houses reached Europe before the seventeenth century.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        }
      ]
    },

    writing: {
      topic:
        "Describe a celebration or festival that is important in your culture. " +
        "Include details about when it takes place, how people celebrate it, and why it is " +
        "meaningful to you personally.",
      minWords: 150
    },

    speaking: {
      prompts: [
        "Tell me about the area where you grew up. What was it like?",
        "What do you usually enjoy doing in the evenings or at weekends?",
        "How important is exercise to you in your daily life, and why?"
      ]
    }
  },

  // ═══════════════════════════════════════════════════════
  // LEVEL B  ·  IELTS Band 5–6  ·  Intermediate
  // ═══════════════════════════════════════════════════════
  B: {
    listening: {
      audio_url: "/diagnostics/audio/Level-B.mp3",
      questions: [
        {
          id: "B-L-1",
          type: "mcq",
          text: "What is the submission deadline for the group project?",
          options: [
            "A. 5th November",
            "B. 10th November",
            "C. 15th November",
            "D. 20th November"
          ],
          answer_key: "C"
        },
        {
          id: "B-L-2",
          type: "mcq",
          text: "How many members must each group have?",
          options: ["A. 3–4 members", "B. 4–5 members", "C. 5–6 members", "D. 6–7 members"],
          answer_key: "B"
        },
        {
          id: "B-L-3",
          type: "mcq",
          text: "How long should the final presentation be?",
          options: [
            "A. 15 minutes",
            "B. 20 minutes",
            "C. 25 minutes",
            "D. 30 minutes"
          ],
          answer_key: "B"
        },
        {
          id: "B-L-4",
          type: "mcq",
          text: "How recent must the academic sources be?",
          options: [
            "A. Last 5 years",
            "B. Last 8 years",
            "C. Last 10 years",
            "D. Last 15 years"
          ],
          answer_key: "C"
        },
        {
          id: "B-L-5",
          type: "mcq",
          text: "By when must students email their confirmed group lists?",
          options: [
            "A. Wednesday",
            "B. Thursday",
            "C. Friday",
            "D. The following Monday"
          ],
          answer_key: "C"
        },
        {
          id: "B-L-6",
          type: "mcq",
          text: "What penalty applies to late submissions?",
          options: [
            "A. 5% deducted per day",
            "B. 10% deducted per day",
            "C. 15% deducted per day",
            "D. An automatic fail"
          ],
          answer_key: "B"
        }
      ]
    },

    reading: {
      passage:
        "The global shift towards renewable energy has accelerated significantly over the past " +
        "decade. Solar power, in particular, has undergone a dramatic reduction in cost, with the " +
        "price of photovoltaic panels falling by approximately 89% between 2010 and 2020. Wind " +
        "energy has similarly expanded, with offshore wind farms now capable of generating " +
        "electricity for millions of households. Despite these advances, critics argue that " +
        "renewable sources cannot provide the consistent baseload power required by modern " +
        "electrical grids without substantial investment in energy storage technology. Several " +
        "governments have responded by subsidising large-scale battery storage projects, though " +
        "environmental concerns surrounding the extraction of lithium for these batteries remain " +
        "largely unresolved.",
      questions: [
        {
          id: "B-R-1",
          type: "tfng",
          text: "The cost of solar panels fell by nearly 90% during the decade from 2010 to 2020.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "A"
        },
        {
          id: "B-R-2",
          type: "tfng",
          text: "Offshore wind farms can currently generate power for billions of households.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        },
        {
          id: "B-R-3",
          type: "tfng",
          text: "Critics believe renewable energy can reliably meet baseload demands without additional storage.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        },
        {
          id: "B-R-4",
          type: "tfng",
          text: "Governments have been internationally criticised for funding battery storage projects.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "C"
        }
      ]
    },

    writing: {
      topic:
        "The graph below shows the percentage of households in four countries that owned at " +
        "least one computer between 2000 and 2015. Summarise the information by selecting and " +
        "reporting the main features, and make comparisons where relevant.",
      image_url:
        "https://placehold.co/640x320/eef2ff/4338ca?text=Line+Graph+%E2%80%94+Household+Computer+Ownership+2000%E2%80%932015",
      minWords: 150
    },

    speaking: {
      prompts: [
        "Describe a time when you had to make an important decision. What was the situation?",
        "What factors did you consider before making that decision, and are you satisfied with the outcome?",
        "Do you think people today face more difficult decisions than previous generations? Why, or why not?"
      ]
    }
  },

  // ═══════════════════════════════════════════════════════
  // LEVEL C  ·  IELTS Band 7+  ·  Advanced / Academic
  // ═══════════════════════════════════════════════════════
  C: {
    listening: {
      audio_url: "/diagnostics/audio/Level-C.mp3",
      questions: [
        {
          id: "C-L-1",
          type: "mcq",
          text: "What type of study design was used in the research discussed?",
          options: [
            "A. Cross-sectional survey",
            "B. Longitudinal cohort study",
            "C. Randomised controlled trial",
            "D. Systematic meta-analysis"
          ],
          answer_key: "B"
        },
        {
          id: "C-L-2",
          type: "mcq",
          text: "By what percentage did attention spans decline over the study period?",
          options: ["A. 20%", "B. 30%", "C. 40%", "D. 50%"],
          answer_key: "C"
        },
        {
          id: "C-L-3",
          type: "mcq",
          text: "Which form of social media use was identified as more detrimental to attention?",
          options: [
            "A. Active posting and commenting",
            "B. Direct private messaging",
            "C. Content creation and uploading",
            "D. Passive scrolling and consumption"
          ],
          answer_key: "D"
        },
        {
          id: "C-L-4",
          type: "mcq",
          text: "What methodological concern is raised about the study's findings?",
          options: [
            "A. An insufficient sample size",
            "B. Conflating correlation with causation",
            "C. Undisclosed researcher bias",
            "D. Reliance on outdated measurement tools"
          ],
          answer_key: "B"
        },
        {
          id: "C-L-5",
          type: "mcq",
          text: "What near-term intervention does one speaker advocate for?",
          options: [
            "A. Legislated screen time limits",
            "B. Strengthened parental controls",
            "C. Digital literacy programmes in schools",
            "D. Government bans on social media for minors"
          ],
          answer_key: "C"
        },
        {
          id: "C-L-6",
          type: "mcq",
          text: "What will the next phase of the research involve?",
          options: [
            "A. Neuroimaging of adolescent participants",
            "B. A cross-cultural comparison study",
            "C. A larger domestic longitudinal sample",
            "D. Laboratory-based controlled experiments"
          ],
          answer_key: "B"
        }
      ]
    },

    reading: {
      passage:
        "Behavioural economics, which synthesises insights from cognitive psychology and " +
        "classical economic theory, has fundamentally challenged the long-standing assumption " +
        "of human rationality. The seminal work of Kahneman and Tversky introduced the concept " +
        "of cognitive heuristics — mental shortcuts that, while efficient under many conditions, " +
        "systematically distort judgement in predictable ways. Their Prospect Theory demonstrated " +
        "that individuals weight potential losses more heavily than equivalent gains, a phenomenon " +
        "termed loss aversion. This asymmetry has profound implications for policy design: " +
        "governments and institutions increasingly employ 'nudge' strategies to guide behaviour " +
        "without formally restricting freedom of choice. Critics, however, contend that nudge " +
        "interventions are inherently paternalistic and risk undermining individual autonomy. " +
        "Empirical evidence suggests that while nudges produce measurable effects in the short " +
        "term, their influence diminishes considerably once individuals become aware of their " +
        "application.",
      questions: [
        {
          id: "C-R-1",
          type: "tfng",
          text: "Classical economics traditionally assumed that human beings make rational decisions.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "A"
        },
        {
          id: "C-R-2",
          type: "tfng",
          text: "According to Prospect Theory, people value potential gains more highly than equivalent losses.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        },
        {
          id: "C-R-3",
          type: "tfng",
          text: "Nudge strategies are designed to guide behaviour while preserving freedom of choice.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "A"
        },
        {
          id: "C-R-4",
          type: "tfng",
          text: "Research confirms that nudge interventions maintain their effectiveness even after participants become aware of them.",
          options: ["A. True", "B. False", "C. Not Given"],
          answer_key: "B"
        }
      ]
    },

    writing: {
      topic:
        "Some people argue that economic growth should always take priority over environmental " +
        "protection. To what extent do you agree or disagree with this view? Give reasons for " +
        "your answer and include any relevant examples from your own knowledge or experience.",
      minWords: 250
    },

    speaking: {
      prompts: [
        "Describe a significant scientific or technological development you have read or heard about. Explain what it involves, why it is considered important, and how it may affect society in the future.",
        "To what extent do you believe governments should regulate emerging technologies such as artificial intelligence or genetic engineering?",
        "How do you think the tension between technological innovation and ethical responsibility should be managed in modern societies?"
      ]
    }
  }
};
