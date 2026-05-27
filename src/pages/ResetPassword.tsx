import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { traduzErro } from "@/lib/errors";
import BrandLogo from "@/components/BrandLogo";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Listener para o evento clássico (link com hash #access_token...)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setChecking(false);
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDesc = url.searchParams.get("error_description") || url.hash.includes("error");

        // Fluxo PKCE/novo: ?code=...
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!mounted) return;
          if (!error) {
            setReady(true);
            // Limpa a URL
            window.history.replaceState({}, "", "/reset-password");
          } else {
            toast.error(traduzErro(error));
          }
          setChecking(false);
          return;
        }

        // Fluxo antigo: #access_token=...&type=recovery (Supabase já processa sozinho)
        if (window.location.hash.includes("access_token")) {
          // Aguarda o onAuthStateChange disparar
          setTimeout(() => {
            if (mounted) setChecking(false);
          }, 1500);
          return;
        }

        if (errorDesc) {
          const desc = url.searchParams.get("error_description") || url.hash;
          toast.error(traduzErro(decodeURIComponent(desc)));
          setChecking(false);
          return;
        }

        // Sessão já existente (usuário voltou para a página)
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data.session) setReady(true);
        setChecking(false);
      } catch {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(traduzErro(error));
      return;
    }
    toast.success("Senha redefinida com sucesso!");
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-surface">
      <Card className="w-full max-w-md p-8 shadow-soft-md border-border">
        <div className="mb-6">
          <BrandLogo width={100} height={72} />
        </div>

        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Redefinição de senha</span>
        <h2 className="font-display text-3xl font-bold mt-2 tracking-tight mb-6">Nova senha</h2>

        {checking ? (
          <p className="text-sm text-muted-foreground">Validando link…</p>
        ) : !ready ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link inválido ou expirado. Solicite um novo e-mail de recuperação.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full h-11">
              Voltar ao login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="repita a nova senha"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 text-base">
              {loading ? "Salvando…" : "Redefinir senha"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};

export default ResetPassword;