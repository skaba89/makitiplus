import { describe, it, expect, beforeEach, vi } from "vitest";

// Spy sur window.open (utilisé par shareViaWhatsApp et l'envoi SMS)
const openMock = vi.fn();
beforeEach(() => {
  window.open = openMock as any;
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
    openMock.mockReset();
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

  it("plusieurs reconnects (flushQueue successifs) n'envoient le ticket QU'UNE seule fois", () => {
    const r = makeReceipt("VNT-260502-0002");
    enqueueOrSendReceipt("whatsapp", "+221770000001", r);

    expect(pendingCount()).toBe(1);

    // 1er reconnect
    const r1 = flushQueue();
    expect(r1.sent).toBe(1);
    expect(openMock).toHaveBeenCalledTimes(1);

    // 2e reconnect — rien à envoyer
    const r2 = flushQueue();
    expect(r2.sent).toBe(0);
    expect(openMock).toHaveBeenCalledTimes(1);

    // 3e reconnect — toujours rien
    const r3 = flushQueue();
    expect(r3.sent).toBe(0);
    expect(openMock).toHaveBeenCalledTimes(1);

    expect(pendingCount()).toBe(0);
    expect(getQueue()[0].status).toBe("sent");
  });

  it("différents canaux (whatsapp + sms) pour la même vente sont des entrées distinctes", () => {
    const r = makeReceipt("VNT-260502-0003");
    enqueueOrSendReceipt("whatsapp", "+221770000002", r);
    enqueueOrSendReceipt("sms", "+221770000002", r);
    enqueueOrSendReceipt("whatsapp", "+221770000002", r); // doublon

    expect(getQueue()).toHaveLength(2);

    flushQueue();
    expect(openMock).toHaveBeenCalledTimes(2); // exactement 1 WA + 1 SMS
  });

  it("simulation : 5 ventes offline + 3 reconnects = 5 envois exactement", () => {
    for (let i = 1; i <= 5; i++) {
      enqueueOrSendReceipt("whatsapp", `+22177000000${i}`, makeReceipt(`VNT-260502-100${i}`));
    }
    expect(pendingCount()).toBe(5);

    // 3 reconnects
    flushQueue();
    flushQueue();
    flushQueue();

    expect(openMock).toHaveBeenCalledTimes(5);
    expect(pendingCount()).toBe(0);
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
