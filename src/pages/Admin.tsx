import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLayout } from "@/components/AppLayout";
import { Shield, Search, ExternalLink, Building2, Webhook, FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type Loja = {
  id: string;
  nome: string;
  email: string | null;
  cnpj: string | null;
  plano: string;
  logo_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  onboarding_completo: boolean;
  created_at: string;
};

const Admin = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data: roleData } = await supabase.rpc("is_super_admin");
      const ok = roleData === true;
      setIsSuper(ok);
      setAuthChecked(true);
      if (!ok) return;
      const { data, error } = await supabase
        .from("lojas")
        .select("id, nome, email, cnpj, plano, logo_url, cor_primaria, cor_secundaria, onboarding_completo, created_at")
        .order("created_at", { ascending: false });
      if (error) toast.error("Erro ao carregar instituições");
      else setLojas(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="mono text-sm text-muted-foreground">carregando…</div>
      </div>
    );
  }

  if (!isSuper) return <Navigate to="/dashboard" replace />;

  const filtered = lojas.filter((l) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      l.nome.toLowerCase().includes(s) ||
      (l.email ?? "").toLowerCase().includes(s) ||
      (l.cnpj ?? "").includes(s)
    );
  });

  return (
    <AppLayout>
      <div className="space-y-5 max-w-6xl">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mono text-[10px] uppercase tracking-widest">
              <Shield className="h-3.5 w-3.5" /> Super Admin
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1">Instituições</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acesso global a todas as instituições cadastradas no sistema.
            </p>
          </div>
          <div className="num text-sm text-muted-foreground">
            <span className="text-2xl font-bold text-foreground">{lojas.length}</span> total
          </div>
        </header>

        <div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/webhooks">
              <Webhook className="h-4 w-4 mr-1.5" /> Auditoria de webhooks
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="ml-2">
            <Link to="/admin/teste-pagamento">
              <FlaskConical className="h-4 w-4 mr-1.5" /> Teste de pagamento
            </Link>
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, email ou CNPJ…"
            className="pl-9 h-11"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <p className="mt-3 text-muted-foreground">Nenhuma instituição encontrada.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((l) => (
              <Card key={l.id} className="p-4 space-y-3 hover:shadow-soft-md transition-shadow">
                <div className="flex items-start gap-3">
                  {l.logo_url ? (
                    <img src={l.logo_url} alt={l.nome} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="h-12 w-12 rounded-lg flex items-center justify-center text-white"
                      style={{ background: l.cor_primaria || "hsl(var(--primary))" }}
                    >
                      <Building2 className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold leading-tight truncate">{l.nome}</h3>
                    {l.email && (
                      <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                    )}
                  </div>
                  <Badge variant={l.onboarding_completo ? "default" : "outline"} className="mono text-[10px]">
                    {l.onboarding_completo ? "ativa" : "pendente"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex gap-1.5 items-center">
                    <span className="h-4 w-4 rounded border border-border" style={{ background: l.cor_primaria || "#3F3C7A" }} />
                    <span className="h-4 w-4 rounded border border-border" style={{ background: l.cor_secundaria || "#D8A14A" }} />
                  </div>
                  <Badge variant="outline" className="mono text-[10px]">{l.plano}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(`/c/${l.id}`, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Catálogo
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Admin;