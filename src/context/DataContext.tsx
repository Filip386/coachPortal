/* eslint-disable */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
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
import type { Cr9be_players } from "../generated/models/Cr9be_playersModel";
import type { Axm365_events } from "../generated/models/Axm365_eventsModel";
import type { Axm365_eventattendances } from "../generated/models/Axm365_eventattendancesModel";
import type { Invoices } from "../generated/models/InvoicesModel";
import type { Axm365_playereventperformances } from "../generated/models/Axm365_playereventperformancesModel";
import type { Axm365_generations } from "../generated/models/Axm365_generationsModel";
import type { Axm365_generationstocoacheses } from "../generated/models/Axm365_generationstocoachesesModel";
import {
  unwrapOrThrow,
  unwrap,
  fetchAllPages,
  fetchFacilities,
} from "../utils/dataverse";
import type { Facility } from "../utils/dataverse";
import type { Cr9be_coachs } from "../generated/models/Cr9be_coachsModel";
import { prefetchPlayerPhotos } from "../utils/photoCache";

interface DataContextValue {
  coachName: string | null;
  coachId: string | null;
  players: Cr9be_players[];
  events: Axm365_events[];
  attendances: Axm365_eventattendances[];
  invoices: Invoices[];
  facilities: Facility[];
  performances: Axm365_playereventperformances[];
  allGenerations: Axm365_generations[];
  generationsToCoaches: Axm365_generationstocoacheses[];
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

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [coachName, setCoachName] = useState<string | null>(null);
  const [loggedInCoachId, setLoggedInCoachId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Cr9be_players[]>(() =>
    readCache(CACHE.players)
  );
  const [events, setEvents] = useState<Axm365_events[]>(() =>
    readCache(CACHE.events)
  );
  const [attendances, setAttendances] = useState<Axm365_eventattendances[]>(
    () => readCache(CACHE.attendances)
  );
  const [invoices, setInvoices] = useState<Invoices[]>(() =>
    readCache(CACHE.invoices)
  );
  const [facilities, setFacilities] = useState<Facility[]>(() =>
    readCache(CACHE.facilities)
  );
  const [performances, setPerformances] = useState<
    Axm365_playereventperformances[]
  >(() => readCache(CACHE.performances));
  const [allGenerations, setAllGenerations] = useState<Axm365_generations[]>(
    () => readCache(CACHE.generations)
  );
  const [generationsToCoaches, setGenerationsToCoaches] = useState<
    Axm365_generationstocoacheses[]
  >(() => readCache(CACHE.generationsToCoaches));

  // loading = true only on very first open (nothing in cache)
  const hasCache =
    readCache(CACHE.players).length > 0 || readCache(CACHE.events).length > 0;
  const [loading, setLoading] = useState(!hasCache);
  const [error, setError] = useState<string | null>(null);

  const refreshPlayers = useCallback(async () => {
    const data = await fetchAllPages<Cr9be_players>((skipToken) =>
      Cr9be_playersService.getAll({
        filter: "statecode eq 0",
        ...(skipToken ? { skipToken } : {}),
      })
    );
    setPlayers(data);
    writeCache(CACHE.players, data);
    // Fire-and-forget: warms the photo cache in the background so tapping into a
    // player is a cache hit instead of the moment their photo's first download happens.
    prefetchPlayerPhotos(
      data.map((p) => ({
        playerId: p.cr9be_playerid,
        pictureId: p.cr9be_pictureid,
        pictureVersion: p.cr9be_picture_timestamp,
      }))
    ).catch(() => {});
  }, []);

  const refreshEvents = useCallback(async () => {
    const res = await Axm365_eventsService.getAll({ top: 100 });
    const data = unwrapOrThrow<Axm365_events>(res);
    setEvents(data);
    writeCache(CACHE.events, data);
  }, []);

  const refreshAttendances = useCallback(async () => {
    const res = await Axm365_eventattendancesService.getAll({});
    const data = unwrapOrThrow<Axm365_eventattendances>(res);
    setAttendances(data);
    writeCache(CACHE.attendances, data);
  }, []);

  const refreshInvoices = useCallback(async () => {
    const res = await InvoicesService.getAll({});
    const data = unwrapOrThrow<Invoices>(res);
    setInvoices(data);
    writeCache(CACHE.invoices, data);
  }, []);

  const refreshFacilities = useCallback(async () => {
    const data = await fetchFacilities();
    setFacilities(data);
    writeCache(CACHE.facilities, data);
  }, []);

  const refreshPerformances = useCallback(async () => {
    const res = await Axm365_playereventperformancesService.getAll({});
    const data = unwrapOrThrow<Axm365_playereventperformances>(res);
    setPerformances(data);
    writeCache(CACHE.performances, data);
  }, []);

  const refreshGenerations = useCallback(async () => {
    const res = await Axm365_generationsService.getAll({
      filter: "statecode eq 0",
    });
    const data = unwrapOrThrow<Axm365_generations>(res);
    setAllGenerations(data);
    writeCache(CACHE.generations, data);
  }, []);

  const refreshGenerationsToCoaches = useCallback(async () => {
    const res = await Axm365_generationstocoachesesService.getAll({
      filter: "statecode eq 0",
    });
    const data = unwrapOrThrow<Axm365_generationstocoacheses>(res);
    setGenerationsToCoaches(data);
    writeCache(CACHE.generationsToCoaches, data);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshPlayers(),
      refreshEvents(),
      refreshAttendances(),
      refreshInvoices(),
      refreshFacilities(),
      refreshPerformances(),
      refreshGenerations(),
      refreshGenerationsToCoaches(),
    ]);
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

  useEffect(() => {
    setError(null);

    // Fetch logged-in user info, then resolve their coach record by ID
    getContext()
      .then(async (ctx) => {
        const fullName = ctx.user.fullName;
        const userId = ctx.user.objectId;
        console.log("[CoachPortal] Logged IN found:", userId);
        if (!fullName) return;
        setCoachName(fullName);
        const res = await Cr9be_coachsService.getAll({
          filter: "statecode eq 0",
        });

        const coaches = unwrap<Cr9be_coachs>(res);

        const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

        const match = coaches.find((coach) => {
           const fullCoachName = `${coach.cr9be_name ?? ""} ${
             coach.cr9be_surname ?? ""
           }`.trim();
          return norm(fullCoachName) === norm(fullName);
        });

        if (match) {
          console.log("[CoachPortal] Coach found:", match);
          console.log("[CoachPortal] Coach ID:", match.cr9be_coachid);

          setLoggedInCoachId(match.cr9be_coachid);
        }
        // Load coaches and find the one whose contact name matches the logged-in user
        try {
          const res = await Cr9be_coachsService.getAll({
            filter: "statecode eq 0",
          });
          const coaches = unwrap<Cr9be_coachs>(res);
          const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
          const match = coaches.find(
            (c) =>
              norm(c.cr9be_contactname) === norm(fullName) ||
              norm(`${c.cr9be_name ?? ""} ${c.cr9be_surname ?? ""}`.trim()) ===
                norm(fullName) ||
              norm(c.cr9be_name) === norm(fullName)
          );
          if (match) {
            console.log(
              "[CoachPortal] Matched coach:",
              match.cr9be_name,
              match.cr9be_coachid
            );
            setCoachId(match.cr9be_coachid);
          }
        } catch {}
      })
      .catch(() => {});

    // Priority: players + events first (home screen needs them)
    // Attendances deferred - not shown on home screen
    Promise.all([refreshPlayers(), refreshEvents(), refreshInvoices()])
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load data")
      )
      .finally(() => setLoading(false));

    // Attendances, facilities, performances, generations load in background after primary data
    refreshAttendances().catch(() => {});
    refreshFacilities().catch((err) => {
      console.error("[CoachPortal] Facilities load failed:", err);
    });
    refreshPerformances().catch(() => {});
    refreshGenerations().catch(() => {});
    refreshGenerationsToCoaches().catch(() => {});
  }, []);

  return (
    <DataContext.Provider
      value={{
        coachName,
        coachId,
        loggedInCoachId,
        players,
        events,
        attendances,
        invoices,
        facilities,
        performances,
        allGenerations,
        generationsToCoaches,
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
        refreshAll,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextValue => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
};
