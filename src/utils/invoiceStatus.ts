import type { Invoices } from "../generated/models/InvoicesModel";

export type InvoiceStatus = "Overdue" | "Due Soon" | "Paid";

const PAID_STATE_CODES: unknown[] = [2, "2", "Paid"];
const PAID_STATUS_CODES: unknown[] = [100001, "100001"];

function isPaid(invoice: Invoices): boolean {
  const { statecode, statuscode } = invoice as unknown as { statecode?: unknown; statuscode?: unknown };
  return PAID_STATE_CODES.includes(statecode) || PAID_STATUS_CODES.includes(statuscode);
}

export function getInvoiceStatus(invoice: Invoices): InvoiceStatus {
  if (isPaid(invoice)) return "Paid";
  if (!invoice.duedate) return "Overdue";
  return new Date(invoice.duedate) < new Date() ? "Overdue" : "Due Soon";
}
