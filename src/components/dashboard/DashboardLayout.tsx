import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, userRole, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const roleLabels = {
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
      roles: ["admin", "manager", "vendeur", "comptable"],
    },
    {
      name: "Point de vente",
      href: "/dashboard/pos",
      icon: ShoppingCart,
      roles: ["admin", "manager", "vendeur"],
    },
    {
      name: "Produits",
      href: "/dashboard/products",
      icon: Package,
      roles: ["admin", "manager", "vendeur"],
    },
    {
      name: "Catégories",
      href: "/dashboard/categories",
      icon: FolderOpen,
      roles: ["admin", "manager"],
    },
    {
      name: "Dépenses",
      href: "/dashboard/expenses",
      icon: Wallet,
      roles: ["admin", "manager", "comptable"],
    },
    {
      name: "Rapports",
      href: "/dashboard/reports",
      icon: BarChart3,
      roles: ["admin", "manager", "comptable"],
    },
    {
      name: "Clients",
      href: "/dashboard/customers",
      icon: Users,
      roles: ["admin", "manager", "vendeur"],
    },
    {
      name: "Utilisateurs",
      href: "/dashboard/users",
      icon: Shield,
      roles: ["admin"],
    },
    {
      name: "Conflits sync",
      href: "/dashboard/sync-conflicts",
      icon: GitMerge,
      roles: ["admin"],
    },
    {
      name: "Paramètres",
      href: "/dashboard/settings",
      icon: Settings,
      roles: ["admin", "manager"],
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
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass h-16 flex items-center justify-between px-4">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 rounded-lg hover:bg-muted"
        >
          {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-hero-gradient flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">S</span>
          </div>
          <span className="font-bold">SahelPOS</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
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
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-64 bg-sidebar-background border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-xl bg-hero-gradient flex items-center justify-center">
            <span className="text-xl font-bold text-primary-foreground">S</span>
          </div>
          <div>
            <span className="font-bold text-sidebar-foreground">SahelPOS</span>
            <p className="text-xs text-muted-foreground">{profile?.business_name}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {filteredMenuItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                  isActive
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
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-sidebar-accent transition-colors">
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
                {profile?.business_name}
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
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
};
