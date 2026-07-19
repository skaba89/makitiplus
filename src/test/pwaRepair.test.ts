import { describe, it, expect, vi, beforeEach } from "vitest";
import { repairPwaCache, isPwaCacheError } from "@/lib/pwaRepair";

// Mock navigator.serviceWorker
const mockUnregister = vi.fn();
const mockGetRegistrations = vi.fn();

// Mock caches
const mockCachesKeys = vi.fn();
const mockCachesDelete = vi.fn();

// Mock indexedDB (pour vérifier qu'elle n'est PAS touchée)
const mockIndexedDBOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Setup navigator.serviceWorker mock
  mockGetRegistrations.mockResolvedValue([
    { unregister: mockUnregister },
  ]);
  Object.defineProperty(navigator, "serviceWorker", {
    value: { getRegistrations: mockGetRegistrations },
    writable: true,
    configurable: true,
  });

  // Setup caches mock
  mockCachesKeys.mockResolvedValue(["workbox-precache-v2", "html-navigations", "static-assets"]);
  mockCachesDelete.mockResolvedValue(true);
  Object.defineProperty(window, "caches", {
    value: { keys: mockCachesKeys, delete: mockCachesDelete },
    writable: true,
    configurable: true,
  });

  // Mock window.location.reload
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: vi.fn() },
    writable: true,
    configurable: true,
  });

  // Mock indexedDB
  Object.defineProperty(window, "indexedDB", {
    value: { open: mockIndexedDBOpen },
    writable: true,
    configurable: true,
  });
});

describe("P2.4 — PWA Repair", () => {
  it("1. repairPwaCache appelle navigator.serviceWorker.getRegistrations", async () => {
    try {
      await repairPwaCache();
    } catch {
      // reload peut causer une erreur en test
    }
    expect(mockGetRegistrations).toHaveBeenCalled();
  });

  it("2. repairPwaCache appelle unregister sur chaque registration", async () => {
    try {
      await repairPwaCache();
    } catch {
      // ignore
    }
    expect(mockUnregister).toHaveBeenCalled();
  });

  it("3. repairPwaCache appelle caches.keys", async () => {
    try {
      await repairPwaCache();
    } catch {
      // ignore
    }
    expect(mockCachesKeys).toHaveBeenCalled();
  });

  it("4. repairPwaCache appelle caches.delete pour chaque cache", async () => {
    try {
      await repairPwaCache();
    } catch {
      // ignore
    }
    expect(mockCachesDelete).toHaveBeenCalledTimes(3);
  });

  it("5. repairPwaCache ne touche pas indexedDB", async () => {
    try {
      await repairPwaCache();
    } catch {
      // ignore
    }
    expect(mockIndexedDBOpen).not.toHaveBeenCalled();
  });

  it("6. isPwaCacheError détecte 'useState is not defined'", () => {
    expect(isPwaCacheError(new Error("useState is not defined"))).toBe(true);
  });

  it("7. isPwaCacheError détecte 'ChunkLoadError'", () => {
    expect(isPwaCacheError(new Error("ChunkLoadError: Loading chunk 123 failed"))).toBe(true);
  });

  it("8. isPwaCacheError détecte 'Failed to fetch dynamically imported module'", () => {
    expect(isPwaCacheError("Failed to fetch dynamically imported module")).toBe(true);
  });

  it("9. isPwaCacheError ne détecte pas les erreurs non-PWA", () => {
    expect(isPwaCacheError(new Error("Network error"))).toBe(false);
    expect(isPwaCacheError(new Error("404 Not Found"))).toBe(false);
  });
});
