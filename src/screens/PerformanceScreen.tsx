/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Pencil, X, RefreshCw, ArrowUp, ArrowDown, User, Phone, Eye } from "lucide-react";
import { COLORS, fontStack, displayStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner, PlayerAvatar, StaleDataNotice, PerformanceEditorFields } from "../components/shared";
import { AttributeBar, RatingStars } from "../components/ui";
import { useData, type GuardianContactDetails } from "../context/DataContext";
import { usePortalTarget } from "../context/PhoneFrameContext";
import { Axm365_playereventperformancesService } from "../generated/services/Axm365_playereventperformancesService";
import { Cr9be_playersService } from "../generated/services/Cr9be_playersService";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import type { Axm365_playereventperformances } from "../generated/models/Axm365_playereventperformancesModel";
import { lookupName } from "../utils/dataverse";
import {
  PERFORMANCE_SKILLS,
  PARENT_FEEDBACK_FIELD,
  DEFAULT_STARS,
  formatRating,
  parentFeedbackOf,
  performanceRating,
  ratingFromSkills,
  readSkill,
  skillLabel,
  skillPayload,
  skillValuesFromPerformance,
  starsToCode,
  type SkillValues,
} from "../utils/performanceSkills";

const EVENT_TYPE_TRAINING = 216260000;

// "Training" or "Match" — every non-training event type is a kind of match.
const eventKindLabel = (event: Axm365_events): string =>
  event.axm365_eventtype === undefined || event.axm365_eventtype === null
    ? event.axm365_eventtypename || "Event"
    : event.axm365_eventtype === EVENT_TYPE_TRAINING ? "Training" : "Match";

const formatRatingChange = (change: number): string =>
  `${change > 0 ? "+" : ""}${Number.isInteger(change) ? change : change.toFixed(1)}`;

const lineClamp = (lines: number): React.CSSProperties => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
});

const normalizeGuid = (value?: string | null): string =>
  (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();

const sameGuid = (left?: string | null, right?: string | null): boolean => {
  const normalizedLeft = normalizeGuid(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeGuid(right);
};

interface PerformanceScreenProps {
  go: (id: ScreenId, playerId?: string) => void;
  goBack?: () => void;
  selectedPlayerId?: string | null;
  initialEventId?: string | null;
}

export const PerformanceScreen: React.FC<PerformanceScreenProps> = ({ go, goBack, selectedPlayerId, initialEventId }) => {
  const { players, performances, events, refreshPlayers, refreshPerformances, coachId, allGenerations, generationsToCoaches, ensureFresh, getCachedGuardianContact, getGuardianContact, runDataverseWrite, isLoadingResources, hasResourceErrors, hasStaleResources, getResourceError } = useData();
  // Only the Player table blocks the visible screen. The other resources keep
  // loading in the background, so cached Players and their guardian details
  // remain visible while Coach/Generation mapping is still resolving.
  const screenLoading = isLoadingResources(["players"]);
  const screenLoadError = hasResourceErrors(["players"]);
  const screenError = getResourceError([
    "players",
    "events",
    "performances",
    "generations",
    "generationsToCoaches",
  ]);
  const screenStale = hasStaleResources([
    "players",
    "events",
    "performances",
    "generations",
    "generationsToCoaches",
  ]);
  const portalTarget = usePortalTarget();
  const [selectedId, setSelectedId] = useState<string | null>(selectedPlayerId ?? null);
  const [selectedGenId, setSelectedGenId] = useState("all");
  const autoSelectedCoachRef = React.useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [perfTab, setPerfTab] = useState<"attributes" | "feedback">("attributes");
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);

  // Performance edit modal state — event selection is optional
  const [showEditModal, setShowEditModal] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [editSkills, setEditSkills] = useState<SkillValues>(() => skillValuesFromPerformance());
  const [editNotes, setEditNotes] = useState("");
  const [editParentFeedback, setEditParentFeedback] = useState("");
  const [perfSaving, setPerfSaving] = useState(false);
  const [perfSaveSuccess, setPerfSaveSuccess] = useState(false);
  const [perfSaveError, setPerfSaveError] = useState<string | null>(null);

  // Player details edit modal (jersey number + position) — separate from the
  // performance modal above since it edits the player record, not a performance entry.
  const [showEditPlayerModal, setShowEditPlayerModal] = useState(false);
  const [editPlayerNumber, setEditPlayerNumber] = useState("");
  const [editPlayerPositionId, setEditPlayerPositionId] = useState<string | null>(null);
  const [positionPickerOpen, setPositionPickerOpen] = useState(false);
  const [playerSaving, setPlayerSaving] = useState(false);
  const [playerSaveSuccess, setPlayerSaveSuccess] = useState(false);
  const [playerSaveError, setPlayerSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Players are the critical first stage: they identify the selected
    // guardian. Starting every Performance read here used to put the Contact
    // lookup at the back of the mobile-safe Dataverse queue.
    if (players.length === 0) void ensureFresh(["players"]);
  }, [ensureFresh, players.length]);

  const generationTabs = useMemo(() => {
    const sortGenerations = (items: { id: string; name: string }[]) => {
      const yearOf = (name: string) => {
        const match = name.match(/\d{4}/) || name.match(/\d+/);
        return match ? parseInt(match[0], 10) : Infinity;
      };
      return items.sort((left, right) => {
        const leftYear = yearOf(left.name);
        const rightYear = yearOf(right.name);
        return leftYear !== rightYear
          ? leftYear - rightYear
          : left.name.localeCompare(right.name);
      });
    };

    const collectPlayerGenerations = () => {
      const seen = new Set<string>();
      const result: { id: string; name: string }[] = [];
      players.forEach((player) => {
        const id = (player as any)._cr9be_generation_value as string | undefined;
        const name =
          player.cr9be_generationname || lookupName(player, "cr9be_generation");
        const normalizedId = normalizeGuid(id);
        if (id && name && normalizedId && !seen.has(normalizedId)) {
          seen.add(normalizedId);
          result.push({ id, name });
        }
      });
      return result;
    };

    const playerGenerations = collectPlayerGenerations();
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

    // Never expose a generation filter that produces an empty Player list.
    // If cached relationship tables disagree with cached Players, fall back to
    // the generations actually present on those Players until refresh repairs it.
    const relatedWithPlayers = related.filter((generation) =>
      players.some((player) =>
        sameGuid((player as any)._cr9be_generation_value, generation.id)
      )
    );

    return sortGenerations(
      relatedWithPlayers.length > 0 ? relatedWithPlayers : playerGenerations
    );
  }, [coachId, players, allGenerations, generationsToCoaches]);

  const coachPlayers = useMemo(() => {
    if (!coachId || generationTabs.length === 0) return players;
    const filtered = players.filter((player) =>
      generationTabs.some((generation) =>
        sameGuid(
          (player as any)._cr9be_generation_value,
          generation.id
        )
      )
    );
    return filtered.length > 0 ? filtered : players;
  }, [coachId, generationTabs, players]);

  const primaryGenId = useMemo(() => {
    if (!coachId) return null;

    const primaryGeneration = allGenerations.find((generation) =>
      sameGuid((generation as any)._cr9be_coach_value, coachId)
    );
    const primaryTab = generationTabs.find((generation) =>
      sameGuid(generation.id, primaryGeneration?.axm365_generationid)
    );
    const candidates = [
      primaryTab?.id,
      ...generationTabs.map((generation) => generation.id),
    ];

    return candidates.find(
      (candidate): candidate is string =>
        Boolean(candidate) &&
        players.some((player) =>
          sameGuid((player as any)._cr9be_generation_value, candidate)
        )
    ) ?? null;
  }, [coachId, allGenerations, generationTabs, players]);

  useEffect(() => {
    const normalizedCoachId = normalizeGuid(coachId);

    if (!normalizedCoachId) {
      autoSelectedCoachRef.current = null;
      setSelectedGenId("all");
      return;
    }

    if (
      autoSelectedCoachRef.current === normalizedCoachId ||
      selectedPlayerId ||
      !primaryGenId
    ) {
      return;
    }

    const first = players.find((p) =>
      sameGuid((p as any)._cr9be_generation_value, primaryGenId)
    );

    if (first) {
      setSelectedGenId(primaryGenId);
      setSelectedId(first.cr9be_playerid);
      autoSelectedCoachRef.current = normalizedCoachId;
    }
  }, [coachId, primaryGenId, players, selectedPlayerId]);

  useEffect(() => {
    if (!selectedPlayerId) return;
    setSelectedId(selectedPlayerId);
    const p = players.find((pl) => pl.cr9be_playerid === selectedPlayerId);
    const genId = (p as any)?._cr9be_generation_value as string | undefined;
    if (genId) setSelectedGenId(genId);
  }, [selectedPlayerId, players]);

  const playersInGen = useMemo(
    () => selectedGenId === "all"
      ? coachPlayers
      : coachPlayers.filter((p) =>
          sameGuid((p as any)._cr9be_generation_value, selectedGenId)
        ),
    [coachPlayers, selectedGenId]
  );

  useEffect(() => {
    if (playersInGen.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }

    const selectedIsVisible = playersInGen.some((candidate) =>
      sameGuid(candidate.cr9be_playerid, selectedId)
    );
    if (!selectedIsVisible) {
      setSelectedId(playersInGen[0].cr9be_playerid);
    }
  }, [playersInGen, selectedId]);

  const filteredPlayers = search
    ? playersInGen.filter((p) => (p.cr9be_name || "").toLowerCase().includes(search.toLowerCase()))
    : playersInGen;

  const player = playersInGen.find((p) => sameGuid(p.cr9be_playerid, selectedId));
  const playerName = player ? (player.cr9be_name || "Player") : "Player";
  const playerPos = lookupName(player, "cr9be_position");
  const playerNum = player ? (player.cr9be_number ?? "?") : "?";
  const initials = playerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // Guardian details come from the related Contact so they reflect current
  // Contact values rather than a potentially stale lookup-name annotation.
  const guardianId = (player as any)?._cr9be_member_value as string | undefined;
  const guardianLookupName = lookupName(player, "cr9be_member") || null;
  const [guardianContact, setGuardianContact] = useState<GuardianContactDetails | null>(null);
  const [guardianLoading, setGuardianLoading] = useState(false);
  const [guardianPhoneLoading, setGuardianPhoneLoading] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [guardianRetryToken, setGuardianRetryToken] = useState(0);
  const guardianRequestVersionRef = React.useRef(0);
  const guardianRetryTimerRef = React.useRef<number | null>(null);
  const guardianRetryAttemptRef = React.useRef(0);

  const clearGuardianRetry = useCallback(() => {
    if (guardianRetryTimerRef.current !== null) {
      window.clearTimeout(guardianRetryTimerRef.current);
      guardianRetryTimerRef.current = null;
    }
  }, []);

  const scheduleGuardianRetry = useCallback(() => {
    if (guardianRetryTimerRef.current !== null) return;

    const delays = [5_000, 15_000, 45_000] as const;
    const delay = delays[guardianRetryAttemptRef.current];
    if (delay === undefined) return;

    guardianRetryAttemptRef.current += 1;
    guardianRetryTimerRef.current = window.setTimeout(() => {
      guardianRetryTimerRef.current = null;
      setGuardianRetryToken((current) => current + 1);
    }, delay);
  }, []);

  const loadGuardian = useCallback(
    async (
      id: string,
      force = false,
      fallbackName: string | null = null
    ): Promise<void> => {
      const requestVersion = ++guardianRequestVersionRef.current;
      const cached = getCachedGuardianContact(id);

      if (cached) {
        // Stale-while-revalidate: never replace usable guardian details with
        // a loading state. A stale value stays visible while Dataverse refreshes.
        setGuardianContact(cached.details);
        setGuardianError(null);
        setGuardianLoading(false);
        // A cache hit is immediately usable, including a confirmed null phone.
        // Stale values stay visible while they are refreshed in background.
        setGuardianPhoneLoading(false);

        if (cached.isFresh && !force) return;
      } else if (fallbackName) {
        // On the first-ever load there is no Contact cache yet, but the Player
        // row normally carries the lookup's formatted name. Show that at once
        // and fill in the phone number when the Contact request succeeds.
        setGuardianContact({ name: fallbackName, phone: null });
        setGuardianError(null);
        setGuardianLoading(false);
        setGuardianPhoneLoading(true);
      } else {
        setGuardianContact(null);
        setGuardianError(null);
        setGuardianLoading(true);
        setGuardianPhoneLoading(false);
      }

      try {
        const details = await getGuardianContact(id, {
          force,
        });
        if (guardianRequestVersionRef.current !== requestVersion) return;
        setGuardianContact(details);
        setGuardianError(null);
        setGuardianPhoneLoading(false);
        guardianRetryAttemptRef.current = 0;
        clearGuardianRetry();
      } catch (err) {
        if (guardianRequestVersionRef.current !== requestVersion) return;
        // A background refresh failure must not hide saved guardian details.
        // Only a first load with no cache needs an actionable error.
        if (!cached && !fallbackName) {
          setGuardianContact(null);
          setGuardianError(
            err instanceof Error ? err.message : "Failed to load guardian details"
          );
        } else {
          // Keep the usable name/card on screen. The shared read already did
          // its short mobile retries; schedule slower follow-up attempts
          // without turning this into a blocking screen error.
          scheduleGuardianRetry();
        }
        setGuardianPhoneLoading(false);
      } finally {
        if (guardianRequestVersionRef.current === requestVersion) {
          setGuardianLoading(false);
        }
      }
    },
    [clearGuardianRetry, getCachedGuardianContact, getGuardianContact, scheduleGuardianRetry]
  );

  useEffect(() => {
    guardianRetryAttemptRef.current = 0;
    clearGuardianRetry();

    return clearGuardianRetry;
  }, [guardianId, clearGuardianRetry]);

  useEffect(() => {
    if (!guardianId) {
      guardianRequestVersionRef.current += 1;
      setGuardianContact(null);
      setGuardianError(null);
      setGuardianLoading(false);
      setGuardianPhoneLoading(false);
      return;
    }

    // Contact retrieval is independent of Coach/account-cache readiness.
    // DataContext uses a scoped cache when available and otherwise performs
    // the same live Contact read without blocking this card.
    void loadGuardian(
      guardianId,
      guardianRetryAttemptRef.current > 0,
      guardianLookupName
    );

    // The Dataverse call cannot be cancelled, but invalidating this request
    // prevents an older player's response from updating the current player.
    return () => {
      guardianRequestVersionRef.current += 1;
    };
  }, [guardianId, guardianLookupName, guardianRetryToken, loadGuardian]);

  useEffect(() => {
    if (players.length === 0) return;
    // Give the selected guardian effect above one render turn to enter the
    // serialized queue first. It no longer waits for account/cache scope.
    // The remaining screen data then follows without creating concurrent
    // Dataverse bridge calls.
    const timer = window.setTimeout(() => {
      // These reads remain non-blocking for the visible cached Player card,
      // but Performance now refreshes its own Generation mappings again.
      void ensureFresh([
        "players",
        "events",
        "performances",
        "generations",
        "generationsToCoaches",
      ]);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [ensureFresh, players.length]);

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

  // Ratings are the half-star average of the seven skills; older records keep
  // the rating they were saved with (see performanceRating).
  const latestRating = latestPerf ? performanceRating(latestPerf) : DEFAULT_STARS;
  const previousRating = previousPerf ? performanceRating(previousPerf) : null;
  const ratingChange = previousRating !== null ? latestRating - previousRating : null;

  // Latest coach's note — trimmed so a whitespace-only note doesn't render an empty card.
  const latestNotes = latestPerf?.axm365_notes?.trim();

  // Every record that carries parent feedback, newest first. The first one is
  // the featured card; the rest are listed as earlier feedback.
  const feedbackEntries = useMemo(
    () => playerPerfsSorted.filter((p) => parentFeedbackOf(p)),
    [playerPerfsSorted]
  );
  const [latestFeedback, ...earlierFeedback] = feedbackEntries;

  const feedbackMeta = (perf: Axm365_playereventperformances): string => {
    const event = perf._axm365_event_value
      ? events.find((e) => sameGuid(e.axm365_eventid, perf._axm365_event_value))
      : undefined;
    const date = event?.axm365_eventdate ?? perf.createdon;
    const dateLabel = date
      ? new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()
      : null;
    // An event that isn't in the loaded list still gets its date, just no kind.
    const kindLabel = event ? eventKindLabel(event) : perf._axm365_event_value ? null : "General";
    return [dateLabel, kindLabel?.toUpperCase()].filter(Boolean).join(" · ");
  };

  const playerGenerationName = player
    ? player.cr9be_generationname || lookupName(player, "cr9be_generation")
    : null;
  // The author is whoever saved the record; the player's assigned coach is
  // the fallback when Dataverse didn't return the creator's name.
  const feedbackAuthor = (perf: Axm365_playereventperformances): string =>
    lookupName(perf, "createdby") || lookupName(player, "cr9be_coach") || "Coach";

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
    // Edit Mode preselects the event the coach arrived with (e.g. tapping
    // "Performance" from an event on the Home screen). Otherwise it starts
    // without an event, and the coach can always change or clear it manually.
    setEditEventId(initialEventId ?? null);
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
    setEditSkills(skillValuesFromPerformance(source));
    setEditNotes(source?.axm365_notes ?? "");
    // Parent feedback always starts empty: every save here creates a new
    // record, so carrying the previous text over would post it twice.
    setEditParentFeedback("");
  }, [editEventId, selectedId, showEditModal, performances, playerPerfsSorted]);

  const savePlayerPerformance = async () => {
    if (!selectedId) return;
    setPerfSaving(true);
    setPerfSaveError(null);
    try {
      const selectedEvent = editEventId ? events.find((e) => e.axm365_eventid === editEventId) : undefined;
      // Always creates a new record — never overwrites a prior one — so the full
      // performance history is preserved for the "most recent" display.
      const res = await runDataverseWrite(
        "Creating player performance",
        () => Axm365_playereventperformancesService.create({
          axm365_performancename: `${playerName} - ${selectedEvent?.axm365_name ?? "General"}`,
          axm365_raiting: starsToCode(ratingFromSkills(editSkills)) as any,
          ...skillPayload(editSkills),
          axm365_notes: editNotes,
          [PARENT_FEEDBACK_FIELD]: editParentFeedback.trim() || null,
          "axm365_cr9be_Player@odata.bind": `/cr9be_players(${selectedId})`,
          ...(editEventId && { "axm365_Event@odata.bind": `/axm365_events(${editEventId})` }),
        } as any)
      );
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

  // Position choices derived from whatever positions already exist across the squad —
  // there's no dedicated Position lookup wired into this app, same approach PlayersScreen uses.
  const positionOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    players.forEach((p) => {
      const id = (p as any)._cr9be_position_value as string | undefined;
      const name = lookupName(p, "cr9be_position");
      if (id && name && !seen.has(id)) {
        seen.add(id);
        result.push({ id, name });
      }
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const openEditPlayerModal = () => {
    if (!player) return;
    setEditPlayerNumber(player.cr9be_number != null ? String(player.cr9be_number) : "");
    setEditPlayerPositionId((player as any)._cr9be_position_value ?? null);
    setPositionPickerOpen(false);
    setPlayerSaveSuccess(false);
    setPlayerSaveError(null);
    setShowEditPlayerModal(true);
  };

  const savePlayerDetails = async () => {
    if (!player) return;
    setPlayerSaving(true);
    setPlayerSaveError(null);
    try {
      const trimmed = editPlayerNumber.trim();
      const changes: Record<string, unknown> = {};
      if (trimmed === "") {
        // Explicit null clears the field — omitting it entirely would just leave the old value in place.
        changes.cr9be_number = null;
      } else {
        const numValue = Number(trimmed);
        if (!Number.isInteger(numValue) || numValue < 0) {
          throw new Error("Enter a valid jersey number");
        }
        changes.cr9be_number = numValue;
      }
      if (editPlayerPositionId) changes["cr9be_Position@odata.bind"] = `/cr9be_positions(${editPlayerPositionId})`;
      const res = await runDataverseWrite(
        "Updating player",
        () => Cr9be_playersService.update(player.cr9be_playerid, changes as any)
      );
      if (!res.success) throw new Error((res.error as any)?.message ?? "Update failed");
      await refreshPlayers().catch(() => {});
      setPlayerSaveSuccess(true);
      setTimeout(() => {
        setPlayerSaveSuccess(false);
        setShowEditPlayerModal(false);
      }, 1200);
    } catch (err) {
      setPlayerSaveError(err instanceof Error ? err.message : "Failed to update player");
    } finally {
      setPlayerSaving(false);
    }
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader kicker="Player Stats" title="Performance" onBack={() => (goBack ? goBack() : go("home"))} />

      {screenLoading && <LoadingSpinner label="Loading players…" />}
      {screenError && (
        <ErrorBanner
          message={screenError}
          onRetry={() =>
            void ensureFresh(
              ["players", "events", "performances", "generations", "generationsToCoaches"],
              { force: true }
            )
          }
        />
      )}
      {screenStale && <StaleDataNotice />}

      {!screenLoading && !screenLoadError && players.length > 0 && (
        <>
          {/* Generation filter */}
          {generationTabs.length > 0 && (
            <div style={{ padding: "0 22px 10px", display: "flex", gap: 6, overflowX: "auto" }}>
              {[{ id: "all", name: "ALL" }, ...generationTabs].map((tab) => {
                const active = tab.id === "all"
                  ? selectedGenId === "all"
                  : sameGuid(selectedGenId, tab.id);
                return (
                  <button
                    key={tab.id}
                    ref={(el) => { if (active && el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }}
                    onClick={() => {
                      setSelectedGenId(tab.id);
                      const first = (tab.id === "all"
                        ? coachPlayers
                        : coachPlayers.filter((p) =>
                            sameGuid((p as any)._cr9be_generation_value, tab.id)
                          ))[0];
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
                <PlayerAvatar playerId={player.cr9be_playerid} hasPicture={!!(player as any).cr9be_pictureid} pictureVersion={(player as any).cr9be_picture_timestamp} initials={initials} size={28} />
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
                        <PlayerAvatar playerId={pid} hasPicture={!!p.cr9be_pictureid} pictureVersion={p.cr9be_picture_timestamp} initials={ini} size={28} />
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
                  <PlayerAvatar
                    playerId={player.cr9be_playerid}
                    hasPicture={!!(player as any).cr9be_pictureid}
                    pictureVersion={(player as any).cr9be_picture_timestamp}
                    initials={initials}
                    size={56}
                    editable
                    onUploaded={() => refreshPlayers().catch(() => {})}
                  />
                  <div>
                    <div style={{ fontFamily: displayStack, fontSize: 21, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{playerName}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.12em" }}>#{playerNum}</div>
                      {playerPos && (
                        <span style={{ background: COLORS.navy, color: "#fff", borderRadius: 99, padding: "2px 8px", fontFamily: monoStack, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em" }}>
                          {playerPos}
                        </span>
                      )}
                      <button
                        onClick={openEditPlayerModal}
                        style={{ width: 19, height: 19, borderRadius: 6, background: COLORS.cream, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        <Pencil size={9.5} color={COLORS.navy} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", position: "relative", textAlign: "right" }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 900, fontSize: 32, color: COLORS.navy, lineHeight: 1 }}>{formatRating(latestRating)}</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9, letterSpacing: "0.14em", color: COLORS.mute, textAlign: "right", marginTop: 2 }}>LATEST RATING</div>
                    {ratingChange !== null && ratingChange !== 0 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 4, fontFamily: monoStack, fontSize: 10.5, fontWeight: 700, color: ratingChange > 0 ? COLORS.green : COLORS.red }}>
                        {ratingChange > 0 ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />}
                        {formatRatingChange(ratingChange)}
                      </div>
                    )}
                  </div>
                </div>

                {guardianId && (
                  <div style={{ marginTop: 12, position: "relative" }}>
                    {guardianLoading && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.mute, fontFamily: fontStack }}>
                        <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} />
                        Loading guardian…
                      </div>
                    )}

                    {!guardianLoading && guardianError && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontFamily: fontStack }}>
                        <span style={{ color: COLORS.red, fontWeight: 600 }}>Guardian unavailable</span>
                        <button
                          onClick={() => void loadGuardian(guardianId, true, guardianLookupName)}
                          style={{ background: "none", border: 0, padding: 0, color: COLORS.navy, fontWeight: 700, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!guardianLoading && !guardianError && guardianContact && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: COLORS.cream,
                          border: `1px solid ${COLORS.line}`,
                          borderRadius: 14,
                          padding: "9px 12px",
                        }}
                      >
                        <User size={14} color={COLORS.navy} strokeWidth={2} style={{ flexShrink: 0 }} />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: fontStack,
                            fontWeight: 700,
                            fontSize: 13,
                            color: COLORS.navy,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {guardianContact.name || "Unnamed guardian"}
                        </span>
                        {guardianPhoneLoading && !guardianContact.phone && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontFamily: monoStack,
                              fontSize: 10.5,
                              color: COLORS.mute,
                              flexShrink: 0,
                            }}
                          >
                            <RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} />
                            Loading phone…
                          </span>
                        )}
                        {guardianContact.phone && (
                          <a
                            href={`tel:${guardianContact.phone}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontFamily: monoStack,
                              fontWeight: 700,
                              fontSize: 12.5,
                              color: COLORS.navy,
                              textDecoration: "none",
                              flexShrink: 0,
                            }}
                          >
                            <Phone size={12} color={COLORS.navy} strokeWidth={2} />
                            {guardianContact.phone}
                          </a>
                        )}
                        {!guardianPhoneLoading && !guardianContact.phone && (
                          <span
                            style={{
                              fontFamily: monoStack,
                              fontSize: 10.5,
                              color: COLORS.mute,
                              flexShrink: 0,
                            }}
                          >
                            No phone stored
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 14, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <RatingStars rating={latestRating} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: hasData ? COLORS.yellowSoft : COLORS.cream, border: `1px solid ${hasData ? COLORS.yellow : COLORS.line}`, borderRadius: 99, padding: "4px 10px" }}>
                        <span style={{ fontFamily: monoStack, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.navy }}>
                          {hasData ? `${playerPerfs.length} EVENT${playerPerfs.length !== 1 ? "S" : ""}` : "NO DATA YET"}
                        </span>
                      </div>
                      <button
                        onClick={openEditModal}
                        style={{ width: 40, height: 40, borderRadius: 12, background: COLORS.navy, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        <Pencil size={15} color={COLORS.yellow} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: "18px 22px 30px" }}>
            <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600 }}>
              Latest Performance
            </div>

            {/* Attributes / Parent feedback switch */}
            <div style={{ marginTop: 10, display: "flex", gap: 4, padding: 4, background: COLORS.line, borderRadius: 14 }}>
              {([
                { id: "attributes", label: "Attributes" },
                { id: "feedback", label: "Parent feedback" },
              ] as const).map((tab) => {
                const active = perfTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPerfTab(tab.id)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 11, border: 0, background: active ? COLORS.navy : "transparent", color: active ? "#fff" : COLORS.navy, boxShadow: active ? "0 2px 8px rgba(11,27,61,0.18)" : "none", fontFamily: fontStack, fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    {tab.label}
                    {tab.id === "attributes" && (
                      <span style={{ fontFamily: monoStack, fontSize: 9.5, opacity: 0.7, alignSelf: "flex-start", marginTop: 1 }}>{PERFORMANCE_SKILLS.length}</span>
                    )}
                    {tab.id === "feedback" && latestFeedback && (
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: active ? COLORS.yellow : "#E0A800" }} />
                    )}
                  </button>
                );
              })}
            </div>

            {perfTab === "attributes" && (
              <>
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {PERFORMANCE_SKILLS.map((skill) => (
                    <AttributeBar
                      key={skill.key}
                      label={skillLabel(skill, playerPos)}
                      value={latestPerf ? readSkill(latestPerf, skill) : null}
                    />
                  ))}
                </div>

                {/* Latest coach's note — only the single most recent one, matching the
                    "Latest" scope used by the rating and attribute bars above. */}
                {latestNotes && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600 }}>
                      Coach Notes · Internal
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        background: COLORS.cream,
                        border: `1px solid ${COLORS.line}`,
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <div style={{ fontFamily: fontStack, fontSize: 13, color: COLORS.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {latestNotes}
                      </div>
                      {latestPerf?.createdon && (
                        <div
                          style={{
                            fontFamily: monoStack,
                            fontSize: 9.5,
                            color: COLORS.mute,
                            letterSpacing: "0.1em",
                            marginTop: 8,
                          }}
                        >
                          {new Date(latestPerf.createdon).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {perfTab === "feedback" && (
              <div style={{ marginTop: 16 }}>
                {!latestFeedback && (
                  <div style={{ background: COLORS.cream, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 20, textAlign: "center", fontFamily: fontStack, fontSize: 13, color: COLORS.mute, lineHeight: 1.5 }}>
                    No feedback shared with the parent yet. Add it from Edit Performance.
                  </div>
                )}

                {latestFeedback && (
                  <div style={{ background: COLORS.navy, borderRadius: 22, padding: 18, color: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: COLORS.yellow, color: COLORS.navy, borderRadius: 99, padding: "4px 10px", fontFamily: monoStack, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em" }}>
                        <Eye size={12} strokeWidth={2.2} />
                        VISIBLE TO PARENT
                      </span>
                      <span style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)" }}>
                        {feedbackMeta(latestFeedback)}
                      </span>
                    </div>
                    <div style={{ marginTop: 14, fontFamily: fontStack, fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {parentFeedbackOf(latestFeedback)}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 99, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {feedbackAuthor(latestFeedback).charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontFamily: fontStack, fontSize: 12.5, color: "rgba(255,255,255,0.75)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {feedbackAuthor(latestFeedback)} · Coach{playerGenerationName ? ` ${playerGenerationName}` : ""}
                      </span>
                    </div>
                  </div>
                )}

                {earlierFeedback.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600 }}>
                      Earlier Feedback
                    </div>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {earlierFeedback.map((perf) => {
                        const id = perf.axm365_playereventperformanceid;
                        const expanded = expandedFeedbackId === id;
                        return (
                          <button
                            key={id}
                            onClick={() => setExpandedFeedbackId(expanded ? null : id)}
                            style={{ width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer" }}
                          >
                            <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.1em", color: COLORS.mute }}>
                              {feedbackMeta(perf)}
                            </div>
                            <div style={{ marginTop: 4, fontFamily: fontStack, fontSize: 13, color: COLORS.ink, lineHeight: 1.5, whiteSpace: "pre-wrap", ...(expanded ? {} : lineClamp(2)) }}>
                              {parentFeedbackOf(perf)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {!screenLoading && !screenLoadError && players.length === 0 && (
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
                  <PlayerAvatar playerId={player.cr9be_playerid} hasPicture={!!(player as any).cr9be_pictureid} pictureVersion={(player as any).cr9be_picture_timestamp} initials={initials} size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 17, color: COLORS.navy }}>{playerName}</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.12em", marginTop: 1 }}>
                      #{playerNum}{playerPos ? ` · ${playerPos}` : ""} · Edit Performance
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

                <PerformanceEditorFields
                  ratingLabel="Overall Rating"
                  playerName={playerName}
                  positionName={playerPos}
                  skills={editSkills}
                  onSkillsChange={setEditSkills}
                  notes={editNotes}
                  onNotesChange={setEditNotes}
                  parentFeedback={editParentFeedback}
                  onParentFeedbackChange={setEditParentFeedback}
                />

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

      {/* Player details edit modal — jersey number + position */}
      {showEditPlayerModal && player && (() => {
        const modal = (
          <div
            style={{ position: portalTarget ? "absolute" : "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
            onClick={() => !playerSaving && setShowEditPlayerModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div style={{ padding: "12px 0 4px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ width: 40, height: 4, borderRadius: 99, background: COLORS.line }} />
              </div>

              <div style={{ padding: "0 22px 14px", borderBottom: `1px solid ${COLORS.line}`, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <PlayerAvatar
                    playerId={player.cr9be_playerid}
                    hasPicture={!!(player as any).cr9be_pictureid}
                    pictureVersion={(player as any).cr9be_picture_timestamp}
                    initials={initials}
                    size={44}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 17, color: COLORS.navy }}>{playerName}</div>
                    <div style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.12em", marginTop: 1 }}>Edit Player</div>
                  </div>
                  <button
                    onClick={() => setShowEditPlayerModal(false)}
                    style={{ width: 32, height: 32, borderRadius: 99, background: COLORS.cream, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <X size={14} color={COLORS.navy} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <div style={{ overflowY: "auto", padding: "16px 22px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
                {playerSaveSuccess && (
                  <div style={{ background: COLORS.green, color: "#fff", borderRadius: 12, padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>
                    Player updated!
                  </div>
                )}
                {playerSaveError && (
                  <div style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: 12, padding: "10px 14px", fontSize: 12 }}>
                    {playerSaveError}
                  </div>
                )}

                {/* Photo */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Photo
                  </div>
                  <PlayerAvatar
                    playerId={player.cr9be_playerid}
                    hasPicture={!!(player as any).cr9be_pictureid}
                    pictureVersion={(player as any).cr9be_picture_timestamp}
                    initials={initials}
                    size={72}
                    editable
                    showActions
                    onUploaded={() => refreshPlayers().catch(() => {})}
                  />
                </div>

                {/* Jersey number */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Jersey Number
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={editPlayerNumber}
                      onChange={(e) => setEditPlayerNumber(e.target.value)}
                      placeholder="e.g. 9"
                      style={{ width: "100%", padding: "11px 36px 11px 14px", background: COLORS.cream, border: `1px solid ${COLORS.line}`, borderRadius: 14, fontFamily: fontStack, fontSize: 14, fontWeight: 700, color: COLORS.navy, outline: "none", boxSizing: "border-box" }}
                    />
                    {editPlayerNumber.length > 0 && (
                      <button
                        onClick={() => setEditPlayerNumber("")}
                        title="Remove number"
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 99, background: COLORS.line, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        <X size={12} color={COLORS.navy} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Position */}
                <div>
                  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>
                    Position
                  </div>
                  <div
                    onClick={() => setPositionPickerOpen((v) => !v)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: COLORS.cream, border: `1px solid ${COLORS.line}`, borderRadius: 14, cursor: "pointer" }}
                  >
                    <span style={{ flex: 1, fontFamily: fontStack, fontSize: 13.5, fontWeight: 700, color: editPlayerPositionId ? COLORS.navy : COLORS.mute }}>
                      {editPlayerPositionId ? (positionOptions.find((o) => o.id === editPlayerPositionId)?.name ?? "Unknown") : "Select position…"}
                    </span>
                    <ChevronDown size={16} color={COLORS.mute} style={{ transform: positionPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                  </div>

                  {positionPickerOpen && (
                    <div style={{ marginTop: 8, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 200, overflowY: "auto" }}>
                      {positionOptions.length === 0 && (
                        <div style={{ padding: 16, textAlign: "center", color: COLORS.mute, fontFamily: monoStack, fontSize: 11, letterSpacing: "0.1em" }}>NO POSITIONS FOUND</div>
                      )}
                      {positionOptions.map((opt) => {
                        const active = editPlayerPositionId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => { setEditPlayerPositionId(opt.id); setPositionPickerOpen(false); }}
                            style={{ width: "100%", padding: "10px 14px", background: active ? COLORS.yellowSoft : "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 13.5, color: COLORS.navy, fontWeight: active ? 700 : 500, borderBottom: `1px solid ${COLORS.line}` }}
                          >
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Save button */}
                <button
                  disabled={playerSaving}
                  onClick={savePlayerDetails}
                  style={{ width: "100%", padding: "14px 0", background: playerSaving ? COLORS.mute : COLORS.navy, color: "#fff", border: 0, borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: playerSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {playerSaving && <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />}
                  {playerSaving ? "Saving…" : "Save Player →"}
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
