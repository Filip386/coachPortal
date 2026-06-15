/* eslint-disable */
import React, { useState, useMemo, useEffect } from "react";
import { MapPin, RefreshCw, Zap, Trophy, Activity, ChevronDown } from "lucide-react";
import { Axm365_eventsService } from "../generated/services/Axm365_eventsService";
import { Axm365_eventsaxm365_eventtype } from "../generated/models/Axm365_eventsModel";
import { COLORS } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, ErrorBanner } from "../components/shared";
import { Label, FakeInput, SuccessBanner } from "../components/ui";
import { useData } from "../context/DataContext";
import { lookupName } from "../utils/dataverse";

interface CreateEventScreenProps {
  go: (id: ScreenId) => void;
}

// Event types come straight from the Dataverse option set (4 values).
const prettyTypeName = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2");
const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  Training: Zap,
  TournamentMatch: Trophy,
  LeagueMatch: Trophy,
  FriendlyMatch: Activity,
};
const EVENT_TYPES = Object.entries(Axm365_eventsaxm365_eventtype).map(([code, name]) => ({
  code: Number(code),
  name,
  label: prettyTypeName(name),
  icon: TYPE_ICONS[name] ?? Activity,
}));

export const CreateEventScreen: React.FC<CreateEventScreenProps> = ({ go }) => {
  const { events, facilities: allFacilities, refreshEvents, refreshFacilities } = useData();
  const [typeCode, setTypeCode] = useState<number>(EVENT_TYPES[0]?.code ?? 216260000);
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("17:30");
  const [facilityId, setFacilityId] = useState<string>("");
  const [facilityName, setFacilityName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [loadingFacilities, setLoadingFacilities] = useState(false);

  const selectedTypeLabel = EVENT_TYPES.find((t) => t.code === typeCode)?.label ?? "Event";
  useEffect(() => {
    if (!titleEdited) setTitle(`${selectedTypeLabel} ${date}`);
  }, [selectedTypeLabel, date, titleEdited]);

  const facilities = useMemo(() => {
    if (allFacilities.length > 0) return allFacilities;
    const byId = new Map<string, string>();
    events.forEach((event) => {
      const id = event._axm365_facility_value;
      const name = lookupName(event, "axm365_facility");
      if (id && name && !byId.has(id)) byId.set(id, name);
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [allFacilities, events]);

  const handleRetryFacilities = async () => {
    setLoadingFacilities(true);
    setFacilitiesError(null);
    try {
      await refreshFacilities();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFacilitiesError(msg);
      console.error("[CoachPortal] Facilities retry failed:", msg);
    } finally {
      setLoadingFacilities(false);
    }
  };

  const handleCreate = async () => {
    // Always send a non-empty name — fall back to "<Type> <date>" if the field
    // is somehow blank, so the event is never created without a title.
    const finalTitle = title.trim() || `${selectedTypeLabel} ${date}`;
    setSuccess(false);
    try {
      setSaving(true);
      setError(null);
      await Axm365_eventsService.create({
        axm365_name: finalTitle,
        axm365_eventdate: `${date}T${time}:00`,
        axm365_eventtype: typeCode as any,
        ...(facilityId && { "axm365_Facility@odata.bind": `/equipments(${facilityId})` }),
      } as any);
      await refreshEvents().catch(() => {});
      setSuccess(true);
      setTimeout(() => { go("calendar"); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader kicker="New" title="Create Event" onBack={() => go("home")} />

      {error && <ErrorBanner message={error} />}
      {success && <SuccessBanner message="Event created successfully!" />}

      <div style={{ padding: "0 22px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <Label>Event Type</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {EVENT_TYPES.map(({ code, label, icon: I }) => {
              const active = typeCode === code;
              return (
                <button
                  key={code}
                  onClick={() => setTypeCode(code)}
                  style={{ background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: active ? "none" : `1px solid ${COLORS.line}`, borderRadius: 14, padding: "12px 8px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                >
                  <I size={18} color={active ? COLORS.yellow : COLORS.navy} strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Event Title</Label>
          <FakeInput value={title} onChange={(v) => { setTitle(v); setTitleEdited(true); }} placeholder="e.g. Tactical Training — Pressing" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <Label>Date</Label>
            <FakeInput value={date} onChange={setDate} type="date" />
          </div>
          <div>
            <Label>Time</Label>
            <FakeInput value={time} onChange={setTime} type="time" />
          </div>
        </div>

        <div>
          <Label>Location</Label>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "#fff",
                border: `1px solid ${COLORS.line}`,
                borderRadius: 14,
                fontSize: 14,
                color: facilityName ? COLORS.navy : COLORS.mute,
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                fontWeight: 500,
              }}
            >
              <MapPin size={18} color={facilityName ? COLORS.navy : COLORS.mute} strokeWidth={2} />
              <span style={{ flex: 1 }}>{facilityName || "Select facility location"}</span>
              <ChevronDown
                size={18}
                color={COLORS.navy}
                strokeWidth={2}
                style={{ transform: showDropdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              />
            </button>

            {showDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 8,
                  background: "#fff",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 14,
                  zIndex: 10,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  overflow: "hidden",
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {facilities.length === 0 ? (
                  <div style={{ padding: "12px 16px", textAlign: "center" }}>
                    {facilitiesError ? (
                      <>
                        <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>
                          Failed: {facilitiesError}
                        </div>
                        <button onClick={handleRetryFacilities} disabled={loadingFacilities}
                          style={{ fontSize: 12, color: COLORS.navy, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "4px 12px", cursor: "pointer" }}>
                          {loadingFacilities ? "Loading…" : "Retry"}
                        </button>
                      </>
                    ) : (
                      <div style={{ color: COLORS.mute, fontSize: 13 }}>
                        {loadingFacilities ? "Loading facilities…" : (
                          <>
                            No facilities found.{" "}
                            <button onClick={handleRetryFacilities}
                              style={{ fontSize: 12, color: COLORS.navy, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  facilities.map((facility) => {
                    const selected = facilityId === facility.id;
                    return (
                      <button
                        key={facility.id}
                        onClick={() => {
                          setFacilityId(facility.id);
                          setFacilityName(facility.name);
                          setShowDropdown(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          background: selected ? "#f0f0f0" : "transparent",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: 14,
                          color: COLORS.navy,
                          fontWeight: selected ? 600 : 400,
                          borderBottom: `1px solid ${COLORS.line}`,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f8f8f8";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = selected ? "#f0f0f0" : "transparent";
                        }}
                      >
                        {facility.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <button
          disabled={saving}
          onClick={handleCreate}
          style={{ marginTop: 6, background: saving ? COLORS.mute : COLORS.yellow, color: COLORS.navy, border: 0, padding: "16px 0", borderRadius: 14, fontSize: 14, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {saving && <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />}
          {saving ? "Creating…" : "Schedule Event →"}
        </button>
      </div>
    </>
  );
};