-- Ajout d'un taux de taxe par défaut au niveau organisation et override par produit
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_tax_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_rate numeric;

COMMENT ON COLUMN public.organizations.default_tax_rate IS 'Taux de taxe par défaut en % (ex: 18 pour TVA Sénégal). 0 = pas de taxe.';
COMMENT ON COLUMN public.products.tax_rate IS 'Taux de taxe spécifique au produit en %. NULL = utiliser le taux de la boutique. Le prix produit est considéré TTC.';