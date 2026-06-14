import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Percent } from "lucide-react";

export const TaxSettingsCard = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id ?? null;
  const [rate, setRate] = useState<string>("0");

  const { data: org, isLoading } = useQuery({
    queryKey: ["org-settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("default_tax_rate, owner_user_id")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as { default_tax_rate: number | null; owner_user_id: string };
    },
    enabled: !!orgId && !!user,
  });

  useEffect(() => {
    if (org) setRate(String(org.default_tax_rate ?? 0));
  }, [org]);

  const isOwner = !!user && org?.owner_user_id === user.id;

  const mutation = useMutation({
    mutationFn: async (newRate: number) => {
      if (!orgId) throw new Error("Aucune boutique");
      const { error } = await supabase
        .from("organizations")
        .update({ default_tax_rate: newRate })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
      queryClient.invalidateQueries({ queryKey: ["org-tax-rate"] });
      toast({ title: "Taux de TVA mis à jour" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: message || "Impossible de mettre à jour la TVA",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(rate);
    if (isNaN(num) || num < 0 || num > 100) {
      toast({
        variant: "destructive",
        title: "Valeur invalide",
        description: "Le taux doit être compris entre 0 et 100",
      });
      return;
    }
    mutation.mutate(num);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          Taxes (TVA)
        </CardTitle>
        <CardDescription>
          Taux par défaut appliqué à tous les produits. Les prix saisis sont considérés TTC.
          Un taux spécifique peut être défini par produit pour surclasser ce défaut.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-rate">Taux de TVA par défaut (%)</Label>
            <div className="flex gap-2">
              <Input
                id="tax-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={rate}
                disabled={isLoading || !isOwner}
                onChange={(e) => setRate(e.target.value)}
                className="max-w-[140px]"
              />
              <Button type="submit" disabled={mutation.isPending || !isOwner}>
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </div>
            {!isOwner && (
              <p className="text-xs text-muted-foreground">
                Seul le propriétaire de la boutique peut modifier ce paramètre.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Exemples : Sénégal 18%, Côte d'Ivoire 18%, Cameroun 19,25%, Ghana 15%, Kenya 16%.
              Mettre 0 pour désactiver.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
