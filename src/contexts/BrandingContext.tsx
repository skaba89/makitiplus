import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/sentry";

export interface BrandingConfig {
  appName: string;
  brandColor: string; // HSL format: "16 80% 50%"
  accentColor: string; // HSL format: "38 70% 88%"
  logoUrl: string | null;
  themeMode: "light" | "dark" | "system";
  receiptTemplate: "default" | "minimal" | "detailed" | "african";
  fontFamily: string;
  language: string;
}

const DEFAULT_BRANDING: BrandingConfig = {
  appName: "MakitiPlus",
  brandColor: "16 80% 50%",
  accentColor: "38 70% 88%",
  logoUrl: null,
  themeMode: "system",
  receiptTemplate: "default",
  fontFamily: "Plus Jakarta Sans",
  language: "fr",
};

interface BrandingContextType {
  branding: BrandingConfig;
  updateBranding: (updates: Partial<BrandingConfig>) => Promise<void>;
  uploadLogo: (file: File) => Promise<string | null>;
  removeLogo: () => Promise<void>;
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within BrandingProvider");
  }
  return context;
};

/** Convert HSL string "16 80% 50%" to hex for display */
export function hslToHex(hsl: string): string {
  const parts = hsl.split(" ");
  if (parts.length !== 3) return "#E8612D"; // fallback

  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Convert hex color to HSL string "H S% L%" */
export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "16 80% 50%";

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Apply branding CSS variables to the document root */
function applyBrandingToDOM(branding: BrandingConfig) {
  const root = document.documentElement;

  // Apply primary/brand color
  root.style.setProperty("--primary", branding.brandColor);
  root.style.setProperty("--ring", branding.brandColor);
  root.style.setProperty("--sidebar-primary", branding.brandColor);
  root.style.setProperty("--sidebar-ring", branding.brandColor);

  // Apply accent color
  root.style.setProperty("--accent", branding.accentColor);

  // Apply gradient
  root.style.setProperty(
    "--gradient-hero",
    `linear-gradient(135deg, hsl(${branding.brandColor}) 0%, hsl(${branding.accentColor}) 100%)`
  );

  // Apply glow shadow
  root.style.setProperty(
    "--shadow-glow",
    `0 0 40px -8px hsl(${branding.brandColor} / 0.3)`
  );

  // Apply font family
  root.style.setProperty("font-family", `'${branding.fontFamily}', system-ui, sans-serif`);

  // Apply theme mode
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark =
    branding.themeMode === "dark" ||
    (branding.themeMode === "system" && prefersDark);

  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const { user, profile } = useAuth();
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);

  // Load branding from organization
  useEffect(() => {
    const loadBranding = async () => {
      if (!profile?.organization_id) {
        // No org — use defaults + user theme preference
        setBranding((prev) => ({
          ...prev,
          themeMode: (profile?.theme_mode as BrandingConfig["themeMode"]) || "system",
          language: profile?.language || "fr",
        }));
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("brand_color, accent_color, logo_url, app_name, theme_mode, receipt_template, font_family, language")
          .eq("id", profile.organization_id)
          .single();

        if (error) throw error;

        if (data) {
          setBranding({
            appName: data.app_name || DEFAULT_BRANDING.appName,
            brandColor: data.brand_color || DEFAULT_BRANDING.brandColor,
            accentColor: data.accent_color || DEFAULT_BRANDING.accentColor,
            logoUrl: data.logo_url || DEFAULT_BRANDING.logoUrl,
            themeMode: data.theme_mode || DEFAULT_BRANDING.themeMode,
            receiptTemplate: data.receipt_template || DEFAULT_BRANDING.receiptTemplate,
            fontFamily: data.font_family || DEFAULT_BRANDING.fontFamily,
            language: data.language || DEFAULT_BRANDING.language,
          });
        }
      } catch (err) {
        console.warn("[Branding] Failed to load org branding:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadBranding();
  }, [profile?.organization_id, profile?.theme_mode, profile?.language]);

  // Apply branding to DOM whenever it changes
  useEffect(() => {
    applyBrandingToDOM(branding);
  }, [branding]);

  // Listen for system dark mode changes
  useEffect(() => {
    if (branding.themeMode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyBrandingToDOM(branding);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [branding]);

  const updateBranding = useCallback(async (updates: Partial<BrandingConfig>) => {
    if (!profile?.organization_id) return;

    const newBranding = { ...branding, ...updates };
    setBranding(newBranding);

    // Map to DB column names
    const dbUpdates: Record<string, unknown> = {};
    if (updates.appName !== undefined) dbUpdates.app_name = updates.appName;
    if (updates.brandColor !== undefined) dbUpdates.brand_color = updates.brandColor;
    if (updates.accentColor !== undefined) dbUpdates.accent_color = updates.accentColor;
    if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl;
    if (updates.themeMode !== undefined) dbUpdates.theme_mode = updates.themeMode;
    if (updates.receiptTemplate !== undefined) dbUpdates.receipt_template = updates.receiptTemplate;
    if (updates.fontFamily !== undefined) dbUpdates.font_family = updates.fontFamily;
    if (updates.language !== undefined) dbUpdates.language = updates.language;

    try {
      const { error } = await supabase
        .from("organizations")
        .update(dbUpdates)
        .eq("id", profile.organization_id);

      if (error) throw error;

      // Also update user-level theme/language preference
      if (updates.themeMode !== undefined || updates.language !== undefined) {
        await supabase
          .from("profiles")
          .update({
            ...(updates.themeMode !== undefined ? { theme_mode: updates.themeMode } : {}),
            ...(updates.language !== undefined ? { language: updates.language } : {}),
          })
          .eq("user_id", user!.id);
      }
    } catch (err) {
      reportError(err instanceof Error ? err : new Error('[Branding] Failed to save: ' + String(err)));
      // Revert on error
      setBranding(branding);
      throw err;
    }
  }, [branding, profile?.organization_id, user?.id]);

  const uploadLogo = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;

    const ext = file.name.split(".").pop();
    const path = `${user.id}/logo.${ext}`;

    // Delete existing logo
    try {
      await supabase.storage.from("logos").remove([path]);
    } catch {
      // ignore
    }

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);

    // Add timestamp to bust cache
    const logoUrl = `${publicUrl}?t=${Date.now()}`;

    await updateBranding({ logoUrl });
    return logoUrl;
  }, [user, updateBranding]);

  const removeLogo = useCallback(async () => {
    if (!user) return;

    try {
      const { data: files } = await supabase.storage
        .from("logos")
        .list(user.id);

      if (files && files.length > 0) {
        await supabase.storage
          .from("logos")
          .remove(files.map((f) => `${user.id}/${f.name}`));
      }
    } catch {
      // ignore
    }

    await updateBranding({ logoUrl: null });
  }, [user, updateBranding]);

  return (
    <BrandingContext.Provider
      value={{
        branding,
        updateBranding,
        uploadLogo,
        removeLogo,
        isLoading,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
};
