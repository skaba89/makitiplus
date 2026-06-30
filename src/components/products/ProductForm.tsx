import { useState, useEffect } from "react";
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
import { Loader2, Barcode } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { BarcodeGenerator, generateBarcode } from "./BarcodeGenerator";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

interface ProductFormProps {
  product: Product | null;
  onSubmit: (data: Omit<ProductInsert, "user_id">) => void;
  isLoading: boolean;
}

export const ProductForm = ({ product, onSubmit, isLoading }: ProductFormProps) => {
  const { user } = useAuth();
  const { currency } = useCurrency();
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
    }
  }, [product]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      price: formData.price,
      cost_price: formData.cost_price || null,
      stock_quantity: formData.stock_quantity,
      min_stock_alert: formData.min_stock_alert,
      category_id: formData.category_id || null,
      barcode: formData.barcode || null,
      unit: formData.unit,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          <Label htmlFor="price">Prix de vente ({currency.symbol}) *</Label>
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
          <Label htmlFor="cost_price">Prix d'achat ({currency.symbol})</Label>
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
                  {category.icon} {category.name}
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

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
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
