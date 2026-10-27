import type { Axm365_events } from "../generated/models/Axm365_eventsModel";

export function isEventActive(event: { axm365_eventdate?: string } | null | undefined): boolean {
  if (!event?.axm365_eventdate) return false;
  return new Date(event.axm365_eventdate).toDateString() === new Date().toDateString();
}

export const byEventDateAscending = (a: Axm365_events, b: Axm365_events): number =>
  new Date(a.axm365_eventdate!).getTime() - new Date(b.axm365_eventdate!).getTime();

const byEventDateDescending = (a: Axm365_events, b: Axm365_events): number => byEventDateAscending(b, a);

const PICKER_WINDOW_START_DAYS_AGO = 8;
const PICKER_WINDOW_END_DAYS_AGO = 1;

export function lastWeekEventsNewestFirst(events: Axm365_events[], now: Date = new Date()): Axm365_events[] {
  const daysAgo = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime();
  const windowStart = daysAgo(PICKER_WINDOW_START_DAYS_AGO);
  const windowEnd = daysAgo(PICKER_WINDOW_END_DAYS_AGO) - 1;

  return events
    .filter((event) => {
      if (!event.axm365_eventdate) return false;
      const time = new Date(event.axm365_eventdate).getTime();
      return time >= windowStart && time <= windowEnd;
    })
    .sort(byEventDateDescending);
}
