/**
 * Localisation simple (sans dépendance) pour l'écran de suivi des envois.
 * Marché cible prioritaire : Guinée (FR officielle + langues locales).
 * Extensible pour les autres pays de la sous-région.
 */

export type DeliveryLocale = "fr" | "en" | "sus" | "ful" | "man";

export interface DeliveryDict {
  title: string;
  description: string;
  online: string;
  offline: string;
  pending: string;
  sent: string;
  failed: string;
  duplicate: string;
  refresh: string;
  retryAll: string;
  retry: string;
  remove: string;
  search: string;
  searchPlaceholder: string;
  filterStatus: string;
  all: string;
  channel: string;
  recipient: string;
  ticket: string;
  status: string;
  attempts: string;
  actions: string;
  empty: string;
  exportCsv: string;
  exportPdf: string;
  page: string;
  of: string;
  prev: string;
  next: string;
  perPage: string;
  sortNewest: string;
  sortOldest: string;
  language: string;
  nextRetryIn: string;
  maxAttemptsReached: string;
}

const dicts: Record<DeliveryLocale, DeliveryDict> = {
  fr: {
    title: "Suivi des envois de tickets",
    description: "État de la file d'envoi (WhatsApp / SMS). Idempotence garantie par client_uuid.",
    online: "En ligne", offline: "Hors ligne",
    pending: "En attente", sent: "Envoyé", failed: "Échec", duplicate: "Doublon",
    refresh: "Rafraîchir", retryAll: "Tout retenter", retry: "Retenter", remove: "Supprimer",
    search: "Recherche", searchPlaceholder: "N° ticket, téléphone…",
    filterStatus: "Statut", all: "Tous",
    channel: "Canal", recipient: "Destinataire", ticket: "Ticket",
    status: "Statut", attempts: "Tentatives", actions: "Actions",
    empty: "Aucun ticket en file 🎉",
    exportCsv: "Export CSV", exportPdf: "Export PDF",
    page: "Page", of: "sur", prev: "Précédent", next: "Suivant", perPage: "/ page",
    sortNewest: "Plus récent", sortOldest: "Plus ancien",
    language: "Langue",
    nextRetryIn: "Prochain essai dans", maxAttemptsReached: "Limite de tentatives atteinte",
  },
  en: {
    title: "Receipt delivery tracking",
    description: "WhatsApp / SMS sending queue status. Idempotency guaranteed by client_uuid.",
    online: "Online", offline: "Offline",
    pending: "Pending", sent: "Sent", failed: "Failed", duplicate: "Duplicate",
    refresh: "Refresh", retryAll: "Retry all", retry: "Retry", remove: "Remove",
    search: "Search", searchPlaceholder: "Ticket #, phone…",
    filterStatus: "Status", all: "All",
    channel: "Channel", recipient: "Recipient", ticket: "Ticket",
    status: "Status", attempts: "Attempts", actions: "Actions",
    empty: "No ticket in queue 🎉",
    exportCsv: "Export CSV", exportPdf: "Export PDF",
    page: "Page", of: "of", prev: "Previous", next: "Next", perPage: "/ page",
    sortNewest: "Newest", sortOldest: "Oldest",
    language: "Language",
    nextRetryIn: "Next retry in", maxAttemptsReached: "Max attempts reached",
  },
  // Susu (Soso) — Guinée maritime
  sus: {
    title: "Tikiti rafiya mato",
    description: "WhatsApp / SMS rafiyafe luwe. Client_uuid xa idempotans.",
    online: "Internet na", offline: "Internet mu na",
    pending: "Mamemafe", sent: "A rafiyaxi", failed: "A munma", duplicate: "Firin",
    refresh: "Yi xun", retryAll: "Birin yi xa fala", retry: "Yi fala", remove: "Bakanma",
    search: "Mafela", searchPlaceholder: "Tikiti #, telefon…",
    filterStatus: "Lon", all: "Birin",
    channel: "Kira", recipient: "Sodonyi", ticket: "Tikiti",
    status: "Lon", attempts: "Falalu", actions: "Walikɛ",
    empty: "Tikiti yo mu na 🎉",
    exportCsv: "CSV ramini", exportPdf: "PDF ramini",
    page: "Bukin", of: "/", prev: "Dangixi", next: "Faxɛ", perPage: "/ bukin",
    sortNewest: "Naxan nɛnɛ", sortOldest: "Naxan kɔrixi",
    language: "Xui",
    nextRetryIn: "Falaba waxati", maxAttemptsReached: "Falalu danxi",
  },
  // Pular (Peul / Fulfulde) — Fouta Djallon
  ful: {
    title: "Ƴeewndo nelle tiketuuji",
    description: "Hino weeɓi WhatsApp / SMS. Idempotans woni e client_uuid.",
    online: "Hino e laawol", offline: "Alaa e laawol",
    pending: "Ina sabbii", sent: "Nelaama", failed: "Ronkii", duplicate: "Ɗiɗɗo",
    refresh: "Heso", retryAll: "Eto fof", retry: "Eto", remove: "Momtu",
    search: "Yiilo", searchPlaceholder: "Lim tiket, simil…",
    filterStatus: "Ngonka", all: "Fof",
    channel: "Laawol", recipient: "Jaɓoowo", ticket: "Tiket",
    status: "Ngonka", attempts: "Eto-eto", actions: "Golle",
    empty: "Tiket alaa e ndariindi 🎉",
    exportCsv: "Yaltin CSV", exportPdf: "Yaltin PDF",
    page: "Hello", of: "e", prev: "Ɓenniingo", next: "Aroowo", perPage: "/ hello",
    sortNewest: "Hesɗo", sortOldest: "Kiiɗɗo",
    language: "Ɗemngal",
    nextRetryIn: "Eto goɗɗo nder", maxAttemptsReached: "Keerol etogol heɓaama",
  },
  // Maninka (Malinké) — Haute Guinée
  man: {
    title: "Tikiti cilen kɔlɔsili",
    description: "WhatsApp / SMS cili layili. Client_uuid bɛ idempotans di.",
    online: "Rezo bɛ", offline: "Rezo tɛ",
    pending: "A bɛ makɔnɔ", sent: "A cira", failed: "A ma se", duplicate: "Filana",
    refresh: "Kɔlɔsi kura", retryAll: "Bɛɛ ka segi", retry: "Segi", remove: "A bɔ",
    search: "Ɲinin", searchPlaceholder: "Tikiti nimɔrɔ, telefɔni…",
    filterStatus: "Cogo", all: "Bɛɛ",
    channel: "Sira", recipient: "Sɔrɔbaga", ticket: "Tikiti",
    status: "Cogo", attempts: "Segili", actions: "Baara",
    empty: "Tikiti si tɛ layili 🎉",
    exportCsv: "CSV labɔ", exportPdf: "PDF labɔ",
    page: "Yɛrɛ", of: "/", prev: "Kɔfɛ", next: "Ɲɛfɛ", perPage: "/ yɛrɛ",
    sortNewest: "Kura", sortOldest: "Kɔrɔ",
    language: "Kan",
    nextRetryIn: "Segili nata", maxAttemptsReached: "Segili dan se ra",
  },
};

const KEY = "sahelpos:delivery_locale";

export const getDeliveryLocale = (): DeliveryLocale => {
  try {
    const v = (localStorage.getItem(KEY) as DeliveryLocale | null);
    if (v && dicts[v]) return v;
  } catch { /* ignore */ }
  return "fr";
};

export const setDeliveryLocale = (l: DeliveryLocale) => {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
};

export const getDict = (l: DeliveryLocale): DeliveryDict => dicts[l] ?? dicts.fr;

export const LOCALE_OPTIONS: { code: DeliveryLocale; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "sus", label: "Sosoxui" },
  { code: "ful", label: "Pular" },
  { code: "man", label: "Maninkakan" },
];
