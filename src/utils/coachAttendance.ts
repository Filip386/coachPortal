import type { Axm365_eventcoachattendances } from "../generated/models/Axm365_eventcoachattendancesModel";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";

export type CoachAttendanceStatus = "present" | "absent";

export interface CoachEventAttendance {
  event: Axm365_events;
  status: CoachAttendanceStatus;
  clockIn: string | null;
  attendanceId: string | null;
}

interface CoachClockIn {
  clockIn: string;
  attendanceId: string;
}

const normalizeGuid = (value?: string | null): string =>
  (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();

const timeOf = (date: string): number => new Date(date).getTime();

const eventTime = (event: Axm365_events): number =>
  event.axm365_eventdate ? timeOf(event.axm365_eventdate) : Number.NaN;

function endOfDay(date: Date): number {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function latestClockInByEvent(
  coachAttendances: Axm365_eventcoachattendances[],
  normalizedCoachId: string
): Map<string, CoachClockIn> {
  const clockInByEvent = new Map<string, CoachClockIn>();

  for (const attendance of coachAttendances) {
    const isThisCoach = normalizeGuid(attendance._axm365_coach_value) === normalizedCoachId;
    const eventId = normalizeGuid(attendance._axm365_event_value);
    const clockIn = attendance.axm365_clockin;
    if (!isThisCoach || !eventId || !clockIn) continue;

    const existing = clockInByEvent.get(eventId);
    if (!existing || timeOf(clockIn) > timeOf(existing.clockIn)) {
      clockInByEvent.set(eventId, { clockIn, attendanceId: attendance.axm365_eventcoachattendanceid });
    }
  }

  return clockInByEvent;
}

export function buildCoachAttendanceHistory(
  events: Axm365_events[],
  coachAttendances: Axm365_eventcoachattendances[],
  coachId: string | null,
  now: Date = new Date()
): CoachEventAttendance[] {
  const normalizedCoachId = normalizeGuid(coachId);
  if (!normalizedCoachId) return [];

  const clockInByEvent = latestClockInByEvent(coachAttendances, normalizedCoachId);
  const cutoffTime = endOfDay(now);

  return events
    .filter((event) => {
      const time = eventTime(event);
      return Number.isFinite(time) && time <= cutoffTime;
    })
    .sort((left, right) => {
      const newestFirst = eventTime(right) - eventTime(left);
      return newestFirst !== 0 ? newestFirst : right.axm365_eventid.localeCompare(left.axm365_eventid);
    })
    .map((event): CoachEventAttendance => {
      const clockIn = clockInByEvent.get(normalizeGuid(event.axm365_eventid));
      return {
        event,
        status: clockIn ? "present" : "absent",
        clockIn: clockIn?.clockIn ?? null,
        attendanceId: clockIn?.attendanceId ?? null,
      };
    });
}
