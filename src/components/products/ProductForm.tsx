import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Barcode, ImagePlus, X } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { BarcodeGenerator, generateBarcode } from "./BarcodeGenerator";
import { useCurrency } from "@/hooks/useCurrency";
import { CategoryIcon } from "@/components/ui/category-icon";
import { useToast } from "@/hooks/use-toast";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

interface ProductFormProps {
  product: Product | null;
  onSubmit: (data: Omit<ProductInsert, "user_id">) => void;
  isLoading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Image upload helper                                                */
/* ------------------------------------------------------------------ */

async function uploadProductImage(
  file: File,
  userId: string,
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${timestamp}-${random}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path);

  return `${publicUrl}?t=${timestamp}`;
}

async function removeProductImage(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    // Path after the bucket name: /storage/v1/object/public/product-images/<path>
    const pathMatch = url.pathname.match(/\/product-images\/(.+)/);
    if (pathMatch) {
      const filePath = pathMatch[1].split("?")[0]; // strip query params
      await supabase.storage.from("product-images").remove([filePath]);
    }
  } catch {
    // ignore — old image cleanup is best-effort
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const ProductForm = ({ product, onSubmit, isLoading }: ProductFormProps) => {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    cost_price: 0,
    stock_quantity: 0,
    min_stock_alert: 5,
    category_id: "",
    barcode: "",
    unit: "unité",
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*");

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Populate form when editing
  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        price: product.price,
        cost_price: product.cost_price || 0,
        stock_quantity: product.stock_quantity,
        min_stock_alert: product.min_stock_alert || 5,
        category_id: product.category_id || "",
        barcode: product.barcode || "",
        unit: product.unit || "unité",
      });
      setImageUrl(product.image_url || null);
      setImagePreview(product.image_url || null);
      setImageFile(null);
    } else {
      setFormData({
        name: "",
        price: 0,
        cost_price: 0,
        stock_quantity: 0,
        min_stock_alert: 5,
        category_id: "",
        barcode: "",
        unit: "unité",
      });
      setImageUrl(null);
      setImagePreview(null);
      setImageFile(null);
    }
  }, [product]);

  /* ── Image handling ── */

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate type
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Fichier invalide",
          description: "Veuillez sélectionner une image (PNG, JPG, WebP, GIF).",
        });
        return;
      }

      // Validate size (5 MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Fichier trop volumineux",
          description: "L'image ne doit pas dépasser 5 Mo.",
        });
        return;
      }

      setImageFile(file);

      // Create local preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );

  const handleRemoveImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  /* ── Submit ── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalImageUrl = imageUrl;

    // Upload new image if selected
    if (imageFile && user) {
      setIsUploadingImage(true);
      try {
        // If editing and there's an old image, try to remove it
        if (product?.image_url) {
          await removeProductImage(product.image_url);
        }
        finalImageUrl = await uploadProductImage(imageFile, user.id);
      } catch (err) {
        console.error("Image upload failed:", err);
        toast({
          variant: "destructive",
          title: "Erreur d'upload",
          description: "Impossible de télécharger l'image. Le produit sera enregistré sans image.",
        });
        // Continue without image
      } finally {
        setIsUploadingImage(false);
      }
    } else if (!imagePreview && product?.image_url) {
      // User removed existing image
      await removeProductImage(product.image_url);
      finalImageUrl = null;
    }

    onSubmit({
      name: formData.name,
      price: formData.price,
      cost_price: formData.cost_price || null,
      stock_quantity: formData.stock_quantity,
      min_stock_alert: formData.min_stock_alert,
      category_id: formData.category_id || null,
      barcode: formData.barcode || null,
      unit: formData.unit,
      image_url: finalImageUrl || null,
    });
  };

  const isSubmitting = isLoading || isUploadingImage;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ── Product Image ── */}
      <div className="space-y-2">
        <Label>Image du produit</Label>
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div className="relative w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50 flex-shrink-0">
            {imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="Aperçu"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 transition-colors"
                  aria-label="Supprimer l'image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <ImagePlus className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>

          {/* Upload button */}
          <div className="flex flex-col gap-2 flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleImageSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              {imagePreview ? "Changer l'image" : "Ajouter une image"}
            </Button>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WebP ou GIF. 5 Mo max.
            </p>
          </div>
        </div>
      </div>

      {/* ── Product Name ── */}
      <div className="space-y-2">
        <Label htmlFor="name">Nom du produit *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Ex: Riz parfumé 5kg"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Prix de vente ({currency.displaySymbol || currency.symbol}) *</Label>
          <Input
            id="price"
            type="number"
            min="0"
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost_price">Prix d'achat ({currency.displaySymbol || currency.symbol})</Label>
          <Input
            id="cost_price"
            type="number"
            min="0"
            value={formData.cost_price}
            onChange={(e) =>
              setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stock_quantity">Quantité en stock *</Label>
          <Input
            id="stock_quantity"
            type="number"
            min="0"
            value={formData.stock_quantity}
            onChange={(e) =>
              setFormData({
                ...formData,
                stock_quantity: parseInt(e.target.value) || 0,
              })
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="min_stock_alert">Seuil d'alerte</Label>
          <Input
            id="min_stock_alert"
            type="number"
            min="0"
            value={formData.min_stock_alert}
            onChange={(e) =>
              setFormData({
                ...formData,
                min_stock_alert: parseInt(e.target.value) || 0,
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Catégorie</Label>
          <Select
            value={formData.category_id}
            onValueChange={(value) =>
              setFormData({ ...formData, category_id: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  <span className="flex items-center gap-2">
                    <CategoryIcon iconName={category.icon} className="h-4 w-4" />
                    {category.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Unité</Label>
          <Select
            value={formData.unit}
            onValueChange={(value) => setFormData({ ...formData, unit: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unité">Unité</SelectItem>
              <SelectItem value="kg">Kilogramme (kg)</SelectItem>
              <SelectItem value="g">Gramme (g)</SelectItem>
              <SelectItem value="L">Litre (L)</SelectItem>
              <SelectItem value="mL">Millilitre (mL)</SelectItem>
              <SelectItem value="m">Mètre (m)</SelectItem>
              <SelectItem value="pièce">Pièce</SelectItem>
              <SelectItem value="carton">Carton</SelectItem>
              <SelectItem value="sac">Sac</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="barcode">Code-barres</Label>
        <div className="flex gap-2">
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
            placeholder="Ex: 1234567890123"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setFormData({ ...formData, barcode: generateBarcode() })}
          >
            <Barcode className="h-4 w-4 mr-1" />
            Générer
          </Button>
        </div>
        {formData.barcode && (
          <div className="flex justify-center p-3 bg-white rounded-lg border">
            <BarcodeGenerator value={formData.barcode} />
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isUploadingImage ? "Upload de l'image..." : "Enregistrement..."}
          </>
        ) : product ? (
          "Enregistrer les modifications"
        ) : (
          "Créer le produit"
        )}
      </Button>
    </form>
  );
};
