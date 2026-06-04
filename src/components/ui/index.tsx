import React from "react";
import { COLORS, displayStack, fontStack, monoStack } from "../../constants/design";

export const Stat: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div>
    <div style={{ fontFamily: displayStack, fontSize: 22, fontWeight: 800, color: warn ? COLORS.yellow : "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
      {value}
    </div>
    <div style={{ fontFamily: monoStack, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.7, marginTop: 4, fontWeight: 600 }}>
      {label}
    </div>
  </div>
);

export const Divider: React.FC = () => (
  <div style={{ width: 1, background: "rgba(255,255,255,0.18)" }} />
);

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: COLORS.mute, fontWeight: 600, marginBottom: 8 }}>
    {children}
  </div>
);

export const Tally: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", padding: "10px 12px", borderRadius: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, background: color, borderRadius: 99 }} />
      <span style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.75, fontWeight: 600 }}>
        {label}
      </span>
    </div>
    <div style={{ fontFamily: displayStack, fontSize: 22, fontWeight: 800, marginTop: 4, lineHeight: 1 }}>{count}</div>
  </div>
);

interface MarkBtnProps {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  bg: string;
  dark?: boolean;
}

export const MarkBtn: React.FC<MarkBtnProps> = ({ children, active, onClick, bg, dark }) => (
  <button
    onClick={onClick}
    style={{
      width: 36,
      height: 36,
      borderRadius: 10,
      background: active ? bg : "#F3F0E5",
      border: active ? "none" : `1px solid ${COLORS.line}`,
      cursor: "pointer",
      display: "grid",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.15s",
      transform: active ? "scale(1.04)" : "scale(1)",
      color: active ? (dark ? COLORS.navy : "#fff") : COLORS.mute,
    }}
  >
    {children}
  </button>
);

export const SuccessBanner: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ margin: "12px 18px", background: COLORS.green, color: "#fff", borderRadius: 14, padding: "12px 16px", textAlign: "center", fontWeight: 600 }}>
    {message}
  </div>
);

export const PillStat: React.FC<{ color: string; label: string; value: string | number }> = ({ color, label, value }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, background: color, borderRadius: 99 }} />
      <span style={{ fontSize: 9.5, letterSpacing: "0.18em", fontFamily: monoStack, opacity: 0.8, fontWeight: 600, textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
    <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 22, marginTop: 3, lineHeight: 1 }}>{value}</div>
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; yellow?: boolean }> = ({ children, yellow }) => (
  <span
    style={{
      padding: "4px 9px",
      borderRadius: 99,
      background: yellow ? COLORS.yellowSoft : COLORS.cream,
      border: `1px solid ${yellow ? COLORS.yellow : COLORS.line}`,
      fontSize: 11,
      fontWeight: 600,
      color: COLORS.navy,
      fontFamily: monoStack,
      letterSpacing: "0.04em",
    }}
  >
    {children}
  </span>
);

export const AttributeBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "baseline" }}>
      <span style={{ fontSize: 12.5, color: COLORS.navy, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 14, color: COLORS.navy }}>{value}</span>
    </div>
    <div style={{ height: 8, background: "#F3F0E5", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: `linear-gradient(90deg, ${COLORS.navy}, ${COLORS.yellow})`, borderRadius: 99 }} />
    </div>
  </div>
);

export const FakeInput: React.FC<{
  value: string;
  onChange?: (v: string) => void;
  icon?: React.ElementType;
  type?: string;
  placeholder?: string;
}> = ({ value, onChange, icon: Icon, type: inputType, placeholder }) => (
  <div
    style={{
      background: "#fff",
      border: `1px solid ${COLORS.line}`,
      borderRadius: 14,
      padding: "13px 14px",
      fontSize: 13.5,
      fontWeight: 600,
      color: COLORS.navy,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    {Icon && <Icon size={15} color={COLORS.mute} strokeWidth={2} />}
    <input
      type={inputType || "text"}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{ border: 0, outline: 0, background: "transparent", fontFamily: fontStack, fontWeight: 600, fontSize: 13.5, color: COLORS.navy, width: "100%" }}
    />
  </div>
);