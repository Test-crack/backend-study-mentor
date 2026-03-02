import speech from "@google-cloud/speech";
import { WebSocket } from "ws";

const client = new speech.SpeechClient();

/**
 * Creates a streaming recognition stream from Google Cloud Speech-to-Text.
 *
 * Word-level confidence is enabled so the frontend can compute
 * a pronunciation score per word (STT uncertainty ≈ mispronunciation).
 *
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
            // ── Word-level data (used by Speech Anatomy feature) ──
            enableWordTimeOffsets: true,   // arrival timing per word
            enableWordConfidence: true,    // per-word STT confidence score (0–1)
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

                // Build per-word confidence array (only on final results where words[] is populated)
                const words = result.isFinal && alternative.words
                    ? alternative.words.map((w: any) => ({
                        word: w.word,
                        confidence: typeof w.confidence === "number" ? w.confidence : 1.0,
                    }))
                    : [];

                // Send transcript + optional word data back to the frontend
                ws.send(JSON.stringify({
                    type: "transcript",
                    transcript: alternative.transcript,
                    isFinal: result.isFinal,
                    confidence: alternative.confidence ?? 1.0,
                    words, // [] for interim, [{word, confidence}] for final
                }));

                if (result.isFinal) {
                    console.log(
                        `✨ Final Transcript: "${alternative.transcript}" | ` +
                        `conf: ${(alternative.confidence ?? 1).toFixed(2)} | ` +
                        `words: ${words.length}`
                    );
                }
            }
        });

    return recognizeStream;
}
