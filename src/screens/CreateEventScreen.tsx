/* eslint-disable */
import React, { useState } from "react";
import { MapPin, RefreshCw, Zap, Trophy, Activity } from "lucide-react";
import { Axm365_eventsService } from "../generated/services/Axm365_eventsService";
import { COLORS } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, ErrorBanner } from "../components/shared";
import { Label, FakeInput, SuccessBanner } from "../components/ui";

interface CreateEventScreenProps {
  go: (id: ScreenId) => void;
}

export const CreateEventScreen: React.FC<CreateEventScreenProps> = ({ go }) => {
  const [type, setType] = useState<string>("Training");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("17:30");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const TYPE_CODES: Record<string, number> = {
    Training: 216260000,
    Match: 216260001,
  };

  const handleCreate = async () => {
    if (!title.trim()) { setError("Please enter an event title."); return; }
    setSuccess(false);
    try {
      setSaving(true);
      setError(null);
      await Axm365_eventsService.create({
        axm365_name: title,
        axm365_eventdate: `${date}T${time}:00`,
        ...(TYPE_CODES[type] !== undefined && { axm365_eventtype: TYPE_CODES[type] as any }),
        ...(location.trim() && { axm365_description: location.trim() }),
      } as any);
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([{ name: "Training", icon: Zap }, { name: "Match", icon: Trophy }, { name: "Recovery", icon: Activity }] as const).map(({ name, icon: I }) => {
              const active = type === name;
              return (
                <button
                  key={name}
                  onClick={() => setType(name)}
                  style={{ background: active ? COLORS.navy : "#fff", color: active ? "#fff" : COLORS.navy, border: active ? "none" : `1px solid ${COLORS.line}`, borderRadius: 14, padding: "12px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                >
                  <I size={18} color={active ? COLORS.yellow : COLORS.navy} strokeWidth={2} />
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Event Title</Label>
          <FakeInput value={title} onChange={setTitle} placeholder="e.g. Tactical Training — Pressing" />
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
          <FakeInput icon={MapPin} value={location} onChange={setLocation} placeholder="Pitch / venue" />
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