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

  it("plusieurs reconnects (flushQueue successifs) n'envoient le ticket QU'UNE seule fois", () => {
    const r = makeReceipt("VNT-260502-0002");
    enqueueOrSendReceipt("whatsapp", "+221770000001", r);

    expect(pendingCount()).toBe(1);

    // 1er reconnect : 1 envoi attendu (sent OU failed selon l'env, mais la
    // garantie d'idempotence est que le statut passe de 'pending' à autre chose)
    flushQueue();
    expect(pendingCount()).toBe(0);
    const statusAfter1 = getQueue()[0].status;
    const attemptsAfter1 = getQueue()[0].attempts;
    expect(["sent", "failed"]).toContain(statusAfter1);

    // 2e reconnect — l'entrée n'est PLUS dans 'pending', donc rien n'est rejoué
    const r2 = flushQueue();
    expect(r2.sent).toBe(0);
    expect(getQueue()[0].attempts).toBe(attemptsAfter1); // pas de nouvelle tentative

    // 3e reconnect — idem
    const r3 = flushQueue();
    expect(r3.sent).toBe(0);
    expect(getQueue()[0].attempts).toBe(attemptsAfter1);
  });

  it("différents canaux (whatsapp + sms) pour la même vente sont des entrées distinctes", () => {
    const r = makeReceipt("VNT-260502-0003");
    enqueueOrSendReceipt("whatsapp", "+221770000002", r);
    enqueueOrSendReceipt("sms", "+221770000002", r);
    enqueueOrSendReceipt("whatsapp", "+221770000002", r); // doublon WA

    // Exactement 2 entrées (1 WA + 1 SMS), le 3e a renvoyé l'existant
    expect(getQueue()).toHaveLength(2);
    const channels = getQueue().map((q) => q.channel).sort();
    expect(channels).toEqual(["sms", "whatsapp"]);
  });

  it("simulation : 5 ventes offline + 3 reconnects → toutes traitées une seule fois", () => {
    for (let i = 1; i <= 5; i++) {
      enqueueOrSendReceipt("whatsapp", `+22177000000${i}`, makeReceipt(`VNT-260502-100${i}`));
    }
    expect(pendingCount()).toBe(5);

    // 3 reconnects successifs
    flushQueue();
    const attemptsSnapshot = getQueue().map((q) => q.attempts);
    flushQueue();
    flushQueue();

    // Aucune tentative supplémentaire au-delà du premier flush
    expect(getQueue().map((q) => q.attempts)).toEqual(attemptsSnapshot);
    expect(pendingCount()).toBe(0);
    // Toutes les entrées sont sorties de l'état 'pending'
    expect(getQueue().every((q) => q.status !== "pending")).toBe(true);
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
