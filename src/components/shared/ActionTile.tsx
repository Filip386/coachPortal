import React from "react";
import { COLORS, displayStack, fontStack } from "../../constants/design";

interface ActionTileProps {
  color: string;
  text: string;
  icon: React.ElementType;
  title: string;
  sub: string;
  bordered?: boolean;
  onClick?: () => void;
}

export const ActionTile: React.FC<ActionTileProps> = ({ color, text, icon: Icon, title, sub, bordered, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: color,
      color: text,
      border: bordered ? `1px solid ${COLORS.line}` : "none",
      borderRadius: 18,
      padding: 16,
      textAlign: "left",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 24,
      minHeight: 110,
      fontFamily: fontStack,
    }}
  >
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: text === "#fff" ? "rgba(255,255,255,0.14)" : "rgba(11,27,61,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={17} color={text} strokeWidth={2} />
    </div>
    <div>
      <div style={{ fontFamily: displayStack, fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, fontWeight: 500 }}>{sub}</div>
    </div>
  </button>
);
