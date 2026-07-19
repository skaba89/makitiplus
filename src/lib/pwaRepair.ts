/**
 * PWA Cache Repair — nettoie le cache technique sans toucher IndexedDB.
 *
 * Problème : les anciens Service Workers peuvent rester actifs et charger
 * un mix d'anciens/nouveaux bundles JS → erreurs "useState is not defined",
 * "ChunkLoadError", "Failed to fetch dynamically imported module".
 *
 * Solution : 
 * 1. Unregister tous les Service Workers
 * 2. Supprimer tous les caches CacheStorage (workbox-precache-v2, html-navigations, static-assets, etc.)
 * 3. NE PAS supprimer IndexedDB (ventes offline non synchronisées)
 * 4. Recharger la page
 */

/**
 * Répare le cache PWA en supprimant les Service Workers et CacheStorage.
 * IndexedDB (ventes offline) est PRESERVÉ.
 * 
 * @returns Promise<void>
 */
export async function repairPwaCache(): Promise<void> {
  // 1. Unregister tous les Service Workers
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(
        registrations.map((reg) => reg.unregister()),
      );
    } catch {
      // Non critique — continue
    }
  }

  // 2. Supprimer tous les caches CacheStorage
  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.allSettled(
        cacheNames.map((name) => caches.delete(name)),
      );
    } catch {
      // Non critique — continue
    }
  }

  // 3. NE PAS supprimer IndexedDB
  // Les ventes offline (IndexedDB: makitiplus_offline_sales) sont PRESERVÉES
  // pour permettre la synchronisation au prochain online.

  // 4. Recharger la page pour charger les nouveaux bundles
  window.location.reload();
}

/**
 * Détecte si une erreur est liée à un problème de cache PWA.
 * 
 * @param error - L'erreur capturée
 * @returns true si l'erreur est liée au cache PWA
 */
export function isPwaCacheError(error: Error | string): boolean {
  const message = typeof error === "string" ? error : error.message;
  const pwaErrorPatterns = [
    "useState is not defined",
    "ChunkLoadError",
    "Failed to fetch dynamically imported module",
    "Loading chunk",
    "dynamically imported module",
    "Loading CSS chunk",
    "error loading dynamically imported module",
  ];
  return pwaErrorPatterns.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}
