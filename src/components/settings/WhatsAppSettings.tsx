/**
 * WhatsApp Settings Card — Configure WhatsApp Business API integration
 *
 * Features:
 * - Phone Number ID + Business Account ID + Access Token
 * - Auto-send receipt toggle
 * - Daily limit configuration
 * - Stats overview (messages sent, delivered, failed)
 * - Test message sending
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Phone,
  Key,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import {
  useWhatsAppConfig,
  useWhatsAppStats,
  useSaveWhatsAppConfig,
  useSendWhatsApp,
} from "@/hooks/useWhatsApp";

export function WhatsAppSettingsCard() {
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const { data: config, isLoading: configLoading } = useWhatsAppConfig();
  const { data: stats } = useWhatsAppStats();
  const saveConfig = useSaveWhatsAppConfig();
  const sendMessage = useSendWhatsApp();

  const [formData, setFormData] = useState({
    phone_number_id: "",
    business_account_id: "",
    access_token: "",
    whatsapp_phone: "",
    auto_send_receipt: false,
    auto_send_message: "",
    daily_limit: 1000,
  });

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Bonjour ! Ceci est un message test depuis MakitiPlus.");

  // Populate form from config
  useEffect(() => {
    if (config) {
      setFormData({
        phone_number_id: config.phone_number_id || "",
        business_account_id: config.business_account_id || "",
        access_token: config.access_token || "",
        whatsapp_phone: config.whatsapp_phone || "",
        auto_send_receipt: config.auto_send_receipt ?? false,
        auto_send_message: config.auto_send_message || "",
        daily_limit: config.daily_limit || 1000,
      });
    }
  }, [config]);

  const handleSave = () => {
    if (!formData.phone_number_id || !formData.business_account_id) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Le Phone Number ID et le Business Account ID sont obligatoires.",
      });
      return;
    }
    saveConfig.mutate(formData, {
      onSuccess: () => {
        toast({ title: "Configuration WhatsApp enregistrée" });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: error instanceof Error ? error.message : "Impossible de sauvegarder",
        });
      },
    });
  };

  const handleTestSend = () => {
    if (!testPhone) {
      toast({ variant: "destructive", title: "Numéro requis", description: "Entrez un numéro pour le test." });
      return;
    }
    sendMessage.mutate(
      {
        phone: testPhone,
        message_type: "custom",
        text: testMessage,
      },
      {
        onSuccess: (data) => {
          toast({
            title: "Message envoyé",
            description: `Message test envoyé au ${testPhone}. Restant aujourd'hui: ${data.daily_remaining}`,
          });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Échec de l'envoi",
            description: error instanceof Error ? error.message : "Erreur lors de l'envoi",
          });
        },
      }
    );
  };

  const isConfigured = config?.is_active && !!config?.phone_number_id;

  if (configLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            WhatsApp Business
            {isConfigured ? (
              <Badge className="bg-green-100 text-green-800 ml-2">Connecté</Badge>
            ) : (
              <Badge variant="outline" className="ml-2">Non configuré</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Envoyez automatiquement des reçus et messages à vos clients via WhatsApp Business API
          </CardDescription>
        </CardHeader>
        {isConfigured && stats && (
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{stats.total_sent}</p>
                <p className="text-xs text-muted-foreground">Envoyés</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{stats.total_delivered}</p>
                <p className="text-xs text-muted-foreground">Livrés</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{stats.total_failed}</p>
                <p className="text-xs text-muted-foreground">Échoués</p>
              </div>
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <p className="text-2xl font-bold text-primary">{stats.today_sent}</p>
                <p className="text-xs text-muted-foreground">Aujourd'hui</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration API
          </CardTitle>
          <CardDescription>
            Renseignez vos identifiants WhatsApp Business API (Meta Cloud API). 
            Obtenez-les sur business.facebook.com
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                Phone Number ID *
              </Label>
              <Input
                value={formData.phone_number_id}
                onChange={(e) => setFormData({ ...formData, phone_number_id: e.target.value })}
                placeholder="123456789012345"
              />
              <p className="text-xs text-muted-foreground">
                ID du numéro de téléphone dans Meta Business Suite
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Key className="h-3.5 w-3.5" />
                Business Account ID *
              </Label>
              <Input
                value={formData.business_account_id}
                onChange={(e) => setFormData({ ...formData, business_account_id: e.target.value })}
                placeholder="987654321098765"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Access Token (Permanent)</Label>
            <Input
              type="password"
              value={formData.access_token}
              onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
              placeholder="EAAxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-muted-foreground">
              Token d'accès permanent généré dans Meta App Dashboard. Le token est masqué après sauvegarde.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Numéro WhatsApp (affiché)</Label>
            <Input
              value={formData.whatsapp_phone}
              onChange={(e) => setFormData({ ...formData, whatsapp_phone: e.target.value })}
              placeholder="+224 622 00 00 00"
            />
          </div>

          <div className="space-y-2">
            <Label>Limite quotidienne</Label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={formData.daily_limit}
              onChange={(e) => setFormData({ ...formData, daily_limit: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Nombre maximum de messages par jour (défaut: 1000)
            </p>
          </div>

          <Separator />

          {/* Auto-send Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Envoi automatique de reçu</p>
                <p className="text-sm text-muted-foreground">
                  Envoyer le reçu WhatsApp automatiquement après chaque vente
                </p>
              </div>
              <Switch
                checked={formData.auto_send_receipt}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, auto_send_receipt: checked })
                }
              />
            </div>

            {formData.auto_send_receipt && (
              <div className="space-y-2">
                <Label>Message personnalisé (optionnel)</Label>
                <Textarea
                  value={formData.auto_send_message}
                  onChange={(e) =>
                    setFormData({ ...formData, auto_send_message: e.target.value })
                  }
                  placeholder="Merci pour votre achat ! Voici votre reçu..."
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Ce message sera ajouté avant le reçu. Laissez vide pour n'envoyer que le reçu.
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={handleSave}
            disabled={saveConfig.isPending}
            className="w-full"
          >
            {saveConfig.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isConfigured ? "Mettre à jour la configuration" : "Activer WhatsApp"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Test Card */}
      {isConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Tester l'envoi
            </CardTitle>
            <CardDescription>
              Envoyez un message test pour vérifier que la configuration fonctionne
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Numéro de test</Label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="224622000000"
                />
                <p className="text-xs text-muted-foreground">
                  Numéro avec code pays (ex: 224622000000)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Input
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Message test..."
                />
              </div>
            </div>
            <Button
              onClick={handleTestSend}
              disabled={sendMessage.isPending || !testPhone}
              variant="outline"
              className="gap-2"
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Envoyer le test
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Help Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Comment configurer WhatsApp Business API
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="space-y-2">
            <p className="font-medium">1. Créer un compte Meta Business</p>
            <p className="text-muted-foreground">
              Allez sur business.facebook.com et créez un compte Business. Vérifiez votre entreprise.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">2. Configurer WhatsApp Business</p>
            <p className="text-muted-foreground">
              Dans le Business Manager, allez dans WhatsApp Manager. Créez un profil WhatsApp Business et ajoutez un numéro de téléphone.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">3. Créer une application Meta</p>
            <p className="text-muted-foreground">
              Sur developers.facebook.com, créez une app de type "Business". Ajoutez le produit WhatsApp. Récupérez le Phone Number ID et le Permanent Access Token.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">4. Renseigner les identifiants</p>
            <p className="text-muted-foreground">
              Copiez le Phone Number ID, Business Account ID et le Token dans les champs ci-dessus, puis cliquez sur "Activer WhatsApp".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
