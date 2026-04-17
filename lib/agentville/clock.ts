/**
 * Format the current time as HH:MM for a given timezone.
 * This function is also inlined in the frontend <script> block — keep in sync.
 */
export function formatClockTime(timezone: string, now?: Date): string {
  const date = now ?? new Date();
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
}
