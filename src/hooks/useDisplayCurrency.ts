import { useState, useCallback, useEffect } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { getCurrencyByCode, formatPrice as formatPriceUtil, CurrencyConfig } from "@/utils/currencies";

/**
 * Hook pour gérer la devise d'affichage sélectionnée par l'utilisateur.
 * - Persiste le choix dans localStorage (par utilisateur)
 * - Convertit les montants de la devise org → devise d'affichage
 * - Formatage intelligent avec le symbole correct
 *
 * Usage :
 *   const { displayCurrency, setDisplayCurrency, formatDisplayPrice, isConverted } = useDisplayCurrency();
 *   // formatDisplayPrice(5000) → "33 FCFA" si displayCurrency = XOF et orgCurrency = GNF
 */

const STORAGE_KEY = "makitiplus_display_currency";

export interface DisplayCurrencyHook {
  /** Code ISO de la devise d'affichage (ex: "XOF") */
  displayCurrencyCode: string;
  /** Objet CurrencyConfig de la devise d'affichage */
  displayCurrency: CurrencyConfig;
  /** Code ISO de la devise org (référence) */
  orgCurrencyCode: string;
  /** true si displayCurrency != orgCurrency (conversion active) */
  isConverted: boolean;
  /** Change la devise d'affichage */
  setDisplayCurrency: (code: string) => void;
  /**
   * Convertit un montant depuis la devise org vers la devise d'affichage.
   * Retourne le montant original si la conversion échoue.
   */
  convertFromOrg: (amount: number) => number;
  /**
   * Convertit un montant depuis une devise arbitraire vers la devise d'affichage.
   */
  convertFrom: (amount: number, fromCurrency: string) => number;
  /**
   * Formate un montant (déjà dans la devise org) en devise d'affichage.
   * Si displayCurrency == orgCurrency, formate simplement.
   * Sinon convertit au taux réel et formate.
   */
  formatDisplayPrice: (amount: number, options?: { showOriginal?: boolean }) => string;
  /**
   * Formate un montant dans une devise arbitraire vers la devise d'affichage.
   */
  formatFromCurrency: (
    amount: number,
    fromCurrency: string,
    options?: { showOriginal?: boolean },
  ) => string;
  /** Taux de change bruts (Map code → taux vs USD) */
  exchangeRates: Record<string, number> | null;
  /** true si les taux sont en cours de chargement */
  ratesLoading: boolean;
  /** Rafraîchir les taux (force le re-fetch) */
  refreshRates: () => void;
}

export function useDisplayCurrency(): DisplayCurrencyHook {
  const {
    currency: orgCurrency,
    convert,
    exchangeRates,
    exchangeRatesLoading,
  } = useCurrency();

  const orgCurrencyCode = orgCurrency.code;

  // 1. Initialiser depuis localStorage ou défaut = devise org
  const [displayCurrencyCode, setDisplayCurrencyCodeState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.length === 3) return stored;
    } catch {
      // ignore
    }
    return orgCurrencyCode;
  });

  // 2. Si la devise org change (changement de profil), reset à la devise org
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setDisplayCurrencyCodeState(orgCurrencyCode);
    } catch {
      // ignore
    }
  }, [orgCurrencyCode]);

  // 3. Setter qui persiste dans localStorage
  const setDisplayCurrency = useCallback((code: string) => {
    setDisplayCurrencyCodeState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, []);

  // 4. Conversion
  const convertFromOrg = useCallback(
    (amount: number): number => {
      if (displayCurrencyCode === orgCurrencyCode) return amount;
      const result = convert(amount, orgCurrencyCode, displayCurrencyCode);
      return result ?? amount;
    },
    [convert, displayCurrencyCode, orgCurrencyCode],
  );

  const convertFrom = useCallback(
    (amount: number, fromCurrency: string): number => {
      if (fromCurrency === displayCurrencyCode) return amount;
      const result = convert(amount, fromCurrency, displayCurrencyCode);
      return result ?? amount;
    },
    [convert, displayCurrencyCode],
  );

  // 5. Formatage
  const formatDisplayPrice = useCallback(
    (amount: number, options: { showOriginal?: boolean } = {}): string => {
      // Pas de conversion nécessaire
      if (displayCurrencyCode === orgCurrencyCode) {
        return formatPriceUtil(amount, orgCurrency);
      }
      const converted = convert(amount, orgCurrencyCode, displayCurrencyCode);
      const displayCur = getCurrencyByCode(displayCurrencyCode);
      if (converted === null || !displayCur) {
        return `${formatPriceUtil(amount, orgCurrency)} (taux indisponible)`;
      }
      const result = formatPriceUtil(converted, displayCur);
      if (options.showOriginal) {
        return `${result} (≈ ${formatPriceUtil(amount, orgCurrency)})`;
      }
      return result;
    },
    [convert, displayCurrencyCode, orgCurrency, orgCurrencyCode],
  );

  const formatFromCurrency = useCallback(
    (
      amount: number,
      fromCurrency: string,
      options: { showOriginal?: boolean } = {},
    ): string => {
      const fromCur = getCurrencyByCode(fromCurrency);
      // Pas de conversion
      if (fromCurrency === displayCurrencyCode) {
        if (!fromCur) return `${amount} ${fromCurrency}`;
        return formatPriceUtil(amount, fromCur);
      }
      const converted = convert(amount, fromCurrency, displayCurrencyCode);
      const displayCur = getCurrencyByCode(displayCurrencyCode);
      if (converted === null || !displayCur || !fromCur) {
        return fromCur ? formatPriceUtil(amount, fromCur) : `${amount} ${fromCurrency}`;
      }
      const result = formatPriceUtil(converted, displayCur);
      if (options.showOriginal) {
        return `${result} (≈ ${formatPriceUtil(amount, fromCur)})`;
      }
      return result;
    },
    [convert, displayCurrencyCode],
  );

  const displayCurrency: CurrencyConfig =
    getCurrencyByCode(displayCurrencyCode) || orgCurrency;

  const refreshRates = useCallback(() => {
    try {
      const raw = localStorage.getItem("makitiplus_exchange_rates_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.timestamp = 0; // force refresh
        localStorage.setItem("makitiplus_exchange_rates_v1", JSON.stringify(parsed));
      }
    } catch {
      // ignore
    }
    // Déclencher un re-fetch sans recharger la page
    window.dispatchEvent(new CustomEvent("makitiplus-refresh-rates"));
  }, []);

  return {
    displayCurrencyCode,
    displayCurrency,
    orgCurrencyCode,
    isConverted: displayCurrencyCode !== orgCurrencyCode,
    setDisplayCurrency,
    convertFromOrg,
    convertFrom,
    formatDisplayPrice,
    formatFromCurrency,
    exchangeRates,
    ratesLoading: exchangeRatesLoading,
    refreshRates,
  };
}
