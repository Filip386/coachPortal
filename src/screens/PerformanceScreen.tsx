/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Star, Search, ChevronDown, Pencil, X, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { COLORS, fontStack, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, SectionTitle, LoadingSpinner, ErrorBanner } from "../components/shared";
import { AttributeBar, AttributeSlider } from "../components/ui";
import { useData } from "../context/DataContext";
import { usePortalTarget } from "../context/PhoneFrameContext";
import { Axm365_playereventperformancesService } from "../generated/services/Axm365_playereventperformancesService";
import { lookupName } from "../utils/dataverse";

const CODE_TO_STARS = (code?: number): number =>
  code !== undefined ? (code as number) - 693080000 + 1 : 2;

const DEFAULT_ATTR_FOR_RATING: Record<number, number> = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };

const recalcRating = (t: number, e: number, ta: number, tp: number): number => {
  const avg = (t + e + ta + tp) / 4;
  return avg < 20 ? 1 : avg < 40 ? 2 : avg < 60 ? 3 : avg < 80 ? 4 : 5;
};

interface PerformanceScreenProps {
  go: (id: ScreenId, playerId?: string) => void;
  goBack?: () => void;
  selectedPlayerId?: string | null;
}

export const PerformanceScreen: React.FC<PerformanceScreenProps> = ({ go, goBack, selectedPlayerId }) => {
  const { players, performances, events, loading, error, refreshPlayers, refreshPerformances, coachId, allGenerations, generationsToCoaches } = useData();
  const portalTarget = usePortalTarget();
  const [selectedId, setSelectedId] = useState<string | null>(selectedPlayerId ?? null);
  const [selectedGenId, setSelectedGenId] = useState("all");
  const [genAutoSelected, setGenAutoSelected] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Performance edit modal state — event selection is optional
  const [showEditModal, setShowEditModal] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [editRating, setEditRating] = useState(2);
  const [editTechnique, setEditTechnique] = useState(30);
  const [editEffort, setEditEffort] = useState(30);
  const [editTactical, setEditTactical] = useState(30);
  const [editTeamPlay, setEditTeamPlay] = useState(30);
  const [editNotes, setEditNotes] = useState("");
  const [perfSaving, setPerfSaving] = useState(false);
  const [perfSaveSuccess, setPerfSaveSuccess] = useState(false);
  const [perfSaveError, setPerfSaveError] = useState<string | null>(null);

  const generationTabs = useMemo(() => {
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

    generationsToCoaches
      .filter((gtc) => (gtc as any)._axm365_coach_value === coachId)
      .forEach((gtc) => {
        const id = (gtc as any)._axm365_generation_value as string | undefined;
        const name = gtc.axm365_generationname;
        if (id && name && !seen.has(id)) {
          seen.add(id);
          result.push({ id, name });
        }
      });

    const yearOf = (s: string) => { const m = s.match(/\d{4}/) || s.match(/\d+/); return m ? parseInt(m[0], 10) : Infinity; };
    return result.sort((a, b) => { const ya = yearOf(a.name), yb = yearOf(b.name); return ya !== yb ? ya - yb : a.name.localeCompare(b.name); });
  }, [coachId, players, generationsToCoaches]);

  const primaryGenId = useMemo(() => {
    if (!coachId) return generationTabs[0]?.id ?? null;
    const fromTable = allGenerations.find((g) => (g as any)._cr9be_coach_value === coachId);
    return fromTable?.axm365_generationid ?? generationTabs[0]?.id ?? null;
  }, [coachId, allGenerations, generationTabs]);

  useEffect(() => {
    if (primaryGenId && !genAutoSelected) {
      setSelectedGenId(primaryGenId);
      setGenAutoSelected(true);
      const first = players.filter((p) => (p as any)._cr9be_generation_value === primaryGenId)[0];
      if (first) setSelectedId(first.cr9be_playerid);
    }
  }, [primaryGenId, genAutoSelected, players]);

  useEffect(() => {
    if (!selectedPlayerId) return;
    setSelectedId(selectedPlayerId);
    const p = players.find((pl) => pl.cr9be_playerid === selectedPlayerId);
    const genId = (p as any)?._cr9be_generation_value as string | undefined;
    if (genId) setSelectedGenId(genId);
  }, [selectedPlayerId, players]);

  useEffect(() => {
    if (!selectedId && players.length > 0) setSelectedId(players[0].cr9be_playerid);
  }, [players, selectedId]);

  const playersInGen = useMemo(
    () => selectedGenId === "all" ? players : players.filter((p) => (p as any)._cr9be_generation_value === selectedGenId),
    [players, selectedGenId]
  );

  const filteredPlayers = search
    ? playersInGen.filter((p) => (p.cr9be_name || "").toLowerCase().includes(search.toLowerCase()))
    : playersInGen;

  const player = players.find((p) => p.cr9be_playerid === selectedId);
  const playerName = player ? (player.cr9be_name || "Player") : "Player";
  const playerPos = lookupName(player, "cr9be_position");
  const playerNum = player ? (player.cr9be_number ?? "?") : "?";
  const initials = playerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // Memoized on [performances, selectedId] so the array reference is stable across
  // re-renders — otherwise the Edit Mode prefill effect below (which depends on
  // playerPerfsSorted) would re-fire on every keystroke/slider drag and reset the
  // sliders back to the loaded values before the user's change could register.
  const playerPerfs = useMemo(
    () => performances.filter((p) => p._axm365_cr9be_player_value === selectedId),
    [performances, selectedId]
  );
  const hasData = playerPerfs.length > 0;

  // Most recent performance first — every save creates a new record, so createdon
  // (the Dataverse-assigned creation timestamp) reflects the true chronological
  // history instead of an overwritten single row or API return order.
  const playerPerfsSorted = useMemo(
    () => [...playerPerfs].sort((a, b) => new Date(b.createdon ?? 0).getTime() - new Date(a.createdon ?? 0).getTime()),
    [playerPerfs]
  );
  const latestPerf = playerPerfsSorted[0];
  const previousPerf = playerPerfsSorted[1];

  const latestRatingStars = latestPerf ? CODE_TO_STARS(latestPerf.axm365_raiting as number | undefined) : 2;
  const previousRatingStars = previousPerf ? CODE_TO_STARS(previousPerf.axm365_raiting as number | undefined) : null;
  const ratingChange = previousRatingStars !== null ? latestRatingStars - previousRatingStars : null;

  const latestTechnique = latestPerf?.axm365_technique ?? DEFAULT_ATTR_FOR_RATING[latestRatingStars];
  const latestEffort = latestPerf?.axm365_effort ?? DEFAULT_ATTR_FOR_RATING[latestRatingStars];
  const latestTactical = latestPerf?.axm365_tacticalawareness ?? DEFAULT_ATTR_FOR_RATING[latestRatingStars];
  const latestTeamPlay = latestPerf?.axm365_teamplay ?? DEFAULT_ATTR_FOR_RATING[latestRatingStars];

  const sortedEvents = useMemo(() => {
    const now = new Date();
    // Event picker shows last week's events only — days -8 through -2, excluding
    // today and yesterday. Mirrors the same window used in Mark Attendance.
    const startLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8).getTime();
    const endLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() - 1;
    return events
      .filter((e) => {
        if (!e.axm365_eventdate) return false;
        const t = new Date(e.axm365_eventdate).getTime();
        return t >= startLastWeek && t <= endLastWeek;
      })
      .sort((a, b) => new Date(b.axm365_eventdate ?? 0).getTime() - new Date(a.axm365_eventdate ?? 0).getTime());
  }, [events]);

  const filteredEvents = eventSearch
    ? sortedEvents.filter((e) => (e.axm365_name || "").toLowerCase().includes(eventSearch.toLowerCase()))
    : sortedEvents;

  const openEditModal = () => {
    // Edit Mode always starts without an event — the coach picks one (or leaves it
    // unset) explicitly every time, and can remove it again via the clear button.
    setEditEventId(null);
    setPerfSaveSuccess(false);
    setPerfSaveError(null);
    setEventPickerOpen(false);
    setEventSearch("");
    setShowEditModal(true);
  };

  // Prefill Edit Mode with the player's last saved performance so the coach only has
  // to adjust what changed. If the chosen event already has its own record, that
  // takes precedence over the player's overall most-recent record.
  useEffect(() => {
    if (!showEditModal || !selectedId) return;
    const eventMatch = editEventId
      ? performances.find(
          (p) => p._axm365_cr9be_player_value === selectedId && p._axm365_event_value === editEventId
        )
      : undefined;
    const source = eventMatch ?? playerPerfsSorted[0];
    if (source) {
      const stars = CODE_TO_STARS(source.axm365_raiting as number | undefined);
      setEditRating(stars);
      setEditTechnique(source.axm365_technique ?? DEFAULT_ATTR_FOR_RATING[stars]);
      setEditEffort(source.axm365_effort ?? DEFAULT_ATTR_FOR_RATING[stars]);
      setEditTactical(source.axm365_tacticalawareness ?? DEFAULT_ATTR_FOR_RATING[stars]);
      setEditTeamPlay(source.axm365_teamplay ?? DEFAULT_ATTR_FOR_RATING[stars]);
      setEditNotes(source.axm365_notes ?? "");
    } else {
      setEditRating(2);
      setEditTechnique(30);
      setEditEffort(30);
      setEditTactical(30);
      setEditTeamPlay(30);
      setEditNotes("");
    }
  }, [editEventId, selectedId, showEditModal, performances, playerPerfsSorted]);

  const handleEditRatingChange = (stars: number) => {
    const def = DEFAULT_ATTR_FOR_RATING[stars] ?? 50;
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

  const savePlayerPerformance = async () => {
    if (!selectedId) return;
    setPerfSaving(true);
    setPerfSaveError(null);
    try {
      const selectedEvent = editEventId ? events.find((e) => e.axm365_eventid === editEventId) : undefined;
      const ratingCode = 693080000 + (editRating - 1);
      // Always creates a new record — never overwrites a prior one — so the full
      // performance history is preserved for the "most recent" display.
      const res = await Axm365_playereventperformancesService.create({
        axm365_performancename: `${playerName} - ${selectedEvent?.axm365_name ?? "General"}`,
        axm365_raiting: ratingCode as any,
        axm365_technique: editTechnique,
        axm365_effort: editEffort,
        axm365_tacticalawareness: editTactical,
        axm365_teamplay: editTeamPlay,
        axm365_notes: editNotes,
        "axm365_cr9be_Player@odata.bind": `/cr9be_players(${selectedId})`,
        ...(editEventId && { "axm365_Event@odata.bind": `/axm365_events(${editEventId})` }),
      } as any);
      if (!res.success) throw new Error((res.error as any)?.message ?? JSON.stringify(res.error) ?? "Create failed");
      await refreshPerformances().catch(() => {});
      setPerfSaveSuccess(true);
      setTimeout(() => {
        setPerfSaveSuccess(false);
        setShowEditModal(false);
      }, 1500);
    } catch (err) {
      setPerfSaveError(err instanceof Error ? err.message : "Failed to save performance");
    } finally {
      setPerfSaving(false);
    }
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader kicker="Player Stats" title="Performance" onBack={() => (goBack ? goBack() : go("home"))} />

      {loading && players.length === 0 && <LoadingSpinner label="Loading players…" />}
      {error && players.length === 0 && <ErrorBanner message={error} onRetry={() => refreshPlayers().catch(() => {})} />}

      {(!loading || players.length > 0) && players.length > 0 && (
        <>
          {/* Generation filter */}
          {generationTabs.length > 0 && (
            <div style={{ padding: "0 22px 10px", display: "flex", gap: 6, overflowX: "auto" }}>
              {[{ id: "all", name: "ALL" }, ...generationTabs].map((tab) => {
                const active = selectedGenId === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => { if (active && el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }}
                    onClick={() => {
                      setSelectedGenId(tab.id);
                      const first = (tab.id === "all" ? players : players.filter((p) => (p as any)._cr9be_generation_value === tab.id))[0];
                      setSelectedId(first?.cr9be_playerid ?? null);
                    }}
                    style={{ flex: "0 0 auto", padding: "7px 14px", background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: `1px solid ${active ? COLORS.navy : COLORS.line}`, borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: monoStack, letterSpacing: "0.08em" }}
                  >
                    {tab.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Player dropdown with search */}
          <div style={{ padding: "0 22px 12px", position: "relative" }}>
            <button
              onClick={() => { setDropdownOpen(!dropdownOpen); setSearch(""); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, cursor: "pointer", textAlign: "left" }}
            >
              {player && (
                <span style={{ width: 28, height: 28, borderRadius: 8, background: COLORS.navy, color: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, fontFamily: displayStack, flexShrink: 0 }}>
                  {initials}
                </span>
              )}
              <span style={{ flex: 1, fontFamily: fontStack, fontSize: 13.5, fontWeight: 700, color: COLORS.navy }}>
                {player ? playerName : "Select player…"}
              </span>
              <ChevronDown size={16} color={COLORS.mute} style={{ transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
            </button>

            {dropdownOpen && (
              <div style={{ position: "absolute", top: "100%", left: 22, right: 22, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 260 }}>
                <div style={{ padding: 8, borderBottom: `1px solid ${COLORS.line}`, flexShrink: 0 }}>
                  <div style={{ position: "relative" }}>
                    <Search size={13} color={COLORS.mute} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search player…"
                      style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: COLORS.cream }}
                    />
                  </div>
                </div>
                <div style={{ overflowY: "auto" }}>
                  {filteredPlayers.length === 0 && (
                    <div style={{ padding: 16, textAlign: "center", color: COLORS.mute, fontFamily: monoStack, fontSize: 11, letterSpacing: "0.1em" }}>NO PLAYERS FOUND</div>
                  )}
                  {filteredPlayers.map((p) => {
                    const pid = p.cr9be_playerid;
                    const name = p.cr9be_name || "Player";
                    const ini = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                    const active = selectedId === pid;
                    return (
                      <button
                        key={pid}
                        onClick={() => { setSelectedId(pid); setDropdownOpen(false); setSearch(""); }}
                        style={{ width: "100%", padding: "10px 14px", background: active ? COLORS.yellowSoft : "transparent", border: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: `1px solid ${COLORS.line}` }}
                      >
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: active ? COLORS.yellow : COLORS.cream, color: COLORS.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, fontFamily: displayStack, flexShrink: 0 }}>
                          {ini}
                        </span>
                        <span style={{ fontFamily: fontStack, fontSize: 13.5, fontWeight: active ? 700 : 500, color: COLORS.navy, textAlign: "left" }}>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {player && (
            <div style={{ padding: "0 22px" }}>
              <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 22, padding: 18, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -30, right: -30, width: 130, height: 130, background: COLORS.yellowSoft, borderRadius: "50%", opacity: 0.7 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: COLORS.navy, color: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 900, fontSize: 22 }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontFamily: displayStack, fontSize: 19, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.01em" }}>{playerName}</div>
                    <div style={{ fontSize: 11, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.12em", marginTop: 2 }}>{playerPos ? `${playerPos} · ` : ""}#{playerNum}</div>
                  </div>
                  <div style={{ marginLeft: "auto", position: "relative", textAlign: "right" }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 900, fontSize: 32, color: COLORS.navy, lineHeight: 1 }}>{latestRatingStars}.0</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9, letterSpacing: "0.14em", color: COLORS.mute, textAlign: "right", marginTop: 2 }}>LATEST RATING</div>
                    {ratingChange !== null && ratingChange !== 0 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 4, fontFamily: monoStack, fontSize: 10.5, fontWeight: 700, color: ratingChange > 0 ? COLORS.green : COLORS.red }}>
                        {ratingChange > 0 ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />}
                        {ratingChange > 0 ? `+${ratingChange}` : ratingChange}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 14, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={18} color={n <= latestRatingStars ? COLORS.yellow : COLORS.line} fill={n <= latestRatingStars ? COLORS.yellow : "none"} strokeWidth={2} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: hasData ? COLORS.yellowSoft : COLORS.cream, border: `1px solid ${hasData ? COLORS.yellow : COLORS.line}`, borderRadius: 99, padding: "4px 10px" }}>
                        <span style={{ fontFamily: monoStack, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.navy }}>
                          {hasData ? `${playerPerfs.length} EVENT${playerPerfs.length !== 1 ? "S" : ""}` : "NO DATA YET"}
                        </span>
                      </div>
                      <button
                        onClick={openEditModal}
                        style={{ width: 30, height: 30, borderRadius: 10, background: COLORS.navy, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        <Pencil size={13} color={COLORS.yellow} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: "18px 22px 30px" }}>
            <SectionTitle eyebrow="Latest Performance" title="Attributes" />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <AttributeBar label="Technique" value={latestTechnique} />
              <AttributeBar label="Effort" value={latestEffort} />
              <AttributeBar label="Tactical Awareness" value={latestTactical} />
              <AttributeBar label="Team Play" value={latestTeamPlay} />
            </div>
          </div>
        </>
      )}

      {!loading && players.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: COLORS.mute }}>
          No players found. Please add players to your squad first.
        </div>
      )}

      {/* Overall performance edit modal — saved without an event link */}
      {showEditModal && player && (() => {
        const modal = (
          <div
            style={{ position: portalTarget ? "absolute" : "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
            onClick={() => !perfSaving && setShowEditModal(false)}
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
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: COLORS.navy, color: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 900, fontSize: 16 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 17, color: COLORS.navy }}>{playerName}</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.12em", marginTop: 1 }}>
                      {editEventId ? (events.find((e) => e.axm365_eventid === editEventId)?.axm365_name ?? "Event") : "No Event"} · Edit Performance
                    </div>
                  </div>
                  <button
                    onClick={() => setShowEditModal(false)}
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

                {/* Event — optional */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Event <span style={{ color: COLORS.mute, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}></span>
                  </div>
                  <div
                    onClick={() => setEventPickerOpen((v) => !v)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: COLORS.cream, border: `1px solid ${COLORS.line}`, borderRadius: 14, cursor: "pointer" }}
                  >
                    <span style={{ flex: 1, fontFamily: fontStack, fontSize: 13.5, fontWeight: 700, color: editEventId ? COLORS.navy : COLORS.mute }}>
                      {editEventId ? (events.find((e) => e.axm365_eventid === editEventId)?.axm365_name || "Unnamed Event") : "Select event…"}
                    </span>
                    {editEventId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditEventId(null); }}
                        style={{ width: 22, height: 22, borderRadius: 99, background: COLORS.line, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        <X size={12} color={COLORS.navy} strokeWidth={2.5} />
                      </button>
                    )}
                    <ChevronDown size={16} color={COLORS.mute} style={{ transform: eventPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                  </div>

                  {eventPickerOpen && (
                    <div style={{ marginTop: 8, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 240 }}>
                      <div style={{ padding: 8, borderBottom: `1px solid ${COLORS.line}`, flexShrink: 0 }}>
                        <div style={{ position: "relative" }}>
                          <Search size={13} color={COLORS.mute} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                          <input
                            autoFocus
                            value={eventSearch}
                            onChange={(e) => setEventSearch(e.target.value)}
                            placeholder="Search event…"
                            style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: COLORS.cream }}
                          />
                        </div>
                      </div>
                      <div style={{ overflowY: "auto" }}>
                        <button
                          onClick={() => { setEditEventId(null); setEventPickerOpen(false); setEventSearch(""); }}
                          style={{ width: "100%", padding: "10px 14px", background: !editEventId ? COLORS.yellowSoft : "transparent", border: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: `1px solid ${COLORS.line}`, textAlign: "left" }}
                        >
                          <span style={{ flex: 1, fontFamily: fontStack, fontSize: 13, fontWeight: !editEventId ? 700 : 500, color: COLORS.mute, fontStyle: "italic" }}>
                            No Event
                          </span>
                        </button>
                        {filteredEvents.length === 0 && (
                          <div style={{ padding: 16, textAlign: "center", color: COLORS.mute, fontFamily: monoStack, fontSize: 11, letterSpacing: "0.1em" }}>NO EVENTS FOUND</div>
                        )}
                        {filteredEvents.map((e) => {
                          const active = editEventId === e.axm365_eventid;
                          const evDate = e.axm365_eventdate ? new Date(e.axm365_eventdate) : null;
                          return (
                            <button
                              key={e.axm365_eventid}
                              onClick={() => { setEditEventId(e.axm365_eventid); setEventPickerOpen(false); setEventSearch(""); }}
                              style={{ width: "100%", padding: "10px 14px", background: active ? COLORS.yellowSoft : "transparent", border: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: `1px solid ${COLORS.line}`, textAlign: "left" }}
                            >
                              <span style={{ flex: 1, fontFamily: fontStack, fontSize: 13, fontWeight: active ? 700 : 500, color: COLORS.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {e.axm365_name || "Unnamed Event"}
                              </span>
                              {evDate && (
                                <span style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.08em", flexShrink: 0 }}>
                                  {evDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Rating */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Overall Rating
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
                      placeholder={`Notes for ${playerName}…`}
                      style={{ width: "100%", minHeight: 70, border: 0, outline: 0, fontFamily: fontStack, fontSize: 13, color: COLORS.ink, lineHeight: 1.55, resize: "vertical", background: "transparent" }}
                    />
                  </div>
                </div>

                {/* Save button */}
                <button
                  disabled={perfSaving}
                  onClick={savePlayerPerformance}
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
