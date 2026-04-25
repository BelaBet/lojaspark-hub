import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Package } from "lucide-react";
import { num } from "@/lib/format";

type ProdutoOpt = {
  id: string;
  nome: string;
  sku: string | null;
  estoque: { quantidade: number }[];
};

const MOTIVOS = [
  { id: "compra", label: "Compra" },
  { id: "devolucao", label: "Devolução" },
  { id: "ajuste", label: "Ajuste" },
  { id: "outro", label: "Outro" },
];

export const EntradaEstoqueDialog = ({
  open,
  onOpenChange,
  onSuccess,
  produtoIdInicial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  produtoIdInicial?: string | null;
}) => {
  const [busca, setBusca] = useState("");
  const [produtos, setProdutos] = useState<ProdutoOpt[]>([]);
  const [produtoId, setProdutoId] = useState<string>("");
  const [quantidade, setQuantidade] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("compra");
  const [referencia, setReferencia] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusca("");
    setQuantidade("");
    setMotivo("compra");
    setReferencia("");
    setProdutoId(produtoIdInicial ?? "");
    void carregarProdutos("");
  }, [open, produtoIdInicial]);

  const carregarProdutos = async (q: string) => {
    let query = supabase
      .from("produtos")
      .select("id, nome, sku, estoque(quantidade)")
      .eq("ativo", true)
      .order("nome")
      .limit(20);
    if (q.trim()) {
      query = query.or(`nome.ilike.%${q}%,sku.ilike.%${q}%,ean.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (!error && data) setProdutos(data as ProdutoOpt[]);
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void carregarProdutos(busca), 250);
    return () => clearTimeout(t);
  }, [busca, open]);

  const produtoSelecionado = useMemo(
    () => produtos.find((p) => p.id === produtoId),
    [produtos, produtoId],
  );

  const confirmar = async () => {
    const qty = Number(quantidade);
    if (!produtoId) return toast.error("Selecione um produto.");
    if (!qty || qty <= 0) return toast.error("Quantidade deve ser maior que zero.");

    setSalvando(true);
    try {
      const { data: lojaIdData, error: lojaErr } = await supabase.rpc("get_loja_id");
      if (lojaErr || !lojaIdData) throw lojaErr ?? new Error("Loja não encontrada");
      const loja_id = lojaIdData as unknown as string;

      const motivoTxt = MOTIVOS.find((m) => m.id === motivo)?.label ?? motivo;
      const motivoFinal = referencia.trim()
        ? `${motivoTxt} — ${referencia.trim()}`
        : motivoTxt;

      const { error: movErr } = await supabase.from("movimentacoes_estoque").insert({
        loja_id,
        produto_id: produtoId,
        tipo: "entrada",
        quantidade: qty,
        motivo: motivoFinal,
      });
      if (movErr) throw movErr;

      const { data: estoqueAtual } = await supabase
        .from("estoque")
        .select("id, quantidade")
        .eq("produto_id", produtoId)
        .eq("loja_id", loja_id)
        .maybeSingle();

      if (estoqueAtual) {
        const { error: updErr } = await supabase
          .from("estoque")
          .update({ quantidade: Number(estoqueAtual.quantidade) + qty })
          .eq("id", estoqueAtual.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("estoque").insert({
          loja_id,
          produto_id: produtoId,
          quantidade: qty,
        });
        if (insErr) throw insErr;
      }

      toast.success("Entrada registrada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registrar entrada.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Entrada de Estoque</DialogTitle>
          <DialogDescription>Registre uma nova entrada de mercadoria.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Produto
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou SKU…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {produtos.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhum produto encontrado
                </div>
              )}
              {produtos.map((p) => {
                const qtdAtual = p.estoque?.[0]?.quantidade ?? 0;
                const ativo = produtoId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProdutoId(p.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      ativo ? "bg-primary-soft" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.nome}</div>
                        {p.sku && (
                          <div className="mono text-[10px] text-muted-foreground">{p.sku}</div>
                        )}
                      </div>
                    </div>
                    <span className="num text-xs text-muted-foreground shrink-0">
                      {num(qtdAtual)} un
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Quantidade
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Motivo
              </Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Nota / Referência (opcional)
            </Label>
            <Textarea
              rows={2}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ex: NF 12345, Fornecedor X…"
            />
          </div>

          {produtoSelecionado && quantidade && Number(quantidade) > 0 && (
            <div className="rounded-lg bg-primary-soft px-3 py-2 flex items-baseline justify-between">
              <span className="mono text-[10px] uppercase tracking-widest text-primary">
                Novo total
              </span>
              <span className="num font-bold text-primary">
                {num((produtoSelecionado.estoque?.[0]?.quantidade ?? 0) + Number(quantidade))} un
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Registrando…</> : "Confirmar entrada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};