import React, { useState, useEffect, useMemo } from "react";
import { Star, Search, ChevronDown } from "lucide-react";
import { COLORS, fontStack, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, SectionTitle, LoadingSpinner, ErrorBanner } from "../components/shared";
import { AttributeBar } from "../components/ui";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

const CODE_TO_STARS = (code?: number): number =>
  code !== undefined ? (code as number) - 693080000 + 1 : 2;

const DEFAULT_ATTR_FOR_RATING: Record<number, number> = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };

interface PerformanceScreenProps {
  go: (id: ScreenId, playerId?: string) => void;
  selectedPlayerId?: string | null;
}

export const PerformanceScreen: React.FC<PerformanceScreenProps> = ({ go, selectedPlayerId }) => {
  const { players, performances, loading, error, refreshPlayers } = useData();
  const [selectedId, setSelectedId] = useState<string | null>(selectedPlayerId ?? null);
  const [selectedGen, setSelectedGen] = useState("ALL");
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!selectedPlayerId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(selectedPlayerId);
    const p = players.find((pl) => pl.cr9be_playerid === selectedPlayerId);
    const gen = lookupName(p, "cr9be_generation");
    if (gen) setSelectedGen(gen);
  }, [selectedPlayerId, players]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedId && players.length > 0) setSelectedId(players[0].cr9be_playerid);
  }, [players, selectedId]);

  const generationTabs = useMemo(() => {
    const yearOf = (s: string) => { const m = s.match(/\d{4}/) || s.match(/\d+/); return m ? parseInt(m[0], 10) : Infinity; };
    return (Array.from(new Set(players.map((p) => lookupName(p, "cr9be_generation")).filter(Boolean))) as string[])
      .sort((a, b) => { const ya = yearOf(a), yb = yearOf(b); return ya !== yb ? ya - yb : a.localeCompare(b); });
  }, [players]);

  const playersInGen = useMemo(
    () => selectedGen === "ALL" ? players : players.filter((p) => (lookupName(p, "cr9be_generation") ?? "") === selectedGen),
    [players, selectedGen]
  );

  const filteredPlayers = search
    ? playersInGen.filter((p) => (p.cr9be_name || "").toLowerCase().includes(search.toLowerCase()))
    : playersInGen;

  const player = players.find((p) => p.cr9be_playerid === selectedId);
  const playerName = player ? (player.cr9be_name || "Player") : "Player";
  const playerPos = lookupName(player, "cr9be_position");
  const playerNum = player ? (player.cr9be_number ?? "?") : "?";
  const initials = playerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const playerPerfs = performances.filter((p) => p._axm365_cr9be_player_value === selectedId);
  const hasData = playerPerfs.length > 0;

  const avgStat = (accessor: (p: typeof playerPerfs[0]) => number | undefined, fallback: number) =>
    hasData
      ? Math.round(playerPerfs.reduce((sum, p) => sum + (accessor(p) ?? fallback), 0) / playerPerfs.length)
      : fallback;

  const avgRatingStars = hasData
    ? Math.round(playerPerfs.reduce((sum, p) => sum + CODE_TO_STARS(p.axm365_raiting as number | undefined), 0) / playerPerfs.length)
    : 2;
  const avgTechnique = avgStat((p) => p.axm365_technique, DEFAULT_ATTR_FOR_RATING[2]);
  const avgEffort = avgStat((p) => p.axm365_effort, DEFAULT_ATTR_FOR_RATING[2]);
  const avgTactical = avgStat((p) => p.axm365_tacticalawareness, DEFAULT_ATTR_FOR_RATING[2]);
  const avgTeamPlay = avgStat((p) => p.axm365_teamplay, DEFAULT_ATTR_FOR_RATING[2]);

  return (
    <>
      <StatusBar />
      <ScreenHeader kicker="Player Stats" title="Performance" onBack={() => go("home")} />

      {loading && players.length === 0 && <LoadingSpinner label="Loading players…" />}
      {error && players.length === 0 && <ErrorBanner message={error} onRetry={() => refreshPlayers().catch(() => {})} />}

      {(!loading || players.length > 0) && players.length > 0 && (
        <>
          {/* Generation filter */}
          {generationTabs.length > 0 && (
            <div style={{ padding: "0 22px 10px", display: "flex", gap: 6, overflowX: "auto" }}>
              {["ALL", ...generationTabs].map((tab) => {
                const active = selectedGen === tab;
                return (
                  <button
                    key={tab}
                    ref={(el) => { if (active && el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }}
                    onClick={() => {
                      setSelectedGen(tab);
                      const first = (tab === "ALL" ? players : players.filter((p) => (lookupName(p, "cr9be_generation") ?? "") === tab))[0];
                      setSelectedId(first?.cr9be_playerid ?? null);
                    }}
                    style={{ flex: "0 0 auto", padding: "7px 14px", background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: active ? `2px solid ${COLORS.yellow}` : `1px solid ${COLORS.line}`, borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: monoStack, letterSpacing: "0.08em" }}
                  >
                    {tab}
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
                  <div style={{ marginLeft: "auto", position: "relative" }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 900, fontSize: 32, color: COLORS.navy, lineHeight: 1 }}>{avgRatingStars}.0</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9, letterSpacing: "0.14em", color: COLORS.mute, textAlign: "right", marginTop: 2 }}>AVG RATING</div>
                  </div>
                </div>

                <div style={{ marginTop: 14, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={18} color={n <= avgRatingStars ? COLORS.yellow : COLORS.line} fill={n <= avgRatingStars ? COLORS.yellow : "none"} strokeWidth={2} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: hasData ? COLORS.yellowSoft : COLORS.cream, border: `1px solid ${hasData ? COLORS.yellow : COLORS.line}`, borderRadius: 99, padding: "4px 10px" }}>
                      <span style={{ fontFamily: monoStack, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.navy }}>
                        {hasData ? `${playerPerfs.length} EVENT${playerPerfs.length !== 1 ? "S" : ""}` : "NO DATA YET"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: "18px 22px 30px" }}>
            <SectionTitle eyebrow="Career Average" title="Attributes" />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <AttributeBar label="Technique" value={avgTechnique} />
              <AttributeBar label="Effort" value={avgEffort} />
              <AttributeBar label="Tactical Awareness" value={avgTactical} />
              <AttributeBar label="Team Play" value={avgTeamPlay} />
            </div>
          </div>
        </>
      )}

      {!loading && players.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: COLORS.mute }}>
          No players found. Please add players to your squad first.
        </div>
      )}
    </>
  );
};
