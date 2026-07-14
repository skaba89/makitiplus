import { useEffect, useState, useCallback } from "react";

/**
 * Hook pour récupérer les taux de change réels depuis une API gratuite
 * (open.er-api.com — basée sur les données open exchange rates, sans clé API,
 * CORS-enabled, supporte toutes les devises africaines : GNF, XOF, XAF, NGN, etc.)
 *
 * Cache : 24h dans localStorage pour éviter de surcharger l'API.
 * En cas d'échec réseau, utilise le cache périmé si disponible.
 */

const API_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_KEY = "makitiplus_exchange_rates_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

export interface ExchangeRatesData {
  /** Code devise base (toujours USD pour open.er-api.com) */
  base: string;
  /** Map code devise → taux (combien d'unités de cette devise = 1 USD) */
  rates: Record<string, number>;
  /** Date de mise à jour des taux (ISO) */
  updatedAt: string;
}

interface CacheEntry {
  data: ExchangeRatesData;
  timestamp: number;
}

/**
 * Lit le cache localStorage. Retourne null si absent/illisible.
 */
function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.data?.rates || typeof parsed.timestamp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Écrit le cache localStorage.
 */
function writeCache(data: ExchangeRatesData): void {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota dépassé ou localStorage indisponible — non bloquant
  }
}

/**
 * Convertit un montant d'une devise source vers une devise cible.
 * Retourne null si les taux ne sont pas disponibles ou devise inconnue.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> | null | undefined,
): number | null {
  if (!rates) return null;
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || !toRate) return null;
  // amount en fromCurrency → USD → toCurrency
  return (amount / fromRate) * toRate;
}

export interface UseExchangeRatesResult {
  /** Taux de change (Map code → taux vs USD) ou null si non chargés */
  rates: Record<string, number> | null;
  /** Date de dernière mise à jour */
  updatedAt: string | null;
  /** true pendant le chargement initial */
  loading: boolean;
  /** Message d'erreur éventuel */
  error: string | null;
  /** Force le rechargement des taux */
  refresh: () => void;
  /**
   * Convertit un montant d'une devise à une autre.
   * Retourne null si les taux ne sont pas disponibles.
   */
  convert: (amount: number, from: string, to: string) => number | null;
}

export function useExchangeRates(): UseExchangeRatesResult {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. Vérifier le cache
    const cached = readCache();
    if (cached) {
      const ageMs = Date.now() - cached.timestamp;
      if (ageMs < CACHE_TTL_MS) {
        // Cache frais — utiliser directement
        setRates(cached.data.rates);
        setUpdatedAt(cached.data.updatedAt);
        setLoading(false);
        return;
      }
      // Cache périmé — l'afficher en attendant le refresh
      setRates(cached.data.rates);
      setUpdatedAt(cached.data.updatedAt);
    }

    // 2. Fetch API
    try {
      const response = await fetch(API_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json?.rates && typeof json.rates === "object") {
        const data: ExchangeRatesData = {
          base: json.base_code || "USD",
          rates: json.rates as Record<string, number>,
          updatedAt: json.time_last_update_utc || new Date().toISOString(),
        };
        setRates(data.rates);
        setUpdatedAt(data.updatedAt);
        writeCache(data);
      } else {
        throw new Error("Réponse API invalide");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Si on a un cache (même périmé), on le garde et on signale juste un warning
      if (!rates) {
        setError(`Impossible de charger les taux de change : ${msg}`);
      }
      // Sinon on garde le cache existant sans erreur bloquante
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const convert = useCallback(
    (amount: number, from: string, to: string): number | null => {
      return convertAmount(amount, from, to, rates);
    },
    [rates],
  );

  return {
    rates,
    updatedAt,
    loading,
    error,
    refresh: fetchRates,
    convert,
  };
}
