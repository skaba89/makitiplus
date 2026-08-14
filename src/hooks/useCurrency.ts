import { useAuth } from "@/contexts/AuthContext";
import {
  COUNTRIES,
  getCurrencyByCode,
  resolveCountry,
  formatPrice as formatPriceUtil,
  CurrencyConfig,
  CountryConfig,
} from "@/utils/currencies";
import { useExchangeRates } from "@/hooks/useExchangeRates";

export const useCurrency = () => {
  const { profile } = useAuth();
  const { rates, loading: ratesLoading, convert } = useExchangeRates();

  // 1. Try direct currency selection from profile.currency (ISO code like "GNF", "XOF")
  // 2. Fall back to country-derived currency
  // 3. Default to Guinea / GNF
  // resolveCountry() gère profile.country stocké en code ISO ("GN") ou en
  // nom complet ("Guinée") -- même logique partagée avec
  // ProfileLanguageSync.tsx (voir src/utils/currencies.ts).
  const country: CountryConfig =
    resolveCountry(profile?.country) || COUNTRIES.find((c) => c.code === "GN")!;

  const profileCurrencyCode = profile?.currency || null;
  const directCurrency = profileCurrencyCode ? getCurrencyByCode(profileCurrencyCode) : null;
  const currency: CurrencyConfig = directCurrency || country.currency;

  const formatPrice = (amount: number): string => {
    return formatPriceUtil(amount, currency);
  };

  /**
   * Convertit un montant depuis une devise source vers la devise de l'utilisateur.
   * Utilise les taux de change réels (mis à jour toutes les 24h).
   * Retourne le montant original si la conversion échoue (fallback gracieux).
   *
   * @param amount - Montant à convertir
   * @param fromCurrency - Code ISO 4217 de la devise source (ex: "GNF", "XOF")
   * @returns Montant converti dans la devise de l'utilisateur
   */
  const convertToUserCurrency = (amount: number, fromCurrency: string): number => {
    if (fromCurrency === currency.code) return amount;
    const converted = convert(amount, fromCurrency, currency.code);
    return converted ?? amount; // fallback : montant original si pas de taux
  };

  /**
   * Convertit un montant depuis une devise source vers la devise de l'utilisateur
   * et le formate avec le symbole de la devise utilisateur.
   */
  const formatConvertedPrice = (
    amount: number,
    fromCurrency: string,
    options: { showOriginal?: boolean } = {},
  ): string => {
    if (fromCurrency === currency.code) {
      return formatPriceUtil(amount, currency);
    }
    const converted = convert(amount, fromCurrency, currency.code);
    if (converted === null) {
      // Pas de taux disponible → afficher dans la devise source avec un warning
      const sourceCurrency = getCurrencyByCode(fromCurrency);
      if (sourceCurrency) {
        return `${formatPriceUtil(amount, sourceCurrency)} (taux indisponible)`;
      }
      return `${amount} ${fromCurrency}`;
    }
    const formatted = formatPriceUtil(converted, currency);
    if (options.showOriginal) {
      const sourceCurrency = getCurrencyByCode(fromCurrency);
      if (sourceCurrency) {
        return `${formatted} (≈ ${formatPriceUtil(amount, sourceCurrency)})`;
      }
    }
    return formatted;
  };

  const availablePaymentMethods = country.mobilePayments;

  return {
    currency,
    country,
    formatPrice,
    convertToUserCurrency,
    formatConvertedPrice,
    availablePaymentMethods,
    phoneCode: country.phoneCode,
    // Exposé pour permettre aux pages de convertir dans une devise arbitraire
    convert,
    exchangeRates: rates,
    exchangeRatesLoading: ratesLoading,
  };
};

