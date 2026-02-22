# Feature Implementation Plan: Reading & Spoken English Practice

This document provides a detailed implementation plan for the new student practice modules. The goal is to create high-engagement, "Lovable-style" interfaces that are clean, focused, and interactive, while adhering to the core Testcrack design system.

---

## 1. Design Philosophy & Theme

* **Lovable-Style UX:** Minimalist, distraction-free, smooth animations (framer-motion), and immediate micro-interactions.
* **Testcrack Branding:**
  * **Primary Color:** Use the existing Testcrack brand color (e.g., deep purple or brand specific hex) for primary actions and accents.
  * **Typography:** Maintain the site's current font stack (Inter/Roboto) but use larger, friendlier weights for headers in these tools.
  * **Layout:** "Zen Mode" – when a user enters these tools, the standard complex navigation sidebar should collapse or disappear to focus attention.

---

## 2. Reading Practice Module

**Route:** `/student/reading-practice`

### UI/UX Specifications

1. **Selection Screen:**
    * Card-based layout to choose a topic/passage.
    * **Filters:** Difficulty (Beginner, Intermediate, Advanced), Genre (Science, Fiction, History).
    * **Micro-interaction:** Cards lift and glow on hover.
2. **Reading Interface (The "Zen" Reader):**
    * **Layout:** Single column, centered text, maximum width 700px for optimal readability.
    * **Progress:** A subtle progress bar at the top indicating reading progress (scroll-based).
    * **Smart Highlighting:**
        * User can toggle "Guide Mode" which highlights the current sentence or paragraph in a soft brand-tinted background.
        * **Tech:** `IntersectionObserver` to track which paragraph is in view.
3. **Interactive Comprehension (The "Chat" Sidebar):**
    * Instead of a static quiz at the bottom, questions appear in a collapsible right sidebar.
    * **Trigger:** As the user scrolls past a key section, a small floating bubble "🤔 Quick Question" appears. Clicking it opens the sidebar.
    * **Format:** Chat-style interface. System asks a question, User selects an option, System responds immediately with "Correct! Because..." or "Not quite...".

### Frontend Technical Requirements

* **State Management (Zustand/Context):**
  * `scrollPosition`: Track percentage read.
  * `wpm`: Calculate Words Per Minute based on time spent vs. word count.
  * `focusState`: Listen to `window.onblur` to track if the student switched tabs (integrity metric).
* **Components:**
  * `<PassageViewer />`: Renders markdown/text with intersection observers.
  * `<ComprehensionChat />`: Handles the Q&A flow.

### Analytics to Capture

* **WPM (Words Per Minute):** Real-time calculation.
* **Comprehension Score:** % of questions answered correctly.
* **Focus Ratio:** (Time active / Total time) * 100.

---

## 3. Spoken English Practice Module

**Route:** `/student/spoken-english`

### UI/UX Specifications

1. **Scenario Selection:**
    * "Choose your adventure" style cards (e.g., "At the Cafe", "Job Interview", "Introducing Yourself").
    * Each scenario has a fun 3D or flat illustration.
2. **Conversation Interface:**
    * **Visuals:** Similar to Siri/Google Assistant – a dynamic audio waveform visualization in the center.
    * **Flow:**
        * **AI Turn:** The AI character speaks (text displayed + audio plays). The waveform animates in the "AI Color" (e.g., Teal).
        * **User Turn:** A large microphone button pulses. User holds to speak. Waveform animates in "User Color" (e.g., Brand Purple).
    * **Feedback Loop:**
        * Immediately after speaking, the user's text is transcribed.
        * **Correction UI:** Mispronounced words are underlined in red. Tapping them plays the correct pronunciation.
        * **Score:** A simple "Integrity Meter" or ring showing Pronunciation Score (0-100%).

### Frontend Technical Requirements

* **Audio Handling:**
  * `MediaRecorder` API to capture microphone input.
  * **Visualizer:** Use `Canvas API` or a library like `react-audio-visualize` to drive the waveform from the audio stream.
* **APIs:**
  * **TTS (Text-to-Speech):** Browser's native `SpeechSynthesis` (MVP) or AWS Polly/Google Cloud TTS (Premium).
  * **STT (Speech-to-Text):** Send audio blob to backend -> Whisper API -> Return transcript + timestamps.

### Analytics to Capture

* **Pronunciation Score:** % match of phonemes.
* **Fluency:** Words spoken per minute without long pauses.
* **Confidence:** Derived from volume consistency and hesitation count.

---

## 4. Dashboard Integration (Analytics)

### Student Dashboard (`/student/dashboard`)

* **New Section:** "My Skills Growth"
* **Charts:**
  * Line chart: Reading Speed (WPM) over time.
  * Radar chart: Speaking Skills (Fluency, Pronunciation, Vocabulary, Grammar).
  * **Implementation:** Recharts or Chart.js wrapped in a dashboard card component.

### Instructor Dashboard (`/instructor/dashboard`)

* **Class Overview:**
  * Table columns added: "Avg WPM", "Speaking Fluency".
  * **"At Risk" Highlight:** Students with WPM < X or Fluency < Y are flagged red.
* **Drill-down:** Clicking a student shows their specific session history (e.g., "Practiced 'Job Interview' - Score 85%").

### Institute Dashboard (`/institute/dashboard`)

* **High-Level KPI Widgets:**
  * "Total Reading Hours" (This Month).
  * "English Proficiency Improvement" (Avg pre-test vs current).
  * **Leaderboard:** Top performing classes/instructors based on practice engagement.

---

## 5. Development Roadmap

1. **Scaffold Routes:** Create the empty page shells/layouts.
2. **Build "Zen Reader" Component:** Implement text rendering and scroll tracking.
3. **Build Audio Visualizer:** Create the recording interface for Spoken English.
4. **Connect Backend:** Hook up `/submit` endpoints for data persistence.
5. **Build Analytics Widgets:** Create the chart components for the dashboards.
