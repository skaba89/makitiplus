/**
 * Tax calculation helpers.
 * Convention: product.price is stored as TTC (tax-inclusive).
 */

export interface TaxBreakdown {
  rate: number; // %
  ttc: number; // tax-inclusive (price as stored)
  ht: number; // tax-exclusive
  taxAmount: number; // ttc - ht
}

export function computeTax(
  priceTTC: number,
  productTaxRate: number | null | undefined,
  orgDefaultRate: number | null | undefined
): TaxBreakdown {
  const rate =
    productTaxRate !== null && productTaxRate !== undefined
      ? Number(productTaxRate)
      : Number(orgDefaultRate ?? 0);
  const safeRate = isFinite(rate) && rate >= 0 ? rate : 0;
  const ht = safeRate > 0 ? priceTTC / (1 + safeRate / 100) : priceTTC;
  return {
    rate: safeRate,
    ttc: priceTTC,
    ht,
    taxAmount: priceTTC - ht,
  };
}
