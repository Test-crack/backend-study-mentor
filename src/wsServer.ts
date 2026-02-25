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

        ws.on("message", (message: any, isBinary: boolean) => {
            if (isBinary) {
                if (sttStream) {
                    sttStream.write(message);
                }
            } else {
                try {
                    const data = JSON.parse(message.toString());
                    console.log(`📩 Received control message:`, data);

                    if (data.type === "START_STT") {
                        if (!sttStream) {
                            console.log(`🎙️ Starting STT stream for ${username || "Anonymous"}...`);
                            sttStream = createSTTStream(ws);
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
