import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Smartphone, Plus, Pencil, Trash2 } from "lucide-react";

type Maquininha = {
  id: string;
  nome: string;
  serial: string;
  localizacao: string | null;
  ativo: boolean;
  ultima_atividade: string | null;
};

type FormState = { nome: string; serial: string; localizacao: string; ativo: boolean };
const empty: FormState = { nome: "", serial: "", localizacao: "", ativo: true };

export function MaquininhasSection({ canEdit }: { canEdit: boolean }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Maquininha[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Maquininha | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Maquininha | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("maquininhas")
      .select("id,nome,serial,localizacao,ativo,ultima_atividade")
      .order("nome");
    if (error) toast.error("Erro ao carregar maquininhas");
    setItems((data ?? []) as Maquininha[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (m: Maquininha) => {
    setEditing(m);
    setForm({ nome: m.nome, serial: m.serial, localizacao: m.localizacao ?? "", ativo: m.ativo });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.nome.trim() || !form.serial.trim()) {
      toast.error("Nome e serial são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        serial: form.serial.trim(),
        localizacao: form.localizacao.trim() || null,
        ativo: form.ativo,
      };
      if (editing) {
        const { error } = await supabase.from("maquininhas").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Maquininha atualizada");
      } else {
        const { data: lojaId } = await supabase.rpc("get_loja_id");
        if (!lojaId) throw new Error("Loja não encontrada");
        const { error } = await supabase.from("maquininhas").insert({ ...payload, loja_id: lojaId });
        if (error) throw error;
        toast.success("Maquininha cadastrada");
      }
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remover = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("maquininhas").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else { toast.success("Maquininha removida"); load(); }
    setToDelete(null);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Maquininhas (POS)</h2>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nova
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Cadastre as maquininhas Pagar.me Connect (Stone/Pagar.me POS) da loja para usar no PDV.
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          Nenhuma maquininha cadastrada.
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{m.nome}</span>
                  {m.ativo ? (
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">ativa</Badge>
                  ) : (
                    <Badge variant="outline">inativa</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">{m.serial}</div>
                {m.localizacao && (
                  <div className="text-xs text-muted-foreground truncate">{m.localizacao}</div>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(m)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(m)} aria-label="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar maquininha" : "Nova maquininha"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="m-nome">Nome *</Label>
              <Input id="m-nome" value={form.nome} maxLength={60}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Caixa 01" />
            </div>
            <div>
              <Label htmlFor="m-serial">Serial *</Label>
              <Input id="m-serial" value={form.serial} maxLength={40}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
                placeholder="PB09243375086" className="mono" />
            </div>
            <div>
              <Label htmlFor="m-loc">Localização</Label>
              <Input id="m-loc" value={form.localizacao} maxLength={80}
                onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                placeholder="Loja Principal" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="m-ativo" className="cursor-pointer">Ativa</Label>
                <p className="text-xs text-muted-foreground">Disponível para cobranças no PDV</p>
              </div>
              <Switch id="m-ativo" checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover maquininha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{toDelete?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}