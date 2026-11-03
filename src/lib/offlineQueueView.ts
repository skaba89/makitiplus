import type { QueuedMutation } from "./offlineQueue";

export function getQueuedSaleNumber(row: QueuedMutation): string {
  const value = row.data.p_sale_number;
  return typeof value === "string" ? value : "";
}

export function formatQueuedAmount(row: QueuedMutation): string {
  const amount = row.data.p_total_amount ?? row.data.p_amount;
  return typeof amount === "number" && Number.isFinite(amount)
    ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)
    : "—";
}

// CSV cells must be quoted and protected against spreadsheet-formula injection.
function cell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function makeQueueCsv(rows: QueuedMutation[]): string {
  const header = ["sale_number", "rpc", "amount", "created_at", "status", "retry_count", "error"];
  return [header.map(cell).join(";"), ...rows.map(row => [
    getQueuedSaleNumber(row),
    row.rpcName ?? "",
    row.data.p_total_amount ?? row.data.p_amount ?? "",
    row.createdAt,
    row.status,
    row.retryCount,
    row.error ?? ""
  ].map(cell).join(";"))].join("\r\n");
}
