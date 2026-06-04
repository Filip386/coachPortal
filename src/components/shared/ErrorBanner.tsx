import React from "react";
import { AlertCircle } from "lucide-react";
import { COLORS } from "../../constants/design";

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div style={{ margin: "12px 18px", background: "#FEF2F2", border: `1px solid ${COLORS.red}`, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
    <AlertCircle size={16} color={COLORS.red} strokeWidth={2} />
    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{message}</span>
    {onRetry && (
      <button
        onClick={onRetry}
        style={{ background: COLORS.red, color: "#fff", border: 0, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
      >
        Retry
      </button>
    )}
  </div>
);
