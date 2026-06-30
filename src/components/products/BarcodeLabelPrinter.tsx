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
import { Printer, Download } from "lucide-react";
import { useState, useCallback } from "react";
import { useCurrency } from "@/hooks/useCurrency";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

interface LabelSizeConfig {
  w: number;         // width in mm
  h: number;         // height in mm
  label: string;     // display label
  desc: string;      // short description
  nameSize: number;  // font size for product name
  barcodeH: number;  // barcode height in mm
  numSize: number;   // font size for barcode number
  priceSize: number; // font size for price
  maxNameChars: number;
}

/* ------------------------------------------------------------------ */
/*  Label size presets — carefully tuned for each size                 */
/* ------------------------------------------------------------------ */

const LABEL_SIZES: Record<LabelSize, LabelSizeConfig> = {
  "50x30": {
    w: 50, h: 30,
    label: "50 × 30 mm", desc: "Petit",
    nameSize: 6.5, barcodeH: 10, numSize: 5, priceSize: 7,
    maxNameChars: 20,
  },
  "60x40": {
    w: 60, h: 40,
    label: "60 × 40 mm", desc: "Standard",
    nameSize: 7.5, barcodeH: 14, numSize: 5.5, priceSize: 9,
    maxNameChars: 26,
  },
  "70x50": {
    w: 70, h: 50,
    label: "70 × 50 mm", desc: "Grand",
    nameSize: 8.5, barcodeH: 16, numSize: 6.5, priceSize: 11,
    maxNameChars: 32,
  },
  "100x60": {
    w: 100, h: 60,
    label: "100 × 60 mm", desc: "XL",
    nameSize: 10, barcodeH: 20, numSize: 7.5, priceSize: 13,
    maxNameChars: 40,
  },
};

/* ------------------------------------------------------------------ */
/*  Shared PDF generation                                              */
/* ------------------------------------------------------------------ */

function buildLabelPDF(
  product: Product,
  size: LabelSizeConfig,
  copies: number,
  formatPrice: (n: number) => string,
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [size.h, size.w],
  });

  const margin = 2;
  const contentW = size.w - margin * 2;

  for (let i = 0; i < copies; i++) {
    if (i > 0) doc.addPage([size.h, size.w], "landscape");

    let y = margin;

    /* ── Thin border ── */
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(0.5, 0.5, size.w - 1, size.h - 1, 0.5, 0.5);

    /* ── Product name ── */
    doc.setFontSize(size.nameSize);
    doc.setFont("helvetica", "bold");
    const name =
      product.name.length > size.maxNameChars
        ? product.name.substring(0, size.maxNameChars - 1) + "…"
        : product.name;
    doc.text(name, size.w / 2, y + size.nameSize * 0.38, { align: "center" });
    y += size.nameSize * 0.55 + 1;

    /* ── Barcode bars (CODE128 drawn from SVG) ── */
    const barcodeW = contentW - 6;   // 3mm quiet zone each side
    const barcodeX = margin + 3;     // quiet zone left
    const barcodeY = y;

    if (product.barcode) {
      try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, product.barcode, {
          format: "CODE128",
          width: 2,
          height: 80,       // high-res source → scales down cleanly
          displayValue: false,
          margin: 0,
        });

        const bars = svg.querySelectorAll("rect");
        if (bars.length > 0) {
          // Compute total SVG width
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
            const scaledW = Math.max(w * scale, 0.18); // min bar width for print clarity

            if (scaledW > 0.1) {
              doc.rect(scaledX, barcodeY, scaledW, size.barcodeH, "F");
            }
          });
        }
      } catch {
        // Fallback: display barcode number as text
        doc.setFontSize(size.numSize + 1);
        doc.setFont("courier", "bold");
        doc.text(product.barcode, size.w / 2, barcodeY + size.barcodeH / 2, {
          align: "center",
        });
      }
    }

    y += size.barcodeH + 0.5;

    /* ── Barcode number ── */
    doc.setFontSize(size.numSize);
    doc.setFont("courier", "normal");
    if (product.barcode) {
      // Add spaces every 4 chars for readability
      const spaced = product.barcode.replace(/(.{4})/g, "$1 ").trim();
      doc.text(spaced, size.w / 2, y + size.numSize * 0.38, { align: "center" });
    }
    y += size.numSize * 0.55 + 0.5;

    /* ── Price ── */
    doc.setFontSize(size.priceSize);
    doc.setFont("helvetica", "bold");
    const priceText = formatPrice(product.price);
    doc.text(priceText, size.w / 2, y + size.priceSize * 0.38, { align: "center" });
  }

  return doc;
}

/* ------------------------------------------------------------------ */
/*  React component                                                    */
/* ------------------------------------------------------------------ */

export const BarcodeLabelPrinter = ({
  product,
  isOpen,
  onClose,
}: BarcodeLabelPrinterProps) => {
  const { formatPrice } = useCurrency();
  const [copies, setCopies] = useState(1);
  const [labelSizeKey, setLabelSizeKey] = useState<LabelSize>("60x40");

  const labelSize = LABEL_SIZES[labelSizeKey];

  const handlePrint = useCallback(() => {
    if (!product.barcode) return;
    const doc = buildLabelPDF(product, labelSize, copies, formatPrice);
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }, [product, labelSize, copies, formatPrice]);

  const handleDownload = useCallback(() => {
    if (!product.barcode) return;
    const doc = buildLabelPDF(product, labelSize, copies, formatPrice);
    const safeName = product.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    doc.save(`etiquette-${safeName}.pdf`);
  }, [product, labelSize, copies, formatPrice]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Imprimer l'étiquette
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Live preview (proportional to selected size) ── */}
          <div className="flex justify-center">
            <div
              className="bg-white text-black rounded-lg border shadow-md relative overflow-hidden"
              style={{
                width: `${Math.min(labelSize.w * 2.5, 280)}px`,
                height: `${Math.min(labelSize.h * 2.5, 170)}px`,
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
              }}
            >
              {/* Product name */}
              <p
                className="font-bold text-center truncate w-full"
                style={{ fontSize: `${labelSize.nameSize * 1.6}px` }}
              >
                {product.name || "Produit"}
              </p>

              {/* Barcode SVG */}
              {product.barcode && (
                <svg
                  ref={(el) => {
                    if (el && product.barcode) {
                      try {
                        JsBarcode(el, product.barcode, {
                          format: "CODE128",
                          width: 1.5,
                          height: 45,
                          displayValue: true,
                          fontSize: 10,
                          margin: 2,
                          textMargin: 1,
                        });
                      } catch {
                        // Invalid barcode
                      }
                    }
                  }}
                />
              )}

              {/* Price */}
              <p
                className="font-bold text-center w-full"
                style={{
                  fontSize: `${labelSize.priceSize * 1.6}px`,
                  color: "#dc2626",
                }}
              >
                {formatPrice(product.price)}
              </p>
            </div>
          </div>

          {/* ── Label size selector ── */}
          <div className="space-y-2">
            <Label>Taille de l'étiquette</Label>
            <Select
              value={labelSizeKey}
              onValueChange={(v) => setLabelSizeKey(v as LabelSize)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABEL_SIZES).map(([key, size]) => (
                  <SelectItem key={key} value={key}>
                    {size.label} — {size.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Copies ── */}
          <div className="space-y-2">
            <Label>Nombre de copies</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(e) =>
                setCopies(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
              }
            />
          </div>

          {/* ── Action buttons ── */}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={handlePrint} disabled={!product.barcode}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimer
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!product.barcode}
            >
              <Download className="h-4 w-4 mr-2" />
              Télécharger PDF
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
