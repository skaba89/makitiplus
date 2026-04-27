import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Mail, MessageSquare, KeyRound, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

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

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr }); }
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

  const userMap = new Map(users.map((u) => [u.user_id, u.name]));

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("password_reset_tokens")
        .select("id, user_id, channel, destination, created_at, expires_at, used_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setRows((data ?? []) as ResetTokenRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Liens de réinitialisation
          </CardTitle>
          <CardDescription>
            Statut des derniers liens (SMS) — pratique pour vos tests
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Aucun lien généré pour le moment. Les liens email natifs ne sont pas listés ici (gérés par le service d'authentification).
          </div>
        ) : (
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
                {rows.map((r) => {
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
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmt(r.expires_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.used_at ? fmt(r.used_at) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
