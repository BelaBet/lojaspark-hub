import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Upload, Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "url" | "upload" | "ai";

interface Props {
  value: string;
  onChange: (url: string) => void;
}

const TABS: { id: Mode; label: string; icon: typeof Link2 }[] = [
  { id: "url", label: "URL", icon: Link2 },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "ai", label: "Gerar com IA", icon: Sparkles },
];

export const ProductImageInput = ({ value, onChange }: Props) => {
  const [mode, setMode] = useState<Mode>("url");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB).");
      return;
    }
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setUploading(false);
      toast.error("Sessão expirada.");
      return;
    }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userData.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    onChange(pub.publicUrl);
    setUploading(false);
    toast.success("Imagem enviada!");
  };

  const generateWithAi = async () => {
    if (aiPrompt.trim().length < 3) {
      toast.error("Descreva o produto com mais detalhes.");
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
      // Convert base64 data URL to Blob and upload to storage
      const blob = await (await fetch(imageData)).blob();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const path = `${userData.user.id}/ai-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange(pub.publicUrl);
      toast.success("Imagem gerada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar imagem.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm">Imagem do produto</Label>

      {value && (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Pré-visualização do produto"
            className="h-32 w-32 object-cover rounded-lg border border-border bg-muted"
            onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-destructive transition-colors"
            aria-label="Remover imagem"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

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
                mode === t.id
                  ? "bg-background text-foreground shadow-soft-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {t.label}
              {t.id === "ai" && (
                <span className="mono text-[8px] px-1 py-0.5 rounded bg-primary-soft text-primary ml-0.5">
                  IA
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mode === "url" && (
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          placeholder="https://…"
        />
      )}

      {mode === "upload" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-11"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
            ) : (
              <><Upload className="h-4 w-4" /> Selecionar arquivo</>
            )}
          </Button>
          <p className="mono text-[10px] text-muted-foreground mt-2">
            JPG, PNG ou WEBP — máximo 5 MB
          </p>
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
    </div>
  );
};