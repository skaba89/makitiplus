import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Coins, RefreshCw, Info } from "lucide-react";
import {
  UNIQUE_CURRENCIES,
  getCurrencyByCode,
  CurrencyConfig,
} from "@/utils/currencies";

export interface CurrencyDisplaySelectorProps {
  /** Devise de base (devise org) — les prix stockés sont dans cette devise */
  orgCurrencyCode: string;
  /** Devise d'affichage actuellement sélectionnée */
  displayCurrencyCode: string;
  /** Callback appelé quand l'utilisateur change de devise d'affichage */
  onDisplayCurrencyChange: (code: string) => void;
  /** Date de mise à jour des taux (optionnel) */
  ratesUpdatedAt?: string | null;
  /** true si les taux sont en cours de chargement */
  ratesLoading?: boolean;
  /** Fonction pour rafraîchir les taux */
  onRefreshRates?: () => void;
  /** Label affiché avant le sélecteur (défaut: "Devise d'affichage") */
  label?: string;
}

/**
 * Sélecteur de devise d'affichage avec indicateur de taux de change.
 * Permet à l'utilisateur de choisir dans quelle devise afficher les prix,
 * convertis automatiquement depuis la devise org au taux réel.
 */
export function CurrencyDisplaySelector({
  orgCurrencyCode,
  displayCurrencyCode,
  onDisplayCurrencyChange,
  ratesUpdatedAt,
  ratesLoading,
  onRefreshRates,
  label = "Devise d'affichage",
}: CurrencyDisplaySelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const orgCurrency = getCurrencyByCode(orgCurrencyCode);
  const displayCurrency = getCurrencyByCode(displayCurrencyCode);
  const isConverted = displayCurrencyCode !== orgCurrencyCode;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Coins className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{displayCurrency?.symbol || displayCurrencyCode}</span>
          {isConverted && (
            <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">
              conv
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Conversion de devise
          </DialogTitle>
          <DialogDescription>
            Affichez les prix dans la devise de votre choix, convertis au taux de change réel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Devise org (lecture seule) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Devise de l'organisation (stockage)
            </Label>
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
              <span className="text-lg">{orgCurrency?.symbol}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{orgCurrency?.name || orgCurrencyCode}</p>
                <p className="text-xs text-muted-foreground">{orgCurrencyCode}</p>
              </div>
              <span className="text-xs text-muted-foreground">Référence</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Les prix sont stockés dans cette devise. La conversion ne modifie pas les données.
            </p>
          </div>

          {/* Devise d'affichage (sélectionnable) */}
          <div className="space-y-2">
            <Label htmlFor="display-currency">{label}</Label>
            <Select value={displayCurrencyCode} onValueChange={onDisplayCurrencyChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une devise" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {UNIQUE_CURRENCIES.map((cur: CurrencyConfig) => (
                  <SelectItem key={cur.code} value={cur.code}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs w-10">{cur.symbol}</span>
                      <span>{cur.name}</span>
                      <span className="text-xs text-muted-foreground">({cur.code})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Indicateur de taux */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <Info className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Taux de change en temps réel</span>
            </div>
            {ratesLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Chargement des taux…
              </p>
            ) : ratesUpdatedAt ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Source : open.er-api.com (European Central Bank)
                </p>
                <p className="text-xs text-muted-foreground">
                  Mis à jour : {new Date(ratesUpdatedAt).toLocaleString("fr-FR")}
                </p>
                {onRefreshRates && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={onRefreshRates}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Rafraîchir
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Taux indisponibles — les prix s'affichent dans la devise org.
              </p>
            )}
          </div>

          {isConverted && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
              ⚠️ Les prix affichés sont <strong>convertis</strong> depuis {orgCurrencyCode} vers {displayCurrencyCode}.
              Les montants saisis dans les formulaires restent en {orgCurrencyCode}.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
