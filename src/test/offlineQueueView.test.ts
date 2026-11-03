import { describe, expect, it } from "vitest";
import { formatQueuedAmount, getQueuedSaleNumber, makeQueueCsv } from "@/lib/offlineQueueView";
import type { QueuedMutation } from "@/lib/offlineQueue";
const entry: QueuedMutation = {
  id: "test", table: "", operation: "RPC", rpcName: "create_sale_with_limit",
  organizationId: "org", userId: "user", createdAt: "2026-11-03T10:00:00Z",
  retryCount: 2, status: "failed", error: "Network down",
  data: { p_sale_number: "VTE-TEST", p_total_amount: 1000 },
};
describe("MKP-004 offline queue presentation", () => {
  it("extracts sale references and amounts without mutating input", () => {
    expect(getQueuedSaleNumber(entry)).toBe("VTE-TEST");
    expect(formatQueuedAmount(entry)).toContain("1");
  });
  it("exports the expected fields", () => {
    const csv = makeQueueCsv([entry]);
    expect(csv).toContain("VTE-TEST");
    expect(csv).toContain("Network down");
    expect(csv).toContain("retry_count");
  });
  it("guards against spreadsheet formula injection in export", () => {
    const csv = makeQueueCsv([{ ...entry, error: "=HYPERLINK(\"https://bad.example\")" }]);
    expect(csv).toContain("'=HYPERLINK");
  });
  it("escapes quotes and handles absent amount", () => {
    const csv = makeQueueCsv([{ ...entry, data: {}, error: 'bad "quote"' }]);
    expect(csv).toContain('bad ""quote""');
    expect(formatQueuedAmount({ ...entry, data: {} })).toBe("—");
  });
});
