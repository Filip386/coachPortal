/* eslint-disable */
import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Check, X, Clock, RefreshCw, Star } from "lucide-react";
import { Cr9be_playersService } from "../generated/services/Cr9be_playersService";
import { Axm365_eventsService } from "../generated/services/Axm365_eventsService";
import { Axm365_eventattendancesService } from "../generated/services/Axm365_eventattendancesService";
import type { Cr9be_players } from "../generated/models/Cr9be_playersModel";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import type { Axm365_eventattendances } from "../generated/models/Axm365_eventattendancesModel";
import { COLORS, displayStack, monoStack } from "../constants/design";
import { unwrap } from "../utils/dataverse";
import type { ScreenId } from "../types/navigation";
import { StatusBar, LoadingSpinner, ErrorBanner } from "../components/shared";
import { Tally, MarkBtn, SuccessBanner } from "../components/ui";

type AttendanceMark = "present" | "late" | "absent";

interface AttendanceScreenProps {
  go: (id: ScreenId) => void;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({ go }) => {
  const [players, setPlayers] = useState<Cr9be_players[]>([]);
  const [events, setEvents] = useState<Axm365_events[]>([]);
  const [attendances, setAttendances] = useState<Axm365_eventattendances[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pRes, eRes, aRes] = await Promise.all([
        Cr9be_playersService.getAll(),
        Axm365_eventsService.getAll(),
        Axm365_eventattendancesService.getAll({ top: 100 }),
      ]);
      const pList = unwrap<Cr9be_players>(pRes);
      const eList = unwrap<Axm365_events>(eRes);
      const aList = unwrap<Axm365_eventattendances>(aRes);
      setPlayers(pList);
      setEvents(eList);
      setAttendances(aList);
      const firstEventId = eList[0] ? eList[0].axm365_eventid : null;
      setSelectedEventId(firstEventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedEventId || players.length === 0) return;
    const initialMarks: Record<string, AttendanceMark> = {};
    players.forEach((p) => {
      const playerId = p.cr9be_playerid;
      const existing = attendances.find((a) => {
        return (
          (a as any)._axm365_player_value === playerId &&
          (a as any)._axm365_event_value === selectedEventId
        );
      });
      if (existing) {
        const name: string = (existing.axm365_name ?? "").toLowerCase();
        if (name.startsWith("late")) initialMarks[playerId] = "late";
        else if (name.startsWith("absent")) initialMarks[playerId] = "absent";
        else if (name.startsWith("present")) initialMarks[playerId] = "present";
        else initialMarks[playerId] = (existing as any).axm365_attended === false ? "absent" : "present";
      }
    });
    setMarks(initialMarks);
  }, [selectedEventId, players, attendances]);

  const setMark = (id: string, v: AttendanceMark) => setMarks((m) => ({ ...m, [id]: v }));

  const counts = Object.values(marks).reduce<Record<AttendanceMark, number>>(
    (a, v) => ({ ...a, [v]: (a[v] || 0) + 1 }),
    { present: 0, late: 0, absent: 0 }
  );

  const throwIfError = (result: any, context: string) => {
    const err = result?.error ?? result?.Error ?? result?.errorCode;
    if (err) throw new Error(`${context}: ${err?.message ?? err}`);
  };

  const saveAttendance = async () => {
    if (!selectedEventId) return;
    setSaveSuccess(false);
    setError(null);
    const markedPlayers = players.filter((p) => !!marks[p.cr9be_playerid]);
    if (markedPlayers.length === 0) {
      setError("Please mark at least one player before saving.");
      return;
    }
    try {
      setSaving(true);
      for (const p of markedPlayers) {
        const playerId = p.cr9be_playerid;
        const mark = marks[playerId];
        const label = mark === "present" ? "Present" : mark === "late" ? "Late" : "Absent";
        const attended = mark !== "absent";
        const existing = attendances.find((a) =>
          (a as any)._axm365_player_value === playerId &&
          (a as any)._axm365_event_value === selectedEventId
        );
        if (existing) {
          const res = await Axm365_eventattendancesService.update(
            existing.axm365_eventattendanceid,
            { axm365_name: `${label} - ${p.cr9be_name}`, axm365_attended: attended } as any
          );
          throwIfError(res, `Update ${p.cr9be_name}`);
        } else {
          const res = await Axm365_eventattendancesService.create({
            axm365_name: `${label} - ${p.cr9be_name}`,
            "axm365_Player@odata.bind": `/cr9be_players(${playerId})`,
            "axm365_Event@odata.bind": `/axm365_events(${selectedEventId})`,
            axm365_attended: attended,
          } as any);
          throwIfError(res, `Create ${p.cr9be_name}`);
        }
      }
      setSaveSuccess(true);
      setTimeout(() => { go("home"); }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attendance");
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
            {events.length > 0 && (
              <select
                value={selectedEventId ?? ""}
                onChange={(ev) => setSelectedEventId(ev.target.value)}
                style={{ background: "rgba(255,255,255,0.1)", border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 10, color: COLORS.yellow, fontFamily: monoStack, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", padding: "6px 10px", cursor: "pointer", maxWidth: 170 }}
              >
                {events.map((e) => (
                  <option key={e.axm365_eventid} value={e.axm365_eventid} style={{ color: COLORS.navy }}>
                    {e.axm365_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: monoStack, fontSize: 10.5, letterSpacing: "0.22em", opacity: 0.7, fontWeight: 600, textTransform: "uppercase" }}>
              {eventName}
            </div>
            <h1 style={{ fontFamily: displayStack, fontSize: 28, margin: "6px 0 0", lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 800 }}>
              Mark Attendance
            </h1>
          </div>

          {!loading && players.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8, marginBottom: 6, fontFamily: monoStack, letterSpacing: "0.1em" }}>
                <span>{counts.present + counts.late + counts.absent} of {players.length} marked</span>
                <span style={{ color: COLORS.yellow, fontWeight: 700 }}>
                  {players.length > 0 ? Math.round(((counts.present + counts.late + counts.absent) / players.length) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${players.length > 0 ? ((counts.present + counts.late + counts.absent) / players.length) * 100 : 0}%`, background: COLORS.yellow, borderRadius: 99, transition: "width 0.3s ease" }} />
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <Tally label="Present" count={counts.present} color={COLORS.green} />
                <Tally label="Late" count={counts.late} color={COLORS.yellow} />
                <Tally label="Absent" count={counts.absent} color={COLORS.red} />
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && <LoadingSpinner label="Loading players…" />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {saveSuccess && <SuccessBanner message="Attendance saved successfully!" />}

      {!loading && players.length > 0 && (
        <div style={{ padding: "18px 16px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {players.map((p) => {
              const playerId = p.cr9be_playerid;
              const name = p.cr9be_name || "Unknown Player";
              const num = (p as any).cr9be_number ?? "?";
              const pos = (p as any).cr9be_positionname ?? "---";
              const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              const savedDraft = localStorage.getItem(`perf_draft_${playerId}`);
              const perfRating: number = savedDraft ? (JSON.parse(savedDraft).rating ?? 4) : 4;
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
                    <div style={{ fontSize: 10.5, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em" }}>{pos} · #{num}</div>
                    <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={11} color={n <= perfRating ? COLORS.yellow : COLORS.line} fill={n <= perfRating ? COLORS.yellow : "none"} strokeWidth={1.5} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <MarkBtn active={marks[playerId] === "present"} onClick={() => setMark(playerId, "present")} bg={COLORS.green}><Check size={14} /></MarkBtn>
                    <MarkBtn active={marks[playerId] === "late"} onClick={() => setMark(playerId, "late")} bg={COLORS.yellow} dark><Clock size={13} /></MarkBtn>
                    <MarkBtn active={marks[playerId] === "absent"} onClick={() => setMark(playerId, "absent")} bg={COLORS.red}><X size={14} /></MarkBtn>
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

      {!loading && players.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: COLORS.mute }}>
          No players found. Please add players to your squad first.
        </div>
      )}
    </>
  );
};
