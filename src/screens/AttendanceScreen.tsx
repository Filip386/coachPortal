/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePortalTarget } from "../context/PhoneFrameContext";
import { ChevronLeft, Check, X, RefreshCw, Star, ChevronDown, Search } from "lucide-react";
import { Axm365_eventattendancesService } from "../generated/services/Axm365_eventattendancesService";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, LoadingSpinner, ErrorBanner } from "../components/shared";
import { Tally, MarkBtn, SuccessBanner } from "../components/ui";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

// "late" is kept in the model so previously-saved late records still load,
// but it is no longer selectable in the UI.
type AttendanceMark = "present" | "late" | "absent";

interface AttendanceScreenProps {
  go: (id: ScreenId) => void;
  initialEventId?: string | null;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({ go, initialEventId }) => {
  const portalTarget = usePortalTarget();
  const { players, events, attendances, loading, error, refreshAttendances } = useData();
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string>("all");
  const [showGenerationPicker, setShowGenerationPicker] = useState(false);
  const [genSearch, setGenSearch] = useState("");
  const [showEventPicker, setShowEventPicker] = useState(false);

  // Recent events the coach can switch between: today + yesterday only (older)
  
  const { recentEvents, lastEvent } = useMemo(() => {
    const dated = events.filter((e) => e.axm365_eventdate);
    const now = new Date();
    const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
    const byDateDesc = (a: any, b: any) =>
      new Date(b.axm365_eventdate).getTime() - new Date(a.axm365_eventdate).getTime();
    const recent = dated
      .filter((e) => {
        const t = new Date(e.axm365_eventdate!).getTime();
        return t >= startYesterday && t <= endToday;
      })
      .sort(byDateDesc);
    const past = dated.filter((e) => new Date(e.axm365_eventdate!).getTime() <= now.getTime()).sort(byDateDesc);
    const last = recent[0] ?? past[0] ?? [...dated].sort(byDateDesc)[0] ?? events[0];
    return { recentEvents: recent, lastEvent: last };
  }, [events]);

  // Distinct generations across the squad (for the top-right filter).
  const generations = useMemo(() => {
    const byId = new Map<string, string>();
    players.forEach((p) => {
      const id = (p as any)._cr9be_generation_value as string | undefined;
      const name = p.cr9be_generationname || lookupName(p, "cr9be_generation");
      if (id && name && !byId.has(id)) byId.set(id, name);
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  // Players shown = filtered by the chosen generation.
  const shownPlayers = useMemo(
    () =>
      selectedGenerationId === "all"
        ? players
        : players.filter((p) => (p as any)._cr9be_generation_value === selectedGenerationId),
    [players, selectedGenerationId]
  );

  const selectedGenerationName =
    selectedGenerationId === "all"
      ? "All Generations"
      : generations.find((g) => g.id === selectedGenerationId)?.name ?? "All Generations";

  // Set default event once events are available (only if no event was passed in)
  // — defaults to the last (most recent) event, e.g. when opened from the footer.
  useEffect(() => {
    if (events.length > 0 && !selectedEventId && !initialEventId) {
      setSelectedEventId(lastEvent?.axm365_eventid ?? events[0].axm365_eventid);
    }
  }, [events, lastEvent]);

  // Default everyone to Present, then overlay any saved records for this event.
  // The coach only needs to flip the absentees — fewest clicks.
  useEffect(() => {
    const base: Record<string, AttendanceMark> = {};
    for (const p of players) base[p.cr9be_playerid] = "present";
    if (selectedEventId) {
      const eventRecords = attendances.filter(
        (a) => (a as any)._axm365_event_value === selectedEventId
      );
      for (const record of eventRecords) {
        const playerId = (record as any)._axm365_player_value;
        if (playerId) base[playerId] = record.axm365_attended ? "present" : "absent";
      }
    }
    setMarks(base);
  }, [selectedEventId, attendances, players]);

  const setMark = (id: string, v: AttendanceMark) => setMarks((m) => ({ ...m, [id]: v }));

  // Counts for the players currently shown (late counts as present since hidden).
  const presentCount = shownPlayers.filter((p) => (marks[p.cr9be_playerid] ?? "present") !== "absent").length;
  const absentCount = shownPlayers.filter((p) => marks[p.cr9be_playerid] === "absent").length;
  const attendancePct = shownPlayers.length > 0 ? Math.round((presentCount / shownPlayers.length) * 100) : 0;

  const throwIfError = (result: any, context: string) => {
    const err = result?.error ?? result?.Error ?? result?.errorCode;
    if (err) throw new Error(`${context}: ${err?.message ?? err}`);
  };

  const saveAttendance = async () => {
    if (!selectedEventId) return;
    setSaveSuccess(false);
    setWriteError(null);
    if (shownPlayers.length === 0) {
      setWriteError("No players to save for this generation.");
      return;
    }
    try {
      setSaving(true);
      for (const p of shownPlayers) {
        const playerId = p.cr9be_playerid;
        const mark = marks[playerId] ?? "present";
        const attended = mark !== "absent";
        const existing = attendances.find((a) =>
          (a as any)._axm365_player_value === playerId &&
          (a as any)._axm365_event_value === selectedEventId
        );
        if (existing) {
          const res = await Axm365_eventattendancesService.update(
            existing.axm365_eventattendanceid,
            { axm365_name: p.cr9be_name, axm365_attended: attended } as any
          );
          throwIfError(res, `Update ${p.cr9be_name}`);
        } else {
          const res = await Axm365_eventattendancesService.create({
            axm365_name: p.cr9be_name,
            "axm365_Player@odata.bind": `/cr9be_players(${playerId})`,
            "axm365_Event@odata.bind": `/axm365_events(${selectedEventId})`,
            axm365_attended: attended,
          } as any);
          throwIfError(res, `Create ${p.cr9be_name}`);
        }
      }
      await refreshAttendances();
      setSaveSuccess(true);
      setTimeout(() => { go("home"); }, 1800);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const selectedEvent = events.find((e) => e.axm365_eventid === selectedEventId);
  const eventName = selectedEvent ? selectedEvent.axm365_name : "Select Event";

  return (
    <>
      <div style={{ background: COLORS.navy, color: "#fff", paddingBottom: 24 }}>
        <StatusBar />
        <div style={{ padding: "0 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => go("home")}
              style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.14)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <ChevronLeft size={18} color="#fff" strokeWidth={2} />
            </button>
            <button
              onClick={() => setShowGenerationPicker(true)}
              style={{ background: "rgba(255,255,255,0.1)", border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 10, color: COLORS.yellow, fontFamily: monoStack, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", padding: "6px 10px", cursor: "pointer", maxWidth: 190, display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedGenerationName}</span>
              <ChevronDown size={12} color={COLORS.yellow} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => recentEvents.length > 0 && setShowEventPicker(true)}
              disabled={recentEvents.length === 0}
              style={{ background: "transparent", border: 0, padding: 0, cursor: recentEvents.length > 0 ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontFamily: monoStack, fontSize: 10.5, letterSpacing: "0.22em", color: COLORS.yellow, fontWeight: 600, textTransform: "uppercase", textAlign: "left" }}>
                {eventName}
              </span>
              {recentEvents.length > 0 && <ChevronDown size={12} color={COLORS.yellow} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
            </button>
            <h1 style={{ fontFamily: displayStack, fontSize: 28, margin: "6px 0 0", lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 800 }}>
              Mark Attendance
            </h1>
          </div>

          {!loading && shownPlayers.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8, marginBottom: 6, fontFamily: monoStack, letterSpacing: "0.1em" }}>
                <span>{presentCount} of {shownPlayers.length} present</span>
                <span style={{ color: COLORS.yellow, fontWeight: 700 }}>{attendancePct}%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${attendancePct}%`, background: COLORS.yellow, borderRadius: 99, transition: "width 0.3s ease" }} />
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <Tally label="Present" count={presentCount} color={COLORS.green} />
                <Tally label="Absent" count={absentCount} color={COLORS.red} />
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && players.length === 0 && <LoadingSpinner label="Loading players…" />}
      {error && players.length === 0 && <ErrorBanner message={error} onRetry={() => refreshAttendances().catch(() => {})} />}
      {writeError && <ErrorBanner message={writeError} onRetry={saveAttendance} />}
      {saveSuccess && <SuccessBanner message="Attendance saved successfully!" />}

      {(!loading || players.length > 0) && shownPlayers.length > 0 && (
        <div style={{ padding: "18px 16px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shownPlayers.map((p) => {
              const playerId = p.cr9be_playerid;
              const name = p.cr9be_name || "Unknown Player";
              const num = p.cr9be_number ?? "?";
              const pos = lookupName(p, "cr9be_position");
              const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              const savedDraft = localStorage.getItem(`perf_draft_${playerId}`);
              const perfRating: number = savedDraft ? (JSON.parse(savedDraft).rating ?? 4) : 4;
              const isAbsent = marks[playerId] === "absent";
              return (
                <div key={playerId} style={{ background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 800, fontSize: 13, position: "relative" }}>
                    {initials}
                    <span style={{ position: "absolute", bottom: -3, right: -3, background: COLORS.yellow, color: COLORS.navy, fontSize: 9.5, fontWeight: 800, width: 18, height: 18, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid #fff` }}>
                      {num}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 13.5 }}>{name}</div>
                    <div style={{ fontSize: 10.5, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em", marginTop: 2 }}>
                      {pos ? `${pos} · ` : ""}#{num}
                    </div>
                    <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={11} color={n <= perfRating ? COLORS.yellow : COLORS.line} fill={n <= perfRating ? COLORS.yellow : "none"} strokeWidth={1.5} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <MarkBtn active={!isAbsent} onClick={() => setMark(playerId, "present")} bg={COLORS.green}><Check size={16} /></MarkBtn>
                    <MarkBtn active={isAbsent} onClick={() => setMark(playerId, "absent")} bg={COLORS.red}><X size={16} /></MarkBtn>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            disabled={saving}
            style={{ marginTop: 18, width: "100%", padding: "14px 0", background: saving ? COLORS.mute : COLORS.navy, color: "#fff", border: 0, borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={saveAttendance}
          >
            {saving && <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />}
            {saving ? "Saving…" : "Save Attendance →"}
          </button>
        </div>
      )}

      {!loading && shownPlayers.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: COLORS.mute }}>
          {players.length === 0
            ? "No players found. Please add players to your squad first."
            : "No players in this generation."}
        </div>
      )}

      {showGenerationPicker && (() => {
        const filteredGens = generations.filter((g) => g.name.toLowerCase().includes(genSearch.toLowerCase()));
        const options = [{ id: "all", name: "All Generations" }, ...filteredGens];
        const modal = (
          <div
            style={{ position: portalTarget ? "absolute" : "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}
            onClick={() => { setShowGenerationPicker(false); setGenSearch(""); }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "72vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div style={{ padding: "12px 0 4px", display: "flex", justifyContent: "center" }}>
                <div style={{ width: 40, height: 4, borderRadius: 99, background: COLORS.line }} />
              </div>

              <div style={{ padding: "8px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
                <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 18, color: COLORS.navy, marginBottom: 10 }}>Choose Generation</div>
                <div style={{ position: "relative" }}>
                  <Search size={14} color={COLORS.mute} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input
                    autoFocus
                    value={genSearch}
                    onChange={(e) => setGenSearch(e.target.value)}
                    placeholder="Search generations…"
                    style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 12, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13.5, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: COLORS.cream }}
                  />
                </div>
              </div>

              <div style={{ overflowY: "auto", padding: "10px 22px 30px", display: "flex", flexDirection: "column", gap: 8 }}>
                {options.length === 0 && (
                  <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>NO GENERATIONS FOUND</div>
                )}
                {options.map((g) => {
                  const isActive = g.id === selectedGenerationId;
                  return (
                    <button
                      key={g.id}
                      onClick={() => { setSelectedGenerationId(g.id); setShowGenerationPicker(false); setGenSearch(""); }}
                      style={{ background: isActive ? COLORS.navy : "#fff", border: `1px solid ${isActive ? COLORS.navy : COLORS.line}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: isActive ? "#fff" : COLORS.navy, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.name}
                        </div>
                      </div>
                      {isActive && <Check size={16} color={COLORS.yellow} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
        return portalTarget ? createPortal(modal, portalTarget) : modal;
      })()}

      {showEventPicker && (() => {
        const modal = (
          <div
            style={{ position: portalTarget ? "absolute" : "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}
            onClick={() => setShowEventPicker(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "72vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div style={{ padding: "12px 0 4px", display: "flex", justifyContent: "center" }}>
                <div style={{ width: 40, height: 4, borderRadius: 99, background: COLORS.line }} />
              </div>

              <div style={{ padding: "8px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
                <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 18, color: COLORS.navy }}>Choose Event</div>
                <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.12em", color: COLORS.mute, marginTop: 4, textTransform: "uppercase" }}>Today &amp; yesterday</div>
              </div>

              <div style={{ overflowY: "auto", padding: "10px 22px 30px", display: "flex", flexDirection: "column", gap: 8 }}>
                {recentEvents.length === 0 && (
                  <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>NO RECENT EVENTS</div>
                )}
                {recentEvents.map((e) => {
                  const isActive = e.axm365_eventid === selectedEventId;
                  const evDate = e.axm365_eventdate ? new Date(e.axm365_eventdate) : null;
                  return (
                    <button
                      key={e.axm365_eventid}
                      onClick={() => { setSelectedEventId(e.axm365_eventid); setShowEventPicker(false); }}
                      style={{ background: isActive ? COLORS.navy : "#fff", border: `1px solid ${isActive ? COLORS.navy : COLORS.line}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}
                    >
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: isActive ? COLORS.yellow : COLORS.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {evDate ? (
                          <>
                            <span style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 14, color: COLORS.navy, lineHeight: 1 }}>{evDate.getDate()}</span>
                            <span style={{ fontFamily: monoStack, fontSize: 8, color: COLORS.mute, letterSpacing: "0.1em", lineHeight: 1, marginTop: 2 }}>{evDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
                          </>
                        ) : (
                          <span style={{ fontFamily: monoStack, fontSize: 9, color: COLORS.mute }}>--</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: isActive ? "#fff" : COLORS.navy, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.axm365_name || "Unnamed Event"}
                        </div>
                        {evDate && (
                          <div style={{ fontSize: 10.5, color: isActive ? "rgba(255,255,255,0.6)" : COLORS.mute, fontFamily: monoStack, letterSpacing: "0.08em", marginTop: 2 }}>
                            {evDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
                            {" · "}
                            {evDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                      {isActive && <Check size={16} color={COLORS.yellow} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
        return portalTarget ? createPortal(modal, portalTarget) : modal;
      })()}
    </>
  );
};
