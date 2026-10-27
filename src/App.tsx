import React, { useState, useEffect, useRef } from "react";
import { Smartphone, Maximize2 } from "lucide-react";
import { PhoneFrameContext } from "./context/PhoneFrameContext";
import { DataProvider } from "./context/DataContext";
import { BottomNav } from "./components/shared";
import {
  HomeScreen,
  AttendanceScreen,
  CoachAttendanceHistoryScreen,
  PerformanceScreen,
  InvoicesScreen,
  CalendarScreen,
  PlayersScreen,
  CreateEventScreen,
  NotificationsScreen,
} from "./screens";
import type { ScreenId } from "./types/navigation";
import { COLORS, fontStack, displayStack, monoStack } from "./constants/design";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const SCREENS_THAT_RESET_EVENT: ScreenId[] = ["attendance", "performance"];
const PHONE_BEZEL_COLOR = "#08111f";
const PHONE_DETAIL_COLOR = "#172540";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_MEDIA_QUERY).matches);
  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  return isMobile;
};

interface NavSnapshot {
  id: ScreenId;
  playerId: string | null;
  eventId: string | null;
}

const frameToggleButtonStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
  right: 24,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  fontFamily: fontStack,
  fontSize: 13,
  fontWeight: 600,
  background: COLORS.yellow,
  color: COLORS.navy,
  boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
};

const AmbientGlow: React.FC = () => (
  <>
    <div style={{ position: "absolute", top: -180, right: -180, width: 580, height: 580, borderRadius: "50%", background: COLORS.yellow, opacity: 0.05, pointerEvents: "none" }} />
    <div style={{ position: "absolute", bottom: -120, left: -120, width: 400, height: 400, borderRadius: "50%", background: COLORS.yellow, opacity: 0.035, pointerEvents: "none" }} />
  </>
);

const GridTexture: React.FC = () => (
  <svg style={{ position: "absolute", inset: 0, opacity: 0.045, pointerEvents: "none" }} width="100%" height="100%">
    <defs>
      <pattern id="bgGrid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#FFD400" strokeWidth="0.5" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGrid)" />
  </svg>
);

const Branding: React.FC = () => (
  <div style={{ position: "absolute", top: 28, left: 36, display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 900, color: COLORS.navy, fontSize: 12, letterSpacing: "-0.03em" }}>
      CVF
    </div>
    <div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontFamily: monoStack, fontSize: 9, letterSpacing: "0.22em", fontWeight: 600, textTransform: "uppercase" }}>
        Villarreal · Masters
      </div>
      <div style={{ color: "rgba(255,255,255,0.85)", fontFamily: fontStack, fontSize: 13, fontWeight: 700, marginTop: 1 }}>
        Coach App
      </div>
    </div>
  </div>
);

const DynamicIsland: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 122,
      height: 34,
      background: PHONE_BEZEL_COLOR,
      borderRadius: "0 0 24px 24px",
      zIndex: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    }}
  >
    <div style={{ width: 10, height: 10, borderRadius: "50%", background: PHONE_DETAIL_COLOR }} />
    <div style={{ width: 5, height: 5, borderRadius: "50%", background: PHONE_DETAIL_COLOR }} />
  </div>
);

const SideButtons: React.FC = () => (
  <>
    <div style={{ position: "absolute", left: -3, top: 110, width: 3, height: 34, background: PHONE_BEZEL_COLOR, borderRadius: "3px 0 0 3px" }} />
    <div style={{ position: "absolute", left: -3, top: 154, width: 3, height: 60, background: PHONE_BEZEL_COLOR, borderRadius: "3px 0 0 3px" }} />
    <div style={{ position: "absolute", left: -3, top: 224, width: 3, height: 60, background: PHONE_BEZEL_COLOR, borderRadius: "3px 0 0 3px" }} />
    <div style={{ position: "absolute", right: -3, top: 154, width: 3, height: 88, background: PHONE_BEZEL_COLOR, borderRadius: "0 3px 3px 0" }} />
  </>
);

const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<ScreenId>("home");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const navStackRef = useRef<NavSnapshot[]>([]);
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null);
  const [showFrame, setShowFrame] = useState(true);
  const isMobile = useIsMobile();

  const go = (id: ScreenId, playerId?: string, eventId?: string) => {
    const isNewScreen = id !== activeNav;
    if (isNewScreen) {
      navStackRef.current.push({ id: activeNav, playerId: selectedPlayerId, eventId: selectedEventId });
      window.history.pushState({ cvfNav: true }, "");
    }
    setActiveNav(id);
    if (playerId !== undefined) setSelectedPlayerId(playerId);
    if (eventId !== undefined) setSelectedEventId(eventId);
    else if (SCREENS_THAT_RESET_EVENT.includes(id)) setSelectedEventId(null);
  };

  const restorePreviousScreen = () => {
    const previous = navStackRef.current.pop();
    if (!previous) {
      setActiveNav("home");
      return;
    }
    setActiveNav(previous.id);
    setSelectedPlayerId(previous.playerId);
    setSelectedEventId(previous.eventId);
  };

  const goBack = () => {
    window.history.back();
  };

  useEffect(() => {
    const handlePopState = () => restorePreviousScreen();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const renderScreen = () => {
    switch (activeNav) {
      case "home":        return <HomeScreen go={go} />;
      case "attendance":  return <AttendanceScreen go={go} goBack={goBack} initialEventId={selectedEventId} />;
      case "coach-attendance": return <CoachAttendanceHistoryScreen go={go} goBack={goBack} />;
      case "performance": return <PerformanceScreen go={go} goBack={goBack} selectedPlayerId={selectedPlayerId} initialEventId={selectedEventId} />;
      case "invoices":    return <InvoicesScreen go={go} goBack={goBack} />;
      case "calendar":    return <CalendarScreen go={go} goBack={goBack} />;
      case "players":     return <PlayersScreen go={go} goBack={goBack} />;
      case "create":      return <CreateEventScreen go={go} goBack={goBack} />;
      case "notifications": return <NotificationsScreen go={go} goBack={goBack} />;
      default:            return <HomeScreen go={go} />;
    }
  };

  const screenWithNav = (
    <>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {renderScreen()}
      </div>
      <BottomNav active={activeNav} onChange={go} />
    </>
  );

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
        {screenWithNav}
      </div>
    );
  }

  if (!showFrame) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: COLORS.cream, fontFamily: fontStack }}>
        {screenWithNav}
        <button style={frameToggleButtonStyle} onClick={() => setShowFrame(true)}>
          <Smartphone size={15} />
          Phone frame
        </button>
      </div>
    );
  }

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
      <AmbientGlow />
      <GridTexture />
      <Branding />

      <button style={frameToggleButtonStyle} onClick={() => setShowFrame(false)}>
        <Maximize2 size={15} />
        Full screen
      </button>

      <div
        ref={setFrameEl}
        style={{
          width: 390,
          height: "min(844px, calc(100vh - 64px))",
          minHeight: 600,
          background: COLORS.cream,
          borderRadius: 50,
          boxShadow: [
            `0 0 0 9px ${PHONE_BEZEL_COLOR}`,
            `0 0 0 11px ${PHONE_DETAIL_COLOR}`,
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
        <DynamicIsland />
        <SideButtons />

        <PhoneFrameContext.Provider value={frameEl}>
          {screenWithNav}
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
