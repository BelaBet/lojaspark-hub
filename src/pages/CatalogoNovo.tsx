import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  stock: z.number().int().min(0),
  weight: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  depth: z.number().min(0).optional(),
  image_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});

const CatalogoNovo = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(true);
  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", category: "", description: "",
    price: "", cost: "", stock: "0",
    weight: "", height: "", width: "", depth: "", image_url: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const margin =
    form.price && form.cost && Number(form.cost) > 0
      ? (((Number(form.price) - Number(form.cost)) / Number(form.price)) * 100).toFixed(1)
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      name: form.name,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      category: form.category || undefined,
      description: form.description || undefined,
      price: Number(form.price || 0),
      cost: form.cost ? Number(form.cost) : undefined,
      stock: parseInt(form.stock || "0", 10),
      weight: form.weight ? Number(form.weight) : undefined,
      height: form.height ? Number(form.height) : undefined,
      width: form.width ? Number(form.width) : undefined,
      depth: form.depth ? Number(form.depth) : undefined,
      image_url: form.image_url || "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Dados inválidos");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      toast.error("Sessão expirada");
      return;
    }
    const payload = {
      ...parsed.data,
      image_url: parsed.data.image_url || null,
      margin: margin ? Number(margin) : null,
      is_active: active,
      user_id: userData.user.id,
    };
    const { error } = await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Produto cadastrado!");
    navigate("/catalogo");
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link to="/catalogo" className="mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> voltar para catálogo
          </Link>
          <div className="mt-3">
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Cadastro</span>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1">Novo produto</h1>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <Card className="p-7 shadow-soft-sm space-y-5">
            <SectionTitle>Informações básicas</SectionTitle>
            <Field label="Nome do produto" required>
              <Input value={form.name} onChange={set("name")} required maxLength={200} placeholder="Ex.: Camiseta básica preta" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="SKU"><Input value={form.sku} onChange={set("sku")} maxLength={80} placeholder="CAM-PRT-001" className="mono" /></Field>
              <Field label="Código de barras"><Input value={form.barcode} onChange={set("barcode")} maxLength={80} placeholder="7891234567890" className="mono" /></Field>
            </div>
            <Field label="Categoria"><Input value={form.category} onChange={set("category")} maxLength={80} placeholder="Vestuário" /></Field>
            <Field label="Descrição"><Textarea value={form.description} onChange={set("description")} maxLength={2000} rows={3} placeholder="Descreva o produto…" /></Field>
          </Card>

          <Card className="p-7 shadow-soft-sm space-y-5">
            <SectionTitle>Preço, custo e estoque</SectionTitle>
            <div className="grid sm:grid-cols-3 gap-5">
              <Field label="Preço de venda (R$)" required>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} required className="mono" />
              </Field>
              <Field label="Custo (R$)">
                <Input type="number" step="0.01" min="0" value={form.cost} onChange={set("cost")} className="mono" />
              </Field>
              <Field label="Estoque inicial" required>
                <Input type="number" min="0" value={form.stock} onChange={set("stock")} required className="mono" />
              </Field>
            </div>
            {margin !== null && (
              <div className="rounded-lg bg-primary-soft px-4 py-3 flex items-center justify-between">
                <span className="mono text-[10px] uppercase tracking-widest text-primary">Margem calculada</span>
                <span className="num font-bold text-primary text-lg">{margin}%</span>
              </div>
            )}
          </Card>

          <Card className="p-7 shadow-soft-sm space-y-5">
            <SectionTitle>Logística</SectionTitle>
            <div className="grid sm:grid-cols-4 gap-5">
              <Field label="Peso (kg)"><Input type="number" step="0.001" min="0" value={form.weight} onChange={set("weight")} className="mono" /></Field>
              <Field label="Altura (cm)"><Input type="number" step="0.01" min="0" value={form.height} onChange={set("height")} className="mono" /></Field>
              <Field label="Largura (cm)"><Input type="number" step="0.01" min="0" value={form.width} onChange={set("width")} className="mono" /></Field>
              <Field label="Profundidade (cm)"><Input type="number" step="0.01" min="0" value={form.depth} onChange={set("depth")} className="mono" /></Field>
            </div>
          </Card>

          <Card className="p-7 shadow-soft-sm space-y-5">
            <SectionTitle>Mídia e status</SectionTitle>
            <Field label="URL da imagem">
              <Input type="url" value={form.image_url} onChange={set("image_url")} maxLength={500} placeholder="https://…" />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label className="text-base">Produto ativo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Produtos inativos não aparecem na loja.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Link to="/catalogo"><Button type="button" variant="outline" className="h-11">Cancelar</Button></Link>
            <Button type="submit" disabled={saving} className="h-11 px-8">{saving ? "Salvando…" : "Salvar produto"}</Button>
          </div>
        </form>
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