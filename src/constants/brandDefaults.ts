/**
 * Couleurs de marque par défaut de MalikiPlus.
 * Centralisées ici pour éviter la duplication des valeurs hexadécimales
 * à travers BrandingContext, StoreCustomization, etc.
 *
 * Ces valeurs correspondent aux variables CSS --brand-*-hex dans index.css.
 */
export const BRAND_DEFAULTS = {
  primary: "#E8612D",   // Terracotta
  secondary: "#FAF0E2", // Sable clair
  accent: "#F5E6CE",    // Sable doré
  success: "#2BA84A",   // Vert forêt
} as const;
