import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface Props {
  value: string;
  width?: number;
  height?: number;
}

export const BarcodeGenerator = ({ value, width = 2, height = 50 }: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width,
          height,
          displayValue: true,
          fontSize: 12,
          margin: 5,
        });
      } catch {
        // Invalid barcode value
      }
    }
  }, [value, width, height]);

  if (!value) return null;

  return <svg ref={svgRef} />;
};

export const generateBarcode = (): string => {
  // Generate a 12-digit code suitable for CODE128 format.
  // CODE128 can encode any ASCII string; no check digit needed (JsBarcode computes it internally).
  // We avoid the EAN-13 check digit algorithm since we render as CODE128, not EAN-13.
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return timestamp + random;
};
