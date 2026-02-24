import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { createSTTStream } from "./services/sttService";
import { runtimeDb } from "./utils/runtimeDb";
import url from "url";

const PORT = process.env.WS_PORT || 8080;

/**
 * Starts a standalone WebSocket server to handle real-time audio streaming.
 * Features:
 * 1. Persistent global connection with identity mapping (SQLite).
 * 2. Dynamic Google STT streaming on-demand via control messages.
 * 3. Modular design for multiple site features.
 */
export function startWSServer() {
    const wss = new WebSocketServer({ port: Number(PORT) });

    console.log(`\x1b[32m🟢 WebSocket server running on port ${PORT}\x1b[0m`);

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        const socketId = req.headers["sec-websocket-key"] || "unknown";

        // Parse query parameters for user details
        const parsedUrl = url.parse(req.url || "", true);
        const { userId, username, role } = parsedUrl.query;

        console.log(`\x1b[34m🔵 Client connected: ${socketId} (User: ${username || 'Anonymous'})\x1b[0m`);

        // Identity Mapping: Store in SQLite DB
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

        ws.on("message", (message: any, isBinary: boolean) => {
            if (isBinary) {
                // Audio Data: Pipe to Google STT if stream is active
                if (sttStream) {
                    sttStream.write(message);
                } else {
                    // This is expected for the first few chunks sent before STT_READY reaches frontend
                    // console.warn(`⚠️ Received audio chunk but sttStream is NOT active`);
                }
            } else {
                // Control Messages
                try {
                    const data = JSON.parse(message.toString());
                    console.log(`📩 Received control message:`, data);

                    if (data.type === "START_STT") {
                        if (!sttStream) {
                            console.log(`🎙️ Starting STT stream for ${username || "Anonymous"}...`);
                            sttStream = createSTTStream(ws);
                            // Notify frontend that we are ready to receive audio
                            ws.send(JSON.stringify({ type: "STT_READY" }));
                        }
                    } else if (data.type === "STOP_STT") {
                        if (sttStream) {
                            console.log(`⏹️ Stopping STT stream for ${username || "Anonymous"}...`);
                            sttStream.end();
                            sttStream = null;
                        }
                    }
                } catch (e) {
                    // Fallback for simple string messages if any
                    const text = message.toString();
                    if (text === "stop" && sttStream) {
                        sttStream.end();
                        sttStream = null;
                    }
                }
            }
        });

        ws.on("close", () => {
            console.log(`\x1b[31m🔴 Client disconnected: ${socketId}\x1b[0m`);
            if (sttStream) {
                sttStream.end();
            }
            runtimeDb.removeMapping(socketId as string);
        });

        ws.on("error", (err: Error) => {
            console.error(`WS error for ${socketId}:`, err);
            if (sttStream) {
                sttStream.end();
            }
        });
    });

    return wss;
}
