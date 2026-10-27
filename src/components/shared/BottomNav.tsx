import React from "react";
import { Home, Calendar, ClipboardCheck, Users, CircleDollarSign, type LucideIcon } from "lucide-react";
import { COLORS } from "../../constants/design";
import type { ScreenId } from "../../types/navigation";

interface NavItem {
  id: ScreenId;
  icon: LucideIcon;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "calendar", icon: Calendar, label: "Calendar" },
  { id: "attendance", icon: ClipboardCheck, label: "Attend" },
  { id: "players", icon: Users, label: "Squad" },
  { id: "invoices", icon: CircleDollarSign, label: "Fees" },
];

export const BottomNav: React.FC<{ active: ScreenId; onChange: (id: ScreenId) => void }> = ({ active, onChange }) => (
  <div
    style={{
      position: "sticky",
      bottom: 0,
      background: "rgba(251,247,238,0.92)",
      backdropFilter: "blur(12px)",
      borderTop: `1px solid ${COLORS.line}`,
      padding: "10px 12px max(18px, env(safe-area-inset-bottom))",
      display: "flex",
      justifyContent: "space-around",
      zIndex: 40,
    }}
  >
    {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
      const isActive = active === id;
      return (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: "4px 6px",
            color: isActive ? COLORS.navy : COLORS.mute,
            position: "relative",
          }}
        >
          {isActive && (
            <span style={{ position: "absolute", top: -10, width: 28, height: 3, background: COLORS.yellow, borderRadius: 2 }} />
          )}
          <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {label}
          </span>
        </button>
      );
    })}
  </div>
);
