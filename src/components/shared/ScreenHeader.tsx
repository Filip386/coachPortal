import React from "react";
import { ChevronLeft } from "lucide-react";
import { COLORS, displayStack, monoStack } from "../../constants/design";

interface ScreenHeaderProps {
  title: string;
  kicker?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, kicker, onBack, action }) => (
  <div style={{ padding: "8px 22px 18px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <button
        onClick={onBack}
        style={{ width: 38, height: 38, borderRadius: 12, background: "#fff", border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <ChevronLeft size={18} color={COLORS.navy} strokeWidth={2} />
      </button>
      {action}
    </div>
    {kicker && (
      <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600, marginBottom: 4 }}>
        {kicker}
      </div>
    )}
    <h1 style={{ fontFamily: displayStack, fontSize: 30, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.02em", lineHeight: 1.05, margin: 0 }}>
      {title}
    </h1>
  </div>
);