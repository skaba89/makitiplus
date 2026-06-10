/**
 * Perf : ReceiptDeliveryMergeLogPanel doit rester réactif avec une très
 * grande buffer (5 000 entrées). On vérifie :
 *  - rendu initial < 1500 ms
 *  - DOM borné par la pagination (≤ pageSize lignes rendues)
 *  - filtre/recherche < 800 ms
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ReceiptDeliveryMergeLogPanel } from "@/components/sync/ReceiptDeliveryMergeLogPanel";
import { recordMergeBatch, clearMergeLog } from "@/lib/receiptDeliveryMergeLog";

const N = 5000;

const seedHuge = () => {
  // Un seul batch — économise les writes localStorage.
  const conflicts = Array.from({ length: N - 50 }, (_, i) => ({
    client_uuid: `uuid-perf-${String(i).padStart(5, "0")}`,
    winner_source: (i % 2 === 0 ? "local" : "remote") as "local" | "remote",
    reason: `last_write_wins(${i}>${i - 1})`,
    local_status: "pending" as const,
    remote_status: "sent" as const,
  }));
  const ghosts = Array.from({ length: 50 }, (_, i) => `ghost-uuid-${i}`);
  recordMergeBatch({ conflicts, ghostsPurged: ghosts });
};

describe("ReceiptDeliveryMergeLogPanel — performance grandes buffers", () => {
  beforeEach(() => {
    localStorage.clear();
    clearMergeLog();
    seedHuge();
  });

  it(`rend ${N} entrées sous 1500ms et borne le DOM via pagination`, async () => {
    const t0 = performance.now();
    render(<ReceiptDeliveryMergeLogPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("ml-total")).toHaveTextContent(new RegExp(`${N} / ${N}`));
    });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(1500);

    // DOM borné : page-size par défaut = 50 → max 50 lignes affichées.
    const tbody = screen.getByTestId("ml-tbody");
    const rows = within(tbody).queryAllByTestId(/^ml-row-/);
    expect(rows.length).toBeLessThanOrEqual(50);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("filtre search reste rapide (< 800 ms) sur une grande buffer", async () => {
    render(<ReceiptDeliveryMergeLogPanel />);
    await screen.findByTestId("ml-total");
    const t0 = performance.now();
    fireEvent.change(screen.getByTestId("ml-search"), { target: { value: "perf-04321" } });
    await waitFor(() => {
      expect(screen.getByTestId("ml-total")).toHaveTextContent(/1 \//);
    });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(800);
  });
});
