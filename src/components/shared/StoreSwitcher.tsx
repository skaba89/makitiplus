/**
 * StoreSwitcher — Dropdown to switch between stores within an organization
 *
 * Shows current store name and a dropdown to switch.
 * Only visible when the organization has more than 1 store.
 */

import { useStore } from "@/contexts/StoreContext";
import { usePlanLimit } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Store, Plus, Building2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PlanLimitGuard } from "@/components/saas/PlanLimitGuard";
import { useNavigate } from "react-router-dom";

export function StoreSwitcher() {
  const { currentStore, stores, setCurrentStore, isLoading } = useStore();
  const { data: limitCheck } = usePlanLimit("stores");
  const navigate = useNavigate();

  // Don't render if loading, no stores, or only 1 store (no need to switch)
  if (isLoading || !stores || stores.length === 0) {
    return null;
  }

  // Single store: just show the name without dropdown
  if (stores.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium truncate max-w-[150px]">
          {stores[0].name}
        </span>
        {stores[0].is_headquarters && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            Siège
          </Badge>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 max-w-[220px] h-9"
        >
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">
            {currentStore?.name || "Sélectionner"}
          </span>
          {currentStore?.is_headquarters && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
              Siège
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Boutiques</span>
          <span className="text-xs text-muted-foreground font-normal">
            {limitCheck
              ? `${limitCheck.current_count}/${limitCheck.limit_value ?? "∞"}`
              : ""}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.map((store) => (
          <DropdownMenuItem
            key={store.id}
            onClick={() => setCurrentStore(store.id)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">
                {store.product_count} produits
                {store.city ? ` · ${store.city}` : ""}
              </p>
            </div>
            {store.id === currentStore?.id && (
              <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
            )}
            {store.is_headquarters && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                Siège
              </Badge>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <PlanLimitGuard limitType="stores" showUpgrade={false}>
          <DropdownMenuItem
            onClick={() => navigate("/dashboard/stores")}
            className="flex items-center gap-2 cursor-pointer text-primary"
          >
            <Plus className="h-4 w-4" />
            Ajouter une boutique
          </DropdownMenuItem>
        </PlanLimitGuard>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
