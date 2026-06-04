import React from "react";
import { COLORS, fontStack, monoStack } from "../../constants/design";

export const PhoneFrame: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
    <div
      style={{
        width: 360,
        height: 740,
        background: COLORS.cream,
        borderRadius: 44,
        border: `2px solid ${COLORS.navy}`,
        boxShadow: "0 30px 60px -20px rgba(11,27,61,0.45), 0 10px 20px -10px rgba(11,27,61,0.25), inset 0 0 0 6px #fff",
        overflow: "hidden",
        position: "relative",
        fontFamily: fontStack,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          width: 110,
          height: 26,
          background: COLORS.navy,
          borderRadius: 16,
          zIndex: 50,
        }}
      />
      <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>{children}</div>
    </div>
    <div style={{ fontFamily: monoStack, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.navy, fontWeight: 600 }}>
      {label}
    </div>
  </div>
);