import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, MapPin } from "lucide-react";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import { COLORS, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, SectionTitle, LoadingSpinner, ErrorBanner, StaleDataNotice } from "../components/shared";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";
import { byEventDateAscending } from "../utils/eventStatus";

const WEEKDAY_LABELS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

interface CalendarScreenProps {
  go: (id: ScreenId, playerId?: string, eventId?: string) => void;
  goBack?: () => void;
}

export const CalendarScreen: React.FC<CalendarScreenProps> = ({ go, goBack }) => {
  const { events, refreshEvents, ensureFresh, isLoadingResources, hasResourceErrors, hasStaleResources, getResourceError } = useData();
  const screenLoading = isLoadingResources(["events"]);
  const screenLoadError = hasResourceErrors(["events"]);
  const screenError = getResourceError(["events"]);
  const screenStale = hasStaleResources(["events"]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void ensureFresh(["events"]);
  }, [ensureFresh]);

  const refreshData = async () => {
    setRefreshing(true);
    await refreshEvents().catch(() => {});
    setRefreshing(false);
  };

  const showPreviousMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const showNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const firstWeekday = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const blankCellsBeforeFirstDay = (firstWeekday + 6) % 7;

  const eventsByDay: Record<number, Axm365_events[]> = {};
  events.forEach((event) => {
    if (!event.axm365_eventdate) return;
    const eventDate = new Date(event.axm365_eventdate);
    if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
      const day = eventDate.getDate();
      if (!eventsByDay[day]) eventsByDay[day] = [];
      eventsByDay[day].push(event);
    }
  });

  Object.values(eventsByDay).forEach((dayEvents) => dayEvents.sort(byEventDateAscending));

  const dayCells = Array.from({ length: blankCellsBeforeFirstDay + daysInMonth }, (_, i) =>
    i < blankCellsBeforeFirstDay ? null : i - blankCellsBeforeFirstDay + 1
  );

  const selectedEvents = eventsByDay[selectedDay] ?? [];
  const monthName = new Date(currentYear, currentMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker={monthName}
        title="Calendar"
        onBack={() => (goBack ? goBack() : go("home"))}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={refreshData}
              disabled={refreshing}
              style={{ width: 38, height: 38, borderRadius: 12, background: "#fff", border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: refreshing ? "not-allowed" : "pointer" }}
            >
              <RefreshCw size={17} color={COLORS.navy} strokeWidth={2} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button
              onClick={() => go("create")}
              style={{ width: 38, height: 38, borderRadius: 12, background: COLORS.navy, border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Plus size={18} color="#fff" strokeWidth={2} />
            </button>
          </div>
        }
      />

      {screenLoading && <LoadingSpinner label="Loading events…" />}
      {screenError && <ErrorBanner message={screenError} onRetry={refreshData} />}
      {screenStale && <StaleDataNotice />}

      {!screenLoading && !screenLoadError && (
        <>
          <div style={{ padding: "0 18px" }}>
            <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 22, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <button
                  onClick={showPreviousMonth}
                  style={{ background: "transparent", border: 0, cursor: "pointer" }}
                >
                  <ChevronLeft size={18} color={COLORS.navy} strokeWidth={2} />
                </button>
                <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 16, color: COLORS.navy }}>{monthName}</div>
                <button
                  onClick={showNextMonth}
                  style={{ background: "transparent", border: 0, cursor: "pointer" }}
                >
                  <ChevronRight size={18} color={COLORS.navy} strokeWidth={2} />
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} style={{ textAlign: "center", fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.14em", color: COLORS.mute, fontWeight: 600 }}>
                    {label}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {dayCells.map((day, i) => {
                  const isDayOfMonth = day !== null;
                  const isSelected = isDayOfMonth && day === selectedDay;
                  const dayEvents = isDayOfMonth ? (eventsByDay[day!] ?? []) : [];
                  return (
                    <button
                      key={i}
                      onClick={() => isDayOfMonth && setSelectedDay(day!)}
                      style={{ aspectRatio: "1", border: 0, background: isSelected ? COLORS.navy : "transparent", color: !isDayOfMonth ? "transparent" : isSelected ? "#fff" : COLORS.navy, borderRadius: 10, cursor: isDayOfMonth ? "pointer" : "default", fontFamily: displayStack, fontWeight: 700, fontSize: 13, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {isDayOfMonth ? day : ""}
                      {dayEvents.length > 0 && !isSelected && (
                        <span style={{ position: "absolute", bottom: 4, display: "flex", gap: 2 }}>
                          {dayEvents.slice(0, 2).map((_, k) => (
                            <span key={k} style={{ width: 4, height: 4, borderRadius: 99, background: k === 0 ? COLORS.yellow : COLORS.red }} />
                          ))}
                        </span>
                      )}
                      {dayEvents.length > 0 && isSelected && (
                        <span style={{ position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 99, background: COLORS.yellow }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ padding: "20px 22px 30px" }}>
            <SectionTitle
              eyebrow={new Date(currentYear, currentMonth, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              title={selectedEvents.length === 0 ? "No Events" : `${selectedEvents.length} Event${selectedEvents.length > 1 ? "s" : ""}`}
            />

            {selectedEvents.map((e) => {
              const startDate = e.axm365_eventdate ? new Date(e.axm365_eventdate) : null;
              const eventName = e.axm365_name || "Event";
              const location = lookupName(e, "axm365_facility") || e.axm365_description || "TBD";

              return (
                <div key={e.axm365_eventid} style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => go("attendance", undefined, e.axm365_eventid)}
                    aria-label={`Open attendance for ${eventName}`}
                    style={{
                      width: "100%",
                      background: "#fff",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 18,
                      padding: 16,
                      position: "relative",
                      overflow: "hidden",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: COLORS.yellow }} />
                    <div>
                      <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.2em", color: COLORS.mute, textTransform: "uppercase", fontWeight: 600 }}>
                        {startDate ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                      </div>
                      <div style={{ fontFamily: displayStack, fontSize: 18, fontWeight: 800, color: COLORS.navy, marginTop: 4, letterSpacing: "-0.01em" }}>{eventName}</div>
                      <div style={{ display: "flex", gap: 10, color: COLORS.mute, fontSize: 11.5, marginTop: 8 }}>
                        <span style={{ display: "flex", gap: 4, alignItems: "center" }}><MapPin size={12} /> {location}</span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};
