import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Phase 1 de l'i18n (docs/production/I18N_MIGRATION_PLAN.md) — bascule
 * fr/en. La langue par défaut reste "fr" tant que la Phase 3 (dérivée de
 * profile.country, comme useCurrency()) n'est pas faite ; ce sélecteur ne
 * fait qu'overrider manuellement, sans persistance côté serveur pour
 * l'instant (repart à "fr" au prochain chargement complet de l'app).
 */
export function LanguageSelector() {
  const { i18n } = useTranslation();

  return (
    <Select value={i18n.language} onValueChange={(value) => i18n.changeLanguage(value)}>
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
