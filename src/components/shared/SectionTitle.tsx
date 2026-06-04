import React from "react";
import { COLORS, displayStack, monoStack } from "../../constants/design";

export const SectionTitle: React.FC<{ eyebrow: string; title: string }> = ({ eyebrow, title }) => (
  <div>
    <div style={{ fontFamily: monoStack, fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600 }}>
      {eyebrow}
    </div>
    <div style={{ fontFamily: displayStack, fontSize: 20, fontWeight: 800, color: COLORS.navy, letterSpacing: "-0.015em", marginTop: 2 }}>
      {title}
    </div>
  </div>
);