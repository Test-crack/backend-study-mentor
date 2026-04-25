/**
 * IST Timezone Utilities
 *
 * India Standard Time = UTC+5:30. This platform is India-only, so every
 * "today" boundary must be computed relative to IST midnight, never the
 * server's local clock (which may be UTC on Linux/cloud or IST on a dev
 * Windows machine — either way, using setHours(0,0,0,0) produces incorrect
 * results when the server timezone differs from IST).
 *
 * TWO types of "today start" are needed because we use two different column
 * types in the schema:
 *
 *   1. TIMESTAMPTZ (drill_sessions.created_at, last_streak_date comparisons)
 *      → use todayStartIST() which gives IST midnight as a UTC instant
 *        e.g. at any time on April 25 IST → returns 2026-04-24T18:30:00.000Z
 *
 *   2. DATE (student_game_scores.session_date)
 *      → use currentISTDate() which gives UTC midnight of the IST calendar date
 *        e.g. at any time on April 25 IST → returns 2026-04-25T00:00:00.000Z
 *        PostgreSQL stores this DATE as 2026-04-25; gte comparisons are consistent.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30 = 19 800 000 ms

/**
 * Start of the current IST calendar day as a UTC timestamp.
 * Use for `created_at >= todayStartIST()` on TIMESTAMPTZ columns.
 *
 * Why: setHours(0,0,0,0) sets LOCAL midnight, not IST midnight.
 *      On a UTC server this produces UTC midnight (wrong by 5.5 h).
 *      On an IST Windows dev box it produces a value that, when stored
 *      in a DATE column and then compared, always fails the >= check.
 */
export function todayStartIST(): Date {
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const y = nowIST.getUTCFullYear();
    const m = nowIST.getUTCMonth();
    const d = nowIST.getUTCDate();
    // IST midnight = UTC midnight of that IST date minus the 5.5-hour offset
    return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * UTC midnight of the current IST calendar date.
 * Use for DATE column storage and for `{ gte: currentISTDate() }` queries.
 *
 * Stored as a Prisma Date, PostgreSQL receives e.g. 2026-04-25T00:00:00.000Z
 * and stores the DATE 2026-04-25. Querying `session_date >= currentISTDate()`
 * compares DATE(00:00 UTC) >= 00:00 UTC → always TRUE for same-day records.
 */
export function currentISTDate(): Date {
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    return new Date(Date.UTC(
        nowIST.getUTCFullYear(),
        nowIST.getUTCMonth(),
        nowIST.getUTCDate(),
        0, 0, 0, 0
    ));
}

/**
 * UTC midnight of yesterday's IST calendar date.
 * Use for streak continuity checks: was last_streak_date yesterday (IST)?
 */
export function yesterdayISTDate(): Date {
    const d = currentISTDate();
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
}
