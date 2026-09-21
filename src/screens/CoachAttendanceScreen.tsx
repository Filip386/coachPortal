import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Dumbbell, Trophy, LogIn, LogOut, Timer } from "lucide-react";
import { COLORS, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner } from "../components/shared";
import { useData } from "../context/DataContext";
import { buildCoachAttendanceHistory } from "../utils/coachAttendance";

interface CoachAttendanceScreenProps {
  go: (id: ScreenId) => void;
  goBack?: () => void;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtDuration = (fromIso: string, toIso: string) => {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};

export const CoachAttendanceScreen: React.FC<CoachAttendanceScreenProps> = ({ go, goBack }) => {
  const { events, coachAttendances, coachAttendancesLoaded, coachId, refreshEvents, refreshCoachAttendances } = useData();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    refreshCoachAttendances().catch(() => {});
  }, [refreshCoachAttendances]);

  const history = useMemo(
    () => buildCoachAttendanceHistory(events, coachAttendances, coachId, 15),
    [events, coachAttendances, coachId]
  );

  const presentCount = history.filter((h) => h.status === "present").length;

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([refreshEvents(), refreshCoachAttendances()]).catch(() => {});
    setRefreshing(false);
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker="Clock-in history"
        title="My Attendance"
        onBack={() => (goBack ? goBack() : go("home"))}
        action={
          <button
            onClick={refreshData}
            disabled={refreshing}
            style={{ width: 38, height: 38, borderRadius: 12, background: "#fff", border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: refreshing ? "not-allowed" : "pointer" }}
          >
            <RefreshCw size={17} color={COLORS.navy} strokeWidth={2} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        }
      />

      {!coachAttendancesLoaded && <LoadingSpinner label="Loading attendance…" />}

      {coachAttendancesLoaded && (
        <div style={{ padding: "0 22px 30px" }}>
          <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 22, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
              <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 18, color: COLORS.navy }}>
                My Recent Attendance
              </div>
              <span style={{ background: "#E7F6EC", color: COLORS.green, borderRadius: 99, padding: "4px 10px", fontFamily: monoStack, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em" }}>
                LAST {history.length}
              </span>
            </div>

            {history.length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>
                NO PAST EVENTS
              </div>
            )}

            {history.map(({ event, status, clockIn, clockOut }) => {
              const present = status === "present";
              const isMatch = (event.axm365_eventtype as number | undefined) !== 216260000 && event.axm365_eventtype !== undefined;
              const Icon = isMatch ? Trophy : Dumbbell;
              const date = new Date(event.axm365_eventdate!);
              return (
                <div key={event.axm365_eventid} style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.line}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: isMatch ? COLORS.yellowSoft : "#E7F6EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={17} color={COLORS.navy} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.axm365_name || "Event"}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.mute, marginTop: 2 }}>
                        {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {fmtTime(event.axm365_eventdate!)}
                      </div>
                    </div>
                    <span
                      style={{
                        background: present ? "#E7F6EC" : "#FDE8E8",
                        color: present ? COLORS.green : COLORS.red,
                        borderRadius: 99,
                        padding: "5px 12px",
                        fontFamily: monoStack,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        flexShrink: 0,
                      }}
                    >
                      {present ? "PRESENT" : "ABSENT"}
                    </span>
                  </div>

                  {present && clockIn && (
                    <div style={{ display: "flex", gap: 14, marginTop: 8, marginLeft: 50, color: COLORS.mute, fontFamily: monoStack, fontSize: 10.5, letterSpacing: "0.04em", flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><LogIn size={11} /> {fmtTime(clockIn)}</span>
                      {clockOut && (
                        <>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><LogOut size={11} /> {fmtTime(clockOut)}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Timer size={11} /> {fmtDuration(clockIn, clockOut)}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {history.length > 0 && (
              <div style={{ borderTop: `1px solid ${COLORS.line}`, padding: "12px 16px", textAlign: "center", fontFamily: monoStack, fontSize: 10.5, letterSpacing: "0.1em", color: COLORS.mute }}>
                {presentCount} OF {history.length} CLOCKED IN
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
