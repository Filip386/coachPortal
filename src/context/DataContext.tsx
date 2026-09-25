/* eslint-disable */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import { getContext } from "@microsoft/power-apps/app";

import { Cr9be_playersService } from "../generated/services/Cr9be_playersService";
import { Axm365_eventsService } from "../generated/services/Axm365_eventsService";
import { Axm365_eventattendancesService } from "../generated/services/Axm365_eventattendancesService";
import { InvoicesService } from "../generated/services/InvoicesService";
import { Axm365_playereventperformancesService } from "../generated/services/Axm365_playereventperformancesService";
import { Axm365_generationsService } from "../generated/services/Axm365_generationsService";
import { Axm365_generationstocoachesesService } from "../generated/services/Axm365_generationstocoachesesService";
import { Cr9be_coachsService } from "../generated/services/Cr9be_coachsService";
import { ContactsService } from "../generated/services/ContactsService";
import { TasksService } from "../generated/services/TasksService";

import type { Cr9be_players } from "../generated/models/Cr9be_playersModel";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import type { Axm365_eventattendances } from "../generated/models/Axm365_eventattendancesModel";
import type { Invoices } from "../generated/models/InvoicesModel";
import type { Axm365_playereventperformances } from "../generated/models/Axm365_playereventperformancesModel";
import type { Axm365_generations } from "../generated/models/Axm365_generationsModel";
import type { Axm365_generationstocoacheses } from "../generated/models/Axm365_generationstocoachesesModel";
import type { Tasks } from "../generated/models/TasksModel";

import {
  unwrapOrThrow,
  fetchAllPages,
  fetchFacilities,
  fetchUserSecurityRoles,
} from "../utils/dataverse";

import type { Facility } from "../utils/dataverse";
import type { Cr9be_coachs } from "../generated/models/Cr9be_coachsModel";
import { prefetchPlayerPhotos } from "../utils/photoCache";
import type { Contacts } from "../generated/models/ContactsModel";


export type DataResource =
  | "players"
  | "events"
  | "attendances"
  | "invoices"
  | "facilities"
  | "performances"
  | "generations"
  | "generationsToCoaches"
  | "tasks";


export type DataResourceStatus =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "error";


interface EnsureFreshOptions {
  force?: boolean;
  maxAgeMs?: number;
}


interface DataContextValue {
  coachName: string | null;
  coachId: string | null;

  /** True until the signed-in user's email → Contact → Coach lookup has
   *  finished (success or failure). Lets callers tell "still resolving"
   *  apart from "genuinely has no linked Coach record". */
  coachLookupLoading: boolean;

  /** Specific reason the Contact → Coach lookup didn't resolve a coachId
   *  (e.g. no Dataverse contact for the signed-in email, or no Coach record
   *  linked to that contact) — null once resolved or while still pending. */
  coachLookupError: string | null;

  /** True once the signed-in user's Dataverse security roles have been
   *  checked for "Back office" membership. False (most restrictive) until
   *  resolved or if the lookup fails. */
  isBackOffice: boolean;
  rolesLoaded: boolean;

  players: Cr9be_players[];
  events: Axm365_events[];
  attendances: Axm365_eventattendances[];
  invoices: Invoices[];
  facilities: Facility[];
  performances: Axm365_playereventperformances[];

  allGenerations: Axm365_generations[];
  generationsToCoaches: Axm365_generationstocoacheses[];

  /** Open (statecode = Open) Task activities regarding the signed-in coach's
   *  own Coach record, newest first — mirrors the model-driven Timeline's
   *  sort order. Empty until coachId resolves. */
  tasks: Tasks[];
  tasksLoading: boolean;
  tasksError: string | null;

  loggedInCoachId: string | null;
  error: string | null;
  resourceStatus: Record<DataResource, DataResourceStatus>;
  resourceErrors: Partial<Record<DataResource, string>>;
  isLoadingResources: (resources: DataResource[]) => boolean;
  hasResourceErrors: (resources: DataResource[]) => boolean;
  getResourceError: (resources: DataResource[]) => string | null;

  refreshPlayers: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  refreshAttendances: () => Promise<void>;
  refreshInvoices: () => Promise<void>;
  refreshFacilities: () => Promise<void>;
  refreshPerformances: () => Promise<void>;
  refreshGenerations: () => Promise<void>;
  refreshGenerationsToCoaches: () => Promise<void>;
  refreshCoach: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  ensureFresh: (
    resources: DataResource[],
    options?: EnsureFreshOptions
  ) => Promise<void>;
  /** Marks a task Completed in Dataverse and drops it from `tasks` — active
   *  tasks only are ever shown, so a completed one simply disappears. */
  completeTask: (taskId: string) => Promise<void>;
  /** Queue a read made directly by a screen so it cannot overlap Context
   *  requests in the Power Apps mobile Dataverse bridge. */
  runDataverseRead: <T>(
    label: string,
    operation: () => Promise<T>
  ) => Promise<T>;
  /** Queue a user-initiated mutation. Writes are deliberately not retried:
   *  a timed-out create may already have reached Dataverse. */
  runDataverseWrite: <T>(
    label: string,
    operation: () => Promise<T>
  ) => Promise<T>;
  refreshAll: () => Promise<void>;
}


const DataContext = createContext<DataContextValue | null>(null);


const CACHE = {
  players: "cvf_players",
  events: "cvf_events",
  attendances: "cvf_attendances",
  invoices: "cvf_invoices",
  facilities: "cvf_facilities",
  performances: "cvf_performances",
  generations: "cvf_generations",
  generationsToCoaches: "cvf_generations_to_coaches",
};


const LEGACY_TASK_CACHE_KEY = "cvf_tasks";
const TASK_CACHE_PREFIX = "cvf_tasks_v2";
const TASK_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;


interface TaskCacheEnvelope {
  cachedAt: number;
  tasks: Tasks[];
}


// Which Dataverse environment the cached rows above were fetched from.
// Deliberately NOT part of CACHE — it is a marker, not cached table data,
// and must survive the purge loop that clears the tables.
const CACHE_ENV_KEY = "cvf_cached_org_url";


const RESOURCE_MAX_AGE_MS: Record<DataResource, number> = {
  players: 5 * 60_000,
  events: 60_000,
  attendances: 30_000,
  invoices: 2 * 60_000,
  facilities: 5 * 60_000,
  performances: 60_000,
  generations: 5 * 60_000,
  generationsToCoaches: 5 * 60_000,
  tasks: 30_000,
};


function clearTableCaches() {
  try {
    Object.values(CACHE).forEach((key) => localStorage.removeItem(key));
  } catch {}
}


function readCache<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}


function writeCache<T>(key: string, data: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}


function taskCacheKey(orgUrl: string, coachId: string): string {
  return `${TASK_CACHE_PREFIX}:${encodeURIComponent(
    orgUrl.trim().toLowerCase()
  )}:${normalizeGuid(coachId)}`;
}


function readTaskCache(orgUrl: string | null, coachId: string): TaskCacheEnvelope | null {
  if (!orgUrl || !coachId) return null;

  try {
    const key = taskCacheKey(orgUrl, coachId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TaskCacheEnvelope;
    if (
      !Array.isArray(parsed?.tasks) ||
      typeof parsed?.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > TASK_CACHE_MAX_AGE_MS
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}


function writeTaskCache(
  orgUrl: string | null,
  coachId: string | null,
  tasks: Tasks[]
) {
  if (!orgUrl || !coachId) return;

  try {
    const value: TaskCacheEnvelope = {
      cachedAt: Date.now(),
      tasks,
    };
    localStorage.setItem(taskCacheKey(orgUrl, coachId), JSON.stringify(value));
  } catch {}
}


function hasUsableCache(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null && Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}


function createInitialResourceStatus(): Record<DataResource, DataResourceStatus> {
  return {
    players: hasUsableCache(CACHE.players) ? "ready" : "idle",
    events: hasUsableCache(CACHE.events) ? "ready" : "idle",
    attendances: hasUsableCache(CACHE.attendances) ? "ready" : "idle",
    invoices: hasUsableCache(CACHE.invoices) ? "ready" : "idle",
    facilities: hasUsableCache(CACHE.facilities) ? "ready" : "idle",
    performances: hasUsableCache(CACHE.performances) ? "ready" : "idle",
    generations: hasUsableCache(CACHE.generations) ? "ready" : "idle",
    generationsToCoaches: hasUsableCache(CACHE.generationsToCoaches)
      ? "ready"
      : "idle",
    // The Task cache cannot be selected safely until Coach identity resolves.
    tasks: "idle",
  };
}


function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;

  const candidate = error as any;
  const message =
    candidate?.message ??
    candidate?.error?.message ??
    candidate?.details?.message ??
    candidate?.response?.data?.error?.message;

  return typeof message === "string" && message.trim() ? message : fallback;
}


function normalizeGuid(value: string | null | undefined): string {
  return (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();
}


// Guards a Dataverse call that could otherwise hang indefinitely (seen on
// mobile, where a stalled network/auth handshake never rejects on its own)
// so a coach is never stuck on "loading your coach profile" forever —
// after `ms` it rejects with a clear, diagnosable message instead.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out — check your connection and try again.`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}


const MOBILE_RETRY_DELAYS_MS = [1000, 2500, 5000] as const;


function getErrorStatus(error: unknown): number | null {
  const candidate = error as any;
  const status =
    candidate?.status ??
    candidate?.statusCode ??
    candidate?.response?.status ??
    candidate?.error?.status;

  return typeof status === "number" ? status : null;
}


function isTransientOperationError(error: unknown): boolean {
  const message = getErrorMessage(error, "").toLowerCase();
  const status = getErrorStatus(error);

  return (
    message.includes("cordova.exec is not a function") ||
    message.includes("failed to acquire access token") ||
    message.includes("network request failed") ||
    message.includes("network error") ||
    message.includes("failed to fetch") ||
    message.includes("temporarily unavailable") ||
    message.includes("timed out") ||
    status === 408 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}


async function runWithTransientRetries<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  let retryIndex = 0;

  while (true) {
    try {
      return await withTimeout(operation(), 20000, label);
    } catch (operationError) {
      if (!isTransientOperationError(operationError)) {
        throw operationError;
      }

      const message = getErrorMessage(operationError, "").toLowerCase();
      // A timed-out SDK request cannot be cancelled. Retry it only once to
      // avoid creating several hidden requests. Mobile token/bridge failures
      // reject immediately and can safely use the full warm-up schedule.
      const retryDelays = message.includes("timed out")
        ? MOBILE_RETRY_DELAYS_MS.slice(1, 2)
        : MOBILE_RETRY_DELAYS_MS;

      if (retryIndex >= retryDelays.length) {
        throw operationError;
      }

      const delayMs = retryDelays[retryIndex];
      retryIndex += 1;

      console.warn(
        `[CoachPortal] ${label} hit a temporary mobile-host error; retrying in ${delayMs}ms.`,
        operationError
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}


export const DataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {

  const [coachName, setCoachName] = useState<string | null>(null);

  const [loggedInCoachId, setLoggedInCoachId] =
    useState<string | null>(null);

  const [coachId, setCoachId] =
    useState<string | null>(null);

  const [coachLookupLoading, setCoachLookupLoading] = useState(true);

  const [coachLookupError, setCoachLookupError] = useState<string | null>(null);

  const [isBackOffice, setIsBackOffice] = useState(false);

  const [rolesLoaded, setRolesLoaded] = useState(false);


  const [players, setPlayers] = useState<Cr9be_players[]>(() =>
    readCache(CACHE.players)
  );

  const [events, setEvents] = useState<Axm365_events[]>(() =>
    readCache(CACHE.events)
  );

  const [attendances, setAttendances] =
    useState<Axm365_eventattendances[]>(() =>
      readCache(CACHE.attendances)
    );

  const [invoices, setInvoices] = useState<Invoices[]>(() =>
    readCache(CACHE.invoices)
  );

  const [facilities, setFacilities] = useState<Facility[]>(() =>
    readCache(CACHE.facilities)
  );

  const [performances, setPerformances] =
    useState<Axm365_playereventperformances[]>(() =>
      readCache(CACHE.performances)
    );

  const [allGenerations, setAllGenerations] =
    useState<Axm365_generations[]>(() =>
      readCache(CACHE.generations)
    );

  const [generationsToCoaches, setGenerationsToCoaches] =
    useState<Axm365_generationstocoacheses[]>(() =>
      readCache(CACHE.generationsToCoaches)
    );

  // Task cache restoration waits until the current Coach is resolved because
  // the cache key is scoped by both Dataverse organization and Coach id.
  const [tasks, setTasks] = useState<Tasks[]>([]);

  const [tasksLoading, setTasksLoading] = useState(true);

  const [tasksError, setTasksError] = useState<string | null>(null);


  // A single app-wide loading boolean cannot tell whether the particular
  // resources a screen needs have finished. Track each dataset independently
  // so rapid navigation cannot turn an in-flight empty array into a false
  // "no data" state.
  const [resourceStatus, setResourceStatus] = useState<
    Record<DataResource, DataResourceStatus>
  >(createInitialResourceStatus);
  const resourceHasUsableDataRef = useRef<Record<DataResource, boolean>>({
    players: resourceStatus.players === "ready",
    events: resourceStatus.events === "ready",
    attendances: resourceStatus.attendances === "ready",
    invoices: resourceStatus.invoices === "ready",
    facilities: resourceStatus.facilities === "ready",
    performances: resourceStatus.performances === "ready",
    generations: resourceStatus.generations === "ready",
    generationsToCoaches: resourceStatus.generationsToCoaches === "ready",
    tasks: false,
  });
  const [resourceErrors, setResourceErrors] = useState<
    Partial<Record<DataResource, string>>
  >({});

  const [error, setError] =
    useState<string | null>(null);


  const isLoadingResources = useCallback(
    (resources: DataResource[]): boolean =>
      resources.some(
        (resource) =>
          resourceStatus[resource] === "idle" ||
          resourceStatus[resource] === "loading"
      ),
    [resourceStatus]
  );


  const hasResourceErrors = useCallback(
    (resources: DataResource[]): boolean =>
      resources.some((resource) => resourceStatus[resource] === "error"),
    [resourceStatus]
  );


  const getResourceError = useCallback(
    (resources: DataResource[]): string | null => {
      for (const resource of resources) {
        const resourceError = resourceErrors[resource];
        if (resourceError) return resourceError;
      }
      return null;
    },
    [resourceErrors]
  );


  // Android Power Apps can hang when generated Dataverse reads overlap.
  // Every Context-owned Dataverse operation therefore passes through one
  // queue. Resource-level in-flight tracking also prevents duplicate tab
  // effects from placing the same read in the queue more than once.
  const dataverseQueueTailRef = useRef<Promise<void>>(Promise.resolve());
  const resourceInFlightRef = useRef<
    Partial<Record<DataResource, Promise<void>>>
  >({});
  const lastFetchedRef = useRef<Partial<Record<DataResource, number>>>({});
  const refreshAllInFlightRef = useRef<Promise<void> | null>(null);
  const rolesInFlightRef = useRef<Promise<void> | null>(null);
  const wasHiddenRef = useRef(false);
  const dataverseOrgUrlRef = useRef<string | null>(null);
  const activeCoachIdRef = useRef<string | null>(null);
  const taskInFlightByCoachRef = useRef<Record<string, Promise<void>>>({});


  const enqueueDataverse = useCallback(
    <T,>(
      label: string,
      operation: () => Promise<T>,
      retryTransient = true
    ): Promise<T> => {
      const run = dataverseQueueTailRef.current
        .catch(() => undefined)
        .then(() =>
          retryTransient
            ? runWithTransientRetries(label, operation)
            : withTimeout(operation(), 20000, label)
        );

      dataverseQueueTailRef.current = run.then(
        () => undefined,
        () => undefined
      );

      return run;
    },
    []
  );


  const runDataverseRead = useCallback(
    <T,>(label: string, operation: () => Promise<T>): Promise<T> =>
      enqueueDataverse(label, operation, true),
    [enqueueDataverse]
  );


  const runDataverseWrite = useCallback(
    <T,>(label: string, operation: () => Promise<T>): Promise<T> =>
      enqueueDataverse(label, operation, false),
    [enqueueDataverse]
  );


  const runResourceRefresh = useCallback(
    (
      resource: DataResource,
      label: string,
      operation: () => Promise<void>
    ): Promise<void> => {
      const existing = resourceInFlightRef.current[resource];
      if (existing) return existing;

      const hadUsableData = resourceHasUsableDataRef.current[resource];
      setResourceErrors((current) => {
        if (!current[resource]) return current;
        const next = { ...current };
        delete next[resource];
        return next;
      });
      setResourceStatus((current) => ({
        ...current,
        [resource]: hadUsableData ? "refreshing" : "loading",
      }));

      const request = enqueueDataverse(label, operation)
        .then(() => {
          lastFetchedRef.current[resource] = Date.now();
          resourceHasUsableDataRef.current[resource] = true;
          setResourceStatus((current) => ({
            ...current,
            [resource]: "ready",
          }));
        })
        .catch((refreshError) => {
          setResourceErrors((current) => ({
            ...current,
            [resource]: getErrorMessage(
              refreshError,
              `Failed to load ${resource}.`
            ),
          }));
          setResourceStatus((current) => ({
            ...current,
            [resource]: hadUsableData ? "ready" : "error",
          }));
          throw refreshError;
        })
        .finally(() => {
          delete resourceInFlightRef.current[resource];
        });

      resourceInFlightRef.current[resource] = request;
      return request;
    },
    [enqueueDataverse]
  );


  // ---------------------------------------------------------
  // REFRESH PLAYERS
  // ---------------------------------------------------------

  const refreshPlayers = useCallback(() =>
    runResourceRefresh("players", "Loading players", async () => {
      const data = await fetchAllPages<Cr9be_players>((skipToken) =>
        Cr9be_playersService.getAll({
          filter: "statecode eq 0",
          ...(skipToken ? { skipToken } : {}),
        })
      );

      setPlayers(data);
      writeCache(CACHE.players, data);

      // Warm player photo cache in background.
      prefetchPlayerPhotos(
        data.map((p) => ({
          playerId: p.cr9be_playerid,
          pictureId: p.cr9be_pictureid,
          pictureVersion: p.cr9be_picture_timestamp,
        }))
      ).catch(() => {});
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH EVENTS
  // ---------------------------------------------------------

  const refreshEvents = useCallback(() =>
    runResourceRefresh("events", "Loading events", async () => {

    // IMPORTANT:
    // This used to be a bare `top: 100` with no paging and no ordering,
    // which made it the only table here that silently truncated. Two
    // consequences: with more than 100 events the app never saw the rest,
    // and because Dataverse applies no guaranteed order without `orderby`,
    // WHICH 100 came back could shift between refreshes — so the cached
    // event list drifted out of step with the table instead of mirroring
    // it. Paged in full (like players) so the fetched set is the whole
    // table and a wholesale `setEvents` genuinely reflects deletions.
    // orderBy matters for more than presentation: paging relies on a stable
    // sort, and without one Dataverse can return a row twice across pages or
    // skip it entirely. Ordering by start time also means every consumer gets
    // events chronologically by default.
      const data = await fetchAllPages<Axm365_events>((skipToken) =>
        Axm365_eventsService.getAll({
          orderBy: ["axm365_eventdate"],
          ...(skipToken ? { skipToken } : {}),
        })
      );

      setEvents(data);
      writeCache(CACHE.events, data);
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH ATTENDANCES
  // ---------------------------------------------------------

  const refreshAttendances = useCallback(() =>
    runResourceRefresh("attendances", "Loading attendances", async () => {
      const res = await Axm365_eventattendancesService.getAll({});
      const data = unwrapOrThrow<Axm365_eventattendances>(res);

      setAttendances(data);
      writeCache(CACHE.attendances, data);
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH INVOICES
  // ---------------------------------------------------------

  const refreshInvoices = useCallback(() =>
    runResourceRefresh("invoices", "Loading invoices", async () => {
      const res = await InvoicesService.getAll({});
      const data = unwrapOrThrow<Invoices>(res);

      setInvoices(data);
      writeCache(CACHE.invoices, data);
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH FACILITIES
  // ---------------------------------------------------------

  const refreshFacilities = useCallback(() =>
    runResourceRefresh("facilities", "Loading facilities", async () => {
      const data = await fetchFacilities();

      setFacilities(data);
      writeCache(CACHE.facilities, data);
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH PERFORMANCES
  // ---------------------------------------------------------

  const refreshPerformances = useCallback(() =>
    runResourceRefresh("performances", "Loading performances", async () => {
      const res = await Axm365_playereventperformancesService.getAll({});
      const data = unwrapOrThrow<Axm365_playereventperformances>(res);

      setPerformances(data);
      writeCache(CACHE.performances, data);
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH GENERATIONS
  // ---------------------------------------------------------

  const refreshGenerations = useCallback(() =>
    runResourceRefresh("generations", "Loading generations", async () => {
      const res = await Axm365_generationsService.getAll({
        filter: "statecode eq 0",
      });
      const data = unwrapOrThrow<Axm365_generations>(res);

      setAllGenerations(data);
      writeCache(CACHE.generations, data);
    }),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH GENERATIONS TO COACHES
  // ---------------------------------------------------------

  const refreshGenerationsToCoaches = useCallback(() =>
    runResourceRefresh(
      "generationsToCoaches",
      "Loading coach generations",
      async () => {
        const res = await Axm365_generationstocoachesesService.getAll({
        filter: "statecode eq 0",
      });
        const data = unwrapOrThrow<Axm365_generationstocoacheses>(res);

        setGenerationsToCoaches(data);
        writeCache(CACHE.generationsToCoaches, data);
      }
    ),
  [runResourceRefresh]);


  // ---------------------------------------------------------
  // REFRESH TASKS
  //
  // Coach-scoped (unlike the tables above), so it becomes a no-op until
  // coachId resolves from the Contact → Coach lookup further down. Ordered
  // by createdon (always populated, unlike
  // sortdate which is only set once a task has a scheduled date) so the
  // most recently created task is always the one at the top.
  // ---------------------------------------------------------

  const refreshTasks = useCallback(async () => {
    if (!coachId) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }

    const requestCoachId = normalizeGuid(coachId);
    const existingRequest = taskInFlightByCoachRef.current[requestCoachId];
    if (existingRequest) return existingRequest;

    const hadUsableData = resourceHasUsableDataRef.current.tasks;
    setTasksLoading(true);
    setTasksError(null);
    setResourceErrors((current) => {
      if (!current.tasks) return current;
      const next = { ...current };
      delete next.tasks;
      return next;
    });
    setResourceStatus((current) => ({
      ...current,
      tasks: hadUsableData ? "refreshing" : "loading",
    }));

    const request = enqueueDataverse("Loading tasks", async () => {
        const res = await TasksService.getAll({
          filter: `statecode eq 0 and _regardingobjectid_value eq ${requestCoachId}`,
          orderBy: ["createdon desc"],
        });
        const data = unwrapOrThrow<Tasks>(res);

        // A response from a previous signed-in coach must never replace the
        // current coach's list if the account changed while this was queued.
        if (activeCoachIdRef.current !== requestCoachId) return;

        setTasks(data);
        writeTaskCache(dataverseOrgUrlRef.current, requestCoachId, data);
        lastFetchedRef.current.tasks = Date.now();
        resourceHasUsableDataRef.current.tasks = true;
        setTasksError(null);
        setResourceStatus((current) => ({
          ...current,
          tasks: "ready",
        }));
      })
      .catch((err) => {
        if (activeCoachIdRef.current === requestCoachId) {
          console.error("[CoachPortal] Failed to load tasks:", err);
          const message = getErrorMessage(err, "Failed to load tasks.");
          setTasksError(message);
          setResourceErrors((current) => ({
            ...current,
            tasks: message,
          }));
          setResourceStatus((current) => ({
            ...current,
            tasks: hadUsableData ? "ready" : "error",
          }));
        }
        throw err;
      })
      .finally(() => {
        delete taskInFlightByCoachRef.current[requestCoachId];
        if (activeCoachIdRef.current === requestCoachId) {
          setTasksLoading(false);
        }
      });

    taskInFlightByCoachRef.current[requestCoachId] = request;
    return request;
  }, [coachId, enqueueDataverse]);


  useEffect(() => {

    if (coachId) {
      const normalizedCoachId = normalizeGuid(coachId);
      activeCoachIdRef.current = normalizedCoachId;
      delete lastFetchedRef.current.tasks;

      const cached = readTaskCache(
        dataverseOrgUrlRef.current,
        normalizedCoachId
      );
      resourceHasUsableDataRef.current.tasks = cached !== null;
      setTasks(cached?.tasks ?? []);
      setTasksError(null);
      setResourceErrors((current) => {
        if (!current.tasks) return current;
        const next = { ...current };
        delete next.tasks;
        return next;
      });
      setTasksLoading(true);
      setResourceStatus((current) => ({
        ...current,
        tasks: cached ? "ready" : "idle",
      }));
      void refreshTasks().catch(() => {});

    } else if (!coachLookupLoading) {

      // Coach lookup finished without a coachId. Never leave tasks from an
      // earlier session or coach visible.
      activeCoachIdRef.current = null;
      resourceHasUsableDataRef.current.tasks = true;
      setTasks([]);
      setTasksError(null);
      setResourceErrors((current) => {
        if (!current.tasks) return current;
        const next = { ...current };
        delete next.tasks;
        return next;
      });
      setTasksLoading(false);
      setResourceStatus((current) => ({
        ...current,
        tasks: "ready",
      }));

    }

  }, [coachId, coachLookupLoading, refreshTasks]);


  // Marks Completed in Dataverse, then drops it locally — the list only
  // ever shows active tasks, so there is nothing to reconcile afterward.
  const completeTask = useCallback(async (taskId: string) => {
    await runDataverseWrite("Completing task", async () => {
      const result = await TasksService.update(taskId, {
        statecode: 1,
        statuscode: 5,
      });

      if (!result.success) {
        throw new Error(
          getErrorMessage(
            result.error,
            "Dataverse could not complete the task."
          )
        );
      }
    }).catch((requestError) => {
      console.error("[CoachPortal] Complete Task request rejected:", {
        taskId,
        error: requestError,
      });
      throw new Error(
        getErrorMessage(requestError, "Dataverse could not complete the task.")
      );
    });

    setTasks((prev) => {
      const next = prev.filter((t) => t.activityid !== taskId);
      writeTaskCache(dataverseOrgUrlRef.current, coachId, next);
      return next;
    });
    lastFetchedRef.current.tasks = Date.now();
  }, [coachId, runDataverseWrite]);


  // ---------------------------------------------------------
  // REFRESH EVERYTHING
  //
  // Deliberately sequential. The Android Power Apps host can hang when
  // generated Dataverse getAll calls overlap. A lock also makes repeated
  // Home mounts, visibility events, and manual refreshes share one run.
  // ---------------------------------------------------------

  const refreshAll = useCallback((): Promise<void> => {
    if (refreshAllInFlightRef.current) {
      return refreshAllInFlightRef.current;
    }

    setError(null);

    const refreshers: Array<[DataResource, () => Promise<void>]> = [
      ["players", refreshPlayers],
      ["events", refreshEvents],
      ["attendances", refreshAttendances],
      ["invoices", refreshInvoices],
      ["facilities", refreshFacilities],
      ["performances", refreshPerformances],
      ["generations", refreshGenerations],
      ["generationsToCoaches", refreshGenerationsToCoaches],
      ["tasks", refreshTasks],
    ];

    const run = (async () => {
      const failures: unknown[] = [];

      for (const [resource, refresh] of refreshers) {
        try {
          await refresh();
        } catch (refreshError) {
          failures.push(refreshError);
          console.error(
            `[CoachPortal] Background refresh failed for ${resource}:`,
            refreshError
          );
        }
      }

      if (failures.length > 0) {
        setError(getErrorMessage(failures[0], "Failed to load data."));
      } else {
        setError(null);
      }
    })().finally(() => {
      refreshAllInFlightRef.current = null;
    });

    refreshAllInFlightRef.current = run;
    return run;
  }, [
    refreshPlayers,
    refreshEvents,
    refreshAttendances,
    refreshInvoices,
    refreshFacilities,
    refreshPerformances,
    refreshGenerations,
    refreshGenerationsToCoaches,
    refreshTasks,
  ]);


  const ensureFresh = useCallback(async (
    resources: DataResource[],
    options: EnsureFreshOptions = {}
  ): Promise<void> => {
    setError(null);

    const refreshers: Record<DataResource, () => Promise<void>> = {
      players: refreshPlayers,
      events: refreshEvents,
      attendances: refreshAttendances,
      invoices: refreshInvoices,
      facilities: refreshFacilities,
      performances: refreshPerformances,
      generations: refreshGenerations,
      generationsToCoaches: refreshGenerationsToCoaches,
      tasks: refreshTasks,
    };

    const uniqueResources = Array.from(new Set(resources));
    const failures: unknown[] = [];
    let successfulRefreshes = 0;

    for (const resource of uniqueResources) {
      const maxAgeMs = options.maxAgeMs ?? RESOURCE_MAX_AGE_MS[resource];
      const lastFetched = lastFetchedRef.current[resource] ?? 0;
      const isFresh = Date.now() - lastFetched < maxAgeMs;

      if (!options.force && isFresh) continue;

      try {
        await refreshers[resource]();
        successfulRefreshes += 1;
      } catch (refreshError) {
        failures.push(refreshError);
        console.error(
          `[CoachPortal] Targeted refresh failed for ${resource}:`,
          refreshError
        );
      }
    }

    if (failures.length > 0) {
      setError(getErrorMessage(failures[0], "Failed to refresh data."));
    } else if (successfulRefreshes > 0) {
      setError(null);
    }

  }, [
    refreshPlayers,
    refreshEvents,
    refreshAttendances,
    refreshInvoices,
    refreshFacilities,
    refreshPerformances,
    refreshGenerations,
    refreshGenerationsToCoaches,
    refreshTasks,
  ]);


  // ---------------------------------------------------------
  // ENVIRONMENT-CHANGE CACHE PURGE
  //
  // IMPORTANT:
  // The cache keys above are plain, unscoped localStorage names, and every
  // local run of this app shares one origin (localhost:3000). Point
  // power.config.json at a different environment — Dev2 vs Villarreal —
  // and the previous environment's rows are still sitting under the exact
  // same keys, so they load straight back into state on mount.
  //
  // That is what makes records deleted in Dataverse appear to survive: the
  // rows on screen were never fetched from the table being edited, so no
  // amount of refreshing that table removes them.
  //
  // So stamp the cache with the org URL it came from and, when that URL
  // changes, drop the cached tables and the in-memory copies rather than
  // showing another environment's data.
  // ---------------------------------------------------------

  useEffect(() => {

    let cancelled = false;

    getContext()

      .then((ctx) => {

        if (cancelled) return;

        const orgUrl = ctx.app.dataverseOrgUrl ?? null;

        if (!orgUrl) return;

        dataverseOrgUrlRef.current = orgUrl;

        let previous: string | null = null;

        try {
          previous = localStorage.getItem(CACHE_ENV_KEY);
        } catch {}

        // An UNSTAMPED cache counts as stale too, not just a mismatched
        // one. Caches written before this check existed carry no origin at
        // all, so trusting them would leave exactly the stale rows this is
        // meant to clear. On a genuine first run there is nothing cached,
        // so this is a no-op rather than a wasted purge.
        const hasCachedRows = Object.values(CACHE).some((key) => {
          try {
            return (localStorage.getItem(key)?.length ?? 0) > 2;
          } catch {
            return false;
          }
        });

        if (previous !== orgUrl && hasCachedRows) {

          console.warn(
            "[CoachPortal] Cached data did not come from this environment — clearing it.",
            { cachedFrom: previous ?? "(unstamped)", now: orgUrl }
          );

          clearTableCaches();

          setPlayers([]);
          setEvents([]);
          setAttendances([]);
          setInvoices([]);
          setFacilities([]);
          setPerformances([]);
          setAllGenerations([]);
          setGenerationsToCoaches([]);
          lastFetchedRef.current = {};
          resourceHasUsableDataRef.current = {
            ...resourceHasUsableDataRef.current,
            players: false,
            events: false,
            attendances: false,
            invoices: false,
            facilities: false,
            performances: false,
            generations: false,
            generationsToCoaches: false,
          };
          setResourceStatus((current) => ({
            players: "idle",
            events: "idle",
            attendances: "idle",
            invoices: "idle",
            facilities: "idle",
            performances: "idle",
            generations: "idle",
            generationsToCoaches: "idle",
            tasks: current.tasks,
          }));
          setResourceErrors((current) =>
            current.tasks ? { tasks: current.tasks } : {}
          );
        }

        try {
          localStorage.setItem(CACHE_ENV_KEY, orgUrl);
          // Remove the old unscoped Task cache. The new cache uses a separate
          // organization + Coach key and is restored only after identity is
          // resolved.
          localStorage.removeItem(LEGACY_TASK_CACHE_KEY);
        } catch {}
      })

      .catch((err) => {
        console.error(
          "[CoachPortal] Could not determine the environment for cache validation:",
          err
        );
      });

    return () => {
      cancelled = true;
    };

  }, []);


  // ---------------------------------------------------------
  // REFRESH ON APP RESUME
  //
  // Covers the app being backgrounded and brought back to the foreground
  // (switching apps on mobile, switching browser tabs) without a full
  // relaunch. Only resources already fetched during this session are checked;
  // opening the app must not accidentally recreate a full startup refresh.
  // ---------------------------------------------------------

  useEffect(() => {

    const handleVisibilityChange = () => {

      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }

      if (document.visibilityState === "visible" && wasHiddenRef.current) {
        wasHiddenRef.current = false;

        const loadedResources = Object.keys(
          lastFetchedRef.current
        ) as DataResource[];

        if (loadedResources.length > 0) {
          void ensureFresh(loadedResources);
        }
      }

    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

    };

  }, [
    ensureFresh,
  ]);


  // ---------------------------------------------------------
  // LOGGED-IN USER → CONTACT → COACH
  // ---------------------------------------------------------

  const refreshCoach = useCallback(async () => {

    setError(null);
    setCoachLookupLoading(true);
    setCoachLookupError(null);
    setCoachId(null);
    setLoggedInCoachId(null);
    activeCoachIdRef.current = null;
    resourceHasUsableDataRef.current.tasks = false;
    delete lastFetchedRef.current.tasks;
    setTasks([]);
    setTasksError(null);
    setTasksLoading(true);
    setResourceErrors((current) => {
      if (!current.tasks) return current;
      const next = { ...current };
      delete next.tasks;
      return next;
    });
    setResourceStatus((current) => ({
      ...current,
      tasks: "idle",
    }));


    await runWithTransientRetries("Loading your account", () => getContext())

      .then(async (ctx) => {

        dataverseOrgUrlRef.current = ctx.app.dataverseOrgUrl ?? null;

        const fullName =
          ctx.user.fullName;

        const email =
          ctx.user.userPrincipalName;


        console.log(
          "[CoachPortal] Logged-in user:",
          {
            fullName,
            email,
            objectId: ctx.user.objectId,
          }
        );


        // Store logged-in user's name
        if (fullName) {

          setCoachName(fullName);

        }


        // Make sure we have an email
        if (!email) {

          console.error(
            "[CoachPortal] No email found for logged-in user."
          );

          setCoachLookupError(
            "Your signed-in account has no email address — a Coach record can't be matched."
          );

          setCoachLookupLoading(false);

          return;

        }


        try {

          // Normalize email
          const normalizedEmail =
            email.trim().toLowerCase();


          // -------------------------------------------------
          // STEP 1:
          // Logged-in user email → Contact
          // -------------------------------------------------

          const contacts = await enqueueDataverse(
            "Looking up your Contact record",
            async () => {
              const contactRes = await ContactsService.getAll({
                filter: `emailaddress1 eq '${normalizedEmail}'`,
              });
              return unwrapOrThrow<Contacts>(contactRes);
            }
          );


          console.log(
            "[CoachPortal] Contacts found:",
            contacts
          );


          const contact =
            contacts.find(
              (c) =>
                (c.emailaddress1 ?? "")
                  .trim()
                  .toLowerCase() ===
                normalizedEmail
            );


          if (!contact) {

            console.error(
              "[CoachPortal] No Contact found for email:",
              email
            );

            setCoachLookupError(
              `No Dataverse contact found for ${email}.`
            );

            setCoachLookupLoading(false);

            return;

          }


          const contactId = normalizeGuid(contact.contactid);


          console.log(
            "[CoachPortal] Contact found:",
            contactId,
            contact.fullname
          );


          // -------------------------------------------------
          // STEP 2:
          // Contact → Coach
          // -------------------------------------------------

          const coaches = await enqueueDataverse(
            "Looking up your Coach record",
            async () => {
              const coachRes = await Cr9be_coachsService.getAll({
                filter:
                  `statecode eq 0 and _cr9be_contact_value eq ${contactId}`,
                top: 2,
              });
              return unwrapOrThrow<Cr9be_coachs>(coachRes);
            }
          );


          const coach =
            coaches.find(
              (c) =>
                normalizeGuid(c._cr9be_contact_value) === contactId
            );


          if (!coach) {

            console.error(
              "[CoachPortal] No Coach found for Contact:",
              contactId
            );

            setCoachLookupError(
              `No Coach record is linked to ${
                contact.fullname ?? "your contact"
              } in Dataverse.`
            );

            setCoachLookupLoading(false);

            return;

          }


          console.log(
            "[CoachPortal] Coach found:",
            coach
          );


          console.log(
            "[CoachPortal] Coach ID:",
            coach.cr9be_coachid
          );


          // -------------------------------------------------
          // STEP 3:
          // Save Coach ID
          // -------------------------------------------------

          const resolvedCoachId = normalizeGuid(coach.cr9be_coachid);

          activeCoachIdRef.current = resolvedCoachId;

          setCoachId(resolvedCoachId);

          setLoggedInCoachId(
            resolvedCoachId
          );

          setCoachLookupError(null);

          setCoachLookupLoading(false);

        } catch (err) {

          console.error(
            "[CoachPortal] Failed to resolve Contact → Coach:",
            err
          );

          setCoachLookupError(
            err instanceof Error
              ? err.message
              : "Failed to look up your Coach record."
          );

          setCoachLookupLoading(false);

        }

      })


      .catch((err) => {

        console.error(
          "[CoachPortal] Failed to get logged-in user:",
          err
        );

        setCoachLookupError(
          err instanceof Error
            ? err.message
            : "Failed to load your account information."
        );

        setCoachLookupLoading(false);

      });

  }, [enqueueDataverse]);


  useEffect(() => {
    void refreshCoach();
  }, [refreshCoach]);


  // Roles are lower priority than the user/Coach and screen data. Start this
  // only after the initial read sequence has settled, and use the same queue.
  const initialHomeDataSettled = (
    ["players", "events", "invoices"] as DataResource[]
  ).every(
    (resource) =>
      resourceStatus[resource] === "ready" ||
      resourceStatus[resource] === "error"
  );


  useEffect(() => {
    if (
      coachLookupLoading ||
      !initialHomeDataSettled ||
      rolesLoaded ||
      rolesInFlightRef.current
    ) {
      return;
    }

    const run = (async () => {
      try {
        const ctx = await runWithTransientRetries(
          "Loading your account",
          () => getContext()
        );

        if (!ctx.user.objectId) {
          setIsBackOffice(false);
          return;
        }

        const roles = await enqueueDataverse(
          "Loading security roles",
          () => fetchUserSecurityRoles(ctx.user.objectId!)
        );
        const normalized = roles.map((role) => role.trim().toLowerCase());
        setIsBackOffice(normalized.some((role) => role.includes("back office")));
      } catch (roleError) {
        console.error("[CoachPortal] Failed to resolve security roles:", roleError);
        setIsBackOffice(false);
      } finally {
        setRolesLoaded(true);
      }
    })().finally(() => {
      rolesInFlightRef.current = null;
    });

    rolesInFlightRef.current = run;
  }, [
    coachLookupLoading,
    initialHomeDataSettled,
    rolesLoaded,
    enqueueDataverse,
  ]);


  // ---------------------------------------------------------
  // PROVIDER
  // ---------------------------------------------------------

  return (

    <DataContext.Provider
      value={{

        coachName,

        coachId,

        coachLookupLoading,

        coachLookupError,

        isBackOffice,

        rolesLoaded,

        loggedInCoachId,

        players,

        events,

        attendances,

        invoices,

        facilities,

        performances,

        allGenerations,

        generationsToCoaches,

        tasks,

        tasksLoading,

        tasksError,

        error,

        resourceStatus,

        resourceErrors,

        isLoadingResources,

        hasResourceErrors,

        getResourceError,

        refreshPlayers,

        refreshEvents,

        refreshAttendances,

        refreshInvoices,

        refreshFacilities,

        refreshPerformances,

        refreshGenerations,

        refreshGenerationsToCoaches,

        refreshCoach,

        refreshTasks,

        ensureFresh,

        completeTask,

        runDataverseRead,

        runDataverseWrite,

        refreshAll,

      }}
    >

      {children}

    </DataContext.Provider>

  );

};


export const useData =
  (): DataContextValue => {

    const ctx =
      useContext(DataContext);

    if (!ctx) {

      throw new Error(
        "useData must be used inside DataProvider"
      );

    }

    return ctx;

  };
