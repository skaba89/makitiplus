import { useState, useRef } from "react";
import { useBranding, hslToHex, hexToHsl, type BrandingConfig } from "@/contexts/BrandingContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Palette, Upload, X, Sun, Moon, Monitor, Image, FileText, Type, Languages, Eye } from "lucide-react";

const PRESET_COLORS = [
  { name: "Terracotta", hsl: "16 80% 50%", hex: "#E8612D" },
  { name: "Bleu Océan", hsl: "210 80% 50%", hex: "#1A8FE3" },
  { name: "Vert Forêt", hsl: "152 60% 42%", hex: "#2BA84A" },
  { name: "Violet Royal", hsl: "270 70% 55%", hex: "#8B47CB" },
  { name: "Or Solaire", hsl: "45 90% 50%", hex: "#F5A623" },
  { name: "Rose Sahel", hsl: "340 75% 50%", hex: "#D6336C" },
  { name: "Indigo Nuit", hsl: "230 70% 50%", hex: "#2643E4" },
  { name: "Émeraude", hsl: "160 65% 40%", hex: "#249A6B" },
  { name: "Rouge Feu", hsl: "0 75% 50%", hex: "#D42020" },
  { name: "Cyan Tropical", hsl: "185 80% 45%", hex: "#16A0B8" },
];

const RECEIPT_TEMPLATES: { value: BrandingConfig["receiptTemplate"]; label: string; description: string }[] = [
  { value: "default", label: "Classique", description: "Ticket standard avec logo et détails complets" },
  { value: "minimal", label: "Minimaliste", description: "Ticket épuré, essentiel uniquement" },
  { value: "detailed", label: "Détaillé", description: "Ticket complet avec TVA et informations légales" },
  { value: "african", label: "Africain", description: "Motifs africains et couleurs chaudes" },
];

const FONT_OPTIONS = [
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans (défaut)" },
  { value: "Inter", label: "Inter" },
  { value: "Poppins", label: "Poppins" },
  { value: "Nunito", label: "Nunito" },
  { value: "Roboto", label: "Roboto" },
];

const LANGUAGE_OPTIONS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
];

export const BrandingSettings = () => {
  const { branding, updateBranding, uploadLogo, removeLogo, isLoading } = useBranding();
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [appName, setAppName] = useState(branding.appName);
  const [customColor, setCustomColor] = useState(hslToHex(branding.brandColor));
  const [customAccent, setCustomAccent] = useState(hslToHex(branding.accentColor));

  const handleSave = async (updates: Partial<BrandingConfig>) => {
    setIsSaving(true);
    try {
      await updateBranding(updates);
      toast({ title: "Personnalisation enregistrée" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de sauvegarder la personnalisation",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Fichier trop grand",
        description: "Le logo doit faire moins de 2 Mo",
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadLogo(file);
      toast({ title: "Logo mis à jour" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'uploader le logo",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await removeLogo();
      toast({ title: "Logo supprimé" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer le logo",
      });
    }
  };

  const handleColorSelect = async (hsl: string) => {
    setCustomColor(hslToHex(hsl));
    await handleSave({ brandColor: hsl });
  };

  const handleCustomColorChange = async (hex: string) => {
    setCustomColor(hex);
    const hsl = hexToHsl(hex);
    await handleSave({ brandColor: hsl });
  };

  const handleAccentColorChange = async (hex: string) => {
    setCustomAccent(hex);
    const hsl = hexToHsl(hex);
    await handleSave({ accentColor: hsl });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* App Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Nom de l'application
          </CardTitle>
          <CardDescription>
            Personnalisez le nom affiché dans la barre latérale et sur les tickets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Ma Boutique"
              />
            </div>
            <Button
              onClick={() => handleSave({ appName })}
              disabled={isSaving || appName === branding.appName}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Logo
          </CardTitle>
          <CardDescription>
            Logo affiché dans la barre latérale et sur les tickets de caisse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {/* Logo Preview */}
            <div className="w-20 h-20 rounded-xl bg-hero-gradient flex items-center justify-center overflow-hidden border-2 border-border">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-primary-foreground">
                  {branding.appName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full gap-2"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {isUploading ? "Chargement..." : "Uploader un logo"}
              </Button>
              {branding.logoUrl && (
                <Button
                  variant="outline"
                  onClick={handleRemoveLogo}
                  className="w-full gap-2 text-destructive"
                >
                  <X className="h-4 w-4" />
                  Supprimer le logo
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP ou SVG. Max 2 Mo.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Primary Color */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Couleur principale
          </CardTitle>
          <CardDescription>
            Couleur des boutons, liens et éléments importants de l'interface
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset colors */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.hsl}
                onClick={() => handleColorSelect(color.hsl)}
                className="group flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all hover:scale-105"
                style={{
                  borderColor:
                    branding.brandColor === color.hsl
                      ? color.hex
                      : "transparent",
                  backgroundColor:
                    branding.brandColor === color.hsl
                      ? `${color.hex}10`
                      : "transparent",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full shadow-md group-hover:shadow-lg transition-shadow"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-micro text-muted-foreground font-medium truncate w-full text-center">
                  {color.name}
                </span>
              </button>
            ))}
          </div>

          {/* Custom color picker */}
          <div className="flex items-center gap-3 pt-2">
            <Label className="text-sm whitespace-nowrap">Couleur personnalisée</Label>
            <div className="relative">
              <input
                type="color"
                value={customColor}
                onChange={(e) => handleCustomColorChange(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border"
              />
            </div>
            <Input
              value={customColor}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              className="w-32 font-mono text-sm"
              placeholder="#E8612D"
            />
          </div>
        </CardContent>
      </Card>

      {/* Accent Color */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Couleur d'accent
          </CardTitle>
          <CardDescription>
            Couleur secondaire pour les surlignages et les badges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="color"
                value={customAccent}
                onChange={(e) => handleAccentColorChange(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border"
              />
            </div>
            <Input
              value={customAccent}
              onChange={(e) => handleAccentColorChange(e.target.value)}
              className="w-32 font-mono text-sm"
              placeholder="#F5E6D3"
            />
            <div
              className="flex-1 h-10 rounded-lg border flex items-center justify-center text-sm font-medium"
              style={{ backgroundColor: customAccent }}
            >
              Aperçu
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Theme Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5" />
            Mode d'affichage
          </CardTitle>
          <CardDescription>
            Choisissez entre le mode clair, sombre ou automatique
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "light" as const, icon: Sun, label: "Clair" },
              { value: "dark" as const, icon: Moon, label: "Sombre" },
              { value: "system" as const, icon: Monitor, label: "Système" },
            ]).map((mode) => (
              <button
                key={mode.value}
                onClick={() => handleSave({ themeMode: mode.value })}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  branding.themeMode === mode.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <mode.icon className={`h-6 w-6 ${
                  branding.themeMode === mode.value ? "text-primary" : "text-muted-foreground"
                }`} />
                <span className={`text-sm font-medium ${
                  branding.themeMode === mode.value ? "text-primary" : "text-muted-foreground"
                }`}>
                  {mode.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Receipt Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Modèle de ticket
          </CardTitle>
          <CardDescription>
            Choisissez le style de vos tickets de caisse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {RECEIPT_TEMPLATES.map((template) => (
              <button
                key={template.value}
                onClick={() => handleSave({ receiptTemplate: template.value })}
                className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all text-left ${
                  branding.receiptTemplate === template.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className={`text-sm font-semibold ${
                  branding.receiptTemplate === template.value ? "text-primary" : "text-foreground"
                }`}>
                  {template.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font Family */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Police d'écriture
          </CardTitle>
          <CardDescription>
            Police utilisée dans toute l'application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={branding.fontFamily}
            onValueChange={(value) => handleSave({ fontFamily: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  <span style={{ fontFamily: font.value }}>{font.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Langue
          </CardTitle>
          <CardDescription>
            Langue de l'interface de l'application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={branding.language}
            onValueChange={(value) => handleSave({ language: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Aperçu en direct
          </CardTitle>
          <CardDescription>
            Voici comment votre application apparaît avec les paramètres actuels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            {/* Mini sidebar preview */}
            <div className="flex">
              <div
                className="w-16 p-2 space-y-2 border-r"
                style={{ backgroundColor: `hsl(${branding.accentColor} / 0.3)` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto"
                  style={{ background: `linear-gradient(135deg, hsl(${branding.brandColor}), hsl(${branding.accentColor}))` }}
                >
                  {branding.logoUrl ? (
                    <img src={branding.logoUrl} alt="" className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-white">
                      {branding.appName.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 pt-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 rounded-full mx-1"
                      style={{
                        backgroundColor: i === 1 ? `hsl(${branding.brandColor})` : `hsl(${branding.brandColor} / 0.3)`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex-1 p-3 space-y-2">
                <div
                  className="h-2 w-24 rounded-full"
                  style={{ backgroundColor: `hsl(${branding.brandColor})` }}
                />
                <div className="h-1.5 w-32 rounded-full bg-muted" />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-8 rounded-lg"
                      style={{ backgroundColor: `hsl(${branding.brandColor} / 0.1)` }}
                    />
                  ))}
                </div>
                <div
                  className="h-7 w-full rounded-lg flex items-center justify-center text-micro text-white font-medium"
                  style={{ backgroundColor: `hsl(${branding.brandColor})` }}
                >
                  Bouton principal
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
