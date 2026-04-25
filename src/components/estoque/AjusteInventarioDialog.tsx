import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { num } from "@/lib/format";

type Linha = {
  produto_id: string;
  nome: string;
  sku: string | null;
  qtd_atual: number;
  qtd_real: string;
};

export const AjusteInventarioDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) => {
  const [busca, setBusca] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [observacao, setObservacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState<"contagem" | "preview">("contagem");

  useEffect(() => {
    if (!open) return;
    setBusca("");
    setObservacao("");
    setEtapa("contagem");
    void carregar();
  }, [open]);

  const carregar = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, sku, estoque(quantidade)")
        .eq("ativo", true)
        .order("nome")
        .limit(200);
      if (error) throw error;
      const novas: Linha[] = (data ?? []).map((p) => ({
        produto_id: p.id,
        nome: p.nome,
        sku: p.sku,
        qtd_atual: Number(
          (p as unknown as { estoque: { quantidade: number }[] }).estoque?.[0]?.quantidade ?? 0,
        ),
        qtd_real: "",
      }));
      setLinhas(novas);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar produtos.");
    } finally {
      setCarregando(false);
    }
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        l.nome.toLowerCase().includes(q) ||
        (l.sku ?? "").toLowerCase().includes(q),
    );
  }, [linhas, busca]);

  const diferencas = useMemo(
    () =>
      linhas
        .filter((l) => l.qtd_real !== "" && Number(l.qtd_real) !== l.qtd_atual)
        .map((l) => ({
          ...l,
          real: Number(l.qtd_real),
          delta: Number(l.qtd_real) - l.qtd_atual,
        })),
    [linhas],
  );

  const setReal = (id: string, v: string) =>
    setLinhas((prev) =>
      prev.map((l) => (l.produto_id === id ? { ...l, qtd_real: v } : l)),
    );

  const irParaPreview = () => {
    if (diferencas.length === 0) {
      toast.error("Nenhuma divergência informada.");
      return;
    }
    setEtapa("preview");
  };

  const confirmar = async () => {
    setSalvando(true);
    try {
      const { data: lojaIdData, error: lojaErr } = await supabase.rpc("get_loja_id");
      if (lojaErr || !lojaIdData) throw lojaErr ?? new Error("Loja não encontrada");
      const loja_id = lojaIdData as unknown as string;

      const motivoBase = `Ajuste de inventário${observacao.trim() ? ` — ${observacao.trim()}` : ""}`;

      const movimentacoes = diferencas.map((d) => ({
        loja_id,
        produto_id: d.produto_id,
        tipo: "ajuste",
        quantidade: Math.abs(d.delta),
        motivo: `${motivoBase} (${d.delta > 0 ? "+" : "-"}${Math.abs(d.delta)})`,
      }));

      const { error: movErr } = await supabase
        .from("movimentacoes_estoque")
        .insert(movimentacoes);
      if (movErr) throw movErr;

      for (const d of diferencas) {
        const { data: estoqueAtual } = await supabase
          .from("estoque")
          .select("id")
          .eq("produto_id", d.produto_id)
          .eq("loja_id", loja_id)
          .maybeSingle();
        if (estoqueAtual) {
          await supabase
            .from("estoque")
            .update({ quantidade: d.real })
            .eq("id", estoqueAtual.id);
        } else {
          await supabase.from("estoque").insert({
            loja_id,
            produto_id: d.produto_id,
            quantidade: d.real,
          });
        }
      }

      toast.success(`${diferencas.length} ajuste(s) aplicado(s) com sucesso!`);
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar ajustes.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {etapa === "contagem" ? "Ajuste de Inventário" : "Confirmar ajustes"}
          </DialogTitle>
          <DialogDescription>
            {etapa === "contagem"
              ? "Informe a quantidade real contada apenas para os produtos que sofreram divergência."
              : `${diferencas.length} produto(s) terão o estoque ajustado.`}
          </DialogDescription>
        </DialogHeader>

        {etapa === "contagem" ? (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="rounded-lg border border-border max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-[1fr,90px,90px] gap-2 px-3 py-2 border-b border-border bg-muted/30 mono text-[10px] uppercase tracking-widest text-muted-foreground sticky top-0">
                <span>Produto</span>
                <span className="text-right">Sistema</span>
                <span className="text-right">Real</span>
              </div>
              {carregando ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Carregando…
                </div>
              ) : filtradas.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum produto encontrado
                </div>
              ) : (
                filtradas.map((l) => {
                  const real = l.qtd_real === "" ? null : Number(l.qtd_real);
                  const delta = real === null ? 0 : real - l.qtd_atual;
                  return (
                    <div
                      key={l.produto_id}
                      className="grid grid-cols-[1fr,90px,90px] gap-2 px-3 py-2 items-center border-b border-border last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{l.nome}</div>
                        {l.sku && (
                          <div className="mono text-[10px] text-muted-foreground">{l.sku}</div>
                        )}
                      </div>
                      <div className="num text-sm text-right text-muted-foreground">
                        {num(l.qtd_atual)}
                      </div>
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={l.qtd_real}
                          onChange={(e) => setReal(l.produto_id, e.target.value)}
                          className={`h-9 text-right num ${
                            delta > 0
                              ? "border-primary text-primary"
                              : delta < 0
                                ? "border-destructive text-destructive"
                                : ""
                          }`}
                          placeholder="—"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-2">
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Observação (opcional)
              </Label>
              <Textarea
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Inventário mensal, perda por avaria…"
              />
            </div>

            {diferencas.length > 0 && (
              <div className="rounded-lg bg-primary-soft px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-primary font-medium">
                  {diferencas.length} divergência(s) detectada(s)
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 max-h-[60vh] overflow-y-auto space-y-2">
            {diferencas.map((d) => (
              <div
                key={d.produto_id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{d.nome}</div>
                  {d.sku && (
                    <div className="mono text-[10px] text-muted-foreground">{d.sku}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Antes
                    </div>
                    <div className="num text-sm">{num(d.qtd_atual)}</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Depois
                    </div>
                    <div className="num text-sm font-semibold">{num(d.real)}</div>
                  </div>
                  <div
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                      d.delta > 0
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {d.delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    <span className="num">{d.delta > 0 ? "+" : ""}{d.delta}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {etapa === "contagem" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={irParaPreview} disabled={diferencas.length === 0}>
                Revisar {diferencas.length > 0 ? `(${diferencas.length})` : ""}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEtapa("contagem")} disabled={salvando}>
                Voltar
              </Button>
              <Button onClick={confirmar} disabled={salvando}>
                {salvando ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Aplicando…</> : "Confirmar ajustes"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};