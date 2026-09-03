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
import { ContactsService } from "../generated/services/ContactsService";

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
import type { Contacts } from "../generated/models/ContactsModel";


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

  const [loggedInCoachId, setLoggedInCoachId] =
    useState<string | null>(null);

  const [coachId, setCoachId] =
    useState<string | null>(null);


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


  // ---------------------------------------------------------
  // CACHE / LOADING
  // ---------------------------------------------------------

  const hasCache =
    readCache(CACHE.players).length > 0 ||
    readCache(CACHE.events).length > 0;

  const [loading, setLoading] = useState(!hasCache);

  const [error, setError] =
    useState<string | null>(null);


  // ---------------------------------------------------------
  // REFRESH PLAYERS
  // ---------------------------------------------------------

  const refreshPlayers = useCallback(async () => {

    const data = await fetchAllPages<Cr9be_players>((skipToken) =>
      Cr9be_playersService.getAll({
        filter: "statecode eq 0",
        ...(skipToken ? { skipToken } : {}),
      })
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

    const res =
      await Axm365_eventsService.getAll({
        top: 100,
      });

    const data =
      unwrapOrThrow<Axm365_events>(res);

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
  // REFRESH EVERYTHING
  // ---------------------------------------------------------

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


  // ---------------------------------------------------------
  // INITIAL DATA LOAD
  //
  // IMPORTANT:
  // This effect is AFTER refreshAll so refreshAll already
  // exists when the effect is created.
  // ---------------------------------------------------------

  useEffect(() => {

    if (hasCache) {

      setLoading(false);

      return;
    }


    let cancelled = false;


    const loadInitialData = async () => {

      try {

        setLoading(true);

        await refreshAll();

      } catch (err) {

        console.error(
          "[CoachPortal] Initial data load failed:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load data."
        );

      } finally {

        if (!cancelled) {

          setLoading(false);

        }

      }

    };


    void loadInitialData();


    return () => {

      cancelled = true;

    };

  }, [
    hasCache,
    refreshAll,
  ]);


  // ---------------------------------------------------------
  // LOGGED-IN USER → CONTACT → COACH
  // ---------------------------------------------------------

  useEffect(() => {

    setError(null);


    getContext()

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


        // Make sure we have an email
        if (!email) {

          console.error(
            "[CoachPortal] No email found for logged-in user."
          );

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
            await ContactsService.getAll({

              filter:
                `emailaddress1 eq '${normalizedEmail}'`,

            });


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
            await Cr9be_coachsService.getAll({

              filter: "statecode eq 0",

            });


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

        } catch (err) {

          console.error(
            "[CoachPortal] Failed to resolve Contact → Coach:",
            err
          );

        }

      })


      .catch((err) => {

        console.error(
          "[CoachPortal] Failed to get logged-in user:",
          err
        );

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