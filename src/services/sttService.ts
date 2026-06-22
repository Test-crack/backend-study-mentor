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
/**
 * @param ws         WebSocket client to receive transcripts.
 * @param onStreamEnd Called when the stream ends for any reason (5-min limit,
 *                   network error, or normal close). The caller decides whether
 *                   to restart. Never fires on a clean STOP_STT-triggered end.
 */
export function createSTTStream(ws: WebSocket, onStreamEnd?: () => void) {
    const request = {
        config: {
            encoding: "WEBM_OPUS" as const,
            sampleRateHertz: 48000,
            languageCode: "en-US",
            // latest_long: designed for audio > 1 min, much better phoneme discrimination
            // than the default short-utterance model — critical for minimal-pair words
            // like ship/sheep, bit/beat where vowel length is the only differentiator.
            model: "latest_long",
            useEnhanced: true,
            enableAutomaticPunctuation: true,
            // ── Word-level data (used by Speech Anatomy feature) ──
            enableWordTimeOffsets: true,
            enableWordConfidence: true,
        },
        interimResults: true,
        // Explicitly keep the stream open after Google detects end of speech
        singleUtterance: false,
    };

    const recognizeStream = client
        .streamingRecognize(request)
        .on("error", (err) => {
            // Google closes the stream after 305 s — transparent restart, don't alarm the student
            const isHardLimit =
                err.message?.includes('305') ||
                err.message?.toLowerCase().includes('duration') ||
                err.message?.toLowerCase().includes('exceeded');

            if (!isHardLimit) {
                console.error("[STT] Stream error:", err.message);
                try { ws.send(JSON.stringify({ error: "STT Stream Error", details: err.message })); } catch {}
            } else {
                console.log("[STT] 5-minute hard limit reached — handing off for restart.");
            }
            onStreamEnd?.();
        })
        .on("end", () => {
            // Stream closed by Google (end of limit window) — let caller restart
            onStreamEnd?.();
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
