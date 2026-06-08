import React, { useState, useEffect } from "react";
import { PhoneFrameContext } from "./context/PhoneFrameContext";
import { DataProvider } from "./context/DataContext";
import { BottomNav } from "./components/shared";
import {
  HomeScreen,
  AttendanceScreen,
  PerformanceScreen,
  InvoicesScreen,
  CalendarScreen,
  PlayersScreen,
  CreateEventScreen,
} from "./screens";
import type { ScreenId } from "./types/navigation";
import { COLORS, fontStack, displayStack, monoStack } from "./constants/design";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
};

const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<ScreenId>("home");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null);
  const isMobile = useIsMobile();

  const go = (id: ScreenId, playerId?: string, eventId?: string) => {
    setActiveNav(id);
    if (playerId !== undefined) setSelectedPlayerId(playerId);
    if (eventId !== undefined) setSelectedEventId(eventId);
  };

  const renderScreen = () => {
    switch (activeNav) {
      case "home":        return <HomeScreen go={go} />;
      case "attendance":  return <AttendanceScreen go={go} initialEventId={selectedEventId} />;
      case "performance": return <PerformanceScreen go={go} selectedPlayerId={selectedPlayerId} />;
      case "invoices":    return <InvoicesScreen go={go} />;
      case "calendar":    return <CalendarScreen go={go} />;
      case "players":     return <PlayersScreen go={go} />;
      case "create":      return <CreateEventScreen go={go} />;
      default:            return <HomeScreen go={go} />;
    }
  };

  /* Mobile: full-screen app */
  if (isMobile) {
    return (
      <div
        style={{
          background: COLORS.cream,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          fontFamily: fontStack,
        }}
      >
        <div style={{ flex: 1, overflowY: "auto" }}>
          {renderScreen()}
        </div>
        <BottomNav active={activeNav} onChange={go} />
      </div>
    );
  }

  /* Desktop / tablet: phone mockup  */
  return (
    <div
      style={{
        background: `linear-gradient(150deg, ${COLORS.navyDeep} 0%, #0f2050 55%, #162a5e 100%)`,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: fontStack,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient blobs */}
      <div style={{ position: "absolute", top: -180, right: -180, width: 580, height: 580, borderRadius: "50%", background: COLORS.yellow, opacity: 0.05, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -120, left: -120, width: 400, height: 400, borderRadius: "50%", background: COLORS.yellow, opacity: 0.035, pointerEvents: "none" }} />

      {/* Grid texture */}
      <svg style={{ position: "absolute", inset: 0, opacity: 0.045, pointerEvents: "none" }} width="100%" height="100%">
        <defs>
          <pattern id="bgGrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#FFD400" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGrid)" />
      </svg>

      {/* Branding — top left */}
      <div style={{ position: "absolute", top: 28, left: 36, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 900, color: COLORS.navy, fontSize: 12, letterSpacing: "-0.03em" }}>
          CVF
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontFamily: monoStack, fontSize: 9, letterSpacing: "0.22em", fontWeight: 600, textTransform: "uppercase" }}>
            Villarreal · Masters
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontFamily: fontStack, fontSize: 13, fontWeight: 700, marginTop: 1 }}>
            Coach Portal
          </div>
        </div>
      </div>

      {/* Phone frame */}
      <div
        ref={setFrameEl}
        style={{
          width: 390,
          height: "min(844px, calc(100vh - 64px))",
          minHeight: 600,
          background: COLORS.cream,
          borderRadius: 50,
          boxShadow: [
            "0 0 0 9px #08111f",
            "0 0 0 11px #172540",
            "0 80px 160px rgba(0,0,0,0.65)",
            "0 0 100px rgba(255,212,0,0.05)",
          ].join(", "),
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Dynamic island */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 122,
            height: 34,
            background: "#08111f",
            borderRadius: "0 0 24px 24px",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#172540" }} />
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#172540" }} />
        </div>

        {/* Side buttons decoration */}
        <div style={{ position: "absolute", left: -3, top: 110, width: 3, height: 34, background: "#08111f", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -3, top: 154, width: 3, height: 60, background: "#08111f", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -3, top: 224, width: 3, height: 60, background: "#08111f", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", right: -3, top: 154, width: 3, height: 88, background: "#08111f", borderRadius: "0 3px 3px 0" }} />

        {/* Screen content */}
        <PhoneFrameContext.Provider value={frameEl}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renderScreen()}
          </div>
          <BottomNav active={activeNav} onChange={go} />
        </PhoneFrameContext.Provider>
      </div>
    </div>
  );
};

const AppWithData: React.FC = () => (
  <DataProvider>
    <App />
  </DataProvider>
);

export default AppWithData;
