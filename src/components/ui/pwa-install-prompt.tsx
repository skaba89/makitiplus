import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Install prompt for PWA.
 * Shows a floating banner when the app is installable.
 * Dismissed state is stored in localStorage.
 */
export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsStandalone(standalone);

    if (standalone) return;

    // Check if user previously dismissed
    const dismissed = localStorage.getItem("makitiplus_install_dismissed");
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      // Show again after 7 days
      if (daysSinceDismissed < 7) return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after a short delay for better UX
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsStandalone(true);
      }
    } catch (err) {
      console.error("[PWA] Install prompt failed:", err);
    } finally {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("makitiplus_install_dismissed", new Date().toISOString());
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border shadow-strong rounded-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Installer MakitiPlus</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Accédez à votre caisse depuis l'écran d'accueil, même hors-ligne.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="h-8 text-xs gap-1" onClick={handleInstall}>
              <Download className="h-3.5 w-3.5" />
              Installer
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleDismiss}>
              Plus tard
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
