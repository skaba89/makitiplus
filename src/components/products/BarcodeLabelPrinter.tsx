import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type LabelSize = "50x30" | "60x40" | "70x50" | "100x60";

const LABEL_SIZES: Record<LabelSize, { w: number; h: number; label: string; desc: string }> = {
  "50x30": { w: 50, h: 30, label: "50 × 30 mm", desc: "Petit" },
  "60x40": { w: 60, h: 40, label: "60 × 40 mm", desc: "Standard" },
  "70x50": { w: 70, h: 50, label: "70 × 50 mm", desc: "Grand" },
  "100x60": { w: 100, h: 60, label: "100 × 60 mm", desc: "XL" },
};

export const BarcodeLabelPrinter = ({
  product,
  isOpen,
  onClose,
}: BarcodeLabelPrinterProps) => {
  const { currency, formatPrice } = useCurrency();
  const [copies, setCopies] = useState(1);
  const [labelSizeKey, setLabelSizeKey] = useState<LabelSize>("60x40");

  const labelSize = LABEL_SIZES[labelSizeKey];

  const handlePrint = () => {
    if (!product.barcode) return;

    const { w: labelW, h: labelH } = labelSize;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [labelH, labelW],
    });

    const margin = 2;
    const contentW = labelW - margin * 2;

    for (let i = 0; i < copies; i++) {
      if (i > 0) doc.addPage([labelH, labelW], "landscape");

      let y = margin;

      // ── Thin border ──
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.rect(0.5, 0.5, labelW - 1, labelH - 1);

      // ── Product name ──
      const nameFontSize = labelW >= 70 ? 8 : 7;
      doc.setFontSize(nameFontSize);
      doc.setFont("helvetica", "bold");
      const maxNameLen = labelW >= 70 ? 35 : 22;
      const name =
        product.name.length > maxNameLen
          ? product.name.substring(0, maxNameLen - 1) + "…"
          : product.name;
      doc.text(name, labelW / 2, y + nameFontSize * 0.35, { align: "center" });
      y += nameFontSize * 0.5 + 1.5;

      // ── Barcode (drawn as lines) ──
      const barcodeH = labelW >= 70 ? 14 : 10;
      const barcodeW = contentW - 4;
      const barcodeX = margin + 2;
      const barcodeY = y;

      try {
        // Generate barcode data using JsBarcode
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, product.barcode, {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: false,
          margin: 0,
        });

        // Extract binary pattern from the SVG bars
        const bars = svg.querySelectorAll("rect");
        const totalBars = bars.length;
        if (totalBars > 0) {
          // Find the total width of the barcode SVG
          let svgWidth = 0;
          bars.forEach((bar) => {
            const x = parseFloat(bar.getAttribute("x") || "0");
            const w = parseFloat(bar.getAttribute("width") || "0");
            svgWidth = Math.max(svgWidth, x + w);
          });

          const scale = barcodeW / Math.max(svgWidth, 1);
          doc.setFillColor(0, 0, 0);

          bars.forEach((bar) => {
            const x = parseFloat(bar.getAttribute("x") || "0");
            const w = parseFloat(bar.getAttribute("width") || "0");
            const scaledX = barcodeX + x * scale;
            const scaledW = Math.max(w * scale, 0.15); // minimum bar width

            if (scaledW > 0.1) {
              doc.rect(scaledX, barcodeY, scaledW, barcodeH, "F");
            }
          });
        }
      } catch {
        // Fallback: just show the barcode number
        doc.setFontSize(labelW >= 70 ? 10 : 8);
        doc.setFont("courier", "normal");
        doc.text(product.barcode, labelW / 2, barcodeY + barcodeH / 2, { align: "center" });
      }

      y += barcodeH + 1;

      // ── Barcode number ──
      const numFontSize = labelW >= 70 ? 6.5 : 5.5;
      doc.setFontSize(numFontSize);
      doc.setFont("courier", "normal");
      doc.text(product.barcode, labelW / 2, y, { align: "center" });
      y += numFontSize * 0.5 + 1.5;

      // ── Price ──
      const priceFontSize = labelW >= 70 ? 10 : 8;
      doc.setFontSize(priceFontSize);
      doc.setFont("helvetica", "bold");
      const priceText = formatPrice(product.price);
      doc.text(priceText, labelW / 2, y + priceFontSize * 0.35, { align: "center" });
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

  const handleDownload = () => {
    if (!product.barcode) return;

    const { w: labelW, h: labelH } = labelSize;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [labelH, labelW],
    });

    const margin = 2;
    const contentW = labelW - margin * 2;

    for (let i = 0; i < copies; i++) {
      if (i > 0) doc.addPage([labelH, labelW], "landscape");

      let y = margin;

      // Border
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.rect(0.5, 0.5, labelW - 1, labelH - 1);

      // Product name
      const nameFontSize = labelW >= 70 ? 8 : 7;
      doc.setFontSize(nameFontSize);
      doc.setFont("helvetica", "bold");
      const maxNameLen = labelW >= 70 ? 35 : 22;
      const name =
        product.name.length > maxNameLen
          ? product.name.substring(0, maxNameLen - 1) + "…"
          : product.name;
      doc.text(name, labelW / 2, y + nameFontSize * 0.35, { align: "center" });
      y += nameFontSize * 0.5 + 1.5;

      // Barcode
      const barcodeH = labelW >= 70 ? 14 : 10;
      const barcodeW = contentW - 4;
      const barcodeX = margin + 2;
      const barcodeY = y;

      try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, product.barcode, {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: false,
          margin: 0,
        });

        const bars = svg.querySelectorAll("rect");
        if (bars.length > 0) {
          let svgWidth = 0;
          bars.forEach((bar) => {
            const x = parseFloat(bar.getAttribute("x") || "0");
            const w = parseFloat(bar.getAttribute("width") || "0");
            svgWidth = Math.max(svgWidth, x + w);
          });

          const scale = barcodeW / Math.max(svgWidth, 1);
          doc.setFillColor(0, 0, 0);

          bars.forEach((bar) => {
            const x = parseFloat(bar.getAttribute("x") || "0");
            const w = parseFloat(bar.getAttribute("width") || "0");
            const scaledX = barcodeX + x * scale;
            const scaledW = Math.max(w * scale, 0.15);

            if (scaledW > 0.1) {
              doc.rect(scaledX, barcodeY, scaledW, barcodeH, "F");
            }
          });
        }
      } catch {
        doc.setFontSize(labelW >= 70 ? 10 : 8);
        doc.setFont("courier", "normal");
        doc.text(product.barcode, labelW / 2, barcodeY + barcodeH / 2, { align: "center" });
      }

      y += barcodeH + 1;

      // Barcode number
      const numFontSize = labelW >= 70 ? 6.5 : 5.5;
      doc.setFontSize(numFontSize);
      doc.setFont("courier", "normal");
      doc.text(product.barcode, labelW / 2, y, { align: "center" });
      y += numFontSize * 0.5 + 1.5;

      // Price
      const priceFontSize = labelW >= 70 ? 10 : 8;
      doc.setFontSize(priceFontSize);
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(product.price), labelW / 2, y + priceFontSize * 0.35, { align: "center" });
    }

    const safeName = product.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    doc.save(`etiquette-${safeName}.pdf`);
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
          {/* Preview */}
          <div className="p-4 bg-white text-black rounded-lg border shadow-sm font-mono text-center space-y-1">
            <p className="font-bold text-sm truncate">{product.name || "Produit"}</p>
            {product.barcode && (
              <div className="flex justify-center">
                <svg
                  id="barcode-preview"
                  ref={(el) => {
                    if (el && product.barcode) {
                      try {
                        JsBarcode(el, product.barcode, {
                          format: "CODE128",
                          width: 1.5,
                          height: 40,
                          displayValue: true,
                          fontSize: 10,
                          margin: 2,
                        });
                      } catch {
                        // Invalid barcode
                      }
                    }
                  }}
                />
              </div>
            )}
            <p className="font-bold text-primary text-lg">{formatPrice(product.price)}</p>
          </div>

          {/* Label size selector */}
          <div className="space-y-2">
            <Label>Taille de l'étiquette</Label>
            <Select value={labelSizeKey} onValueChange={(v) => setLabelSizeKey(v as LabelSize)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABEL_SIZES).map(([key, size]) => (
                  <SelectItem key={key} value={key}>
                    {size.label} ({size.desc})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Copies */}
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

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handlePrint}
              disabled={!product.barcode}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimer
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!product.barcode}
            >
              PDF
            </Button>
          </div>

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
