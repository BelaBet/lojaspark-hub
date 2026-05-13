import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Store, ArrowRight, ArrowLeft, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { traduzErro } from "@/lib/errors";

const formatTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
};

const formatCnpj = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

function validarCnpj(cnpj: string): { valido: boolean; erro?: string } {
  const d = cnpj.replace(/\D/g, "");
  if (!d) return { valido: true };
  if (d.length !== 14) return { valido: false, erro: "CNPJ incompleto. Digite os 14 números." };
  if (/^(\d)\1{13}$/.test(d)) return { valido: false, erro: "CNPJ inválido (todos os dígitos iguais)." };

  const calcDig = (base: string, pesos: number[]) =>
    pesos.reduce((s, p, i) => s + parseInt(base[i]) * p, 0);

  const d1 = calcDig(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const r1 = 11 - (d1 % 11);
  const dig1 = r1 > 9 ? 0 : r1;

  const d2 = calcDig(d.slice(0, 12) + dig1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const r2 = 11 - (d2 % 11);
  const dig2 = r2 > 9 ? 0 : r2;

  if (dig1 !== parseInt(d[12]) || dig2 !== parseInt(d[13])) {
    return { valido: false, erro: "CNPJ inválido. Verifique os números digitados." };
  }
  return { valido: true };
}

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [lojaId, setLojaId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cnpjErro, setCnpjErro] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate("/login", { replace: true });
        return;
      }
      setEmail(sess.session.user.email ?? "");
      const { data: loja } = await supabase
        .from("lojas")
        .select("id, nome, telefone, email, cnpj, logo_url, onboarding_completo")
        .maybeSingle();
      if (loja) {
        setLojaId(loja.id);
        if (loja.onboarding_completo) {
          navigate("/dashboard", { replace: true });
          return;
        }
        if (loja.nome && loja.nome !== "Minha Loja") setNome(loja.nome);
        if (loja.telefone) setTelefone(formatTelefone(loja.telefone));
        if (loja.email) setEmail(loja.email);
        if (loja.cnpj) setCnpj(formatCnpj(loja.cnpj));
        if (loja.logo_url) setLogoUrl(loja.logo_url);
      }
      setCarregando(false);
    })();
  }, [navigate]);

  const irParaPasso2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome da loja");
      return;
    }
    setStep(2);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lojaId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 2MB");
      return;
    }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `logos/${lojaId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    if (error) {
      setUploadingLogo(false);
      toast.error(traduzErro(error));
      return;
    }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    setUploadingLogo(false);
  };

  const salvar = async (pular = false) => {
    if (!lojaId) return;
    setLoading(true);
    const payload: {
      onboarding_completo: boolean;
      nome?: string;
      telefone?: string | null;
      email?: string | null;
      cnpj?: string | null;
      logo_url?: string;
    } = { onboarding_completo: true };
    if (!pular) {
      payload.nome = nome.trim();
      payload.telefone = telefone.replace(/\D/g, "") || null;
      payload.email = email.trim() || null;
      payload.cnpj = cnpj.replace(/\D/g, "") || null;
      if (logoUrl) payload.logo_url = logoUrl;
    }
    const { error } = await supabase.from("lojas").update(payload).eq("id", lojaId);
    setLoading(false);
    if (error) {
      toast.error(traduzErro(error));
      return;
    }
    toast.success(pular ? "Você pode configurar depois nas configurações." : "Loja configurada com sucesso!");
    navigate("/dashboard", { replace: true });
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="mono text-sm text-muted-foreground">carregando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background">
      <aside className="lg:w-2/5 bg-primary text-primary-foreground p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary-foreground/5 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary-foreground/15 flex items-center justify-center backdrop-blur">
            <Store className="h-6 w-6" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">LojaHub</span>
        </div>
        <div className="relative max-w-md mt-8 lg:mt-0">
          <span className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">
            Bem-vindo
          </span>
          <h1 className="font-display text-3xl lg:text-4xl font-bold leading-[1.1] tracking-tight mt-3">
            Vamos configurar <br />sua loja.
          </h1>
          <p className="mt-4 text-primary-foreground/80 text-sm leading-relaxed">
            Em menos de 2 minutos seu painel está pronto para vender. Você pode editar tudo depois.
          </p>
        </div>
        <div className="relative mono text-xs text-primary-foreground/50 hidden lg:block">© LojaHub · 2026</div>
      </aside>

      <main className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-surface">
        <Card className="w-full max-w-md p-6 sm:p-8 shadow-soft-md border-border">
          <div className="flex items-center justify-between mb-6">
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Passo {step} de 2
            </span>
            <div className="flex gap-1.5">
              <span className={`h-1.5 w-8 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
              <span className={`h-1.5 w-8 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            </div>
          </div>

          {step === 1 ? (
            <form onSubmit={irParaPasso2} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Identidade da loja</h2>
                <p className="text-sm text-muted-foreground mt-1">Como sua loja se apresenta aos clientes.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da loja *</Label>
                <Input id="nome" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Boutique da Ana" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tel">Telefone / WhatsApp</Label>
                <Input id="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(formatTelefone(e.target.value))} placeholder="(11) 90000-0000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail de contato</Label>
                <Input id="email" type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@loja.com" />
              </div>
              <Button type="submit" className="w-full h-11">
                Continuar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <button type="button" onClick={() => salvar(true)} disabled={loading} className="w-full text-sm text-muted-foreground hover:text-primary transition-colors mt-1">
                Pular por enquanto
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Quase lá</h2>
                <p className="text-sm text-muted-foreground mt-1">Dados opcionais, úteis para emissão fiscal e marca.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Logo da loja</Label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <label className="flex-1">
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    <span className="inline-flex w-full items-center justify-center gap-2 h-10 px-4 rounded-md border border-border bg-background text-sm font-medium cursor-pointer hover:bg-muted transition-colors">
                      <Upload className="h-4 w-4" />
                      {uploadingLogo ? "Enviando…" : logoUrl ? "Trocar logo" : "Enviar logo"}
                    </span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">PNG ou JPG, até 2MB.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading} className="h-11">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => salvar(false)}
                  disabled={loading || uploadingLogo}
                  className="flex-1 h-11 shadow-md hover:shadow-lg transition-shadow"
                >
                  {loading ? (
                    "Salvando…"
                  ) : (
                    <>
                      Finalizar configuração <Check className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => salvar(true)}
                disabled={loading}
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Pular por enquanto
              </button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Onboarding;