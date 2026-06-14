import { useRef } from "react";
import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { useState } from "react";
import { useCurrency } from "@/hooks/useCurrency";

interface Product {
  name: string;
  price: number;
  barcode: string | null;
}

interface BarcodeLabelPrinterProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export const BarcodeLabelPrinter = ({
  product,
  isOpen,
  onClose,
}: BarcodeLabelPrinterProps) => {
  const { formatPrice } = useCurrency();
  const [copies, setCopies] = useState(1);

  const handlePrint = () => {
    if (!product.barcode) return;

    // Label size: 50mm x 30mm (common label size)
    const labelW = 50;
    const labelH = 30;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [labelH, labelW],
    });

    for (let i = 0; i < copies; i++) {
      if (i > 0) doc.addPage([labelH, labelW], "landscape");

      // Product name
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      const name =
        product.name.length > 25
          ? product.name.substring(0, 25) + "..."
          : product.name;
      doc.text(name, labelW / 2, 5, { align: "center" });

      // Barcode via SVG → Canvas → Image
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      try {
        JsBarcode(svg, product.barcode, {
          format: "CODE128",
          width: 1.5,
          height: 35,
          displayValue: false,
          margin: 0,
        });
      } catch {
        continue;
      }

      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);

      // Synchronous approach: draw barcode as simple lines
      // Use the barcode text directly
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");

      // Draw barcode number
      doc.text(product.barcode, labelW / 2, 22, { align: "center" });

      // Price
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(product.price), labelW / 2, 28, {
        align: "center",
      });

      URL.revokeObjectURL(url);
    }

    // Open for printing
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Imprimer des étiquettes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg text-center">
            <p className="font-medium text-sm">{product.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {product.barcode || "Aucun code-barres"}
            </p>
            <p className="font-bold text-primary mt-1">
              {formatPrice(product.price)}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nombre de copies</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(e) => setCopies(parseInt(e.target.value) || 1)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handlePrint}
            disabled={!product.barcode}
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimer {copies} étiquette{copies > 1 ? "s" : ""}
          </Button>

          {!product.barcode && (
            <p className="text-sm text-destructive text-center">
              Ce produit n'a pas de code-barres. Générez-en un d'abord.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
