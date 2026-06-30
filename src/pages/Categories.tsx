import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, FolderOpen, Pencil, Trash2, Loader2, Search, ArrowUpDown, Tag, Package } from "lucide-react";
import { CategoryIcon, ICON_MAP } from "@/components/ui/category-icon";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Tables"]["categories"]["Row"] & {
  products?: { count: number }[];
};
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];

const PRESET_ICONS = ["Package", "Wheat", "CupSoda", "Sparkles", "Brush", "Wrench", "Smartphone", "Shirt", "Croissant", "Leaf", "Drumstick", "Snowflake"];
const PRESET_COLORS = [
  "#E57E4D", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
  "#EC4899", "#EF4444", "#6366F1", "#14B8A6", "#F97316",
  "#0EA5E9", "#22C55E", "#A855F7", "#F43F5E", "#78716C",
];

const Categories = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "products" | "default">("default");

  const [formData, setFormData] = useState({
    name: "",
    icon: "Package",
    color: "#E57E4D",
    description: "",
  });

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*, products(count)")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name");

      if (error) throw error;
      return data as Category[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (category: Omit<CategoryInsert, "user_id">) => {
      // Get max sort_order for this org
      const { data: maxOrder } = await supabase
        .from("categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextOrder = (maxOrder?.[0]?.sort_order || 0) + 1;

      const { data, error } = await supabase
        .from("categories")
        .insert({
          ...category,
          user_id: user!.id,
          sort_order: nextOrder,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Catégorie créée avec succès" });
      handleCloseForm();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer la catégorie",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...category }: Partial<Category> & { id: string }) => {
      const { data, error } = await supabase
        .from("categories")
        .update(category)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Catégorie mise à jour" });
      handleCloseForm();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de modifier la catégorie",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Catégorie supprimée" });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer la catégorie (elle contient peut-être des produits)",
      });
      setDeleteId(null);
    },
  });

  const handleOpenForm = (category?: Category) => {
    if (category) {
      setSelectedCategory(category);
      setFormData({
        name: category.name,
        icon: category.icon || "Package",
        color: category.color || "#E57E4D",
        description: (category as any).description || "",
      });
    } else {
      setSelectedCategory(null);
      setFormData({ name: "", icon: "Package", color: "#E57E4D", description: "" });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCategory(null);
    setFormData({ name: "", icon: "Package", color: "#E57E4D", description: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (selectedCategory) {
      updateMutation.mutate({
        id: selectedCategory.id,
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        description: formData.description || null,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        description: formData.description || null,
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Filter and sort categories
  const filteredCategories = categories
    ?.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ((c as any).description || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    ?.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "products") {
        const aCount = (a as any).products?.[0]?.count || 0;
        const bCount = (b as any).products?.[0]?.count || 0;
        return bCount - aCount;
      }
      // Default: sort_order then name
      return (a.sort_order || 999) - (b.sort_order || 999) || a.name.localeCompare(b.name);
    });

  const totalProducts = categories?.reduce(
    (sum, c) => sum + ((c as any).products?.[0]?.count || 0),
    0
  ) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Catégories
            </h1>
            <p className="text-muted-foreground mt-1">
              Organisez vos produits par catégorie
              {categories && categories.length > 0 && (
                <span className="ml-2">
                  — {categories.length} catégorie{categories.length > 1 ? "s" : ""}, {totalProducts} produit{totalProducts > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouvelle catégorie
          </Button>
        </div>

        {/* Search & Sort Bar */}
        {categories && categories.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une catégorie..."
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortBy(sortBy === "name" ? "products" : sortBy === "products" ? "default" : "name")}
                className="text-xs"
              >
                {sortBy === "name" ? "Nom A-Z" : sortBy === "products" ? "Par produits" : "Par défaut"}
              </Button>
            </div>
          </div>
        )}

        {/* Categories Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredCategories && filteredCategories.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCategories.map((category) => {
              const productCount = (category as any).products?.[0]?.count || 0;
              const isDefault = (category as any).is_default;
              return (
                <Card key={category.id} className="card-elevated group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          <CategoryIcon iconName={category.icon} className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{category.name}</h3>
                            {isDefault && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                Défaut
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.color || "#E57E4D" }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {productCount} produit{productCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {(category as any).description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {(category as any).description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenForm(category)}
                          aria-label="Modifier la catégorie"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(category.id)}
                          className="text-destructive hover:text-destructive"
                          aria-label="Supprimer la catégorie"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : categories && categories.length > 0 && filteredCategories?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Aucun résultat</h3>
            <p className="text-muted-foreground mb-4">
              Aucune catégorie ne correspond à votre recherche
            </p>
            <Button onClick={() => setSearchQuery("")} variant="outline">
              Effacer la recherche
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 bg-card rounded-xl border">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Aucune catégorie</h3>
            <p className="text-muted-foreground mb-4">
              Créez des catégories pour organiser vos produits
            </p>
            <Button onClick={() => handleOpenForm()} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Créer une catégorie
            </Button>
          </div>
        )}

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {selectedCategory ? "Modifier la catégorie" : "Nouvelle catégorie"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Nom de la catégorie *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Alimentaire, Boissons..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez les produits de cette catégorie..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Icône</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_ICONS.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: iconName })}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                        formData.icon === iconName
                          ? "bg-primary/20 ring-2 ring-primary"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      <CategoryIcon iconName={iconName} className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Couleur</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full transition-all ${
                        formData.color === color ? "ring-2 ring-offset-2 ring-primary" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {/* Custom color picker */}
                  <div className="relative">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-8 h-8 rounded-full cursor-pointer border-2 border-dashed border-muted-foreground/30"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-sm text-muted-foreground mb-2">Aperçu</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${formData.color}20` }}
                  >
                    <CategoryIcon iconName={formData.icon} className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="font-medium block">
                      {formData.name || "Nom de la catégorie"}
                    </span>
                    {formData.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {formData.description}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: formData.color }}
                      />
                      <span className="text-xs text-muted-foreground">0 produits</span>
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : selectedCategory ? (
                  "Enregistrer les modifications"
                ) : (
                  "Créer la catégorie"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette catégorie ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Les produits associés ne seront pas supprimés
                mais n'auront plus de catégorie.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Categories;
