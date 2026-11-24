import { describe, expect, it, vi } from "vitest";
import {
  makeReceiptOnceSender,
  type ReceiptRpcClient,
} from "@/lib/purchaseOrderReceiptSupabaseAdapter";

const request = {
  p_order_id: "po-1",
  p_received_items: [{ product_id: "product-1", quantity: 2 }],
  p_receipt_id: "00000000-0000-4000-8000-000000000001",
  p_notes: null,
};

describe("Inactive Supabase idempotent receipt adapter", () => {
  it("calls only the reviewed UUID-based RPC with exact payload", async () => {
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>().mockResolvedValue({ error: null });
    const sender = makeReceiptOnceSender({ rpc });
    await expect(sender(request)).resolves.toEqual({ committed: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("receive_purchase_order_once", request);
    expect(request.p_received_items).toEqual([{ product_id: "product-1", quantity: 2 }]);
  });

  it("rejects SQL/RLS errors so the outbox retains the UUID", async () => {
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>().mockResolvedValue({
      error: { message: "Conflit de rejeu", code: "23505" },
    });
    await expect(makeReceiptOnceSender({ rpc })(request)).rejects.toThrow("Conflit de rejeu");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("receive_purchase_order_once");
  });

  it("rejects missing responses and transport failures without fallback", async () => {
    const noResponse = vi.fn<ReceiptRpcClient["rpc"]>().mockResolvedValue(undefined as never);
    await expect(makeReceiptOnceSender({ rpc: noResponse })(request)).rejects.toThrow("sans réponse");
    expect(noResponse).toHaveBeenCalledTimes(1);
    const failing = vi.fn<ReceiptRpcClient["rpc"]>().mockRejectedValue(new Error("offline"));
    await expect(makeReceiptOnceSender({ rpc: failing })(request)).rejects.toThrow("offline");
    expect(failing).toHaveBeenCalledTimes(1);
    expect(noResponse.mock.calls[0][0]).toBe("receive_purchase_order_once");
    expect(failing.mock.calls[0][0]).toBe("receive_purchase_order_once");
  });

  it("prevents caller-side mutation from altering the request passed to RPC", async () => {
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>().mockResolvedValue({ error: null });
    await makeReceiptOnceSender({ rpc })(request);
    const sent = rpc.mock.calls[0][1];
    expect(sent.p_received_items).not.toBe(request.p_received_items);
    expect(sent.p_received_items[0]).not.toBe(request.p_received_items[0]);
  });
});
