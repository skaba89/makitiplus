import { useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/sentry";

interface Props {
  value: string;
  width?: number;
  height?: number;
}

export const BarcodeGenerator = ({ value, width = 2, height = 50 }: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    let cancelled = false;
    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (cancelled) return;
      try {
        JsBarcode(svgRef.current!, value, {
          format: "CODE128",
          width,
          height,
          displayValue: true,
          fontSize: 12,
          margin: 5,
        });
        setLoaded(true);
      } catch (e) {
        reportError(e);
      }
    }).catch(() => {
      // jsbarcode chunk load failure — non-critical
    });

    return () => { cancelled = true; };
  }, [value, width, height]);

  if (!value) return null;

  return <svg ref={svgRef} style={{ opacity: loaded ? 1 : 0, transition: "opacity 150ms" }} />;
};

export const generateBarcode = (): string => {
  // Generate a 12-digit code suitable for CODE128 format.
  // CODE128 can encode any ASCII string; no check digit needed (JsBarcode computes it internally).
  // We avoid the EAN-13 check digit algorithm since we render as CODE128, not EAN-13.
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return timestamp + random;
};
