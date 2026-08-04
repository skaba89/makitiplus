import React, { useState, useMemo, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useCategories } from "@/hooks/useCategories";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DEFAULT_CATEGORY_COLOR, PRESET_COLORS } from "@/constants/colors";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { Plus, FolderOpen, Pencil, Trash2, Loader2, Search, ArrowUpDown, Tag } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { MANAGEMENT_ROLES } from "@/types";

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

const PRESET_ICONS = [
  "Package", "Wheat", "CupSoda", "Sparkles", "Brush", "Wrench", "Smartphone", "Shirt", "Croissant", "Leaf", "Drumstick", "Snowflake",
  "Milk", "Fish", "Candy", "Coffee", "Pill", "Baby", "PawPrint", "BookOpen", "Sofa", "Car", "Cigarette", "Wine",
  "Beer", "Gem", "Footprints", "Home", "Lightbulb", "SprayCan", "ToyBrick", "Dumbbell", "Flame", "Droplet", "Utensils", "ShoppingBasket",
  "Tv", "Refrigerator", "WashingMachine", "Headphones", "Camera", "Laptop", "Router", "Battery", "Plug",
  "Apple", "Banana", "Carrot", "Egg", "Cookie", "Popcorn", "IceCreamCone", "Pizza", "Sandwich", "Grape",
  "Lamp", "Armchair", "Bed", "Bath", "Umbrella", "Key",
  "Pen", "Pencil", "Ruler", "Calculator", "Backpack",
  "Scissors", "Palette", "Stethoscope", "Bandage", "Syringe", "Thermometer",
  "Gamepad2", "Bike", "Trophy",
  "Watch", "Glasses", "Crown",
  "Wallet", "CreditCard", "Banknote", "Coins", "PhoneCall", "Wifi",
  "Zap", "Hammer", "HardHat", "Briefcase", "Luggage",
  "ChefHat", "CookingPot", "UtensilsCrossed",
];

const Categories = () => {
  const { t } = useTranslation("categories");
  const { user, userRole } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const { toast } = useToast();
  const { blockMutation } = useDemo();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = useDeferredValue(searchInput);
  const [sortBy, setSortBy] = useState<"name" | "products" | "default">("default");

  const [formData, setFormData] = useState({
    name: "",
    icon: "Package",
    color: DEFAULT_CATEGORY_COLOR,
    description: "",
  });

  // Track whether sort_order column exists (derived from data)
  const [hasSortOrder, setHasSortOrder] = useState(true);

  const { data: categories, isLoading } = useCategories();

  // Derive hasSortOrder from the data returned by useCategories (which uses get_categories RPC)
  // The RPC returns sort_order, so if data exists we know the column is present
  React.useEffect(() => {
    if (categories && categories.length > 0) {
      setHasSortOrder(categories.some(c => c.sort_order !== undefined));
    }
  }, [categories]);

  const canModify = userRole !== null && MANAGEMENT_ROLES.includes(userRole);

  const createMutation = useMutation({
    mutationFn: async (category: Omit<CategoryInsert, "user_id">) => {
      const insertData: Record<string, unknown> = {
        ...category,
        user_id: user?.id ?? "",
      };

      // Explicitly set organization_id from profile to avoid relying solely on trigger
      if (effectiveOrgId) {
        insertData.organization_id = effectiveOrgId;
      }

      // Only include sort_order if the column exists in the database
      if (hasSortOrder) {
        // Use RPC for atomic sort_order — avoids TOCTOU race condition
        // where two concurrent category creates could get the same sort_order.
        try {
          const { data: nextOrder } = await supabase.rpc("get_next_category_sort_order");
          insertData.sort_order = nextOrder || 1;
        } catch {
          // RPC or sort_order column may not exist — skip it
          delete insertData.sort_order;
        }
      } else {
        // Column doesn't exist — remove it from insert data
        delete insertData.sort_order;
        delete insertData.description;
        delete insertData.is_default;
      }

      const { data, error } = await supabase
        .from("categories")
        .insert(insertData as CategoryInsert)
        .select()
        .single();

      if (error) return [];
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: t("toasts.createSuccess") });
      handleCloseForm();
    },
    onError: (error) => {
      reportError(error);
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates');
      toast({
        variant: "destructive",
        title: t("toasts.genericErrorTitle"),
        description: isRlsError
          ? t("toasts.createRlsDescription")
          : t("toasts.createErrorDescription"),
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

      if (error) return [];
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: t("toasts.updateSuccess") });
      handleCloseForm();
    },
    onError: (error) => {
      reportError(error);
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates');
      toast({
        variant: "destructive",
        title: t("toasts.genericErrorTitle"),
        description: isRlsError
          ? t("toasts.updateRlsDescription")
          : t("toasts.updateErrorDescription"),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: t("toasts.deleteSuccess") });
      setDeleteId(null);
    },
    onError: (error) => {
      reportError(error);
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates');
      toast({
        variant: "destructive",
        title: t("toasts.genericErrorTitle"),
        description: isRlsError
          ? t("toasts.deleteRlsDescription")
          : t("toasts.deleteErrorDescription"),
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
        color: category.color || DEFAULT_CATEGORY_COLOR,
        description: category.description || "",
      });
    } else {
      setSelectedCategory(null);
      setFormData({ name: "", icon: "Package", color: DEFAULT_CATEGORY_COLOR, description: "" });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCategory(null);
    setFormData({ name: "", icon: "Package", color: DEFAULT_CATEGORY_COLOR, description: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (selectedCategory) {
      if (blockMutation('Modifier une cat\u00e9gorie')) return;
      updateMutation.mutate({
        id: selectedCategory.id,
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        description: formData.description || null,
      });
    } else {
      if (blockMutation('Cr\u00e9er une cat\u00e9gorie')) return;
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
  const filteredCategories = useMemo(() => categories
    ?.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    ?.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "products") {
        const aCount = a.products?.[0]?.count || 0;
        const bCount = b.products?.[0]?.count || 0;
        return bCount - aCount;
      }
      // Default: sort_order then name
      return (a.sort_order || 999) - (b.sort_order || 999) || a.name.localeCompare(b.name);
    }), [categories, searchQuery, sortBy]);

  const totalProducts = categories?.reduce(
    (sum, c) => sum + (c.products?.[0]?.count || 0),
    0
  ) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              {t("title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("subtitle")}
              {categories && categories.length > 0 && (
                <span className="ml-2">
                  — {t("categoryCount", { count: categories.length })}, {t("card.productCount", { count: totalProducts })}
                </span>
              )}
            </p>
          </div>
          {canModify && (
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("newCategory")}
            </Button>
          )}
        </div>

        {/* Search & Sort Bar */}
        {categories && categories.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("search.placeholder")}
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
                {sortBy === "name" ? t("sort.byName") : sortBy === "products" ? t("sort.byProducts") : t("sort.byDefault")}
              </Button>
            </div>
          </div>
        )}

        {/* Categories Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-5 w-28" />
                </div>
                <Skeleton className="h-3 w-16" />
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCategories && filteredCategories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {filteredCategories.map((category) => {
              const productCount = category.products?.[0]?.count || 0;
              const isDefault = category.is_default;
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
                              <Badge variant="secondary" className="text-micro px-1.5 py-0 shrink-0">
                                {t("card.defaultBadge")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.color || DEFAULT_CATEGORY_COLOR }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {t("card.productCount", { count: productCount })}
                            </span>
                          </div>
                          {category.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {category.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {canModify && (
                        <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenForm(category)}
                            aria-label={t("card.editAria")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(category.id)}
                            className="text-destructive hover:text-destructive"
                            aria-label={t("card.deleteAria")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : categories && categories.length > 0 && filteredCategories?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">{t("noResults.title")}</h3>
            <p className="text-muted-foreground mb-4">
              {t("noResults.description")}
            </p>
            <Button onClick={() => setSearchInput("")} variant="outline">
              {t("noResults.clearSearch")}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 bg-card rounded-xl border">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">{t("empty.title")}</h3>
            <p className="text-muted-foreground mb-4">
              {t("empty.description")}
            </p>
            {canModify && (
              <Button onClick={() => handleOpenForm()} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                {t("empty.createFirst")}
              </Button>
            )}
          </div>
        )}

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {selectedCategory ? t("formDialog.editTitle") : t("formDialog.newTitle")}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">{t("formDialog.nameLabel")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("formDialog.namePlaceholder")}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("formDialog.descriptionLabel")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("formDialog.descriptionPlaceholder")}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("formDialog.iconLabel")}</Label>
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
                <Label>{t("formDialog.colorLabel")}</Label>
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
                <p className="text-sm text-muted-foreground mb-2">{t("formDialog.previewLabel")}</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${formData.color}20` }}
                  >
                    <CategoryIcon iconName={formData.icon} className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="font-medium block">
                      {formData.name || t("formDialog.previewDefaultName")}
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
                      <span className="text-xs text-muted-foreground">{t("formDialog.previewProductCount")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("formDialog.submitSaving")}
                  </>
                ) : selectedCategory ? (
                  t("formDialog.submitUpdate")
                ) : (
                  t("formDialog.submitCreate")
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteDialog.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteId) {
                    if (blockMutation('Supprimer une cat\u00e9gorie')) return;
                    deleteMutation.mutate(deleteId);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("deleteDialog.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Categories;
