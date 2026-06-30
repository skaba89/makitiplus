import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useThemeSettings, TEMPLATE_PRESETS, type TemplateName, type StoreSettings } from "@/contexts/ThemeContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Palette,
  Upload,
  Store,
  Receipt,
  LayoutTemplate,
  Eye,
  RotateCcw,
  Loader2,
  Check,
  Image as ImageIcon,
  Printer,
  Sun,
  Moon,
  Monitor,
  Type,
  Languages,
  Tag,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

const hslStringToHex = (hsl: string): string => {
  const parts = hsl.split(/\s+/);
  if (parts.length !== 3) return BRAND_DEFAULTS.primary;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  const a = (s * Math.min(l, 100 - l)) / 10000;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const hexToHslString = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const DEFAULT_COLORS = {
  primary: "16 80% 50%",
  secondary: "38 60% 92%",
  accent: "38 70% 88%",
  success: "152 60% 42%",
};

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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const StoreCustomization = () => {
  const { profile, user } = useAuth();
  const { settings, isLoading, updateSettings, resetTheme } = useThemeSettings();
  const { branding, updateBranding } = useBranding();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Color state
  const [primaryHex, setPrimaryHex] = useState(
    settings?.primary_color ? hslStringToHex(settings.primary_color) : BRAND_DEFAULTS.primary
  );
  const [secondaryHex, setSecondaryHex] = useState(
    settings?.secondary_color ? hslStringToHex(settings.secondary_color) : BRAND_DEFAULTS.secondary
  );
  const [accentHex, setAccentHex] = useState(
    settings?.accent_color ? hslStringToHex(settings.accent_color) : BRAND_DEFAULTS.accent
  );
  const [successHex, setSuccessHex] = useState(
    settings?.success_color ? hslStringToHex(settings.success_color) : BRAND_DEFAULTS.success
  );

  // Receipt state
  const [receiptFooter, setReceiptFooter] = useState(settings?.receipt_footer || "");
  const [receiptShowLogo, setReceiptShowLogo] = useState(settings?.receipt_show_logo ?? true);
  const [receiptShowTax, setReceiptShowTax] = useState(settings?.receipt_show_tax ?? true);

  // Store name
  const [storeName, setStoreName] = useState(settings?.store_name || profile?.business_name || "");

  // Template
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>(
    (settings?.template as TemplateName) || "default"
  );

  // Sync state when settings load
  useEffect(() => {
    if (settings) {
      setPrimaryHex(settings.primary_color ? hslStringToHex(settings.primary_color) : "#E8612D");
      setSecondaryHex(settings.secondary_color ? hslStringToHex(settings.secondary_color) : "#FAF0E2");
      setAccentHex(settings.accent_color ? hslStringToHex(settings.accent_color) : "#F5E6CE");
      setSuccessHex(settings.success_color ? hslStringToHex(settings.success_color) : "#2BA84A");
      setReceiptFooter(settings.receipt_footer || "");
      setReceiptShowLogo(settings.receipt_show_logo ?? true);
      setReceiptShowTax(settings.receipt_show_tax ?? true);
      setStoreName(settings.store_name || profile?.business_name || "");
      setSelectedTemplate((settings.template as TemplateName) || "default");
      setReceiptPaperSize(
        (settings.extra_settings as Record<string, string>)?.receiptPaperSize as "58mm" | "80mm" | "A4" || "80mm"
      );
    }
  }, [settings, profile?.business_name]);

  // Update color and apply in real-time
  const handleColorChange = useCallback(
    async (colorName: "primary_color" | "secondary_color" | "accent_color" | "success_color", hexValue: string) => {
      const hslValue = hexToHslString(hexValue);
      if (colorName === "primary_color") setPrimaryHex(hexValue);
      if (colorName === "secondary_color") setSecondaryHex(hexValue);
      if (colorName === "accent_color") setAccentHex(hexValue);
      if (colorName === "success_color") setSuccessHex(hexValue);

      const root = document.documentElement;
      root.style.setProperty(`--${colorName.replace("_color", "")}`, hslValue);
      if (colorName === "primary_color") {
        root.style.setProperty("--ring", hslValue);
        root.style.setProperty("--sidebar-primary", hslValue);
      }
      await updateSettings({ [colorName]: hslValue });
    },
    [updateSettings]
  );

  // Apply template preset
  const applyTemplate = useCallback(
    async (templateName: TemplateName) => {
      const preset = TEMPLATE_PRESETS[templateName];
      setSelectedTemplate(templateName);
      setPrimaryHex(hslStringToHex(preset.primary));
      setSecondaryHex(hslStringToHex(preset.secondary));
      setAccentHex(hslStringToHex(preset.accent));

      await updateSettings({
        template: templateName,
        primary_color: preset.primary,
        secondary_color: preset.secondary,
        accent_color: preset.accent,
      });

      toast({
        title: `Template "${preset.label}" appliqué`,
        description: preset.description,
      });
    },
    [updateSettings, toast]
  );

  // Logo upload
  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Fichier trop volumineux", description: "Le logo doit faire moins de 2 Mo" });
        return;
      }

      setIsUploading(true);
      try {
        const ext = file.name.split(".").pop();
        const path = `${profile?.organization_id}/logo.${ext}`;
        await supabase.storage.from("logos").remove([path]);
        const { error: uploadError } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
        const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        await updateSettings({ logo_url: logoUrl });
        toast({ title: "Logo mis à jour" });
      } catch {
        toast({ variant: "destructive", title: "Erreur d'upload", description: "Impossible de charger le logo" });
      } finally {
        setIsUploading(false);
      }
    },
    [profile?.organization_id, updateSettings, toast]
  );

  const handleSaveStoreName = useCallback(async () => {
    await updateSettings({ store_name: storeName });
    toast({ title: "Nom du magasin enregistré" });
  }, [storeName, updateSettings, toast]);

  const handleSaveReceiptSettings = useCallback(async () => {
    await updateSettings({
      receipt_footer: receiptFooter,
      receipt_show_logo: receiptShowLogo,
      receipt_show_tax: receiptShowTax,
      extra_settings: { ...currentExtra, receiptPaperSize },
    });
    toast({ title: "Paramètres de ticket enregistrés" });
  }, [receiptFooter, receiptShowLogo, receiptShowTax, updateSettings, toast]);

  const handleReset = useCallback(async () => {
    resetTheme();
    await updateSettings({
      primary_color: DEFAULT_COLORS.primary,
      secondary_color: DEFAULT_COLORS.secondary,
      accent_color: DEFAULT_COLORS.accent,
      success_color: DEFAULT_COLORS.success,
      template: "default",
    });
    setPrimaryHex(hslStringToHex(DEFAULT_COLORS.primary));
    setSecondaryHex(hslStringToHex(DEFAULT_COLORS.secondary));
    setAccentHex(hslStringToHex(DEFAULT_COLORS.accent));
    setSuccessHex(hslStringToHex(DEFAULT_COLORS.success));
    setSelectedTemplate("default");
    toast({ title: "Thème réinitialisé" });
  }, [updateSettings, resetTheme, toast]);

  // Branding (theme mode, font, language)
  const handleSaveBranding = useCallback(async (updates: Record<string, string>) => {
    await updateBranding(updates);
    toast({ title: "Paramètres enregistrés" });
  }, [updateBranding, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="branding" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="branding" className="gap-1.5 text-xs sm:text-sm">
            <Store className="h-4 w-4 hidden sm:block" />
            Marque
          </TabsTrigger>
          <TabsTrigger value="colors" className="gap-1.5 text-xs sm:text-sm">
            <Palette className="h-4 w-4 hidden sm:block" />
            Couleurs
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-1.5 text-xs sm:text-sm">
            <LayoutTemplate className="h-4 w-4 hidden sm:block" />
            Template
          </TabsTrigger>
          <TabsTrigger value="receipt" className="gap-1.5 text-xs sm:text-sm">
            <Receipt className="h-4 w-4 hidden sm:block" />
            Ticket
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5 text-xs sm:text-sm">
            <Type className="h-4 w-4 hidden sm:block" />
            Avancé
          </TabsTrigger>
        </TabsList>

        {/* ═══ BRANDING TAB ═══ */}
        <TabsContent value="branding" className="space-y-6 mt-6">
          {/* Logo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Logo du magasin
              </CardTitle>
              <CardDescription>
                Ce logo apparaîtra dans la barre latérale, les tickets et l'application mobile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
                  {settings?.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <Store className="h-10 w-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="gap-2">
                    {isUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</> : <><Upload className="h-4 w-4" />{settings?.logo_url ? "Changer le logo" : "Ajouter un logo"}</>}
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP ou SVG — Max 2 Mo</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Store Name */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Nom du magasin
              </CardTitle>
              <CardDescription>Ce nom sera affiché dans l'application, sur les tickets et dans les notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Nom de votre magasin" className="flex-1" />
                <Button onClick={handleSaveStoreName} disabled={!storeName.trim()}>Enregistrer</Button>
              </div>
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-sm text-muted-foreground mb-3">Aperçu dans la barre latérale</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-hero-gradient flex items-center justify-center">
                    {settings?.logo_url ? (
                      <img src={settings.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
                    ) : (
                      <span className="text-lg font-bold text-primary-foreground">{storeName?.[0]?.toUpperCase() || "S"}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{storeName || "Mon Magasin"}</p>
                    <p className="text-xs text-muted-foreground">MakitiPlus</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ COLORS TAB ═══ */}
        <TabsContent value="colors" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Couleurs de l'application
              </CardTitle>
              <CardDescription>Personnalisez les couleurs de votre interface. Les changements sont appliqués en temps réel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: "Couleur principale", desc: "Boutons, liens, éléments actifs", hex: primaryHex, setter: setPrimaryHex, key: "primary_color" as const },
                  { label: "Couleur secondaire", desc: "Fonds, badges, arrière-plans", hex: secondaryHex, setter: setSecondaryHex, key: "secondary_color" as const },
                  { label: "Couleur d'accent", desc: "Surbrillance, mises en valeur", hex: accentHex, setter: setAccentHex, key: "accent_color" as const },
                  { label: "Couleur de succès", desc: "Confirmations, paiements réussis", hex: successHex, setter: setSuccessHex, key: "success_color" as const },
                ].map((color) => (
                  <div key={color.key} className="space-y-3">
                    <Label className="text-sm font-medium">{color.label}</Label>
                    <p className="text-xs text-muted-foreground">{color.desc}</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={color.hex}
                        onChange={(e) => handleColorChange(color.key, e.target.value)}
                        className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer"
                      />
                      <Input
                        value={color.hex}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9a-fA-F]{6}$/.test(val)) handleColorChange(color.key, val);
                          color.setter(val);
                        }}
                        className="flex-1 font-mono"
                        maxLength={7}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Preview */}
              <div className="p-6 bg-muted rounded-xl space-y-4">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Aperçu en direct
                </p>
                <div className="flex flex-wrap gap-3">
                  <button className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: primaryHex }}>Bouton principal</button>
                  <button className="px-6 py-2.5 rounded-xl text-sm font-semibold border-2" style={{ borderColor: primaryHex, color: primaryHex, backgroundColor: secondaryHex }}>Bouton secondaire</button>
                  <span className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: accentHex }}>Badge accent</span>
                  <span className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: successHex }}>Paiement réussi</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: `linear-gradient(135deg, ${primaryHex} 0%, ${secondaryHex} 100%)` }} />
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Réinitialiser les couleurs
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TEMPLATE TAB ═══ */}
        <TabsContent value="template" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5" />
                Templates prédéfinis
              </CardTitle>
              <CardDescription>Choisissez un template pour appliquer un ensemble de couleurs cohérent en un clic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Object.entries(TEMPLATE_PRESETS) as [TemplateName, typeof TEMPLATE_PRESETS[TemplateName]][]).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyTemplate(key)}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:shadow-md ${
                      selectedTemplate === key ? "border-primary bg-primary/5 shadow-soft" : "border-border hover:border-primary/30"
                    }`}
                  >
                    {selectedTemplate === key && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="flex gap-1.5 mb-3">
                      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: hslStringToHex(preset.primary) }} />
                      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: hslStringToHex(preset.secondary) }} />
                      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: hslStringToHex(preset.accent) }} />
                    </div>
                    <h3 className="font-semibold text-sm">{preset.label}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ RECEIPT TAB ═══ */}
        <TabsContent value="receipt" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Personnalisation du ticket de caisse
              </CardTitle>
              <CardDescription>Configurez l'apparence de vos tickets de caisse imprimés et envoyés</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Paper size */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  <Label>Format du papier</Label>
                </div>
                <p className="text-xs text-muted-foreground">Choisissez le format adapté à votre imprimante</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "58mm" as const, label: "58 mm", desc: "Thermique compact" },
                    { value: "80mm" as const, label: "80 mm", desc: "Thermique standard" },
                    { value: "A4" as const, label: "A4", desc: "Imprimante bureau" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setReceiptPaperSize(option.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center ${
                        receiptPaperSize === option.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${receiptPaperSize === option.value ? "text-primary" : "text-foreground"}`}>{option.label}</span>
                      <span className="text-[10px] text-muted-foreground">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4" />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Afficher le logo sur le ticket</Label>
                  <p className="text-xs text-muted-foreground">Le logo apparaîtra en haut du ticket de caisse</p>
                </div>
                <Switch checked={receiptShowLogo} onCheckedChange={setReceiptShowLogo} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Afficher les taxes</Label>
                  <p className="text-xs text-muted-foreground">Détail des taxes sur le ticket de caisse</p>
                </div>
                <Switch checked={receiptShowTax} onCheckedChange={setReceiptShowTax} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt-footer">Pied de ticket</Label>
                <Textarea id="receipt-footer" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="Merci de votre achat !&#10;À bientôt chez nous." rows={3} />
                <p className="text-xs text-muted-foreground">Texte affiché en bas de chaque ticket de caisse</p>
              </div>

              {/* Receipt preview */}
              <div className="p-4 bg-white text-black rounded-lg max-w-[280px] mx-auto border shadow-sm font-mono text-xs">
                <div className="text-center">
                  {receiptShowLogo && settings?.logo_url && (
                    <img src={settings.logo_url} alt="" className="w-12 h-12 mx-auto object-contain mb-2" />
                  )}
                  <p className="font-bold text-sm">{storeName || "Mon Magasin"}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{profile?.address || "Conakry, Guinée"}</p>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <p className="text-micro">Vente #001</p>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <div className="flex justify-between"><span>Produit x2</span><span>10 000 GNF</span></div>
                  <div className="flex justify-between mt-1"><span>Boisson x1</span><span>2 000 GNF</span></div>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  {receiptShowTax && (
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>TVA</span><span>1 080 GNF</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold mt-1"><span>Total</span><span>13 080 GNF</span></div>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  {receiptFooter && (
                    <p className="text-[10px] text-gray-500 italic text-center whitespace-pre-line">{receiptFooter}</p>
                  )}
                </div>
              </div>

              <Button onClick={handleSaveReceiptSettings} className="w-full" size="lg">
                Enregistrer les paramètres du ticket
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ ADVANCED TAB (Theme, Font, Language) ═══ */}
        <TabsContent value="advanced" className="space-y-6 mt-6">
          {/* Theme Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5" />
                Mode d'affichage
              </CardTitle>
              <CardDescription>Choisissez entre le mode clair, sombre ou automatique</CardDescription>
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
                    onClick={() => handleSaveBranding({ themeMode: mode.value })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      branding.themeMode === mode.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <mode.icon className={`h-6 w-6 ${branding.themeMode === mode.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${branding.themeMode === mode.value ? "text-primary" : "text-muted-foreground"}`}>{mode.label}</span>
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
              <CardDescription>Police utilisée dans toute l'application</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={branding.fontFamily} onValueChange={(value) => handleSaveBranding({ fontFamily: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      <span style={{ fontFamily: font.value }}>{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Font preview */}
              <div className="mt-4 p-4 bg-muted rounded-xl">
                <p className="text-sm text-muted-foreground mb-2">Aperçu</p>
                <p className="text-lg font-bold" style={{ fontFamily: branding.fontFamily }}>MakitiPlus — {branding.fontFamily}</p>
                <p className="text-sm" style={{ fontFamily: branding.fontFamily }}>0123456789 — Prix: 15 000 GNF</p>
              </div>
            </CardContent>
          </Card>

          {/* Language */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5" />
                Langue
              </CardTitle>
              <CardDescription>Langue de l'interface de l'application</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={branding.language} onValueChange={(value) => handleSaveBranding({ language: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Receipt template style */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Style de ticket
              </CardTitle>
              <CardDescription>Modèle de mise en page pour vos tickets de caisse</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "default", label: "Classique", desc: "Ticket standard avec logo et détails" },
                  { value: "minimal", label: "Minimaliste", desc: "Ticket épuré, essentiel uniquement" },
                  { value: "detailed", label: "Détaillé", desc: "Ticket complet avec TVA" },
                  { value: "african", label: "Africain", desc: "Motifs africains et couleurs chaudes" },
                ].map((tpl) => (
                  <button
                    key={tpl.value}
                    onClick={() => handleSaveBranding({ receiptTemplate: tpl.value as "default" | "minimal" | "detailed" | "african" })}
                    className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all text-left ${
                      branding.receiptTemplate === tpl.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <span className={`text-sm font-semibold ${branding.receiptTemplate === tpl.value ? "text-primary" : "text-foreground"}`}>{tpl.label}</span>
                    <span className="text-xs text-muted-foreground">{tpl.desc}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Aperçu en direct
              </CardTitle>
              <CardDescription>Voici comment votre application apparaît avec les paramètres actuels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border overflow-hidden">
                <div className="flex">
                  <div className="w-16 p-2 space-y-2 border-r" style={{ backgroundColor: `hsl(${branding.accentColor} / 0.3)` }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto" style={{ background: `linear-gradient(135deg, hsl(${branding.brandColor}), hsl(${branding.accentColor}))` }}>
                      {settings?.logo_url ? (
                        <img src={settings.logo_url} alt="" className="w-6 h-6 rounded object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-white">{branding.appName.charAt(0)}</span>
                      )}
                    </div>
                    <div className="space-y-1.5 pt-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-1.5 rounded-full mx-1" style={{ backgroundColor: i === 1 ? `hsl(${branding.brandColor})` : `hsl(${branding.brandColor} / 0.3)` }} />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 p-3 space-y-2">
                    <div className="h-2 w-24 rounded-full" style={{ backgroundColor: `hsl(${branding.brandColor})` }} />
                    <div className="h-1.5 w-32 rounded-full bg-muted" />
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-8 rounded-lg" style={{ backgroundColor: `hsl(${branding.brandColor} / 0.1)` }} />
                      ))}
                    </div>
                    <div className="h-7 w-full rounded-lg flex items-center justify-center text-[10px] text-white font-medium" style={{ backgroundColor: `hsl(${branding.brandColor})`, fontFamily: branding.fontFamily }}>
                      Bouton principal
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StoreCustomization;
