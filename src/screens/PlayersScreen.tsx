import React, { useState, useMemo, useEffect } from "react";
import { Search, RefreshCw, ChevronRight, ChevronDown, Star, X } from "lucide-react";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner } from "../components/shared";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

interface PlayersScreenProps {
  go: (id: ScreenId, playerId?: string) => void;
  goBack?: () => void;
}

export const PlayersScreen: React.FC<PlayersScreenProps> = ({ go, goBack }) => {
  const { players, performances, loading, error, refreshPlayers, coachId, allGenerations, generationsToCoaches } = useData();
  const [pos, setPos] = useState("ALL");
  const [genId, setGenId] = useState("all");
  const [genAutoSelected, setGenAutoSelected] = useState(false);
  const [showGenDropdown, setShowGenDropdown] = useState(false);
  const [genSearch, setGenSearch] = useState("");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = async () => {
    setRefreshing(true);
    await refreshPlayers().catch(() => {});
    setRefreshing(false);
  };

  // Build generation list for this coach: from their players + secondary junction table.
  // Falls back to all player generations when no coach-specific match (e.g. during load or test accounts).
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

    // Secondary generations from the junction table
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

    const yearOf = (s: string) => {
      const m = s.match(/\d{4}/) || s.match(/\d+/);
      return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
    };
    return result.sort((a, b) => {
      const ya = yearOf(a.name), yb = yearOf(b.name);
      return ya !== yb ? ya - yb : a.name.localeCompare(b.name);
    });
  }, [coachId, players, generationsToCoaches]);

  // Primary generation: first from allGenerations table for this coach, fallback to first in list
  const primaryGenId = useMemo(() => {
    if (!coachId) return generationTabs[0]?.id ?? null;
    const fromTable = allGenerations.find((g) => (g as any)._cr9be_coach_value === coachId);
    return fromTable?.axm365_generationid ?? generationTabs[0]?.id ?? null;
  }, [coachId, allGenerations, generationTabs]);

  useEffect(() => {
    if (primaryGenId && !genAutoSelected) {
      setGenId(primaryGenId);
      setGenAutoSelected(true);
    }
  }, [primaryGenId, genAutoSelected]);

  // Build filter tabs from real data — only positions that exist
  const positionTabs = Array.from(
    new Set(players.map((p) => lookupName(p, "cr9be_position")).filter(Boolean))
  ) as string[];

  const filtered = players.filter((p) => {
    const matchPos = pos === "ALL" || (lookupName(p, "cr9be_position") ?? "") === pos;
    const matchGen = genId === "all" || (p as any)._cr9be_generation_value === genId;
    const matchSearch = search === "" || (p.cr9be_name || "").toLowerCase().includes(search.toLowerCase());
    return matchPos && matchGen && matchSearch;
  });

  const selectedGenName = genId === "all"
    ? "All Years"
    : generationTabs.find((g) => g.id === genId)?.name ?? "All Years";

  const genOptions = [
    { id: "all", name: "All Generations" },
    ...generationTabs,
  ].filter((o) => o.name.toLowerCase().includes(genSearch.toLowerCase()));

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker="Squad"
        title="My Players"
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
        titleAction={
          generationTabs.length > 0 ? (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setShowGenDropdown(!showGenDropdown)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12, fontSize: 12.5, color: COLORS.navy, fontFamily: fontStack, cursor: "pointer", fontWeight: 700, maxWidth: 150 }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedGenName}</span>
                <ChevronDown size={15} color={COLORS.navy} strokeWidth={2} style={{ transform: showGenDropdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }} />
              </button>

              {showGenDropdown && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 210, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, zIndex: 30, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 320 }}>
                  <div style={{ padding: 8, borderBottom: `1px solid ${COLORS.line}` }}>
                    <div style={{ position: "relative" }}>
                      <Search size={14} color={COLORS.mute} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      <input
                        autoFocus
                        value={genSearch}
                        onChange={(e) => setGenSearch(e.target.value)}
                        placeholder="Search years…"
                        style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13.5, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: COLORS.cream }}
                      />
                    </div>
                  </div>
                  <div style={{ overflowY: "auto" }}>
                    {genOptions.length === 0 && (
                      <div style={{ padding: 16, textAlign: "center", color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>NO YEARS FOUND</div>
                    )}
                    {genOptions.map((opt) => {
                      const selected = genId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => { setGenId(opt.id); setShowGenDropdown(false); setGenSearch(""); }}
                          style={{ width: "100%", padding: "11px 16px", background: selected ? "#f0f0f0" : "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14, color: COLORS.navy, fontWeight: selected ? 700 : 400, borderBottom: `1px solid ${COLORS.line}` }}
                        >
                          {opt.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null
        }
      />

      <div style={{ padding: "0 22px 12px" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} color={COLORS.mute} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: "100%", padding: "11px 36px 11px 34px", borderRadius: 14, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13.5, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: "#fff" }}
          />
          {search.length > 0 && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: 99, background: COLORS.line, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <X size={11} color={COLORS.navy} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {positionTabs.length > 0 && (
        <div style={{ padding: "0 22px 14px", display: "flex", gap: 6, overflowX: "auto" }}>
          {["ALL", ...positionTabs].map((tab) => {
            const active = pos === tab;
            return (
              <button
                key={tab}
                onClick={() => setPos(tab)}
                style={{ flex: "0 0 auto", padding: "7px 14px", background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: active ? "none" : `1px solid ${COLORS.line}`, borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: monoStack, letterSpacing: "0.08em" }}
              >
                {tab}
              </button>
            );
          })}
        </div>
      )}

      {loading && players.length === 0 && <LoadingSpinner label="Loading squad…" />}
      {error && players.length === 0 && <ErrorBanner message={error} onRetry={refreshData} />}

      {(!loading || players.length > 0) && (
        <div style={{ padding: "0 18px 30px", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>
              NO PLAYERS FOUND
            </div>
          )}
          {filtered.map((p) => {
            const playerId = p.cr9be_playerid;
            const name = p.cr9be_name || "Unknown";
            const num = p.cr9be_number ?? "?";
            const playerPos = lookupName(p, "cr9be_position");
            const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
            const playerPerfs = performances.filter((perf) => perf._axm365_cr9be_player_value === playerId);
            const perfRating: number = playerPerfs.length > 0
              ? Math.round(playerPerfs.reduce((sum, perf) => sum + ((perf.axm365_raiting as number ?? 693080001) - 693080000 + 1), 0) / playerPerfs.length)
              : 2;

            return (
              <div
                key={playerId}
                onClick={() => go("performance", playerId)}
                style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 12, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 12, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 800, fontSize: 13, position: "relative", flexShrink: 0 }}>
                  {initials}
                  <span style={{ position: "absolute", bottom: -3, right: -3, background: COLORS.yellow, color: COLORS.navy, fontSize: 9.5, fontWeight: 800, width: 18, height: 18, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid #fff` }}>
                    {num}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 13.5 }}>{name}</div>
                  <div style={{ fontSize: 10.5, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em", marginTop: 2 }}>
                    {playerPos ? `${playerPos} · ` : ""}#{num}
                  </div>
                  <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={11} color={n <= perfRating ? COLORS.yellow : COLORS.line} fill={n <= perfRating ? COLORS.yellow : "none"} strokeWidth={1.5} />
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} color={COLORS.mute} strokeWidth={2} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
