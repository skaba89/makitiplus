import { useAuth } from "@/contexts/AuthContext";
import { COUNTRIES, DEFAULT_CURRENCY, getCountryByCode, formatPrice as formatPriceUtil, CurrencyConfig, CountryConfig } from "@/utils/currencies";

export const useCurrency = () => {
  const { profile } = useAuth();

  // Get country from profile, default to Guinea (GN)
  // Handle both full name ("Guinée") and code ("GN") formats
  let countryCode = profile?.country || "GN";
  // If country is a full name, find the matching code
  if (countryCode.length > 2) {
    const found = COUNTRIES.find(c => c.name.toLowerCase() === countryCode.toLowerCase());
    countryCode = found?.code || "GN";
  }
  const country = getCountryByCode(countryCode) || COUNTRIES.find(c => c.code === "GN")!;
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
