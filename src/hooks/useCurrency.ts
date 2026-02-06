import { useAuth } from "@/contexts/AuthContext";
import { COUNTRIES, DEFAULT_CURRENCY, getCountryByCode, formatPrice as formatPriceUtil, CurrencyConfig, CountryConfig } from "@/utils/currencies";

export const useCurrency = () => {
  const { profile } = useAuth();

  // Get country from profile, default to Senegal
  const countryCode = profile?.country || "SN";
  const country = getCountryByCode(countryCode) || COUNTRIES[0];
  const currency = country.currency;

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
