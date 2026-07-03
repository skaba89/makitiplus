/**
 * Support Page — Integrated customer support & ticketing
 *
 * Features:
 * - Create support tickets (bug, technical, billing, feature request)
 * - Chat-like messaging interface for each ticket
 * - Status & priority filtering
 * - Real-time updates via Supabase realtime
 * - Stats dashboard (open, in-progress, resolved, avg resolution time)
 * - Available to all roles
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LifeBuoy,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Send,
  ArrowLeft,
  Bug,
  CreditCard,
  Wrench,
  Lightbulb,
  HelpCircle,
  User,
  Headphones,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { TicketStatus, TicketPriority, TicketCategory } from "@/types";

// ─── Types ──────────────────────────────────────────────────

interface SupportTicketRow {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  organization_id: string;
  created_by: string;
  created_by_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  resolved_at: string | null;
  message_count: number;
  has_unread_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface TicketMessageRow {
  id: string;
  ticket_id: string;
  sender_type: "user" | "admin" | "system";
  sender_name: string | null;
  message: string;
  attachments: string[] | null;
  is_read: boolean;
  created_at: string;
}

interface SupportStatsRow {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number;
}

// ─── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd MMM yyyy à HH:mm", { locale: fr });
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return format(date, "dd MMM", { locale: fr });
}

function statusBadge(status: TicketStatus) {
  const config: Record<TicketStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof AlertCircle }> = {
    open: { label: "Ouvert", variant: "default", icon: AlertCircle },
    in_progress: { label: "En cours", variant: "secondary", icon: Clock },
    waiting: { label: "En attente", variant: "outline", icon: Clock },
    resolved: { label: "Résolu", variant: "outline", icon: CheckCircle2 },
    closed: { label: "Fermé", variant: "outline", icon: CheckCircle2 },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function priorityBadge(priority: TicketPriority) {
  const colors: Record<TicketPriority, string> = {
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  };
  const labels: Record<TicketPriority, string> = {
    low: "Basse",
    medium: "Moyenne",
    high: "Haute",
    urgent: "Urgente",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[priority]}`}>
      {labels[priority]}
    </span>
  );
}

function categoryIcon(category: TicketCategory) {
  const icons: Record<TicketCategory, typeof Bug> = {
    technical: Wrench,
    billing: CreditCard,
    feature_request: Lightbulb,
    bug: Bug,
    other: HelpCircle,
  };
  return icons[category];
}

function categoryLabel(category: TicketCategory): string {
  const labels: Record<TicketCategory, string> = {
    technical: "Technique",
    billing: "Facturation",
    feature_request: "Demande de fonctionnalité",
    bug: "Bug",
    other: "Autre",
  };
  return labels[category];
}

// ─── Component ──────────────────────────────────────────────

const Support = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<TicketCategory>("other");
  const [newPriority, setNewPriority] = useState<TicketPriority>("medium");
  const [newMessage, setNewMessage] = useState("");

  // ─── Queries ─────────────────────────────────────────────

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ["support-tickets", statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_support_tickets", {
        p_status: statusFilter === "all" ? null : statusFilter,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return (data || []) as SupportTicketRow[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["support-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_support_stats");
      if (error) throw error;
      return data?.[0] as SupportStatsRow | undefined;
    },
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["ticket-messages", selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return [];
      const { data, error } = await supabase.rpc("get_ticket_messages", {
        p_ticket_id: selectedTicketId,
      });
      if (error) throw error;
      return (data || []) as TicketMessageRow[];
    },
    enabled: !!selectedTicketId,
  });

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  // ─── Realtime subscription for messages ──────────────────

  useEffect(() => {
    if (!selectedTicketId) return;

    const channel = supabase
      .channel(`ticket-${selectedTicketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_ticket_messages",
          filter: `ticket_id=eq.${selectedTicketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ticket-messages", selectedTicketId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicketId, queryClient]);

  // ─── Scroll to bottom on new messages ────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Mutations ───────────────────────────────────────────

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_support_ticket", {
        p_subject: newSubject,
        p_description: newDescription,
        p_category: newCategory,
        p_priority: newPriority,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-stats"] });
      setCreateDialogOpen(false);
      setNewSubject("");
      setNewDescription("");
      setNewCategory("other");
      setNewPriority("medium");
      if (data?.id) {
        setSelectedTicketId(data.id);
      }
      toast({
        title: "Ticket créé",
        description: `Votre ticket ${data?.ticket_number} a été soumis avec succès`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de créer le ticket : ${error.message}`,
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("add_ticket_message", {
        p_ticket_id: selectedTicketId,
        p_message: newMessage,
        p_sender_type: "user",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", selectedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setNewMessage("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible d'envoyer le message : ${error.message}`,
      });
    },
  });

  const closeTicketMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const { data, error } = await supabase.rpc("update_ticket_status", {
        p_ticket_id: ticketId,
        p_status: "resolved",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-stats"] });
      toast({
        title: "Ticket résolu",
        description: "Le ticket a été marqué comme résolu",
      });
    },
  });

  // ─── Filtering ───────────────────────────────────────────

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      !search ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  // ─── Render ──────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LifeBuoy className="h-6 w-6" />
              Support
            </h1>
            <p className="text-muted-foreground">
              Besoin d'aide ? Créez un ticket et notre équipe vous répondra
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau ticket
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats?.total_tickets || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ouverts</p>
                  <p className="text-2xl font-bold">{stats?.open_tickets || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">En cours</p>
                  <p className="text-2xl font-bold">{stats?.in_progress_tickets || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Résolus</p>
                  <p className="text-2xl font-bold">{stats?.resolved_tickets || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-950 rounded-lg">
                  <Clock className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Temps moyen</p>
                  <p className="text-2xl font-bold">
                    {stats?.avg_resolution_hours
                      ? `${Math.round(stats.avg_resolution_hours)}h`
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content: ticket list + chat */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ticket List */}
          <div className={`lg:col-span-1 ${selectedTicketId ? "hidden lg:block" : ""}`}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Mes tickets
                </CardTitle>
                {/* Filters */}
                <div className="space-y-3 mt-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="open">Ouverts</SelectItem>
                      <SelectItem value="in_progress">En cours</SelectItem>
                      <SelectItem value="waiting">En attente</SelectItem>
                      <SelectItem value="resolved">Résolus</SelectItem>
                      <SelectItem value="closed">Fermés</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {ticketsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <Headphones className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium">Aucun ticket</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Créez votre premier ticket de support
                    </p>
                    <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="gap-1">
                      <Plus className="h-3 w-3" />
                      Créer un ticket
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredTickets.map((ticket) => {
                      const CatIcon = categoryIcon(ticket.category);
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                            selectedTicketId === ticket.id ? "bg-muted" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <CatIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium text-sm truncate">
                                  {ticket.subject}
                                </span>
                                {ticket.has_unread_admin && (
                                  <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{ticket.ticket_number}</span>
                                <span>•</span>
                                <span>{formatTimeAgo(ticket.created_at)}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {statusBadge(ticket.status)}
                              {priorityBadge(ticket.priority)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chat / Detail */}
          <div className={`lg:col-span-2 ${!selectedTicketId ? "hidden lg:flex" : ""}`}>
            {selectedTicket ? (
              <Card className="flex flex-col h-[calc(100vh-16rem)]">
                {/* Chat Header */}
                <CardHeader className="pb-3 border-b shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden shrink-0 -ml-2"
                        onClick={() => setSelectedTicketId(null)}
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                      <div>
                        <CardTitle className="text-lg">{selectedTicket.subject}</CardTitle>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <span className="font-mono">{selectedTicket.ticket_number}</span>
                          <span>•</span>
                          <span>{categoryLabel(selectedTicket.category)}</span>
                          <span>•</span>
                          {statusBadge(selectedTicket.status)}
                          <span>•</span>
                          {priorityBadge(selectedTicket.priority)}
                        </div>
                      </div>
                    </div>
                    {selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeTicketMutation.mutate(selectedTicket.id)}
                        disabled={closeTicketMutation.isPending}
                        className="gap-1 shrink-0"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Résolu
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">Aucun message</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((msg) => {
                        const isUser = msg.sender_type === "user";
                        const isAdmin = msg.sender_type === "admin";
                        const isSystem = msg.sender_type === "system";

                        if (isSystem) {
                          return (
                            <div key={msg.id} className="flex justify-center">
                              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                                {msg.message}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                          >
                            {!isUser && (
                              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <Headphones className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                            <div
                              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                                isUser
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-muted rounded-bl-md"
                              }`}
                            >
                              {isAdmin && msg.sender_name && (
                                <p className={`text-xs font-medium mb-1 ${isUser ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                  {msg.sender_name}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                              <p
                                className={`text-xs mt-1 ${
                                  isUser ? "text-primary-foreground/60" : "text-muted-foreground"
                                }`}
                              >
                                {formatTimeAgo(msg.created_at)}
                              </p>
                            </div>
                            {isUser && (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Message Input */}
                {selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                  <div className="border-t p-4 shrink-0">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Écrire un message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && newMessage.trim()) {
                            e.preventDefault();
                            sendMessageMutation.mutate();
                          }
                        }}
                        disabled={sendMessageMutation.isPending}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => sendMessageMutation.mutate()}
                        disabled={!newMessage.trim() || sendMessageMutation.isPending}
                        size="icon"
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Resolved banner */}
                {(selectedTicket.status === "resolved" || selectedTicket.status === "closed") && (
                  <div className="border-t p-4 bg-green-50 dark:bg-green-950/20 shrink-0">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-5 w-5" />
                      <div>
                        <p className="font-medium text-sm">Ticket résolu</p>
                        <p className="text-xs">
                          Envoyez un nouveau message pour rouvrir ce ticket
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="flex items-center justify-center h-[calc(100vh-16rem)]">
                <div className="text-center">
                  <LifeBuoy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium">Sélectionnez un ticket</p>
                  <p className="text-muted-foreground">
                    Ou créez un nouveau ticket pour obtenir de l'aide
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Help Resources */}
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/10">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Lightbulb className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-medium text-green-900 dark:text-green-100">
                  Ressources d'aide
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-green-800 dark:text-green-200">
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    <span><strong>Bug</strong> : signalez un problème technique</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    <span><strong>Technique</strong> : aide pour configurer ou utiliser</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span><strong>Facturation</strong> : questions d'abonnement</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    <span><strong>Suggestion</strong> : proposez une nouvelle fonctionnalité</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Create Ticket Dialog ──────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nouveau ticket de support
            </DialogTitle>
            <DialogDescription>
              Décrivez votre problème ou votre demande et notre équipe vous répondra dans les plus brefs délais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Sujet *</Label>
              <Input
                id="ticket-subject"
                placeholder="Résumez votre problème en une phrase"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={newCategory} onValueChange={(v) => setNewCategory(v as TicketCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">
                      <span className="flex items-center gap-2"><Bug className="h-4 w-4" /> Bug</span>
                    </SelectItem>
                    <SelectItem value="technical">
                      <span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Technique</span>
                    </SelectItem>
                    <SelectItem value="billing">
                      <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Facturation</span>
                    </SelectItem>
                    <SelectItem value="feature_request">
                      <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Suggestion</span>
                    </SelectItem>
                    <SelectItem value="other">
                      <span className="flex items-center gap-2"><HelpCircle className="h-4 w-4" /> Autre</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TicketPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-desc">Description *</Label>
              <Textarea
                id="ticket-desc"
                placeholder="Décrivez votre problème en détail : que se passe-t-il, quand, et quel est l'impact ?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => createTicketMutation.mutate()}
              disabled={!newSubject.trim() || !newDescription.trim() || createTicketMutation.isPending}
              className="gap-2"
            >
              {createTicketMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Envoyer le ticket
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Support;
