import prisma from './prisma';
import { yesterdayISTDate } from './timezone';

/**
 * Returns the student's current valid streak, resetting it to 0 in the DB
 * if they missed a day (last_streak_date is older than yesterday IST).
 *
 * Call this on any endpoint that reads daily_streak so stale streaks
 * are corrected the moment the student re-opens the platform.
 */
export async function getValidatedStreak(student: {
    id: string;
    daily_streak: number;
    last_streak_date: Date | null;
}): Promise<number> {
    if (student.daily_streak === 0 || !student.last_streak_date) {
        return 0;
    }

    // Streak is still live if last_streak_date >= yesterday IST midnight.
    // This covers two valid states:
    //   â€¢ completed yesterday, today not done yet  â†’ streak is "active, pending"
    //   â€¢ completed today already                  â†’ streak already counted
    if (student.last_streak_date.getTime() >= yesterdayISTDate().getTime()) {
        return student.daily_streak;
    }

    // More than 1 day gap â€” streak is broken. Reset and persist.
    await prisma.instituteStudent.update({
        where: { id: student.id },
        data: { daily_streak: 0 }
    });

    return 0;
}
