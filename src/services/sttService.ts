import speech from "@google-cloud/speech";
import { WebSocket } from "ws";

const client = new speech.SpeechClient();

/**
 * Creates a streaming recognition stream from Google Cloud Speech-to-Text.
 * @param ws The WebSocket client to send transcripts back to.
 * @returns A writable stream that accepts audio chunks.
 */
export function createSTTStream(ws: WebSocket) {
    const request = {
        config: {
            encoding: "WEBM_OPUS" as const,
            sampleRateHertz: 48000,
            languageCode: "en-US",
            enableInterimResults: true,
        },
        interimResults: true,
    };

    const recognizeStream = client
        .streamingRecognize(request)
        .on("error", (err) => {
            console.error("Google STT Stream Error:", err);
            ws.send(JSON.stringify({ error: "STT Stream Error", details: err.message }));
        })
        .on("data", (data) => {
            if (data.results[0] && data.results[0].alternatives[0]) {
                const result = data.results[0];
                const alternative = result.alternatives[0];

                // Send the transcript back to the frontend
                ws.send(JSON.stringify({
                    type: "transcript",
                    transcript: alternative.transcript,
                    isFinal: result.isFinal,
                    confidence: alternative.confidence
                }));

                if (result.isFinal) {
                    console.log(`✨ Final Transcript: ${alternative.transcript}`);
                }
            }
        });

    return recognizeStream;
}
