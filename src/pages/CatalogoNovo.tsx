import { traduzErro } from "@/lib/errors";
import { useEffect, useState } from "react";
import { useNavigate, Link, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ProductPhotosInput } from "@/components/ProductImageInput";

const schema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(200),
  sku: z.string().trim().max(80).optional(),
  ean: z.string().trim().max(80).optional(),
  categoria: z.string().trim().max(80).optional(),
  marca: z.string().trim().max(80).optional(),
  fornecedor: z.string().trim().max(120).optional(),
  ncm: z.string().trim().max(20).optional(),
  descricao: z.string().trim().max(2000).optional(),
  preco_venda: z.number().min(0.01, "Preço de venda obrigatório"),
  preco_custo: z.number().min(0).optional(),
  preco_atacado: z.number().min(0).optional(),
  estoque_inicial: z.number().min(0),
  estoque_minimo: z.number().min(0),
});

const blank = {
  nome: "", sku: "", ean: "", categoria: "", marca: "", fornecedor: "", ncm: "",
  descricao: "", preco_venda: "", preco_custo: "", preco_atacado: "",
  estoque_inicial: "0", estoque_minimo: "0",
};

const CatalogoNovo = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const duplicateFrom = search?.get("duplicar") || null;
  const sourceId = id || duplicateFrom;

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(sourceId));
  const [ativo, setAtivo] = useState(true);
  const [fotos, setFotos] = useState<string[]>([]);
  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (!sourceId) return;
    (async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("*, estoque(quantidade,quantidade_minima)")
        .eq("id", sourceId)
        .maybeSingle();
      if (error) toast.error(traduzErro(error));
      if (data) {
        const est = (data as any).estoque?.[0];
        setAtivo(isEdit ? data.ativo : true);
        setFotos(isEdit ? (data.fotos || []) : (data.fotos || []));
        setForm({
          nome: isEdit ? data.nome : `${data.nome} (cópia)`,
          sku: isEdit ? data.sku ?? "" : "",
          ean: isEdit ? data.ean ?? "" : "",
          categoria: data.categoria ?? "",
          marca: data.marca ?? "",
          fornecedor: data.fornecedor ?? "",
          ncm: data.ncm ?? "",
          descricao: data.descricao ?? "",
          preco_venda: data.preco_venda?.toString() ?? "",
          preco_custo: data.preco_custo?.toString() ?? "",
          preco_atacado: data.preco_atacado?.toString() ?? "",
          estoque_inicial: isEdit ? (est?.quantidade?.toString() ?? "0") : "0",
          estoque_minimo: est?.quantidade_minima?.toString() ?? "0",
        });
      }
      setLoading(false);
    })();
  }, [sourceId, isEdit]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const margem =
    form.preco_venda && form.preco_custo && Number(form.preco_custo) > 0
      ? (((Number(form.preco_venda) - Number(form.preco_custo)) / Number(form.preco_venda)) * 100).toFixed(1)
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      nome: form.nome,
      sku: form.sku || undefined,
      ean: form.ean || undefined,
      categoria: form.categoria || undefined,
      marca: form.marca || undefined,
      fornecedor: form.fornecedor || undefined,
      ncm: form.ncm || undefined,
      descricao: form.descricao || undefined,
      preco_venda: Number(form.preco_venda || 0),
      preco_custo: form.preco_custo ? Number(form.preco_custo) : undefined,
      preco_atacado: form.preco_atacado ? Number(form.preco_atacado) : undefined,
      estoque_inicial: Number(form.estoque_inicial || 0),
      estoque_minimo: Number(form.estoque_minimo || 0),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Dados inválidos");
      return;
    }
    setSaving(true);
    const { data: lojaIdData, error: lojaErr } = await supabase.rpc("get_loja_id");
    const loja_id = lojaIdData as string | null;
    if (lojaErr || !loja_id) {
      setSaving(false);
      toast.error("Não foi possível identificar sua loja.");
      return;
    }

    const payload = {
      loja_id,
      nome: parsed.data.nome,
      sku: parsed.data.sku ?? null,
      ean: parsed.data.ean ?? null,
      categoria: parsed.data.categoria ?? null,
      marca: parsed.data.marca ?? null,
      fornecedor: parsed.data.fornecedor ?? null,
      ncm: parsed.data.ncm ?? null,
      descricao: parsed.data.descricao ?? null,
      preco_venda: parsed.data.preco_venda,
      preco_custo: parsed.data.preco_custo ?? 0,
      preco_atacado: parsed.data.preco_atacado ?? null,
      fotos,
      ativo,
    };

    if (isEdit && id) {
      const { error } = await supabase.from("produtos").update(payload).eq("id", id);
      if (error) { setSaving(false); return toast.error(traduzErro(error)); }
      // upsert estoque
      const { error: eErr } = await supabase
        .from("estoque")
        .upsert({
          loja_id,
          produto_id: id,
          deposito: "principal",
          quantidade: parsed.data.estoque_inicial,
          quantidade_minima: parsed.data.estoque_minimo,
        }, { onConflict: "loja_id,produto_id,deposito" });
      if (eErr) { setSaving(false); return toast.error(traduzErro(eErr)); }
      setSaving(false);
      toast.success("Produto atualizado!");
    } else {
      const { data: novo, error } = await supabase
        .from("produtos").insert(payload).select("id").single();
      if (error || !novo) { setSaving(false); return toast.error(traduzErro(error, "Erro")); }
      const { error: eErr } = await supabase.from("estoque").insert({
        loja_id,
        produto_id: novo.id,
        deposito: "principal",
        quantidade: parsed.data.estoque_inicial,
        quantidade_minima: parsed.data.estoque_minimo,
      });
      if (eErr) { setSaving(false); return toast.error(traduzErro(eErr)); }
      setSaving(false);
      toast.success("Produto cadastrado!");
    }
    navigate("/catalogo");
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link to="/catalogo" className="mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> voltar para catálogo
          </Link>
          <div className="mt-3">
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {isEdit ? "Edição" : duplicateFrom ? "Duplicação" : "Cadastro"}
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1">
              {isEdit ? "Editar produto" : "Novo produto"}
            </h1>
          </div>
        </div>

        {loading ? (
          <Card className="p-12 text-center mono text-sm text-muted-foreground">carregando…</Card>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="grid lg:grid-cols-2 gap-5">
              {/* Coluna esquerda */}
              <Card className="p-7 shadow-soft-sm space-y-5">
                <SectionTitle>Informações básicas</SectionTitle>
                <Field label="Nome do produto" required>
                  <Input value={form.nome} onChange={set("nome")} required maxLength={200} placeholder="Ex.: Camiseta básica preta" />
                </Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="SKU"><Input value={form.sku} onChange={set("sku")} maxLength={80} placeholder="CAM-PRT-001" className="mono" /></Field>
                  <Field label="EAN / código de barras"><Input value={form.ean} onChange={set("ean")} maxLength={80} placeholder="7891234567890" className="mono" /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Categoria"><Input value={form.categoria} onChange={set("categoria")} maxLength={80} placeholder="Vestuário" /></Field>
                  <Field label="Marca"><Input value={form.marca} onChange={set("marca")} maxLength={80} placeholder="Acme" /></Field>
                </div>
                <Field label="Fornecedor"><Input value={form.fornecedor} onChange={set("fornecedor")} maxLength={120} placeholder="Distribuidora XYZ" /></Field>
                <Field label="Descrição"><Textarea value={form.descricao} onChange={set("descricao")} maxLength={2000} rows={4} placeholder="Descreva o produto…" /></Field>
              </Card>

              {/* Coluna direita */}
              <Card className="p-7 shadow-soft-sm space-y-5">
                <SectionTitle>Preços e estoque</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Preço de venda (R$)" required>
                    <Input type="number" step="0.01" min="0" value={form.preco_venda} onChange={set("preco_venda")} required className="mono" />
                  </Field>
                  <Field label="Preço de custo (R$)">
                    <Input type="number" step="0.01" min="0" value={form.preco_custo} onChange={set("preco_custo")} className="mono" />
                  </Field>
                </div>
                <Field label="Preço de atacado (R$)">
                  <Input type="number" step="0.01" min="0" value={form.preco_atacado} onChange={set("preco_atacado")} className="mono" />
                </Field>
                {margem !== null && (
                  <div className="rounded-lg bg-primary-soft px-4 py-3 flex items-center justify-between">
                    <span className="mono text-[10px] uppercase tracking-widest text-primary">Margem calculada</span>
                    <span className="num font-bold text-primary text-lg">{margem}%</span>
                  </div>
                )}
                <div className="border-t border-border pt-5 grid sm:grid-cols-2 gap-4">
                  <Field label={isEdit ? "Estoque atual" : "Estoque inicial"}>
                    <Input type="number" min="0" step="0.001" value={form.estoque_inicial} onChange={set("estoque_inicial")} className="mono" />
                  </Field>
                  <Field label="Estoque mínimo">
                    <Input type="number" min="0" step="0.001" value={form.estoque_minimo} onChange={set("estoque_minimo")} className="mono" />
                  </Field>
                </div>
                <Field label="NCM"><Input value={form.ncm} onChange={set("ncm")} maxLength={20} placeholder="6109.10.00" className="mono" /></Field>
              </Card>
            </div>

            <Card className="p-7 shadow-soft-sm space-y-5">
              <SectionTitle>Fotos e status</SectionTitle>
              <ProductPhotosInput value={fotos} onChange={setFotos} max={5} />
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <Label className="text-base">Produto ativo</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Produtos inativos não aparecem na loja.</p>
                </div>
                <Switch checked={ativo} onCheckedChange={setAtivo} />
              </div>
            </Card>

            <div className="flex justify-end gap-3">
              <Link to="/catalogo"><Button type="button" variant="outline" className="h-11">Cancelar</Button></Link>
              <Button type="submit" disabled={saving} className="h-11 px-8">
                {saving ? "Salvando…" : isEdit ? "Salvar alterações" : "Salvar produto"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-lg font-bold tracking-tight">{children}</h2>
);

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-sm">{label} {required && <span className="text-primary">*</span>}</Label>
    {children}
  </div>
);

export default CatalogoNovo;
