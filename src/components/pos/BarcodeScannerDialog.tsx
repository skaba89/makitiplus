import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Loader2, SwitchCamera } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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
  const [isStarting, setIsStarting] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onScanCountRef = useRef(0);
  onScanRef.current = onScan;

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().then(() => {
            scannerRef.current?.clear();
          }).catch(() => {
            // ignore
          });
        } else {
          scannerRef.current.clear();
        }
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async (mode: "environment" | "user") => {
    setIsStarting(true);
    setError(null);
    stopScanner();

    const scannerId = "barcode-scanner-region";

    try {
      // Configuration avec support de tous les formats de code-barres
      const html5Qrcode = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
        ],
        verbose: false,
      });
      scannerRef.current = html5Qrcode;

      // Obtenir les caméras disponibles
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setError("Aucune caméra détectée sur cet appareil.");
        setIsStarting(false);
        return;
      }

      // Choisir la caméra : préférence arrière (environment)
      let cameraId: string | { facingMode: string };
      const backCameras = devices.filter(d =>
        d.label.toLowerCase().includes("back") ||
        d.label.toLowerCase().includes("rear") ||
        d.label.toLowerCase().includes("environment")
      );

      if (mode === "environment" && backCameras.length > 0) {
        cameraId = backCameras[0].id;
      } else if (devices.length > 0) {
        // Fallback : utiliser l'ID de la caméra
        cameraId = mode === "environment"
          ? devices[devices.length - 1].id // généralement la caméra arrière
          : devices[0].id; // généralement la caméra avant
      } else {
        cameraId = { facingMode: mode };
      }

      await html5Qrcode.start(
        cameraId,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const width = Math.floor(minEdge * 0.7);
            const height = Math.floor(width * 0.6);
            return { width, height };
          },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          // Éviter les scans multiples rapides
          onScanCountRef.current += 1;
          if (onScanCountRef.current === 1) {
            onScanRef.current(decodedText);
            handleClose();
          }
        },
        () => {
          // Ignorer les échecs de scan frame
        }
      );

      setIsStarting(false);
    } catch (err) {
      reportError(err instanceof Error ? err : new Error(String(err)));
      const errMsg = String(err);
      if (errMsg.includes("Permission") || errMsg.includes("NotAllowed")) {
        setError("Permission caméra refusée. Autorisez l'accès à la caméra dans votre navigateur.");
      } else if (errMsg.includes("NotFound") || errMsg.includes("NotFoundError")) {
        setError("Aucune caméra trouvée sur cet appareil.");
      } else if (errMsg.includes("NotReadable")) {
        setError("La caméra est déjà utilisée par une autre application. Fermez-la et réessayez.");
      } else {
        setError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
      }
      setIsStarting(false);
    }
  }, [stopScanner]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      onScanCountRef.current = 0;
      return;
    }

    // Démarrer le scanner après que le DOM soit prêt
    const timeout = setTimeout(() => {
      startScanner(facingMode);
    }, 500);

    return () => {
      clearTimeout(timeout);
      stopScanner();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = useCallback(() => {
    stopScanner();
    onScanCountRef.current = 0;
    setError(null);
    onClose();
  }, [stopScanner, onClose]);

  const handleSwitchCamera = () => {
    const newMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);
    onScanCountRef.current = 0;
    startScanner(newMode);
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
              <p className="text-sm text-muted-foreground text-center px-4">
                {error}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => startScanner(facingMode)}>
                  Réessayer
                </Button>
                <Button variant="ghost" onClick={handleClose}>
                  Fermer
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <div
                  id="barcode-scanner-region"
                  className="w-full rounded-lg overflow-hidden bg-black min-h-[300px]"
                  style={{ aspectRatio: "4 / 3" }}
                />
                {isStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                      <p className="text-sm text-white">Démarrage de la caméra...</p>
                    </div>
                  </div>
                )}
                {/* Cadre de visée */}
                {!isStarting && !error && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="border-2 border-white/70 rounded-lg w-[70%] h-[40%] shadow-lg" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Pointez vers un code-barres ou QR code
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSwitchCamera}
                  className="gap-1"
                  disabled={isStarting}
                >
                  <SwitchCamera className="h-4 w-4" />
                  Retourner
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
