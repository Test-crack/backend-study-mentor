export type DiagnosticLevel = 'A' | 'B' | 'C';

export interface QuestionDef {
  id: string;
  type: 'mcq' | 'tfng';
  text: string;
  options?: string[]; // strings like "A. ...", "B. ..."
  answer_key?: string; // e.g. "A"
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

export const diagnosticQuestionSets: Record<DiagnosticLevel, DiagnosticSet> = {
  A: {
    listening: {
      audio_url: "/diagnostis/audio/Level-A.mp3",
      questions: [
        { id: "A-L-1", type: "mcq", text: "What time is the appointment?", options: ["A. 9:00 AM", "B. 9:30 AM", "C. 10:00 AM", "D. 10:30 AM"], answer_key: "C" },
        { id: "A-L-2", type: "mcq", text: "What is the patient's main complaint?", options: ["A. Headache", "B. Fever", "C. Toothache", "D. Back pain"], answer_key: "A" },
        { id: "A-L-3", type: "mcq", text: "How long should the patient wait?", options: ["A. 10 minutes", "B. 15 minutes", "C. 20 minutes", "D. 30 minutes"], answer_key: "C" },
        { id: "A-L-4", type: "mcq", text: "What room number is the doctor in?", options: ["A. 12", "B. 21", "C. 32", "D. 42"], answer_key: "D" },
        { id: "A-L-5", type: "mcq", text: "What does the patient need to sign?", options: ["A. Medical history", "B. Consent form", "C. Receipt", "D. Prescription"], answer_key: "B" },
        { id: "A-L-6", type: "mcq", text: "When is the clinic closed?", options: ["A. Tuesday", "B. Wednesday", "C. Saturday", "D. Sunday"], answer_key: "D" }
      ]
    },
    reading: {
      passage: "The history of the bicycle dates back to the early 19th century. Early models were made of wood and lacked pedals, requiring riders to push themselves along the ground using their feet. By the late 1800s, bicycles began to feature rubber tires and chain drives, dramatically improving speed and comfort.",
      questions: [
        { id: "A-R-1", type: "tfng", text: "The earliest bicycles were equipped with pedals.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" },
        { id: "A-R-2", type: "tfng", text: "Early models were constructed entirely from metal.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" },
        { id: "A-R-3", type: "tfng", text: "Rubber tires were introduced before chain drives.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "C" },
        { id: "A-R-4", type: "tfng", text: "Chain drives improved the speed of bicycles.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "A" }
      ]
    },
    writing: {
      topic: "Describe your hometown. Include details about its size, climate, and what you like most about it.",
      minWords: 150
    },
    speaking: {
      prompts: [
        "What is your name?",
        "Do you work or are you a student?",
        "Describe a hobby you enjoy doing in your free time."
      ]
    }
  },
  B: {
    listening: {
      audio_url: "/diagnostis/audio/Level-B.mp3",
      questions: [
        { id: "B-L-1", type: "mcq", text: "What is the main purpose of the new policy?", options: ["A. Reduce costs", "B. Increase productivity", "C. Improve safety", "D. Enhance employee welfare"], answer_key: "C" },
        { id: "B-L-2", type: "mcq", text: "How often will the training sessions be held?", options: ["A. Weekly", "B. Bi-weekly", "C. Monthly", "D. Annually"], answer_key: "C" },
        { id: "B-L-3", type: "mcq", text: "Who will be leading the workshops?", options: ["A. External consultants", "B. Senior management", "C. HR representatives", "D. Team leaders"], answer_key: "A" },
        { id: "B-L-4", type: "mcq", text: "Where will the initial meeting take place?", options: ["A. Boardroom", "B. Cafeteria", "C. Main hall", "D. Online"], answer_key: "C" },
        { id: "B-L-5", type: "mcq", text: "What is the deadline for submitting feedback?", options: ["A. End of the day", "B. Friday", "C. End of the month", "D. Next week"], answer_key: "B" },
        { id: "B-L-6", type: "mcq", text: "What will happen if employees don't attend?", options: ["A. Disciplinary action", "B. Rescheduling is required", "C. Nothing", "D. Pay deduction"], answer_key: "B" }
      ]
    },
    reading: {
      passage: "Urban green spaces have proven to be dramatically beneficial for residents. A study in Singapore revealed a negative correlation between proximity to parks and stress levels among adults. Furthermore, the integration of green roofs in modern architecture has significantly reduced the urban heat island effect, dropping local temperatures by up to 2 degrees Celsius.",
      questions: [
        { id: "B-R-1", type: "tfng", text: "Adults living near parks generally exhibit lower stress levels.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "A" },
        { id: "B-R-2", type: "tfng", text: "Green roofs are primarily designed to reduce construction costs.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" },
        { id: "B-R-3", type: "tfng", text: "Urban heat islands only affect cities in Southeast Asia.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "C" },
        { id: "B-R-4", type: "tfng", text: "Green roofs can lower local temperatures by a maximum of 2 degrees Celsius.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "A" }
      ]
    },
    writing: {
      topic: "The chart below shows the amount of money spent on fast food in the USA from 1990 to 2012. Summarize the information and make comparisons where relevant.",
      image_url: "https://placehold.co/600x300/eef2ff/4338ca?text=Bar+Chart+%E2%80%94+Fast+Food+Spending",
      minWords: 150
    },
    speaking: {
      prompts: [
        "Describe a challenging situation you faced recently.",
        "How did you overcome it?",
        "Do you think technology makes our lives more or less stressful overall?"
      ]
    }
  },
  C: {
    listening: {
      audio_url: "/diagnostis/audio/Level-C.mp3",
      questions: [
        { id: "C-L-1", type: "mcq", text: "What methodological flaw does the speaker identify?", options: ["A. Sample size", "B. Selection bias", "C. Outdated metrics", "D. Confirmation bias"], answer_key: "B" },
        { id: "C-L-2", type: "mcq", text: "The phenomenon discussed was first documented in which decade?", options: ["A. 1960s", "B. 1970s", "C. 1980s", "D. 1990s"], answer_key: "D" },
        { id: "C-L-3", type: "mcq", text: "Which academic discipline heavily relies on this theory?", options: ["A. Sociology", "B. Anthropology", "C. Economics", "D. Neuroscience"], answer_key: "C" },
        { id: "C-L-4", type: "mcq", text: "What does the speaker predict will happen within ten years?", options: ["A. Model collapse", "B. Exponential iteration", "C. Paradigm shift", "D. Complete irrelevance"], answer_key: "C" },
        { id: "C-L-5", type: "mcq", text: "Who was the primary author of the revised paper?", options: ["A. Dr. Vance", "B. Dr. Chen", "C. Dr. Simmons", "D. Dr. Al-Fayed"], answer_key: "A" },
        { id: "C-L-6", type: "mcq", text: "The speaker implies that the next phase of research will require...", options: ["A. More funding", "B. Cross-disciplinary collaboration", "C. Government oversight", "D. Private sector involvement"], answer_key: "B" }
      ]
    },
    reading: {
      passage: "Quantum entanglement defies Newtonian mechanics by demonstrating non-locality. When pairs of particles are generated in a correlated state, the quantum state of each cannot be described independently of the other, even when separated by vast distances. Einstein famously disparaged this phenomenon as 'spooky action at a distance', yet subsequent Bell test experiments have conclusively proven its existence.",
      questions: [
        { id: "C-R-1", type: "tfng", text: "Quantum entanglement adheres strictly to the laws of Newtonian mechanics.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" },
        { id: "C-R-2", type: "tfng", text: "Einstein initially embraced the concept of quantum non-locality.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" },                                                                        
        { id: "C-R-3", type: "tfng", text: "Bell test experiments confirmed Einstein's theoretical doubts.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" },
        { id: "C-R-4", type: "tfng", text: "Entangled particles must remain in close physical proximity to maintain their state.", options: ["A. True", "B. False", "C. Not Given"], answer_key: "B" }
      ]
    },
    writing: {
      topic: "To what extent do you agree or disagree that artificial intelligence will eventually replace human creativity in the arts?",
      minWords: 250
    },
    speaking: {
      prompts: [
        "Describe a piece of conceptual art that you have seen.",
        "How do you interpret its meaning?",
        "Discuss the role of abstract art in modern capitalist societies."
      ]
    }
  }
};
