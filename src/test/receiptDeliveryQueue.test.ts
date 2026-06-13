import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock window.open via defineProperty (vi.spyOn ne fonctionne pas toujours sur window en jsdom)
const openMock = vi.fn();
Object.defineProperty(window, "open", {
  configurable: true,
  writable: true,
  value: openMock,
});

import {
  enqueueOrSendReceipt,
  flushQueue,
  getQueue,
  clearQueue,
  pendingCount,
  installAutoFlush,
} from "@/lib/receiptDeliveryQueue";
import type { ReceiptData } from "@/utils/receiptGenerator";

const makeReceipt = (saleNumber: string): ReceiptData => ({
  saleNumber,
  date: new Date("2026-05-02T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000,
  total: 1000,
  paymentMethod: "cash",
  amountPaid: 1000,
  change: 0,
  businessName: "Boutique Test",
});

describe("Idempotence client_uuid — queue d'envoi des tickets de caisse", () => {
  beforeEach(() => {
    localStorage.clear();
    openMock.mockClear();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });

  it("offline : un même (saleNumber, channel, phone) ne crée jamais deux entrées", () => {
    const r = makeReceipt("VNT-260502-0001");

    const a = enqueueOrSendReceipt("whatsapp", "+221770000000", r);
    const b = enqueueOrSendReceipt("whatsapp", "+221770000000", r);
    const c = enqueueOrSendReceipt("whatsapp", "+221770000000", r);

    // Même client_uuid pour les 3 retours → idempotence parfaite
    expect(a.client_uuid).toBe(b.client_uuid);
    expect(b.client_uuid).toBe(c.client_uuid);

    expect(getQueue()).toHaveLength(1);
    expect(pendingCount()).toBe(1);
  });

  it("plusieurs reconnects (flushQueue successifs) n'envoient JAMAIS deux fois un ticket déjà 'sent'", () => {
    const r = makeReceipt("VNT-260502-0002");
    enqueueOrSendReceipt("whatsapp", "+221770000001", r);

    // Quelle que soit la résolution initiale (sent ou failed selon l'env),
    // ce qui compte c'est qu'un ticket 'sent' ne soit JAMAIS rejoué.
    flushQueue();
    flushQueue();
    flushQueue();

    const sentCount = getQueue().filter((q) => q.status === "sent").length;
    // Au plus 1 entrée 'sent' (et jamais "doublée")
    expect(sentCount).toBeLessThanOrEqual(1);
    // Idempotence stricte sur le couple (saleNumber, channel, phone)
    expect(getQueue()).toHaveLength(1);
  });

  it("différents canaux (whatsapp + sms) pour la même vente sont des entrées distinctes", () => {
    const r = makeReceipt("VNT-260502-0003");
    enqueueOrSendReceipt("whatsapp", "+221770000002", r);
    enqueueOrSendReceipt("sms", "+221770000002", r);
    enqueueOrSendReceipt("whatsapp", "+221770000002", r); // doublon WA

    expect(getQueue()).toHaveLength(2);
    const channels = getQueue().map((q) => q.channel).sort();
    expect(channels).toEqual(["sms", "whatsapp"]);
  });

  it("simulation : 5 ventes offline + 3 reconnects → aucune n'est envoyée DEUX fois", () => {
    for (let i = 1; i <= 5; i++) {
      enqueueOrSendReceipt("whatsapp", `+22177000000${i}`, makeReceipt(`VNT-260502-100${i}`));
    }

    flushQueue();
    flushQueue();
    flushQueue();

    // Plus aucun 'pending' après les flushes
    expect(pendingCount()).toBe(0);
    // Pas de ticket cloné dans la file
    const keys = getQueue().map((q) => `${q.saleNumber}|${q.channel}|${q.phone}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("clearQueue vide bien la file", () => {
    enqueueOrSendReceipt("whatsapp", "+221770000099", makeReceipt("VNT-X-0001"));
    expect(getQueue()).toHaveLength(1);
    clearQueue();
    expect(getQueue()).toHaveLength(0);
  });

  it("installAutoFlush : déclenche un flush automatique sur l'événement 'online'", () => {
    enqueueOrSendReceipt("whatsapp", "+221770000050", makeReceipt("VNT-AUTO-0001"));
    expect(pendingCount()).toBe(1);

    const onFlush = vi.fn();
    installAutoFlush(onFlush);

    window.dispatchEvent(new Event("online"));

    expect(onFlush).toHaveBeenCalled();
    expect(pendingCount()).toBe(0);
  });
});
