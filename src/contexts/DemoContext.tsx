import { createContext, useContext, ReactNode, useMemo } from "react";
import { toast } from "sonner";

/**
 * DemoContext — Global demo mode for MakitiPlus
 *
 * When VITE_DEMO_MODE=true, the app runs in read-only demo mode:
 * - All mutations are blocked with a clean toast message
 * - A "Démo" badge appears in the sidebar and mobile header
 * - A CTA "Créer mon compte" banner is shown
 *
 * Detection: VITE_DEMO_MODE env var OR demo email pattern (*@demo.makitiplus.com)
 */

interface DemoContextType {
  /** Whether the app is running in demo mode */
  isDemo: boolean;
  /**
   * Block a mutation if in demo mode. Shows a toast and returns true.
   * Usage: `if (blockMutation()) return;`
   */
  blockMutation: (action?: string) => boolean;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export const useDemo = () => {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return context;
};

// Check if running in demo mode
function detectDemoMode(): boolean {
  // 1. Explicit env var
  if (import.meta.env.VITE_DEMO_MODE === "true") {
    return true;
  }

  // 2. Demo email pattern (set by auth flow when using demo account)
  try {
    const stored = localStorage.getItem("makitiplus_demo_mode");
    if (stored === "true") {
      return true;
    }
  } catch {
    // localStorage may be unavailable
  }

  return false;
}

export const DemoProvider = ({ children }: { children: ReactNode }) => {
  const isDemo = useMemo(() => detectDemoMode(), []);

  const blockMutation = (action?: string): boolean => {
    if (!isDemo) return false;

    const actionLabel = action || "cette action";
    toast.warning("Mode démo", {
      description: `${actionLabel} n'est pas disponible en mode démo. Créez votre compte pour accéder à toutes les fonctionnalités.`,
      duration: 4000,
      action: {
        label: "Créer mon compte",
        onClick: () => window.open("/auth", "_self"),
      },
    });
    return true;
  };

  const value = useMemo(
    () => ({ isDemo, blockMutation }),
    [isDemo]
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
    </DemoContext.Provider>
  );
};

/**
 * Helper: set demo mode from auth flow (when user signs in with demo credentials)
 */
export const setDemoMode = (enabled: boolean) => {
  try {
    if (enabled) {
      localStorage.setItem("makitiplus_demo_mode", "true");
    } else {
      localStorage.removeItem("makitiplus_demo_mode");
    }
  } catch {
    // localStorage may be unavailable
  }
};

/**
 * Hook: useDemoMutation — drop-in replacement for useMutation that blocks in demo mode
 *
 * Usage:
 * ```tsx
 * const createProduct = useDemoMutation({
 *   mutationFn: (data) => supabase.from('products').insert(data),
 *   demoAction: 'Créer un produit',
 *   onSuccess: () => { ... },
 * });
 * ```
 */
export { useDemoMutation } from "@/hooks/useDemoMutation";
