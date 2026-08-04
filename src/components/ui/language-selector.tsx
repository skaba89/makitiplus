import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportError } from "@/lib/sentry";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — bascule fr/en,
 * désormais persistée dans profiles.language (même pattern que
 * currency-selector.tsx pour profiles.currency). La langue par défaut reste
 * "fr" tant qu'aucun profil n'a de langue enregistrée (voir src/i18n/config.ts).
 * L'échec de la persistance (offline, RLS) ne bloque jamais le changement
 * visuel immédiat -- seule la prochaine session repartirait en français.
 */
export function LanguageSelector() {
  const { i18n } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (value: string) => {
    i18n.changeLanguage(value);
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ language: value })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
    } catch (e) {
      // Non bloquant : la langue reste changée à l'écran même si la
      // persistance échoue (offline, réseau) -- elle sera juste réinitialisée
      // au prochain chargement complet.
      reportError(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Select value={i18n.language} onValueChange={handleChange} disabled={isSaving}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fr">Français</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );
}
