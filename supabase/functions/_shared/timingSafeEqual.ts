/**
 * Timing-safe string comparison to prevent timing side-channel attacks.
 *
 * Uses XOR to compare all bytes regardless of differences, ensuring
 * the comparison always takes the same time regardless of where
 * (or whether) the strings differ.
 *
 * Returns true if the strings are identical, false otherwise.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encA = new TextEncoder().encode(a);
  const encB = new TextEncoder().encode(b);
  if (encA.byteLength !== encB.byteLength) return false;
  const diff = new Uint8Array(encA.byteLength);
  for (let i = 0; i < encA.byteLength; i++) diff[i] = encA[i] ^ encB[i];
  return diff.every(v => v === 0);
}
