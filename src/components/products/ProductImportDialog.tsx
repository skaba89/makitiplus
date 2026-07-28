import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useQueryClient } from "@tanstack/react-query";
import { reportError } from "@/lib/sentry";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  parseAndValidateProductImport,
  buildImportTemplateCSV,
  type ImportRowResult,
} from "@/utils/productImport";

interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingProducts: { name: string; barcode: string | null }[];
  existingCategories: { id: string; name: string }[];
}

type Step = "upload" | "preview" | "importing" | "result";

interface ImportOutcome {
  createdIds: string[];
  failed: { row: ImportRowResult; error: string }[];
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob(["﻿" + content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ProductImportDialog = ({
  open,
  onOpenChange,
  existingProducts,
  existingCategories,
}: ProductImportDialogProps) => {
  const { toast } = useToast();
  const { effectiveOrgId } = useOrgSelector();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportRowResult[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setStep("upload");
    setRows([]);
    setMissingColumns([]);
    setOutcome(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleDownloadTemplate = () => {
    downloadTextFile("makitiplus-modele-import-produits.csv", buildImportTemplateCSV(), "text/csv");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { rows: parsedRows, missingRequiredColumns } = parseAndValidateProductImport(text, {
        existingProducts,
        existingCategoryNames: existingCategories.map((c) => c.name),
      });

      if (missingRequiredColumns.length > 0) {
        setMissingColumns(missingRequiredColumns);
        setRows([]);
        setStep("preview");
        return;
      }

      if (parsedRows.length === 0) {
        toast({ variant: "destructive", title: "Fichier vide", description: "Aucune ligne de produit trouvée." });
        return;
      }

      setMissingColumns([]);
      setRows(parsedRows);
      setStep("preview");
    } catch (err) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de lire le fichier CSV." });
      reportError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const validRows = rows.filter((r) => r.valid);

  const handleConfirmImport = async () => {
    if (validRows.length === 0) return;
    setStep("importing");
    setProgress(0);

    // Créer les catégories manquantes référencées (une seule fois par nom)
    const categoryIdByNameLower = new Map<string, string>(
      existingCategories.map((c) => [c.name.toLowerCase(), c.id])
    );

    if (createMissingCategories) {
      const missingNames = new Set(
        validRows
          .map((r) => r.categoryName)
          .filter((n): n is string => !!n && !categoryIdByNameLower.has(n.toLowerCase()))
      );
      for (const name of missingNames) {
        const insertData: TablesInsert<"categories"> = {
          name,
          user_id: (await supabase.auth.getUser()).data.user?.id ?? "",
          ...(effectiveOrgId ? { organization_id: effectiveOrgId } : {}),
        };
        const { data, error } = await supabase.from("categories").insert(insertData).select().single();
        if (!error && data) {
          categoryIdByNameLower.set(name.toLowerCase(), (data as { id: string }).id);
        }
      }
    }

    const createdIds: string[] = [];
    const failed: { row: ImportRowResult; error: string }[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const categoryId = row.categoryName ? categoryIdByNameLower.get(row.categoryName.toLowerCase()) : undefined;

      try {
        const { data: productId, error } = await supabase.rpc("create_product", {
          p_name: row.name,
          p_price: row.price ?? 0,
          p_stock_quantity: row.stock ?? 0,
          p_min_stock_alert: row.minStockAlert ?? 5,
          p_cost_price: row.costPrice ?? undefined,
          p_category_id: categoryId,
          p_barcode: row.barcode ?? undefined,
          p_unit: row.unit,
          p_supplier_id: undefined,
          p_store_id: undefined,
          p_description: row.description ?? undefined,
          p_image_url: undefined,
          p_is_active: true,
        });
        if (error) {
          failed.push({ row, error: error.message });
        } else if (productId) {
          createdIds.push(productId as string);
        }
      } catch (err) {
        failed.push({ row, error: err instanceof Error ? err.message : String(err) });
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-stats"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });

    setOutcome({ createdIds, failed });
    setStep("result");
  };

  const handleRollback = async () => {
    if (!outcome || outcome.createdIds.length === 0) return;
    const { error } = await supabase.from("products").delete().in("id", outcome.createdIds);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-stats"] });
    if (error) {
      toast({ variant: "destructive", title: "Erreur", description: "Annulation partielle — vérifiez la liste des produits." });
      reportError(new Error(error.message));
    } else {
      toast({ title: "Import annulé", description: `${outcome.createdIds.length} produit(s) supprimé(s).` });
      setOutcome({ createdIds: [], failed: outcome.failed });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importer des produits (CSV)</DialogTitle>
          <DialogDescription>
            Ajoutez plusieurs produits d'un coup depuis un fichier CSV (exportable depuis Excel).
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <Button variant="outline" onClick={handleDownloadTemplate} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Télécharger le modèle CSV
            </Button>
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-missing-categories"
                checked={createMissingCategories}
                onCheckedChange={(c) => setCreateMissingCategories(c === true)}
              />
              <label htmlFor="create-missing-categories" className="text-sm">
                Créer automatiquement les catégories inconnues
              </label>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="hidden"
              id="product-import-file"
            />
            <Button onClick={() => fileInputRef.current?.click()} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Choisir un fichier CSV
            </Button>
          </div>
        )}

        {step === "preview" && missingColumns.length > 0 && (
          <div className="py-6 text-center space-y-2">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="font-medium">Colonnes obligatoires manquantes</p>
            <p className="text-sm text-muted-foreground">{missingColumns.join(", ")}</p>
            <Button variant="outline" onClick={reset}>Réessayer</Button>
          </div>
        )}

        {step === "preview" && missingColumns.length === 0 && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="border-primary/50">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {validRows.length} valide(s)
              </Badge>
              {rows.length - validRows.length > 0 && (
                <Badge variant="outline" className="border-destructive/50 text-destructive">
                  <XCircle className="h-3 w-3 mr-1" /> {rows.length - validRows.length} erreur(s)
                </Badge>
              )}
            </div>
            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.line} className={!row.valid ? "bg-destructive/5" : undefined}>
                      <TableCell>{row.line}</TableCell>
                      <TableCell>{row.name || "—"}</TableCell>
                      <TableCell>{row.price ?? "—"}</TableCell>
                      <TableCell>{row.stock ?? "—"}</TableCell>
                      <TableCell>
                        {row.valid ? (
                          row.warnings.length > 0 ? (
                            <span className="text-amber-600 text-xs flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> {row.warnings.join("; ")}
                            </span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )
                        ) : (
                          <span className="text-destructive text-xs flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> {row.errors.join("; ")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === "importing" && (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Import en cours… {progress}%</p>
          </div>
        )}

        {step === "result" && outcome && (
          <div className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <p>{outcome.createdIds.length} produit(s) créé(s)</p>
            </div>
            {outcome.failed.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle className="h-4 w-4" /> {outcome.failed.length} échec(s)
                </p>
                <ScrollArea className="max-h-32 border rounded-md p-2">
                  {outcome.failed.map((f) => (
                    <p key={f.row.line} className="text-xs text-muted-foreground">
                      Ligne {f.row.line} ({f.row.name}) : {f.error}
                    </p>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "preview" && missingColumns.length === 0 && (
            <>
              <Button variant="outline" onClick={reset}>Annuler</Button>
              <Button onClick={handleConfirmImport} disabled={validRows.length === 0}>
                Importer {validRows.length} produit(s)
              </Button>
            </>
          )}
          {step === "result" && (
            <>
              {outcome && outcome.createdIds.length > 0 && (
                <Button variant="destructive" onClick={handleRollback}>
                  Annuler cet import
                </Button>
              )}
              <Button onClick={() => handleClose(false)}>Fermer</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
