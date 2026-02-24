import { WebSocketServer } from "ws";

const PORT = process.env.WS_PORT || 8080;

/**
 * Starts a standalone WebSocket server to handle real-time audio streaming.
 * In Stage 1, it simply logs the received audio chunks.
 */
export function startWSServer() {
    const wss = new WebSocketServer({ port: Number(PORT) });

    console.log(`\x1b[32m🟢 WebSocket server running on port ${PORT}\x1b[0m`);

    wss.on("connection", (ws, req) => {
        console.log("\x1b[34m🔵 Client connected to Audio WS\x1b[0m");

        ws.on("message", (message) => {
            if (Buffer.isBuffer(message)) {
                console.log(`🎤 Received audio chunk: ${message.length} bytes`);
            } else {
                // String messages might be used for control (e.g., "start", "stop")
                console.log(`📩 Received message: ${message.toString()}`);
            }
        });

        ws.on("close", () => {
            console.log("\x1b[31m🔴 Client disconnected from Audio WS\x1b[0m");
        });

        ws.on("error", (err) => {
            console.error("WS error:", err);
        });
    });

    return wss;
}
