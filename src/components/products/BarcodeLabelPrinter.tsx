import type { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/* ------------------------------------------------------------------ */
/*  A4 layout — 2 columns × 5 rows = 10 labels per page               */
/*  Each label cell: 95mm × 52mm with 5mm gaps                       */
/*  A4 usable area: 210mm × 297mm                                     */
/*  Horizontal: 10 + 95 + 10 + 95 + 10 = 220 → fits in 210 with 5mm margins */
/*  Vertical:   10 + 52 × 5 + 5 × 4 + 10 = 290 → fits in 297        */
/* ------------------------------------------------------------------ */

const A4 = { w: 210, h: 297 };
const COLS = 2;
const ROWS = 5;
const LABELS_PER_PAGE = COLS * ROWS; // 10

const LABEL_CELL = { w: 95, h: 52 };  // each label cell in mm
const GAP_X = 6;   // horizontal gap between labels
const GAP_Y = 5;   // vertical gap between labels
const MARGIN_X = (A4.w - COLS * LABEL_CELL.w - (COLS - 1) * GAP_X) / 2; // ~7mm each side
const MARGIN_Y = 10; // top/bottom margin

/* Font/layout sizes for each label cell — tuned to fit 95×52mm */
const FONT = {
  name: 8,        // product name
  barcodeH: 18,   // barcode image height in mm
  num: 5.5,       // barcode number
  price: 10,      // price
  maxNameChars: 30,
};

/* ------------------------------------------------------------------ */
/*  Render barcode directly to canvas using JsBarcode                  */
/* ------------------------------------------------------------------ */

async function renderBarcodeToCanvas(barcodeValue: string): Promise<string | null> {
  try {
    const { default: JsBarcode } = await import("jsbarcode");
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, barcodeValue, {
      format: "CODE128",
      width: 4,            // bar width in px — high resolution for crisp print
      height: 200,         // tall barcode for quality when scaled down
      displayValue: false,
      margin: 4,           // small quiet zone
      background: "#ffffff",
      lineColor: "#000000", // explicit black bars
    });
    if (canvas.width === 0 || canvas.height === 0) return null;
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Unicode sanitiser for jsPDF                                        */
/* ------------------------------------------------------------------ */

/**
 * Intl.NumberFormat("fr-FR") uses U+00A0 (non-breaking space) and/or U+202F
 * (narrow no-break space) as thousands separator, but jsPDF's built-in fonts
 * lack glyphs for these.  Replace with a regular ASCII space.
 */
function sanitizeForPdf(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, " ");
}

/* ------------------------------------------------------------------ */
/*  Draw a single label at position (x, y) on the jsPDF document       */
/* ------------------------------------------------------------------ */

function drawLabel(
  doc: jsPDF,
  product: Product,
  x: number,
  y: number,
  barcodeImageData: string | null,
  formatPrice: (n: number) => string,
): void {
  const cellW = LABEL_CELL.w;
  const cellH = LABEL_CELL.h;
  const padX = 3;  // horizontal padding inside label
  const padY = 2;  // vertical padding inside label
  const innerW = cellW - padX * 2;
  let curY = y + padY;

  /* ── Dashed cut border ── */
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);
  doc.rect(x, y, cellW, cellH);
  doc.setLineDashPattern([], 0); // reset

  /* ── Product name ── */
  doc.setFontSize(FONT.name);
  doc.setFont("helvetica", "bold");
  const rawName =
    product.name.length > FONT.maxNameChars
      ? product.name.substring(0, FONT.maxNameChars - 1) + "..."
      : product.name;
  doc.text(sanitizeForPdf(rawName), x + cellW / 2, curY + FONT.name * 0.38, {
    align: "center",
  });
  curY += FONT.name * 0.6 + 1;

  /* ── Barcode image ── */
  const barcodeW = innerW - 6; // 3mm quiet zone each side
  const barcodeX = x + padX + 3;

  if (barcodeImageData) {
    doc.addImage(
      barcodeImageData,
      "PNG",
      barcodeX,
      curY,
      barcodeW,
      FONT.barcodeH,
      undefined,
      "NONE", // no compression — keeps bars sharp
    );
  } else if (product.barcode) {
    // Fallback: barcode number as text
    doc.setFontSize(FONT.num + 1);
    doc.setFont("courier", "bold");
    doc.text(
      sanitizeForPdf(product.barcode),
      x + cellW / 2,
      curY + FONT.barcodeH / 2,
      { align: "center" },
    );
  }
  curY += FONT.barcodeH + 0.5;

  /* ── Barcode number ── */
  doc.setFontSize(FONT.num);
  doc.setFont("courier", "normal");
  if (product.barcode) {
    const spaced = sanitizeForPdf(
      product.barcode.replace(/(.{4})/g, "$1 ").trim(),
    );
    doc.text(spaced, x + cellW / 2, curY + FONT.num * 0.38, {
      align: "center",
    });
  }
  curY += FONT.num * 0.6 + 0.5;

  /* ── Price (bold, red) ── */
  doc.setFontSize(FONT.price);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38); // red-600
  const priceText = sanitizeForPdf(formatPrice(product.price));
  doc.text(priceText, x + cellW / 2, curY + FONT.price * 0.38, {
    align: "center",
  });
  doc.setTextColor(0, 0, 0); // reset to black
}

/* ------------------------------------------------------------------ */
/*  Build PDF with 10 labels per A4 page                               */
/* ------------------------------------------------------------------ */

async function buildLabelPDF(
  product: Product,
  copies: number,
  formatPrice: (n: number) => string,
): Promise<jsPDF> {
  const [{ default: jsPDF }, { default: JsBarcode }] = await Promise.all([
    import("jspdf"),
    import("jsbarcode"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Pre-render barcode image once
  const barcodeImageData = product.barcode
    ? await renderBarcodeToCanvas(product.barcode)
    : null;

  let labelIndex = 0;

  while (labelIndex < copies) {
    // Add a new page (skip for the very first one)
    if (labelIndex > 0) doc.addPage("a4");

    // Draw up to LABELS_PER_PAGE labels on this page
    for (let row = 0; row < ROWS && labelIndex < copies; row++) {
      for (let col = 0; col < COLS && labelIndex < copies; col++) {
        const x = MARGIN_X + col * (LABEL_CELL.w + GAP_X);
        const y = MARGIN_Y + row * (LABEL_CELL.h + GAP_Y);
        drawLabel(doc, product, x, y, barcodeImageData, formatPrice);
        labelIndex++;
      }
    }
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
  const [copies, setCopies] = useState(10); // default: one full A4 page

  const handlePrint = useCallback(async () => {
    if (!product.barcode) return;

    // Dynamic imports — jsPDF (390 kB) + jsbarcode loaded only on user action
    const [{ default: jsPDF }, { default: JsBarcode }] = await Promise.all([
      import("jspdf"),
      import("jsbarcode"),
    ]);

    const doc = await buildLabelPDF(product, copies, formatPrice);
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }, [product, copies, formatPrice]);

  const handleDownload = useCallback(async () => {
    if (!product.barcode) return;
    const doc = await buildLabelPDF(product, copies, formatPrice);
    const safeName = product.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    doc.save(`etiquette-${safeName}.pdf`);
  }, [product, copies, formatPrice]);

  // Calculate number of pages needed
  const pages = Math.ceil(copies / LABELS_PER_PAGE);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Imprimer l'étiquette
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── A4 preview with 10 labels ── */}
          <div className="flex justify-center">
            <div
              className="bg-white text-black rounded-lg border shadow-md relative overflow-hidden"
              style={{
                width: "280px",
                height: `${280 * (A4.h / A4.w)}px`, // proportional A4
                padding: "4px",
                display: "grid",
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                gap: "2px",
              }}
            >
              {Array.from({ length: Math.min(copies, LABELS_PER_PAGE) }).map(
                (_, i) => (
                  <div
                    key={i}
                    className="border border-dashed border-gray-300 flex flex-col items-center justify-center px-0.5"
                    style={{ fontSize: "5px" }}
                  >
                    <span className="font-bold truncate w-full text-center leading-tight">
                      {product.name || "Produit"}
                    </span>
                    {product.barcode && (
                      <canvas
                        ref={(el) => {
                          if (el && product.barcode) {
                            import("jsbarcode").then(({ default: JsBarcode }) => {
                              try {
                                JsBarcode(el, product.barcode!, {
                                  format: "CODE128",
                                  width: 1,
                                  height: 18,
                                  displayValue: true,
                                  fontSize: 6,
                                  margin: 1,
                                  textMargin: 0,
                                });
                              } catch {
                                // Invalid barcode — ignore
                              }
                            });
                          }
                        }}
                        style={{ maxWidth: "100%", height: "auto" }}
                      />
                    )}
                    <span
                      className="font-bold text-center w-full leading-tight"
                      style={{ color: "hsl(var(--destructive))" }}
                    >
                      {formatPrice(product.price)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* ── Info banner ── */}
          <div className="bg-muted rounded-lg px-4 py-3 text-sm space-y-1">
            <p className="font-medium">
              10 étiquettes par page A4 (2 colonnes × 5 lignes)
            </p>
            <p className="text-muted-foreground">
              Chaque étiquette : {LABEL_CELL.w} × {LABEL_CELL.h} mm — nom,
              code-barres et prix visibles
            </p>
          </div>

          {/* ── Copies ── */}
          <div className="space-y-2">
            <Label>Nombre d'étiquettes</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(e) =>
                setCopies(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
              }
            />
            <p className="text-xs text-muted-foreground">
              {copies} étiquette{copies > 1 ? "s" : ""} → {pages} page{pages > 1 ? "s" : ""} A4
            </p>
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
