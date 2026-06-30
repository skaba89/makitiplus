import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/lib/sentry";

export interface StoreSettings {
  id: string;
  organization_id: string;
  store_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  success_color: string | null;
  template: string | null;
  sidebar_style: string | null;
  card_style: string | null;
  receipt_footer: string | null;
  receipt_show_logo: boolean | null;
  receipt_show_tax: boolean | null;
  extra_settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type TemplateName = "default" | "modern" | "minimal" | "african" | "luxury";
export type SidebarStyle = "default" | "compact" | "expanded";
export type CardStyle = "elevated" | "flat" | "outlined";

interface ThemeContextType {
  settings: StoreSettings | null;
  isLoading: boolean;
  isUpdating: boolean;
  updateSettings: (data: Partial<StoreSettings>) => Promise<void>;
  applyTheme: () => void;
  resetTheme: () => void;
}

const DEFAULT_COLORS = {
  primary: "16 80% 50%",
  secondary: "38 60% 92%",
  accent: "38 70% 88%",
  success: "152 60% 42%",
};

// Template-specific color presets
export const TEMPLATE_PRESETS: Record<TemplateName, { label: string; description: string; primary: string; secondary: string; accent: string }> = {
  default: {
    label: "Classique",
    description: "Terracotta chaleureux — identité africaine authentique",
    primary: "16 80% 50%",
    secondary: "38 60% 92%",
    accent: "38 70% 88%",
  },
  modern: {
    label: "Moderne",
    description: "Bleu vif et épuré — look tech professionnel",
    primary: "221 83% 53%",
    secondary: "220 14% 96%",
    accent: "210 40% 90%",
  },
  minimal: {
    label: "Minimaliste",
    description: "Gris élégant — sobre et épuré",
    primary: "215 16% 36%",
    secondary: "210 14% 96%",
    accent: "210 10% 93%",
  },
  african: {
    label: "Africain",
    description: "Vert émeraude et or — richesse et nature",
    primary: "152 65% 38%",
    secondary: "45 80% 88%",
    accent: "40 70% 80%",
  },
  luxury: {
    label: "Luxe",
    description: "Noir et or — premium et sophistiqué",
    primary: "43 90% 52%",
    secondary: "30 5% 15%",
    accent: "43 60% 85%",
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useThemeSettings = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeSettings must be used within a ThemeProvider");
  }
  return context;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch store settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["storeSettings", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (error) {
        // Gracefully handle missing table (404) or other errors
        const isMissingTable = error.code === '42P01' || error.message?.includes('does not exist') || (error as unknown as { status?: number }).status === 404;
        if (isMissingTable) {
          // store_settings table non disponible — silencieux, non critique
        } else {
          reportError(new Error('Error fetching store settings: ' + error.message));
        }
        return null;
      }

      // If no settings exist yet, create them
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from("store_settings")
          .insert({
            organization_id: profile.organization_id,
            store_name: profile.business_name,
          })
          .select()
          .single();

        if (insertError) {
          // Don't crash if table doesn't exist
          const isMissingTable = insertError.code === '42P01' || insertError.message?.includes('does not exist') || (insertError as unknown as { status?: number }).status === 404;
          if (!isMissingTable) {
            reportError(new Error('Error creating store settings: ' + insertError.message));
          }
          return null;
        }
        return newSettings as StoreSettings;
      }

      return data as StoreSettings;
    },
    enabled: !!profile?.organization_id,
    staleTime: 5 * 60 * 1000,
  });

  // Apply CSS variables from settings
  const applyTheme = useCallback(() => {
    const root = document.documentElement;

    if (!settings) return;

    const primary = settings.primary_color || DEFAULT_COLORS.primary;
    const secondary = settings.secondary_color || DEFAULT_COLORS.secondary;
    const accent = settings.accent_color || DEFAULT_COLORS.accent;
    const success = settings.success_color || DEFAULT_COLORS.success;

    // Apply light mode variables
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--primary-foreground", "0 0% 100%");
    root.style.setProperty("--secondary", secondary);
    root.style.setProperty("--secondary-foreground", "20 30% 20%");
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-foreground", "20 30% 15%");
    root.style.setProperty("--success", success);
    root.style.setProperty("--success-foreground", "0 0% 100%");
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--sidebar-primary", primary);
    root.style.setProperty("--sidebar-primary-foreground", "0 0% 100%");

    // Update gradients
    const primaryHsl = primary;
    root.style.setProperty(
      "--gradient-hero",
      `linear-gradient(135deg, hsl(${primaryHsl}) 0%, hsl(${secondary}) 100%)`
    );
    root.style.setProperty(
      "--shadow-glow",
      `0 0 40px -8px hsl(${primaryHsl} / 0.3)`
    );

    // Apply logo as favicon if available
    if (settings.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
    }

    // Apply store name as document title
    if (settings.store_name) {
      document.title = `${settings.store_name} — MakitiPlus`;
    }
  }, [settings]);

  // Reset to default theme
  const resetTheme = useCallback(() => {
    const root = document.documentElement;
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--secondary");
    root.style.removeProperty("--secondary-foreground");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-foreground");
    root.style.removeProperty("--success");
    root.style.removeProperty("--success-foreground");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--sidebar-primary");
    root.style.removeProperty("--sidebar-primary-foreground");
    root.style.removeProperty("--gradient-hero");
    root.style.removeProperty("--shadow-glow");
  }, []);

  // Apply theme whenever settings change
  useEffect(() => {
    if (settings) {
      applyTheme();
    }
    return () => {
      // Cleanup on unmount
    };
  }, [settings, applyTheme]);

  // Update settings mutation
  const updateSettings = useCallback(
    async (data: Partial<StoreSettings>) => {
      if (!settings) return;
      setIsUpdating(true);
      try {
        const { error } = await supabase
          .from("store_settings")
          .update(data as Record<string, unknown>)
          .eq("id", settings.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
      } finally {
        setIsUpdating(false);
      }
    },
    [settings, queryClient]
  );

  return (
    <ThemeContext.Provider
      value={{
        settings: settings ?? null,
        isLoading,
        isUpdating,
        updateSettings,
        applyTheme,
        resetTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
