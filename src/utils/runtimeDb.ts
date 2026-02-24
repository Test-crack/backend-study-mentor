import Database from "better-sqlite3";
import path from "path";
import fs from "fs-extra";

const DB_DIR = path.resolve(process.cwd(), "sqlite");
const DB_PATH = path.join(DB_DIR, ".runtime.db");

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

export interface SocketMapping {
    socket_id: string;
    user_id: string;
    username: string;
    role: string;
    connected_at: string;
}

class RuntimeDB {
    private db: Database.Database;

    constructor() {
        // Ensure we handle restarts by recreating or persisting
        this.db = new Database(DB_PATH);
        this.init();
    }

    private init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS socket_mappings (
                socket_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log(`\x1b[36m🗄️ Runtime SQLite DB initialized at ${DB_PATH}\x1b[0m`);
    }

    upsertMapping(mapping: Omit<SocketMapping, "connected_at">) {
        // Clear any existing mapping for this user to ensure only one active socket is tracked
        const deleteStmt = this.db.prepare("DELETE FROM socket_mappings WHERE user_id = ?");
        deleteStmt.run(mapping.user_id);

        const stmt = this.db.prepare(`
            INSERT INTO socket_mappings (socket_id, user_id, username, role)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(mapping.socket_id, mapping.user_id, mapping.username, mapping.role);
    }

    removeMapping(socketId: string) {
        const stmt = this.db.prepare("DELETE FROM socket_mappings WHERE socket_id = ?");
        stmt.run(socketId);
    }

    getMapping(socketId: string): SocketMapping | undefined {
        const stmt = this.db.prepare("SELECT * FROM socket_mappings WHERE socket_id = ?");
        return stmt.get(socketId) as SocketMapping | undefined;
    }

    getAllMappings(): SocketMapping[] {
        const stmt = this.db.prepare("SELECT * FROM socket_mappings");
        return stmt.all() as SocketMapping[];
    }

    clearAll() {
        this.db.exec("DELETE FROM socket_mappings");
    }
}

export const runtimeDb = new RuntimeDB();
