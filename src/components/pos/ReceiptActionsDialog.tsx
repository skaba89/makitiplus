import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WHATSAPP_GREEN, WHATSAPP_GREEN_DARK } from "@/constants/colors";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, MessageCircle, Check, Copy, MessageSquare, WifiOff, Send, CircleCheck, Clock, Printer } from "lucide-react";
import {
  ReceiptData,
  ReceiptPaperSize,
  downloadReceipt,
  shareViaWhatsApp,
  generateReceiptText,
  formatPriceWithCurrency,
} from "@/utils/receiptGenerator";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import {
  enqueueOrSendReceipt,
  isOnline,
  pendingCount,
  DeliveryChannel,
} from "@/lib/receiptDeliveryQueue";

interface ReceiptActionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: ReceiptData | null;
}

const AUTO_SEND_KEY = "malikiplus:auto_send_receipt";

export const ReceiptActionsDialog = ({
  isOpen,
  onClose,
  receiptData,
}: ReceiptActionsDialogProps) => {
  const { toast } = useToast();
  const { currency, phoneCode } = useCurrency();
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoSend, setAutoSend] = useState(
    () => localStorage.getItem(AUTO_SEND_KEY) === "1"
  );
  const [autoChannel, setAutoChannel] = useState<DeliveryChannel>("whatsapp");
  const [pending, setPending] = useState(pendingCount());
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [selectedPaperSize, setSelectedPaperSize] = useState<ReceiptPaperSize>(
    receiptData?.paperSize || "80mm"
  );
  const [showQrCode, setShowQrCode] = useState(
    receiptData?.showQrCode !== false
  );

  // Sync paper size when receiptData changes
  useEffect(() => {
    if (receiptData?.paperSize) {
      setSelectedPaperSize(receiptData.paperSize);
    }
  }, [receiptData?.paperSize]);

  useEffect(() => {
    localStorage.setItem(AUTO_SEND_KEY, autoSend ? "1" : "0");
  }, [autoSend]);

  // Envoi automatique à l'ouverture si activé et téléphone client connu
  useEffect(() => {
    if (!isOpen || !receiptData || !autoSend || autoTriggered) return;
    const phone =
      whatsappNumber || receiptData.customerPhone || "";
    if (!phone) return;
    const result = enqueueOrSendReceipt(autoChannel, phone, receiptData);
    setAutoTriggered(true);
    setPending(pendingCount());
    if (result.status === "sent") {
      toast({
        title: `Ticket envoyé via ${autoChannel === "whatsapp" ? "WhatsApp" : "SMS"}`,
        description: phone,
      });
    } else if (result.status === "pending") {
      toast({
        title: "Mode hors ligne — ticket en file d'attente",
        description: "Sera envoyé automatiquement à la reconnexion.",
      });
    }
  }, [isOpen, receiptData, autoSend, autoChannel, whatsappNumber, autoTriggered, toast]);

  // Reset trigger quand on rouvre
  useEffect(() => {
    if (!isOpen) setAutoTriggered(false);
  }, [isOpen]);

  if (!receiptData) return null;

  const formatPrice = (amount: number) =>
    formatPriceWithCurrency(
      amount,
      receiptData.currencySymbol || currency.displaySymbol || currency.symbol,
      receiptData.currencyPosition || currency.position
    );

  const handleDownloadPDF = async () => {
    const dataWithFormat = { ...receiptData, paperSize: selectedPaperSize, showQrCode };
    await downloadReceipt(dataWithFormat);
    const formatLabel = selectedPaperSize === "A4" ? "A4 (facture)" : selectedPaperSize;
    toast({
      title: "Ticket téléchargé",
      description: `ticket-${receiptData.saleNumber}.pdf — format ${formatLabel}`,
    });
  };

  const handleSendManual = (channel: DeliveryChannel) => {
    const phone = whatsappNumber || receiptData.customerPhone || "";
    if (!phone) {
      toast({
        variant: "destructive",
        title: "Numéro requis",
        description: "Saisissez un numéro pour envoyer le ticket.",
      });
      return;
    }
    const dataWithQr = { ...receiptData, showQrCode };
    const result = enqueueOrSendReceipt(channel, phone, dataWithQr);
    setPending(pendingCount());
    if (result.status === "sent") {
      toast({
        title: `Ticket envoyé (${channel === "whatsapp" ? "WhatsApp" : "SMS"})`,
        description: phone,
      });
    } else if (result.status === "pending") {
      toast({
        title: "Hors ligne — mis en file",
        description: "Sera envoyé automatiquement à la reconnexion.",
      });
    } else {
      // duplicate (déjà envoyé)
      toast({
        title: "Déjà envoyé",
        description: "Ce ticket a déjà été envoyé via ce canal/numéro (idempotence).",
      });
    }
  };

  const handleCopyText = () => {
    const dataWithQr = { ...receiptData, showQrCode };
    const text = generateReceiptText(dataWithQr);
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copié !",
        description: "Le ticket a été copié dans le presse-papiers",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Échec de la copie",
        description: "Impossible de copier dans le presse-papiers. Essayez manuellement.",
      });
    }
  };

  const online = isOnline();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-success" />
            Vente enregistrée !
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sale Summary */}
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">Ticket N°</p>
            <p className="font-bold text-lg">{receiptData.saleNumber}</p>
            <p className="text-2xl font-bold text-primary mt-2">
              {formatPrice(receiptData.total)}
            </p>
          </div>

          {/* Statut connexion + queue */}
          <div className="flex items-center justify-between text-xs">
            <Badge
              variant="outline"
              className={online ? "border-primary/50 text-primary" : "border-accent/50 text-accent-foreground"}
            >
              {online ? <><CircleCheck className="h-3 w-3 mr-1 text-green-500" /> En ligne</> : <><WifiOff className="h-3 w-3 mr-1" /> Hors ligne</>}
            </Badge>
            {pending > 0 && (
              <span className="text-muted-foreground">
                <Clock className="h-3 w-3 inline mr-1" />{pending} ticket(s) en attente
              </span>
            )}
          </div>

          {/* Auto-send toggle */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-send" className="text-sm cursor-pointer">
                Envoi automatique du ticket
              </Label>
              <Switch
                id="auto-send"
                checked={autoSend}
                onCheckedChange={setAutoSend}
              />
            </div>
            {autoSend && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={autoChannel === "whatsapp" ? "default" : "outline"}
                  onClick={() => setAutoChannel("whatsapp")}
                  className="flex-1"
                >
                  <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant={autoChannel === "sms" ? "default" : "outline"}
                  onClick={() => setAutoChannel("sms")}
                  className="flex-1"
                >
                  <MessageSquare className="h-3 w-3 mr-1" /> SMS
                </Button>
              </div>
            )}
            <p className="text-fine text-muted-foreground">
              {autoSend
                ? online
                  ? "Le ticket sera envoyé immédiatement au client."
                  : "Hors ligne : le ticket sera envoyé automatiquement à la reconnexion."
                : "Activez pour envoyer le ticket sans cliquer manuellement."}
            </p>
          </div>

          {/* Téléphone destinataire */}
          <div className="space-y-2">
            <Label>Numéro du client</Label>
            <div className="flex gap-2">
              <div className="w-16 flex items-center justify-center px-2 bg-muted rounded-lg text-sm font-medium">
                {phoneCode}
              </div>
              <Input
                placeholder="77 xxx xx xx"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="flex-1"
                data-testid="receipt-phone-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleSendManual("whatsapp")}
                className="text-white"
                style={{ backgroundColor: WHATSAPP_GREEN }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = WHATSAPP_GREEN_DARK)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = WHATSAPP_GREEN)}
                data-testid="receipt-send-whatsapp"
              >
                <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
              </Button>
              <Button
                onClick={() => handleSendManual("sms")}
                variant="outline"
                data-testid="receipt-send-sms"
              >
                <Send className="h-4 w-4 mr-1" /> SMS
              </Button>
            </div>
          </div>

          {/* Format papier */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Format d'impression</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "58mm" as const, label: "58 mm" },
                { value: "80mm" as const, label: "80 mm" },
                { value: "A4" as const, label: "A4" },
              ]).map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={selectedPaperSize === opt.value ? "default" : "outline"}
                  onClick={() => setSelectedPaperSize(opt.value)}
                  className="text-xs"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* QR Code toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="qr-toggle" className="text-sm cursor-pointer">
                QR Code sur le ticket
              </Label>
              <span className="text-fine text-muted-foreground">Vérification</span>
            </div>
            <Switch
              id="qr-toggle"
              checked={showQrCode}
              onCheckedChange={setShowQrCode}
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleDownloadPDF}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={handleCopyText}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Copier
            </Button>
          </div>

          {/* Close */}
          <Button className="w-full" onClick={onClose}>
            Nouvelle vente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
