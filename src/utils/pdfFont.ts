/**
 * pdfFont.ts — Unicode font helper for jsPDF
 *
 * Provides `ensurePdfFont(doc)` which lazily loads Liberation Sans
 * (metric-compatible with Helvetica) and registers it in the jsPDF
 * Virtual File System so that French accented characters (é, è, ê, ë,
 * à, ù, ç, ô) and African language characters (ɛ, ɔ, ɲ, ŋ, etc.)
 * render correctly in generated PDFs.
 *
 * Architecture:
 *   - Font base64 data lives in separate files under ./fonts/ so that
 *     Vite can code-split them. They are only loaded when a PDF is
 *     actually generated (lazy / dynamic import).
 *   - A module-level flag prevents re-registering the font on the same
 *     jsPDF instance.
 *   - If font loading fails for any reason, we silently fall back to
 *     the default jsPDF Helvetica — the PDF still generates, just with
 *     potential missing glyphs for non-ASCII characters.
 *
 * Usage in PDF generators:
 *   ```ts
 *   import { ensurePdfFont, PDF_FONT_NAME } from "@/utils/pdfFont";
 *
 *   const doc = new jsPDF(...);
 *   await ensurePdfFont(doc);
 *   doc.setFont(PDF_FONT_NAME, "normal");   // replaces doc.setFont("helvetica", "normal")
 *   doc.setFont(PDF_FONT_NAME, "bold");     // replaces doc.setFont("helvetica", "bold")
 *   ```
 */

import type { jsPDF } from "jspdf";
import { logger } from "@/lib/logger";

// ─── Public constants ───────────────────────────────────────────────────────

/** Font family name to use with doc.setFont() after ensurePdfFont() succeeds. */
export const PDF_FONT_NAME = "LiberationSans";

/** Whether the Unicode font is available (false = using Helvetica fallback). */
let _fontAvailable = false;

// ─── Internal state ─────────────────────────────────────────────────────────

/** Track which jsPDF doc instances already have the font registered. */
const _registeredDocs = new WeakSet<jsPDF>();

/** Lazy-loaded font data — only resolved when ensurePdfFont is first called. */
let _fontDataPromise: Promise<{ regular: string; bold: string }> | null = null;

// ─── Font data loader ───────────────────────────────────────────────────────

/**
 * Loads the base64 font data via dynamic import.
 * This ensures the ~1 MB of font data is NOT included in the initial
 * application bundle — Vite creates a separate chunk that's loaded on demand.
 */
function loadFontData(): Promise<{ regular: string; bold: string }> {
  if (_fontDataPromise) return _fontDataPromise;

  _fontDataPromise = Promise.all([
    import("./fonts/liberationSansRegular").then((m) => m.LIBERATION_SANS_REGULAR),
    import("./fonts/liberationSansBold").then((m) => m.LIBERATION_SANS_BOLD),
  ]).then(([regular, bold]) => ({ regular, bold }));

  return _fontDataPromise;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Ensures the Unicode font is registered in the jsPDF Virtual File System.
 *
 * Call this once per jsPDF document before using `doc.setFont(PDF_FONT_NAME, ...)`.
 * It is safe to call multiple times on the same doc — subsequent calls are no-ops.
 *
 * If font loading fails (network error, corrupted data, etc.), the function
 * falls back gracefully: it sets `_fontAvailable = false` and the caller can
 * continue using the default "helvetica" font.
 *
 * @param doc - The jsPDF document instance
 * @returns true if the font was loaded and registered, false if using fallback
 */
export async function ensurePdfFont(doc: jsPDF): Promise<boolean> {
  // Already registered on this doc instance — fast path
  if (_registeredDocs.has(doc)) {
    return _fontAvailable;
  }

  try {
    const { regular, bold } = await loadFontData();

    // Add font files to jsPDF Virtual File System
    doc.addFileToVFS("LiberationSans-Regular.ttf", regular);
    doc.addFileToVFS("LiberationSans-Bold.ttf", bold);

    // Register fonts with jsPDF
    doc.addFont("LiberationSans-Regular.ttf", PDF_FONT_NAME, "normal");
    doc.addFont("LiberationSans-Bold.ttf", PDF_FONT_NAME, "bold");

    _registeredDocs.add(doc);
    _fontAvailable = true;

    return true;
  } catch (error) {
    logger.warn(
      "[pdfFont] Failed to load Unicode font, falling back to Helvetica:",
      error
    );
    _fontAvailable = false;
    return false;
  }
}

/**
 * Returns whether the Unicode font was successfully loaded.
 * Useful for deciding whether to use PDF_FONT_NAME or "helvetica".
 */
export function isFontAvailable(): boolean {
  return _fontAvailable;
}

/**
 * Returns the font family name to use with doc.setFont().
 * If the Unicode font is available, returns PDF_FONT_NAME ("LiberationSans").
 * Otherwise returns "helvetica" as a safe fallback.
 */
export function getFontName(): string {
  return _fontAvailable ? PDF_FONT_NAME : "helvetica";
}

/**
 * Sets the font on the document, using the Unicode font if available,
 * or falling back to the built-in font.
 *
 * @param doc - The jsPDF document instance
 * @param style - Font style: "normal" or "bold"
 */
export function setPdfFont(doc: jsPDF, style: "normal" | "bold" = "normal"): void {
  doc.setFont(getFontName(), style);
}

// ─── Text sanitization ─────────────────────────────────────────────────────

/**
 * Replaces characters that jsPDF's built-in fonts can't render with
 * safe ASCII equivalents. Use this as a preprocessing step when the
 * Unicode font is NOT available (fallback mode).
 *
 * When the Unicode font IS available, this is unnecessary — all characters
 * render correctly.
 */
export function sanitizeForPdfFallback(text: string): string {
  return text
    .replace(/[\u00A0\u202F]/g, " ") // non-breaking spaces → regular space
    .replace(/ɛ/g, "e")              // open E → e
    .replace(/ɛ/g, "E")              // open E uppercase → E
    .replace(/ɔ/g, "o")              // open O → o
    .replace(/Ɔ/g, "O")              // open O uppercase → O
    .replace(/ɲ/g, "ny")             // palatal nasal → ny
    .replace(/Ɲ/g, "Ny")             // palatal nasal uppercase → Ny
    .replace(/ŋ/g, "ng")             // eng → ng
    .replace(/Ŋ/g, "Ng");            // eng uppercase → Ng
}
