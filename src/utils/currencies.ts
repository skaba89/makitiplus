// Configuration des devises par pays africain

export interface CurrencyConfig {
  code: string;
  symbol: string; // Full symbol for currency list (e.g. "FCFA")
  displaySymbol: string; // Short symbol for pages/receipts (e.g. "F")
  name: string;
  position: "before" | "after";
  decimals: number;
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  currency: CurrencyConfig;
  mobilePayments: string[];
  phoneCode: string;
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: "SN",
    name: "Sénégal",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["wave", "orange_money"],
    phoneCode: "+221",
  },
  {
    code: "CI",
    name: "Côte d'Ivoire",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["wave", "orange_money", "mtn_money", "moov_money"],
    phoneCode: "+225",
  },
  {
    code: "ML",
    name: "Mali",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["orange_money"],
    phoneCode: "+223",
  },
  {
    code: "BF",
    name: "Burkina Faso",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["orange_money", "moov_money"],
    phoneCode: "+226",
  },
  {
    code: "NE",
    name: "Niger",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["orange_money", "moov_money"],
    phoneCode: "+227",
  },
  {
    code: "TG",
    name: "Togo",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["wave", "moov_money"],
    phoneCode: "+228",
  },
  {
    code: "BJ",
    name: "Bénin",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["wave", "mtn_money", "moov_money"],
    phoneCode: "+229",
  },
  {
    code: "GW",
    name: "Guinée-Bissau",
    flag: "",
    currency: { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BCEAO", position: "after", decimals: 0 },
    mobilePayments: ["orange_money"],
    phoneCode: "+245",
  },
  {
    code: "CM",
    name: "Cameroun",
    flag: "",
    currency: { code: "XAF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BEAC", position: "after", decimals: 0 },
    mobilePayments: ["orange_money", "mtn_money"],
    phoneCode: "+237",
  },
  {
    code: "GA",
    name: "Gabon",
    flag: "",
    currency: { code: "XAF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BEAC", position: "after", decimals: 0 },
    mobilePayments: ["moov_money"],
    phoneCode: "+241",
  },
  {
    code: "CG",
    name: "Congo-Brazzaville",
    flag: "",
    currency: { code: "XAF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BEAC", position: "after", decimals: 0 },
    mobilePayments: ["mtn_money"],
    phoneCode: "+242",
  },
  {
    code: "TD",
    name: "Tchad",
    flag: "",
    currency: { code: "XAF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BEAC", position: "after", decimals: 0 },
    mobilePayments: ["moov_money"],
    phoneCode: "+235",
  },
  {
    code: "CF",
    name: "Centrafrique",
    flag: "",
    currency: { code: "XAF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BEAC", position: "after", decimals: 0 },
    mobilePayments: [],
    phoneCode: "+236",
  },
  {
    code: "GQ",
    name: "Guinée équatoriale",
    flag: "",
    currency: { code: "XAF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA BEAC", position: "after", decimals: 0 },
    mobilePayments: [],
    phoneCode: "+240",
  },
  {
    code: "GN",
    name: "Guinée",
    flag: "",
    currency: { code: "GNF", symbol: "GNF", displaySymbol: "F", name: "Franc Guinéen", position: "after", decimals: 0 },
    mobilePayments: ["orange_money", "mtn_money"],
    phoneCode: "+224",
  },
  {
    code: "MR",
    name: "Mauritanie",
    flag: "",
    currency: { code: "MRU", symbol: "MRU", displaySymbol: "MRU", name: "Ouguiya", position: "after", decimals: 2 },
    mobilePayments: [],
    phoneCode: "+222",
  },
  {
    code: "MA",
    name: "Maroc",
    flag: "",
    currency: { code: "MAD", symbol: "DH", displaySymbol: "DH", name: "Dirham Marocain", position: "after", decimals: 2 },
    mobilePayments: [],
    phoneCode: "+212",
  },
  {
    code: "DZ",
    name: "Algérie",
    flag: "",
    currency: { code: "DZD", symbol: "DA", displaySymbol: "DA", name: "Dinar Algérien", position: "after", decimals: 2 },
    mobilePayments: [],
    phoneCode: "+213",
  },
  {
    code: "TN",
    name: "Tunisie",
    flag: "",
    currency: { code: "TND", symbol: "DT", displaySymbol: "DT", name: "Dinar Tunisien", position: "after", decimals: 3 },
    mobilePayments: [],
    phoneCode: "+216",
  },
  {
    code: "EG",
    name: "Égypte",
    flag: "",
    currency: { code: "EGP", symbol: "£E", displaySymbol: "£E", name: "Livre Égyptienne", position: "before", decimals: 2 },
    mobilePayments: [],
    phoneCode: "+20",
  },
  {
    code: "NG",
    name: "Nigeria",
    flag: "",
    currency: { code: "NGN", symbol: "₦", displaySymbol: "₦", name: "Naira", position: "before", decimals: 2 },
    mobilePayments: [],
    phoneCode: "+234",
  },
  {
    code: "GH",
    name: "Ghana",
    flag: "",
    currency: { code: "GHS", symbol: "₵", displaySymbol: "₵", name: "Cedi", position: "before", decimals: 2 },
    mobilePayments: ["mtn_money"],
    phoneCode: "+233",
  },
  {
    code: "KE",
    name: "Kenya",
    flag: "",
    currency: { code: "KES", symbol: "KSh", displaySymbol: "KSh", name: "Shilling Kényan", position: "before", decimals: 2 },
    mobilePayments: ["mpesa"],
    phoneCode: "+254",
  },
  {
    code: "TZ",
    name: "Tanzanie",
    flag: "",
    currency: { code: "TZS", symbol: "TSh", displaySymbol: "TSh", name: "Shilling Tanzanien", position: "before", decimals: 0 },
    mobilePayments: ["mpesa"],
    phoneCode: "+255",
  },
  {
    code: "UG",
    name: "Ouganda",
    flag: "",
    currency: { code: "UGX", symbol: "USh", displaySymbol: "USh", name: "Shilling Ougandais", position: "before", decimals: 0 },
    mobilePayments: ["mtn_money"],
    phoneCode: "+256",
  },
  {
    code: "RW",
    name: "Rwanda",
    flag: "",
    currency: { code: "RWF", symbol: "FRw", displaySymbol: "FRw", name: "Franc Rwandais", position: "before", decimals: 0 },
    mobilePayments: ["mtn_money"],
    phoneCode: "+250",
  },
  {
    code: "CD",
    name: "RD Congo",
    flag: "",
    currency: { code: "CDF", symbol: "FC", displaySymbol: "FC", name: "Franc Congolais", position: "after", decimals: 2 },
    mobilePayments: ["mpesa", "orange_money"],
    phoneCode: "+243",
  },
  {
    code: "ZA",
    name: "Afrique du Sud",
    flag: "",
    currency: { code: "ZAR", symbol: "R", displaySymbol: "R", name: "Rand", position: "before", decimals: 2 },
    mobilePayments: [],
    phoneCode: "+27",
  },
];

export const getCountryByCode = (code: string): CountryConfig | undefined => {
  return COUNTRIES.find((c) => c.code === code);
};

export const formatPrice = (amount: number, currency: CurrencyConfig): string => {
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(amount);

  const sym = currency.displaySymbol || currency.symbol;
  return currency.position === "before"
    ? `${sym}${formatted}`
    : `${formatted} ${sym}`;
};

// Default currency (Guinée — Franc Guinéen)
export const DEFAULT_COUNTRY = COUNTRIES.find(c => c.code === "GN")!;
export const DEFAULT_CURRENCY = DEFAULT_COUNTRY.currency;
