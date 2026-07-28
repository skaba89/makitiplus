import { ReactNode, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useThemeSettings } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  Wallet,
  FolderOpen,
  ChevronDown,
  Store,
  Shield,
  GitMerge,
  Truck,
  BarChart3 as AnalyticsIcon,
  CreditCard,
  Sparkles,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MobileBottomNav } from "./MobileBottomNav";
import { ALL_ROLES, ADMIN_ROLES, MANAGEMENT_ROLES, FINANCIAL_ROLES, POS_ROLES, STORE_ROLES, PRODUCT_MANAGEMENT_ROLES, CASH_CLOSING_ACCESS_ROLES } from "@/types";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { OfflineIndicator, OfflineBanner } from "@/components/ui/offline-indicator";
import { PWAInstallPrompt } from "@/components/ui/pwa-install-prompt";
import { StoreSwitcher } from "@/components/shared/StoreSwitcher";
import { useDemo } from "@/contexts/DemoContext";
import { useStore } from "@/contexts/StoreContext";
import { Badge } from "@/components/ui/badge";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { userRole, profile, signOut } = useAuth();
  const { currentStore } = useStore();

  // Auto sign-out after 5 minutes of inactivity
  useInactivityTimeout();
  const { branding } = useBranding();
  const { settings } = useThemeSettings();
  const { isSuperAdmin, selectedOrgName } = useOrgSelector();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { isDemo } = useDemo();

  // Use current store name (from StoreContext) with fallback to settings + branding
  // Priorité : currentStore.name > settings.store_name > branding.appName
  // Pour super_admin : si une org est sélectionnée, utiliser son nom
  const displayName = isSuperAdmin && selectedOrgName
    ? selectedOrgName
    : (currentStore?.name || settings?.store_name || branding.appName || "MakitiPlus");
  const displayLogo = settings?.logo_url || branding.logoUrl;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrateur",
    manager: "Manager",
    vendeur: "Vendeur",
    comptable: "Comptable",
  };

  const menuItems = [
    {
      name: "Tableau de bord",
      href: "/dashboard",
      icon: LayoutDashboard,
      roles: ALL_ROLES,
    },
    {
      name: "Point de vente",
      href: "/dashboard/pos",
      icon: ShoppingCart,
      roles: POS_ROLES,
    },
    {
      name: "Produits",
      href: "/dashboard/products",
      icon: Package,
      roles: PRODUCT_MANAGEMENT_ROLES,
    },
    {
      name: "Catégories",
      href: "/dashboard/categories",
      icon: FolderOpen,
      roles: MANAGEMENT_ROLES,
    },
    {
      name: "Dépenses",
      href: "/dashboard/expenses",
      icon: Wallet,
      roles: FINANCIAL_ROLES,
    },
    {
      name: "Rapports",
      href: "/dashboard/reports",
      icon: BarChart3,
      roles: FINANCIAL_ROLES,
    },
    {
      name: "Clients",
      href: "/dashboard/customers",
      icon: Users,
      roles: POS_ROLES,
    },
    {
      name: "Fournisseurs",
      href: "/dashboard/suppliers",
      icon: Truck,
      roles: MANAGEMENT_ROLES,
    },
    {
      name: "Commandes",
      href: "/dashboard/purchase-orders",
      icon: Package,
      roles: MANAGEMENT_ROLES,
    },
    {
      name: "Clôture caisse",
      href: "/dashboard/cash-closing",
      icon: Wallet,
      roles: CASH_CLOSING_ACCESS_ROLES,
    },
    {
      name: "Utilisateurs",
      href: "/dashboard/users",
      icon: Shield,
      roles: ADMIN_ROLES,
    },
    {
      name: "Activité Vendeurs",
      href: "/dashboard/seller-activity",
      icon: BarChart3,
      roles: MANAGEMENT_ROLES,
    },
    {
      name: "Magasins",
      href: "/dashboard/stores",
      icon: Store,
      roles: ADMIN_ROLES,
    },
    {
      name: "Analyse Multi-Magasins",
      href: "/dashboard/admin-analytics",
      icon: AnalyticsIcon,
      roles: STORE_ROLES,
    },
    {
      name: "Organisations",
      href: "/dashboard/admin/organizations",
      icon: Building2,
      roles: STORE_ROLES,
    },
    {
      name: "Abonnement",
      href: "/dashboard/billing",
      icon: CreditCard,
      roles: ADMIN_ROLES,
    },
    {
      name: "Assistant IA",
      href: "/dashboard/ai-assistant",
      icon: Sparkles,
      roles: MANAGEMENT_ROLES,
    },
    {
      name: "Conflits sync",
      href: "/dashboard/sync-conflicts",
      icon: GitMerge,
      roles: ADMIN_ROLES,
    },
    {
      name: "Paramètres",
      href: "/dashboard/settings",
      icon: Settings,
      roles: MANAGEMENT_ROLES,
    },
  ];

  const filteredMenuItems = menuItems.filter(
    (item) => userRole && item.roles.includes(userRole)
  );

  const initials = profile?.owner_name
    ? profile.owner_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "U";

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to content — accessibility */}

      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium">
        Aller au contenu principal
      </a>

      {/* Offline Banner */}
      <OfflineBanner />
      {/* Demo Mode Banner */}
      {isDemo && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-white text-center py-1.5 text-sm font-medium">
          Mode démo — les modifications ne sont pas enregistrées.{" "}
          <a href="/auth" className="underline font-bold hover:text-amber-900">Créer mon compte</a>
        </div>
      )}

      {/* Mobile Header */}
      <header className={cn(
        "lg:hidden fixed left-0 right-0 z-50 glass h-14 sm:h-16 flex items-center justify-between px-3 sm:px-4 safe-top",
        isDemo ? "top-8" : "top-0"
      )}>
        <button
          ref={menuButtonRef}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 rounded-lg hover:bg-muted"
          aria-label={isSidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-hero-gradient flex items-center justify-center overflow-hidden">
            {displayLogo ? (
              <img src={displayLogo} alt={displayName} className="w-full h-full object-contain" />
            ) : (
              <span className="text-sm font-bold text-primary-foreground">{displayName.charAt(0)}</span>
            )}
          </div>
          <span className="font-bold">{displayName}</span>
          {isDemo && <Badge variant="outline" className="ml-1.5 text-xs border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30">Démo</Badge>}
        </div>

        <div className="flex items-center gap-2">
          <OfflineIndicator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu utilisateur">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{profile?.owner_name || "Utilisateur"}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {userRole && roleLabels[userRole]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-64 bg-sidebar-background border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between gap-3 px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-hero-gradient flex items-center justify-center overflow-hidden">
              {displayLogo ? (
                <img src={displayLogo} alt={displayName} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xl font-bold text-primary-foreground">{displayName.charAt(0)}</span>
              )}
            </div>
            <div>
              <span className="font-bold text-sidebar-foreground">{displayName}</span>
              {isDemo && <Badge variant="outline" className="ml-1.5 text-xs border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30">Démo</Badge>}
              <p className="text-xs text-muted-foreground">{isSuperAdmin && selectedOrgName ? selectedOrgName : profile?.business_name}</p>
            </div>
          </div>
          {/* Online indicator in sidebar header */}
          <OfflineIndicator />
        </div>

        {/* Store Switcher */}
        <div className="px-4 py-2 border-b border-sidebar-border">
          <StoreSwitcher />
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)", paddingBottom: "80px" }}>
          {filteredMenuItems.map((item) => {
            const isActive = (href: string) => {
              if (href === "/dashboard") return location.pathname === "/dashboard";
              return location.pathname.startsWith(href);
            };
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-sidebar-accent transition-colors" aria-label={`Menu utilisateur — ${profile?.owner_name || 'Utilisateur'}`}>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-sidebar-foreground">
                    {profile?.owner_name || "Utilisateur"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {userRole && roleLabels[userRole]}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                {isSuperAdmin && selectedOrgName ? selectedOrgName : profile?.business_name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => {
            setIsSidebarOpen(false);
            menuButtonRef.current?.focus();
          }}
          aria-hidden="true"
        />
      )}

      {/* Main content */}
      <main id="main-content" className={cn(
        "lg:ml-64 min-h-screen pt-14 sm:pt-16 lg:pt-0",
        isDemo && "pt-[5.5rem] sm:pt-24 lg:pt-8"
      )}>
        <div className="p-3 sm:p-4 lg:p-8 pb-28 sm:pb-24 lg:pb-8">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
};
