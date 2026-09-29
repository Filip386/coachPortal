import React, { useState, useMemo, useEffect } from "react";
import { Search, RefreshCw, ChevronRight, ChevronDown, Star, X } from "lucide-react";
import { COLORS, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner, PlayerAvatar, StaleDataNotice } from "../components/shared";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

const normalizeGuid = (value?: string | null): string =>
  (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();

const sameGuid = (left?: string | null, right?: string | null): boolean => {
  const normalizedLeft = normalizeGuid(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeGuid(right);
};

interface PlayersScreenProps {
  go: (id: ScreenId, playerId?: string) => void;
  goBack?: () => void;
}

export const PlayersScreen: React.FC<PlayersScreenProps> = ({ go, goBack }) => {
  const { players, performances, coachId, allGenerations, generationsToCoaches, ensureFresh, isLoadingResources, hasResourceErrors, hasStaleResources, getResourceError } = useData();
  // Cached Players can render immediately. Performance and Generation tables
  // refresh behind the list and must not blank the Squad screen.
  const screenLoading = isLoadingResources(["players"]);
  const screenLoadError = hasResourceErrors(["players"]);
  const screenError = getResourceError([
    "players",
    "performances",
    "generations",
    "generationsToCoaches",
  ]);
  const screenStale = hasStaleResources([
    "players",
    "performances",
    "generations",
    "generationsToCoaches",
  ]);
  const [pos, setPos] = useState("ALL");
  const [genId, setGenId] = useState("all");
  const autoSelectedCoachRef = React.useRef<string | null>(null);
  const [showGenDropdown, setShowGenDropdown] = useState(false);
  const [genSearch, setGenSearch] = useState("");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void ensureFresh([
      "players",
      "performances",
      "generations",
      "generationsToCoaches",
    ]);
  }, [ensureFresh]);

  const refreshData = async () => {
    setRefreshing(true);
    await ensureFresh(
      ["players", "performances", "generations", "generationsToCoaches"],
      { force: true }
    ).catch(() => {});
    setRefreshing(false);
  };

  // Before Coach resolution, list every generation found on cached Players.
  // Afterwards prefer Coach relationships, but never keep a relationship-only
  // option that would produce an empty Player list.
  const generationTabs = useMemo(() => {
    const sortGenerations = (items: { id: string; name: string }[]) => {
      const yearOf = (name: string) => {
        const match = name.match(/\d{4}/) || name.match(/\d+/);
        return match ? parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
      };
      return items.sort((left, right) => {
        const leftYear = yearOf(left.name);
        const rightYear = yearOf(right.name);
        return leftYear !== rightYear
          ? leftYear - rightYear
          : left.name.localeCompare(right.name);
      });
    };

    const playerSeen = new Set<string>();
    const playerGenerations: { id: string; name: string }[] = [];
    players.forEach((player) => {
      const id = (player as any)._cr9be_generation_value as string | undefined;
      const name =
        player.cr9be_generationname || lookupName(player, "cr9be_generation");
      const normalizedId = normalizeGuid(id);
      if (id && name && normalizedId && !playerSeen.has(normalizedId)) {
        playerSeen.add(normalizedId);
        playerGenerations.push({ id, name });
      }
    });

    if (!coachId) return sortGenerations(playerGenerations);

    const seen = new Set<string>();
    const related: { id: string; name: string }[] = [];
    const addRelatedGeneration = (id?: string, name?: string | null) => {
      const normalizedId = normalizeGuid(id);
      if (!id || !name || !normalizedId || seen.has(normalizedId)) return;
      seen.add(normalizedId);
      related.push({ id, name });
    };

    players
      .filter((player) => sameGuid((player as any)._cr9be_coach_value, coachId))
      .forEach((player) => {
        addRelatedGeneration(
          (player as any)._cr9be_generation_value as string | undefined,
          player.cr9be_generationname || lookupName(player, "cr9be_generation")
        );
      });

    allGenerations
      .filter((generation) =>
        sameGuid((generation as any)._cr9be_coach_value, coachId)
      )
      .forEach((generation) => {
        addRelatedGeneration(
          generation.axm365_generationid,
          generation.axm365_name
        );
      });

    generationsToCoaches
      .filter((mapping) =>
        sameGuid((mapping as any)._axm365_coach_value, coachId)
      )
      .forEach((mapping) => {
        addRelatedGeneration(
          (mapping as any)._axm365_generation_value as string | undefined,
          mapping.axm365_generationname
        );
      });

    const relatedWithPlayers = related.filter((generation) =>
      players.some((player) =>
        sameGuid((player as any)._cr9be_generation_value, generation.id)
      )
    );

    return sortGenerations(
      relatedWithPlayers.length > 0 ? relatedWithPlayers : playerGenerations
    );
  }, [coachId, players, allGenerations, generationsToCoaches]);

  const visiblePlayers = useMemo(() => {
    if (!coachId || generationTabs.length === 0) return players;
    const relatedPlayers = players.filter((player) =>
      generationTabs.some((generation) =>
        sameGuid((player as any)._cr9be_generation_value, generation.id)
      )
    );
    return relatedPlayers.length > 0 ? relatedPlayers : players;
  }, [coachId, generationTabs, players]);

  const primaryGenId = useMemo(() => {
    if (!coachId) return null;
    const primaryGeneration = allGenerations.find((generation) =>
      sameGuid((generation as any)._cr9be_coach_value, coachId)
    );
    return generationTabs.find((generation) =>
      sameGuid(generation.id, primaryGeneration?.axm365_generationid)
    )?.id ?? generationTabs[0]?.id ?? null;
  }, [coachId, allGenerations, generationTabs]);

  useEffect(() => {
    const normalizedCoachId = normalizeGuid(coachId);
    if (!normalizedCoachId) {
      autoSelectedCoachRef.current = null;
      setGenId("all");
      return;
    }

    if (
      primaryGenId &&
      autoSelectedCoachRef.current !== normalizedCoachId
    ) {
      setGenId(primaryGenId);
      autoSelectedCoachRef.current = normalizedCoachId;
    }
  }, [coachId, primaryGenId]);

  // Build filter tabs from real data — only positions that exist
  const positionTabs = Array.from(
    new Set(visiblePlayers.map((p) => lookupName(p, "cr9be_position")).filter(Boolean))
  ) as string[];

  const filtered = visiblePlayers.filter((p) => {
    const matchPos = pos === "ALL" || (lookupName(p, "cr9be_position") ?? "") === pos;
    const matchGen = genId === "all" || sameGuid((p as any)._cr9be_generation_value, genId);
    const matchSearch = search === "" || (p.cr9be_name || "").toLowerCase().includes(search.toLowerCase());
    return matchPos && matchGen && matchSearch;
  });

  const selectedGenName = genId === "all"
    ? "All Years"
    : generationTabs.find((generation) => sameGuid(generation.id, genId))?.name ?? "All Years";

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
                      const selected = opt.id === "all"
                        ? genId === "all"
                        : sameGuid(genId, opt.id);
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

      {screenLoading && <LoadingSpinner label="Loading squad…" />}
      {screenError && <ErrorBanner message={screenError} onRetry={refreshData} />}
      {screenStale && <StaleDataNotice />}

      {!screenLoading && !screenLoadError && (
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
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <PlayerAvatar playerId={playerId} hasPicture={!!p.cr9be_pictureid} pictureVersion={p.cr9be_picture_timestamp} initials={initials} size={42} />
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
