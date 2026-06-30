import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
} from "lucide-react";

// Utility: parse HSL string "16 80% 50%" to hex for color input
const hslStringToHex = (hsl: string): string => {
  const parts = hsl.split(/\s+/);
  if (parts.length !== 3) return "#E8612D";
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);

  const a = (s * Math.min(l, 100 - l)) / 10000;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Utility: hex to HSL string
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
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const StoreCustomization = () => {
  const { profile } = useAuth();
  const { settings, isLoading, updateSettings, resetTheme } = useThemeSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Color state
  const [primaryHex, setPrimaryHex] = useState(
    settings?.primary_color ? hslStringToHex(settings.primary_color) : "#E8612D"
  );
  const [secondaryHex, setSecondaryHex] = useState(
    settings?.secondary_color ? hslStringToHex(settings.secondary_color) : "#FAF0E2"
  );
  const [accentHex, setAccentHex] = useState(
    settings?.accent_color ? hslStringToHex(settings.accent_color) : "#F5E6CE"
  );
  const [successHex, setSuccessHex] = useState(
    settings?.success_color ? hslStringToHex(settings.success_color) : "#2BA84A"
  );

  // Receipt state
  const [receiptFooter, setReceiptFooter] = useState(settings?.receipt_footer || "");
  const [receiptShowLogo, setReceiptShowLogo] = useState(settings?.receipt_show_logo ?? true);
  const [receiptShowTax, setReceiptShowTax] = useState(settings?.receipt_show_tax ?? true);
  const [receiptPaperSize, setReceiptPaperSize] = useState<"58mm" | "80mm" | "A4">(
    (settings?.extra_settings as Record<string, string>)?.receiptPaperSize as "58mm" | "80mm" | "A4" || "80mm"
  );

  // Store name
  const [storeName, setStoreName] = useState(settings?.store_name || profile?.business_name || "");

  // Template
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>(
    (settings?.template as TemplateName) || "default"
  );

  // Update color and apply in real-time
  const handleColorChange = useCallback(
    async (colorName: "primary_color" | "secondary_color" | "accent_color" | "success_color", hexValue: string) => {
      const hslValue = hexToHslString(hexValue);

      // Update local state
      if (colorName === "primary_color") setPrimaryHex(hexValue);
      if (colorName === "secondary_color") setSecondaryHex(hexValue);
      if (colorName === "accent_color") setAccentHex(hexValue);
      if (colorName === "success_color") setSuccessHex(hexValue);

      // Apply immediately via CSS for instant preview
      const root = document.documentElement;
      root.style.setProperty(`--${colorName.replace("_color", "")}`, hslValue);
      if (colorName === "primary_color") {
        root.style.setProperty("--ring", hslValue);
        root.style.setProperty("--sidebar-primary", hslValue);
      }

      // Save to DB (debounced naturally by React state batching)
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
        toast({
          variant: "destructive",
          title: "Fichier trop volumineux",
          description: "Le logo doit faire moins de 2 Mo",
        });
        return;
      }

      setIsUploading(true);
      try {
        const ext = file.name.split(".").pop();
        const path = `${profile?.organization_id}/logo.${ext}`;

        // Delete existing logo first
        await supabase.storage.from("logos").remove([path]);

        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
        const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

        await updateSettings({ logo_url: logoUrl });

        toast({
          title: "Logo mis à jour",
          description: "Votre logo a été enregistré avec succès",
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erreur d'upload",
          description: "Impossible de charger le logo",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [profile?.organization_id, updateSettings, toast]
  );

  // Save store name
  const handleSaveStoreName = useCallback(async () => {
    await updateSettings({ store_name: storeName });
    toast({ title: "Nom du magasin enregistré" });
  }, [storeName, updateSettings, toast]);

  // Save receipt settings
  const handleSaveReceiptSettings = useCallback(async () => {
    const currentExtra = (settings?.extra_settings as Record<string, unknown>) || {};
    await updateSettings({
      receipt_footer: receiptFooter,
      receipt_show_logo: receiptShowLogo,
      receipt_show_tax: receiptShowTax,
      extra_settings: {
        ...currentExtra,
        receiptPaperSize,
      },
    });
    toast({ title: "Paramètres de ticket enregistrés" });
  }, [receiptFooter, receiptShowLogo, receiptShowTax, receiptPaperSize, settings?.extra_settings, updateSettings, toast]);

  // Reset to defaults
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

  const DEFAULT_COLORS = {
    primary: "16 80% 50%",
    secondary: "38 60% 92%",
    accent: "38 70% 88%",
    success: "152 60% 42%",
  };

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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="branding" className="gap-2">
            <Store className="h-4 w-4 hidden sm:block" />
            Marque
          </TabsTrigger>
          <TabsTrigger value="colors" className="gap-2">
            <Palette className="h-4 w-4 hidden sm:block" />
            Couleurs
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-2">
            <LayoutTemplate className="h-4 w-4 hidden sm:block" />
            Template
          </TabsTrigger>
          <TabsTrigger value="receipt" className="gap-2">
            <Receipt className="h-4 w-4 hidden sm:block" />
            Ticket
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
                {/* Logo Preview */}
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
                  {settings?.logo_url ? (
                    <img
                      src={settings.logo_url}
                      alt="Logo"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <Store className="h-10 w-10 text-muted-foreground/40" />
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
                    className="gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        {settings?.logo_url ? "Changer le logo" : "Ajouter un logo"}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, WebP ou SVG — Max 2 Mo
                  </p>
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
              <CardDescription>
                Ce nom sera affiché dans l'application, sur les tickets et dans les notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Nom de votre magasin"
                  className="flex-1"
                />
                <Button onClick={handleSaveStoreName} disabled={!storeName.trim()}>
                  Enregistrer
                </Button>
              </div>
              {/* Live preview */}
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-sm text-muted-foreground mb-3">Aperçu dans la barre latérale</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-hero-gradient flex items-center justify-center">
                    {settings?.logo_url ? (
                      <img
                        src={settings.logo_url}
                        alt=""
                        className="w-8 h-8 rounded-lg object-contain"
                      />
                    ) : (
                      <span className="text-lg font-bold text-primary-foreground">
                        {storeName?.[0]?.toUpperCase() || "S"}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{storeName || "Mon Magasin"}</p>
                    <p className="text-xs text-muted-foreground">MalikiPlus</p>
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
              <CardDescription>
                Personnalisez les couleurs de votre interface. Les changements sont appliqués en temps réel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Color pickers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Couleur principale</Label>
                  <p className="text-xs text-muted-foreground">Boutons, liens, éléments actifs</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryHex}
                      onChange={(e) => handleColorChange("primary_color", e.target.value)}
                      className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer"
                    />
                    <Input
                      value={primaryHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          handleColorChange("primary_color", val);
                        }
                        setPrimaryHex(val);
                      }}
                      className="flex-1 font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>

                {/* Secondary */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Couleur secondaire</Label>
                  <p className="text-xs text-muted-foreground">Fonds, badges, arrière-plans</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={secondaryHex}
                      onChange={(e) => handleColorChange("secondary_color", e.target.value)}
                      className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer"
                    />
                    <Input
                      value={secondaryHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          handleColorChange("secondary_color", val);
                        }
                        setSecondaryHex(val);
                      }}
                      className="flex-1 font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>

                {/* Accent */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Couleur d'accent</Label>
                  <p className="text-xs text-muted-foreground">Surbrillance, mises en valeur</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accentHex}
                      onChange={(e) => handleColorChange("accent_color", e.target.value)}
                      className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer"
                    />
                    <Input
                      value={accentHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          handleColorChange("accent_color", val);
                        }
                        setAccentHex(val);
                      }}
                      className="flex-1 font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>

                {/* Success */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Couleur de succès</Label>
                  <p className="text-xs text-muted-foreground">Confirmations, paiements réussis</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={successHex}
                      onChange={(e) => handleColorChange("success_color", e.target.value)}
                      className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer"
                    />
                    <Input
                      value={successHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          handleColorChange("success_color", val);
                        }
                        setSuccessHex(val);
                      }}
                      className="flex-1 font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              <div className="p-6 bg-muted rounded-xl space-y-4">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Aperçu en direct
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ backgroundColor: primaryHex }}
                  >
                    Bouton principal
                  </button>
                  <button
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold border-2"
                    style={{ borderColor: primaryHex, color: primaryHex, backgroundColor: secondaryHex }}
                  >
                    Bouton secondaire
                  </button>
                  <span
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ backgroundColor: accentHex }}
                  >
                    Badge accent
                  </span>
                  <span
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ backgroundColor: successHex }}
                  >
                    Paiement réussi
                  </span>
                </div>
                <div
                  className="h-2 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${primaryHex} 0%, ${secondaryHex} 100%)`,
                  }}
                />
              </div>

              {/* Reset button */}
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Réinitialiser les couleurs par défaut
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
              <CardDescription>
                Choisissez un template pour appliquer un ensemble de couleurs cohérent en un clic
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Object.entries(TEMPLATE_PRESETS) as [TemplateName, typeof TEMPLATE_PRESETS[TemplateName]][]).map(
                  ([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyTemplate(key)}
                      className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:shadow-md ${
                        selectedTemplate === key
                          ? "border-primary bg-primary/5 shadow-soft"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      {selectedTemplate === key && (
                        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                      {/* Color preview */}
                      <div className="flex gap-1.5 mb-3">
                        <div
                          className="w-8 h-8 rounded-lg"
                          style={{ backgroundColor: hslStringToHex(preset.primary) }}
                        />
                        <div
                          className="w-8 h-8 rounded-lg"
                          style={{ backgroundColor: hslStringToHex(preset.secondary) }}
                        />
                        <div
                          className="w-8 h-8 rounded-lg"
                          style={{ backgroundColor: hslStringToHex(preset.accent) }}
                        />
                      </div>
                      <h3 className="font-semibold text-sm">{preset.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                    </button>
                  )
                )}
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
              <CardDescription>
                Configurez l'apparence de vos tickets de caisse imprimés et envoyés par email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Paper size */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  <Label>Format du papier</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Choisissez le format adapté à votre imprimante
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "58mm" as const, label: "58 mm", desc: "Thermique compact", icon: "📜" },
                    { value: "80mm" as const, label: "80 mm", desc: "Thermique standard", icon: "🧾" },
                    { value: "A4" as const, label: "A4", desc: "Imprimante bureau", icon: "📄" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setReceiptPaperSize(option.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center ${
                        receiptPaperSize === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className="text-lg">{option.icon}</span>
                      <span className={`text-sm font-semibold ${
                        receiptPaperSize === option.value ? "text-primary" : "text-foreground"
                      }`}>
                        {option.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {option.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4" />

              {/* Show logo on receipt */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Afficher le logo sur le ticket</Label>
                  <p className="text-xs text-muted-foreground">
                    Le logo apparaîtra en haut du ticket de caisse
                  </p>
                </div>
                <Switch
                  checked={receiptShowLogo}
                  onCheckedChange={setReceiptShowLogo}
                />
              </div>

              {/* Show tax on receipt */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Afficher les taxes</Label>
                  <p className="text-xs text-muted-foreground">
                    Détail des taxes sur le ticket de caisse
                  </p>
                </div>
                <Switch
                  checked={receiptShowTax}
                  onCheckedChange={setReceiptShowTax}
                />
              </div>

              {/* Receipt footer */}
              <div className="space-y-2">
                <Label htmlFor="receipt-footer">Pied de ticket</Label>
                <Textarea
                  id="receipt-footer"
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  placeholder="Merci de votre achat !À bientôt chez nous."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Texte affiché en bas de chaque ticket de caisse
                </p>
              </div>

              {/* Receipt preview */}
              <div className="p-4 bg-white text-black rounded-lg max-w-[280px] mx-auto border shadow-sm font-mono text-xs">
                <div className="text-center">
                  {receiptShowLogo && settings?.logo_url && (
                    <img
                      src={settings.logo_url}
                      alt=""
                      className="w-12 h-12 mx-auto object-contain mb-2"
                    />
                  )}
                  <p className="font-bold text-sm">{storeName || "Mon Magasin"}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {profile?.address || "Dakar, Sénégal"}
                  </p>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <p className="text-[10px]">Vente #001</p>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <div className="flex justify-between">
                    <span>Produit x2</span>
                    <span>5 000 FCFA</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Boisson x1</span>
                    <span>500 FCFA</span>
                  </div>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  {receiptShowTax && (
                    <>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>TVA (18%)</span>
                        <span>990 FCFA</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold mt-1">
                    <span>Total</span>
                    <span>6 490 FCFA</span>
                  </div>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  {receiptFooter && (
                    <p className="text-[10px] text-gray-500 italic text-center whitespace-pre-line">
                      {receiptFooter}
                    </p>
                  )}
                </div>
              </div>

              <Button onClick={handleSaveReceiptSettings} className="w-full" size="lg">
                Enregistrer les paramètres du ticket
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StoreCustomization;
