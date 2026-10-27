import React from "react";
import { RefreshCw } from "lucide-react";
import { COLORS, fontStack } from "../../constants/design";

export const StaleDataNotice: React.FC = () => (
  <div
    role="status"
    style={{
      margin: "0 18px 12px",
      padding: "8px 11px",
      display: "flex",
      alignItems: "center",
      gap: 7,
      background: COLORS.yellowSoft,
      border: `1px solid ${COLORS.line}`,
      borderRadius: 12,
      color: COLORS.navy,
      fontFamily: fontStack,
      fontSize: 11.5,
      fontWeight: 600,
    }}
  >
    <RefreshCw size={13} strokeWidth={2} />
    <span>Showing saved data · Refresh pending</span>
  </div>
);
