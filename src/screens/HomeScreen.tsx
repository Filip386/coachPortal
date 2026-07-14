 
import React from "react";
import { Clock, MapPin, Plus, TrendingUp, CircleDollarSign, Users, ArrowUpRight, ChevronRight } from "lucide-react";
import { COLORS, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, SectionTitle, ActionTile, ErrorBanner } from "../components/shared";
import { Stat, Divider } from "../components/ui";
import { useData } from "../context/DataContext";
import { getInvoiceStatus } from "../utils/invoiceStatus";

interface HomeScreenProps {
  go: (id: ScreenId, playerId?: string, eventId?: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ go }) => {
  const { coachName, players, events, invoices, loading, error, refreshAll } = useData();
  const firstName = coachName ? coachName.split(" ")[0] : null;

  const todayEvent = events.find((e) => {
    const d = e.axm365_eventdate;
    if (!d) return false;
    return new Date(d).toDateString() === new Date().toDateString();
  }) ?? null;

  const squadCount = players.length;
  const overdueInvoices = invoices.filter((inv) => getInvoiceStatus(inv) === "Overdue");
  const now = new Date();
  const upcoming = events
    .filter((e) => e.axm365_eventdate && new Date(e.axm365_eventdate) >= now)
    .sort((a, b) => new Date(a.axm365_eventdate!).getTime() - new Date(b.axm365_eventdate!).getTime())
    .slice(0, 3);

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
              <div style={{ fontWeight: 700, fontSize: 13 }}>Coach Portal</div>
            </div>
          </div>
          <button
            onClick={() => go("invoices")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            {overdueInvoices.length > 0 && (
              <span style={{ position: "absolute", top: 7, right: 7, width: 8, height: 8, background: COLORS.yellow, borderRadius: 99, border: `2px solid ${COLORS.navy}` }} />
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
          {loading ? (
            <div style={{ marginTop: 16, opacity: 0.6, fontFamily: monoStack, fontSize: 11 }}>Loading stats…</div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", gap: 22 }}>
              <Stat label="Squad" value={String(squadCount)} />
              <Divider />
              <Stat label="Events" value={String(events.length)} />
              <Divider />
              <Stat label="Overdue" value={String(overdueInvoices.length)} warn={overdueInvoices.length > 0} />
            </div>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={refreshAll} />}

      {!loading && (
        <div style={{ padding: "0 18px", marginTop: 16 }}>
          <div
            onClick={() => todayEvent && go("attendance")}
            style={{ background: "#fff", borderRadius: 22, padding: 18, boxShadow: "0 14px 30px -12px rgba(11,27,61,0.22)", border: `1px solid ${COLORS.line}`, cursor: todayEvent ? "pointer" : "default" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: todayEvent ? COLORS.yellowSoft : COLORS.line, padding: "4px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.navy, textTransform: "uppercase" }}>
                  <span style={{ width: 6, height: 6, background: todayEvent ? COLORS.navy : COLORS.mute, borderRadius: 99 }} />
                  {todayEvent ? "Live · Today" : "No Event Today"}
                </div>
                <h3 style={{ margin: "10px 0 4px", fontFamily: displayStack, fontSize: 20, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.01em" }}>
                  {todayEvent ? (todayEvent.axm365_name || "Event") : "No Event Scheduled"}
                </h3>
                {todayEvent && (
                  <div style={{ display: "flex", gap: 12, color: COLORS.mute, fontSize: 12, marginTop: 6 }}>
                    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <Clock size={12} />
                      {todayEvent.axm365_eventdate ? new Date(todayEvent.axm365_eventdate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                    </span>
                    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <MapPin size={12} />
                      {todayEvent.axm365_description || "TBD"}
                    </span>
                  </div>
                )}
              </div>
              {todayEvent && (
                <div style={{ textAlign: "right", fontFamily: displayStack }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.navy, lineHeight: 1 }}>{squadCount}</div>
                  <div style={{ fontSize: 9.5, fontFamily: monoStack, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600 }}>Players</div>
                </div>
              )}
            </div>
            {todayEvent && (
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={(e) => { e.stopPropagation(); go("attendance"); }} style={{ flex: 1, background: COLORS.navy, color: "#fff", border: 0, padding: "11px 0", borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>
                  Mark Attendance
                </button>
                <button onClick={(e) => { e.stopPropagation(); go("performance", undefined, todayEvent?.axm365_eventid); }} style={{ flex: 1, background: COLORS.yellow, color: COLORS.navy, border: 0, padding: "11px 0", borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>
                  Performance
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "26px 22px 8px" }}>
        <SectionTitle eyebrow="Shortcuts" title="Quick Actions" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <ActionTile color={COLORS.navy} text="#fff" icon={Plus} title="Create Event" sub="Schedule a session" onClick={() => go("create")} />
          <ActionTile color={COLORS.yellow} text={COLORS.navy} icon={TrendingUp} title="Performance" sub="Latest stats & ratings" onClick={() => go("performance")} />
          <ActionTile color="#fff" text={COLORS.navy} icon={CircleDollarSign} title="Invoices" sub={overdueInvoices.length > 0 ? `${overdueInvoices.length} overdue` : "All clear"} onClick={() => go("invoices")} bordered />
          <ActionTile color="#fff" text={COLORS.navy} icon={Users} title="My Squad" sub={`${squadCount} players`} onClick={() => go("players")} bordered />
        </div>
      </div>

      {!loading && upcoming.length > 0 && (
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