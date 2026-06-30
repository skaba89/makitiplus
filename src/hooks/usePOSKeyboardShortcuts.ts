import { useEffect } from "react";

interface KeyboardShortcutsConfig {
  /** Focus search bar */
  onFocusSearch: () => void;
  /** Open payment dialog */
  onOpenPayment: () => void;
  /** Clear cart (with confirmation handled externally) */
  onClearCart: () => void;
  /** Toggle between grid and list view */
  onToggleView: () => void;
  /** Toggle out-of-stock visibility */
  onToggleOutOfStock: () => void;
  /** Open barcode scanner */
  onOpenScanner: () => void;
  /** Whether cart has items (to gate some shortcuts) */
  hasCartItems: boolean;
  /** Whether payment dialog is already open (to avoid re-opening) */
  isPaymentOpen: boolean;
}

/**
 * POS keyboard shortcuts hook.
 *
 * Shortcuts:
 * - `/` or `Ctrl+K` → Focus search bar
 * - `F2`            → Open payment dialog
 * - `F4`            → Clear cart
 * - `F5`            → Toggle grid/list view
 * - `F6`            → Toggle out-of-stock visibility
 * - `F7`            → Open barcode scanner
 * - `Escape`        → Close dialogs / clear search
 *
 * All shortcuts are disabled when a text input/textarea is focused
 * (except Escape and function keys).
 */
export function usePOSKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const {
    onFocusSearch,
    onOpenPayment,
    onClearCart,
    onToggleView,
    onToggleOutOfStock,
    onOpenScanner,
    hasCartItems,
    isPaymentOpen,
  } = config;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Escape always works
      if (e.key === "Escape") {
        if (isTyping) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // Function keys always work (even when typing)
      if (e.key === "F2") {
        e.preventDefault();
        if (hasCartItems && !isPaymentOpen) {
          onOpenPayment();
        }
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        if (hasCartItems) {
          onClearCart();
        }
        return;
      }

      if (e.key === "F5") {
        e.preventDefault();
        onToggleView();
        return;
      }

      if (e.key === "F6") {
        e.preventDefault();
        onToggleOutOfStock();
        return;
      }

      if (e.key === "F7") {
        e.preventDefault();
        onOpenScanner();
        return;
      }

      // Shortcuts below are disabled when the user is typing in an input
      if (isTyping) return;

      // `/` or `Ctrl+K` → focus search
      if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        onFocusSearch();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onFocusSearch,
    onOpenPayment,
    onClearCart,
    onToggleView,
    onToggleOutOfStock,
    onOpenScanner,
    hasCartItems,
    isPaymentOpen,
  ]);
}
