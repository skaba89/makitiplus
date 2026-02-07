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
  const timestamp = Date.now().toString().slice(-10);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  const code = timestamp + random;
  // Calculate check digit (modulo 10)
  let sum = 0;
  for (let i = 0; i < code.length; i++) {
    const digit = parseInt(code[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return code + check;
};
