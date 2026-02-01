import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  ShoppingCart, 
  Package, 
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const Dashboard = () => {
  const { profile, userRole } = useAuth();

  const stats = [
    {
      title: "Ventes du jour",
      value: "125 000 FCFA",
      change: "+12%",
      trend: "up",
      icon: ShoppingCart,
    },
    {
      title: "Transactions",
      value: "24",
      change: "+8%",
      trend: "up",
      icon: TrendingUp,
    },
    {
      title: "Produits en stock",
      value: "156",
      change: "-3",
      trend: "down",
      icon: Package,
    },
    {
      title: "Dépenses du mois",
      value: "45 000 FCFA",
      change: "+5%",
      trend: "up",
      icon: Wallet,
    },
  ];

  const roleLabels = {
    admin: "Administrateur",
    manager: "Manager",
    vendeur: "Vendeur",
    comptable: "Comptable",
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Bonjour, {profile?.owner_name?.split(" ")[0] || "Utilisateur"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Voici un aperçu de votre activité - {userRole && roleLabels[userRole]}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className="p-2 rounded-lg bg-primary/10">
                  <stat.icon className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 mt-1">
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="h-4 w-4 text-success" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-destructive" />
                  )}
                  <span
                    className={
                      stat.trend === "up" ? "text-success text-sm" : "text-destructive text-sm"
                    }
                  >
                    {stat.change}
                  </span>
                  <span className="text-muted-foreground text-sm">vs hier</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Actions rapides</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {userRole && ["admin", "manager", "vendeur"].includes(userRole) && (
              <Card className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-hero-gradient mb-4 group-hover:scale-110 transition-transform">
                    <ShoppingCart className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <span className="font-medium">Nouvelle vente</span>
                </CardContent>
              </Card>
            )}
            {userRole && ["admin", "manager", "vendeur"].includes(userRole) && (
              <Card className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-success-gradient mb-4 group-hover:scale-110 transition-transform">
                    <Package className="h-8 w-8 text-success-foreground" />
                  </div>
                  <span className="font-medium">Ajouter produit</span>
                </CardContent>
              </Card>
            )}
            {userRole && ["admin", "manager", "comptable"].includes(userRole) && (
              <Card className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-secondary mb-4 group-hover:scale-110 transition-transform">
                    <Wallet className="h-8 w-8 text-secondary-foreground" />
                  </div>
                  <span className="font-medium">Enregistrer dépense</span>
                </CardContent>
              </Card>
            )}
            <Card className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <div className="p-4 rounded-2xl bg-muted mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                <span className="font-medium">Voir rapports</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Sales */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Ventes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune vente pour le moment</p>
              <p className="text-sm">Commencez à vendre pour voir vos transactions ici</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
