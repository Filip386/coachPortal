/** An event counts as "active" if its date is today's calendar date. */
export function isEventActive(event: { axm365_eventdate?: string } | null | undefined): boolean {
  if (!event?.axm365_eventdate) return false;
  return new Date(event.axm365_eventdate).toDateString() === new Date().toDateString();
}
