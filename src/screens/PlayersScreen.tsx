/* eslint-disable */
import React, { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, ChevronRight, Star } from "lucide-react";
import { Cr9be_playersService } from "../generated/services/Cr9be_playersService";
import type { Cr9be_players } from "../generated/models/Cr9be_playersModel";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import { unwrap } from "../utils/dataverse";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner } from "../components/shared";

interface PlayersScreenProps {
  go: (id: ScreenId) => void;
}

export const PlayersScreen: React.FC<PlayersScreenProps> = ({ go }) => {
  const [players, setPlayers] = useState<Cr9be_players[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await Cr9be_playersService.getAll({ top: 100 });
      setPlayers(unwrap<Cr9be_players>(res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshData = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const allPositions = ["ALL", ...Array.from(new Set(
    players.map((p) => (p as any).cr9be_positionname || "---")
  ))];

  const filtered = players.filter((p) => {
    const playerPos = (p as any).cr9be_positionname || "---";
    const name = p.cr9be_name || "";
    const matchPos = pos === "ALL" || playerPos === pos;
    const matchSearch = search === "" || name.toLowerCase().includes(search.toLowerCase());
    return matchPos && matchSearch;
  });

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker="Squad · 2025/26"
        title="My Players"
        onBack={() => go("home")}
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
              onClick={() => setShowSearch((s) => !s)}
              style={{ width: 38, height: 38, borderRadius: 12, background: showSearch ? COLORS.navy : "#fff", border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Search size={17} color={showSearch ? "#fff" : COLORS.navy} strokeWidth={2} />
            </button>
          </div>
        }
      />

      {showSearch && (
        <div style={{ padding: "0 22px 12px" }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: "100%", padding: "11px 14px", borderRadius: 14, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13.5, color: COLORS.navy, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      )}

      <div style={{ padding: "0 22px 14px", display: "flex", gap: 6, overflowX: "auto" }}>
        {allPositions.map((p) => {
          const active = pos === p;
          return (
            <button
              key={p}
              onClick={() => setPos(p)}
              style={{ flex: "0 0 auto", padding: "8px 14px", background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: active ? "none" : `1px solid ${COLORS.line}`, borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: monoStack, letterSpacing: "0.1em" }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {loading && <LoadingSpinner label="Loading squad…" />}
      {error && <ErrorBanner message={error} onRetry={load} />}

      {!loading && (
        <div style={{ padding: "0 18px 30px", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>
              NO PLAYERS FOUND
            </div>
          )}
          {filtered.map((p) => {
            const playerId = p.cr9be_playerid;
            const name = p.cr9be_name || "Unknown";
            const num = (p as any).cr9be_number ?? "?";
            const playerPos = (p as any).cr9be_positionname || "---";
            const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
            const savedDraft = localStorage.getItem(`perf_draft_${playerId}`);
            const perfRating: number = savedDraft ? (JSON.parse(savedDraft).rating ?? 4) : 4;

            return (
              <div
                key={playerId}
                onClick={() => go("performance")}
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
                  <div style={{ fontSize: 10.5, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em", marginTop: 1 }}>{playerPos} · #{num}</div>
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
