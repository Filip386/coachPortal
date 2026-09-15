import React, { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, ClipboardCheck, MapPin } from "lucide-react";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import { COLORS, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, SectionTitle, LoadingSpinner, ErrorBanner } from "../components/shared";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

interface CalendarScreenProps {
  go: (id: ScreenId, playerId?: string, eventId?: string) => void;
  goBack?: () => void;
}

export const CalendarScreen: React.FC<CalendarScreenProps> = ({ go, goBack }) => {
  const { events, loading, error, refreshEvents } = useData();
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = async () => {
    setRefreshing(true);
    await refreshEvents().catch(() => {});
    setRefreshing(false);
  };

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const eventsByDay: Record<number, Axm365_events[]> = {};
  events.forEach((e) => {
    const d = e.axm365_eventdate;
    if (!d) return;
    const evDate = new Date(d);
    if (evDate.getMonth() === currentMonth && evDate.getFullYear() === currentYear) {
      const day = evDate.getDate();
      if (!eventsByDay[day]) eventsByDay[day] = [];
      eventsByDay[day].push(e);
    }
  });

  // Events arrive in whatever order Dataverse returned them, which is not
  // chronological, so a day holding 17:00 and 17:30 could list them either
  // way round. Sort each day by start time so the list reads down the day.
  // Every event in a bucket passed the `if (!d) return` guard above, so the
  // date is always present here.
  Object.values(eventsByDay).forEach((dayEvents) => {
    dayEvents.sort(
      (a, b) =>
        new Date(a.axm365_eventdate!).getTime() -
        new Date(b.axm365_eventdate!).getTime()
    );
  });

  const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const cells = Array.from({ length: startOffset + daysInMonth }, (_, i) =>
    i < startOffset ? null : i - startOffset + 1
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

      {loading && events.length === 0 && <LoadingSpinner label="Loading events…" />}
      {error && events.length === 0 && <ErrorBanner message={error} onRetry={refreshData} />}

      {(!loading || events.length > 0) && (
        <>
          <div style={{ padding: "0 18px" }}>
            <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 22, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <button
                  onClick={() => {
                    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
                    else setCurrentMonth((m) => m - 1);
                  }}
                  style={{ background: "transparent", border: 0, cursor: "pointer" }}
                >
                  <ChevronLeft size={18} color={COLORS.navy} strokeWidth={2} />
                </button>
                <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 16, color: COLORS.navy }}>{monthName}</div>
                <button
                  onClick={() => {
                    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
                    else setCurrentMonth((m) => m + 1);
                  }}
                  style={{ background: "transparent", border: 0, cursor: "pointer" }}
                >
                  <ChevronRight size={18} color={COLORS.navy} strokeWidth={2} />
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                {days.map((d) => (
                  <div key={d} style={{ textAlign: "center", fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.14em", color: COLORS.mute, fontWeight: 600 }}>
                    {d}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {cells.map((n, i) => {
                  const isMonth = n !== null;
                  const isSelected = isMonth && n === selectedDay;
                  const evs = isMonth ? (eventsByDay[n!] ?? []) : [];
                  return (
                    <button
                      key={i}
                      onClick={() => isMonth && setSelectedDay(n!)}
                      style={{ aspectRatio: "1", border: 0, background: isSelected ? COLORS.navy : "transparent", color: !isMonth ? "transparent" : isSelected ? "#fff" : COLORS.navy, borderRadius: 10, cursor: isMonth ? "pointer" : "default", fontFamily: displayStack, fontWeight: 700, fontSize: 13, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {isMonth ? n : ""}
                      {evs.length > 0 && !isSelected && (
                        <span style={{ position: "absolute", bottom: 4, display: "flex", gap: 2 }}>
                          {evs.slice(0, 2).map((_, k) => (
                            <span key={k} style={{ width: 4, height: 4, borderRadius: 99, background: k === 0 ? COLORS.yellow : COLORS.red }} />
                          ))}
                        </span>
                      )}
                      {evs.length > 0 && isSelected && (
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
                  <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 18, padding: 16, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: COLORS.yellow }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.2em", color: COLORS.mute, textTransform: "uppercase", fontWeight: 600 }}>
                          {startDate ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                        </div>
                        <div style={{ fontFamily: displayStack, fontSize: 18, fontWeight: 800, color: COLORS.navy, marginTop: 4, letterSpacing: "-0.01em" }}>{eventName}</div>
                        <div style={{ display: "flex", gap: 10, color: COLORS.mute, fontSize: 11.5, marginTop: 8 }}>
                          <span style={{ display: "flex", gap: 4, alignItems: "center" }}><MapPin size={12} /> {location}</span>
                        </div>
                      </div>
                      <button onClick={() => go("attendance", undefined, e.axm365_eventid)} style={{ background: "transparent", border: 0, cursor: "pointer" }}>
                        <ClipboardCheck size={16} color={COLORS.navy} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};
