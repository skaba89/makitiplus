import { useEffect } from "react";

interface KeyboardShortcutsConfig {
  /** Focus sur la barre de recherche */
  onFocusSearch: () => void;
  /** Ouvrir le dialogue de paiement */
  onOpenPayment: () => void;
  /** Vider le panier (confirmation gérée en externe) */
  onClearCart: () => void;
  /** Basculer entre la vue grille et liste */
  onToggleView: () => void;
  /** Basculer la visibilité des ruptures de stock */
  onToggleOutOfStock: () => void;
  /** Ouvrir le scanner de code-barres */
  onOpenScanner: () => void;
  /** Afficher le dialogue d'aide des raccourcis clavier */
  onShowHelp: () => void;
  /** Confirmer le paiement (Ctrl+Entrée quand le dialogue de paiement est ouvert) */
  onConfirmPayment: () => void;
  /** Augmenter la quantité du dernier article du panier */
  onIncrementLastItem: () => void;
  /** Diminuer la quantité du dernier article du panier */
  onDecrementLastItem: () => void;
  /** Si le panier contient des articles (pour conditionner certains raccourcis) */
  hasCartItems: boolean;
  /** Si le dialogue de paiement est déjà ouvert (pour éviter la réouverture) */
  isPaymentOpen: boolean;
}

/**
 * Hook des raccourcis clavier du POS.
 *
 * Raccourcis :
 * - `F1`             → Afficher l'aide des raccourcis clavier
 * - `/` ou `Ctrl+K`  → Focus sur la barre de recherche
 * - `F2`             → Ouvrir le dialogue de paiement
 * - `Ctrl+Entrée`    → Confirmer le paiement (quand le dialogue est ouvert)
 * - `F4`             → Vider le panier
 * - `F5`             → Basculer grille / liste
 * - `F6`             → Basculer visibilité ruptures de stock
 * - `F7`             → Ouvrir le scanner de code-barres
 * - `+` ou `=`       → Augmenter la quantité du dernier article du panier
 * - `-`              → Diminuer la quantité du dernier article du panier
 * - `Escape`         → Fermer les dialogues / effacer la recherche
 *
 * Tous les raccourcis sont désactivés quand un champ texte/textarea est focus
 * (sauf Escape, les touches de fonction et Ctrl+Entrée).
 */
export function usePOSKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const {
    onFocusSearch,
    onOpenPayment,
    onClearCart,
    onToggleView,
    onToggleOutOfStock,
    onOpenScanner,
    onShowHelp,
    onConfirmPayment,
    onIncrementLastItem,
    onDecrementLastItem,
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

      // Escape fonctionne toujours
      if (e.key === "Escape") {
        if (isTyping) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // F1 — Afficher l'aide des raccourcis (fonctionne toujours)
      if (e.key === "F1") {
        e.preventDefault();
        onShowHelp();
        return;
      }

      // F2 — Ouvrir le dialogue de paiement (fonctionne toujours)
      if (e.key === "F2") {
        e.preventDefault();
        if (hasCartItems && !isPaymentOpen) {
          onOpenPayment();
        }
        return;
      }

      // Ctrl+Entrée — Confirmer le paiement quand le dialogue est ouvert (fonctionne même en saisie)
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isPaymentOpen) {
          onConfirmPayment();
        }
        return;
      }

      // F4 — Vider le panier (fonctionne toujours)
      if (e.key === "F4") {
        e.preventDefault();
        if (hasCartItems) {
          onClearCart();
        }
        return;
      }

      // F5 — Basculer grille/liste (fonctionne toujours)
      if (e.key === "F5") {
        e.preventDefault();
        onToggleView();
        return;
      }

      // F6 — Basculer la visibilité des ruptures (fonctionne toujours)
      if (e.key === "F6") {
        e.preventDefault();
        onToggleOutOfStock();
        return;
      }

      // F7 — Ouvrir le scanner de code-barres (fonctionne toujours)
      if (e.key === "F7") {
        e.preventDefault();
        onOpenScanner();
        return;
      }

      // Les raccourcis ci-dessous sont désactivés quand l'utilisateur saisit dans un champ
      if (isTyping) return;

      // `/` ou `Ctrl+K` → focus recherche
      if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      // `+` ou `=` → Augmenter la quantité du dernier article
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (hasCartItems) {
          onIncrementLastItem();
        }
        return;
      }

      // `-` → Diminuer la quantité du dernier article
      if (e.key === "-") {
        e.preventDefault();
        if (hasCartItems) {
          onDecrementLastItem();
        }
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
    onShowHelp,
    onConfirmPayment,
    onIncrementLastItem,
    onDecrementLastItem,
    hasCartItems,
    isPaymentOpen,
  ]);
}
