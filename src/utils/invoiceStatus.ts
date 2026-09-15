/* eslint-disable */
import type { Invoices } from "../generated/models/InvoicesModel";

export type InvoiceStatus = "Overdue" | "Due Soon" | "Paid";

export function getInvoiceStatus(inv: Invoices): InvoiceStatus {
  const sc = (inv as any).statecode;
  const isPaid =
    sc === 2 || sc === "2" || sc === "Paid" ||
    (inv as any).statuscode === 100001 || (inv as any).statuscode === "100001";
  if (isPaid) return "Paid";
  const due = inv.duedate ? new Date(inv.duedate) : null;
  // Still open with no due date at all — there's no future date to justify
  // "Due Soon", so surface it as Overdue instead of silently hiding it.
  if (!due) return "Overdue";
  if (due < new Date()) return "Overdue";
  return "Due Soon";
}
