import React, { useState, useEffect } from "react";
import { COLORS, monoStack } from "../../constants/design";

export const StatusBar: React.FC = () => {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
  <div
    style={{
      height: 44,
      paddingTop: 12,
      paddingLeft: 28,
      paddingRight: 28,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontFamily: monoStack,
      fontSize: 11,
      fontWeight: 700,
      color: COLORS.navy,
    }}
  >
    <span>{time}</span>
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ width: 14, height: 8, border: `1.2px solid ${COLORS.navy}`, borderRadius: 2, position: "relative" }}>
        <span style={{ position: "absolute", inset: 1, background: COLORS.navy, borderRadius: 1 }} />
      </span>
    </span>
  </div>
  );
};