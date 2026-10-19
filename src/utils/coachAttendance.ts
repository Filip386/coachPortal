import type { Axm365_eventcoachattendances } from "../generated/models/Axm365_eventcoachattendancesModel";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";

export type CoachAttendanceStatus = "present" | "absent";

export interface CoachEventAttendance {
  event: Axm365_events;
  status: CoachAttendanceStatus;
  clockIn: string | null;
  attendanceId: string | null;
}

const normalizeGuid = (value?: string | null): string =>
  (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();

/**
 * Builds coach attendance from the two authoritative Dataverse tables:
 * Events provide the last sessions, and Event Coach Attendances determine
 * whether the current coach has a matching clock-in. The Event.Coach lookup
 * is deliberately not consulted.
 *
 * Callers must wait until both resources are usable before displaying the
 * result. An empty attendance array is meaningful only after that load has
 * completed; before then it must not be interpreted as absences.
 */
export function buildCoachAttendanceHistory(
  events: Axm365_events[],
  coachAttendances: Axm365_eventcoachattendances[],
  coachId: string | null,
  now: Date = new Date()
): CoachEventAttendance[] {
  const normalizedCoachId = normalizeGuid(coachId);
  if (!normalizedCoachId) return [];

  const clockInByEvent = new Map<
    string,
    { clockIn: string; attendanceId: string }
  >();

  coachAttendances.forEach((attendance) => {
    const attendanceCoachId = normalizeGuid(attendance._axm365_coach_value);
    const eventId = normalizeGuid(attendance._axm365_event_value);
    const clockIn = attendance.axm365_clockin;

    if (
      attendanceCoachId !== normalizedCoachId ||
      !eventId ||
      !clockIn
    ) {
      return;
    }

    const existing = clockInByEvent.get(eventId);
    if (
      !existing ||
      new Date(clockIn).getTime() > new Date(existing.clockIn).getTime()
    ) {
      clockInByEvent.set(eventId, {
        clockIn,
        attendanceId: attendance.axm365_eventcoachattendanceid,
      });
    }
  });

  // Include the complete present day, not only Events whose scheduled start
  // time has already passed. This keeps today's Event visible in the latest
  // 15 throughout the day.
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const attendanceCutoffTime = endOfToday.getTime();

  return events
    .filter((event) => {
      const eventTime = event.axm365_eventdate
        ? new Date(event.axm365_eventdate).getTime()
        : Number.NaN;

      return (
        Number.isFinite(eventTime) &&
        eventTime <= attendanceCutoffTime
      );
    })
    .sort((left, right) => {
      const dateDifference =
        new Date(right.axm365_eventdate!).getTime() -
        new Date(left.axm365_eventdate!).getTime();

      return dateDifference !== 0
        ? dateDifference
        : right.axm365_eventid.localeCompare(left.axm365_eventid);
    })
    .map((event) => {
      const clockIn = clockInByEvent.get(normalizeGuid(event.axm365_eventid));
      const status: CoachAttendanceStatus = clockIn ? "present" : "absent";

      return {
        event,
        status,
        clockIn: clockIn?.clockIn ?? null,
        attendanceId: clockIn?.attendanceId ?? null,
      };
    });
}
