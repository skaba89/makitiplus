/**
 * Loyalty Program — Customer rewards & points management
 *
 * ⚠️ EXPERIMENTAL / NOT ROUTED YET
 * This module has not been commercially validated.
 * It is NOT added to App.tsx routes, DashboardLayout sidebar, or MobileBottomNav.
 * Do NOT expose until product/UX sign-off.
 *
 * Features:
 * - Loyalty dashboard with stats (members, points, tiers)
 * - Member list with tier badges and point balances
 * - Reward catalog management (create, edit, activate/deactivate)
 * - Transaction history per member
 * - Points earning on sale + redemption
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Award, Plus, Search, Star, Gift, Users, TrendingUp,
  Loader2, Eye, Edit, ToggleLeft, ToggleRight, Crown,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  type LoyaltyAccountRow,
  type LoyaltyRewardRow,
  type LoyaltyStatsRpcRow,
  type LoyaltyTier,
} from "@/types";
import { reportError } from "@/lib/sentry";

// ─── Tier config ────────────────────────────────────────────

const TIER_CONFIG: Record<LoyaltyTier, { label: string; color: string; icon: typeof Star; minPoints: number }> = {
  bronze:   { label: "Bronze",   color: "bg-orange-100 text-orange-700 border-orange-300", icon: Star,     minPoints: 0 },
  silver:   { label: "Argent",   color: "bg-slate-200 text-slate-700 border-slate-400",    icon: Star,     minPoints: 2000 },
  gold:     { label: "Or",       color: "bg-yellow-100 text-yellow-700 border-yellow-400", icon: Crown,   minPoints: 5000 },
  platinum: { label: "Platine",  color: "bg-purple-100 text-purple-700 border-purple-400", icon: Crown,   minPoints: 10000 },
};

const Loyalty = () => {
  const { user } = useAuth();
  const { blockMutation } = useDemo();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRewardFormOpen, setIsRewardFormOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<LoyaltyRewardRow | null>(null);
  const [selectedMember, setSelectedMember] = useState<LoyaltyAccountRow | null>(null);
  const [isMemberDetailOpen, setIsMemberDetailOpen] = useState(false);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [redeemDescription, setRedeemDescription] = useState("");

  // Reward form state
  const [rewardName, setRewardName] = useState("");
  const [rewardDesc, setRewardDesc] = useState("");
  const [rewardType, setRewardType] = useState<string>("discount");
  const [rewardValue, setRewardValue] = useState(0);
  const [rewardPoints, setRewardPoints] = useState(100);
  const [rewardMinTier, setRewardMinTier] = useState<string>("bronze");

  // ─── Queries ──────────────────────────────────────────

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["loyalty-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_loyalty_stats");
      if (error) { reportError(error); throw error; }
      return Array.isArray(data) ? data[0] : data as LoyaltyStatsRpcRow;
    },
    enabled: !!user,
  });

  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery({
    queryKey: ["loyalty-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_accounts")
        .select("*, customers(name, phone)")
        .order("points_balance", { ascending: false });
      if (error) throw error;
      return (data as (LoyaltyAccountRow & { customers: { name: string; phone: string | null } })[]) || [];
    },
    enabled: !!user,
  });

  const { data: rewards = [], isLoading: isLoadingRewards } = useQuery({
    queryKey: ["loyalty-rewards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_rewards")
        .select("*")
        .order("points_required");
      if (error) throw error;
      return (data as LoyaltyRewardRow[]) || [];
    },
    enabled: !!user,
  });

  const { data: memberTransactions = [] } = useQuery({
    queryKey: ["loyalty-transactions", selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      const { data, error } = await supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("account_id", selectedMember.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedMember,
  });

  // ─── Mutations ────────────────────────────────────────

  const saveRewardMutation = useMutation({
    mutationFn: async () => {
      if (editingReward) {
        const { error } = await supabase
          .from("loyalty_rewards")
          .update({
            name: rewardName,
            description: rewardDesc || null,
            reward_type: rewardType,
            reward_value: rewardValue,
            points_required: rewardPoints,
            min_tier: rewardMinTier,
          })
          .eq("id", editingReward.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("loyalty_rewards")
          .insert({
            name: rewardName,
            description: rewardDesc || null,
            reward_type: rewardType,
            reward_value: rewardValue,
            points_required: rewardPoints,
            min_tier: rewardMinTier,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingReward ? "Récompense modifiée" : "Récompense créée" });
      setIsRewardFormOpen(false);
      resetRewardForm();
      queryClient.invalidateQueries({ queryKey: ["loyalty-rewards"] });
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const toggleRewardMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("loyalty_rewards")
        .update({ is_active: !isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-rewards"] });
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember?.customer_id) throw new Error("Aucun membre sélectionné");
      const { error } = await supabase.rpc("redeem_loyalty_points", {
        p_customer_id: selectedMember.customer_id,
        p_points: redeemPoints,
        p_description: redeemDescription || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Points échangés", description: `${redeemPoints} points déduits.` });
      setIsRedeemOpen(false);
      setRedeemPoints(0);
      setRedeemDescription("");
      queryClient.invalidateQueries({ queryKey: ["loyalty-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  // ─── Helpers ──────────────────────────────────────────

  const resetRewardForm = () => {
    setRewardName("");
    setRewardDesc("");
    setRewardType("discount");
    setRewardValue(0);
    setRewardPoints(100);
    setRewardMinTier("bronze");
    setEditingReward(null);
  };

  const openEditReward = (reward: LoyaltyRewardRow) => {
    setEditingReward(reward);
    setRewardName(reward.name);
    setRewardDesc(reward.description || "");
    setRewardType(reward.reward_type);
    setRewardValue(reward.reward_value);
    setRewardPoints(reward.points_required);
    setRewardMinTier(reward.min_tier);
    setIsRewardFormOpen(true);
  };

  const filteredAccounts = accounts.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.customers?.name?.toLowerCase().includes(q) ||
      a.customers?.phone?.toLowerCase().includes(q) ||
      a.tier.toLowerCase().includes(q)
    );
  });

  const totalMembers = stats?.total_members ?? accounts.length;
  const activeMembers = stats?.active_members_30d ?? 0;
  const totalIssued = stats?.total_points_issued ?? 0;
  const totalRedeemed = stats?.total_points_redeemed ?? 0;

  return (
    <DashboardLayout>
      <FeatureGate feature="supplier_management">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Award className="h-6 w-6" />
                Programme de fidélité
              </h1>
              <p className="text-muted-foreground">
                Récompensez vos clients fidèles
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-2xl font-bold">{totalMembers}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Membres</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-2xl font-bold">{activeMembers}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Actifs (30j)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-600" />
                  <span className="text-2xl font-bold">{totalIssued.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Points émis</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-purple-600" />
                  <span className="text-2xl font-bold">{totalRedeemed.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Points échangés</p>
              </CardContent>
            </Card>
          </div>

          {/* Tier distribution */}
          {stats && (
            <div className="grid grid-cols-4 gap-2">
              {(["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]).map((tier) => {
                const cfg = TIER_CONFIG[tier];
                const count = (stats as Record<string, number>)[`${tier}_count`] ?? 0;
                return (
                  <Card key={tier} className="text-center">
                    <CardContent className="pt-4 pb-3">
                      <cfg.icon className={`h-5 w-5 mx-auto mb-1 ${tier === 'platinum' ? 'text-purple-600' : tier === 'gold' ? 'text-yellow-600' : tier === 'silver' ? 'text-slate-500' : 'text-orange-600'}`} />
                      <p className="text-lg font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground">{cfg.label} ({cfg.minPoints}+ pts)</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview" className="gap-2">
                <Users className="h-4 w-4" /> Membres
              </TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2">
                <Gift className="h-4 w-4" /> Récompenses
              </TabsTrigger>
            </TabsList>

            {/* ─── Members Tab ──────────────────────────────── */}
            <TabsContent value="overview" className="space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un membre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {isLoadingAccounts ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAccounts.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Award className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Aucun membre fidélité pour le moment</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Les clients gagnent automatiquement des points lors de leurs achats
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-center">Points</TableHead>
                          <TableHead className="text-center">Total gagnés</TableHead>
                          <TableHead>Palier</TableHead>
                          <TableHead>Inscription</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAccounts.map((account) => {
                          const tierCfg = TIER_CONFIG[account.tier];
                          return (
                            <TableRow key={account.id}>
                              <TableCell>
                                <p className="font-medium">{account.customers?.name || "Inconnu"}</p>
                                {account.customers?.phone && (
                                  <p className="text-xs text-muted-foreground">{account.customers.phone}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                {account.points_balance.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">
                                {account.total_points_earned.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={tierCfg.color}>
                                  <tierCfg.icon className="h-3 w-3 mr-1" />
                                  {tierCfg.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(account.joined_at), "dd MMM yyyy", { locale: fr })}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedMember(account);
                                      setIsMemberDetailOpen(true);
                                    }}
                                    title="Voir détails"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {account.points_balance > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedMember(account);
                                        setIsRedeemOpen(true);
                                      }}
                                      title="Échanger des points"
                                      className="text-purple-600"
                                    >
                                      <Gift className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── Rewards Tab ───────────────────────────────── */}
            <TabsContent value="rewards" className="space-y-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    resetRewardForm();
                    setIsRewardFormOpen(true);
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle récompense
                </Button>
              </div>

              {isLoadingRewards ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : rewards.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Gift className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Aucune récompense configurée</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Créez des récompenses que vos clients pourront échanger contre leurs points
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rewards.map((reward) => {
                    const tierCfg = TIER_CONFIG[reward.min_tier];
                    return (
                      <Card key={reward.id} className={!reward.is_active ? "opacity-60" : ""}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{reward.name}</CardTitle>
                            <Badge variant="outline" className={tierCfg.color}>
                              {tierCfg.label}+
                            </Badge>
                          </div>
                          {reward.description && (
                            <CardDescription>{reward.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 text-amber-500" />
                              <span className="font-bold">{reward.points_required} pts</span>
                            </div>
                            <Badge variant={reward.is_active ? "default" : "secondary"}>
                              {reward.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          {reward.reward_type === "discount" && reward.reward_value > 0 && (
                            <p className="text-sm text-muted-foreground">
                              Remise de {formatPrice(reward.reward_value)}
                            </p>
                          )}
                          {reward.reward_type === "free_product" && (
                            <p className="text-sm text-muted-foreground">Produit gratuit</p>
                          )}
                          {reward.reward_type === "voucher" && reward.reward_value > 0 && (
                            <p className="text-sm text-muted-foreground">
                              Bon d'achat de {formatPrice(reward.reward_value)}
                            </p>
                          )}
                          {reward.redemptions_count > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {reward.redemptions_count} échange(s)
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditReward(reward)}
                              className="gap-1"
                            >
                              <Edit className="h-3 w-3" /> Modifier
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { if (blockMutation("Modifier la récompense")) return; toggleRewardMutation.mutate({
                                id: reward.id,
                                isActive: reward.is_active,
                              }); }}
                              className="gap-1"
                            >
                              {reward.is_active ? (
                                <><ToggleRight className="h-3 w-3" /> Désactiver</>
                              ) : (
                                <><ToggleLeft className="h-3 w-3" /> Activer</>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* ─── Member Detail Dialog ────────────────────────── */}
          <Dialog open={isMemberDetailOpen} onOpenChange={(open) => {
            if (!open) { setIsMemberDetailOpen(false); setSelectedMember(null); }
          }}>
            <DialogContent className="max-w-lg">
              {selectedMember && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      {selectedMember.customers?.name || "Membre"}
                    </DialogTitle>
                    <DialogDescription>
                      <Badge variant="outline" className={TIER_CONFIG[selectedMember.tier].color}>
                        {TIER_CONFIG[selectedMember.tier].label}
                      </Badge>
                      <span className="ml-2">{selectedMember.points_balance.toLocaleString()} points</span>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {memberTransactions.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6">Aucune transaction</p>
                    ) : (
                      memberTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <p className="text-sm font-medium">
                              {tx.type === "earn" ? "Points gagnés" :
                               tx.type === "redeem" ? "Points échangés" :
                               tx.type === "bonus" ? "Bonus" :
                               tx.type === "expire" ? "Expirés" : "Ajustement"}
                            </p>
                            {tx.description && (
                              <p className="text-xs text-muted-foreground">{tx.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(tx.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                            </p>
                          </div>
                          <span className={`font-bold ${tx.points > 0 ? "text-green-600" : "text-red-600"}`}>
                            {tx.points > 0 ? "+" : ""}{tx.points}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* ─── Redeem Points Dialog ────────────────────────── */}
          <Dialog open={isRedeemOpen} onOpenChange={(open) => {
            if (!open) { setIsRedeemOpen(false); setRedeemPoints(0); setRedeemDescription(""); }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Échanger des points</DialogTitle>
                <DialogDescription>
                  {selectedMember?.customers?.name} — Solde : {selectedMember?.points_balance.toLocaleString()} points
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre de points</Label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedMember?.points_balance ?? 0}
                    value={redeemPoints}
                    onChange={(e) => setRedeemPoints(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optionnel)</Label>
                  <Textarea
                    value={redeemDescription}
                    onChange={(e) => setRedeemDescription(e.target.value)}
                    placeholder="Raison de l'échange..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsRedeemOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={() => { if (blockMutation("Échanger des points")) return; redeemMutation.mutate(); }}
                  disabled={redeemMutation.isPending || redeemPoints <= 0 || redeemPoints > (selectedMember?.points_balance ?? 0)}
                >
                  {redeemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Échanger {redeemPoints} points
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── Reward Form Dialog ──────────────────────────── */}
          <Dialog open={isRewardFormOpen} onOpenChange={(open) => {
            if (!open) { setIsRewardFormOpen(false); resetRewardForm(); }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingReward ? "Modifier la récompense" : "Nouvelle récompense"}</DialogTitle>
                <DialogDescription>
                  Configurez une récompense que les clients pourront échanger
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input value={rewardName} onChange={(e) => setRewardName(e.target.value)} placeholder="Ex: Remise 10%" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={rewardDesc} onChange={(e) => setRewardDesc(e.target.value)} placeholder="Description de la récompense..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={rewardType} onValueChange={setRewardType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discount">Remise</SelectItem>
                        <SelectItem value="free_product">Produit gratuit</SelectItem>
                        <SelectItem value="voucher">Bon d'achat</SelectItem>
                        <SelectItem value="custom">Personnalisé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Points requis *</Label>
                    <Input type="number" min={1} value={rewardPoints} onChange={(e) => setRewardPoints(parseInt(e.target.value) || 1)} />
                  </div>
                </div>
                {(rewardType === "discount" || rewardType === "voucher") && (
                  <div className="space-y-2">
                    <Label>Valeur ({rewardType === "discount" ? "montant remise" : "montant bon"})</Label>
                    <Input type="number" min={0} value={rewardValue} onChange={(e) => setRewardValue(parseFloat(e.target.value) || 0)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Palier minimum</Label>
                  <Select value={rewardMinTier} onValueChange={setRewardMinTier}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]).map((tier) => (
                        <SelectItem key={tier} value={tier}>
                          {TIER_CONFIG[tier].label} ({TIER_CONFIG[tier].minPoints}+ pts)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsRewardFormOpen(false)}>Annuler</Button>
                <Button
                  onClick={() => { if (blockMutation("Sauvegarder la récompense")) return; saveRewardMutation.mutate(); }}
                  disabled={saveRewardMutation.isPending || !rewardName || rewardPoints <= 0}
                >
                  {saveRewardMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingReward ? "Enregistrer" : "Créer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default Loyalty;
