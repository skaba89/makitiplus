/**
 * E2E : sélection multiple de tickets pending/failed → bulk retry en offline
 * (échoue), puis bulk retry après reconnexion (réussit).
 * Garantit l'absence de doublons via client_uuid.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  enqueueOrSendReceipt,
  flushQueue,
  getQueue,
  clearQueue,
  setSender,
  retryMany,
} from "@/lib/receiptDeliveryQueue";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n: string): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-03T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000, total: 1000, paymentMethod: "cash",
  amountPaid: 1000, change: 0, businessName: "Boutique Test",
});

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
  window.dispatchEvent(new Event(v ? "online" : "offline"));
};

describe("Bulk retry — sélection multiple, offline puis reconnexion, sans doublon", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
    setOnline(false);
    // Sender qui échoue tant qu'on est offline
    setSender((entry) => {
      if (!navigator.onLine) throw new Error("network_unavailable");
      // succès silencieux quand online (no-op simulé)
      void entry;
    });
  });

  afterEach(() => {
    setSender(null);
    setOnline(true);
  });

  it("3 tickets sélectionnés → bulk retry offline échoue, après reconnexion réussit, aucun doublon", () => {
    // Crée 3 entrées en mode offline
    const a = enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260503-1001"));
    const b = enqueueOrSendReceipt("sms",       "+22461100002", sample("VNT-260503-1002"));
    const c = enqueueOrSendReceipt("whatsapp", "+22461100003", sample("VNT-260503-1003"));

    expect(getQueue()).toHaveLength(3);
    expect(a.status).toBe("pending");

    // Tentative bulk en offline → toutes failed
    const offlineResult = retryMany([a.client_uuid, b.client_uuid, c.client_uuid]);
    expect(offlineResult.sent).toBe(0);
    expect(offlineResult.failed).toBe(3);
    const afterOffline = getQueue();
    expect(afterOffline.every((q) => q.status === "failed")).toBe(true);

    // Reconnexion + plusieurs bulk retries successifs (simulent re-clic utilisateur)
    setOnline(true);
    const ids = [a.client_uuid, b.client_uuid, c.client_uuid];
    const r1 = retryMany(ids, { force: true });
    const r2 = retryMany(ids, { force: true }); // ne doit RIEN renvoyer (déjà sent)
    const r3 = retryMany(ids, { force: true });

    expect(r1.sent).toBe(3);
    expect(r2.sent).toBe(0); // déjà sent → skipped
    expect(r3.sent).toBe(0);

    // Aucun doublon : 3 entrées max, toutes 'sent', client_uuid uniques
    const final = getQueue();
    expect(final).toHaveLength(3);
    expect(final.every((q) => q.status === "sent")).toBe(true);
    const uuids = final.map((q) => q.client_uuid);
    expect(new Set(uuids).size).toBe(3);

    // Idempotence forte : impossible d'avoir deux entrées (saleNumber|channel|phone)
    const keys = final.map((q) => `${q.saleNumber}|${q.channel}|${q.phone}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("flushQueue après reconnexion couvre exactement les pending/failed sans dupliquer les sent", () => {
    enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260503-2001"));
    enqueueOrSendReceipt("whatsapp", "+22461100011", sample("VNT-260503-2002"));
    enqueueOrSendReceipt("sms",      "+22461100012", sample("VNT-260503-2003"));

    setOnline(true);
    flushQueue();
    flushQueue();
    flushQueue();

    const final = getQueue();
    expect(final).toHaveLength(3);
    expect(final.filter((q) => q.status === "sent")).toHaveLength(3);
    // Aucun client_uuid répété
    expect(new Set(final.map((q) => q.client_uuid)).size).toBe(3);
  });
});
