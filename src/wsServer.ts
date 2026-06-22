import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server as HttpServer } from "http";
import { createSTTStream } from "./services/sttService";
import { runtimeDb } from "./utils/runtimeDb";
import url from "url";

/**
 * Starts a WebSocket server.
 * In production, it should share the Express HTTP server to handle SSL via Nginx.
 * @param server Optional existing HTTP server to attach to.
 */
export function startWSServer(server?: HttpServer) {
    // Resolve port inside the function to ensure dotenv is loaded
    const standalonePort = Number(process.env.WS_PORT || 8080);
    const options = server ? { server } : { port: standalonePort };

    const wss = new WebSocketServer(options);

    const mode = server ? "Shared Port" : `Port ${standalonePort}`;
    console.log(`\x1b[32m🟢 WebSocket server running (${mode})\x1b[0m`);

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        // Support path matching for shared mode
        const parsedUrl = url.parse(req.url || "", true);
        if (server && parsedUrl.pathname !== "/ws") {
            // Only handle /ws path when sharing the main port
            // But if the frontend specifically uses / on port 8080, we allow it for backward compatibility
            if (parsedUrl.pathname !== "/") {
                console.log(`[WS] Ignoring connection to ${parsedUrl.pathname}`);
                ws.close();
                return;
            }
        }

        const socketId = req.headers["sec-websocket-key"] || "unknown";
        const { userId, username, role } = parsedUrl.query;

        console.log(`\x1b[34m🔵 Client connected: ${socketId} (User: ${username || 'Anonymous'})\x1b[0m`);

        if (userId && username && role) {
            runtimeDb.upsertMapping({
                socket_id: socketId as string,
                user_id: userId as string,
                username: username as string,
                role: role as string
            });
            console.log(`\x1b[36m📝 Mapping stored for ${username} (${socketId})\x1b[0m`);
        }

        let sttStream: any = null;
        // True while the student has an active recording session (between START_STT and STOP_STT).
        // Used by the auto-restart logic to distinguish a Google hard-limit closure
        // from a normal STOP_STT-triggered end.
        let isSTTActive = false;
        // The first audio chunk from MediaRecorder contains the WebM container header
        // (EBML + segment info + codec tracks). Every restart needs this prepended so
        // Google STT can initialise the audio decoder — without it the new stream gets
        // raw clusters it can't parse and silently stops producing results.
        let webmHeader: Buffer | null = null;

        /**
         * Creates a new STT stream. On the initial call sendReady=true notifies the
         * frontend. On auto-restarts sendReady=false — the frontend's MediaRecorder
         * is already running and doesn't need to re-initialize.
         */
        function spawnSTTStream(sendReady: boolean) {
            // One-shot guard: Google's gRPC stream can emit both 'error' and 'end'
            // for the same closure event (e.g. hard-limit), which would call onStreamEnd
            // twice and spawn two concurrent streams. The flag collapses both into one.
            let streamEndFired = false;

            sttStream = createSTTStream(ws, () => {
                if (streamEndFired) return;
                streamEndFired = true;
                // onStreamEnd — fired when Google closes the stream (5-min limit or error)
                sttStream = null;
                if (isSTTActive) {
                    console.log(`[STT] Stream ended, auto-restarting for ${username || 'Anonymous'}...`);
                    // Small delay to avoid hammering the API on back-to-back errors
                    setTimeout(() => { if (isSTTActive) spawnSTTStream(false); }, 200);
                }
            });

            // Replay the WebM container header so the restarted stream can decode audio.
            // Skip on the very first start (no header captured yet) and on fresh sessions
            // where sendReady=true (the next real chunk will be the header).
            if (!sendReady && webmHeader) {
                try {
                    sttStream.write(webmHeader);
                } catch (err) {
                    console.warn('[STT] Failed to write WebM header to restarted stream:', err);
                }
            }

            if (sendReady) {
                webmHeader = null; // reset header capture for the new session
                try { ws.send(JSON.stringify({ type: "STT_READY" })); } catch {}
            }
        }

        ws.on("message", (message: any, isBinary: boolean) => {
            if (isBinary) {
                // First chunk from MediaRecorder = WebM container header — cache it
                if (!webmHeader) {
                    webmHeader = Buffer.from(message);
                }
                // Write audio chunk to stream — silently drop during the ~200ms restart window
                if (sttStream) {
                    try { sttStream.write(message); } catch {}
                }
            } else {
                try {
                    const data = JSON.parse(message.toString());
                    console.log(`📩 Received control message:`, data);

                    if (data.type === "START_STT") {
                        if (!isSTTActive) {
                            console.log(`🎙️ Starting STT stream for ${username || "Anonymous"}...`);
                            isSTTActive = true;
                            spawnSTTStream(true);
                        }
                    } else if (data.type === "STOP_STT") {
                        console.log(`⏹️ Stopping STT stream for ${username || "Anonymous"}...`);
                        isSTTActive = false;
                        if (sttStream) {
                            sttStream.end();
                            sttStream = null;
                        }
                    }
                } catch (e) {
                    const text = message.toString();
                    if (text === "stop") {
                        isSTTActive = false;
                        if (sttStream) { sttStream.end(); sttStream = null; }
                    }
                }
            }
        });

        ws.on("close", () => {
            console.log(`\x1b[31m🔴 Client disconnected: ${socketId}\x1b[0m`);
            isSTTActive = false;
            if (sttStream) {
                sttStream.end();
                sttStream = null;
            }
            runtimeDb.removeMapping(socketId as string);
        });

        ws.on("error", (err: Error) => {
            console.error(`WS error for ${socketId}:`, err);
            isSTTActive = false;
            if (sttStream) {
                sttStream.end();
                sttStream = null;
            }
        });
    });

    return wss;
}
