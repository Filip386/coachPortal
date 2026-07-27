/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePortalTarget } from "../context/PhoneFrameContext";
import { ChevronLeft, Check, X, RefreshCw, Star, ChevronDown, Search } from "lucide-react";
import { Axm365_eventattendancesService } from "../generated/services/Axm365_eventattendancesService";
import { Axm365_playereventperformancesService } from "../generated/services/Axm365_playereventperformancesService";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, LoadingSpinner, ErrorBanner, PlayerAvatar } from "../components/shared";
import { Tally, MarkBtn, SuccessBanner, AttributeSlider } from "../components/ui";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

type AttendanceMark = "present" | "late" | "absent";

const RATING_DEFAULTS: Record<number, number> = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };
const CODE_TO_STARS = (code?: number): number =>
  code !== undefined ? (code as number) - 693080000 + 1 : 2;
const recalcRating = (t: number, e: number, ta: number, tp: number): number => {
  const avg = (t + e + ta + tp) / 4;
  return avg < 20 ? 1 : avg < 40 ? 2 : avg < 60 ? 3 : avg < 80 ? 4 : 5;
};

interface AttendanceScreenProps {
  go: (id: ScreenId) => void;
  goBack?: () => void;
  initialEventId?: string | null;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({ go, goBack, initialEventId }) => {
  const portalTarget = usePortalTarget();
  const { players, events, attendances, performances, coachName, coachId, loading, error, refreshAttendances, refreshPerformances, allGenerations, generationsToCoaches } = useData();
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string>("all");
  const [genAutoSelected, setGenAutoSelected] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [showGenerationPicker, setShowGenerationPicker] = useState(false);
  const [genSearch, setGenSearch] = useState("");
  const [showEventPicker, setShowEventPicker] = useState(false);

  // Performance edit modal state
  const [perfEditPlayerId, setPerfEditPlayerId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(2);
  const [editTechnique, setEditTechnique] = useState(30);
  const [editEffort, setEditEffort] = useState(30);
  const [editTactical, setEditTactical] = useState(30);
  const [editTeamPlay, setEditTeamPlay] = useState(30);
  const [editNotes, setEditNotes] = useState("");
  const [perfSaving, setPerfSaving] = useState(false);
  const [perfSaveSuccess, setPerfSaveSuccess] = useState(false);
  const [perfSaveError, setPerfSaveError] = useState<string | null>(null);

  const { recentEvents, todayEvent } = useMemo(() => {
    const dated = events.filter((e) => e.axm365_eventdate);
    const now = new Date();
    const todayStr = now.toDateString();
    // Event picker shows last week's events only — days -8 through -2, excluding
    // today and yesterday (today's event is still auto-selected separately below).
    const startLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8).getTime();
    const endLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() - 1;
    const byDateDesc = (a: any, b: any) =>
      new Date(b.axm365_eventdate).getTime() - new Date(a.axm365_eventdate).getTime();
    const recent = dated
      .filter((e) => {
        const t = new Date(e.axm365_eventdate!).getTime();
        return t >= startLastWeek && t <= endLastWeek;
      })
      .sort(byDateDesc);
    const today = dated.find((e) => new Date(e.axm365_eventdate!).toDateString() === todayStr) ?? null;
    return { recentEvents: recent, todayEvent: today };
  }, [events]);

  // Build this coach's generation list from player records (reliable) + secondary junction table.
  // Falls back to all player generations when no coach-specific match (e.g. during load or test accounts).
  const generations = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];

    const coachPlayers = coachId
      ? players.filter((p) => (p as any)._cr9be_coach_value === coachId)
      : [];
    const sourcePlayers = coachPlayers.length > 0 ? coachPlayers : players;

    sourcePlayers.forEach((p) => {
      const id = (p as any)._cr9be_generation_value as string | undefined;
      const name = p.cr9be_generationname || lookupName(p, "cr9be_generation");
      if (id && name && !seen.has(id)) {
        seen.add(id);
        result.push({ id, name });
      }
    });

    // Secondary generations from the junction table (generationstocoaches)
    generationsToCoaches
      .filter((gtc) => (gtc as any)._axm365_coach_value === coachId)
      .forEach((gtc) => {
        const genId = (gtc as any)._axm365_generation_value as string | undefined;
        const genName = gtc.axm365_generationname;
        if (genId && genName && !seen.has(genId)) {
          seen.add(genId);
          result.push({ id: genId, name: genName });
        }
      });

    const yearOf = (s: string) => {
      const m = s.match(/\d{4}/) || s.match(/\d+/);
      return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
    };
    return result.sort((a, b) => {
      const ya = yearOf(a.name), yb = yearOf(b.name);
      return ya !== yb ? ya - yb : a.name.localeCompare(b.name);
    });
  }, [coachName, players, generationsToCoaches]);

  // Primary generation: first from Axm365_generations table for this coach,
  // falling back to first entry in the player-derived list above
  const primaryGenId = useMemo(() => {
    if (!coachId) return generations[0]?.id ?? null;
    const fromTable = allGenerations.find((g) => (g as any)._cr9be_coach_value === coachId);
    return fromTable?.axm365_generationid ?? generations[0]?.id ?? null;
  }, [coachId, allGenerations, generations]);

  useEffect(() => {
    if (primaryGenId && !genAutoSelected) {
      setSelectedGenerationId(primaryGenId);
      setGenAutoSelected(true);
    }
  }, [primaryGenId, genAutoSelected]);

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

  useEffect(() => {
    if (events.length > 0 && !selectedEventId && !initialEventId) {
      setSelectedEventId(todayEvent?.axm365_eventid ?? null);
    }
  }, [events, todayEvent]);

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

  // Load performance data when modal opens for a player+event
  useEffect(() => {
    if (!perfEditPlayerId || !selectedEventId) return;
    const existing = performances.find(
      (p) => p._axm365_cr9be_player_value === perfEditPlayerId && p._axm365_event_value === selectedEventId
    );
    if (existing) {
      const stars = CODE_TO_STARS(existing.axm365_raiting as number | undefined);
      setEditRating(stars);
      setEditTechnique(existing.axm365_technique ?? RATING_DEFAULTS[stars]);
      setEditEffort(existing.axm365_effort ?? RATING_DEFAULTS[stars]);
      setEditTactical(existing.axm365_tacticalawareness ?? RATING_DEFAULTS[stars]);
      setEditTeamPlay(existing.axm365_teamplay ?? RATING_DEFAULTS[stars]);
      setEditNotes(existing.axm365_notes ?? "");
    } else {
      setEditRating(2);
      setEditTechnique(30);
      setEditEffort(30);
      setEditTactical(30);
      setEditTeamPlay(30);
      setEditNotes("");
    }
    setPerfSaveSuccess(false);
    setPerfSaveError(null);
  }, [perfEditPlayerId, selectedEventId]);

  const handleEditRatingChange = (stars: number) => {
    const def = RATING_DEFAULTS[stars] ?? 50;
    setEditRating(stars);
    setEditTechnique(def);
    setEditEffort(def);
    setEditTactical(def);
    setEditTeamPlay(def);
  };

  const handleTechChange = (v: number) => { setEditTechnique(v); setEditRating(recalcRating(v, editEffort, editTactical, editTeamPlay)); };
  const handleEffortChange = (v: number) => { setEditEffort(v); setEditRating(recalcRating(editTechnique, v, editTactical, editTeamPlay)); };
  const handleTacticalChange = (v: number) => { setEditTactical(v); setEditRating(recalcRating(editTechnique, editEffort, v, editTeamPlay)); };
  const handleTeamPlayChange = (v: number) => { setEditTeamPlay(v); setEditRating(recalcRating(editTechnique, editEffort, editTactical, v)); };

  const savePerfData = async () => {
    if (!perfEditPlayerId || !selectedEventId) return;
    setPerfSaving(true);
    setPerfSaveError(null);
    try {
      const existing = performances.find(
        (p) => p._axm365_cr9be_player_value === perfEditPlayerId && p._axm365_event_value === selectedEventId
      );
      const perfPlayer = players.find((p) => p.cr9be_playerid === perfEditPlayerId);
      const selectedEvent = events.find((e) => e.axm365_eventid === selectedEventId);
      const ratingCode = 693080000 + (editRating - 1);
      const payload = {
        axm365_performancename: `${perfPlayer?.cr9be_name ?? "Player"} - ${selectedEvent?.axm365_name ?? "Event"}`,
        axm365_raiting: ratingCode as any,
        axm365_technique: editTechnique,
        axm365_effort: editEffort,
        axm365_tacticalawareness: editTactical,
        axm365_teamplay: editTeamPlay,
        axm365_notes: editNotes,
      };
      if (existing) {
        const res = await Axm365_playereventperformancesService.update(existing.axm365_playereventperformanceid, payload as any);
        if (!res.success) throw new Error((res.error as any)?.message ?? JSON.stringify(res.error) ?? "Update failed");
      } else {
        const res = await Axm365_playereventperformancesService.create({
          ...payload,
          "axm365_cr9be_Player@odata.bind": `/cr9be_players(${perfEditPlayerId})`,
          "axm365_Event@odata.bind": `/axm365_events(${selectedEventId})`,
        } as any);
        if (!res.success) throw new Error((res.error as any)?.message ?? JSON.stringify(res.error) ?? "Create failed");
      }
      refreshPerformances().catch(() => {});
      setPerfSaveSuccess(true);
      setTimeout(() => {
        setPerfSaveSuccess(false);
        setPerfEditPlayerId(null);
      }, 1500);
    } catch (err) {
      setPerfSaveError(err instanceof Error ? err.message : "Failed to save performance");
    } finally {
      setPerfSaving(false);
    }
  };

  const setMark = (id: string, v: AttendanceMark) => setMarks((m) => ({ ...m, [id]: v }));

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

  // Player whose performance modal is open
  const perfEditPlayer = players.find((p) => p.cr9be_playerid === perfEditPlayerId);

  return (
    <>
      <div style={{ background: COLORS.navy, color: "#fff", paddingBottom: 24 }}>
        <StatusBar />
        <div style={{ padding: "0 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => (goBack ? goBack() : go("home"))}
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

      {(!loading || players.length > 0) && shownPlayers.length > 0 && (selectedEventId || initialEventId) && (
        <div style={{ padding: "18px 16px 20px" }}>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={14} color={COLORS.mute} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search player…"
              style={{ width: "100%", padding: "10px 36px 10px 34px", borderRadius: 12, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13.5, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: "#fff" }}
            />
            {playerSearch.length > 0 && (
              <button
                onClick={() => setPlayerSearch("")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: 99, background: COLORS.line, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none" }}
              >
                <X size={11} color={COLORS.navy} strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shownPlayers.filter((p) => !playerSearch || (p.cr9be_name || "").toLowerCase().includes(playerSearch.toLowerCase())).map((p) => {
              const playerId = p.cr9be_playerid;
              const name = p.cr9be_name || "Unknown Player";
              const num = p.cr9be_number ?? "?";
              const pos = lookupName(p, "cr9be_position");
              const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

              // Get real performance data from Dataverse
              const existingPerf = performances.find(
                (perf) => perf._axm365_cr9be_player_value === playerId && perf._axm365_event_value === selectedEventId
              );
              const perfRating = existingPerf
                ? CODE_TO_STARS(existingPerf.axm365_raiting as number | undefined)
                : 2;

              const isAbsent = marks[playerId] === "absent";
              return (
                <div key={playerId} style={{ background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Clickable area for performance edit */}
                  <div
                    onClick={() => setPerfEditPlayerId(playerId)}
                    style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: "pointer", minWidth: 0 }}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <PlayerAvatar playerId={playerId} hasPicture={!!p.cr9be_pictureid} initials={initials} size={42} />
                      <span style={{ position: "absolute", bottom: -3, right: -3, background: COLORS.yellow, color: COLORS.navy, fontSize: 9.5, fontWeight: 800, width: 18, height: 18, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid #fff` }}>
                        {num}
                      </span>
                    </div>
                    <div style={{ minWidth: 0 }}>
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
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
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

      {!loading && !initialEventId && !todayEvent && events.length > 0 && (
        <div style={{ padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: COLORS.yellowSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={COLORS.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 17, color: COLORS.navy, marginBottom: 6 }}>No Event Today</div>
            <div style={{ fontSize: 13, color: COLORS.mute, lineHeight: 1.5 }}>There is no event scheduled for today.<br />Please create an event first.</div>
          </div>
          <button
            onClick={() => go("create")}
            style={{ marginTop: 4, background: COLORS.navy, color: "#fff", border: 0, padding: "12px 28px", borderRadius: 14, fontSize: 13.5, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}
          >
            Create Event →
          </button>
        </div>
      )}

      {!loading && shownPlayers.length === 0 && (selectedEventId || initialEventId) && (
        <div style={{ padding: 40, textAlign: "center", color: COLORS.mute }}>
          {players.length === 0
            ? "No players found. Please add players to your squad first."
            : "No players in this generation."}
        </div>
      )}

      {/* Generation picker modal */}
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
                        <div style={{ fontWeight: 700, color: isActive ? "#fff" : COLORS.navy, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
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

      {/* Event picker modal */}
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
                <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.12em", color: COLORS.mute, marginTop: 4, textTransform: "uppercase" }}>Last week</div>
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

      {/* Performance edit modal */}
      {perfEditPlayerId && (() => {
        const modal = (
          <div
            style={{ position: portalTarget ? "absolute" : "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
            onClick={() => !perfSaving && setPerfEditPlayerId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              {/* Handle */}
              <div style={{ padding: "12px 0 4px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ width: 40, height: 4, borderRadius: 99, background: COLORS.line }} />
              </div>

              {/* Header */}
              <div style={{ padding: "0 22px 14px", borderBottom: `1px solid ${COLORS.line}`, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {perfEditPlayer && (
                    <PlayerAvatar
                      playerId={perfEditPlayer.cr9be_playerid}
                      hasPicture={!!perfEditPlayer.cr9be_pictureid}
                      initials={(perfEditPlayer.cr9be_name || "P").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                      size={44}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 17, color: COLORS.navy }}>{perfEditPlayer?.cr9be_name || "Player"}</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.12em", marginTop: 1 }}>
                      {eventName} · Edit Performance
                    </div>
                  </div>
                  <button
                    onClick={() => setPerfEditPlayerId(null)}
                    style={{ width: 32, height: 32, borderRadius: 99, background: COLORS.cream, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <X size={14} color={COLORS.navy} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY: "auto", padding: "16px 22px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
                {perfSaveSuccess && (
                  <div style={{ background: COLORS.green, color: "#fff", borderRadius: 12, padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>
                    Performance saved!
                  </div>
                )}
                {perfSaveError && (
                  <div style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: 12, padding: "10px 14px", fontSize: 12 }}>
                    {perfSaveError}
                  </div>
                )}

                {/* Rating */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Session Rating
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => handleEditRatingChange(n)}
                        style={{ width: 42, height: 42, borderRadius: 12, border: 0, background: n <= editRating ? COLORS.yellow : "#F3F0E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <Star size={19} color={n <= editRating ? COLORS.navy : COLORS.mute} fill={n <= editRating ? COLORS.navy : "none"} strokeWidth={2} />
                      </button>
                    ))}
                    <div style={{ marginLeft: "auto", fontFamily: displayStack, fontWeight: 800, fontSize: 28, color: COLORS.navy }}>{editRating}.0</div>
                  </div>
                  <div style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.1em", marginTop: 6 }}>
                    Changing rating resets sliders · Sliders update rating automatically
                  </div>
                </div>

                {/* Sliders */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 12 }}>
                    Attributes
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <AttributeSlider label="Technique" value={editTechnique} onChange={handleTechChange} />
                    <AttributeSlider label="Effort" value={editEffort} onChange={handleEffortChange} />
                    <AttributeSlider label="Tactical Awareness" value={editTactical} onChange={handleTacticalChange} />
                    <AttributeSlider label="Team Play" value={editTeamPlay} onChange={handleTeamPlayChange} />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Notes
                  </div>
                  <div style={{ background: COLORS.cream, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 12 }}>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder={`Notes for ${perfEditPlayer?.cr9be_name ?? "player"}…`}
                      style={{ width: "100%", minHeight: 70, border: 0, outline: 0, fontFamily: fontStack, fontSize: 13, color: COLORS.ink, lineHeight: 1.55, resize: "vertical", background: "transparent" }}
                    />
                  </div>
                </div>

                {/* Save button */}
                <button
                  disabled={perfSaving}
                  onClick={savePerfData}
                  style={{ width: "100%", padding: "14px 0", background: perfSaving ? COLORS.mute : COLORS.navy, color: "#fff", border: 0, borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: perfSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {perfSaving && <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />}
                  {perfSaving ? "Saving…" : "Save Performance →"}
                </button>
              </div>
            </div>
          </div>
        );
        return portalTarget ? createPortal(modal, portalTarget) : modal;
      })()}
    </>
  );
};
