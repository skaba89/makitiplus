/**
 * PlanLimitGuard — Blocks child actions when plan limit is reached
 *
 * Security model:
 *   - super_admin: BYPASSES all plan limits (platform operator needs full access)
 *   - admin/manager/vendeur/comptable: subject to plan limits
 *
 * Usage:
 * <PlanLimitGuard limitType="products" fallback={<UpgradePrompt />}>
 *   <Button onClick={addProduct}>Ajouter un produit</Button>
 * </PlanLimitGuard>
 */

import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { usePlanLimit, useFeatureAccess, type LimitType, type FeatureKey } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PlanLimitGuardProps {
  limitType: LimitType;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgrade?: boolean;
}

const LIMIT_LABELS: Record<LimitType, string> = {
  stores: "boutiques",
  users: "utilisateurs",
  products: "produits",
  sales_this_month: "ventes ce mois",
};

export function PlanLimitGuard({
  limitType,
  children,
  fallback,
  showUpgrade = true,
}: PlanLimitGuardProps) {
  const { data: limitCheck, isLoading } = usePlanLimit(limitType);
  const { userRole } = useAuth();

  // SECURITY: super_admin and admin bypass plan limits
  // (admin = gérant du magasin, il gère son propre abonnement)
  if (userRole === "super_admin" || userRole === "admin") {
    return <>{children}</>;
  }

  // While loading, render children (optimistic)
  if (isLoading || !limitCheck) return <>{children}</>;

  // If within limit, render children normally
  if (limitCheck.allowed) return <>{children}</>;

  // Limit reached — show fallback or default upgrade prompt
  if (fallback) return <>{fallback}</>;

  if (!showUpgrade) return null;

  return (
    <UpgradePrompt
      limitType={limitType}
      currentCount={limitCheck.current_count}
      limitValue={limitCheck.limit_value}
      planId={limitCheck.plan_id}
    />
  );
}

interface UpgradePromptProps {
  limitType: LimitType;
  currentCount: number;
  limitValue: number | null;
  planId: string;
}

function UpgradePrompt({ limitType, currentCount, limitValue, planId }: UpgradePromptProps) {
  const label = LIMIT_LABELS[limitType] || limitType;
  const navigate = useNavigate();

  return (
    <Card className="border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="flex items-center gap-3 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Limite atteinte : {currentCount}/{limitValue ?? "∞"} {label}
          </p>
          <p className="text-xs text-muted-foreground">
            Plan actuel : {planId === "starter" ? "Starter" : planId === "croissance" ? "Croissance" : "Enterprise"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => navigate("/dashboard/billing")}
        >
          Upgrader
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── FeatureGate — Blocks features not available in current plan ──

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { data: allowed, isLoading } = useFeatureAccess(feature);
  const { userRole } = useAuth();

  // SECURITY: super_admin and admin bypass feature gates
  // (admin = gérant du magasin, il a accès à toutes les features de son plan)
  if (userRole === "super_admin" || userRole === "admin") {
    return <>{children}</>;
  }

  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return null;
}
