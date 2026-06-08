import React from "react";
import { Home, Calendar, ClipboardCheck, Users, CircleDollarSign } from "lucide-react";
import { COLORS } from "../../constants/design";
import type { ScreenId } from "../../types/navigation";

export const BottomNav: React.FC<{ active: ScreenId; onChange: (id: ScreenId) => void }> = ({ active, onChange }) => {
  const items: { id: ScreenId; icon: React.FC<{ size: number; strokeWidth: number }>; label: string }[] = [
    { id: "home", icon: Home as any, label: "Home" },
    { id: "calendar", icon: Calendar as any, label: "Calendar" },
    { id: "attendance", icon: ClipboardCheck as any, label: "Attend" },
    { id: "players", icon: Users as any, label: "Squad" },
    { id: "invoices", icon: CircleDollarSign as any, label: "Fees" },
  ];

  return (
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
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
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
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};