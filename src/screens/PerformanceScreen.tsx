import React, { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { COLORS, fontStack, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, SectionTitle, LoadingSpinner, ErrorBanner } from "../components/shared";
import { AttributeBar, Chip, SuccessBanner } from "../components/ui";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

const DRAFT_KEY = (id: string) => `perf_draft_${id}`;

interface PerformanceScreenProps {
  go: (id: ScreenId, playerId?: string) => void;
  selectedPlayerId?: string | null;
}

export const PerformanceScreen: React.FC<PerformanceScreenProps> = ({ go, selectedPlayerId }) => {
  const { players, loading, error, refreshPlayers } = useData();
  const [selectedId, setSelectedId] = useState<string | null>(selectedPlayerId ?? null);
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Once players load, fall back to first player if none selected
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedId && players.length > 0) setSelectedId(players[0].cr9be_playerid);
  }, [players, selectedId]);

  // Load saved draft whenever selected player changes
  useEffect(() => {
    if (!selectedId) return;
    const saved = localStorage.getItem(DRAFT_KEY(selectedId));
    if (saved) {
      const { rating: r, notes: n } = JSON.parse(saved);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRating(r ?? 4);
      setNotes(n ?? "");
    } else {
      setRating(4);
      setNotes("");
    }
  }, [selectedId]);

  const player = players.find((p) => p.cr9be_playerid === selectedId);
  const playerName = player ? (player.cr9be_name || "Player") : "Player";
  const playerPos = lookupName(player, "cr9be_position");
  const playerNum = player ? (player.cr9be_number ?? "?") : "?";

  const saveDraft = () => {
    if (!selectedId) return;
    localStorage.setItem(DRAFT_KEY(selectedId), JSON.stringify({ rating, notes }));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const savePerformance = () => {
    if (!selectedId) return;
    setSaveSuccess(false);
    localStorage.setItem(DRAFT_KEY(selectedId), JSON.stringify({ rating, notes }));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader kicker="Tactical Training" title="Performance Notes" onBack={() => go("home")} />

      {loading && players.length === 0 && <LoadingSpinner label="Loading players…" />}
      {error && players.length === 0 && <ErrorBanner message={error} onRetry={() => refreshPlayers().catch(() => {})} />}
      {saveSuccess && <SuccessBanner message="Performance saved successfully!" />}

      {(!loading || players.length > 0) && players.length > 0 && (
        <>
          <div style={{ padding: "0 22px 12px" }}>
            <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.2em", color: COLORS.mute, marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>
              Select Player
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
              {players.map((p) => {
                const pid = p.cr9be_playerid;
                const name = p.cr9be_name || "Player";
                const ini = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                const active = selectedId === pid;
                return (
                  <button
                    key={pid}
                    onClick={() => setSelectedId(pid)}
                    style={{ flex: "0 0 auto", background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: active ? "none" : `1px solid ${COLORS.line}`, borderRadius: 14, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 12.5, fontFamily: fontStack, whiteSpace: "nowrap" }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: active ? COLORS.yellow : COLORS.cream, color: COLORS.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800 }}>
                      {ini}
                    </span>
                    {name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {player && (
            <div style={{ padding: "0 22px" }}>
              <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 22, padding: 18, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -30, right: -30, width: 130, height: 130, background: COLORS.yellowSoft, borderRadius: "50%", opacity: 0.7 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: COLORS.navy, color: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 900, fontSize: 22 }}>
                    {playerNum}
                  </div>
                  <div>
                    <div style={{ fontFamily: displayStack, fontSize: 19, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.01em" }}>{playerName}</div>
                    <div style={{ fontSize: 11, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.12em", marginTop: 2 }}>{playerPos ? `${playerPos} · ` : ""}#{playerNum}</div>
                  </div>
                </div>

                <div style={{ marginTop: 18, position: "relative" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.mute, marginBottom: 8, fontFamily: monoStack, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Session Rating
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setRating(n)} style={{ width: 38, height: 38, borderRadius: 12, border: 0, background: n <= rating ? COLORS.yellow : "#F3F0E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Star size={18} color={n <= rating ? COLORS.navy : COLORS.mute} fill={n <= rating ? COLORS.navy : "none"} strokeWidth={2} />
                      </button>
                    ))}
                    <div style={{ marginLeft: "auto", fontFamily: displayStack, fontWeight: 800, fontSize: 26, color: COLORS.navy }}>{rating}.0</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: "20px 22px 0" }}>
            <SectionTitle eyebrow="Today's Session" title="Attributes" />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <AttributeBar label="Technique" value={88} />
              <AttributeBar label="Effort" value={94} />
              <AttributeBar label="Tactical Awareness" value={76} />
              <AttributeBar label="Team Play" value={82} />
            </div>
          </div>

          <div style={{ padding: "20px 22px 30px" }}>
            <SectionTitle eyebrow="Coach's Eye" title="Notes" />
            <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 14, minHeight: 110 }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={`Add your notes for ${playerName} here…`}
                style={{ width: "100%", minHeight: 80, border: 0, outline: 0, fontFamily: fontStack, fontSize: 13, color: COLORS.ink, lineHeight: 1.55, resize: "vertical", background: "transparent" }}
              />
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip>#pressing</Chip>
                <Chip>#leadership</Chip>
                <Chip yellow>+ add tag</Chip>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={saveDraft} style={{ flex: 1, padding: "13px 0", background: "#fff", color: COLORS.navy, border: `1px solid ${COLORS.line}`, borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Save Draft
              </button>
              <button onClick={savePerformance} style={{ flex: 1.4, padding: "13px 0", background: COLORS.navy, color: "#fff", border: 0, borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Submit Review
              </button>
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
