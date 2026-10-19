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
import { Axm365_eventcoachattendancesService } from "../generated/services/Axm365_eventcoachattendancesService";
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
import type { Axm365_eventcoachattendances } from "../generated/models/Axm365_eventcoachattendancesModel";
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
  | "coachAttendances"
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
  | "stale"
  | "error";


interface EnsureFreshOptions {
  force?: boolean;
  maxAgeMs?: number;
}


export interface GuardianContactDetails {
  name: string | null;
  phone: string | null;
}


export interface GuardianContactCacheSnapshot {
  details: GuardianContactDetails;
  isFresh: boolean;
}


interface GuardianContactOptions {
  force?: boolean;
}


interface DataContextValue {
  coachName: string | null;
  coachId: string | null;
  /** True once environment + signed-in account are known, allowing scoped
   *  guardian cache validation/writes. The regular guardian cache is readable
   *  immediately, without waiting for Contact → Coach resolution. */
  guardianCacheReady: boolean;

  /** True until a usable Coach identity is available. A saved identity can
   *  make this false immediately while live Contact → Coach validation keeps
   *  running in the background. */
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
  /** Clock-in rows for the resolved Coach. Absence is derived by comparing
   *  these records with that Coach's past Events. */
  coachAttendances: Axm365_eventcoachattendances[];
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
  hasStaleResources: (resources: DataResource[]) => boolean;
  getResourceError: (resources: DataResource[]) => string | null;

  refreshPlayers: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  refreshAttendances: () => Promise<void>;
  refreshCoachAttendances: () => Promise<void>;
  refreshInvoices: () => Promise<void>;
  refreshFacilities: () => Promise<void>;
  refreshPerformances: () => Promise<void>;
  refreshGenerations: () => Promise<void>;
  refreshGenerationsToCoaches: () => Promise<void>;
  refreshCoach: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  /** Reflect a confirmed clock-in in memory and the scoped cache before its
   *  background Dataverse revalidation finishes. */
  recordCoachClockIn: (
    eventId: string,
    attendanceId: string,
    clockIn: string
  ) => void;
  /** Merge confirmed player attendance writes into memory and the cache
   *  without re-downloading the whole attendance table. */
  recordPlayerAttendances: (confirmed: Axm365_eventattendances[]) => void;
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
  /** Returns a saved guardian immediately when available, together with its
   *  freshness. Cache identity is scoped to environment + account + Contact. */
  getCachedGuardianContact: (
    contactId: string
  ) => GuardianContactCacheSnapshot | null;
  /** Returns a guardian Contact through the shared Dataverse queue. Fresh
   *  cached values avoid a read; force=true revalidates a saved value. The
   *  Contact read itself does not wait for account/cache scope to be ready. */
  getGuardianContact: (
    contactId: string,
    options?: GuardianContactOptions
  ) => Promise<GuardianContactDetails>;
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
  guardians: "cvf_guardian_contacts",
  invoices: "cvf_invoices",
  facilities: "cvf_facilities",
  performances: "cvf_performances",
  generations: "cvf_generations",
  generationsToCoaches: "cvf_generations_to_coaches",
};


const LEGACY_TASK_CACHE_KEY = "cvf_tasks";
const TASK_CACHE_PREFIX = "cvf_tasks_v2";
const TASK_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;
const COACH_ATTENDANCE_CACHE_PREFIX = "cvf_coach_attendances_v1";
const COACH_ATTENDANCE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const COACH_IDENTITY_CACHE_PREFIX = "cvf_coach_identity_v1";
const COACH_IDENTITY_CACHE_RETENTION_MS = 7 * 24 * 60 * 60_000;
const COACH_BOOTSTRAP_CACHE_KEY = "cvf_last_verified_coach_v1";


interface TaskCacheEnvelope {
  cachedAt: number;
  tasks: Tasks[];
}


interface CoachAttendanceCacheEnvelope {
  cachedAt: number;
  attendances: Axm365_eventcoachattendances[];
}


interface CoachIdentityCacheEnvelope {
  cachedAt: number;
  coachId: string;
}


interface CoachBootstrapCacheEnvelope {
  cachedAt: number;
  orgUrl: string;
  userKey: string;
  coachId: string;
  coachName: string | null;
}


// Which Dataverse environment the cached rows above were fetched from.
// Deliberately NOT part of CACHE — it is a marker, not cached table data,
// and must survive the purge loop that clears the tables.
const CACHE_ENV_KEY = "cvf_cached_org_url";


const RESOURCE_MAX_AGE_MS: Record<DataResource, number> = {
  players: 5 * 60_000,
  events: 60_000,
  attendances: 30_000,
  coachAttendances: 30_000,
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
  } catch (cacheError) {
    // Usually the Android WebView quota. The next launch then starts this
    // resource without data and blocks its screen until a full reload.
    console.warn(`[CoachPortal] Could not persist the ${key} cache:`, cacheError);
  }
}


/** Player attendance columns used by the app. Selecting only these keeps the
 *  mobile download and the persisted cache small as the table grows. */
export const PLAYER_ATTENDANCE_FIELDS = [
  "axm365_eventattendanceid",
  "axm365_name",
  "axm365_attended",
  "_axm365_event_value",
  "_axm365_player_value",
];


function compactPlayerAttendance(
  attendance: Axm365_eventattendances
): Axm365_eventattendances {
  return {
    axm365_eventattendanceid: attendance.axm365_eventattendanceid,
    axm365_name: attendance.axm365_name,
    axm365_attended: attendance.axm365_attended,
    _axm365_event_value: attendance._axm365_event_value,
    _axm365_player_value: attendance._axm365_player_value,
  } as Axm365_eventattendances;
}


/** Player performance columns used by Attendance, Performance and Players. */
const PLAYER_PERFORMANCE_FIELDS = [
  "axm365_playereventperformanceid",
  "axm365_performancename",
  "axm365_raiting",
  "axm365_technique",
  "axm365_effort",
  "axm365_tacticalawareness",
  "axm365_teamplay",
  "axm365_notes",
  "createdon",
  "_axm365_cr9be_player_value",
  "_axm365_event_value",
];


function compactPlayerPerformance(
  performance: Axm365_playereventperformances
): Axm365_playereventperformances {
  return {
    axm365_playereventperformanceid: performance.axm365_playereventperformanceid,
    axm365_performancename: performance.axm365_performancename,
    axm365_raiting: performance.axm365_raiting,
    axm365_technique: performance.axm365_technique,
    axm365_effort: performance.axm365_effort,
    axm365_tacticalawareness: performance.axm365_tacticalawareness,
    axm365_teamplay: performance.axm365_teamplay,
    axm365_notes: performance.axm365_notes,
    createdon: performance.createdon,
    _axm365_cr9be_player_value: performance._axm365_cr9be_player_value,
    _axm365_event_value: performance._axm365_event_value,
  } as Axm365_playereventperformances;
}


// Invoice fields read by Home, Invoices and getInvoiceStatus. Their OData
// formatted-value annotations (e.g. the customer display name) are kept too.
const INVOICE_CACHE_FIELDS = new Set([
  "invoiceid",
  "invoicenumber",
  "name",
  "description",
  "totalamount",
  "duedate",
  "statecode",
  "statuscode",
  "customerid",
  "customeridtype",
  "customeridname",
  "contactidname",
  "_contactid_value",
  "_customerid_value",
]);


function compactInvoice(invoice: Invoices): Invoices {
  const compact: Record<string, unknown> = {};
  Object.entries(invoice as unknown as Record<string, unknown>).forEach(
    ([key, value]) => {
      if (INVOICE_CACHE_FIELDS.has(key.split("@")[0])) compact[key] = value;
    }
  );
  return compact as unknown as Invoices;
}


function sortPlayersByName(items: Cr9be_players[]): Cr9be_players[] {
  return [...items].sort((left, right) => {
    const nameComparison = (left.cr9be_name ?? "").localeCompare(
      right.cr9be_name ?? "",
      undefined,
      { sensitivity: "base" }
    );

    // Keep ordering deterministic when two Players have the same name.
    return nameComparison !== 0
      ? nameComparison
      : left.cr9be_playerid.localeCompare(right.cr9be_playerid);
  });
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
      // Persist only the fields used by Home and Notifications. Generated
      // Dataverse rows contain many properties that waste mobile cache space.
      tasks: tasks.map((task) =>
        ({
          activityid: task.activityid,
          subject: task.subject,
          description: task.description,
          prioritycode: task.prioritycode,
          scheduledend: task.scheduledend,
          createdon: task.createdon,
          statecode: task.statecode,
          statuscode: task.statuscode,
          _regardingobjectid_value: task._regardingobjectid_value,
        }) as Tasks
      ),
    };
    localStorage.setItem(taskCacheKey(orgUrl, coachId), JSON.stringify(value));
  } catch (cacheError) {
    console.warn("[CoachPortal] Could not persist the Task cache:", cacheError);
  }
}


function coachAttendanceCacheKey(orgUrl: string, coachId: string): string {
  return `${COACH_ATTENDANCE_CACHE_PREFIX}:${encodeURIComponent(
    orgUrl.trim().toLowerCase()
  )}:${normalizeGuid(coachId)}`;
}


function readCoachAttendanceCache(
  orgUrl: string | null,
  coachId: string
): CoachAttendanceCacheEnvelope | null {
  if (!orgUrl || !coachId) return null;

  try {
    const key = coachAttendanceCacheKey(orgUrl, coachId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CoachAttendanceCacheEnvelope;
    if (
      !Array.isArray(parsed?.attendances) ||
      typeof parsed?.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > COACH_ATTENDANCE_CACHE_MAX_AGE_MS
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}


function writeCoachAttendanceCache(
  orgUrl: string | null,
  coachId: string | null,
  attendances: Axm365_eventcoachattendances[]
): void {
  if (!orgUrl || !coachId) return;

  try {
    const value: CoachAttendanceCacheEnvelope = {
      cachedAt: Date.now(),
      // Attendance rendering and clock-in checks need only these identifiers
      // and timestamps. Compact rows avoid exhausting Android localStorage.
      attendances: attendances.map((attendance) =>
        ({
          axm365_eventcoachattendanceid:
            attendance.axm365_eventcoachattendanceid,
          axm365_name: attendance.axm365_name,
          axm365_clockin: attendance.axm365_clockin,
          createdon: attendance.createdon,
          statecode: attendance.statecode,
          _axm365_coach_value: attendance._axm365_coach_value,
          _axm365_event_value: attendance._axm365_event_value,
        }) as Axm365_eventcoachattendances
      ),
    };
    localStorage.setItem(
      coachAttendanceCacheKey(orgUrl, coachId),
      JSON.stringify(value)
    );
  } catch (cacheError) {
    console.warn(
      "[CoachPortal] Could not persist the Coach Attendance cache:",
      cacheError
    );
  }
}


function coachIdentityCacheKey(orgUrl: string, userKey: string): string {
  return `${COACH_IDENTITY_CACHE_PREFIX}:${encodeURIComponent(
    orgUrl.trim().toLowerCase()
  )}:${encodeURIComponent(userKey.trim().toLowerCase())}`;
}


function readCoachIdentityCache(
  orgUrl: string | null,
  userKey: string
): CoachIdentityCacheEnvelope | null {
  if (!orgUrl || !userKey) return null;

  try {
    const key = coachIdentityCacheKey(orgUrl, userKey);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CoachIdentityCacheEnvelope;
    const normalizedCoachId = normalizeGuid(parsed?.coachId);
    if (
      !normalizedCoachId ||
      typeof parsed?.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > COACH_IDENTITY_CACHE_RETENTION_MS
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return {
      cachedAt: parsed.cachedAt,
      coachId: normalizedCoachId,
    };
  } catch {
    return null;
  }
}


function writeCoachIdentityCache(
  orgUrl: string | null,
  userKey: string,
  coachId: string
): void {
  const normalizedCoachId = normalizeGuid(coachId);
  if (!orgUrl || !userKey || !normalizedCoachId) return;

  try {
    const value: CoachIdentityCacheEnvelope = {
      cachedAt: Date.now(),
      coachId: normalizedCoachId,
    };
    localStorage.setItem(
      coachIdentityCacheKey(orgUrl, userKey),
      JSON.stringify(value)
    );
  } catch {}
}


function removeCoachIdentityCache(
  orgUrl: string | null,
  userKey: string
): void {
  if (!orgUrl || !userKey) return;
  try {
    localStorage.removeItem(coachIdentityCacheKey(orgUrl, userKey));
  } catch {}
}


function readCoachBootstrapCache(): CoachBootstrapCacheEnvelope | null {
  try {
    const raw = localStorage.getItem(COACH_BOOTSTRAP_CACHE_KEY);
    if (!raw) {
      // One-time migration for installations that already have the former
      // account-scoped Coach identity cache. If this device has exactly one
      // valid identity, it is safe to use as the initial bootstrap hint and
      // validate it against getContext immediately afterward.
      const prefix = `${COACH_IDENTITY_CACHE_PREFIX}:`;
      const candidates: CoachBootstrapCacheEnvelope[] = [];

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;

        const parts = key.slice(prefix.length).split(":");
        if (parts.length !== 2) continue;

        const stored = localStorage.getItem(key);
        if (!stored) continue;

        const identity = JSON.parse(stored) as CoachIdentityCacheEnvelope;
        const coachId = normalizeGuid(identity?.coachId);
        const orgUrl = decodeURIComponent(parts[0]).trim();
        const userKey = decodeURIComponent(parts[1]).trim().toLowerCase();
        if (
          coachId &&
          orgUrl &&
          userKey &&
          typeof identity?.cachedAt === "number" &&
          Date.now() - identity.cachedAt <= COACH_IDENTITY_CACHE_RETENTION_MS
        ) {
          candidates.push({
            cachedAt: identity.cachedAt,
            orgUrl,
            userKey,
            coachId,
            coachName: null,
          });
        }
      }

      if (candidates.length !== 1) return null;
      localStorage.setItem(
        COACH_BOOTSTRAP_CACHE_KEY,
        JSON.stringify(candidates[0])
      );
      return candidates[0];
    }

    const parsed = JSON.parse(raw) as CoachBootstrapCacheEnvelope;
    const coachId = normalizeGuid(parsed?.coachId);
    const orgUrl = parsed?.orgUrl?.trim();
    const userKey = parsed?.userKey?.trim().toLowerCase();
    if (
      !coachId ||
      !orgUrl ||
      !userKey ||
      typeof parsed?.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > COACH_IDENTITY_CACHE_RETENTION_MS
    ) {
      localStorage.removeItem(COACH_BOOTSTRAP_CACHE_KEY);
      return null;
    }

    return {
      cachedAt: parsed.cachedAt,
      orgUrl,
      userKey,
      coachId,
      coachName:
        typeof parsed.coachName === "string" && parsed.coachName.trim()
          ? parsed.coachName.trim()
          : null,
    };
  } catch {
    return null;
  }
}


function writeCoachBootstrapCache(
  orgUrl: string | null,
  userKey: string,
  coachId: string,
  coachName: string | null
): CoachBootstrapCacheEnvelope | null {
  const normalizedCoachId = normalizeGuid(coachId);
  const normalizedUserKey = userKey.trim().toLowerCase();
  if (!orgUrl || !normalizedUserKey || !normalizedCoachId) return null;

  const value: CoachBootstrapCacheEnvelope = {
    cachedAt: Date.now(),
    orgUrl,
    userKey: normalizedUserKey,
    coachId: normalizedCoachId,
    coachName: coachName?.trim() || null,
  };

  try {
    localStorage.setItem(COACH_BOOTSTRAP_CACHE_KEY, JSON.stringify(value));
  } catch {}
  return value;
}


function removeCoachBootstrapCache(): void {
  try {
    localStorage.removeItem(COACH_BOOTSTRAP_CACHE_KEY);
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


function createInitialResourceStatus(
  hasCoachAttendanceCache = false
): Record<DataResource, DataResourceStatus> {
  return {
    players: hasUsableCache(CACHE.players) ? "ready" : "idle",
    events: hasUsableCache(CACHE.events) ? "ready" : "idle",
    attendances: hasUsableCache(CACHE.attendances) ? "ready" : "idle",
    coachAttendances: hasCoachAttendanceCache ? "ready" : "idle",
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


// Cache scoping must not depend only on dataverseOrgUrl. Power Apps Mobile can
// supply the app/user context while that URL is unavailable or delayed. The
// environment id is the stable first choice, with app id and org URL as safe
// fallbacks for older hosts.
function getContextCacheEnvironmentKey(context: unknown): string | null {
  const app = (context as any)?.app;
  const environmentId = normalizeGuid(app?.environmentId);
  if (environmentId) return `environment:${environmentId}`;

  const appId = normalizeGuid(app?.appId);
  if (appId) return `app:${appId}`;

  const orgUrl =
    typeof app?.dataverseOrgUrl === "string"
      ? app.dataverseOrgUrl.trim().toLowerCase()
      : "";
  return orgUrl ? `org:${orgUrl}` : null;
}


function storedEnvironmentMatchesContext(
  storedEnvironment: string | null | undefined,
  context: unknown
): boolean {
  const stored = storedEnvironment?.trim().toLowerCase();
  if (!stored) return false;

  const current = getContextCacheEnvironmentKey(context)?.toLowerCase();
  if (current && stored === current) return true;

  // Accept the raw URL used by v4 and earlier once, then rewrite it using the
  // stable environment/app scope. This avoids an unnecessary cache purge when
  // upgrading on a host that still supplies dataverseOrgUrl.
  const legacyOrgUrl =
    typeof (context as any)?.app?.dataverseOrgUrl === "string"
      ? (context as any).app.dataverseOrgUrl.trim().toLowerCase()
      : "";
  return Boolean(
    legacyOrgUrl &&
      (stored === legacyOrgUrl || stored === `org:${legacyOrgUrl}`)
  );
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
const BACKGROUND_RETRY_DELAYS_MS = [15_000, 45_000, 120_000] as const;
const GUARDIAN_CACHE_PREFIX = "cvf_guardian_v2";
const GUARDIAN_CACHE_FRESH_MS = 24 * 60 * 60_000;
const GUARDIAN_CACHE_RETENTION_MS = 30 * 24 * 60 * 60_000;


interface GuardianContactCacheEnvelope {
  cachedAt: number;
  details: GuardianContactDetails;
}


interface GuardianTableCacheEntry extends GuardianContactCacheEnvelope {
  contactId: string;
}


function readGuardianTableCache(): Map<string, GuardianContactCacheEnvelope> {
  const entries = readCache<GuardianTableCacheEntry>(CACHE.guardians);
  const result = new Map<string, GuardianContactCacheEnvelope>();

  entries.forEach((entry) => {
    const contactId = normalizeGuid(entry?.contactId);
    if (
      contactId &&
      isGuardianCacheEnvelope(entry) &&
      Date.now() - entry.cachedAt <= GUARDIAN_CACHE_RETENTION_MS
    ) {
      result.set(contactId, {
        cachedAt: entry.cachedAt,
        details: entry.details,
      });
    }
  });

  if (result.size === 0) {
    // Migrate guardian details already cached by the previous scoped format.
    // This prevents the package upgrade itself from causing one more mobile
    // "Loading phone" cycle before the new regular table cache is populated.
    try {
      const prefix = `${GUARDIAN_CACHE_PREFIX}:`;
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;

        const contactId = normalizeGuid(key.split(":").pop());
        const raw = localStorage.getItem(key);
        if (!contactId || !raw) continue;

        const value = JSON.parse(raw) as unknown;
        if (
          !isGuardianCacheEnvelope(value) ||
          Date.now() - value.cachedAt > GUARDIAN_CACHE_RETENTION_MS
        ) {
          continue;
        }

        const existing = result.get(contactId);
        if (!existing || value.cachedAt > existing.cachedAt) {
          result.set(contactId, value);
        }
      }

      if (result.size > 0) {
        writeCache(
          CACHE.guardians,
          Array.from(result, ([contactId, value]) => ({
            contactId,
            cachedAt: value.cachedAt,
            details: value.details,
          }))
        );
      }
    } catch {}
  }

  return result;
}


function writeGuardianTableCache(
  cache: Map<string, GuardianContactCacheEnvelope>
): void {
  const entries: GuardianTableCacheEntry[] = Array.from(
    cache,
    ([contactId, value]) => ({
      contactId,
      cachedAt: value.cachedAt,
      details: value.details,
    })
  );
  writeCache(CACHE.guardians, entries);
}


function guardianContactCacheKey(
  orgUrl: string,
  userKey: string,
  contactId: string
): string {
  return `${GUARDIAN_CACHE_PREFIX}:${encodeURIComponent(
    orgUrl.trim().toLowerCase()
  )}:${encodeURIComponent(userKey.trim().toLowerCase())}:${normalizeGuid(contactId)}`;
}


function isGuardianCacheEnvelope(
  value: unknown
): value is GuardianContactCacheEnvelope {
  const candidate = value as GuardianContactCacheEnvelope | null;
  return Boolean(
    candidate &&
      typeof candidate.cachedAt === "number" &&
      candidate.details &&
      (typeof candidate.details.name === "string" || candidate.details.name === null) &&
      (typeof candidate.details.phone === "string" || candidate.details.phone === null)
  );
}


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

  // A verified last-session identity is a startup hint only. It lets the
  // Coach-scoped attendance cache render during the first React pass; the
  // current Power Apps account is still validated immediately in background.
  const initialCoachBootstrapRef = useRef<CoachBootstrapCacheEnvelope | null>(
    readCoachBootstrapCache()
  );
  const initialCoachAttendanceCacheRef =
    useRef<CoachAttendanceCacheEnvelope | null>(
      initialCoachBootstrapRef.current
        ? readCoachAttendanceCache(
            initialCoachBootstrapRef.current.orgUrl,
            initialCoachBootstrapRef.current.coachId
          )
        : null
    );

  const [coachName, setCoachName] = useState<string | null>(
    initialCoachBootstrapRef.current?.coachName ?? null
  );

  const [loggedInCoachId, setLoggedInCoachId] =
    useState<string | null>(initialCoachBootstrapRef.current?.coachId ?? null);

  const [coachId, setCoachId] =
    useState<string | null>(initialCoachBootstrapRef.current?.coachId ?? null);

  const [guardianCacheReady, setGuardianCacheReady] = useState(false);

  const [coachLookupLoading, setCoachLookupLoading] = useState(
    !initialCoachBootstrapRef.current
  );

  const [coachLookupError, setCoachLookupError] = useState<string | null>(null);

  const [isBackOffice, setIsBackOffice] = useState(false);

  const [rolesLoaded, setRolesLoaded] = useState(false);


  const [players, setPlayers] = useState<Cr9be_players[]>(() =>
    sortPlayersByName(readCache<Cr9be_players>(CACHE.players))
  );

  const [events, setEvents] = useState<Axm365_events[]>(() =>
    readCache(CACHE.events)
  );

  const [attendances, setAttendances] =
    useState<Axm365_eventattendances[]>(() =>
      readCache(CACHE.attendances)
    );

  const [coachAttendances, setCoachAttendances] =
    useState<Axm365_eventcoachattendances[]>(
      initialCoachAttendanceCacheRef.current?.attendances ?? []
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
  >(() =>
    createInitialResourceStatus(Boolean(initialCoachAttendanceCacheRef.current))
  );
  const resourceStatusRef = useRef(resourceStatus);
  resourceStatusRef.current = resourceStatus;
  const resourceHasUsableDataRef = useRef<Record<DataResource, boolean>>({
    players: resourceStatus.players === "ready",
    events: resourceStatus.events === "ready",
    attendances: resourceStatus.attendances === "ready",
    coachAttendances: resourceStatus.coachAttendances === "ready",
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
  const backgroundRetryTimersRef = useRef<
    Partial<Record<DataResource, number>>
  >({});
  const backgroundRetryAttemptsRef = useRef<
    Partial<Record<DataResource, number>>
  >({});
  const runResourceRefreshRef = useRef<
    ((
      resource: DataResource,
      label: string,
      operation: () => Promise<void>
    ) => Promise<void>) | null
  >(null);
  const refreshTasksRef = useRef<(() => Promise<void>) | null>(null);
  const refreshCoachAttendancesRef = useRef<(() => Promise<void>) | null>(null);

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


  const hasStaleResources = useCallback(
    (resources: DataResource[]): boolean =>
      resources.some((resource) => resourceStatus[resource] === "stale"),
    [resourceStatus]
  );


  const clearBackgroundRetry = useCallback((resource: DataResource) => {
    const timer = backgroundRetryTimersRef.current[resource];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete backgroundRetryTimersRef.current[resource];
    }
  }, []);


  const scheduleBackgroundRetry = useCallback(
    (resource: DataResource, retry: () => void) => {
      if (backgroundRetryTimersRef.current[resource] !== undefined) return;

      const attempt = backgroundRetryAttemptsRef.current[resource] ?? 0;
      const delayMs = BACKGROUND_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) return;

      backgroundRetryAttemptsRef.current[resource] = attempt + 1;
      backgroundRetryTimersRef.current[resource] = window.setTimeout(() => {
        delete backgroundRetryTimersRef.current[resource];
        retry();
      }, delayMs);
    },
    []
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
  const guardianCacheUserKeyRef = useRef<string | null>(null);
  const activeCoachIdRef = useRef<string | null>(
    initialCoachBootstrapRef.current?.coachId ?? null
  );
  const taskInFlightByCoachRef = useRef<Record<string, Promise<void>>>({});
  const coachAttendanceInFlightByCoachRef = useRef<
    Record<string, Promise<void>>
  >({});
  // A confirmed create is merged into any older in-flight read so mobile
  // eventual consistency cannot briefly turn the new clock-in into Absent.
  const pendingCoachClockInsRef = useRef<
    Map<string, Axm365_eventcoachattendances>
  >(new Map());
  const guardianContactCacheRef = useRef<
    Map<string, GuardianContactCacheEnvelope>
  >(new Map());
  const guardianTableCacheRef = useRef<
    Map<string, GuardianContactCacheEnvelope>
  >(readGuardianTableCache());
  const guardianContactInFlightRef = useRef<
    Map<string, Promise<GuardianContactDetails>>
  >(new Map());
  // Prevent Player refreshes from enqueueing the same background Contact
  // batch more than once while an earlier warm-up is still in flight.
  const guardianWarmupPendingRef = useRef<Set<string>>(new Set());

  // Tasks and Coach Attendance are isolated by Dataverse environment + Coach.
  // During the first mobile render getContext may not have populated the live
  // organization ref yet, so use the last verified bootstrap organization only
  // when it belongs to the same Coach. This lets both scoped caches restore and
  // persist before the live account validation finishes without crossing users.
  const getCoachScopedCacheOrgUrl = useCallback(
    (targetCoachId: string | null | undefined): string | null => {
      const liveOrgUrl = dataverseOrgUrlRef.current;
      if (liveOrgUrl) return liveOrgUrl;

      const normalizedTargetCoachId = normalizeGuid(targetCoachId);
      const bootstrap = initialCoachBootstrapRef.current;
      return normalizedTargetCoachId &&
        normalizeGuid(bootstrap?.coachId) === normalizedTargetCoachId
        ? bootstrap?.orgUrl ?? null
        : null;
    },
    []
  );


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


  const getGuardianCacheKey = useCallback((contactId: string): string | null => {
    const orgUrl = dataverseOrgUrlRef.current;
    const userKey = guardianCacheUserKeyRef.current;
    const normalizedContactId = normalizeGuid(contactId);

    if (!orgUrl || !userKey || !normalizedContactId) return null;
    return guardianContactCacheKey(orgUrl, userKey, normalizedContactId);
  }, []);


  const readGuardianContactCache = useCallback(
    (contactId: string): GuardianContactCacheSnapshot | null => {
      const normalizedContactId = normalizeGuid(contactId);
      if (!normalizedContactId) return null;

      const key = getGuardianCacheKey(normalizedContactId);

      let cached = key
        ? guardianContactCacheRef.current.get(key) ?? null
        : null;

      if (!cached && key) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (isGuardianCacheEnvelope(parsed)) {
              cached = parsed;
              guardianContactCacheRef.current.set(key, parsed);
            } else {
              localStorage.removeItem(key);
            }
          }
        } catch {}
      }

      // Guardian Contact details are Player-related reference data, not
      // Coach-specific data. This regular table cache is therefore available
      // during the first render, before account/Coach scope is resolved.
      if (!cached) {
        cached =
          guardianTableCacheRef.current.get(normalizedContactId) ?? null;
      }

      if (!cached) return null;

      const ageMs = Date.now() - cached.cachedAt;
      if (ageMs > GUARDIAN_CACHE_RETENTION_MS) {
        if (key) {
          guardianContactCacheRef.current.delete(key);
          try {
            localStorage.removeItem(key);
          } catch {}
        }
        guardianTableCacheRef.current.delete(normalizedContactId);
        writeGuardianTableCache(guardianTableCacheRef.current);
        return null;
      }

      return {
        details: cached.details,
        isFresh: ageMs < GUARDIAN_CACHE_FRESH_MS,
      };
    },
    [getGuardianCacheKey]
  );


  const writeGuardianContactCache = useCallback(
    (
      key: string | null,
      contactId: string,
      details: GuardianContactDetails
    ): void => {
      const normalizedContactId = normalizeGuid(contactId);
      if (!normalizedContactId) return;

      const value: GuardianContactCacheEnvelope = {
        cachedAt: Date.now(),
        details,
      };
      if (key) {
        guardianContactCacheRef.current.set(key, value);
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {}
      }

      guardianTableCacheRef.current.set(normalizedContactId, value);
      writeGuardianTableCache(guardianTableCacheRef.current);
    },
    []
  );


  const getCachedGuardianContact = useCallback(
    (contactId: string): GuardianContactCacheSnapshot | null =>
      readGuardianContactCache(contactId),
    [readGuardianContactCache]
  );


  const getGuardianContact = useCallback(
    (
      contactId: string,
      options: GuardianContactOptions = {}
    ): Promise<GuardianContactDetails> => {
      const normalizedId = normalizeGuid(contactId);
      if (!normalizedId) {
        return Promise.reject(new Error("Guardian Contact id is missing."));
      }

      const cacheKey = getGuardianCacheKey(normalizedId);
      const cached = readGuardianContactCache(normalizedId);
      // A fresh cached null phone is also a complete Contact result: it means
      // neither supported phone field currently has a value. Re-reading it on
      // every Player selection defeats the cache and causes a loading flicker.
      if (!options.force && cached?.isFresh) {
        return Promise.resolve(cached.details);
      }

      // Account context is needed only to scope persistent storage. It must
      // never gate the live Contact read: Power Apps Mobile can resolve the
      // Player before getContext has supplied organization/account identity.
      // Deduplicate by Contact for this provider session. This also prevents
      // guardianCacheReady changing mid-request from enqueueing a second read
      // for the same selected guardian under a newly available cache key.
      const requestKey = `contact:${normalizedId}`;
      const existing = guardianContactInFlightRef.current.get(requestKey);
      if (existing) return existing;

      const request = runDataverseRead(
        "Loading guardian details",
        async () => {
          const res = await ContactsService.get(normalizedId, {
            select: ["fullname", "mobilephone", "telephone1"],
          });

          if (!res.success || !res.data) {
            throw new Error(
              getErrorMessage(
                res.error,
                "Failed to load guardian details."
              )
            );
          }

          const name = res.data.fullname?.trim() || null;
          const phone =
            res.data.mobilephone?.trim() ||
            res.data.telephone1?.trim() ||
            null;
          const details: GuardianContactDetails = { name, phone };

          // Prefer the scope captured when the request began. If this was an
          // early unscoped mobile read, getContext may have become ready while
          // it was in flight; in that case it is now safe to persist the result.
          const resolvedCacheKey = cacheKey ?? getGuardianCacheKey(normalizedId);
          writeGuardianContactCache(resolvedCacheKey, normalizedId, details);
          return details;
        }
      ).finally(() => {
        guardianContactInFlightRef.current.delete(requestKey);
      });

      guardianContactInFlightRef.current.set(requestKey, request);
      return request;
    },
    [getGuardianCacheKey, readGuardianContactCache, runDataverseRead, writeGuardianContactCache]
  );


  // Warm Guardian Contact details as soon as cached Players are available.
  // The regular guardian table cache is intentionally independent of Coach
  // resolution, so mobile startup never waits for account/Coach scope before
  // filling it. The optional scoped copy is added whenever context is ready.
  useEffect(() => {
    if (players.length === 0) return;

    const guardianIds = Array.from(
      new Set(
        players
          .map((player) =>
            normalizeGuid((player as any)._cr9be_member_value)
          )
          .filter(Boolean)
      )
    ).filter((contactId) => {
      if (guardianWarmupPendingRef.current.has(contactId)) return false;
      return !readGuardianContactCache(contactId)?.isFresh;
    });

    if (guardianIds.length === 0) return;
    guardianIds.forEach((contactId) =>
      guardianWarmupPendingRef.current.add(contactId)
    );

    void (async () => {
      const batchSize = 25;
      for (let index = 0; index < guardianIds.length; index += batchSize) {
        const batch = guardianIds.slice(index, index + batchSize);

        try {
          const contacts = await runDataverseRead(
            "Caching guardian details",
            async () => {
              const res = await ContactsService.getAll({
                select: ["contactid", "fullname", "mobilephone", "telephone1"],
                filter: batch
                  .map((contactId) => `contactid eq ${contactId}`)
                  .join(" or "),
              });
              return unwrapOrThrow<Contacts>(res);
            }
          );

          contacts.forEach((contact) => {
            const contactId = normalizeGuid(contact.contactid);
            if (!contactId) return;

            const phone =
              contact.mobilephone?.trim() ||
              contact.telephone1?.trim() ||
              null;

            // getGuardianCacheKey can legitimately be null during startup.
            // writeGuardianContactCache still persists the regular table cache,
            // which is the cache Performance can read before Coach resolution.
            writeGuardianContactCache(
              getGuardianCacheKey(contactId),
              contactId,
              {
                name: contact.fullname?.trim() || null,
                phone,
              }
            );
          });
        } catch (guardianWarmupError) {
          // Warm-up is best effort. The selected Player path keeps its own
          // retry UX and must not be turned into a screen-level failure.
          console.warn(
            "[CoachPortal] Guardian cache warm-up failed:",
            guardianWarmupError
          );
          return;
        } finally {
          batch.forEach((contactId) =>
            guardianWarmupPendingRef.current.delete(contactId)
          );
        }
      }
    })();
  }, [
    getGuardianCacheKey,
    players,
    readGuardianContactCache,
    runDataverseRead,
    writeGuardianContactCache,
  ]);


  const runResourceRefresh = useCallback(
    (
      resource: DataResource,
      label: string,
      operation: () => Promise<void>
    ): Promise<void> => {
      const existing = resourceInFlightRef.current[resource];
      if (existing) return existing;

      clearBackgroundRetry(resource);
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
          backgroundRetryAttemptsRef.current[resource] = 0;
          setResourceStatus((current) => ({
            ...current,
            [resource]: "ready",
          }));
        })
        .catch((refreshError) => {
          if (hadUsableData) {
            // Cached data remains usable. Keep the large blocking error hidden
            // and arrange a bounded delayed retry through the same queue.
            scheduleBackgroundRetry(resource, () => {
              const retryRefresh = runResourceRefreshRef.current;
              if (retryRefresh) {
                void retryRefresh(resource, label, operation).catch(() => {});
              }
            });
          } else {
            setResourceErrors((current) => ({
              ...current,
              [resource]: getErrorMessage(
                refreshError,
                `Failed to load ${resource}.`
              ),
            }));
          }
          setResourceStatus((current) => ({
            ...current,
            [resource]: hadUsableData ? "stale" : "error",
          }));
          throw refreshError;
        })
        .finally(() => {
          delete resourceInFlightRef.current[resource];
        });

      resourceInFlightRef.current[resource] = request;
      return request;
    },
    [clearBackgroundRetry, enqueueDataverse, scheduleBackgroundRetry]
  );

  runResourceRefreshRef.current = runResourceRefresh;


  // ---------------------------------------------------------
  // REFRESH PLAYERS
  // ---------------------------------------------------------

  const refreshPlayers = useCallback(() =>
    runResourceRefresh("players", "Loading players", async () => {
      const data = sortPlayersByName(
        (
          await fetchAllPages<Cr9be_players>((skipToken) =>
            Cr9be_playersService.getAll({
              filter: "statecode eq 0",
              orderBy: ["cr9be_name asc", "cr9be_playerid asc"],
              ...(skipToken ? { skipToken } : {}),
            })
          )
        ).map(({ cr9be_picture, ...player }) => player as Cr9be_players)
      );
      // cr9be_picture can hold each Player's base64 thumbnail. Photos are
      // cached separately by photoCache, and keeping them here can fill the
      // mobile localStorage quota before later tables (e.g. invoices) persist.

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
      // Paged like Players/Events: a single getAll stops at one server page.
      const data = (
        await fetchAllPages<Axm365_eventattendances>((skipToken) =>
          Axm365_eventattendancesService.getAll({
            select: PLAYER_ATTENDANCE_FIELDS,
            orderBy: ["axm365_eventattendanceid asc"],
            ...(skipToken ? { skipToken } : {}),
          })
        )
      ).map(compactPlayerAttendance);

      setAttendances(data);
      writeCache(CACHE.attendances, data);
    }),
  [runResourceRefresh]);


  // Reflect confirmed attendance writes in memory and the cache without
  // re-downloading the whole table. Rows are replaced in place by id so the
  // screen keeps finding the same record on the next save.
  const recordPlayerAttendances = useCallback(
    (confirmed: Axm365_eventattendances[]) => {
      if (confirmed.length === 0) return;

      const confirmedById = new Map(
        confirmed.map((attendance) => [
          normalizeGuid(attendance.axm365_eventattendanceid),
          compactPlayerAttendance(attendance),
        ])
      );

      setAttendances((current) => {
        const replaced = new Set<string>();
        const next = current.map((item) => {
          const id = normalizeGuid(item.axm365_eventattendanceid);
          const confirmedRow = confirmedById.get(id);
          if (!confirmedRow) return item;
          replaced.add(id);
          return confirmedRow;
        });
        confirmedById.forEach((row, id) => {
          if (!replaced.has(id)) next.push(row);
        });

        writeCache(CACHE.attendances, next);
        return next;
      });
    },
    []
  );


  // ---------------------------------------------------------
  // REFRESH COACH ATTENDANCES
  //
  // This is intentionally separate from player event attendance. It is
  // Coach-scoped and cached per environment + Coach. The last verified
  // Coach's rows can be restored during the first render, then the current
  // account and live rows are validated in the background.
  // ---------------------------------------------------------

  const refreshCoachAttendances = useCallback(async () => {
    if (!coachId) return;

    const requestCoachId = normalizeGuid(coachId);
    const existingRequest =
      coachAttendanceInFlightByCoachRef.current[requestCoachId];
    if (existingRequest) return existingRequest;

    clearBackgroundRetry("coachAttendances");
    const hadUsableData =
      resourceHasUsableDataRef.current.coachAttendances;
    setResourceErrors((current) => {
      if (!current.coachAttendances) return current;
      const next = { ...current };
      delete next.coachAttendances;
      return next;
    });
    setResourceStatus((current) => ({
      ...current,
      coachAttendances: hadUsableData ? "refreshing" : "loading",
    }));

    const request = enqueueDataverse("Loading coach attendances", async () => {
      const data = await fetchAllPages<Axm365_eventcoachattendances>(
        (skipToken) =>
          Axm365_eventcoachattendancesService.getAll({
            select: [
              "axm365_eventcoachattendanceid",
              "axm365_name",
              "axm365_clockin",
              "createdon",
              "statecode",
              "_axm365_coach_value",
              "_axm365_event_value",
            ],
            filter: `statecode eq 0 and _axm365_coach_value eq ${requestCoachId}`,
            orderBy: ["createdon desc"],
            ...(skipToken ? { skipToken } : {}),
          })
      );

      if (activeCoachIdRef.current !== requestCoachId) return;

      const returnedIds = new Set(
        data.map((item) => normalizeGuid(item.axm365_eventcoachattendanceid))
      );
      const merged = [...data];

      pendingCoachClockInsRef.current.forEach((pending, attendanceId) => {
        if (returnedIds.has(attendanceId)) {
          pendingCoachClockInsRef.current.delete(attendanceId);
          return;
        }

        if (normalizeGuid(pending._axm365_coach_value) === requestCoachId) {
          merged.unshift(pending);
        }
      });

      const cachedAt = Date.now();
      initialCoachAttendanceCacheRef.current = {
        cachedAt,
        attendances: merged,
      };
      setCoachAttendances(merged);
      writeCoachAttendanceCache(
        getCoachScopedCacheOrgUrl(requestCoachId),
        requestCoachId,
        merged
      );
      lastFetchedRef.current.coachAttendances = cachedAt;
      resourceHasUsableDataRef.current.coachAttendances = true;
      backgroundRetryAttemptsRef.current.coachAttendances = 0;
      setResourceStatus((current) => ({
        ...current,
        coachAttendances: "ready",
      }));
    })
      .catch((refreshError) => {
        if (activeCoachIdRef.current === requestCoachId) {
          if (hadUsableData) {
            scheduleBackgroundRetry("coachAttendances", () => {
              const retry = refreshCoachAttendancesRef.current;
              if (retry) void retry().catch(() => {});
            });
          } else {
            setResourceErrors((current) => ({
              ...current,
              coachAttendances: getErrorMessage(
                refreshError,
                "Failed to load coach attendance."
              ),
            }));
          }

          setResourceStatus((current) => ({
            ...current,
            coachAttendances: hadUsableData ? "stale" : "error",
          }));
        }
        throw refreshError;
      })
      .finally(() => {
        delete coachAttendanceInFlightByCoachRef.current[requestCoachId];
      });

    coachAttendanceInFlightByCoachRef.current[requestCoachId] = request;
    return request;
  }, [
    clearBackgroundRetry,
    coachId,
    enqueueDataverse,
    getCoachScopedCacheOrgUrl,
    scheduleBackgroundRetry,
  ]);

  refreshCoachAttendancesRef.current = refreshCoachAttendances;


  const recordCoachClockIn = useCallback((
    eventId: string,
    attendanceId: string,
    clockIn: string
  ) => {
    const normalizedCoachId = normalizeGuid(coachId);
    const normalizedEventId = normalizeGuid(eventId);
    const normalizedAttendanceId = normalizeGuid(attendanceId);
    if (!normalizedCoachId || !normalizedEventId || !normalizedAttendanceId) {
      return;
    }

    const confirmedRecord = {
      axm365_eventcoachattendanceid: normalizedAttendanceId,
      axm365_name: `${coachName ?? "Coach"} - ${new Date(clockIn).toLocaleDateString()}`,
      axm365_clockin: clockIn,
      _axm365_coach_value: normalizedCoachId,
      _axm365_event_value: normalizedEventId,
      statecode: 0,
    } as Axm365_eventcoachattendances;

    pendingCoachClockInsRef.current.set(
      normalizedAttendanceId,
      confirmedRecord
    );

    setCoachAttendances((current) => {
      const next = [
        confirmedRecord,
        ...current.filter(
          (item) =>
            normalizeGuid(item.axm365_eventcoachattendanceid) !==
            normalizedAttendanceId
        ),
      ];
      writeCoachAttendanceCache(
        getCoachScopedCacheOrgUrl(normalizedCoachId),
        normalizedCoachId,
        next
      );
      initialCoachAttendanceCacheRef.current = {
        cachedAt: Date.now(),
        attendances: next,
      };
      return next;
    });

    lastFetchedRef.current.coachAttendances = Date.now();
    resourceHasUsableDataRef.current.coachAttendances = true;
    setResourceErrors((current) => {
      if (!current.coachAttendances) return current;
      const next = { ...current };
      delete next.coachAttendances;
      return next;
    });
    setResourceStatus((current) => ({
      ...current,
      coachAttendances: "ready",
    }));
  }, [coachId, coachName, getCoachScopedCacheOrgUrl]);


  // ---------------------------------------------------------
  // REFRESH INVOICES
  // ---------------------------------------------------------

  const refreshInvoices = useCallback(() =>
    runResourceRefresh("invoices", "Loading invoices", async () => {
      const res = await InvoicesService.getAll({});
      const data = unwrapOrThrow<Invoices>(res);

      setInvoices(data);
      // Full invoice rows carry dozens of unused columns and can exceed the
      // mobile storage quota, leaving the next launch without invoices.
      writeCache(CACHE.invoices, data.map(compactInvoice));
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
      // Paged like Attendances: a single getAll stops at one server page.
      const data = (
        await fetchAllPages<Axm365_playereventperformances>((skipToken) =>
          Axm365_playereventperformancesService.getAll({
            select: PLAYER_PERFORMANCE_FIELDS,
            orderBy: ["axm365_playereventperformanceid asc"],
            ...(skipToken ? { skipToken } : {}),
          })
        )
      ).map(compactPlayerPerformance);

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

    clearBackgroundRetry("tasks");
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
          select: [
            "activityid",
            "subject",
            "description",
            "prioritycode",
            "scheduledend",
            "createdon",
            "statecode",
            "statuscode",
            "_regardingobjectid_value",
          ],
          filter: `statecode eq 0 and _regardingobjectid_value eq ${requestCoachId}`,
          orderBy: ["createdon desc"],
        });
        const data = unwrapOrThrow<Tasks>(res);

        // A response from a previous signed-in coach must never replace the
        // current coach's list if the account changed while this was queued.
        if (activeCoachIdRef.current !== requestCoachId) return;

        setTasks(data);
        writeTaskCache(
          getCoachScopedCacheOrgUrl(requestCoachId),
          requestCoachId,
          data
        );
        lastFetchedRef.current.tasks = Date.now();
        resourceHasUsableDataRef.current.tasks = true;
        backgroundRetryAttemptsRef.current.tasks = 0;
        setTasksError(null);
        setResourceStatus((current) => ({
          ...current,
          tasks: "ready",
        }));
      })
      .catch((err) => {
        if (activeCoachIdRef.current === requestCoachId) {
          console.error("[CoachPortal] Failed to load tasks:", err);
          if (hadUsableData) {
            setTasksError(null);
            scheduleBackgroundRetry("tasks", () => {
              const retryTasks = refreshTasksRef.current;
              if (retryTasks) void retryTasks().catch(() => {});
            });
          } else {
            const message = getErrorMessage(err, "Failed to load tasks.");
            setTasksError(message);
            setResourceErrors((current) => ({
              ...current,
              tasks: message,
            }));
          }
          setResourceStatus((current) => ({
            ...current,
            tasks: hadUsableData ? "stale" : "error",
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
  }, [
    clearBackgroundRetry,
    coachId,
    enqueueDataverse,
    getCoachScopedCacheOrgUrl,
    scheduleBackgroundRetry,
  ]);

  refreshTasksRef.current = refreshTasks;


  useEffect(() => {

    if (coachId) {
      const normalizedCoachId = normalizeGuid(coachId);
      activeCoachIdRef.current = normalizedCoachId;
      delete lastFetchedRef.current.tasks;

      const cached = readTaskCache(
        getCoachScopedCacheOrgUrl(normalizedCoachId),
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

  }, [
    coachId,
    coachLookupLoading,
    getCoachScopedCacheOrgUrl,
    refreshTasks,
  ]);


  useEffect(() => {
    if (coachId) {
      const normalizedCoachId = normalizeGuid(coachId);
      activeCoachIdRef.current = normalizedCoachId;
      delete lastFetchedRef.current.coachAttendances;
      pendingCoachClockInsRef.current.clear();

      const startupBootstrap = initialCoachBootstrapRef.current;
      const startupMatchesCoach =
        normalizeGuid(startupBootstrap?.coachId) === normalizedCoachId;
      const cached =
        readCoachAttendanceCache(
          getCoachScopedCacheOrgUrl(normalizedCoachId),
          normalizedCoachId
        ) ??
        (startupMatchesCoach
          ? initialCoachAttendanceCacheRef.current
          : null);
      resourceHasUsableDataRef.current.coachAttendances = cached !== null;
      setCoachAttendances(cached?.attendances ?? []);
      setResourceErrors((current) => {
        if (!current.coachAttendances) return current;
        const next = { ...current };
        delete next.coachAttendances;
        return next;
      });
      setResourceStatus((current) => ({
        ...current,
        coachAttendances: cached ? "ready" : "idle",
      }));
      void refreshCoachAttendances().catch(() => {});
    } else if (!coachLookupLoading) {
      activeCoachIdRef.current = null;
      initialCoachAttendanceCacheRef.current = null;
      pendingCoachClockInsRef.current.clear();
      resourceHasUsableDataRef.current.coachAttendances = true;
      setCoachAttendances([]);
      setResourceErrors((current) => {
        if (!current.coachAttendances) return current;
        const next = { ...current };
        delete next.coachAttendances;
        return next;
      });
      setResourceStatus((current) => ({
        ...current,
        coachAttendances: "ready",
      }));
    }
  }, [
    coachId,
    coachLookupLoading,
    getCoachScopedCacheOrgUrl,
    refreshCoachAttendances,
  ]);


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
      writeTaskCache(getCoachScopedCacheOrgUrl(coachId), coachId, next);
      return next;
    });
    lastFetchedRef.current.tasks = Date.now();
  }, [coachId, getCoachScopedCacheOrgUrl, runDataverseWrite]);


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
      ["coachAttendances", refreshCoachAttendances],
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
    refreshCoachAttendances,
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
      coachAttendances: refreshCoachAttendances,
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
      const isFresh =
        resourceStatusRef.current[resource] !== "stale" &&
        Date.now() - lastFetched < maxAgeMs;

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
    refreshCoachAttendances,
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
  // Stamp the cache with a stable environment/app identifier. Do not rely
  // only on dataverseOrgUrl because it can be unavailable in Power Apps
  // Mobile even when environmentId, appId, and user context are available.
  // ---------------------------------------------------------

  useEffect(() => {

    let cancelled = false;

    getContext()

      .then((ctx) => {

        if (cancelled) return;

        const orgUrl = getContextCacheEnvironmentKey(ctx);

        if (!orgUrl) return;

        dataverseOrgUrlRef.current = orgUrl;
        const contextEmail = (ctx.user.userPrincipalName ?? "")
          .trim()
          .toLowerCase();
        const contextUserKey = normalizeGuid(ctx.user.objectId) || contextEmail;
        guardianCacheUserKeyRef.current = contextUserKey || null;
        setGuardianCacheReady(Boolean(contextUserKey));

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

        if (!storedEnvironmentMatchesContext(previous, ctx) && hasCachedRows) {

          console.warn(
            "[CoachPortal] Cached data did not come from this environment — clearing it.",
            { cachedFrom: previous ?? "(unstamped)", now: orgUrl }
          );

          clearTableCaches();
          guardianContactCacheRef.current.clear();
          guardianTableCacheRef.current.clear();
          guardianContactInFlightRef.current.clear();
          guardianWarmupPendingRef.current.clear();

          (
            [
              "players",
              "events",
              "attendances",
              "invoices",
              "facilities",
              "performances",
              "generations",
              "generationsToCoaches",
            ] as DataResource[]
          ).forEach((resource) => {
            clearBackgroundRetry(resource);
            backgroundRetryAttemptsRef.current[resource] = 0;
          });

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
            coachAttendances: current.coachAttendances,
            invoices: "idle",
            facilities: "idle",
            performances: "idle",
            generations: "idle",
            generationsToCoaches: "idle",
            tasks: current.tasks,
          }));
          setResourceErrors((current) => ({
            ...(current.coachAttendances
              ? { coachAttendances: current.coachAttendances }
              : {}),
            ...(current.tasks ? { tasks: current.tasks } : {}),
          }));
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

  }, [clearBackgroundRetry]);


  // Cancel delayed retries when the provider unmounts.
  useEffect(() => () => {
    Object.values(backgroundRetryTimersRef.current).forEach((timer) => {
      if (timer !== undefined) window.clearTimeout(timer);
    });
    backgroundRetryTimersRef.current = {};
  }, []);


  // If connectivity returns, retry only resources that are currently showing
  // cached stale data. First-load failures remain explicit and user-driven.
  useEffect(() => {
    const handleOnline = () => {
      const staleResources = (
        Object.keys(resourceStatusRef.current) as DataResource[]
      ).filter(
        (resource) => resourceStatusRef.current[resource] === "stale"
      );

      staleResources.forEach((resource) => {
        backgroundRetryAttemptsRef.current[resource] = 0;
        clearBackgroundRetry(resource);
      });

      if (staleResources.length > 0) {
        void ensureFresh(staleResources, { force: true });
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [clearBackgroundRetry, ensureFresh]);


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

        const loadedResources = (
          Object.keys(resourceHasUsableDataRef.current) as DataResource[]
        ).filter(
          (resource) => resourceHasUsableDataRef.current[resource]
        );

        loadedResources.forEach((resource) => {
          if (resourceStatusRef.current[resource] === "stale") {
            backgroundRetryAttemptsRef.current[resource] = 0;
            clearBackgroundRetry(resource);
          }
        });

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
    clearBackgroundRetry,
    ensureFresh,
  ]);


  // ---------------------------------------------------------
  // LOGGED-IN USER → CONTACT → COACH
  // ---------------------------------------------------------

  const clearResolvedCoach = useCallback(() => {
    clearBackgroundRetry("tasks");
    clearBackgroundRetry("coachAttendances");
    backgroundRetryAttemptsRef.current.tasks = 0;
    backgroundRetryAttemptsRef.current.coachAttendances = 0;
    activeCoachIdRef.current = null;
    initialCoachAttendanceCacheRef.current = null;
    pendingCoachClockInsRef.current.clear();
    setCoachId(null);
    setLoggedInCoachId(null);
    resourceHasUsableDataRef.current.tasks = false;
    resourceHasUsableDataRef.current.coachAttendances = false;
    delete lastFetchedRef.current.tasks;
    delete lastFetchedRef.current.coachAttendances;
    setTasks([]);
    setCoachAttendances([]);
    setTasksError(null);
    setTasksLoading(true);
    setResourceErrors((current) => {
      if (!current.tasks && !current.coachAttendances) return current;
      const next = { ...current };
      delete next.tasks;
      delete next.coachAttendances;
      return next;
    });
    setResourceStatus((current) => ({
      ...current,
      tasks: "idle",
      coachAttendances: "idle",
    }));
  }, [clearBackgroundRetry]);

  const refreshCoach = useCallback(async () => {

    clearBackgroundRetry("tasks");
    clearBackgroundRetry("coachAttendances");
    backgroundRetryAttemptsRef.current.tasks = 0;
    backgroundRetryAttemptsRef.current.coachAttendances = 0;
    setError(null);
    const hadUsableCoach = Boolean(activeCoachIdRef.current);
    setCoachLookupLoading(!hadUsableCoach);
    setCoachLookupError(null);
    if (!hadUsableCoach) clearResolvedCoach();


    await runWithTransientRetries("Loading your account", () => getContext())

      .then(async (ctx) => {

        const orgUrl = getContextCacheEnvironmentKey(ctx);
        dataverseOrgUrlRef.current = orgUrl;

        const fullName =
          ctx.user.fullName;

        const email =
          ctx.user.userPrincipalName;

        const normalizedEmail = (email ?? "").trim().toLowerCase();
        const userKey = normalizeGuid(ctx.user.objectId) || normalizedEmail;
        guardianCacheUserKeyRef.current = userKey || null;
        setGuardianCacheReady(Boolean(orgUrl && userKey));

        // The bootstrap cache is intentionally read before getContext so the
        // first mobile render can use saved Coach attendance. As soon as the
        // current account is known, validate that hint and remove it if this
        // is a different environment or signed-in user.
        const startupBootstrap = initialCoachBootstrapRef.current;
        const bootstrapMatchesCurrentAccount = Boolean(
          startupBootstrap &&
            orgUrl &&
            userKey &&
            storedEnvironmentMatchesContext(startupBootstrap.orgUrl, ctx) &&
            startupBootstrap.userKey === userKey.trim().toLowerCase()
        );
        if (startupBootstrap && !bootstrapMatchesCurrentAccount) {
          initialCoachBootstrapRef.current = null;
          initialCoachAttendanceCacheRef.current = null;
          removeCoachBootstrapCache();
          clearResolvedCoach();
          setCoachLookupLoading(true);
        }


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

          initialCoachBootstrapRef.current = null;
          initialCoachAttendanceCacheRef.current = null;
          removeCoachBootstrapCache();
          clearResolvedCoach();

          setCoachLookupError(
            "Your signed-in account has no email address — a Coach record can't be matched."
          );

          setCoachLookupLoading(false);

          return;

        }


        let restoredCoachId: string | null = null;

        try {

          // Restore the last verified Coach for this exact Dataverse
          // organization and signed-in account. This is only a startup hint:
          // the live Contact → Coach lookup below still runs every launch.
          const cachedIdentity = readCoachIdentityCache(orgUrl, userKey);
          if (cachedIdentity) {
            restoredCoachId = cachedIdentity.coachId;
            initialCoachBootstrapRef.current = writeCoachBootstrapCache(
              orgUrl,
              userKey,
              restoredCoachId,
              fullName ?? initialCoachBootstrapRef.current?.coachName ?? null
            );
            activeCoachIdRef.current = restoredCoachId;
            setCoachId(restoredCoachId);
            setLoggedInCoachId(restoredCoachId);
            setCoachLookupError(null);
            setCoachLookupLoading(false);
          }


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

            removeCoachIdentityCache(orgUrl, userKey);
            removeCoachBootstrapCache();
            initialCoachBootstrapRef.current = null;
            initialCoachAttendanceCacheRef.current = null;
            clearResolvedCoach();
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

            removeCoachIdentityCache(orgUrl, userKey);
            removeCoachBootstrapCache();
            initialCoachBootstrapRef.current = null;
            initialCoachAttendanceCacheRef.current = null;
            clearResolvedCoach();
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

          if (!resolvedCoachId) {
            throw new Error("The linked Coach record has no valid id.");
          }

          writeCoachIdentityCache(orgUrl, userKey, resolvedCoachId);
          initialCoachBootstrapRef.current = writeCoachBootstrapCache(
            orgUrl,
            userKey,
            resolvedCoachId,
            fullName ?? contact.fullname ?? null
          );

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

          if (restoredCoachId || activeCoachIdRef.current) {
            // Keep usable saved identity and its Coach-scoped Task cache.
            // A temporary validation failure must not blank the application.
            setCoachLookupError(null);
          } else {
            setCoachLookupError(
              err instanceof Error
                ? err.message
                : "Failed to look up your Coach record."
            );
          }

          setCoachLookupLoading(false);

        }

      })


      .catch((err) => {

        console.error(
          "[CoachPortal] Failed to get logged-in user:",
          err
        );

        if (activeCoachIdRef.current) {
          setCoachLookupError(null);
        } else {
          setCoachLookupError(
            err instanceof Error
              ? err.message
              : "Failed to load your account information."
          );
        }

        setCoachLookupLoading(false);

      });

  }, [clearBackgroundRetry, clearResolvedCoach, enqueueDataverse]);


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
      resourceStatus[resource] === "stale" ||
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

        guardianCacheReady,

        coachLookupLoading,

        coachLookupError,

        isBackOffice,

        rolesLoaded,

        loggedInCoachId,

        players,

        events,

        attendances,

        coachAttendances,

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

        hasStaleResources,

        getResourceError,

        refreshPlayers,

        refreshEvents,

        refreshAttendances,

        refreshCoachAttendances,

        refreshInvoices,

        refreshFacilities,

        refreshPerformances,

        refreshGenerations,

        refreshGenerationsToCoaches,

        refreshCoach,

        refreshTasks,

        recordCoachClockIn,

        recordPlayerAttendances,

        ensureFresh,

        completeTask,

        runDataverseRead,

        getCachedGuardianContact,

        getGuardianContact,

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
