# IELTS Reading Assessment Technical Flow

This document outlines the end-to-end flow for the IELTS Reading Assessment feature, utilizing the modular WebSocket and dynamic STT architecture.

## 1. Connection & Initialization

- **Global WebSocket**: Established upon user login and persists across the application.
- **Identity Tracking**: The backend maintains a mapping in `sqlite/.runtime.db` linking the `socket_id` to the `user_id`.

## 2. Dynamic Data Flow (Real-time)

### Initiation

- When a student selects a passage and starts the practice:
- **Frontend** sends a control message: `{"type": "START_STT", "feature": "READING_PRACTICE", "passageId": "..."}`.
- **Backend** initializes the Google Cloud Speech-to-Text gRPC stream.

### Streaming

- **Audio Uplink**: Frontend streams raw audio chunks every 250ms via the WebSocket.
- **Processing**: The Backend pipes these binary chunks directly to the Google STT engine.
- **Transcript Downlink**: Google returns interim and final transcripts. The Backend forwards these to the Frontend: `{"type": "transcript", "text": "...", "isFinal": true}`.

## 3. The Comparison Engine (Upcoming Stage)

This stage involves comparing the live transcript with the original passage text.

### Metrics to be Calculated

- **Accuracy**: Percentage of words correctly spoken vs the passage.
- **Fluency / WPM**: Words per minute based on the elapsed time of the recording.
- **Mispronunciations**: Identification of specific words that were significantly deviate from the reference text.

## 4. Final Integration (API Stage)

- **Persistence**: Final results (transcript, score, metrics) will be saved via a dedicated results API.
- **Feedback**: The student receives a detailed summary of their performance once the session is finalized.

---
**Status**: Modular Data Highway (WS + STT) - **COMPLETED**  
**Next Stage**: Real-time Comparison Engine - **PLANNED**
