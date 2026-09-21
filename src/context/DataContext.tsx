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

import type { Cr9be_players } from "../generated/models/Cr9be_playersModel";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import type { Axm365_eventattendances } from "../generated/models/Axm365_eventattendancesModel";
import type { Axm365_eventcoachattendances } from "../generated/models/Axm365_eventcoachattendancesModel";
import { Axm365_eventcoachattendancesService } from "../generated/services/Axm365_eventcoachattendancesService";
import type { Invoices } from "../generated/models/InvoicesModel";
import type { Axm365_playereventperformances } from "../generated/models/Axm365_playereventperformancesModel";
import type { Axm365_generations } from "../generated/models/Axm365_generationsModel";
import type { Axm365_generationstocoacheses } from "../generated/models/Axm365_generationstocoachesesModel";

import {
  unwrapOrThrow,
  unwrap,
  fetchAllPages,
  fetchFacilities,
  fetchUserSecurityRoles,
  fetchOpenCoachTasks,
  completeCoachTask,
  fetchGuardianContacts,
} from "../utils/dataverse";

import type { Facility, CoachTask, GuardianContact } from "../utils/dataverse";
import type { Cr9be_coachs } from "../generated/models/Cr9be_coachsModel";
import { prefetchPlayerPhotos } from "../utils/photoCache";
import type { Contacts } from "../generated/models/ContactsModel";


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

  /** Open Task activities from the signed-in coach's Dataverse timeline
   *  (regarding their Coach record) — surfaced as in-app notifications. */
  tasks: CoachTask[];
  tasksLoading: boolean;
  /** Why the last notifications fetch failed (null when it succeeded). */
  tasksError: string | null;

  /** The signed-in coach's own clock-in records (Event Coach Attendances). */
  coachAttendances: Axm365_eventcoachattendances[];
  /** False until the first fetch has settled, so screens don't paint every
   *  event as "no clock-in" while the records are still loading. */
  coachAttendancesLoaded: boolean;

  /** Guardian (cr9be_member lookup) name + phone, keyed by that Contact's
   *  id — read straight from the Contact record rather than the player's
   *  own cr9be_membername field. */
  guardianContacts: Record<string, GuardianContact>;

  loading: boolean;
  loggedInCoachId: string | null;
  error: string | null;

  refreshPlayers: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  refreshAttendances: () => Promise<void>;
  refreshInvoices: () => Promise<void>;
  refreshFacilities: () => Promise<void>;
  refreshPerformances: () => Promise<void>;
  refreshGenerations: () => Promise<void>;
  refreshGenerationsToCoaches: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshCoachAttendances: () => Promise<void>;
  /** Marks the task Completed in Dataverse and drops it from the list.
   *  Throws (leaving the task in the list) if the update fails. */
  completeTask: (taskId: string) => Promise<void>;
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
  tasks: "cvf_tasks",
};


// Which Dataverse environment the cached rows above were fetched from.
// Deliberately NOT part of CACHE — it is a marker, not cached table data,
// and must survive the purge loop that clears the tables.
const CACHE_ENV_KEY = "cvf_cached_org_url";


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

  const [tasks, setTasks] = useState<CoachTask[]>(() =>
    readCache(CACHE.tasks)
  );

  const [tasksLoading, setTasksLoading] = useState(false);

  const [tasksError, setTasksError] = useState<string | null>(null);

  const [coachAttendances, setCoachAttendances] =
    useState<Axm365_eventcoachattendances[]>([]);

  const [coachAttendancesLoaded, setCoachAttendancesLoaded] = useState(false);

  const [guardianContacts, setGuardianContacts] = useState<Record<string, GuardianContact>>({});

  const guardianContactsRef = useRef<Record<string, GuardianContact>>({});


  // ---------------------------------------------------------
  // CACHE / LOADING
  //
  // Computed once (lazy useState initializer), not on every render — this
  // was previously a plain `const` recomputed from localStorage each
  // render. Once the first refresh populated the cache, that recomputed
  // value flipped from false to true, which changed the initial-load
  // effect's dependency and made it re-run a second time for no reason.
  // ---------------------------------------------------------

  const [hasCache] = useState(
    () =>
      readCache(CACHE.players).length > 0 ||
      readCache(CACHE.events).length > 0
  );

  const [loading, setLoading] = useState(!hasCache);

  const [error, setError] =
    useState<string | null>(null);


  // ---------------------------------------------------------
  // REFRESH PLAYERS
  // ---------------------------------------------------------

  const refreshPlayers = useCallback(async () => {

    const fetched = await fetchAllPages<Cr9be_players>((skipToken) =>
      Cr9be_playersService.getAll({
        filter: "statecode eq 0",
        ...(skipToken ? { skipToken } : {}),
      })
    );

    // Name A→Z for every screen that lists players (Attendance, My Players,
    // Performance). Done client-side with localeCompare so Cyrillic and
    // accented names sort correctly, and ties fall back to surname.
    const data = [...fetched].sort(
      (a, b) =>
        (a.cr9be_name ?? "").localeCompare(b.cr9be_name ?? "", undefined, { sensitivity: "base" }) ||
        (a.cr9be_surname ?? "").localeCompare(b.cr9be_surname ?? "", undefined, { sensitivity: "base" })
    );

    setPlayers(data);

    writeCache(CACHE.players, data);


    // Warm player photo cache in background
    prefetchPlayerPhotos(
      data.map((p) => ({
        playerId: p.cr9be_playerid,
        pictureId: p.cr9be_pictureid,
        pictureVersion: p.cr9be_picture_timestamp,
      }))
    ).catch(() => {});

  }, []);


  // ---------------------------------------------------------
  // REFRESH EVENTS
  // ---------------------------------------------------------

  const refreshEvents = useCallback(async () => {

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

  }, []);


  // ---------------------------------------------------------
  // REFRESH ATTENDANCES
  // ---------------------------------------------------------

  const refreshAttendances = useCallback(async () => {

    const res =
      await Axm365_eventattendancesService.getAll({});

    const data =
      unwrapOrThrow<Axm365_eventattendances>(res);

    setAttendances(data);

    writeCache(CACHE.attendances, data);

  }, []);


  // ---------------------------------------------------------
  // REFRESH INVOICES
  // ---------------------------------------------------------

  const refreshInvoices = useCallback(async () => {

    const res =
      await InvoicesService.getAll({});

    const data =
      unwrapOrThrow<Invoices>(res);

    setInvoices(data);

    writeCache(CACHE.invoices, data);

  }, []);


  // ---------------------------------------------------------
  // REFRESH FACILITIES
  // ---------------------------------------------------------

  const refreshFacilities = useCallback(async () => {

    const data =
      await fetchFacilities();

    setFacilities(data);

    writeCache(CACHE.facilities, data);

  }, []);


  // ---------------------------------------------------------
  // REFRESH PERFORMANCES
  // ---------------------------------------------------------

  const refreshPerformances = useCallback(async () => {

    const res =
      await Axm365_playereventperformancesService.getAll({});

    const data =
      unwrapOrThrow<Axm365_playereventperformances>(res);

    setPerformances(data);

    writeCache(CACHE.performances, data);

  }, []);


  // ---------------------------------------------------------
  // REFRESH GENERATIONS
  // ---------------------------------------------------------

  const refreshGenerations = useCallback(async () => {

    const res =
      await Axm365_generationsService.getAll({
        filter: "statecode eq 0",
      });

    const data =
      unwrapOrThrow<Axm365_generations>(res);

    setAllGenerations(data);

    writeCache(CACHE.generations, data);

  }, []);


  // ---------------------------------------------------------
  // REFRESH GENERATIONS TO COACHES
  // ---------------------------------------------------------

  const refreshGenerationsToCoaches = useCallback(async () => {

    const res =
      await Axm365_generationstocoachesesService.getAll({
        filter: "statecode eq 0",
      });

    const data =
      unwrapOrThrow<Axm365_generationstocoacheses>(res);

    setGenerationsToCoaches(data);

    writeCache(
      CACHE.generationsToCoaches,
      data
    );

  }, []);


  // ---------------------------------------------------------
  // REFRESH TASKS (coach timeline notifications)
  //
  // Depends on coachId, which resolves asynchronously (see the Contact →
  // Coach lookup effect below) — unlike the other refresh* functions this
  // is NOT part of refreshAll/the initial-load effect, since coachId is
  // usually still null at that point. It's instead triggered by its own
  // effect once coachId becomes available.
  // ---------------------------------------------------------

  const refreshCoachAttendances = useCallback(async () => {

    if (!coachId) return;

    try {

      const data = await fetchAllPages<Axm365_eventcoachattendances>((skipToken) =>
        Axm365_eventcoachattendancesService.getAll({
          filter: `_axm365_coach_value eq ${coachId} and statecode eq 0`,
          ...(skipToken ? { skipToken } : {}),
        })
      );

      setCoachAttendances(data);

    } finally {

      setCoachAttendancesLoaded(true);

    }

  }, [coachId]);


  const refreshTasks = useCallback(async () => {

    if (!coachId) return;

    setTasksLoading(true);

    try {

      const data = await fetchOpenCoachTasks(coachId);

      setTasks(data);

      setTasksError(null);

      writeCache(CACHE.tasks, data);

    } catch (err) {

      setTasksError(err instanceof Error ? err.message : "Failed to load notifications.");

      throw err;

    } finally {

      setTasksLoading(false);

    }

  }, [coachId]);


  const completeTask = useCallback(async (taskId: string) => {

    // Optimistic: the coach expects the task to disappear the moment they
    // tap "Mark done", not after a round trip. Re-fetching on failure would
    // just restore it if the update didn't actually go through.
    const previous = tasks;

    setTasks((cur) => cur.filter((t) => t.id !== taskId));

    try {

      await completeCoachTask(taskId);

      writeCache(CACHE.tasks, previous.filter((t) => t.id !== taskId));

    } catch (err) {

      setTasks(previous);

      throw err;

    }

  }, [tasks]);


  // ---------------------------------------------------------
  // REFRESH EVERYTHING
  //
  // Uses allSettled instead of all: a security role that simply isn't
  // granted read access to one table (e.g. a Basic coach without Invoices
  // access) must not break Home/Calendar/Attendance/Squad for that user —
  // Promise.all would reject the whole batch on that single failure and
  // surface a blocking "An unknown error occurred" banner even though the
  // other seven fetches succeeded fine. Only treat it as a real, app-wide
  // failure (and surface the error banner) when every single fetch failed,
  // which points to something fundamental (network/auth) rather than a
  // per-table permission gap.
  // ---------------------------------------------------------

  const refreshAll = useCallback(async () => {

    const results = await Promise.allSettled([
      refreshPlayers(),
      refreshEvents(),
      refreshAttendances(),
      refreshInvoices(),
      refreshFacilities(),
      refreshPerformances(),
      refreshGenerations(),
      refreshGenerationsToCoaches(),
    ]);

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    failures.forEach((f) =>
      console.error(
        "[CoachPortal] A background data refresh failed:",
        f.reason
      )
    );

    if (failures.length > 0 && failures.length === results.length) {

      const reason = failures[0].reason;

      setError(
        reason instanceof Error ? reason.message : "Failed to load data."
      );

      return;
    }

    setError(null);

  }, [
    refreshPlayers,
    refreshEvents,
    refreshAttendances,
    refreshInvoices,
    refreshFacilities,
    refreshPerformances,
    refreshGenerations,
    refreshGenerationsToCoaches,
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
          setTasks([]);
        }

        try {
          localStorage.setItem(CACHE_ENV_KEY, orgUrl);
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
  // INITIAL DATA LOAD
  //
  // IMPORTANT:
  // This effect is AFTER refreshAll so refreshAll already
  // exists when the effect is created.
  //
  // Runs once on mount and ALWAYS calls refreshAll() — even when cached
  // data already exists. Cached data (if any) renders immediately (see the
  // `loading` initializer above, which only blocks the UI when there is no
  // cache), and this revalidates it in the background so screens like Home
  // pick up changes made elsewhere without the user needing to restart the
  // app or pull-to-refresh manually. Each refresh* function already fetches
  // and writes its own entity independently (no wholesale clear), so this
  // stays a targeted refresh, not a full reload.
  // ---------------------------------------------------------

  useEffect(() => {

    let cancelled = false;


    const loadData = async () => {

      try {

        await refreshAll();

      } finally {

        if (!cancelled) {

          setLoading(false);

        }

      }

    };


    void loadData();


    return () => {

      cancelled = true;

    };

  }, [
    refreshAll,
  ]);


  // ---------------------------------------------------------
  // GUARDIAN CONTACTS (name + phone)
  //
  // Derived from whichever players are currently loaded rather than its own
  // refresh* function — there's no separate "refresh guardians" action a
  // screen would ever trigger; it just needs to stay in sync with players.
  // ---------------------------------------------------------

  useEffect(() => {

    // `players` gets a new array on every refresh (app open, resume, each
    // return to Home). Replacing the map each time meant a single failed or
    // partial lookup wiped guardian details that had already loaded — they
    // showed up, then vanished mid-session. So results are MERGED into what
    // is already known, and only guardians not yet loaded are requested.
    let cancelled = false;

    const missing = players
      .map((p) => p._cr9be_member_value)
      .filter((id): id is string => !!id && !guardianContactsRef.current[id]);

    if (missing.length === 0) return;

    fetchGuardianContacts(missing)
      .then((found) => {
        if (cancelled || Object.keys(found).length === 0) return;
        setGuardianContacts((prev) => {
          const next = { ...prev, ...found };
          guardianContactsRef.current = next;
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };

  }, [players]);


  // ---------------------------------------------------------
  // REFRESH TASKS ONCE THE COACH IS KNOWN
  //
  // Fires as soon as coachId resolves (right after the Contact → Coach
  // lookup below succeeds) rather than waiting on a manual screen visit,
  // so the notification bell's badge is already correct the first time a
  // coach lands on Home.
  // ---------------------------------------------------------

  useEffect(() => {

    if (!coachId) return;

    refreshTasks().catch(() => {});

    refreshCoachAttendances().catch(() => {});

  }, [coachId, refreshTasks, refreshCoachAttendances]);


  // ---------------------------------------------------------
  // REFRESH ON APP RESUME
  //
  // Covers the app being backgrounded and brought back to the foreground
  // (switching apps on mobile, switching browser tabs) without a full
  // relaunch — the initial-load effect above only ever runs once per
  // launch, so without this, data made stale while the app sat in the
  // background would otherwise only refresh if the user fully signed out
  // and back in.
  // ---------------------------------------------------------

  useEffect(() => {

    const handleVisibilityChange = () => {

      if (document.visibilityState === "visible") {

        refreshAll().catch(() => {});

        refreshTasks().catch(() => {});

        refreshCoachAttendances().catch(() => {});

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
    refreshAll,
    refreshTasks,
    refreshCoachAttendances,
  ]);


  // ---------------------------------------------------------
  // LOGGED-IN USER → CONTACT → COACH
  // ---------------------------------------------------------

  useEffect(() => {

    setError(null);


    withTimeout(getContext(), 20000, "Loading your account")

      .then(async (ctx) => {

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


        // -------------------------------------------------
        // Security role check (Back office vs Basic coach)
        // Independent of the Contact/Coach resolution below,
        // since Back office staff may not have a Coach record.
        //
        // IMPORTANT: fired WITHOUT awaiting here — it goes through the
        // generic Dataverse connector (a different, slower auth path than
        // the typed Contact/Coach services below), and this used to be
        // `await`-ed before the Contact → Coach lookup even started. On
        // mobile, where that connector call can take much longer (or hang)
        // than on browser, that blocked coachLookupLoading — and therefore
        // Clock In — for as long as the roles fetch took, even though
        // clocking in never needed the roles result at all.
        // -------------------------------------------------

        if (ctx.user.objectId) {

          fetchUserSecurityRoles(ctx.user.objectId)

            .then((roles) => {

              console.log("[CoachPortal] Security roles:", roles);

              const normalized = roles.map((r) => r.trim().toLowerCase());

              setIsBackOffice(normalized.some((r) => r.includes("back office")));

            })

            .catch((err) => {

              console.error("[CoachPortal] Failed to resolve security roles:", err);

              setIsBackOffice(false);

            })

            .finally(() => {

              setRolesLoaded(true);

            });

        } else {

          setRolesLoaded(true);

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

          const contactRes =
            await withTimeout(
              ContactsService.getAll({

                filter:
                  `emailaddress1 eq '${normalizedEmail}'`,

              }),
              20000,
              "Looking up your Contact record"
            );


          const contacts =
            unwrap<Contacts>(contactRes);


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


          const contactId =
            contact.contactid;


          console.log(
            "[CoachPortal] Contact found:",
            contactId,
            contact.fullname
          );


          // -------------------------------------------------
          // STEP 2:
          // Contact → Coach
          // -------------------------------------------------

          const coachRes =
            await withTimeout(
              Cr9be_coachsService.getAll({

                filter: "statecode eq 0",

              }),
              20000,
              "Looking up your Coach record"
            );


          const coaches =
            unwrap<Cr9be_coachs>(coachRes);


          const coach =
            coaches.find(
              (c) =>
                (c as any)._cr9be_contact_value
                  ?.toLowerCase() ===
                contactId?.toLowerCase()
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

          setCoachId(
            coach.cr9be_coachid
          );

          setLoggedInCoachId(
            coach.cr9be_coachid
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

  }, []);


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

        coachAttendances,

        coachAttendancesLoaded,

        guardianContacts,

        loading,

        error,

        refreshPlayers,

        refreshEvents,

        refreshAttendances,

        refreshInvoices,

        refreshFacilities,

        refreshPerformances,

        refreshGenerations,

        refreshGenerationsToCoaches,

        refreshTasks,

        refreshCoachAttendances,

        completeTask,

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