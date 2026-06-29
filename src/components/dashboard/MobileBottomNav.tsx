import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";

interface BottomNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const bottomNavItems: BottomNavItem[] = [
  {
    name: "Accueil",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "admin", "manager", "vendeur", "comptable"],
  },
  {
    name: "Vente",
    href: "/dashboard/pos",
    icon: ShoppingCart,
    roles: ["super_admin", "admin", "manager", "vendeur"],
  },
  {
    name: "Produits",
    href: "/dashboard/products",
    icon: Package,
    roles: ["super_admin", "admin", "manager", "vendeur"],
  },
  {
    name: "Rapports",
    href: "/dashboard/reports",
    icon: BarChart3,
    roles: ["super_admin", "admin", "manager", "comptable"],
  },
  {
    name: "Plus",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["super_admin", "admin", "manager", "vendeur", "comptable"],
  },
];

/**
 * Mobile bottom navigation bar.
 * Only visible on screens < lg (1024px).
 * Replaces the hamburger sidebar for quick navigation.
 */
export const MobileBottomNav = () => {
  const location = useLocation();
  const { userRole } = useAuth();

  const filteredItems = bottomNavItems.filter(
    (item) => userRole && item.roles.includes(userRole)
  );

  // Determine if a nav item is active (exact match or starts with href for sub-routes)
  const isActive = (href: string) => {
    if (href === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-16">
        {filteredItems.map((item) => {
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
              <span className={cn("text-[10px] font-medium", active && "font-semibold")}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
