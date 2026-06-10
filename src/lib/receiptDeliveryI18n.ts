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
  confirmTitle: string;
  confirmRemoveDesc: string;
  confirmArchiveDesc: string;
  cancel: string;
  confirm: string;
  selectedAcrossResults: string;
  clearSelection: string;
  undo: string;
  actionUndone: string;
  syncing: string;
  syncProgress: string;
  exportSelected: string;
  exportSelectedCsv: string;
  exportSelectedPdf: string;
  remoteMerged: string;
  mergeLogTitle: string;
  mergeLogDescription: string;
  mergeLogEmpty: string;
  mergeLogClear: string;
  mergeLogExportCsv: string;
  mergeLogExportJson: string;
  mergeLogSearchPlaceholder: string;
  mergeLogFilterSource: string;
  mergeLogFilterGhosts: string;
  mergeLogSourceLocal: string;
  mergeLogSourceRemote: string;
  mergeLogGhostOnly: string;
  mergeLogGhostHide: string;
  mergeLogGhostBadge: string;
  mergeLogRule: string;
  mergeLogTime: string;
  mergeLogTotal: string;
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
    confirmTitle: "Confirmer l'action",
    confirmRemoveDesc: "Supprimer définitivement les tickets sélectionnés ? Action irréversible.",
    confirmArchiveDesc: "Archiver les doublons (marqués 'duplicate') ? Idempotence préservée.",
    cancel: "Annuler", confirm: "Confirmer",
    selectedAcrossResults: "sélectionné(s) sur tout le résultat",
    clearSelection: "Effacer la sélection",
    undo: "Annuler",
    actionUndone: "Action annulée",
    syncing: "Synchronisation en cours…",
    syncProgress: "envoyé(s) / échec(s)",
    exportSelected: "Exporter sélection",
    exportSelectedCsv: "Sélection CSV",
    exportSelectedPdf: "Sélection PDF",
    remoteMerged: "File distante fusionnée",
    mergeLogTitle: "Journal des fusions distantes",
    mergeLogDescription: "Trace des résolutions mergeRemoteQueue par client_uuid (règle appliquée, source gagnante, IDs fantômes purgés).",
    mergeLogEmpty: "Aucune fusion enregistrée",
    mergeLogClear: "Vider le journal",
    mergeLogExportCsv: "Export journal CSV",
    mergeLogExportJson: "Export journal JSON",
    mergeLogSearchPlaceholder: "Rechercher client_uuid…",
    mergeLogFilterSource: "Source",
    mergeLogFilterGhosts: "Fantômes",
    mergeLogSourceLocal: "Local gagne",
    mergeLogSourceRemote: "Distant gagne",
    mergeLogGhostOnly: "Uniquement fantômes",
    mergeLogGhostHide: "Sans fantômes",
    mergeLogGhostBadge: "Fantôme purgé",
    mergeLogRule: "Règle",
    mergeLogTime: "Horodatage",
    mergeLogTotal: "entrée(s)",
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
    confirmTitle: "Confirm action",
    confirmRemoveDesc: "Permanently remove selected tickets? This cannot be undone.",
    confirmArchiveDesc: "Archive duplicates (mark as 'duplicate')? Idempotency preserved.",
    cancel: "Cancel", confirm: "Confirm",
    selectedAcrossResults: "selected across all results",
    clearSelection: "Clear selection",
    undo: "Undo",
    actionUndone: "Action undone",
    syncing: "Syncing…",
    syncProgress: "sent / failed",
    exportSelected: "Export selection",
    exportSelectedCsv: "Selection CSV",
    exportSelectedPdf: "Selection PDF",
    remoteMerged: "Remote queue merged",
    mergeLogTitle: "Remote merge journal",
    mergeLogDescription: "Trace of mergeRemoteQueue resolutions by client_uuid (rule applied, winning source, purged ghost IDs).",
    mergeLogEmpty: "No merge recorded",
    mergeLogClear: "Clear journal",
    mergeLogExportCsv: "Export journal CSV",
    mergeLogExportJson: "Export journal JSON",
    mergeLogSearchPlaceholder: "Search client_uuid…",
    mergeLogFilterSource: "Source",
    mergeLogFilterGhosts: "Ghosts",
    mergeLogSourceLocal: "Local wins",
    mergeLogSourceRemote: "Remote wins",
    mergeLogGhostOnly: "Ghosts only",
    mergeLogGhostHide: "Hide ghosts",
    mergeLogGhostBadge: "Ghost purged",
    mergeLogRule: "Rule",
    mergeLogTime: "Timestamp",
    mergeLogTotal: "entry(ies)",
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
    confirmTitle: "Walikɛ ratin",
    confirmRemoveDesc: "Tikiti sugandixi bakanma fan? A mu nɔɛ a kɛli.",
    confirmArchiveDesc: "Firin maraxi (lon: 'duplicate')? Idempotans na yi.",
    cancel: "Bakanma", confirm: "Ratin",
    selectedAcrossResults: "sugandixi birin findife ra",
    clearSelection: "Sugandi yi xun",
    undo: "Yi xanbi",
    actionUndone: "Walikɛ xanbi",
    syncing: "Sinkronisasyon…",
    syncProgress: "rafiyaxi / munma",
    exportSelected: "Sugandixi ramini",
    exportSelectedCsv: "Sugandixi CSV",
    exportSelectedPdf: "Sugandixi PDF",
    remoteMerged: "Luwe gbɛtɛ lannɛ",
    mergeLogTitle: "Luwe gbɛtɛ lan kɔnti",
    mergeLogDescription: "mergeRemoteQueue tilixili kɔnti client_uuid xa.",
    mergeLogEmpty: "Lan yo mu na",
    mergeLogClear: "Kɔnti yi xun",
    mergeLogExportCsv: "Kɔnti CSV ramini",
    mergeLogExportJson: "Kɔnti JSON ramini",
    mergeLogSearchPlaceholder: "client_uuid mafela…",
    mergeLogFilterSource: "Faridɛ",
    mergeLogFilterGhosts: "Maxalanyi",
    mergeLogSourceLocal: "Local sɔtɔ",
    mergeLogSourceRemote: "Gbɛtɛ sɔtɔ",
    mergeLogGhostOnly: "Maxalanyi gbansan",
    mergeLogGhostHide: "Maxalanyi luxun",
    mergeLogGhostBadge: "Maxalan bakanma",
    mergeLogRule: "Saria",
    mergeLogTime: "Waxati",
    mergeLogTotal: "kira",
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
    confirmTitle: "Teeŋtin golle",
    confirmRemoveDesc: "Momtu tiketuuji suɓaaɗi haa abada? Yiɗtataako.",
    confirmArchiveDesc: "Marde ɗiɗɗi (huɓɓinde 'duplicate')? Idempotans heddii.",
    cancel: "Haaytu", confirm: "Teeŋtin",
    selectedAcrossResults: "suɓaama e ñiiwñe fof",
    clearSelection: "Mommbu suɓaaɗi",
    undo: "Firtu",
    actionUndone: "Golle firtaama",
    syncing: "Hino siŋkironeede…",
    syncProgress: "neldaaɗi / ronkooji",
    exportSelected: "Yaltin suɓaaɗi",
    exportSelectedCsv: "Suɓaaɗi CSV",
    exportSelectedPdf: "Suɓaaɗi PDF",
    remoteMerged: "Ndariindi woɗɗundi renndinaama",
    mergeLogTitle: "Defetere renndingol woɗɗundi",
    mergeLogDescription: "Tonngolol mergeRemoteQueue e client_uuid.",
    mergeLogEmpty: "Renndingol alaa",
    mergeLogClear: "Mommbu defetere",
    mergeLogExportCsv: "Yaltin defetere CSV",
    mergeLogExportJson: "Yaltin defetere JSON",
    mergeLogSearchPlaceholder: "Yiilo client_uuid…",
    mergeLogFilterSource: "Iwdi",
    mergeLogFilterGhosts: "Mbeelu",
    mergeLogSourceLocal: "Local foolii",
    mergeLogSourceRemote: "Woɗɗundi foolii",
    mergeLogGhostOnly: "Mbeelu tan",
    mergeLogGhostHide: "Suuɗu mbeelu",
    mergeLogGhostBadge: "Mbeelu momtaama",
    mergeLogRule: "Sariya",
    mergeLogTime: "Waktu",
    mergeLogTotal: "tonngol",
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
    confirmTitle: "Baara dafa",
    confirmRemoveDesc: "Tikiti sugandilen bɔ pewu? A tɛ se ka segi.",
    confirmArchiveDesc: "Filana mara (taamasiɲɛ 'duplicate')? Idempotans bɛ to.",
    cancel: "A bila", confirm: "Dafa",
    selectedAcrossResults: "sugandilen jaabi bɛɛ kɔnɔ",
    clearSelection: "Sugandili bɔ",
    undo: "A segi",
    actionUndone: "Baara seginen",
    syncing: "Sinkironisasiyɔn bɛ kɛ…",
    syncProgress: "cira / ma se",
    exportSelected: "Sugandili labɔ",
    exportSelectedCsv: "Sugandili CSV",
    exportSelectedPdf: "Sugandili PDF",
    remoteMerged: "Yɔrɔjan layili faralen",
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
