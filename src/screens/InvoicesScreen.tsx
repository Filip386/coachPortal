/* eslint-disable */
import React, { useState } from "react";
import { Phone, Mail, RefreshCw } from "lucide-react";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner } from "../components/shared";
import { PillStat } from "../components/ui";
import { useData } from "../context/DataContext";
import { getInvoiceStatus } from "../utils/invoiceStatus";
import type { InvoiceStatus } from "../utils/invoiceStatus";

type InvoiceTab = InvoiceStatus;

interface InvoicesScreenProps {
  go: (id: ScreenId) => void;
}

export const InvoicesScreen: React.FC<InvoicesScreenProps> = ({ go }) => {
  const { invoices, loading, error, refreshInvoices } = useData();
  const [tab, setTab] = useState<InvoiceTab>("Overdue");
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = async () => {
    setRefreshing(true);
    await refreshInvoices().catch(() => {});
    setRefreshing(false);
  };

  const filtered = invoices.filter((inv) => getInvoiceStatus(inv) === tab);
  const overdueCount = invoices.filter((i) => getInvoiceStatus(i) === "Overdue").length;
  const dueSoonCount = invoices.filter((i) => getInvoiceStatus(i) === "Due Soon").length;
  const paidCount = invoices.filter((i) => getInvoiceStatus(i) === "Paid").length;
  const totalOutstanding = invoices
    .filter((i) => getInvoiceStatus(i) !== "Paid")
    .reduce((sum, i) => sum + (i.totalamount ?? 0), 0);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const btnGhost: React.CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.line}`,
    borderRadius: 10,
    padding: "7px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    color: COLORS.navy,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontStack,
  };

  return (
    <>
      <StatusBar />
      <ScreenHeader
        kicker="Current Cycle"
        title="Player Fees"
        onBack={() => go("home")}
        action={
          <button
            onClick={refreshData}
            disabled={refreshing}
            style={{ width: 38, height: 38, borderRadius: 12, background: "#fff", border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: refreshing ? "not-allowed" : "pointer" }}
          >
            <RefreshCw size={17} color={COLORS.navy} strokeWidth={2} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        }
      />

      {loading && invoices.length === 0 && <LoadingSpinner label="Loading invoices…" />}
      {error && invoices.length === 0 && <ErrorBanner message={error} onRetry={refreshData} />}

      {(!loading || invoices.length > 0) && (
        <>
          <div style={{ padding: "0 22px" }}>
            <div style={{ background: COLORS.navy, color: "#fff", borderRadius: 22, padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: -30, top: -30, width: 160, height: 160, background: COLORS.yellow, opacity: 0.16, borderRadius: "50%" }} />
              <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.22em", color: COLORS.yellow, fontWeight: 600, textTransform: "uppercase" }}>
                Total Outstanding
              </div>
              <div style={{ fontFamily: displayStack, fontSize: 40, fontWeight: 800, letterSpacing: "-0.025em", marginTop: 4, lineHeight: 1 }}>
                €{totalOutstanding.toLocaleString()}
                <span style={{ fontSize: 18, opacity: 0.6, fontWeight: 600 }}>.00</span>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
                <PillStat color={COLORS.red} label="Overdue" value={overdueCount} />
                <PillStat color={COLORS.yellow} label="Due Soon" value={dueSoonCount} />
                <PillStat color={COLORS.green} label="Paid" value={paidCount} />
              </div>
            </div>
          </div>

          <div style={{ padding: "20px 22px 0" }}>
            <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 99, padding: 4, display: "flex" }}>
              {(["Overdue", "Due Soon", "Paid"] as InvoiceTab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", background: tab === t ? COLORS.navy : "transparent", color: tab === t ? "#fff" : COLORS.navy, border: 0, borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "16px 22px 30px", display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>
                NO {tab.toUpperCase()} INVOICES
              </div>
            )}
            {filtered.map((inv) => {
              const name = inv.customeridname || inv.name || "Customer";
              const amount = inv.totalamount ?? 0;
              const dueDate = inv.duedate;
              const daysOverdue = dueDate ? Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000) : null;
              const status = getInvoiceStatus(inv);

              return (
                <div key={inv.invoiceid} style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderLeft: `3px solid ${status === "Overdue" ? COLORS.red : status === "Due Soon" ? COLORS.yellow : COLORS.green}`, borderRadius: 16, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: COLORS.cream, color: COLORS.navy, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: displayStack, fontWeight: 800, fontSize: 13 }}>
                        {getInitials(name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14 }}>{name}</div>
                        {inv.name && inv.name !== name && (
                          <div style={{ fontSize: 10.5, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.08em", marginTop: 1 }}>{inv.name}</div>
                        )}
                        {status === "Overdue" && daysOverdue !== null && daysOverdue > 0 && (
                          <div style={{ fontSize: 10.5, color: COLORS.red, fontFamily: monoStack, letterSpacing: "0.1em", fontWeight: 600, marginTop: 2 }}>
                            {daysOverdue} DAYS OVERDUE
                          </div>
                        )}
                        {dueDate && status !== "Overdue" && (
                          <div style={{ fontSize: 10.5, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em", marginTop: 2 }}>
                            DUE {new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 18, color: COLORS.navy }}>€{Number(amount).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em" }}>
                        {inv.description || inv.invoicenumber || "INVOICE"}
                      </div>
                    </div>
                  </div>

                  {status !== "Paid" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                      <button style={btnGhost}><Phone size={12} /> Call</button>
                      <button style={btnGhost}><Mail size={12} /> Email</button>
                      <button style={{ ...btnGhost, background: COLORS.navy, color: "#fff", border: "none", marginLeft: "auto" }}>
                        Send Reminder →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};
