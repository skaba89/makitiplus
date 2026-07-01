/**
 * Export PDF / Excel (CSV-UTF8 compatible Excel) des tickets sélectionnés,
 * orienté support client & audit : inclut l'historique complet.
 */
import { format } from "date-fns";
import type { QueuedDelivery } from "./receiptDeliveryQueue";
import type { DeliveryDict } from "./receiptDeliveryI18n";

const csvCell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const headersOf = (dict: DeliveryDict) => [
  "saleNumber",
  "client_uuid",
  dict.channel,
  dict.recipient,
  dict.status,
  dict.attempts,
  dict.createdAt,
  dict.sentAt,
  dict.nextRetryAt,
  dict.lastError,
];

const rowsOf = (rows: QueuedDelivery[]) =>
  rows.map((r) => [
    r.saleNumber,
    r.client_uuid,
    r.channel,
    r.phone,
    r.status,
    `${r.attempts}`,
    r.created_at,
    r.sent_at ?? "",
    r.next_retry_at ?? "",
    r.last_error ?? "",
  ]);

export const exportSelectedHistoryCSV = (rows: QueuedDelivery[], dict: DeliveryDict) => {
  // Séparateur ";" + BOM UTF-8 → ouvre proprement dans Excel (FR notamment)
  const data = [headersOf(dict), ...rowsOf(rows)]
    .map((r) => r.map(csvCell).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tickets_selection_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const exportSelectedHistoryPDF = async (rows: QueuedDelivery[], dict: DeliveryDict) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(`${dict.details} — ${rows.length} ${dict.ticket}`, 10, 14);
  doc.setFontSize(8);
  doc.text(format(new Date(), "yyyy-MM-dd HH:mm"), 280, 14, { align: "right" });

  let y = 22;
  rows.forEach((r, idx) => {
    if (y > 195) { doc.addPage(); y = 14; }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${idx + 1}. ${r.saleNumber}  ·  ${r.channel.toUpperCase()}  ·  ${r.status.toUpperCase()}`, 10, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 5;
    const lines: [string, string][] = [
      ["client_uuid", r.client_uuid],
      [dict.recipient, r.phone],
      [dict.attempts, `${r.attempts}`],
      [dict.createdAt, r.created_at],
      [dict.sentAt, r.sent_at ?? "—"],
      [dict.nextRetryAt, r.next_retry_at ?? "—"],
      [dict.lastError, (r.last_error ?? "—").slice(0, 180)],
    ];
    lines.forEach(([k, v]) => {
      doc.text(`${k}:`, 12, y);
      doc.text(String(v), 50, y);
      y += 4;
    });
    doc.setDrawColor(220);
    doc.line(10, y, 287, y);
    y += 3;
  });

  doc.save(`tickets_selection_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
};
