/**
 * E2E : envoi WhatsApp échoue pendant l'offline → succès après reconnexion.
 * Vérifie qu'un même client_uuid ne crée jamais de doublon, même après
 * plusieurs reconnects successifs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enqueueOrSendReceipt,
  flushQueue,
  getQueue,
  clearQueue,
  setSender,
  retryOne,
  installAutoFlush,
} from "@/lib/receiptDeliveryQueue";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n = "VNT-260503-0001"): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-03T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000,
  total: 1000,
  paymentMethod: "cash",
  amountPaid: 1000,
  change: 0,
  businessName: "Boutique Test",
});

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
  window.dispatchEvent(new Event(v ? "online" : "offline"));
};

describe("ReceiptDeliveryQueue — échec offline → succès reconnexion (idempotence)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
    setSender(null);
  });

  afterEach(() => {
    setSender(null);
    setOnline(true);
  });

  it("WhatsApp échoue offline puis réussit après reconnexion sans doublon", () => {
    // Sender qui échoue tant que offline
    setSender((entry) => {
      if (!navigator.onLine) throw new Error("network_unavailable");
      // succès silencieux
      void entry;
    });

    // 1) Hors ligne : tentative auto à la création échoue
    setOnline(false);
    const r1 = enqueueOrSendReceipt("whatsapp", "+221770000001", sample(), "uuid-A");
    // En offline, isOnline() est false, donc pas de tentative immédiate → status pending
    expect(r1.status).toBe("pending");
    expect(getQueue().length).toBe(1);

    // 2) Premier flush manuel offline → échec
    flushQueue();
    let q = getQueue();
    expect(q[0].status).toBe("failed");
    expect(q[0].attempts).toBe(1);
    expect(q[0].last_error).toBe("network_unavailable");

    // 3) Re-enqueue avec MÊME saleNumber → renvoie l'entrée existante (pas de doublon)
    const r2 = enqueueOrSendReceipt("whatsapp", "+221770000001", sample(), "uuid-A");
    expect(r2.client_uuid).toBe(q[0].client_uuid);
    expect(getQueue().length).toBe(1);

    // 4) Reconnexion → flush automatique réussit
    setOnline(true);
    const result = flushQueue();
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    q = getQueue();
    expect(q[0].status).toBe("sent");
    expect(q[0].sent_at).toBeDefined();
    expect(q[0].last_error).toBeUndefined();

    // 5) Plusieurs reconnects supplémentaires → JAMAIS renvoyé
    for (let i = 0; i < 5; i++) {
      const r = flushQueue();
      expect(r.sent).toBe(0);
    }
    expect(getQueue().length).toBe(1);
    expect(getQueue().filter((q) => q.status === "sent").length).toBe(1);
  });

  it("retryOne() respecte l'idempotence : ne rejoue jamais une entrée déjà 'sent'", () => {
    setSender(() => { /* succès */ });
    setOnline(true);
    enqueueOrSendReceipt("whatsapp", "+221770000002", sample("VNT-260503-0002"));
    const uuid = getQueue()[0].client_uuid;
    expect(getQueue()[0].status).toBe("sent");
    const before = getQueue()[0].attempts;

    // Plusieurs retries manuels successifs
    retryOne(uuid);
    retryOne(uuid);
    retryOne(uuid);
    expect(getQueue()[0].attempts).toBe(before);
    expect(getQueue().length).toBe(1);
  });

  it("autoFlush déclenché par 'online' n'envoie qu'une seule fois", () => {
    let sendCalls = 0;
    setSender(() => {
      if (!navigator.onLine) throw new Error("offline");
      sendCalls += 1;
    });
    installAutoFlush();

    setOnline(false);
    enqueueOrSendReceipt("whatsapp", "+221770000003", sample("VNT-260503-0003"), "uuid-C");
    flushQueue(); // failed
    expect(sendCalls).toBe(0);

    // Reconnexions multiples
    setOnline(true);  // déclenche autoFlush → envoi
    setOnline(false);
    setOnline(true);  // ne doit PAS renvoyer
    setOnline(false);
    setOnline(true);

    expect(sendCalls).toBe(1);
    expect(getQueue().filter((q) => q.status === "sent").length).toBe(1);
  });
});
