import { useAuth } from "@/contexts/AuthContext";
import {
  COUNTRIES,
  DEFAULT_CURRENCY,
  getCountryByCode,
  getCurrencyByCode,
  formatPrice as formatPriceUtil,
  CurrencyConfig,
  CountryConfig,
} from "@/utils/currencies";

export const useCurrency = () => {
  const { profile } = useAuth();

  // 1. Try direct currency selection from profile.currency (ISO code like "GNF", "XOF")
  // 2. Fall back to country-derived currency
  // 3. Default to Guinea / GNF
  let currency: CurrencyConfig;

  const profileCurrencyCode = profile?.currency || null;
  const directCurrency = profileCurrencyCode ? getCurrencyByCode(profileCurrencyCode) : null;

  if (directCurrency) {
    currency = directCurrency;
  } else {
    // Derive from country
    let countryCode = profile?.country || "GN";
    if (countryCode.length > 2) {
      const found = COUNTRIES.find(
        (c) => c.name.toLowerCase() === countryCode.toLowerCase()
      );
      countryCode = found?.code || "GN";
    }
    const country =
      getCountryByCode(countryCode) || COUNTRIES.find((c) => c.code === "GN")!;
    currency = country.currency;
  }

  // Also resolve the country for phone code and payment methods
  let countryCode = profile?.country || "GN";
  if (countryCode.length > 2) {
    const found = COUNTRIES.find(
      (c) => c.name.toLowerCase() === countryCode.toLowerCase()
    );
    countryCode = found?.code || "GN";
  }
  const country: CountryConfig =
    getCountryByCode(countryCode) || COUNTRIES.find((c) => c.code === "GN")!;

  const formatPrice = (amount: number): string => {
    return formatPriceUtil(amount, currency);
  };

  const availablePaymentMethods = country.mobilePayments;

  return {
    currency,
    country,
    formatPrice,
    availablePaymentMethods,
    phoneCode: country.phoneCode,
  };
};
