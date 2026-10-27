import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import {
  ErrorBanner,
  LoadingSpinner,
  ScreenHeader,
  StaleDataNotice,
  StatusBar,
} from "../components/shared";
import { useData, type DataResource } from "../context/DataContext";
import { buildCoachAttendanceHistory } from "../utils/coachAttendance";
import { hasUsableData, isNotLoadedYet } from "../utils/resourceStatus";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";

interface CoachAttendanceHistoryScreenProps {
  go: (id: ScreenId) => void;
  goBack?: () => void;
}

const EVENT_TYPE_TOURNAMENT_MATCH = 216260001;
const EVENT_TYPE_LEAGUE_MATCH = 216260002;
const SCREEN_RESOURCES: DataResource[] = ["events", "coachAttendances"];


interface EventVisual {
  symbol: string;
  label: string;
  background: string;
}

const getEventVisual = (event: Axm365_events): EventVisual => {
  const name = (event.axm365_name ?? "").toLowerCase();
  const typeName = (event.axm365_eventtypename ?? "").toLowerCase();

  if (name.includes("goalkeeper")) {
    return { symbol: "🧤", label: "Goalkeeper session", background: "#EAF1FF" };
  }
  if (name.includes("fitness") || name.includes("conditioning")) {
    return { symbol: "🏃", label: "Fitness session", background: "#F0EEFF" };
  }
  if (name.includes("meeting")) {
    return { symbol: "👥", label: "Meeting", background: "#EAF1FF" };
  }

  const isMatch =
    event.axm365_eventtype === EVENT_TYPE_TOURNAMENT_MATCH ||
    event.axm365_eventtype === EVENT_TYPE_LEAGUE_MATCH ||
    typeName.includes("tournament") ||
    typeName.includes("league") ||
    name.includes("match");

  if (isMatch) {
    return { symbol: "🏆", label: "Match", background: "#FFF4CE" };
  }

  return { symbol: "⚽", label: "Training", background: "#EAF7EF" };
};

export const CoachAttendanceHistoryScreen: React.FC<
  CoachAttendanceHistoryScreenProps
> = ({ go, goBack }) => {
  const {
    coachId,
    coachLookupLoading,
    coachLookupError,
    events,
    coachAttendances,
    resourceStatus,
    ensureFresh,
    refreshEvents,
    refreshCoachAttendances,
    refreshCoach,
    hasStaleResources,
    getResourceError,
  } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const eventsAvailable = hasUsableData(resourceStatus.events);
  const attendancesAvailable = hasUsableData(resourceStatus.coachAttendances);
  const resourcesAvailable = eventsAvailable && attendancesAvailable;
  const screenError = getResourceError(SCREEN_RESOURCES);
  const screenStale = hasStaleResources(SCREEN_RESOURCES);
  const screenLoading =
    coachLookupLoading ||
    !coachId ||
    isNotLoadedYet(resourceStatus.events) ||
    isNotLoadedYet(resourceStatus.coachAttendances);

  useEffect(() => {
    void ensureFresh(SCREEN_RESOURCES);
  }, [ensureFresh]);

  const history = useMemo(
    () =>
      resourcesAvailable
        ? buildCoachAttendanceHistory(events, coachAttendances, coachId)
        : [],
    [resourcesAvailable, coachAttendances, coachId, events]
  );

  const presentCount = history.filter((entry) => entry.status === "present").length;
  const absentCount = history.length - presentCount;

  const reloadHistory = async () => {
    if (!coachId) {
      await refreshCoach();
      return;
    }
    await refreshEvents();
    await refreshCoachAttendances();
  };

  const refreshData = async () => {
    setRefreshing(true);
    await reloadHistory().catch(() => {});
    setRefreshing(false);
  };

  const dateLabel = (value?: string): string => {
    if (!value) return "Date unavailable";
    return new Date(value).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const timeLabel = (value?: string | null): string => {
    if (!value) return "--:--";
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker="Coach history"
        title="My Recent Attendance"
        onBack={() => (goBack ? goBack() : go("home"))}
        action={
          <button
            onClick={refreshData}
            disabled={refreshing}
            aria-label="Refresh coach attendance"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "#fff",
              border: `1px solid ${COLORS.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: refreshing ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw
              size={17}
              color={COLORS.navy}
              strokeWidth={2}
              style={{
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            />
          </button>
        }
      />

      {screenStale && <StaleDataNotice />}
      {coachLookupError && !coachId && (
        <ErrorBanner message={coachLookupError} onRetry={refreshData} />
      )}
      {screenError && <ErrorBanner message={screenError} onRetry={refreshData} />}
      {screenLoading && !coachLookupError && (
        <LoadingSpinner label="Loading your attendance…" />
      )}

      {!screenLoading && resourcesAvailable && (
        <>
          <div style={{ padding: "0 22px 18px" }}>
            <div
              style={{
                background: COLORS.navy,
                color: "#fff",
                borderRadius: 22,
                padding: 18,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
              }}
            >
              {[
                { label: "Events", value: history.length, color: "#fff" },
                { label: "Present", value: presentCount, color: COLORS.green },
                { label: "Absent", value: absentCount, color: COLORS.red },
              ].map((item) => (
                <div key={item.label} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: displayStack,
                      fontSize: 26,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: item.color,
                    }}
                  >
                    {item.value}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: monoStack,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      opacity: 0.72,
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: "0 22px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: monoStack,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.16em",
                color: COLORS.mute,
                textTransform: "uppercase",
              }}
            >
              All past events
            </div>
            <div
              style={{
                padding: "4px 8px",
                borderRadius: 99,
                background: "#fff",
                border: `1px solid ${COLORS.line}`,
                color: COLORS.navy,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              Last 15 on Home
            </div>
          </div>

          {history.length === 0 ? (
            <div
              style={{
                margin: "0 22px",
                padding: "28px 20px",
                borderRadius: 18,
                border: `1px solid ${COLORS.line}`,
                background: "#fff",
                textAlign: "center",
                color: COLORS.mute,
                fontFamily: fontStack,
                fontSize: 13,
              }}
            >
              No past events found yet.
            </div>
          ) : (
            <div
              style={{
                padding: "0 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {history.map(({ event, status, clockIn }) => {
                const present = status === "present";
                const statusColor = present ? COLORS.green : COLORS.red;
                const eventVisual = getEventVisual(event);
                const location =
                  event.axm365_facilityname ||
                  event.axm365_description ||
                  "Location not set";

                return (
                  <div
                    key={event.axm365_eventid}
                    style={{
                      background: "#fff",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 18,
                      padding: 15,
                      display: "flex",
                      gap: 12,
                      boxShadow: "0 8px 20px -16px rgba(11,27,61,0.35)",
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        flexShrink: 0,
                        background: eventVisual.background,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      role="img"
                      aria-label={eventVisual.label}
                    >
                      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
                        {eventVisual.symbol}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            color: COLORS.navy,
                            fontFamily: displayStack,
                            fontSize: 15,
                            fontWeight: 800,
                            lineHeight: 1.2,
                          }}
                        >
                          {event.axm365_name || "Event"}
                        </div>
                        <div
                          style={{
                            flexShrink: 0,
                            padding: "4px 8px",
                            borderRadius: 99,
                            background: statusColor,
                            color: "#fff",
                            fontFamily: monoStack,
                            fontSize: 8.5,
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          {present ? "Present" : "Absent"}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                          color: COLORS.mute,
                          fontSize: 11.5,
                        }}
                      >
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <CalendarDays size={12} />
                          {dateLabel(event.axm365_eventdate)} · {timeLabel(event.axm365_eventdate)}
                        </span>
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <MapPin size={12} />
                          {location}
                        </span>
                        <span
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            color: present ? COLORS.green : COLORS.red,
                            fontWeight: 700,
                          }}
                        >
                          <Clock size={12} />
                          {present
                            ? `Clocked in at ${timeLabel(clockIn)}`
                            : "No clock-in record found"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div style={{ height: 30 }} />
    </>
  );
};
