import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { reportError } from "@/lib/sentry";

interface BarcodeScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const BarcodeScannerDialog = ({
  isOpen,
  onClose,
  onScan,
}: BarcodeScannerDialogProps) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const scannerId = "barcode-scanner-region";

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.5,
          },
          (decodedText) => {
            onScan(decodedText);
            handleClose();
          },
          () => {
            // Ignore scan failures (no code detected)
          }
        )
        .catch((err) => {
          reportError(err instanceof Error ? err : new Error(String(err)));
          setError(
            "Impossible d'accéder à la caméra. Vérifiez les permissions."
          );
        });
    }, 300);

    return () => {
      clearTimeout(timeout);
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => {});
    }
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scanner un code-barres
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <CameraOff className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                {error}
              </p>
              <Button variant="outline" onClick={handleClose}>
                Fermer
              </Button>
            </div>
          ) : (
            <>
              <div
                id="barcode-scanner-region"
                ref={containerRef}
                className="w-full rounded-lg overflow-hidden"
              />
              <p className="text-sm text-muted-foreground text-center">
                Pointez la caméra vers un code-barres
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
