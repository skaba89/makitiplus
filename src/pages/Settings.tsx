import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Store, MapPin, Phone, Globe, Smartphone, Nfc } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { COUNTRIES, getCountryByCode } from "@/utils/currencies";
import { useCurrency } from "@/hooks/useCurrency";
import { TaxSettingsCard } from "@/components/settings/TaxSettingsCard";

const Settings = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency, country } = useCurrency();

  const [formData, setFormData] = useState({
    business_name: "",
    owner_name: "",
    phone: "",
    address: "",
    city: "",
    country: "GN",
  });

  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        business_name: profile.business_name || "",
        owner_name: profile.owner_name || "",
        phone: profile.phone || "",
        address: profile.address || "",
        city: profile.city || "",
        country: profile.country?.length === 2 ? profile.country : "GN",
      });
    }
  }, [profile]);

  // Check NFC support
  useEffect(() => {
    if ("NDEFReader" in window) {
      setNfcSupported(true);
    }
  }, []);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const selectedCountry = getCountryByCode(data.country);
      const { error } = await supabase
        .from("profiles")
        .update({
          business_name: data.business_name,
          owner_name: data.owner_name,
          phone: data.phone,
          address: data.address,
          city: data.city,
          country: data.country,
          currency: selectedCountry?.currency.code || "GNF",
        })
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      toast({
        title: "Paramètres enregistrés",
        description: "Les informations de votre boutique ont été mises à jour",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de sauvegarder les paramètres",
      });
      reportError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const handleNfcToggle = async (enabled: boolean) => {
    if (enabled && nfcSupported) {
      try {
        // Request NFC permission
        const NDEFReaderCtor = window.NDEFReader;
        if (!NDEFReaderCtor) throw new Error("NDEFReader not available");
        const ndef = new NDEFReaderCtor();
        await ndef.scan();
        setNfcEnabled(true);
        toast({
          title: "NFC activé",
          description: "Le paiement sans contact est maintenant disponible",
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erreur NFC",
          description: "Impossible d'activer le NFC. Vérifiez les permissions.",
        });
      }
    } else {
      setNfcEnabled(false);
    }
  };

  const selectedCountryData = getCountryByCode(formData.country);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Paramètres</h1>
          <p className="text-muted-foreground">
            Configurez les informations de votre boutique
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Informations de la boutique
              </CardTitle>
              <CardDescription>
                Ces informations apparaîtront sur vos tickets de caisse
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business_name">Nom de la boutique</Label>
                  <Input
                    id="business_name"
                    value={formData.business_name}
                    onChange={(e) =>
                      setFormData({ ...formData, business_name: e.target.value })
                    }
                    placeholder="Ma Boutique"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner_name">Nom du propriétaire</Label>
                  <Input
                    id="owner_name"
                    value={formData.owner_name}
                    onChange={(e) =>
                      setFormData({ ...formData, owner_name: e.target.value })
                    }
                    placeholder="Votre nom"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <div className="flex gap-2">
                  <div className="w-24 flex items-center justify-center px-3 bg-muted rounded-lg text-sm font-medium">
                    {selectedCountryData?.phoneCode}
                  </div>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="77 000 00 00"
                    className="flex-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location & Currency */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Pays et devise
              </CardTitle>
              <CardDescription>
                La devise sera automatiquement définie selon le pays sélectionné
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pays</Label>
                  <Select
                    value={formData.country}
                    onValueChange={(value) =>
                      setFormData({ ...formData, country: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un pays" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          <span className="flex items-center gap-2">
                            <span>{country.flag}</span>
                            <span>{country.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Devise</Label>
                  <div className="h-10 px-3 flex items-center bg-muted rounded-lg text-sm">
                    <span className="font-medium">
                      {selectedCountryData?.currency.symbol}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      ({selectedCountryData?.currency.name})
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile Payments Available */}
              {selectedCountryData && selectedCountryData.mobilePayments.length > 0 && (
                <div className="space-y-2">
                  <Label>Paiements mobiles disponibles</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCountryData.mobilePayments.map((payment) => (
                      <span
                        key={payment}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                      >
                        <Smartphone className="h-3 w-3" />
                        {payment === "wave" && "Wave"}
                        {payment === "orange_money" && "Orange Money"}
                        {payment === "mtn_money" && "MTN Money"}
                        {payment === "moov_money" && "Moov Money"}
                        {payment === "mpesa" && "M-Pesa"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Adresse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  placeholder="Rue, quartier..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  placeholder="Conakry"
                />
              </div>
            </CardContent>
          </Card>

          {/* NFC Payment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Nfc className="h-5 w-5" />
                Paiement sans contact (NFC)
              </CardTitle>
              <CardDescription>
                Acceptez les paiements par téléphone via NFC
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium">Activer le NFC</p>
                  <p className="text-sm text-muted-foreground">
                    {nfcSupported
                      ? "Votre appareil supporte le NFC"
                      : "Votre appareil ne supporte pas le NFC"}
                  </p>
                </div>
                <Switch
                  checked={nfcEnabled}
                  onCheckedChange={handleNfcToggle}
                  disabled={!nfcSupported}
                />
              </div>
              {nfcEnabled && (
                <div className="mt-4 p-4 bg-success/10 rounded-lg">
                  <p className="text-sm text-success font-medium">
                    ✓ NFC activé - Prêt à recevoir des paiements sans contact
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Enregistrer les paramètres"
            )}
          </Button>
        </form>

        <TaxSettingsCard />
      </div>
    </DashboardLayout>
  );
};

export default Settings;
