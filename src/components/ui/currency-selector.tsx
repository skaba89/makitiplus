import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/hooks/useCurrency";
import { UNIQUE_CURRENCIES, DEFAULT_CURRENCY, getCurrencyByCode } from "@/utils/currencies";
import { useToast } from "@/hooks/use-toast";
import { Coins } from "lucide-react";

interface CurrencySelectorProps {
  /** "compact" = just the symbol badge with dropdown; "full" = label + dropdown */
  variant?: "compact" | "full";
  className?: string;
}

export const CurrencySelector = ({
  variant = "compact",
  className = "",
}: CurrencySelectorProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { currency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const currentCode = currency.code;

  const handleChange = async (code: string) => {
    if (code === currentCode || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ currency: code })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      const newCurrency = getCurrencyByCode(code);
      toast({
        title: "Devise mise à jour",
        description: `La devise est maintenant ${newCurrency?.name || code} (${newCurrency?.symbol || code})`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de changer la devise",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (variant === "compact") {
    return (
      <Select value={currentCode} onValueChange={handleChange} disabled={isSaving}>
        <SelectTrigger
          className={`w-auto min-w-[80px] h-8 gap-1 text-xs font-semibold border-none bg-muted/60 hover:bg-muted px-2 ${className}`}
        >
          <Coins className="h-3.5 w-3.5 text-primary" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {UNIQUE_CURRENCIES.map((cur) => (
            <SelectItem key={cur.code} value={cur.code}>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{cur.displaySymbol || cur.symbol}</span>
                <span className="text-muted-foreground text-xs">{cur.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Full variant
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        Devise
      </label>
      <Select value={currentCode} onValueChange={handleChange} disabled={isSaving}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {UNIQUE_CURRENCIES.map((cur) => (
            <SelectItem key={cur.code} value={cur.code}>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{cur.displaySymbol || cur.symbol}</span>
                <span className="text-muted-foreground">—</span>
                <span>{cur.name}</span>
                <span className="text-muted-foreground text-xs">({cur.code})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Devise utilisée pour les prix, tickets et rapports
      </p>
    </div>
  );
};
