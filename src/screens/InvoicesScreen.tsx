/* eslint-disable */
import React, { useState, useMemo, useEffect } from "react";
import { RefreshCw, ChevronDown, User, Search } from "lucide-react";
import { COLORS, displayStack, fontStack, monoStack } from "../constants/design";
import type { ScreenId } from "../types/navigation";
import { StatusBar, ScreenHeader, LoadingSpinner, ErrorBanner } from "../components/shared";
import { PillStat } from "../components/ui";
import { useData } from "../context/DataContext";
import { getInvoiceStatus } from "../utils/invoiceStatus";
import { lookupName } from "../utils/dataverse";

interface InvoicesScreenProps {
  go: (id: ScreenId) => void;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

// The contact an invoice is billed to. The display name usually arrives as the
// OData formatted-value annotation, not the plain *name field. Keyed by id when
// available so the same contact groups together across invoices.
const fmtVal = (inv: any, key: string): string | undefined =>
  inv[`${key}@OData.Community.Display.V1.FormattedValue`];
const invoiceContact = (inv: any): { key: string; name: string } => {
  const id = (inv._contactid_value as string) || (inv._customerid_value as string) || (inv.customerid as string) || "";
  const name =
    lookupName(inv, "contactid") ||
    lookupName(inv, "customerid") ||
    fmtVal(inv, "_customerid_value") ||
    fmtVal(inv, "customerid") ||
    inv.name ||
    "Unknown";
  return { key: id || `name:${norm(name)}`, name };
};

export const InvoicesScreen: React.FC<InvoicesScreenProps> = ({ go }) => {
  const { invoices, loading, error, refreshInvoices } = useData();
  const [selectedContactKey, setSelectedContactKey] = useState<string>("all");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = async () => {
    setRefreshing(true);
    await refreshInvoices().catch(() => {});
    setRefreshing(false);
  };

  // Only overdue invoices are shown.
  const overdueInvoices = useMemo(
    () => invoices.filter((inv) => getInvoiceStatus(inv) === "Overdue"),
    [invoices]
  );

  // TEMP DEBUG — shows which contact/customer fields the invoice actually has.
  useEffect(() => {
    if (overdueInvoices.length === 0) return;
    const s: any = overdueInvoices[0];
    const rel = Object.fromEntries(
      Object.entries(s).filter(([k]) => /contact|customer/i.test(k))
    );
    // eslint-disable-next-line no-console
    console.log("[INVOICE DEBUG] first overdue invoice contact/customer fields:", rel);
    // eslint-disable-next-line no-console
    console.log("[INVOICE DEBUG] all keys:", Object.keys(s));
  }, [overdueInvoices]);

  // Distinct contacts drawn from the overdue invoices themselves.
  const contacts = useMemo(() => {
    const byKey = new Map<string, string>();
    overdueInvoices.forEach((inv) => {
      const { key, name } = invoiceContact(inv);
      if (!byKey.has(key)) byKey.set(key, name);
    });
    return Array.from(byKey, ([key, name]) => ({ key, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [overdueInvoices]);

  const filtered =
    selectedContactKey === "all"
      ? overdueInvoices
      : overdueInvoices.filter((inv) => invoiceContact(inv).key === selectedContactKey);
  const totalOverdue = filtered.reduce((sum, i) => sum + (i.totalamount ?? 0), 0);

  const selectedContactName =
    selectedContactKey === "all"
      ? "All Contacts"
      : contacts.find((c) => c.key === selectedContactKey)?.name ?? "All Contacts";

  const contactOptions = [{ key: "all", name: "All Contacts" }, ...contacts].filter((opt) =>
    opt.name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const money = (n: number) => `${Number(n).toLocaleString()} MKD`;

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
              <div style={{ position: "absolute", right: -30, top: -30, width: 160, height: 160, background: COLORS.red, opacity: 0.16, borderRadius: "50%" }} />
              <div style={{ fontFamily: monoStack, fontSize: 10, letterSpacing: "0.22em", color: COLORS.yellow, fontWeight: 600, textTransform: "uppercase" }}>
                Overdue Total{selectedContactKey !== "all" ? ` · ${selectedContactName}` : ""}
              </div>
              <div style={{ fontFamily: displayStack, fontSize: 36, fontWeight: 800, letterSpacing: "-0.025em", marginTop: 4, lineHeight: 1 }}>
                {totalOverdue.toLocaleString()}
                <span style={{ fontSize: 16, opacity: 0.6, fontWeight: 600 }}> MKD</span>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
                <PillStat color={COLORS.red} label="Overdue" value={filtered.length} />
              </div>
            </div>
          </div>

          {/* Contact filter */}
          <div style={{ padding: "20px 22px 0" }}>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowContactDropdown(!showContactDropdown)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, fontSize: 14, color: COLORS.navy, fontFamily: fontStack, cursor: "pointer", textAlign: "left", fontWeight: 600 }}
              >
                <User size={17} color={COLORS.navy} strokeWidth={2} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedContactName}</span>
                <ChevronDown size={18} color={COLORS.navy} strokeWidth={2} style={{ transform: showContactDropdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </button>

              {showContactDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 320 }}>
                  <div style={{ padding: 8, borderBottom: `1px solid ${COLORS.line}` }}>
                    <div style={{ position: "relative" }}>
                      <Search size={14} color={COLORS.mute} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      <input
                        autoFocus
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Search contacts…"
                        style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontFamily: fontStack, fontSize: 13.5, color: COLORS.navy, outline: "none", boxSizing: "border-box", background: COLORS.cream }}
                      />
                    </div>
                  </div>
                  <div style={{ overflowY: "auto" }}>
                    {contactOptions.length === 0 && (
                      <div style={{ padding: 16, textAlign: "center", color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>NO CONTACTS FOUND</div>
                    )}
                    {contactOptions.map((opt) => {
                      const selected = selectedContactKey === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => { setSelectedContactKey(opt.key); setShowContactDropdown(false); setContactSearch(""); }}
                          style={{ width: "100%", padding: "12px 16px", background: selected ? "#f0f0f0" : "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14, color: COLORS.navy, fontWeight: selected ? 700 : 400, borderBottom: `1px solid ${COLORS.line}` }}
                        >
                          {opt.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: "16px 22px 30px", display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: COLORS.mute, fontFamily: monoStack, fontSize: 12, letterSpacing: "0.1em" }}>
                NO OVERDUE INVOICES
              </div>
            )}
            {filtered.map((inv) => {
              const name = invoiceContact(inv).name;
              const amount = inv.totalamount ?? 0;
              const dueDate = inv.duedate;
              const daysOverdue = dueDate ? Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000) : null;

              return (
                <div key={inv.invoiceid} style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderLeft: `3px solid ${COLORS.red}`, borderRadius: 16, padding: 14 }}>
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
                        {daysOverdue !== null && daysOverdue > 0 && (
                          <div style={{ fontSize: 10.5, color: COLORS.red, fontFamily: monoStack, letterSpacing: "0.1em", fontWeight: 600, marginTop: 2 }}>
                            {daysOverdue} DAYS OVERDUE
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: displayStack, fontWeight: 800, fontSize: 17, color: COLORS.navy }}>{money(amount)}</div>
                      <div style={{ fontSize: 10, color: COLORS.mute, fontFamily: monoStack, letterSpacing: "0.1em" }}>
                        {inv.description || inv.invoicenumber || "INVOICE"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};
