import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/utils";
import {
  Loader2, RefreshCw, Mail, MessageSquare, KeyRound,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";

interface ResetTokenRow {
  id: string;
  user_id: string;
  channel: string;
  destination: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

interface UserOption { user_id: string; name: string; }

type StatusFilter = "all" | "active" | "used" | "expired";
type ChannelFilter = "all" | "email" | "sms";

const PAGE_SIZE = 10;

const fmtAbs = (iso: string | null) => {
  if (!iso) return "—";
  try { return formatDateTime(iso); }
  catch { return "—"; }
};

const statusOf = (row: ResetTokenRow): "used" | "expired" | "active" => {
  if (row.used_at) return "used";
  if (new Date(row.expires_at) < new Date()) return "expired";
  return "active";
};

const statusBadge = (s: "used" | "expired" | "active") => {
  switch (s) {
    case "used":
      return <Badge variant="outline" className="border-primary/50 text-primary">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Utilisé
      </Badge>;
    case "expired":
      return <Badge variant="outline" className="border-destructive/50 text-destructive">
        <XCircle className="h-3 w-3 mr-1" /> Expiré
      </Badge>;
    case "active":
      return <Badge variant="outline" className="border-accent/50 text-accent-foreground">
        <Clock className="h-3 w-3 mr-1" /> En attente
      </Badge>;
  }
};

export const ResetTokensPanel = ({ users }: { users: UserOption[] }) => {
  const [rows, setRows] = useState<ResetTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const userMap = new Map(users.map((u) => [u.user_id, u.name]));

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("password_reset_tokens")
        .select("id, user_id, channel, destination, created_at, expires_at, used_at")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data ?? []) as ResetTokenRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [channel, status, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (channel !== "all" && r.channel !== channel) return false;
      if (status !== "all" && statusOf(r) !== status) return false;
      if (q) {
        const dest = (r.destination ?? "").toLowerCase();
        const name = (userMap.get(r.user_id) ?? "").toLowerCase();
        if (!dest.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [rows, channel, status, search, userMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const counts = useMemo(() => ({
    active: rows.filter((r) => statusOf(r) === "active").length,
    used: rows.filter((r) => statusOf(r) === "used").length,
    expired: rows.filter((r) => statusOf(r) === "expired").length,
  }), [rows]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Liens de réinitialisation
          </CardTitle>
          <CardDescription>
            Vue chronologique complète (email + SMS) — {rows.length} entrées ·{" "}
            <span className="text-accent-foreground">{counts.active} actifs</span> ·{" "}
            <span className="text-primary">{counts.used} utilisés</span> ·{" "}
            <span className="text-destructive">{counts.expired} expirés</span>
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="flex flex-wrap gap-3">
          <div className="w-40">
            <Select value={channel} onValueChange={(v) => setChannel(v as ChannelFilter)}>
              <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous canaux</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="active">En attente</SelectItem>
                <SelectItem value="used">Utilisé</SelectItem>
                <SelectItem value="expired">Expiré</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Rechercher email, téléphone ou utilisateur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Aucun lien correspondant aux filtres.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Envoyé</TableHead>
                    <TableHead>Expire</TableHead>
                    <TableHead>Utilisé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r) => {
                    const s = statusOf(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{userMap.get(r.user_id) ?? "—"}</TableCell>
                        <TableCell>
                          {r.channel === "sms" ? (
                            <span className="inline-flex items-center gap-1 text-sm">
                              <MessageSquare className="h-3.5 w-3.5" /> SMS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm">
                              <Mail className="h-3.5 w-3.5" /> Email
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.destination}</TableCell>
                        <TableCell>{statusBadge(s)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtAbs(r.created_at)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtAbs(r.expires_at)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {r.used_at ? fmtAbs(r.used_at) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (currentPage > 1) setPage(currentPage - 1); }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                    .map((p, i, arr) => (
                      <PaginationItem key={p}>
                        {i > 0 && arr[i - 1] !== p - 1 && (
                          <span className="px-2 text-muted-foreground">…</span>
                        )}
                        <PaginationLink
                          href="#"
                          isActive={p === currentPage}
                          onClick={(e) => { e.preventDefault(); setPage(p); }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) setPage(currentPage + 1); }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Note : les liens de récupération envoyés par email natif Supabase Auth ne passent pas par cette table.
          Seuls les jetons générés par l'admin (SMS ou copie manuelle de lien) sont listés ici.
        </p>
      </CardContent>
    </Card>
  );
};
