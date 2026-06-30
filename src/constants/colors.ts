/**
 * Constantes de couleurs partagées pour l'application.
 *
 * Centralise les palettes de couleurs utilisées dans les graphiques,
 * les catégories et les couleurs de marque (WhatsApp, etc.).
 */

/** Couleur par défaut pour les catégories sans couleur personnalisée */
export const DEFAULT_CATEGORY_COLOR = "#E57E4D";

/** Palette de couleurs pour les graphiques (6 couleurs) */
export const CHART_COLORS = [
  "#E57E4D",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
] as const;

/** Palette de couleurs prédéfinies pour les catégories (15 couleurs) */
export const PRESET_COLORS = [
  ...CHART_COLORS,
  "#EF4444",
  "#6366F1",
  "#14B8A6",
  "#F97316",
  "#0EA5E9",
  "#22C55E",
  "#A855F7",
  "#F43F5E",
  "#78716C",
] as const;

/** Couleurs de marque WhatsApp */
export const WHATSAPP_GREEN = "#25D366";
export const WHATSAPP_GREEN_DARK = "#128C7E";
