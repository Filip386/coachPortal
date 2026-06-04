import React, { useState } from "react";
import { PhoneFrame, BottomNav } from "./components/shared";
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
import { COLORS, fontStack } from "./constants/design";

const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<ScreenId>("home");

  const go = (id: ScreenId) => setActiveNav(id);

  const screens: { id: ScreenId; node: React.FC<{ go: (id: ScreenId) => void }> }[] = [
    { id: "home", node: HomeScreen },
    { id: "attendance", node: AttendanceScreen },
    { id: "performance", node: PerformanceScreen },
    { id: "invoices", node: InvoicesScreen },
    { id: "calendar", node: CalendarScreen },
    { id: "players", node: PlayersScreen },
    { id: "create", node: CreateEventScreen },
  ];

  const CurrentScreen = screens.find((s) => s.id === activeNav)?.node ?? HomeScreen;

  return (
    <div
      style={{
        background: `radial-gradient(ellipse at top, #1a2c5c 0%, ${COLORS.navyDeep} 60%)`,
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 24px",
        fontFamily: fontStack,
      }}
    >
      <PhoneFrame label={`CVF Masters · ${activeNav}`}>
        <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <CurrentScreen go={go} />
          </div>
          <BottomNav active={activeNav} onChange={go} />
        </div>
      </PhoneFrame>
    </div>
  );
};

export default App;