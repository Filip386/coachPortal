import React from "react";
import { RefreshCw } from "lucide-react";
import { COLORS, monoStack } from "../../constants/design";

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = "Loading from Dataverse…" }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
    <RefreshCw size={22} color={COLORS.navy} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
    <span style={{ fontFamily: monoStack, fontSize: 11, letterSpacing: "0.18em", color: COLORS.mute, fontWeight: 600 }}>
      {label.toUpperCase()}
    </span>
  </div>
);
