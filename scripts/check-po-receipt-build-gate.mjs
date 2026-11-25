/**
 * Build-time safety interlock for the supplier receipt cutover.
 * Both Vite flags compile into the browser bundle, so a wrong build can
 * activate the new RPC before the database and old PWA clients are ready.
 * Only the build pipeline should hold the two additional NON-VITE attestations.
 */
import { fileURLToPath } from "node:url";

export function evaluateReceiptCutoverBuildGate(viteEnv, releaseEnv = {}) {
  const enabled = viteEnv.VITE_PO_RECEIPT_ONCE_ENABLED === "true";
  const approved = viteEnv.VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED === "true";

  if (!enabled && !approved) return { allowed: true, reason: "Legacy receipt flow retained" };
  if (!enabled || !approved) {
    return {
      allowed: false,
      reason: "Receipt cutover flags disagree: both VITE_PO_RECEIPT_ONCE_ENABLED and VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED must be true together",
    };
  }
  if (releaseEnv.PO_RECEIPT_SERVER_CUTOVER_VERIFIED !== "true") {
    return { allowed: false, reason: "Missing server cutover verification (PO_RECEIPT_SERVER_CUTOVER_VERIFIED)" };
  }
  if (releaseEnv.PO_RECEIPT_LEGACY_PWA_COMPAT_VERIFIED !== "true") {
    return { allowed: false, reason: "Missing old PWA compatibility verification (PO_RECEIPT_LEGACY_PWA_COMPAT_VERIFIED)" };
  }
  return { allowed: true, reason: "Explicit release attestations supplied; live readiness still requires external evidence" };
}

const launchedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (launchedDirectly) {
  const mode = process.argv[2] ?? "production";
  // Load Vite only when executed as a CLI; avoid esbuild in Vitest jsdom.
  const { loadEnv } = await import("vite");
  const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
  const result = evaluateReceiptCutoverBuildGate(viteEnv, process.env);
  if (!result.allowed) {
    console.error(`[po-receipt-cutover] BUILD BLOCKED: ${result.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`[po-receipt-cutover] ${result.reason}`);
  }
}
