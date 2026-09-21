import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import type { Axm365_eventcoachattendances } from "../generated/models/Axm365_eventcoachattendancesModel";

export interface CoachAttendanceItem {
  event: Axm365_events;
  status: "present" | "absent";
  clockIn: string | null;
  clockOut: string | null;
}

/** The coach's most recent past events, newest first, each marked Present
 *  (a clock-in record exists for that coach + event) or Absent (none).
 *
 *  Events carry no generation, and the event's own Coach lookup is not
 *  filled in when an event is created — so an event counts as the coach's
 *  unless it is explicitly assigned to a different coach. An event the coach
 *  clocked into always counts. Only events that have already started are
 *  included, so upcoming sessions are never shown as "absent". */
export function buildCoachAttendanceHistory(
  events: Axm365_events[],
  coachAttendances: Axm365_eventcoachattendances[],
  coachId: string | null,
  limit = 15
): CoachAttendanceItem[] {
  const byEvent = new Map<string, Axm365_eventcoachattendances>();
  for (const a of coachAttendances) {
    const eventId = a._axm365_event_value;
    if (eventId && a.axm365_clockin && !byEvent.has(eventId)) byEvent.set(eventId, a);
  }

  const now = Date.now();

  return events
    .filter((e) => {
      if (!e.axm365_eventdate || new Date(e.axm365_eventdate).getTime() > now) return false;
      if (byEvent.has(e.axm365_eventid)) return true;
      const assigned = e._axm365_coach_value;
      return !assigned || !coachId || assigned === coachId;
    })
    .sort((a, b) => new Date(b.axm365_eventdate!).getTime() - new Date(a.axm365_eventdate!).getTime())
    .slice(0, limit)
    .map((event) => {
      const record = byEvent.get(event.axm365_eventid);
      return {
        event,
        status: record ? "present" : "absent",
        clockIn: record?.axm365_clockin ?? null,
        clockOut: record?.axm365_clockout ?? null,
      };
    });
}
