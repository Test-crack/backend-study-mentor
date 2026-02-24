import { WebSocketServer } from "ws";
import { runtimeDb } from "./utils/runtimeDb";
import url from "url";

const PORT = process.env.WS_PORT || 8080;

/**
 * Starts a standalone WebSocket server to handle real-time audio streaming.
 * It uses a simple SQLite database to track active user mappings.
 */
export function startWSServer() {
    const wss = new WebSocketServer({ port: Number(PORT) });

    console.log(`\x1b[32m🟢 WebSocket server running on port ${PORT}\x1b[0m`);

    wss.on("connection", (ws, req) => {
        const socketId = req.headers["sec-websocket-key"] || "unknown";

        // Parse query parameters for user details
        // Example: ws://localhost:8080?userId=123&username=johndoe&role=student
        const parsedUrl = url.parse(req.url || "", true);
        const { userId, username, role } = parsedUrl.query;

        console.log(`\x1b[34m🔵 Client connected: ${socketId} (User: ${username || 'Anonymous'})\x1b[0m`);

        // If we have user details, store them in the runtime SQLite DB
        if (userId && username && role) {
            runtimeDb.upsertMapping({
                socket_id: socketId as string,
                user_id: userId as string,
                username: username as string,
                role: role as string
            });
            console.log(`\x1b[36m📝 Mapping stored for ${username} (${socketId})\x1b[0m`);
        }

        ws.on("message", (message) => {
            if (Buffer.isBuffer(message)) {
                // console.log(`🎤 Received audio chunk: ${message.length} bytes`);
            } else {
                console.log(`📩 Received message: ${message.toString()}`);
            }
        });

        ws.on("close", () => {
            console.log(`\x1b[31m🔴 Client disconnected: ${socketId}\x1b[0m`);
            runtimeDb.removeMapping(socketId as string);
        });

        ws.on("error", (err) => {
            console.error(`WS error for ${socketId}:`, err);
        });
    });

    return wss;
}

