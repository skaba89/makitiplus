import jsPDF from "jspdf";
import { format } from "date-fns";
import type { QueuedDelivery } from "./receiptDeliveryQueue";
import type { DeliveryDict } from "./receiptDeliveryI18n";

const escapeCSV = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const buildDiff = (q: QueuedDelivery): string => {
  // Diff lisible avant/après pour le journal
  const before = `pending(att=0)`;
  const after = `${q.status}(att=${q.attempts}${q.exhausted ? ",exhausted" : ""})`;
  return `${before} → ${after}`;
};

export const exportDeliveryLogCSV = (rows: QueuedDelivery[], dict: DeliveryDict) => {
  const headers = [
    "saleNumber", dict.channel, dict.recipient, dict.status,
    dict.attempts, "diff", "last_error", "created_at", "sent_at",
  ];
  const lines = rows.map((r) => [
    escapeCSV(r.saleNumber),
    escapeCSV(r.channel),
    escapeCSV(r.phone),
    escapeCSV(r.status),
    escapeCSV(r.attempts),
    escapeCSV(buildDiff(r)),
    escapeCSV(r.last_error ?? ""),
    escapeCSV(r.created_at),
    escapeCSV(r.sent_at ?? ""),
  ].join(","));
  const csv = "\uFEFF" + [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `journal_envois_tickets_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const exportDeliveryLogPDF = (rows: QueuedDelivery[], dict: DeliveryDict) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(dict.title, 10, 14);
  doc.setFontSize(9);
  doc.text(`${rows.length} ${dict.ticket}`, 10, 20);
  doc.text(format(new Date(), "yyyy-MM-dd HH:mm"), 180, 20, { align: "right" });

  let y = 28;
  doc.setFontSize(8);
  const headers = ["#", "Sale", dict.channel, dict.recipient, dict.status, dict.attempts, "Diff", "Err"];
  const cols = [10, 18, 50, 65, 95, 122, 138, 175];
  headers.forEach((h, i) => doc.text(h, cols[i], y));
  doc.line(10, y + 1, 200, y + 1);
  y += 5;

  rows.forEach((r, idx) => {
    if (y > 280) { doc.addPage(); y = 14; }
    const row = [
      String(idx + 1),
      r.saleNumber.slice(-10),
      r.channel === "whatsapp" ? "WA" : "SMS",
      r.phone.slice(0, 14),
      r.status,
      String(r.attempts),
      buildDiff(r).slice(0, 22),
      (r.last_error ?? "").slice(0, 18),
    ];
    row.forEach((c, i) => doc.text(c, cols[i], y));
    y += 4;
  });

  doc.save(`journal_envois_tickets_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
};
