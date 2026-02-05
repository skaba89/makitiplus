 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Download, MessageCircle, Check, Copy } from "lucide-react";
 import { ReceiptData, downloadReceipt, shareViaWhatsApp, generateReceiptText } from "@/utils/receiptGenerator";
 import { useToast } from "@/hooks/use-toast";
 
 interface ReceiptActionsDialogProps {
   isOpen: boolean;
   onClose: () => void;
   receiptData: ReceiptData | null;
 }
 
 export const ReceiptActionsDialog = ({
   isOpen,
   onClose,
   receiptData,
 }: ReceiptActionsDialogProps) => {
   const { toast } = useToast();
   const [whatsappNumber, setWhatsappNumber] = useState("");
   const [copied, setCopied] = useState(false);
 
   if (!receiptData) return null;
 
   const handleDownloadPDF = () => {
     downloadReceipt(receiptData);
     toast({
       title: "Ticket téléchargé",
       description: `ticket-${receiptData.saleNumber}.pdf`,
     });
   };
 
   const handleShareWhatsApp = () => {
     const phone = whatsappNumber || receiptData.customerName;
     shareViaWhatsApp(receiptData, phone);
   };
 
   const handleCopyText = () => {
     const text = generateReceiptText(receiptData);
     navigator.clipboard.writeText(text);
     setCopied(true);
     toast({
       title: "Copié !",
       description: "Le ticket a été copié dans le presse-papiers",
     });
     setTimeout(() => setCopied(false), 2000);
   };
 
   return (
     <Dialog open={isOpen} onOpenChange={onClose}>
       <DialogContent className="max-w-sm">
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
               {new Intl.NumberFormat("fr-FR").format(receiptData.total)} FCFA
             </p>
           </div>
 
           {/* WhatsApp Share */}
           <div className="space-y-3">
             <Label>Envoyer via WhatsApp</Label>
             <div className="flex gap-2">
               <Input
                 placeholder={receiptData.customerName || "+221 77 xxx xx xx"}
                 value={whatsappNumber}
                 onChange={(e) => setWhatsappNumber(e.target.value)}
                 className="flex-1"
               />
               <Button
                 onClick={handleShareWhatsApp}
                 className="bg-[#25D366] hover:bg-[#128C7E] text-white"
               >
                 <MessageCircle className="h-4 w-4" />
               </Button>
             </div>
             <p className="text-xs text-muted-foreground">
               Laissez vide pour choisir un contact
             </p>
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