import { traduzErro } from "@/lib/errors";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Upload, Sparkles, X, Loader2, ImagePlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "upload" | "url" | "ai";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}

const TABS: { id: Mode; label: string; icon: typeof Link2 }[] = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "url", label: "URL", icon: Link2 },
  { id: "ai", label: "Gerar com IA", icon: Sparkles },
];

const BUCKET = "produtos";

export const ProductPhotosInput = ({ value, onChange, max = 5 }: Props) => {
  const [mode, setMode] = useState<Mode>("upload");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photos = value || [];
  const canAddMore = photos.length < max;

  const addPhoto = (url: string) => {
    if (photos.length >= max) {
      toast.error(`Máximo de ${max} fotos.`);
      return;
    }
    onChange([...photos, url]);
  };

  const removePhoto = (idx: number) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setUploading(false);
      toast.error("Sessão expirada.");
      return;
    }
    const { data: lu } = await supabase
      .from("loja_usuarios")
      .select("loja_id")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!lu?.loja_id) {
      setUploading(false);
      toast.error("Loja não encontrada.");
      return;
    }
    let added = 0;
    for (const file of arr) {
      if (photos.length + added >= max) break;
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: não é uma imagem.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}: maior que 5 MB.`);
        continue;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${lu.loja_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        toast.error(traduzErro(error));
        continue;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange([...photos, ...(added > 0 ? [] : []), pub.publicUrl]);
      // Update local snapshot of photos for next iter
      photos.push(pub.publicUrl);
      added++;
    }
    setUploading(false);
    if (added > 0) toast.success(`${added} foto${added > 1 ? "s" : ""} enviada${added > 1 ? "s" : ""}!`);
  };

  const generateWithAi = async () => {
    if (aiPrompt.trim().length < 3) {
      toast.error("Descreva o produto com mais detalhes.");
      return;
    }
    if (!canAddMore) {
      toast.error(`Máximo de ${max} fotos.`);
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-product-image", {
        body: { prompt: aiPrompt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const imageData: string = data.image;
      const blob = await (await fetch(imageData)).blob();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const { data: lu } = await supabase
        .from("loja_usuarios")
        .select("loja_id")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!lu?.loja_id) throw new Error("Loja não encontrada.");
      const path = `${lu.loja_id}/ai-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      addPhoto(pub.publicUrl);
      setAiPrompt("");
      toast.success("Imagem gerada!");
    } catch (e) {
      toast.error(traduzErro(e, "Falha ao gerar imagem."));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm">Fotos do produto <span className="text-muted-foreground font-normal">({photos.length}/{max})</span></Label>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {photos.map((url, idx) => (
            <div key={url + idx} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
              <img src={url} alt={`foto ${idx + 1}`} className="h-full w-full object-cover" />
              {idx === 0 && (
                <div className="absolute bottom-1 left-1 mono text-[9px] uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                  capa
                </div>
              )}
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-foreground/90 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <>
          <div className="inline-flex rounded-lg border border-border p-1 bg-muted/50">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={cn(
                    "mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors",
                    mode === t.id ? "bg-background text-foreground shadow-soft-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                  {t.id === "ai" && (
                    <span className="mono text-[8px] px-1 py-0.5 rounded bg-primary-soft text-primary ml-0.5">IA</span>
                  )}
                </button>
              );
            })}
          </div>

          {mode === "upload" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
              }}
              className={cn(
                "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                dragOver ? "border-primary bg-primary-soft" : "border-border bg-muted/30"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm mt-3">
                Arraste fotos aqui ou{" "}
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-primary font-semibold hover:underline">
                  selecione do computador
                </button>
              </p>
              <p className="mono text-[10px] text-muted-foreground mt-2">JPG, PNG ou WEBP — máximo 5 MB cada</p>
              {uploading && (
                <div className="mt-3 inline-flex items-center gap-2 mono text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
                </div>
              )}
            </div>
          )}

          {mode === "url" && (
            <div className="flex gap-2">
              <Input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                maxLength={500}
                placeholder="https://…"
              />
              <Button
                type="button"
                onClick={() => {
                  if (!urlInput.trim()) return;
                  try { new URL(urlInput); } catch { return toast.error("URL inválida."); }
                  addPhoto(urlInput.trim());
                  setUrlInput("");
                }}
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          )}

          {mode === "ai" && (
            <div className="space-y-2 rounded-lg border border-border bg-primary-soft/30 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="mono text-[10px] uppercase tracking-widest text-primary font-bold">
                  Geração com IA
                </span>
              </div>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Ex.: camiseta básica preta de algodão, gola redonda, manga curta"
                className="bg-background"
              />
              <div className="flex items-center justify-between">
                <p className="mono text-[10px] text-muted-foreground">
                  Foto profissional, fundo branco
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={generating || aiPrompt.trim().length < 3}
                  onClick={generateWithAi}
                  className="h-9"
                >
                  {generating ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando…</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Gerar imagem</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Backwards-compat single-image API (não usado no catálogo novo, mas mantém para não quebrar imports antigos)
export const ProductImageInput = ({ value, onChange }: { value: string; onChange: (url: string) => void }) => {
  return (
    <ProductPhotosInput
      value={value ? [value] : []}
      onChange={(arr) => onChange(arr[0] || "")}
      max={1}
    />
  );
};
