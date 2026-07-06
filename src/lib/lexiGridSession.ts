import { createHmac, timingSafeEqual } from 'crypto';
import { currentISTDate } from './timezone';

const SECRET = process.env.LEXIGRID_SESSION_SECRET ?? 'lexigrid-dev-secret-change-in-prod';

interface SessionPayload {
    s: string;   // student_id
    w: string[]; // word ids served
    d: string;   // IST date the token was issued (YYYY-MM-DD) — binds the token to one day
}

/** Stable YYYY-MM-DD for the current IST calendar day. */
function istDateStr(): string {
    return currentISTDate().toISOString().slice(0, 10);
}

/**
 * Signs a session payload so the backend can verify later that these words
 * were legitimately served to this student ON THIS IST DAY.
 * Returns a base64url-encoded payload + first 32 hex chars of HMAC-SHA256.
 */
export function signLexiGridSession(studentId: string, wordIds: string[]): string {
    const payload: SessionPayload = { s: studentId, w: wordIds, d: istDateStr() };
    const data = JSON.stringify(payload);
    const sig = createHmac('sha256', SECRET).update(data).digest('hex').slice(0, 32);
    return Buffer.from(data).toString('base64url') + '.' + sig;
}

/**
 * Verifies a session token and checks that the claimed score is plausible.
 * Returns:
 *   'valid'   — token checks out, score is within bounds
 *   'invalid' — token present but forged, tampered, or wrong student
 *   'missing' — no token provided (offline / legacy client)
 */
export function verifyLexiGridSession(
    token: string | undefined,
    studentId: string,
    wordsSolved: number
): 'valid' | 'invalid' | 'missing' {
    if (!token) return 'missing';
    try {
        const dot = token.lastIndexOf('.');
        if (dot === -1) return 'invalid';

        const dataPart = token.slice(0, dot);
        const sigPart  = token.slice(dot + 1);

        // Signatures are always exactly 32 hex chars — reject anything else upfront
        if (sigPart.length !== 32) return 'invalid';

        const data     = Buffer.from(dataPart, 'base64url').toString();
        const expected = createHmac('sha256', SECRET).update(data).digest('hex').slice(0, 32);

        // Constant-time comparison to prevent timing attacks
        const sigBuf = Buffer.from(sigPart);
        const expBuf = Buffer.from(expected);
        if (!timingSafeEqual(sigBuf, expBuf)) return 'invalid';

        const payload: SessionPayload = JSON.parse(data);
        if (payload.s !== studentId)                        return 'invalid';
        if (!Array.isArray(payload.w))                      return 'invalid';
        if (wordsSolved > payload.w.length)                 return 'invalid';
        // Bind the token to its issue day so a token captured once cannot be replayed
        // on later days to farm momentum. (Same-day fabrication is separately bounded
        // by the once-per-day unique game-score record.)
        if (payload.d && payload.d !== istDateStr())        return 'invalid';

        return 'valid';
    } catch {
        return 'invalid';
    }
}
