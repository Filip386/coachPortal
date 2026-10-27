import React, { useEffect, useMemo } from "react";
import { Clock, MapPin, Plus, TrendingUp, CircleDollarSign, Users, ArrowUpRight, ChevronRight, Check, X } from "lucide-react";
import { COLORS, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, SectionTitle, ActionTile, ErrorBanner, StaleDataNotice } from "../components/shared";
import { Stat, Divider } from "../components/ui";
import { useData, type DataResource } from "../context/DataContext";
import { getInvoiceStatus } from "../utils/invoiceStatus";
import { buildCoachAttendanceHistory } from "../utils/coachAttendance";
import { byEventDateAscending, isEventActive } from "../utils/eventStatus";
import { hasUsableData, isNotLoadedYet } from "../utils/resourceStatus";

interface HomeScreenProps {
  go: (id: ScreenId, playerId?: string, eventId?: string) => void;
}

const HOME_RESOURCES: DataResource[] = ["players", "events", "coachAttendances", "invoices"];
const DEFERRED_RESOURCES: DataResource[] = [
  "attendances",
  "facilities",
  "performances",
  "generations",
  "generationsToCoaches",
  "tasks",
];
const DEFERRED_REFRESH_DELAY_MS = 2000;
const RECENT_ATTENDANCE_COUNT = 15;
const UPCOMING_EVENT_COUNT = 3;

export const HomeScreen: React.FC<HomeScreenProps> = ({ go }) => {
  const { coachName, coachId, players, events, coachAttendances, invoices, tasks, refreshAll, ensureFresh, resourceStatus, hasStaleResources, getResourceError } = useData();
  const firstName = coachName ? coachName.split(" ")[0] : null;
  const homeError = getResourceError(["players", "events", "invoices"]);
  const homeStale = hasStaleResources(["players", "events", "invoices", "coachAttendances"]);
  const attendanceError = getResourceError(["coachAttendances"]);
  const playersAvailable = hasUsableData(resourceStatus.players);
  const eventsAvailable = hasUsableData(resourceStatus.events);
  const invoicesAvailable = hasUsableData(resourceStatus.invoices);
  const coachAttendancesAvailable = hasUsableData(resourceStatus.coachAttendances);
  const attendanceHistoryAvailable =
    Boolean(coachId) && eventsAvailable && coachAttendancesAvailable;
  const eventsLoading = isNotLoadedYet(resourceStatus.events);

  useEffect(() => {
    void ensureFresh(HOME_RESOURCES);

    const timer = window.setTimeout(() => {
      void ensureFresh(DEFERRED_RESOURCES);
    }, DEFERRED_REFRESH_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [ensureFresh]);

  const todayEvents = events.filter(isEventActive).sort(byEventDateAscending);

  const squadCount = players.length;
  const overdueInvoices = invoices.filter((inv) => getInvoiceStatus(inv) === "Overdue");
  const now = new Date();
  const upcoming = events
    .filter((e) => e.axm365_eventdate && new Date(e.axm365_eventdate) >= now)
    .sort(byEventDateAscending)
    .slice(0, UPCOMING_EVENT_COUNT);

  const recentCoachAttendance = useMemo(
    () =>
      attendanceHistoryAvailable
        ? buildCoachAttendanceHistory(events, coachAttendances, coachId)
            .slice(0, RECENT_ATTENDANCE_COUNT)
            .reverse()
        : [],
    [attendanceHistoryAvailable, coachAttendances, coachId, events]
  );

  return (
    <>
      <div style={{ background: COLORS.navy, color: "#fff", padding: "0 22px 28px", position: "relative", overflow: "hidden" }}>
        <svg style={{ position: "absolute", inset: 0, opacity: 0.08, pointerEvents: "none" }} width="100%" height="100%">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#FFD400" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div style={{ position: "absolute", top: -60, right: -70, width: 220, height: 220, borderRadius: "50%", background: COLORS.yellow, opacity: 0.18 }} />
        <StatusBar />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 900, color: COLORS.navy, fontSize: 14, letterSpacing: "-0.04em" }}>
              CVF
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.2em", opacity: 0.7 }}>VILLARREAL · MASTERS</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Coach App</div>
            </div>
          </div>
          <button
            onClick={() => go("notifications")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            {tasks.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  background: COLORS.yellow,
                  color: COLORS.navy,
                  borderRadius: 99,
                  border: `2px solid ${COLORS.navy}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: monoStack,
                  fontSize: 9,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {tasks.length > 9 ? "9+" : tasks.length}
              </span>
            )}
          </button>
        </div>

        <div style={{ marginTop: 28, position: "relative" }}>
          <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.22em", color: COLORS.yellow, fontWeight: 600, marginBottom: 8 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
          </div>
          <h1 style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 34, lineHeight: 1.0, margin: 0, letterSpacing: "-0.025em" }}>
            Buenos días,<br />
            <span style={{ color: COLORS.yellow }}>{firstName ? `${firstName}.` : "Coach."}</span>
          </h1>
          <div style={{ marginTop: 16, display: "flex", gap: 22 }}>
            <Stat label="Squad" value={playersAvailable ? String(squadCount) : "—"} />
            <Divider />
            <Stat label="Events" value={eventsAvailable ? String(events.length) : "—"} />
            <Divider />
            <Stat
              label="Overdue"
              value={invoicesAvailable ? String(overdueInvoices.length) : "—"}
              warn={invoicesAvailable && overdueInvoices.length > 0}
            />
          </div>

          <button
            onClick={() => go("coach-attendance")}
            aria-label="Open my attendance history"
            style={{
              width: "100%",
              marginTop: 20,
              padding: "12px 13px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.13)",
              background: "rgba(255,255,255,0.07)",
              color: "#fff",
              textAlign: "left",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: monoStack,
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  opacity: 0.78,
                }}
              >
                My attendance · Last 15
              </span>
              <ChevronRight size={14} strokeWidth={2.2} />
            </div>

            {attendanceHistoryAvailable && recentCoachAttendance.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 10,
                }}
              >
                {recentCoachAttendance.map(({ event, status }) => {
                  const present = status === "present";
                  const DotIcon = present ? Check : X;
                  return (
                    <span
                      key={event.axm365_eventid}
                      title={`${event.axm365_name || "Event"}: ${
                        present ? "Present" : "Absent"
                      }`}
                      style={{
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                        borderRadius: "50%",
                        background: present ? COLORS.green : COLORS.red,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                      }}
                    >
                      <DotIcon size={10} strokeWidth={3.2} />
                    </span>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11.5,
                  fontWeight: 600,
                  opacity: 0.72,
                }}
              >
                {attendanceError
                  ? "Attendance unavailable · Tap for details"
                  : attendanceHistoryAvailable
                  ? "No past events assigned yet"
                  : "Loading attendance…"}
              </div>
            )}
          </button>
        </div>
      </div>

      {homeError && <ErrorBanner message={homeError} onRetry={refreshAll} />}
      {homeStale && <StaleDataNotice />}

      {eventsLoading && (
        <div style={{ padding: "16px 22px 0", color: COLORS.mute, fontFamily: monoStack, fontSize: 11 }}>
          Loading events…
        </div>
      )}

      {eventsAvailable && (
        <div style={{ padding: "0 18px", marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {todayEvents.length === 0 ? (
            <div
              style={{ background: "#fff", borderRadius: 22, padding: 18, boxShadow: "0 14px 30px -12px rgba(11,27,61,0.22)", border: `1px solid ${COLORS.line}` }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.line, padding: "4px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.navy, textTransform: "uppercase" }}>
                <span style={{ width: 6, height: 6, background: COLORS.mute, borderRadius: 99 }} />
                No Event Today
              </div>
              <h3 style={{ margin: "10px 0 4px", fontFamily: displayStack, fontSize: 20, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.01em" }}>
                No Event Scheduled
              </h3>
            </div>
          ) : (
            todayEvents.map((ev) => (
              <div
                key={ev.axm365_eventid}
                onClick={() => go("attendance", undefined, ev.axm365_eventid)}
                style={{ background: "#fff", borderRadius: 22, padding: 18, boxShadow: "0 14px 30px -12px rgba(11,27,61,0.22)", border: `1px solid ${COLORS.line}`, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.yellowSoft, padding: "4px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.navy, textTransform: "uppercase" }}>
                      <span style={{ width: 6, height: 6, background: COLORS.navy, borderRadius: 99 }} />
                      Live · Today
                    </div>
                    <h3 style={{ margin: "10px 0 4px", fontFamily: displayStack, fontSize: 20, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.01em" }}>
                      {ev.axm365_name || "Event"}
                    </h3>
                    <div style={{ display: "flex", gap: 12, color: COLORS.mute, fontSize: 12, marginTop: 6 }}>
                      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <Clock size={12} />
                        {ev.axm365_eventdate ? new Date(ev.axm365_eventdate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                      </span>
                      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <MapPin size={12} />
                        {ev.axm365_description || "TBD"}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: displayStack }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.navy, lineHeight: 1 }}>{playersAvailable ? squadCount : "—"}</div>
                    <div style={{ fontSize: 9.5, fontFamily: monoStack, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600 }}>Players</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={(e) => { e.stopPropagation(); go("attendance", undefined, ev.axm365_eventid); }} style={{ flex: 1, background: COLORS.navy, color: "#fff", border: 0, padding: "11px 0", borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>
                    Mark Attendance
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); go("performance", undefined, ev.axm365_eventid); }} style={{ flex: 1, background: COLORS.yellow, color: COLORS.navy, border: 0, padding: "11px 0", borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>
                    Performance
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ padding: "26px 22px 8px" }}>
        <SectionTitle eyebrow="Shortcuts" title="Quick Actions" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <ActionTile color={COLORS.navy} text="#fff" icon={Plus} title="Create Event" sub="Schedule a session" onClick={() => go("create")} />
          <ActionTile color={COLORS.yellow} text={COLORS.navy} icon={TrendingUp} title="Performance" sub="Latest stats & ratings" onClick={() => go("performance")} />
          <ActionTile color="#fff" text={COLORS.navy} icon={CircleDollarSign} title="Invoices" sub={invoicesAvailable ? (overdueInvoices.length > 0 ? `${overdueInvoices.length} overdue` : "All clear") : "Loading…"} onClick={() => go("invoices")} bordered />
          <ActionTile color="#fff" text={COLORS.navy} icon={Users} title="My Squad" sub={playersAvailable ? `${squadCount} players` : "Loading…"} onClick={() => go("players")} bordered />
        </div>
      </div>

      {eventsAvailable && upcoming.length > 0 && (
        <div style={{ padding: "20px 22px 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <SectionTitle eyebrow="This Week" title="Upcoming" />
            <button onClick={() => go("calendar")} style={{ background: "transparent", border: 0, color: COLORS.navy, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 2, cursor: "pointer" }}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map((e, i) => {
              const startDate = e.axm365_eventdate ? new Date(e.axm365_eventdate) : null;
              return (
                <div key={e.axm365_eventid || i} onClick={() => go("calendar")} style={{ background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                  <div style={{ width: 48, background: COLORS.yellowSoft, color: COLORS.navy, borderRadius: 12, padding: "8px 0", textAlign: "center", fontFamily: displayStack }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, opacity: 0.8 }}>
                      {startDate ? startDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() : "---"}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{startDate ? startDate.getDate() : "-"}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14 }}>{e.axm365_name || "Event"}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.mute, marginTop: 2 }}>
                      {startDate ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                    </div>
                  </div>
                  <ChevronRight size={16} color={COLORS.mute} strokeWidth={2} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ height: 30 }} />
    </>
  );
};
