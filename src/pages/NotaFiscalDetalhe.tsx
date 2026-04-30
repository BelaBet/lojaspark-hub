import { traduzErro } from "@/lib/errors";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  ArrowLeft, Copy, Download, ExternalLink, FileText, RefreshCw,
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2, Printer, FileCode,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
};

type VendaDetalhe = {
  id: string;
  total: number;
  desconto: number;
  forma_pagamento: string | null;
  created_at: string;
  cliente: { nome: string; cpf_cnpj: string | null } | null;
  itens: {
    id: string;
    quantidade: number;
    preco_unit: number;
    subtotal: number | null;
    produto: { nome: string; sku: string | null } | null;
  }[];
};

const statusMeta = (s: string) => {
  switch (s) {
    case "autorizada":
      return { label: "Autorizada", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700 border-green-500/30" };
    case "rejeitada":
      return { label: "Rejeitada", icon: XCircle, cls: "bg-red-500/10 text-red-700 border-red-500/30" };
    case "cancelada":
      return { label: "Cancelada", icon: XCircle, cls: "bg-gray-500/10 text-gray-700 border-gray-500/30" };
    case "processando":
      return { label: "Processando", icon: Loader2, cls: "bg-blue-500/10 text-blue-700 border-blue-500/30" };
    case "pendente":
      return { label: "Pendente", icon: Clock, cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30" };
    default:
      return { label: s, icon: AlertCircle, cls: "bg-muted text-muted-foreground border-border" };
  }
};

const formatChave = (chave: string | null) => {
  if (!chave) return "—";
  return chave.replace(/(.{4})/g, "$1 ").trim();
};

const NotaFiscalDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nota, setNota] = useState<Nota | null>(null);
  const [venda, setVenda] = useState<VendaDetalhe | null>(null);
  const [reemitindo, setReemitindo] = useState(false);

  const loadNota = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notas_fiscais")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      toast.error("Nota fiscal não encontrada");
      setLoading(false);
      return;
    }
    setNota(data as Nota);

    if (data.venda_id) {
      const { data: vendaData } = await supabase
        .from("vendas")
        .select(`
          id, total, desconto, forma_pagamento, created_at,
          cliente:clientes(nome, cpf_cnpj),
          itens:venda_itens(id, quantidade, preco_unit, subtotal, produto:produtos(nome, sku))
        `)
        .eq("id", data.venda_id)
        .maybeSingle();
      if (vendaData) setVenda(vendaData as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const copyChave = () => {
    if (!nota?.chave_acesso) return;
    navigator.clipboard.writeText(nota.chave_acesso);
    toast.success("Chave de acesso copiada");
  };

  const baixarXML = () => {
    if (!nota?.xml_autorizado) {
      toast.error("XML não disponível");
      return;
    }
    const blob = new Blob([nota.xml_autorizado], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nota.chave_acesso || nota.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reemitir = async () => {
    if (!nota) return;
    setReemitindo(true);
    try {
      const { error } = await supabase.functions.invoke("emitir-nota", {
        body: { nota_id: nota.id, venda_id: nota.venda_id, tipo: nota.tipo },
      });
      if (error) throw error;
      toast.success("Reemissão enviada");
      await loadNota();
    } catch (e: any) {
      toast.error("Falha ao reemitir", { description: traduzErro(e) });
    } finally {
      setReemitindo(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!nota) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto text-center py-20">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-semibold mb-2">Nota não encontrada</h2>
          <Button onClick={() => navigate("/notas-fiscais")} variant="outline">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  const meta = statusMeta(nota.status);
  const Icon = meta.icon;
  const tipoLabel = nota.tipo?.toUpperCase();
  const podeReemitir = ["pendente", "rejeitada"].includes(nota.status);
  const temDanfe = !!nota.danfe_url;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/notas-fiscais")}
              className="mb-2 -ml-2"
            >
              <ArrowLeft className="w-4 h-4" /> Notas Fiscais
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">
                {tipoLabel} nº {nota.numero ?? "—"}
              </h1>
              <Badge variant="outline" className={cn("gap-1", meta.cls)}>
                <Icon className={cn("w-3.5 h-3.5", nota.status === "processando" && "animate-spin")} />
                {meta.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 mono">
              Série {nota.serie ?? "—"} · Emitida em{" "}
              {new Date(nota.emitida_at ?? nota.created_at).toLocaleString("pt-BR")}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {temDanfe && (
              <>
                <Button asChild variant="outline">
                  <a href={nota.danfe_url!} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4" /> Abrir DANFE
                  </a>
                </Button>
                <Button asChild>
                  <a href={nota.danfe_url!} download target="_blank" rel="noreferrer">
                    <Download className="w-4 h-4" /> Baixar PDF
                  </a>
                </Button>
              </>
            )}
            {nota.xml_autorizado && (
              <Button variant="outline" onClick={baixarXML}>
                <FileCode className="w-4 h-4" /> XML
              </Button>
            )}
            {podeReemitir && (
              <Button variant="outline" onClick={reemitir} disabled={reemitindo}>
                <RefreshCw className={cn("w-4 h-4", reemitindo && "animate-spin")} />
                Reemitir
              </Button>
            )}
          </div>
        </div>

        {/* Rejeição */}
        {nota.status === "rejeitada" && nota.motivo_rejeicao && (
          <Card className="p-4 border-red-500/30 bg-red-500/5">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700">Nota rejeitada pela SEFAZ</p>
                <p className="text-sm text-muted-foreground mt-1">{nota.motivo_rejeicao}</p>
              </div>
            </div>
          </Card>
        )}

        {/* DANFE Viewer */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Visualização do DANFE</span>
            </div>
            {temDanfe && (
              <Button variant="ghost" size="sm" asChild>
                <a href={nota.danfe_url!} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4" /> Abrir em nova aba
                </a>
              </Button>
            )}
          </div>
          {temDanfe ? (
            <iframe
              src={nota.danfe_url!}
              title="DANFE"
              className="w-full bg-white"
              style={{ height: "70vh", minHeight: 600 }}
            />
          ) : (
            <div className="py-20 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">DANFE indisponível</p>
              <p className="text-sm text-muted-foreground mt-1">
                A visualização aparecerá aqui após a autorização da nota.
              </p>
            </div>
          )}
        </Card>

        {/* Dados da nota */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Dados da Nota</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Chave de acesso</p>
              <div className="flex items-start gap-2">
                <span className="mono text-xs break-all">{formatChave(nota.chave_acesso)}</span>
                {nota.chave_acesso && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={copyChave}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Protocolo</p>
              <p className="mono text-xs">{nota.protocolo ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Referência Focus NFe</p>
              <p className="mono text-xs">{nota.ref_focusnfe ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Cancelada em</p>
              <p className="mono text-xs">
                {nota.cancelada_at ? new Date(nota.cancelada_at).toLocaleString("pt-BR") : "—"}
              </p>
            </div>
          </div>
        </Card>

        {/* Venda vinculada */}
        {venda && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Venda Vinculada</h3>
              <Button variant="outline" size="sm" onClick={() => navigate(`/vendas/${venda.id}/recibo`)}>
                Ver recibo
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div>
                <p className="text-muted-foreground text-xs">Cliente</p>
                <p className="font-medium">{venda.cliente?.nome ?? "Sem cliente"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">CPF/CNPJ</p>
                <p className="mono text-xs">{venda.cliente?.cpf_cnpj ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Pagamento</p>
                <p className="font-medium capitalize">{venda.forma_pagamento ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total</p>
                <p className="font-semibold">{brl(venda.total)}</p>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="space-y-2">
              {venda.itens?.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm py-1">
                  <div>
                    <p className="font-medium">{it.produto?.nome ?? "Produto removido"}</p>
                    <p className="text-xs text-muted-foreground mono">
                      {it.quantidade} × {brl(it.preco_unit)}
                      {it.produto?.sku && ` · SKU ${it.produto.sku}`}
                    </p>
                  </div>
                  <span className="font-medium">{brl(it.subtotal ?? it.quantidade * it.preco_unit)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default NotaFiscalDetalhe;