export interface StreakInput {
  streakDays: number;
  lastActiveDate: string;
  timezone: string;
}

export interface StreakResult {
  streakDays: number;
  lastActiveDate: string;
}

/**
 * Evaluate the streak based on when the user was last active.
 * - Same day: no change
 * - Next day: increment streakDays
 * - Skipped day(s): reset streakDays to 0
 * - Always updates lastActiveDate to today
 *
 * @param input  Current streak state
 * @param now    Optional Date override for testing
 */
export function evaluateStreak(input: StreakInput, now?: Date): StreakResult {
  const current = now ?? new Date();
  const today = toLocalDate(current, input.timezone);
  const lastActive = input.lastActiveDate;

  if (today === lastActive) {
    return {
      streakDays: input.streakDays,
      lastActiveDate: today,
    };
  }

  // Calculate the difference in calendar days
  const daysDiff = calendarDayDiff(lastActive, today, input.timezone);

  if (daysDiff === 1) {
    return {
      streakDays: input.streakDays + 1,
      lastActiveDate: today,
    };
  }

  // Skipped one or more days — reset
  return {
    streakDays: 0,
    lastActiveDate: today,
  };
}

function toLocalDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}

/**
 * Calculate the number of calendar days between two YYYY-MM-DD date strings.
 * We parse them as UTC dates and compute the difference in days.
 */
function calendarDayDiff(from: string, to: string, _timezone: string): number {
  const fromMs = Date.parse(from + 'T00:00:00Z');
  const toMs = Date.parse(to + 'T00:00:00Z');
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}
