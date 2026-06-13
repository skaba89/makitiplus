/**
 * E2E : deux appareils modifient la même file offline/online.
 * Vérifie que mergeRemoteQueue applique les règles déterministes
 *   (status > attempts > last_write_wins)
 * et qu'aucun ID fantôme ne subsiste dans la sélection après merge.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender,
} from "@/lib/receiptDeliveryQueue";
import { mergeRemoteQueue } from "@/lib/receiptDeliveryConflict";
import type { ReceiptData } from "@/utils/receiptGenerator";
import type { QueuedDelivery } from "@/lib/receiptDeliveryQueue";

const sample = (n: string): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-04T10:00:00Z"),
  items: [{ product_name: "Riz", quantity: 1, unit_price: 500, total_price: 500 }],
  subtotal: 500, total: 500, paymentMethod: "cash",
  amountPaid: 500, change: 0, businessName: "B",
});

const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

describe("Multi-appareils — mergeRemoteQueue + zéro ghost ID", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("règles déterministes (sent > failed, attempts max, LWW)", () => {
    // Appareil A (local) : 3 entrées
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-M001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-M002"));
    enqueueOrSendReceipt("whatsapp", "+22461100003", sample("VNT-260504-M003"));
    const local = getQueue();
    const m1 = local.find((q) => q.saleNumber === "VNT-260504-M001")!;
    const m2 = local.find((q) => q.saleNumber === "VNT-260504-M002")!;
    const m3 = local.find((q) => q.saleNumber === "VNT-260504-M003")!;

    // Appareil B (remote) — modifications concurrentes
    const remote: QueuedDelivery[] = [
      // M001 : remote = sent (doit gagner — status_priority)
      { ...m1, status: "sent", attempts: 1, sent_at: new Date().toISOString() },
      // M002 : remote a + d'attempts mais même statut → remote gagne
      { ...m2, status: "failed", attempts: 4, last_error: "remote_err" },
      // M003 : remote inconnu → ajouté
      // + une entrée totalement nouvelle de B
      {
        client_uuid: "remote-new-uuid",
        saleNumber: "VNT-260504-M999",
        channel: "sms",
        phone: "+22461109999",
        payload: sample("VNT-260504-M999"),
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      },
    ];
    // M002 local : force attempts=2 (remote 4 doit gagner)
    m2.attempts = 2;
    m2.status = "failed";

    const report = mergeRemoteQueue([m1, m2, m3], remote);
    const byUuid = new Map(report.merged.map((e) => [e.client_uuid, e]));

    // M001 : statut sent gagne
    expect(byUuid.get(m1.client_uuid)?.status).toBe("sent");
    // M002 : remote attempts=4 gagne
    expect(byUuid.get(m2.client_uuid)?.attempts).toBe(4);
    expect(byUuid.get(m2.client_uuid)?.last_error).toBe("remote_err");
    // M003 : conservé sans modif (pas dans remote)
    expect(byUuid.get(m3.client_uuid)?.client_uuid).toBe(m3.client_uuid);
    // Entrée nouvelle de B ajoutée
    expect(byUuid.get("remote-new-uuid")?.saleNumber).toBe("VNT-260504-M999");
    // Compteurs
    expect(report.conflictsResolved).toBe(2);
    expect(report.addedFromRemote).toBe(1);
    // Logs par client_uuid présents
    expect(report.logs.map((l) => l.client_uuid).sort()).toEqual(
      [m1.client_uuid, m2.client_uuid].sort(),
    );
  });

  it("aucun ID fantôme dans la sélection après synchro distante", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260504-G001"));
    enqueueOrSendReceipt("sms",      "+22461100011", sample("VNT-260504-G002"));
    enqueueOrSendReceipt("whatsapp", "+22461100012", sample("VNT-260504-G003"));
    const before = getQueue();
    const g1 = before.find((q) => q.saleNumber === "VNT-260504-G001")!;
    const g2 = before.find((q) => q.saleNumber === "VNT-260504-G002")!;
    const g3 = before.find((q) => q.saleNumber === "VNT-260504-G003")!;

    render(<ReceiptDeliveryTrackingPanel />);
    // Sélectionne G1, G2, G3
    fireEvent.click(await screen.findByLabelText("select-VNT-260504-G001"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-G002"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-G003"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("3");

    // Appareil B envoie une file distante qui ne contient plus G3
    // (par ex. G3 supprimé sur l'autre device). Après merge, G3 reste
    // car local prime quand remote n'a rien — donc on simule une vraie
    // disparition : merge avec une remote contenant SEULEMENT G1, G2 modifiés.
    // On reproduit le scénario "G3 supprimé" via removeMany côté local
    // après une synchro qui ne renvoie pas G3.
    const remote = [
      { ...g1, status: "sent" as const, sent_at: new Date().toISOString(), attempts: 1 },
      { ...g2, status: "sent" as const, sent_at: new Date().toISOString(), attempts: 1 },
    ];
    act(() => {
      // mergeRemoteQueue conserve les locaux non présents dans remote (G3),
      // donc pour simuler une vraie purge cross-device, on remplace la file
      // par le résultat strict du remote (G3 retiré).
      (window as any).__malikiplus_mergeRemote(remote);
      // Simule la suppression de G3 sur l'autre appareil :
      const cur = JSON.parse(localStorage.getItem("malikiplus:receipt_delivery_queue") ?? "[]");
      localStorage.setItem(
        "malikiplus:receipt_delivery_queue",
        JSON.stringify(cur.filter((e: QueuedDelivery) => e.client_uuid !== g3.client_uuid)),
      );
    });

    // Attend que le refresh interval purge les IDs fantômes (G3)
    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    }, { timeout: 4000 });

    // Vérifie que la sélection persistée ne contient plus l'ID fantôme
    const persisted = JSON.parse(
      localStorage.getItem("malikiplus:receipt_delivery_selection") ?? "[]",
    );
    expect(persisted).not.toContain(g3.client_uuid);
    expect(persisted).toContain(g1.client_uuid);
    expect(persisted).toContain(g2.client_uuid);
  });
});
