import { traduzErro } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  Search, FileText, Copy, ExternalLink, RefreshCw, Download, Eye,
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tipo = "todos" | "nfe" | "nfce";
type Status = "todos" | "pendente" | "processando" | "autorizada" | "rejeitada" | "cancelada";
type Periodo = "hoje" | "semana" | "mes" | "tudo";

type Nota = {
  id: string;
  tipo: string;
  numero: number | null;
  serie: string | null;
  status: string;
  chave_acesso: string | null;
  protocolo: string | null;
  motivo_rejeicao: string | null;
  danfe_url: string | null;
  xml_autorizado: string | null;
  ref_focusnfe: string | null;
  emitida_at: string | null;
  cancelada_at: string | null;
  created_at: string;
  venda_id: string | null;
  venda?: { total: number; cliente?: { nome: string } | null } | null;
};

const STATUS_OPTIONS: { id: Status; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "autorizada", label: "Autorizadas" },
  { id: "pendente", label: "Pendentes" },
  { id: "processando", label: "Processando" },
  { id: "rejeitada", label: "Rejeitadas" },
  { id: "cancelada", label: "Canceladas" },
];

const PERIODO_OPTIONS: { id: Periodo; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "7 dias" },
  { id: "mes", label: "30 dias" },
  { id: "tudo", label: "Tudo" },
];

const statusInfo = (s: string) => {
  switch (s) {
    case "autorizada":
      return { label: "Autorizada", icon: CheckCircle2, cls: "bg-primary/10 text-primary border-primary/20" };
    case "rejeitada":
      return { label: "Rejeitada", icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/20" };
    case "cancelada":
      return { label: "Cancelada", icon: XCircle, cls: "bg-muted text-muted-foreground border-border" };
    case "processando":
      return { label: "Processando", icon: Loader2, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" };
    case "pendente":
    default:
      return { label: "Pendente", icon: Clock, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" };
  }
};

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const fmtChave = (chave: string | null) => {
  if (!chave) return "—";
  return chave.replace(/(.{4})/g, "$1 ").trim();
};

const NotasFiscais = () => {
  const navigate = useNavigate();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<Tipo>("todos");
  const [status, setStatus] = useState<Status>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [busca, setBusca] = useState("");

  const carregar = async () => {
    setLoading(true);
    let query = supabase
      .from("notas_fiscais")
      .select("id,tipo,numero,serie,status,chave_acesso,protocolo,motivo_rejeicao,danfe_url,xml_autorizado,ref_focusnfe,emitida_at,cancelada_at,created_at,venda_id, venda:vendas(total, cliente:clientes(nome))")
      .order("created_at", { ascending: false })
      .limit(500);

    if (periodo !== "tudo") {
      const since = new Date();
      if (periodo === "hoje") since.setHours(0, 0, 0, 0);
      if (periodo === "semana") since.setDate(since.getDate() - 7);
      if (periodo === "mes") since.setDate(since.getDate() - 30);
      query = query.gte("created_at", since.toISOString());
    }

    const { data, error } = await query;
    if (error) toast.error(traduzErro(error));
    setNotas((data as unknown as Nota[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return notas.filter((n) => {
      if (tipo !== "todos" && n.tipo !== tipo) return false;
      if (status !== "todos" && n.status !== status) return false;
      if (q) {
        const hay = [
          n.chave_acesso ?? "",
          n.numero?.toString() ?? "",
          n.venda?.cliente?.nome ?? "",
          n.protocolo ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notas, tipo, status, busca]);

  const totais = useMemo(() => {
    const t = { total: notas.length, autorizada: 0, pendente: 0, rejeitada: 0, cancelada: 0 };
    for (const n of notas) {
      if (n.status === "autorizada") t.autorizada++;
      else if (n.status === "rejeitada") t.rejeitada++;
      else if (n.status === "cancelada") t.cancelada++;
      else t.pendente++;
    }
    return t;
  }, [notas]);

  const copiar = async (texto: string | null, label: string) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${label} copiada`);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const reemitir = async (nota: Nota) => {
    if (!nota.venda_id) {
      toast.error("Nota sem venda associada");
      return;
    }
    toast.loading("Reenviando para a SEFAZ...", { id: nota.id });
    const { error } = await supabase.functions.invoke("emitir-nota", {
      body: { venda_id: nota.venda_id, tipo: nota.tipo, retry_nota_id: nota.id },
    });
    toast.dismiss(nota.id);
    if (error) {
      toast.error(traduzErro(error, "Falha ao reemitir"));
      return;
    }
    toast.success("Reenvio iniciado");
    carregar();
  };

  const baixarXml = (nota: Nota) => {
    if (!nota.xml_autorizado) {
      toast.error("XML não disponível");
      return;
    }
    const blob = new Blob([nota.xml_autorizado], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nota.tipo}-${nota.numero ?? nota.id}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Fiscal</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">Notas Fiscais</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de NF-e e NFC-e emitidas pela loja
            </p>
          </div>
          <Button variant="outline" onClick={carregar} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Total</p>
            <p className="font-display text-2xl font-bold mt-1">{totais.total}</p>
          </Card>
          <button
            onClick={() => setStatus("autorizada")}
            className="text-left"
          >
            <Card className="p-4 hover:border-primary/40 transition-colors h-full">
              <p className="mono text-[10px] uppercase tracking-widest text-primary">Autorizadas</p>
              <p className="font-display text-2xl font-bold mt-1 text-primary">{totais.autorizada}</p>
            </Card>
          </button>
          <button
            onClick={() => setStatus("pendente")}
            className="text-left"
          >
            <Card className="p-4 hover:border-amber-500/40 transition-colors h-full">
              <p className="mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-400">Pendentes</p>
              <p className="font-display text-2xl font-bold mt-1 text-amber-700 dark:text-amber-400">{totais.pendente}</p>
            </Card>
          </button>
          <button
            onClick={() => setStatus("rejeitada")}
            className="text-left"
          >
            <Card className="p-4 hover:border-destructive/40 transition-colors h-full">
              <p className="mono text-[10px] uppercase tracking-widest text-destructive">Rejeitadas</p>
              <p className="font-display text-2xl font-bold mt-1 text-destructive">{totais.rejeitada}</p>
            </Card>
          </button>
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por chave, número, cliente ou protocolo"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="nfe">NF-e</SelectItem>
                <SelectItem value="nfce">NFC-e</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="w-full lg:w-36">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {PERIODO_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Tabela */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Nenhuma nota encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                {notas.length === 0
                  ? "As notas emitidas a partir das vendas aparecerão aqui."
                  : "Ajuste os filtros para visualizar outras notas."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nº / Série</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chave de acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((n) => {
                  const si = statusInfo(n.status);
                  const Icon = si.icon;
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="mono text-xs text-muted-foreground whitespace-nowrap">
                        {fmtData(n.emitida_at ?? n.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase mono text-[10px]">
                          {n.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="mono text-xs whitespace-nowrap">
                        {n.numero ? `${n.numero} / ${n.serie ?? "-"}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {n.venda?.cliente?.nome ?? <span className="text-muted-foreground">Consumidor</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {n.venda?.total != null ? brl(Number(n.venda.total)) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1", si.cls)}>
                          <Icon className={cn("h-3 w-3", n.status === "processando" && "animate-spin")} />
                          {si.label}
                        </Badge>
                        {n.status === "rejeitada" && n.motivo_rejeicao && (
                          <p className="mt-1 text-[11px] text-destructive line-clamp-2 max-w-[260px]" title={n.motivo_rejeicao}>
                            {n.motivo_rejeicao}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {n.chave_acesso ? (
                          <button
                            onClick={() => copiar(n.chave_acesso, "Chave")}
                            className="group flex items-center gap-2 mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            title={n.chave_acesso}
                          >
                            <span className="truncate max-w-[220px]">{fmtChave(n.chave_acesso)}</span>
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => navigate(`/notas-fiscais/${n.id}`)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {n.danfe_url && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              asChild
                              title="Abrir DANFE"
                            >
                              <a href={n.danfe_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {n.xml_autorizado && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => baixarXml(n)}
                              title="Baixar XML"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {(n.status === "rejeitada" || n.status === "pendente") && n.venda_id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => reemitir(n)}
                              title="Tentar novamente"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          {!n.danfe_url && !n.xml_autorizado && n.status !== "rejeitada" && n.status !== "pendente" && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {!loading && filtradas.length > 0 && (
          <p className="mono text-[11px] text-muted-foreground text-center">
            Exibindo {filtradas.length} de {notas.length} notas
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default NotasFiscais;