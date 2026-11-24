/**
 * Supplier receipt cutover is explicitly OFF by default. Both deployment
 * approvals are required; never enable the new RPC from app/UI local state.
 */
export function isPoReceiptOnceEnabled(config: {
  VITE_PO_RECEIPT_ONCE_ENABLED?: string;
  VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED?: string;
}): boolean {
  return config.VITE_PO_RECEIPT_ONCE_ENABLED === "true"
    && config.VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED === "true";
}
