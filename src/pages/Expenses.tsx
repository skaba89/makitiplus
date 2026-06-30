 import { useState, useEffect, useMemo } from "react";
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthContext";
 import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
 import { ExpensesPageSkeleton } from "@/components/skeletons/PageSkeletons";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import {
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
 } from "@/components/ui/card";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
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
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Wallet, TrendingDown, Calendar, Loader2, Home, Zap, Droplets, Globe, Phone, ShoppingCart as CartIcon, Car, Users, Wrench, ClipboardList, Package } from "lucide-react";
import { format } from "date-fns";
import { formatDate } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";
import { useCurrency } from "@/hooks/useCurrency";
import { fetchAllRows } from "@/lib/batchedFetch";
 
 type Expense = Database["public"]["Tables"]["expenses"]["Row"];
 type PaymentMethod = Database["public"]["Enums"]["payment_method"];
 
 const EXPENSE_CATEGORIES = [
   { value: "loyer", label: "Loyer", icon: Home, color: "bg-blue-100 text-blue-800" },
   { value: "electricite", label: "Électricité", icon: Zap, color: "bg-yellow-100 text-yellow-800" },
   { value: "eau", label: "Eau", icon: Droplets, color: "bg-cyan-100 text-cyan-800" },
   { value: "internet", label: "Internet", icon: Globe, color: "bg-purple-100 text-purple-800" },
   { value: "telephone", label: "Téléphone", icon: Phone, color: "bg-indigo-100 text-indigo-800" },
   { value: "achats", label: "Achats/Stock", icon: CartIcon, color: "bg-green-100 text-green-800" },
   { value: "transport", label: "Transport", icon: Car, color: "bg-orange-100 text-orange-800" },
   { value: "salaires", label: "Salaires", icon: Users, color: "bg-pink-100 text-pink-800" },
   { value: "maintenance", label: "Maintenance", icon: Wrench, color: "bg-gray-100 text-gray-800" },
   { value: "taxes", label: "Taxes/Impôts", icon: ClipboardList, color: "bg-red-100 text-red-800" },
   { value: "autre", label: "Autre", icon: Package, color: "bg-slate-100 text-slate-800" },
 ];
 
 const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
   { value: "cash", label: "Espèces" },
   { value: "wave", label: "Wave" },
   { value: "orange_money", label: "Orange Money" },
   { value: "card", label: "Carte bancaire" },
 ];
 
const Expenses = () => {
  const { user, profile, userRole } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
 
   // Form state
   const [amount, setAmount] = useState("");
   const [category, setCategory] = useState("");
   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
   const [description, setDescription] = useState("");
   const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
 
   // Récupérer toutes les dépenses — fetchAllRows pour éviter la troncature silencieuse à 500 lignes
   const { data: expenses, isLoading } = useQuery({
     queryKey: ["expenses", user?.id],
     queryFn: () =>
       fetchAllRows<Expense>("expenses", "*", {
         orderBy: { column: "expense_date", ascending: false },
       }),
     enabled: !!user,
   });
 
   const canModify = userRole === 'admin' || userRole === 'manager' || userRole === 'super_admin' || userRole === 'comptable';

   const createExpenseMutation = useMutation({
     mutationFn: async () => {
       const numAmount = parseFloat(amount);
       if (isNaN(numAmount) || numAmount <= 0) {
         throw new Error("Montant invalide");
       }
       const insertData: Record<string, unknown> = {
         user_id: user!.id,
         amount: numAmount,
         category,
         payment_method: paymentMethod,
         description: description || null,
         expense_date: expenseDate,
       };
       if (profile?.organization_id) {
         insertData.organization_id = profile.organization_id;
       }
       const { error } = await supabase.from("expenses").insert(insertData);

       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["expenses"] });
       setIsDialogOpen(false);
       resetForm();
       toast({
         title: "Dépense enregistrée",
         description: "La dépense a été ajoutée avec succès",
       });
     },
     onError: (error: unknown) => {
       const msg = error instanceof Error ? error.message : "Impossible d'enregistrer la depense";
       toast({
         variant: "destructive",
         title: "Erreur",
         description: msg,
       });
       reportError(error instanceof Error ? error : new Error(msg));
     },
   });
 
   const updateExpenseMutation = useMutation({
     mutationFn: async () => {
       if (!editingExpense) return;
       const numAmount = parseFloat(amount);
       if (isNaN(numAmount) || numAmount <= 0) {
         throw new Error("Montant invalide");
       }
       const updateData: Record<string, unknown> = {
         amount: numAmount,
         category,
         payment_method: paymentMethod,
         description: description || null,
         expense_date: expenseDate,
       };
       const { error } = await supabase
         .from("expenses")
         .update(updateData)
         .eq("id", editingExpense.id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["expenses"] });
       setIsDialogOpen(false);
       setEditingExpense(null);
       resetForm();
       toast({
         title: "Dépense modifiée",
         description: "La dépense a été mise à jour avec succès",
       });
     },
     onError: (error: unknown) => {
       const msg = error instanceof Error ? error.message : "Impossible de modifier la depense";
       toast({
         variant: "destructive",
         title: "Erreur",
         description: msg,
       });
       reportError(error instanceof Error ? error : new Error(msg));
     },
   });

   const deleteExpenseMutation = useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase.from("expenses").delete().eq("id", id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["expenses"] });
       toast({
         title: "Dépense supprimée",
         description: "La dépense a été supprimée",
       });
     },
     onError: (error: unknown) => {
       const msg = error instanceof Error ? error.message : "Impossible de supprimer la depense";
       toast({
         variant: "destructive",
         title: "Erreur",
         description: msg,
       });
       reportError(error instanceof Error ? error : new Error(msg));
     },
   });
 
   const resetForm = () => {
     setAmount("");
     setCategory("");
     setPaymentMethod("cash");
     setDescription("");
     setExpenseDate(format(new Date(), "yyyy-MM-dd"));
   };
 
   const openEditDialog = (expense: Expense) => {
     setEditingExpense(expense);
     setAmount(String(expense.amount));
     setCategory(expense.category);
     setPaymentMethod(expense.payment_method || "cash");
     setDescription(expense.description || "");
     setExpenseDate(format(new Date(expense.expense_date), "yyyy-MM-dd"));
     setIsDialogOpen(true);
   };

   const openCreateDialog = () => {
     setEditingExpense(null);
     resetForm();
     setIsDialogOpen(true);
   };

   const handleDialogClose = (open: boolean) => {
     setIsDialogOpen(open);
     if (!open) {
       setEditingExpense(null);
       resetForm();
     }
   };

   const handleSubmit = (e: React.FormEvent) => {
     e.preventDefault();
     if (!amount || !category) return;
     if (editingExpense) {
       updateExpenseMutation.mutate();
     } else {
       createExpenseMutation.mutate();
     }
   };

  // formatPrice is now from useCurrency
 
   const getCategoryInfo = (categoryValue: string) => {
     return EXPENSE_CATEGORIES.find((c) => c.value === categoryValue) || {
       value: categoryValue,
       label: categoryValue,
       color: "bg-slate-100 text-slate-800",
     };
   };
 
   const filteredExpenses = useMemo(() => filterCategory === "all"
     ? expenses
     : expenses?.filter((e) => e.category === filterCategory), [expenses, filterCategory]);
 
  // Client-side pagination
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((filteredExpenses?.length || 0) / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedExpenses = filteredExpenses?.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );
  // Reset page when filters change
  useEffect(() => {
    const safePage = Math.min(currentPage, totalPages);
    if (currentPage !== safePage && safePage > 0) {
      setCurrentPage(safePage);
    }
  }, [currentPage, totalPages]);

   const totalExpenses = filteredExpenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
 
   const thisMonthExpenses = expenses?.filter((e) => {
     const d = new Date(e.expense_date);
     const now = new Date();
     return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
   }).reduce((sum, e) => sum + e.amount, 0) || 0;
 
   const isMutating = createExpenseMutation.isPending || updateExpenseMutation.isPending;

   return (
     <DashboardLayout>
       <div className="space-y-4 sm:space-y-6">
         {/* Header */}
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
           <div>
             <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Dépenses</h1>
             <p className="text-muted-foreground">
               Gérez les charges de votre boutique
             </p>
           </div>
 
           <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
             {canModify && (
               <DialogTrigger asChild>
                 <Button onClick={openCreateDialog}>
                   <Plus className="mr-2 h-4 w-4" />
                   Nouvelle dépense
                 </Button>
               </DialogTrigger>
             )}
             <DialogContent className="max-w-md" aria-describedby={undefined}>
               <DialogHeader>
                 <DialogTitle>
                   {editingExpense ? "Modifier la dépense" : "Ajouter une dépense"}
                 </DialogTitle>
               </DialogHeader>
 
               <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="space-y-2">
                   <Label>Montant *</Label>
                   <Input
                     type="number"
                     placeholder="0"
                     max="100000000"
                     value={amount}
                     onChange={(e) => setAmount(e.target.value)}
                     required
                   />
                 </div>
 
                 <div className="space-y-2">
                   <Label>Catégorie *</Label>
                   <Select value={category} onValueChange={setCategory} required>
                     <SelectTrigger>
                       <SelectValue placeholder="Sélectionner une catégorie" />
                     </SelectTrigger>
                     <SelectContent>
                       {EXPENSE_CATEGORIES.map((cat) => (
                         <SelectItem key={cat.value} value={cat.value}>
                           {cat.label}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
 
                 <div className="space-y-2">
                   <Label>Mode de paiement</Label>
                   <Select
                     value={paymentMethod}
                     onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                   >
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       {PAYMENT_METHODS.map((method) => (
                         <SelectItem key={method.value} value={method.value}>
                           {method.label}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
 
                 <div className="space-y-2">
                   <Label>Date</Label>
                   <Input
                     type="date"
                     value={expenseDate}
                     onChange={(e) => setExpenseDate(e.target.value)}
                   />
                 </div>
 
                 <div className="space-y-2">
                   <Label>Description (optionnel)</Label>
                   <Textarea
                     placeholder="Détails de la dépense..."
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                     rows={2}
                   />
                 </div>
 
                 <Button
                   type="submit"
                   className="w-full"
                   disabled={!amount || !category || isMutating}
                 >
                   {isMutating ? (
                     <>
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                       {editingExpense ? "Modification..." : "Enregistrement..."}
                     </>
                   ) : (
                     editingExpense ? "Modifier" : "Enregistrer"
                   )}
                 </Button>
               </form>
             </DialogContent>
           </Dialog>
         </div>
 
         {/* Stats Cards */}
         <div className="grid grid-cols-2 gap-3 sm:gap-4">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between pb-2">
               <CardTitle className="text-sm font-medium">
                 Dépenses du mois
               </CardTitle>
               <Calendar className="h-4 w-4 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <div className="text-lg sm:text-2xl font-bold text-destructive">
                 {formatPrice(thisMonthExpenses)}
               </div>
             </CardContent>
           </Card>
 
           <Card>
             <CardHeader className="flex flex-row items-center justify-between pb-2">
               <CardTitle className="text-sm font-medium">
                 Total affiché
               </CardTitle>
               <TrendingDown className="h-4 w-4 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <div className="text-lg sm:text-2xl font-bold">
                 {formatPrice(totalExpenses)}
               </div>
               <p className="text-xs text-muted-foreground">
                 {filteredExpenses?.length || 0} dépense(s)
               </p>
             </CardContent>
           </Card>
         </div>
 
         {/* Filter & List */}
         <Card>
           <CardHeader>
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
               <div>
                 <CardTitle>Historique des dépenses</CardTitle>
                 <CardDescription>
                   Toutes les charges enregistrées
                 </CardDescription>
               </div>
               <Select value={filterCategory} onValueChange={setFilterCategory}>
                 <SelectTrigger className="w-full sm:w-48">
                   <SelectValue placeholder="Filtrer par catégorie" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Toutes les catégories</SelectItem>
                   {EXPENSE_CATEGORIES.map((cat) => (
                     <SelectItem key={cat.value} value={cat.value}>
                       {cat.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </CardHeader>
           <CardContent>
             {isLoading ? (
               <ExpensesPageSkeleton />
             ) : filteredExpenses && filteredExpenses.length > 0 ? (
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Date</TableHead>
                       <TableHead>Catégorie</TableHead>
                       <TableHead className="hidden sm:table-cell">Description</TableHead>
                       <TableHead className="text-right">Montant</TableHead>
                       <TableHead></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {paginatedExpenses?.map((expense) => {
                       const catInfo = getCategoryInfo(expense.category);
                       return (
                         <TableRow key={expense.id}>
                           <TableCell className="whitespace-nowrap">
                             {formatDate(expense.expense_date)}
                           </TableCell>
                           <TableCell>
                             <Badge variant="secondary" className={catInfo.color}>
                               {catInfo.label}
                             </Badge>
                           </TableCell>
                           <TableCell className="hidden sm:table-cell max-w-xs truncate">
                             {expense.description || "-"}
                           </TableCell>
                           <TableCell className="text-right font-medium text-destructive">
                             -{formatPrice(expense.amount)}
                           </TableCell>
                           <TableCell>
                             {canModify && (
                               <div className="flex gap-1">
                                 <Button
                                   variant="ghost"
                                   size="icon"
                                   onClick={() => openEditDialog(expense)}
                                   disabled={isMutating}
                                   aria-label="Modifier la dépense"
                                 >
                                   <Pencil className="h-4 w-4 text-muted-foreground" />
                                 </Button>
                                 <Button
                                   variant="ghost"
                                   size="icon"
                                   onClick={() => setDeleteTarget(expense)}
                                   disabled={deleteExpenseMutation.isPending}
                                   aria-label="Supprimer la dépense"
                                 >
                                   <Trash2 className="h-4 w-4 text-destructive" />
                                 </Button>
                               </div>
                             )}
                           </TableCell>
                         </TableRow>
                       );
                     })}
                   </TableBody>
                 </Table>
               </div>
             ) : null}

             {/* Pagination */}
             {filteredExpenses && filteredExpenses.length > 0 && totalPages > 1 && (
               <div className="flex items-center justify-between pt-4 border-t">
                 <p className="text-sm text-muted-foreground">
                   {((safeCurrentPage - 1) * PAGE_SIZE) + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, filteredExpenses.length)} sur {filteredExpenses.length}
                 </p>
                 <div className="flex gap-2">
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                     disabled={safeCurrentPage <= 1}
                   >
                     Précédent
                   </Button>
                   <div className="flex items-center gap-1">
                     {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                       let page: number;
                       if (totalPages <= 5) {
                         page = i + 1;
                       } else if (safeCurrentPage <= 3) {
                         page = i + 1;
                       } else if (safeCurrentPage >= totalPages - 2) {
                         page = totalPages - 4 + i;
                       } else {
                         page = safeCurrentPage - 2 + i;
                       }
                       return (
                         <Button
                           key={page}
                           variant={page === safeCurrentPage ? "default" : "outline"}
                           size="sm"
                           className="w-8 h-8 p-0"
                           onClick={() => setCurrentPage(page)}
                         >
                           {page}
                         </Button>
                       );
                     })}
                   </div>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                     disabled={safeCurrentPage >= totalPages}
                   >
                     Suivant
                   </Button>
                 </div>
               </div>
             )}

             {!(filteredExpenses && filteredExpenses.length > 0) && !isLoading && (
               <div className="text-center py-12">
                 <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                 <p className="text-muted-foreground">Aucune dépense enregistrée</p>
                 <Button
                   variant="outline"
                   className="mt-4"
                   onClick={openCreateDialog}
                 >
                   <Plus className="mr-2 h-4 w-4" />
                   Ajouter une dépense
                 </Button>
               </div>
             )}
           </CardContent>
         </Card>
 
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette dépense?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) {
                    deleteExpenseMutation.mutate(deleteTarget.id);
                    setDeleteTarget(null);
                  }
                }}
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
 
 export default Expenses;
