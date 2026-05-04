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
  bulkActions: string;
  bulkRetry: string;
  bulkRemove: string;
  selected: string;
  showDuplicates: string;
  mergeDuplicates: string;
  archiveDuplicates: string;
  details: string;
  payload: string;
  createdAt: string;
  sentAt: string;
  nextRetryAt: string;
  lastError: string;
  close: string;
  exhaustedToast: string;
  noneSelected: string;
  duplicatesMerged: string;
  duplicatesArchived: string;
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
    bulkActions: "Actions groupées", bulkRetry: "Retenter sélection", bulkRemove: "Supprimer sélection",
    selected: "sélectionné(s)", showDuplicates: "Voir doublons",
    mergeDuplicates: "Fusionner doublons", archiveDuplicates: "Archiver doublons",
    details: "Détails", payload: "Contenu", createdAt: "Créé le", sentAt: "Envoyé le",
    nextRetryAt: "Prochain essai", lastError: "Dernière erreur", close: "Fermer",
    exhaustedToast: "Envoi abandonné après tentatives max",
    noneSelected: "Aucune ligne sélectionnée",
    duplicatesMerged: "Doublons fusionnés", duplicatesArchived: "Doublons archivés",
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
    bulkActions: "Bulk actions", bulkRetry: "Retry selected", bulkRemove: "Remove selected",
    selected: "selected", showDuplicates: "Show duplicates",
    mergeDuplicates: "Merge duplicates", archiveDuplicates: "Archive duplicates",
    details: "Details", payload: "Payload", createdAt: "Created at", sentAt: "Sent at",
    nextRetryAt: "Next retry at", lastError: "Last error", close: "Close",
    exhaustedToast: "Delivery abandoned after max attempts",
    noneSelected: "No row selected",
    duplicatesMerged: "Duplicates merged", duplicatesArchived: "Duplicates archived",
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
    bulkActions: "Walikɛ birin", bulkRetry: "Sugandixi yi fala", bulkRemove: "Sugandixi bakanma",
    selected: "sugandixi", showDuplicates: "Firin makɔnɔn",
    mergeDuplicates: "Firin lan", archiveDuplicates: "Firin maraxi",
    details: "Xibaru", payload: "Sɛbɛli", createdAt: "A daxi", sentAt: "A rafiyaxi",
    nextRetryAt: "Falaba", lastError: "Fili dɔnxɔɛ", close: "A laka",
    exhaustedToast: "Rafiyali ban falalu xanbi",
    noneSelected: "Sugandi yo mu na",
    duplicatesMerged: "Firin lannɛ", duplicatesArchived: "Firin maraxɛ",
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
    bulkActions: "Golle dental", bulkRetry: "Eto suɓaaɗi", bulkRemove: "Momtu suɓaaɗi",
    selected: "suɓaama", showDuplicates: "Hollu ɗiɗɗi",
    mergeDuplicates: "Renndin ɗiɗɗi", archiveDuplicates: "Marde ɗiɗɗi",
    details: "Faandaareeji", payload: "Loowdi", createdAt: "Sosaa", sentAt: "Nelaa",
    nextRetryAt: "Eto garoowo", lastError: "Juumre sakkitiinde", close: "Uddu",
    exhaustedToast: "Nelirgol ɗalaa caggal etoɗe heeriiɗe",
    noneSelected: "Hay ngooto suɓaaki",
    duplicatesMerged: "Ɗiɗɗi renndinaama", duplicatesArchived: "Ɗiɗɗi maraama",
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
    bulkActions: "Baara ɲɔgɔn", bulkRetry: "Sugandili segi", bulkRemove: "Sugandili bɔ",
    selected: "sugandilen", showDuplicates: "Filana jira",
    mergeDuplicates: "Filana fara", archiveDuplicates: "Filana mara",
    details: "Kunnafoni", payload: "Kɔnɔnan", createdAt: "A dara", sentAt: "A cira",
    nextRetryAt: "Segili waati", lastError: "Fili laban", close: "A datugu",
    exhaustedToast: "Cili banna segili dan kɔfɛ",
    noneSelected: "Sugandili tɛ yen",
    duplicatesMerged: "Filana faralen", duplicatesArchived: "Filana maralen",
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
