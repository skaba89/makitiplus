import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ALL_ROLES, INVENTORY_ROLES, FINANCIAL_ROLES, POS_ROLES } from "@/types";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Settings,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  Wallet,
  FolderOpen,
  Shield,
  Store,
  GitMerge,
} from "lucide-react";

interface BottomNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const primaryNavItems: BottomNavItem[] = [
  {
    name: "Accueil",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
  },
  {
    name: "Vente",
    href: "/dashboard/pos",
    icon: ShoppingCart,
    roles: POS_ROLES,
  },
  {
    name: "Produits",
    href: "/dashboard/products",
    icon: Package,
    roles: INVENTORY_ROLES,
  },
  {
    name: "Fournisseurs",
    href: "/dashboard/suppliers",
    icon: Truck,
    roles: ["super_admin", "admin", "manager"],
  },
];

/** Additional nav items shown in the "More" sheet */
const moreNavItems: BottomNavItem[] = [
  {
    name: "Catégories",
    href: "/dashboard/categories",
    icon: FolderOpen,
    roles: ["super_admin", "admin", "manager"],
  },
  {
    name: "Clients",
    href: "/dashboard/customers",
    icon: Users,
    roles: ["super_admin", "admin", "manager", "vendeur"],
  },
  {
    name: "Dépenses",
    href: "/dashboard/expenses",
    icon: Wallet,
    roles: ["super_admin", "admin", "manager", "comptable"],
  },
  {
    name: "Rapports",
    href: "/dashboard/reports",
    icon: BarChart3,
    roles: FINANCIAL_ROLES,
  },
  {
    name: "Utilisateurs",
    href: "/dashboard/users",
    icon: Shield,
    roles: ["super_admin", "admin"],
  },
  {
    name: "Magasins",
    href: "/dashboard/stores",
    icon: Store,
    roles: ["super_admin"],
  },
  {
    name: "Conflits sync",
    href: "/dashboard/sync-conflicts",
    icon: GitMerge,
    roles: ["super_admin", "admin"],
  },
  {
    name: "Paramètres",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["super_admin", "admin", "manager"],
  },
];

/**
 * Mobile bottom navigation bar.
 * Only visible on screens < lg (1024px).
 * Shows 4 primary items + a "More" button that opens a sheet
 * with additional navigation links filtered by user role.
 */
export const MobileBottomNav = () => {
  const location = useLocation();
  const { userRole } = useAuth();

  const filteredPrimary = primaryNavItems.filter(
    (item) => userRole && item.roles.includes(userRole)
  );

  const filteredMore = moreNavItems.filter(
    (item) => userRole && item.roles.includes(userRole)
  );

  // Determine if a nav item is active (exact match or starts with href for sub-routes)
  const isActive = (href: string) => {
    if (href === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(href);
  };

  const isMoreItemActive = filteredMore.some((item) => isActive(item.href));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-16">
        {filteredPrimary.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-button",
                "transition-colors duration-150",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
              <span className={cn("text-micro font-medium", active && "font-semibold")}>
                {item.name}
              </span>
            </Link>
          );
        })}

        {/* "More" button — opens a bottom sheet with additional nav items */}
        {filteredMore.length > 0 && (
          <Sheet>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-button",
                  "transition-colors duration-150",
                  isMoreItemActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Menu className={cn("h-5 w-5", isMoreItemActive && "stroke-[2.5px]")} />
                <span className={cn("text-[10px] font-medium", isMoreItemActive && "font-semibold")}>
                  Plus
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl">
              <SheetHeader className="pb-3">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 pb-6">
                {filteredMore.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};
