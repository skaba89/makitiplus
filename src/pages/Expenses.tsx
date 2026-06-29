 import { useState } from "react";
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthContext";
 import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
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
import { Plus, Trash2, Wallet, TrendingDown, Calendar, Loader2, Home, Zap, Droplets, Globe, Phone, ShoppingCart as CartIcon, Car, Users, Wrench, ClipboardList, Package } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Database } from "@/integrations/supabase/types";
import { useCurrency } from "@/hooks/useCurrency";
 
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
   { value: "salaires", label: "Salaires", icon: UsersIcon, color: "bg-pink-100 text-pink-800" },
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
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
 
   // Form state
   const [amount, setAmount] = useState("");
   const [category, setCategory] = useState("");
   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
   const [description, setDescription] = useState("");
   const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
 
   const { data: expenses, isLoading } = useQuery({
     queryKey: ["expenses", user?.id],
     queryFn: async () => {
         const { data, error } = await supabase
         .from("expenses")
         .select("*")
         .order("expense_date", { ascending: false });
 
       if (error) throw error;
       return data as Expense[];
     },
     enabled: !!user,
   });
 
   const createExpenseMutation = useMutation({
     mutationFn: async () => {
       const { error } = await supabase.from("expenses").insert({
         user_id: user!.id,
         amount: parseFloat(amount),
         category,
         payment_method: paymentMethod,
         description: description || null,
         expense_date: expenseDate,
       });
 
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
     onError: () => {
       toast({
         variant: "destructive",
         title: "Erreur",
         description: "Impossible d'enregistrer la dépense",
       });
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
     onError: () => {
       toast({
         variant: "destructive",
         title: "Erreur",
         description: "Impossible de supprimer la dépense",
       });
     },
   });
 
   const resetForm = () => {
     setAmount("");
     setCategory("");
     setPaymentMethod("cash");
     setDescription("");
     setExpenseDate(format(new Date(), "yyyy-MM-dd"));
   };
 
   const handleSubmit = (e: React.FormEvent) => {
     e.preventDefault();
     if (!amount || !category) return;
     createExpenseMutation.mutate();
   };
 
  // formatPrice is now from useCurrency
 
   const getCategoryInfo = (categoryValue: string) => {
     return EXPENSE_CATEGORIES.find((c) => c.value === categoryValue) || {
       value: categoryValue,
       label: categoryValue,
       color: "bg-slate-100 text-slate-800",
     };
   };
 
   const filteredExpenses = filterCategory === "all"
     ? expenses
     : expenses?.filter((e) => e.category === filterCategory);
 
   const totalExpenses = filteredExpenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
 
   const thisMonthExpenses = expenses?.filter((e) => {
     const expenseMonth = new Date(e.expense_date).getMonth();
     const currentMonth = new Date().getMonth();
     return expenseMonth === currentMonth;
   }).reduce((sum, e) => sum + e.amount, 0) || 0;
 
   return (
     <DashboardLayout>
       <div className="space-y-6">
         {/* Header */}
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
           <div>
             <h1 className="text-2xl font-bold">Dépenses</h1>
             <p className="text-muted-foreground">
               Gérez les charges de votre boutique
             </p>
           </div>
 
           <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
             <DialogTrigger asChild>
               <Button>
                 <Plus className="mr-2 h-4 w-4" />
                 Nouvelle dépense
               </Button>
             </DialogTrigger>
             <DialogContent className="max-w-md" aria-describedby={undefined}>
               <DialogHeader>
                 <DialogTitle>Ajouter une dépense</DialogTitle>
               </DialogHeader>
 
               <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="space-y-2">
                   <Label>Montant *</Label>
                   <Input
                     type="number"
                     placeholder="0"
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
                   disabled={!amount || !category || createExpenseMutation.isPending}
                 >
                   {createExpenseMutation.isPending ? (
                     <>
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                       Enregistrement...
                     </>
                   ) : (
                     "Enregistrer"
                   )}
                 </Button>
               </form>
             </DialogContent>
           </Dialog>
         </div>
 
         {/* Stats Cards */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <Card>
             <CardHeader className="flex flex-row items-center justify-between pb-2">
               <CardTitle className="text-sm font-medium">
                 Dépenses du mois
               </CardTitle>
               <Calendar className="h-4 w-4 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold text-destructive">
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
               <div className="text-2xl font-bold">
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
                 <SelectTrigger className="w-48">
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
               <div className="flex justify-center py-8">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
               </div>
             ) : filteredExpenses && filteredExpenses.length > 0 ? (
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Date</TableHead>
                       <TableHead>Catégorie</TableHead>
                       <TableHead>Description</TableHead>
                       <TableHead className="text-right">Montant</TableHead>
                       <TableHead></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {filteredExpenses.map((expense) => {
                       const catInfo = getCategoryInfo(expense.category);
                       return (
                         <TableRow key={expense.id}>
                           <TableCell className="whitespace-nowrap">
                             {format(new Date(expense.expense_date), "dd MMM yyyy", {
                               locale: fr,
                             })}
                           </TableCell>
                           <TableCell>
                             <Badge variant="secondary" className={catInfo.color}>
                               {catInfo.label}
                             </Badge>
                           </TableCell>
                           <TableCell className="max-w-xs truncate">
                             {expense.description || "-"}
                           </TableCell>
                           <TableCell className="text-right font-medium text-destructive">
                             -{formatPrice(expense.amount)}
                           </TableCell>
                           <TableCell>
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => deleteExpenseMutation.mutate(expense.id)}
                               disabled={deleteExpenseMutation.isPending}
                               aria-label="Supprimer la dépense"
                             >
                               <Trash2 className="h-4 w-4 text-destructive" />
                             </Button>
                           </TableCell>
                         </TableRow>
                       );
                     })}
                   </TableBody>
                 </Table>
               </div>
             ) : (
               <div className="text-center py-12">
                 <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                 <p className="text-muted-foreground">Aucune dépense enregistrée</p>
                 <Button
                   variant="outline"
                   className="mt-4"
                   onClick={() => setIsDialogOpen(true)}
                 >
                   <Plus className="mr-2 h-4 w-4" />
                   Ajouter une dépense
                 </Button>
               </div>
             )}
           </CardContent>
         </Card>
       </div>
     </DashboardLayout>
   );
 };
 
 export default Expenses;