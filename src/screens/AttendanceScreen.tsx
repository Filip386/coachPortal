/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePortalTarget } from "../context/PhoneFrameContext";
import {
  ChevronLeft,
  Check,
  X,
  RefreshCw,
  ChevronDown,
  Search,
} from "lucide-react";
import { Axm365_eventattendancesService } from "../generated/services/Axm365_eventattendancesService";
import { Axm365_playereventperformancesService } from "../generated/services/Axm365_playereventperformancesService";
import { Axm365_eventcoachattendancesService } from "../generated/services/Axm365_eventcoachattendancesService";
import {
  COLORS,
  displayStack,
  fontStack,
  monoStack,
} from "../constants/design";
import type { ScreenId } from "../types/navigation";
import {
  StatusBar,
  LoadingSpinner,
  ErrorBanner,
  PlayerAvatar,
  StaleDataNotice,
  PerformanceEditorFields,
} from "../components/shared";
import {
  Tally,
  MarkBtn,
  SuccessBanner,
  RatingStars,
} from "../components/ui";
import { useData, PLAYER_ATTENDANCE_FIELDS, type DataResource } from "../context/DataContext";
import type { Axm365_eventattendances } from "../generated/models/Axm365_eventattendancesModel";
import { lookupName, operationErrorMessage, unwrap } from "../utils/dataverse";
import { isEventActive, lastWeekEventsNewestFirst } from "../utils/eventStatus";
import { normalizeGuid } from "../utils/guid";
import { initialsOf } from "../utils/names";
import { sortGenerationsByYear, type GenerationOption } from "../utils/generations";
import { hasUsableData } from "../utils/resourceStatus";
import {
  DEFAULT_STARS,
  PARENT_FEEDBACK_FIELD,
  parentFeedbackOf,
  performanceRating,
  ratingFromSkills,
  skillPayload,
  skillValuesFromPerformance,
  starsToCode,
  type SkillValues,
} from "../utils/performanceSkills";

type AttendanceMark = "present" | "late" | "absent";

const CLOCK_STORAGE_KEY = "coach_clock_session";

const LOCKED_MESSAGE =
  "Past sessions are locked. Only Back office can mark attendance or clock in for a past event.";

const ROSTER_RESOURCES: DataResource[] = [
  "players",
  "events",
  "performances",
  "generations",
  "generationsToCoaches",
];
const SCREEN_RESOURCES: DataResource[] = [
  "players",
  "events",
  "attendances",
  "performances",
  "generations",
  "generationsToCoaches",
];
const RESOURCES_TO_REFRESH_ON_OPEN: DataResource[] = [
  "players",
  "events",
  "attendances",
  "coachAttendances",
  "performances",
  "generations",
  "generationsToCoaches",
];
const SAVED_BANNER_MS = 1500;
const RETURN_HOME_AFTER_SAVE_MS = 1800;

interface AttendanceScreenProps {
  go: (id: ScreenId) => void;
  goBack?: () => void;
  initialEventId?: string | null;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({
  go,
  goBack,
  initialEventId,
}) => {
  const portalTarget = usePortalTarget();

  const {
    players,
    events,
    attendances,
    coachAttendances,
    performances,
    coachName,
    coachId,
    coachLookupLoading,
    coachLookupError,
    isBackOffice,
    refreshAttendances,
    refreshCoachAttendances,
    refreshPerformances,
    allGenerations,
    generationsToCoaches,
    ensureFresh,
    isLoadingResources,
    hasResourceErrors,
    hasStaleResources,
    getResourceError,
    resourceStatus,
    runDataverseRead,
    runDataverseWrite,
    recordCoachClockIn,
    recordPlayerAttendances,
  } = useData();

  const screenLoading = isLoadingResources(ROSTER_RESOURCES);
  const attendanceReady = hasUsableData(resourceStatus.attendances);
  const screenLoadError = hasResourceErrors(SCREEN_RESOURCES);
  const screenError = getResourceError(SCREEN_RESOURCES);
  const screenStale = hasStaleResources(SCREEN_RESOURCES);

  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    initialEventId ?? null
  );

  const [saveSuccess, setSaveSuccess] = useState(false);

  const [selectedGenerationId, setSelectedGenerationId] =
    useState<string>("all");

  const [genAutoSelected, setGenAutoSelected] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [showGenerationPicker, setShowGenerationPicker] = useState(false);
  const [genSearch, setGenSearch] = useState("");
  const [showEventPicker, setShowEventPicker] = useState(false);

  const [coachAttendanceId, setCoachAttendanceId] = useState<string | null>(
    null
  );

  const [clockedIn, setClockedIn] = useState(false);

  const [clockSaving, setClockSaving] = useState(false);

  const [clockError, setClockError] = useState<string | null>(null);

  const [clockedInEventId, setClockedInEventId] = useState<string | null>(null);

  const persistedClockIn = useMemo(() => {
    const normalizedCoachId = normalizeGuid(coachId);
    const normalizedEventId = normalizeGuid(selectedEventId);
    if (!normalizedCoachId || !normalizedEventId) return null;

    return (
      coachAttendances.find(
        (record) =>
          normalizeGuid(record._axm365_coach_value) === normalizedCoachId &&
          normalizeGuid(record._axm365_event_value) === normalizedEventId &&
          Boolean(record.axm365_clockin)
      ) ?? null
    );
  }, [coachAttendances, coachId, selectedEventId]);

  const coachAttendanceResolved = hasUsableData(resourceStatus.coachAttendances);
  const coachAttendanceLoadError = getResourceError(["coachAttendances"]);

  const isCurrentEventClockedIn =
    Boolean(persistedClockIn) ||
    (clockedIn && !!clockedInEventId && clockedInEventId === selectedEventId);

  const selectedEvent = useMemo(
    () => events.find((e) => e.axm365_eventid === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const locked = !!selectedEvent && !isBackOffice && !isEventActive(selectedEvent);

  const [perfEditPlayerId, setPerfEditPlayerId] = useState<string | null>(null);

  const [editSkills, setEditSkills] = useState<SkillValues>(() =>
    skillValuesFromPerformance()
  );
  const [editNotes, setEditNotes] = useState("");
  const [editParentFeedback, setEditParentFeedback] = useState("");

  const [perfSaving, setPerfSaving] = useState(false);
  const [perfSaveSuccess, setPerfSaveSuccess] = useState(false);
  const [perfSaveError, setPerfSaveError] = useState<string | null>(null);

  const { recentEvents, todayEvent } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const today =
      events.find(
        (e) => e.axm365_eventdate && new Date(e.axm365_eventdate).toDateString() === todayStr
      ) ?? null;

    return {
      recentEvents: lastWeekEventsNewestFirst(events, now),
      todayEvent: today,
    };
  }, [events]);

  const generations = useMemo(() => {
    const seen = new Set<string>();
    const result: GenerationOption[] = [];
    const addGeneration = (id?: string, name?: string | null) => {
      if (id && name && !seen.has(id)) {
        seen.add(id);
        result.push({ id, name });
      }
    };

    players.forEach((p) =>
      addGeneration(p._cr9be_generation_value, p.cr9be_generationname || lookupName(p, "cr9be_generation"))
    );
    generationsToCoaches
      .filter((mapping) => mapping._axm365_coach_value === coachId)
      .forEach((mapping) => addGeneration(mapping._axm365_generation_value, mapping.axm365_generationname));

    return sortGenerationsByYear(result);
  }, [coachId, players, generationsToCoaches]);

  const primaryGenId = useMemo(() => {
    if (!coachId) {
      return generations[0]?.id ?? null;
    }

    const coachPrimaryGeneration = allGenerations.find((g) => g._cr9be_coach_value === coachId);

    return coachPrimaryGeneration?.axm365_generationid ?? generations[0]?.id ?? null;
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
        : players.filter(
            (p) => p._cr9be_generation_value === selectedGenerationId
          ),
    [players, selectedGenerationId]
  );

  const selectedGenerationName =
    selectedGenerationId === "all"
      ? "All Generations"
      : generations.find((g) => g.id === selectedGenerationId)?.name ??
        "All Generations";

  useEffect(() => {
    if (events.length > 0 && !selectedEventId && !initialEventId) {
      setSelectedEventId(todayEvent?.axm365_eventid ?? null);
    }
  }, [events, todayEvent]);

  useEffect(() => {
    setClockError(null);
  }, [selectedEventId]);

  useEffect(() => {
    void ensureFresh(RESOURCES_TO_REFRESH_ON_OPEN);
  }, [ensureFresh]);

  useEffect(() => {
    const marksForEvent: Record<string, AttendanceMark> = {};

    for (const p of players) {
      marksForEvent[p.cr9be_playerid] = "present";
    }

    if (selectedEventId) {
      const eventRecords = attendances.filter((a) => a._axm365_event_value === selectedEventId);

      for (const record of eventRecords) {
        const playerId = record._axm365_player_value;

        if (playerId) {
          marksForEvent[playerId] = record.axm365_attended ? "present" : "absent";
        }
      }
    }

    setMarks(marksForEvent);
  }, [selectedEventId, attendances, players]);

  useEffect(() => {
    if (!perfEditPlayerId || !selectedEventId) {
      return;
    }

    const existing = performances.find(
      (p) =>
        p._axm365_cr9be_player_value === perfEditPlayerId &&
        p._axm365_event_value === selectedEventId
    );

    setEditSkills(skillValuesFromPerformance(existing));

    setEditNotes(existing?.axm365_notes ?? "");

    setEditParentFeedback(parentFeedbackOf(existing));

    setPerfSaveSuccess(false);
    setPerfSaveError(null);
  }, [perfEditPlayerId, selectedEventId, performances]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CLOCK_STORAGE_KEY);

      if (!stored) {
        return;
      }

      const session = JSON.parse(stored);

      console.log("[Clock] Stored session:", session);

      if (
        session?.clockedIn &&
        session?.coachAttendanceId &&
        session?.clockStartTime &&
        session?.eventId &&
        session?.coachId === coachId
      ) {
        setClockedIn(true);

        setCoachAttendanceId(session.coachAttendanceId);

        setClockedInEventId(session.eventId);

        console.log("[Clock] Restored clock session:", {
          eventId: session.eventId,
          coachAttendanceId: session.coachAttendanceId,
        });
      } else if (session?.coachId && session.coachId !== coachId) {
        console.log(
          "[Clock] Stored session's coach doesn't match the current coach (yet)."
        );
      } else {
        console.log("[Clock] Stored session is incomplete.");

        localStorage.removeItem(CLOCK_STORAGE_KEY);
      }
    } catch (err) {
      console.error("[Clock] Failed to restore clock session:", err);

      localStorage.removeItem(CLOCK_STORAGE_KEY);
    }
  }, [coachId]);

  const savePerfData = async () => {
    if (!perfEditPlayerId || !selectedEventId) {
      return;
    }

    if (locked) {
      setPerfSaveError(LOCKED_MESSAGE);
      return;
    }

    setPerfSaving(true);
    setPerfSaveError(null);

    try {
      const existing = performances.find(
        (p) =>
          p._axm365_cr9be_player_value === perfEditPlayerId &&
          p._axm365_event_value === selectedEventId
      );

      const perfPlayer = players.find(
        (p) => p.cr9be_playerid === perfEditPlayerId
      );

      const selectedEvent = events.find(
        (e) => e.axm365_eventid === selectedEventId
      );

      const payload = {
        axm365_performancename: `${perfPlayer?.cr9be_name ?? "Player"} - ${
          selectedEvent?.axm365_name ?? "Event"
        }`,

        axm365_raiting: starsToCode(ratingFromSkills(editSkills)) as any,

        ...skillPayload(editSkills),

        axm365_notes: editNotes,

        [PARENT_FEEDBACK_FIELD]: editParentFeedback.trim() || null,
      };

      if (existing) {
        const res = await runDataverseWrite(
          "Updating player performance",
          () => Axm365_playereventperformancesService.update(
            existing.axm365_playereventperformanceid,
            payload as any
          )
        );

        if (!res.success) throw new Error(operationErrorMessage(res.error, "Update failed"));
      } else {
        const res = await runDataverseWrite(
          "Creating player performance",
          () => Axm365_playereventperformancesService.create({
            ...payload,

            "axm365_cr9be_Player@odata.bind": `/cr9be_players(${perfEditPlayerId})`,

            "axm365_Event@odata.bind": `/axm365_events(${selectedEventId})`,
          } as any)
        );

        if (!res.success) throw new Error(operationErrorMessage(res.error, "Create failed"));
      }

      refreshPerformances().catch(() => {});

      setPerfSaveSuccess(true);

      setTimeout(() => {
        setPerfSaveSuccess(false);
        setPerfEditPlayerId(null);
      }, SAVED_BANNER_MS);
    } catch (err) {
      setPerfSaveError(
        err instanceof Error ? err.message : "Failed to save performance"
      );
    } finally {
      setPerfSaving(false);
    }
  };

  const setMark = (id: string, v: AttendanceMark) =>
    setMarks((m) => ({
      ...m,
      [id]: v,
    }));

  const savedAttendanceByPlayer = useMemo(() => {
    const result = new Map<string, boolean>();
    const normalizedEventId = normalizeGuid(selectedEventId);
    if (!normalizedEventId) return result;

    const shownPlayerIds = new Set(
      shownPlayers.map((player) => normalizeGuid(player.cr9be_playerid))
    );

    attendances.forEach((attendance) => {
      if (normalizeGuid(attendance._axm365_event_value) !== normalizedEventId) return;

      const playerId = normalizeGuid(attendance._axm365_player_value);
      if (!playerId || !shownPlayerIds.has(playerId)) return;

      result.set(playerId, Boolean(attendance.axm365_attended));
    });

    return result;
  }, [attendances, selectedEventId, shownPlayers]);

  const savedAttendanceValues = Array.from(savedAttendanceByPlayer.values());
  const presentCount = savedAttendanceValues.filter(Boolean).length;
  const absentCount = savedAttendanceValues.filter((attended) => !attended).length;

  const attendancePct =
    shownPlayers.length > 0
      ? Math.round((presentCount / shownPlayers.length) * 100)
      : 0;

  const throwIfError = (result: any, context: string) => {
    const err = result?.error ?? result?.Error ?? result?.errorCode;

    if (result?.success === false || err) {
      const raw = err?.message ?? err;

      const msg =
        typeof raw === "string"
          ? raw
          : raw
          ? JSON.stringify(raw)
          : "the request was rejected without an error detail (most likely a Dataverse privilege issue).";

      throw new Error(`${context}: ${msg}`);
    }
  };

  const handleClockInOut = async () => {
    console.log("[Clock] handleClockInOut called:", {
      clockedIn,
      clockedInEventId,
      selectedEventId,
      coachAttendanceId,
      coachId,
    });

    if (!selectedEventId) {
      setClockError("No event selected.");

      return;
    }

    if (locked) {
      setClockError(LOCKED_MESSAGE);

      return;
    }

    if (!coachId) {
      setClockError(
        coachLookupLoading
          ? "Still loading your coach profile — please wait a moment and try again."
          : coachLookupError ?? "Coach information is missing."
      );

      return;
    }

    if (!coachAttendanceResolved) {
      setClockError(
        coachAttendanceLoadError ??
          "Still checking whether this event already has a clock-in. Please wait a moment and try again."
      );
      void ensureFresh(["coachAttendances"], { force: true });
      return;
    }

    if (isCurrentEventClockedIn) {
      return;
    }

    if (clockedIn && clockedInEventId && clockedInEventId !== selectedEventId) {
      setClockedIn(false);
      setClockedInEventId(null);
      setCoachAttendanceId(null);
      localStorage.removeItem(CLOCK_STORAGE_KEY);
    }

    setClockSaving(true);
    setClockError(null);

    const activeClockInFilter = `statecode eq 0 and _axm365_coach_value eq ${coachId} and _axm365_event_value eq ${selectedEventId}`;

    const markClockedIn = (attendanceId: string) => {
      setCoachAttendanceId(attendanceId);
      setClockedInEventId(selectedEventId);
      setClockedIn(true);
    };

    const rememberClockSession = (attendanceId: string, clockStartTime: number) => {
      localStorage.setItem(
        CLOCK_STORAGE_KEY,
        JSON.stringify({
          clockedIn: true,
          coachAttendanceId: attendanceId,
          clockStartTime,
          eventId: selectedEventId,
          coachId,
        })
      );
    };

    try {
      const existingLookup = await runDataverseRead(
        "Checking existing clock in",
        () =>
          Axm365_eventcoachattendancesService.getAll({
            filter: activeClockInFilter,
            orderBy: ["createdon desc"],
          })
      );

      throwIfError(existingLookup, "Checking existing Clock In");

      const existingClockIn = (unwrap<any>(existingLookup) ?? []).find(
        (row: any) => Boolean(row?.axm365_clockin)
      );

      if (existingClockIn?.axm365_eventcoachattendanceid) {
        const existingId = existingClockIn.axm365_eventcoachattendanceid as string;
        const existingTime = String(existingClockIn.axm365_clockin);

        markClockedIn(existingId);
        recordCoachClockIn(selectedEventId, existingId, existingTime);
        rememberClockSession(existingId, new Date(existingTime).getTime());
        return;
      }

      console.log("[Clock] Clocking IN:", {
        coachId,
        eventId: selectedEventId,
      });

      const clockInAt = new Date();

      const res = await runDataverseWrite(
        "Clocking in",
        () => Axm365_eventcoachattendancesService.create({
          axm365_name: `${
            coachName ?? "Coach"
          } - ${new Date().toLocaleDateString()}`,

          axm365_clockin: clockInAt,

          "axm365_Coach@odata.bind": `/cr9be_coachs(${coachId})`,

          "axm365_Event@odata.bind": `/axm365_events(${selectedEventId})`,
        } as any)
      );

      throwIfError(res, "Clock In");

      console.log("[Clock] Raw create response:", res);

      let createdId: string | null =
        (res as any)?.data?.axm365_eventcoachattendanceid ??
        (res as any)?.axm365_eventcoachattendanceid ??
        (res as any)?.data?.id ??
        (res as any)?.id ??
        null;

      if (!createdId) {
        console.warn(
          "[Clock] Create returned no record id — reading the row back by coach + event."
        );

        const lookup = await runDataverseRead(
          "Confirming clock in",
          () => Axm365_eventcoachattendancesService.getAll({
            filter: activeClockInFilter,
          })
        );

        throwIfError(lookup, "Clock In (confirming the saved record)");

        const rows = (unwrap<any>(lookup) ?? []).slice().sort((a: any, b: any) =>
          String(b?.createdon ?? "").localeCompare(String(a?.createdon ?? ""))
        );

        createdId = rows[0]?.axm365_eventcoachattendanceid ?? null;

        console.log("[Clock] Read-back found rows:", rows.length, "id:", createdId);
      }

      if (!createdId) {
        throw new Error(
          "Clock In was sent, but the saved attendance record could not be confirmed. Check the Event Coach Attendances table before clocking in again."
        );
      }

      const clockStartTime = Date.now();
      markClockedIn(createdId);
      rememberClockSession(createdId, clockStartTime);

      recordCoachClockIn(
        selectedEventId,
        createdId,
        clockInAt.toISOString()
      );
      void refreshCoachAttendances().catch(() => {});

      console.log("[Clock] Clock IN completed:", {
        attendanceId: createdId,
        eventId: selectedEventId,
        coachId,
      });
    } catch (err) {
      console.error("[Clock] Clock In failed:", err);

      setClockError(
        err instanceof Error ? err.message : "Clock In failed."
      );
    } finally {
      setClockSaving(false);
    }
  };

  const saveAttendance = async () => {
    if (!selectedEventId) {
      return;
    }

    setSaveSuccess(false);
    setWriteError(null);

    if (locked) {
      setWriteError(LOCKED_MESSAGE);
      return;
    }

    if (shownPlayers.length === 0) {
      setWriteError("No players to save for this generation.");

      return;
    }

    if (!attendanceReady) {
      setWriteError(
        "Saved attendance is still loading. Please wait a moment and try again."
      );
      return;
    }

    const writes = shownPlayers.flatMap((p) => {
      const playerId = p.cr9be_playerid;
      const attended = (marks[playerId] ?? "present") !== "absent";

      const existing = attendances.find(
        (a) =>
          a._axm365_player_value === playerId &&
          a._axm365_event_value === selectedEventId
      );

      if (existing && Boolean(existing.axm365_attended) === attended) {
        return [];
      }

      return [{ player: p, playerId, attended, existing }];
    });

    const confirmed: Axm365_eventattendances[] = [];
    let createdWithoutId = false;
    let failed = false;

    setSaving(true);
    setSaveProgress({ done: 0, total: writes.length });

    try {
      for (let index = 0; index < writes.length; index += 1) {
        const { player: p, playerId, attended, existing } = writes[index];

        if (existing) {
          const res = await runDataverseWrite(
            `Updating attendance for ${p.cr9be_name}`,
            () => Axm365_eventattendancesService.update(
              existing.axm365_eventattendanceid,
              {
                axm365_name: p.cr9be_name,

                axm365_attended: attended,
              } as any
            )
          );

          throwIfError(res, `Update ${p.cr9be_name}`);

          confirmed.push({
            ...existing,
            axm365_name: p.cr9be_name,
            axm365_attended: attended,
          });
        } else {
          const res = await runDataverseWrite(
            `Creating attendance for ${p.cr9be_name}`,
            () => Axm365_eventattendancesService.create({
              axm365_name: p.cr9be_name,

              "axm365_Player@odata.bind": `/cr9be_players(${playerId})`,

              "axm365_Event@odata.bind": `/axm365_events(${selectedEventId})`,

              axm365_attended: attended,
            } as any)
          );

          throwIfError(res, `Create ${p.cr9be_name}`);

          const createdId: string | null =
            (res as any)?.data?.axm365_eventattendanceid ??
            (res as any)?.axm365_eventattendanceid ??
            null;

          if (createdId) {
            confirmed.push({
              axm365_eventattendanceid: createdId,
              axm365_name: p.cr9be_name,
              axm365_attended: attended,
              _axm365_event_value: selectedEventId,
              _axm365_player_value: playerId,
            } as Axm365_eventattendances);
          } else {
            createdWithoutId = true;
          }
        }

        setSaveProgress({ done: index + 1, total: writes.length });
      }
    } catch (err) {
      failed = true;
      setWriteError(
        err instanceof Error ? err.message : "Failed to save attendance"
      );
    }

    recordPlayerAttendances(confirmed);

    if (createdWithoutId) {
      try {
        const eventRows = await runDataverseRead(
          "Confirming saved attendance",
          () =>
            Axm365_eventattendancesService.getAll({
              select: PLAYER_ATTENDANCE_FIELDS,
              filter: `_axm365_event_value eq ${selectedEventId}`,
            })
        );
        throwIfError(eventRows, "Confirming saved attendance");
        recordPlayerAttendances(
          unwrap<Axm365_eventattendances>(eventRows) ?? []
        );
      } catch {
        await refreshAttendances().catch(() => {});
      }
    }

    setSaving(false);
    setSaveProgress(null);

    if (!failed) {
      setSaveSuccess(true);

      setTimeout(() => {
        go("home");
      }, RETURN_HOME_AFTER_SAVE_MS);
    }
  };

  const eventName = selectedEvent ? selectedEvent.axm365_name : "Select Event";

  const perfEditPlayer = players.find(
    (p) => p.cr9be_playerid === perfEditPlayerId
  );

  return (
    <>
      <div
        style={{
          background: COLORS.navy,
          color: "#fff",
          paddingBottom: 24,
        }}
      >
        <StatusBar />

        <div style={{ padding: "0 22px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => (goBack ? goBack() : go("home"))}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ChevronLeft size={18} color="#fff" strokeWidth={2} />
            </button>

            <button
              onClick={() => setShowGenerationPicker(true)}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 10,
                color: COLORS.yellow,
                fontFamily: monoStack,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                padding: "6px 10px",
                cursor: "pointer",
                maxWidth: 190,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedGenerationName}
              </span>

              <ChevronDown
                size={12}
                color={COLORS.yellow}
                strokeWidth={2.5}
                style={{
                  flexShrink: 0,
                }}
              />
            </button>
          </div>

          <div
            style={{
              marginTop: 18,
            }}
          >
            <button
              onClick={() =>
                recentEvents.length > 0 && setShowEventPicker(true)
              }
              disabled={recentEvents.length === 0}
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                cursor: recentEvents.length > 0 ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: monoStack,
                  fontSize: 10.5,
                  letterSpacing: "0.22em",
                  color: COLORS.yellow,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  textAlign: "left",
                }}
              >
                {eventName}
              </span>

              {recentEvents.length > 0 && (
                <ChevronDown
                  size={12}
                  color={COLORS.yellow}
                  strokeWidth={2.5}
                  style={{
                    flexShrink: 0,
                  }}
                />
              )}
            </button>

            <h1
              style={{
                fontFamily: displayStack,
                fontSize: 28,
                margin: "6px 0 0",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontWeight: 800,
              }}
            >
              Mark Attendance
            </h1>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
              }}
            >
              {isCurrentEventClockedIn ? (
                <div
                  style={{
                    flex: 1,
                    height: 42,
                    padding: "0 16px",

                    background: "rgba(34, 197, 94, 0.18)",

                    color: "#fff",

                    border: "1px solid rgba(34,197,94,0.55)",

                    borderRadius: 12,

                    fontFamily: monoStack,

                    fontSize: 10,

                    fontWeight: 700,

                    letterSpacing: "0.13em",

                    display: "flex",

                    alignItems: "center",

                    justifyContent: "center",

                    gap: 8,

                    boxShadow: "0 4px 14px rgba(34,197,94,0.18)",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#22C55E",
                      boxShadow: "0 0 0 4px rgba(34,197,94,0.12)",
                      flexShrink: 0,
                    }}
                  />
                  YOU ARE CLOCKED IN
                </div>
              ) : (
                <button
                  onClick={handleClockInOut}
                  disabled={
                    clockSaving ||
                    locked ||
                    coachLookupLoading ||
                    !coachAttendanceResolved
                  }
                  title={
                    locked
                      ? LOCKED_MESSAGE
                      : coachLookupLoading
                      ? "Still loading your coach profile — the button will enable automatically."
                      : !coachAttendanceResolved
                      ? "Checking existing clock-in records — the button will enable automatically."
                      : undefined
                  }
                  style={{
                    flex: 1,
                    height: 42,
                    padding: "0 16px",

                    background: clockSaving
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.10)",

                    color: COLORS.yellow,

                    border: "1px solid rgba(255,255,255,0.20)",

                    borderRadius: 12,

                    fontFamily: monoStack,

                    fontSize: 10,

                    fontWeight: 700,

                    letterSpacing: "0.13em",

                    cursor:
                      clockSaving ||
                      locked ||
                      coachLookupLoading ||
                      !coachAttendanceResolved
                        ? "not-allowed"
                        : "pointer",

                    opacity: clockSaving
                      ? 0.65
                      : locked || coachLookupLoading || !coachAttendanceResolved
                      ? 0.45
                      : 1,

                    transition: "all 0.2s ease",

                    display: "flex",

                    alignItems: "center",

                    justifyContent: "center",

                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: COLORS.yellow,
                      boxShadow: "0 0 0 4px rgba(255,214,0,0.08)",
                      flexShrink: 0,
                    }}
                  />
                  {clockSaving
                    ? "SAVING..."
                    : coachLookupLoading
                    ? "LOADING PROFILE..."
                    : !coachAttendanceResolved
                    ? "CHECKING CLOCK IN..."
                    : "CLOCK IN"}
                </button>
              )}
            </div>
          </div>

          {!screenLoading && !screenLoadError && attendanceReady && shownPlayers.length > 0 && (
            <div
              style={{
                marginTop: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  opacity: 0.8,
                  marginBottom: 6,
                  fontFamily: monoStack,
                  letterSpacing: "0.1em",
                }}
              >
                <span>
                  {presentCount} of {shownPlayers.length} present
                </span>

                <span
                  style={{
                    color: COLORS.yellow,
                    fontWeight: 700,
                  }}
                >
                  {attendancePct}%
                </span>
              </div>

              <div
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.12)",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${attendancePct}%`,
                    background: COLORS.yellow,
                    borderRadius: 99,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  gap: 8,
                }}
              >
                <Tally
                  label="Players"
                  count={shownPlayers.length}
                  color={COLORS.yellow}
                />

                <Tally
                  label="Present"
                  count={presentCount}
                  color={COLORS.green}
                />

                <Tally label="Absent" count={absentCount} color={COLORS.red} />
              </div>
            </div>
          )}
        </div>
      </div>

      {screenLoading && (
        <LoadingSpinner label="Loading players…" />
      )}

      {screenError && (
        <ErrorBanner
          message={screenError}
          onRetry={() =>
            void ensureFresh(
              ["players", "events", "attendances", "performances", "generations", "generationsToCoaches"],
              { force: true }
            )
          }
        />
      )}

      {screenStale && <StaleDataNotice />}

      {coachAttendanceLoadError && (
        <ErrorBanner
          message={coachAttendanceLoadError}
          onRetry={() => void refreshCoachAttendances().catch(() => {})}
        />
      )}

      {writeError && (
        <ErrorBanner message={writeError} onRetry={saveAttendance} />
      )}

      {clockError && (
        <ErrorBanner message={clockError} onRetry={handleClockInOut} />
      )}

      {saveSuccess && (
        <SuccessBanner message="Attendance saved successfully!" />
      )}

      {!screenLoading &&
        !screenLoadError &&
        shownPlayers.length > 0 &&
        (selectedEventId || initialEventId) && (
          <div
            style={{
              padding: "18px 16px 20px",
            }}
          >
            <div
              style={{
                position: "relative",
                marginBottom: 12,
              }}
            >
              <Search
                size={14}
                color={COLORS.mute}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              />

              <input
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search player…"
                style={{
                  width: "100%",
                  padding: "10px 36px 10px 34px",
                  borderRadius: 12,
                  border: `1px solid ${COLORS.line}`,
                  fontFamily: fontStack,
                  fontSize: 13.5,
                  color: COLORS.navy,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#fff",
                }}
              />

              {playerSearch.length > 0 && (
                <button
                  onClick={() => setPlayerSearch("")}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 20,
                    height: 20,
                    borderRadius: 99,
                    background: COLORS.line,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  <X size={11} color={COLORS.navy} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {shownPlayers
                .filter(
                  (p) =>
                    !playerSearch ||
                    (p.cr9be_name || "")
                      .toLowerCase()
                      .includes(playerSearch.toLowerCase())
                )
                .map((p) => {
                  const playerId = p.cr9be_playerid;

                  const name = p.cr9be_name || "Unknown Player";

                  const num = p.cr9be_number ?? "?";

                  const pos = lookupName(p, "cr9be_position");

                  const initials = initialsOf(name);

                  const existingPerf = performances.find(
                    (perf) =>
                      perf._axm365_cr9be_player_value === playerId &&
                      perf._axm365_event_value === selectedEventId
                  );

                  const perfRating = existingPerf
                    ? performanceRating(existingPerf)
                    : DEFAULT_STARS;

                  const isAbsent = marks[playerId] === "absent";

                  return (
                    <div
                      key={playerId}
                      style={{
                        background: "#fff",
                        borderRadius: 16,
                        padding: 12,
                        border: `1px solid ${COLORS.line}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div
                        onClick={() => setPerfEditPlayerId(playerId)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          flex: 1,
                          cursor: "pointer",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            flexShrink: 0,
                          }}
                        >
                          <PlayerAvatar
                            playerId={playerId}
                            hasPicture={!!p.cr9be_pictureid}
                            pictureVersion={p.cr9be_picture_timestamp}
                            initials={initials}
                            size={42}
                          />

                          <span
                            style={{
                              position: "absolute",
                              bottom: -3,
                              right: -3,
                              background: COLORS.yellow,
                              color: COLORS.navy,
                              fontSize: 9.5,
                              fontWeight: 800,
                              width: 18,
                              height: 18,
                              borderRadius: 99,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "2px solid #fff",
                            }}
                          >
                            {num}
                          </span>
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: COLORS.navy,
                              fontSize: 13.5,
                            }}
                          >
                            {name}
                          </div>

                          <div
                            style={{
                              fontSize: 10.5,
                              color: COLORS.mute,
                              fontFamily: monoStack,
                              letterSpacing: "0.1em",
                              marginTop: 2,
                            }}
                          >
                            {pos ? `${pos} · ` : ""}#{num}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                            }}
                          >
                            <RatingStars
                              rating={perfRating}
                              size={11}
                              gap={2}
                              strokeWidth={1.5}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexShrink: 0,
                          opacity: locked || !attendanceReady ? 0.5 : 1,
                          pointerEvents:
                            locked || !attendanceReady ? "none" : undefined,
                        }}
                      >
                        <MarkBtn
                          active={!isAbsent}
                          onClick={() => setMark(playerId, "present")}
                          bg={COLORS.green}
                        >
                          <Check size={16} />
                        </MarkBtn>

                        <MarkBtn
                          active={isAbsent}
                          onClick={() => setMark(playerId, "absent")}
                          bg={COLORS.red}
                        >
                          <X size={16} />
                        </MarkBtn>
                      </div>
                    </div>
                  );
                })}
            </div>

            {locked && (
              <ErrorBanner message={LOCKED_MESSAGE} />
            )}

            <button
              disabled={saving || locked || !attendanceReady}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "14px 0",
                background:
                  saving || locked || !attendanceReady
                    ? COLORS.mute
                    : COLORS.navy,
                color: "#fff",
                border: 0,
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 700,
                cursor:
                  saving || locked || !attendanceReady
                    ? "not-allowed"
                    : "pointer",
                letterSpacing: "0.02em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onClick={saveAttendance}
            >
              {saving && (
                <RefreshCw
                  size={14}
                  style={{
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}

              {locked
                ? "Locked"
                : saving
                ? saveProgress && saveProgress.total > 0
                  ? `Saving ${saveProgress.done}/${saveProgress.total}…`
                  : "Saving…"
                : !attendanceReady
                ? "Loading saved attendance…"
                : "Save Attendance →"}
            </button>
          </div>
        )}

      {!screenLoading && !screenLoadError && !initialEventId && !todayEvent && events.length > 0 && (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: COLORS.yellowSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke={COLORS.navy}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>

          <div>
            <div
              style={{
                fontFamily: displayStack,
                fontWeight: 800,
                fontSize: 17,
                color: COLORS.navy,
                marginBottom: 6,
              }}
            >
              No Event Today
            </div>

            <div
              style={{
                fontSize: 13,
                color: COLORS.mute,
                lineHeight: 1.5,
              }}
            >
              There is no event scheduled for today.
              <br />
              Please create an event first.
            </div>
          </div>

          <button
            onClick={() => go("create")}
            style={{
              marginTop: 4,
              background: COLORS.navy,
              color: "#fff",
              border: 0,
              padding: "12px 28px",
              borderRadius: 14,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            Create Event →
          </button>
        </div>
      )}

      {!screenLoading &&
        !screenLoadError &&
        shownPlayers.length === 0 &&
        (selectedEventId || initialEventId) && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: COLORS.mute,
            }}
          >
            {players.length === 0
              ? "No players found. Please add players to your squad first."
              : "No players in this generation."}
          </div>
        )}

      {showGenerationPicker &&
        (() => {
          const filteredGens = generations.filter((g) =>
            g.name.toLowerCase().includes(genSearch.toLowerCase())
          );

          const options = [
            {
              id: "all",
              name: "All Generations",
            },
            ...filteredGens,
          ];

          const modal = (
            <div
              style={{
                position: portalTarget ? "absolute" : "fixed",
                inset: 0,
                zIndex: 999,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "flex-end",
              }}
              onClick={() => {
                setShowGenerationPicker(false);
                setGenSearch("");
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "#fff",
                  borderRadius: "24px 24px 0 0",
                  width: "100%",
                  maxHeight: "72vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 0 4px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 99,
                      background: COLORS.line,
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "8px 22px 14px",
                    borderBottom: `1px solid ${COLORS.line}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: displayStack,
                      fontWeight: 800,
                      fontSize: 18,
                      color: COLORS.navy,
                      marginBottom: 10,
                    }}
                  >
                    Choose Generation
                  </div>

                  <div
                    style={{
                      position: "relative",
                    }}
                  >
                    <Search
                      size={14}
                      color={COLORS.mute}
                      style={{
                        position: "absolute",
                        left: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                      }}
                    />

                    <input
                      autoFocus
                      value={genSearch}
                      onChange={(e) => setGenSearch(e.target.value)}
                      placeholder="Search generations…"
                      style={{
                        width: "100%",
                        padding: "10px 14px 10px 36px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.line}`,
                        fontFamily: fontStack,
                        fontSize: 13.5,
                        color: COLORS.navy,
                        outline: "none",
                        boxSizing: "border-box",
                        background: COLORS.cream,
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    overflowY: "auto",
                    padding: "10px 22px 30px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {options.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: 30,
                        color: COLORS.mute,
                        fontFamily: monoStack,
                        fontSize: 12,
                        letterSpacing: "0.1em",
                      }}
                    >
                      NO GENERATIONS FOUND
                    </div>
                  )}

                  {options.map((g) => {
                    const isActive = g.id === selectedGenerationId;

                    return (
                      <button
                        key={g.id}
                        onClick={() => {
                          setSelectedGenerationId(g.id);

                          setShowGenerationPicker(false);

                          setGenSearch("");
                        }}
                        style={{
                          background: isActive ? COLORS.navy : "#fff",

                          border: `1px solid ${
                            isActive ? COLORS.navy : COLORS.line
                          }`,

                          borderRadius: 14,

                          padding: "14px 16px",

                          cursor: "pointer",

                          display: "flex",

                          alignItems: "center",

                          gap: 12,

                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: isActive ? "#fff" : COLORS.navy,
                              fontSize: 14,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {g.name}
                          </div>
                        </div>

                        {isActive && (
                          <Check
                            size={16}
                            color={COLORS.yellow}
                            strokeWidth={2.5}
                            style={{
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );

          return portalTarget ? createPortal(modal, portalTarget) : modal;
        })()}

      {showEventPicker &&
        (() => {
          const modal = (
            <div
              style={{
                position: portalTarget ? "absolute" : "fixed",
                inset: 0,
                zIndex: 999,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "flex-end",
              }}
              onClick={() => setShowEventPicker(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "#fff",
                  borderRadius: "24px 24px 0 0",
                  width: "100%",
                  maxHeight: "72vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 0 4px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 99,
                      background: COLORS.line,
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "8px 22px 14px",
                    borderBottom: `1px solid ${COLORS.line}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: displayStack,
                      fontWeight: 800,
                      fontSize: 18,
                      color: COLORS.navy,
                    }}
                  >
                    Choose Event
                  </div>

                  <div
                    style={{
                      fontFamily: monoStack,
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      color: COLORS.mute,
                      marginTop: 4,
                      textTransform: "uppercase",
                    }}
                  >
                    Last week
                  </div>
                </div>

                <div
                  style={{
                    overflowY: "auto",
                    padding: "10px 22px 30px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {recentEvents.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: 30,
                        color: COLORS.mute,
                        fontFamily: monoStack,
                        fontSize: 12,
                        letterSpacing: "0.1em",
                      }}
                    >
                      NO RECENT EVENTS
                    </div>
                  )}

                  {recentEvents.map((e) => {
                    const isActive = e.axm365_eventid === selectedEventId;

                    const evDate = e.axm365_eventdate
                      ? new Date(e.axm365_eventdate)
                      : null;

                    return (
                      <button
                        key={e.axm365_eventid}
                        onClick={() => {
                          setSelectedEventId(e.axm365_eventid);

                          setShowEventPicker(false);
                        }}
                        style={{
                          background: isActive ? COLORS.navy : "#fff",

                          border: `1px solid ${
                            isActive ? COLORS.navy : COLORS.line
                          }`,

                          borderRadius: 14,

                          padding: "12px 14px",

                          cursor: "pointer",

                          display: "flex",

                          alignItems: "center",

                          gap: 12,

                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 10,

                            background: isActive ? COLORS.yellow : COLORS.cream,

                            display: "flex",

                            flexDirection: "column",

                            alignItems: "center",

                            justifyContent: "center",

                            flexShrink: 0,
                          }}
                        >
                          {evDate ? (
                            <>
                              <span
                                style={{
                                  fontFamily: displayStack,
                                  fontWeight: 800,
                                  fontSize: 14,
                                  color: COLORS.navy,
                                  lineHeight: 1,
                                }}
                              >
                                {evDate.getDate()}
                              </span>

                              <span
                                style={{
                                  fontFamily: monoStack,
                                  fontSize: 8,
                                  color: COLORS.mute,
                                  letterSpacing: "0.1em",
                                  lineHeight: 1,
                                  marginTop: 2,
                                }}
                              >
                                {evDate
                                  .toLocaleDateString("en-US", {
                                    month: "short",
                                  })
                                  .toUpperCase()}
                              </span>
                            </>
                          ) : (
                            <span
                              style={{
                                fontFamily: monoStack,
                                fontSize: 9,
                                color: COLORS.mute,
                              }}
                            >
                              --
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: isActive ? "#fff" : COLORS.navy,
                              fontSize: 13.5,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {e.axm365_name || "Unnamed Event"}
                          </div>

                          {evDate && (
                            <div
                              style={{
                                fontSize: 10.5,
                                color: isActive
                                  ? "rgba(255,255,255,0.6)"
                                  : COLORS.mute,
                                fontFamily: monoStack,
                                letterSpacing: "0.08em",
                                marginTop: 2,
                              }}
                            >
                              {evDate
                                .toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })
                                .toUpperCase()}

                              {" · "}

                              {evDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                        </div>

                        {isActive && (
                          <Check
                            size={16}
                            color={COLORS.yellow}
                            strokeWidth={2.5}
                            style={{
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );

          return portalTarget ? createPortal(modal, portalTarget) : modal;
        })()}

      {perfEditPlayerId &&
        (() => {
          const modal = (
            <div
              style={{
                position: portalTarget ? "absolute" : "fixed",
                inset: 0,
                zIndex: 1000,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "flex-end",
              }}
              onClick={() => !perfSaving && setPerfEditPlayerId(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "#fff",
                  borderRadius: "24px 24px 0 0",
                  width: "100%",
                  maxHeight: "88vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 0 4px",
                    display: "flex",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 99,
                      background: COLORS.line,
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "0 22px 14px",
                    borderBottom: `1px solid ${COLORS.line}`,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    {perfEditPlayer && (
                      <PlayerAvatar
                        playerId={perfEditPlayer.cr9be_playerid}
                        hasPicture={!!perfEditPlayer.cr9be_pictureid}
                        pictureVersion={perfEditPlayer.cr9be_picture_timestamp}
                        initials={initialsOf(perfEditPlayer.cr9be_name || "P")}
                        size={44}
                      />
                    )}

                    <div
                      style={{
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: displayStack,
                          fontWeight: 800,
                          fontSize: 17,
                          color: COLORS.navy,
                        }}
                      >
                        {perfEditPlayer?.cr9be_name || "Player"}
                      </div>

                      <div
                        style={{
                          fontFamily: monoStack,
                          fontSize: 9.5,
                          color: COLORS.mute,
                          letterSpacing: "0.12em",
                          marginTop: 1,
                        }}
                      >
                        {eventName} · Edit Performance
                      </div>
                    </div>

                    <button
                      onClick={() => setPerfEditPlayerId(null)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 99,
                        background: COLORS.cream,
                        border: `1px solid ${COLORS.line}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X size={14} color={COLORS.navy} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    overflowY: "auto",
                    padding: "16px 22px 30px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 20,
                  }}
                >
                  {perfSaveSuccess && (
                    <div
                      style={{
                        background: COLORS.green,
                        color: "#fff",
                        borderRadius: 12,
                        padding: "10px 14px",
                        textAlign: "center",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      Performance saved!
                    </div>
                  )}

                  {perfSaveError && (
                    <div
                      style={{
                        background: "#FEE2E2",
                        color: "#DC2626",
                        borderRadius: 12,
                        padding: "10px 14px",
                        fontSize: 12,
                      }}
                    >
                      {perfSaveError}
                    </div>
                  )}

                  <PerformanceEditorFields
                    ratingLabel="Session Rating"
                    playerName={perfEditPlayer?.cr9be_name ?? "Player"}
                    positionName={lookupName(perfEditPlayer, "cr9be_position")}
                    skills={editSkills}
                    onSkillsChange={setEditSkills}
                    notes={editNotes}
                    onNotesChange={setEditNotes}
                    parentFeedback={editParentFeedback}
                    onParentFeedbackChange={setEditParentFeedback}
                    disabled={locked}
                  />

                  {locked && (
                    <ErrorBanner message={LOCKED_MESSAGE} />
                  )}

                  <button
                    disabled={perfSaving || locked}
                    onClick={savePerfData}
                    style={{
                      width: "100%",
                      padding: "14px 0",
                      background: perfSaving || locked ? COLORS.mute : COLORS.navy,
                      color: "#fff",
                      border: 0,
                      borderRadius: 14,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: perfSaving || locked ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {perfSaving && (
                      <RefreshCw
                        size={14}
                        style={{
                          animation: "spin 1s linear infinite",
                        }}
                      />
                    )}

                    {locked ? "Locked" : perfSaving ? "Saving…" : "Save Performance →"}
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
