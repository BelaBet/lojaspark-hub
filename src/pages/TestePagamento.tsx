import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import {
  Loader2, QrCode, CreditCard, CheckCircle2, XCircle, Clock,
  Copy, Check, ExternalLink, RefreshCw, AlertTriangle,
} from "lucide-react";

/**
 * Página de teste do pipeline de pagamento (PIX + Cartão) em homologação.
 * - Cria uma `venda` real (pagamento_status=pendente) + order no Pagar.me.
 * - Faz polling em `check-pos-order-status` até virar `pago` com split aplicado.
 * - Mostra a timeline e o resultado financeiro detalhado.
 */

type Step = {
  ts: string;
  label: string;
  detail?: string;
  kind: "info" | "ok" | "warn" | "err";
};

type OrderResult = {
  order_id: string;
  status: string;
  charge_status?: string | null;
  amount: number;
  base_amount: number;
  platform_amount: number;
  seller_amount: number;
  split_applied: boolean;
  pix_qr_code?: string | null;
  pix_qr_code_url?: string | null;
};

const TEST_CARDS = [
  { id: "approved", label: "Aprovado (Visa)", number: "4000000000000010", cvv: "123" },
  { id: "approved_master", label: "Aprovado (Master)", number: "5555555555554444", cvv: "123" },
  { id: "declined", label: "Recusado", number: "4000000000000028", cvv: "123" },
  { id: "antifraud", label: "Em análise", number: "4000000000000044", cvv: "123" },
] as const;

const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 40; // ~2 min

export default function TestePagamento() {
  const [recipient, setRecipient] = useState<string | null>(null);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // PIX
  const [pixAmount, setPixAmount] = useState("1,00");
  const [pixLoading, setPixLoading] = useState(false);
  const [pixResult, setPixResult] = useState<OrderResult | null>(null);
  const [pixVendaId, setPixVendaId] = useState<string | null>(null);
  const [pixSteps, setPixSteps] = useState<Step[]>([]);
  const [pixFinal, setPixFinal] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pixTimerRef = useRef<number | null>(null);

  // Cartão
  const [cardAmount, setCardAmount] = useState("10,00");
  const [cardChoice, setCardChoice] = useState<typeof TEST_CARDS[number]["id"]>("approved");
  const [cardInstallments, setCardInstallments] = useState(1);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardResult, setCardResult] = useState<OrderResult | null>(null);
  const [cardVendaId, setCardVendaId] = useState<string | null>(null);
  const [cardSteps, setCardSteps] = useState<Step[]>([]);
  const [cardFinal, setCardFinal] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: rec }, { data: lid }] = await Promise.all([
        supabase.rpc("get_loja_pagarme_recipient"),
        supabase.rpc("get_loja_id"),
      ]);
      setRecipient((rec as string | null) ?? null);
      setLojaId((lid as string | null) ?? null);
      setLoadingMeta(false);
    })();
    return () => {
      if (pixTimerRef.current) window.clearTimeout(pixTimerRef.current);
    };
  }, []);

  const parseAmount = (s: string): number => {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  };

  const pushStep = (
    setter: React.Dispatch<React.SetStateAction<Step[]>>,
    step: Omit<Step, "ts">,
  ) => {
    const ts = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setter((prev) => [...prev, { ...step, ts }]);
  };

  const criarVenda = async (params: {
    forma_pagamento: "pix" | "cartao_credito";
    total: number;
    order: OrderResult;
    paid: boolean;
    installments?: number;
  }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!lojaId) throw new Error("Loja não identificada");
    const { data, error } = await supabase
      .from("vendas")
      .insert({
        loja_id: lojaId,
        vendedor_id: userData.user?.id ?? null,
        vendedor_nome: "Teste de pagamento",
        total: params.total,
        desconto: 0,
        forma_pagamento: params.forma_pagamento,
        status: "concluida",
        pagarme_order_id: params.order.order_id,
        pagamento_status: params.paid ? "pago" : "pendente",
        base_amount: params.order.base_amount,
        platform_amount: params.order.platform_amount,
        seller_amount: params.order.seller_amount,
        installments: params.installments ?? null,
        seller_recipient_id: recipient,
        payment_channel: "online",
        observacoes: "Venda gerada pelo teste de homologação",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Erro ao criar venda");
    return data.id as string;
  };

  // ---------- PIX ----------
  const gerarPix = async () => {
    const amount = parseAmount(pixAmount);
    if (!amount) return toast.error("Valor inválido");
    if (!recipient) return toast.error("Loja sem recipient cadastrado");
    setPixLoading(true);
    setPixSteps([]);
    setPixResult(null);
    setPixVendaId(null);
    setPixFinal(null);
    if (pixTimerRef.current) window.clearTimeout(pixTimerRef.current);

    try {
      pushStep(setPixSteps, { kind: "info", label: "Criando order no Pagar.me…", detail: `${brl(amount / 100)} • PIX` });
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          payment_method: "pix",
          amount,
          customer: { name: "Cliente Teste", email: "teste@homolog.local", document: "00000000000" },
          seller_recipient_id: recipient,
          pass_surcharge_to_customer: false,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const r = data as OrderResult;
      setPixResult(r);
      pushStep(setPixSteps, {
        kind: "ok",
        label: `Order criada: ${r.order_id}`,
        detail: `Split aplicado: ${r.split_applied ? "sim" : "não"} • Plataforma ${brl(r.platform_amount / 100)} • Loja ${brl(r.seller_amount / 100)}`,
      });
      const vendaId = await criarVenda({
        forma_pagamento: "pix",
        total: r.amount / 100,
        order: r,
        paid: false,
      });
      setPixVendaId(vendaId);
      pushStep(setPixSteps, { kind: "ok", label: `Venda criada (pendente): ${vendaId.slice(0, 8)}…` });
      pushStep(setPixSteps, { kind: "info", label: "Aguardando pagamento — fará polling a cada 3s." });
      startPolling(vendaId, "pix");
    } catch (e: any) {
      pushStep(setPixSteps, { kind: "err", label: "Falha", detail: e.message ?? String(e) });
      toast.error(e.message ?? "Erro ao gerar PIX");
    } finally {
      setPixLoading(false);
    }
  };

  // ---------- Cartão ----------
  const cobrarCartao = async () => {
    const amount = parseAmount(cardAmount);
    if (!amount) return toast.error("Valor inválido");
    if (!recipient) return toast.error("Loja sem recipient cadastrado");
    const tc = TEST_CARDS.find((c) => c.id === cardChoice)!;
    setCardLoading(true);
    setCardSteps([]);
    setCardResult(null);
    setCardVendaId(null);
    setCardFinal(null);

    try {
      pushStep(setCardSteps, {
        kind: "info",
        label: `Cobrando ${tc.label}…`,
        detail: `${brl(amount / 100)} • ${cardInstallments}×`,
      });
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          payment_method: "credit_card",
          amount,
          customer: { name: "Cliente Teste", email: "teste@homolog.local", document: "00000000000" },
          seller_recipient_id: recipient,
          pass_surcharge_to_customer: true,
          card: {
            number: tc.number,
            holder_name: "TESTE HOMOLOG",
            exp_month: 12,
            exp_year: 2030,
            cvv: tc.cvv,
            installments: cardInstallments,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const r = data as OrderResult;
      setCardResult(r);
      const paid = r.charge_status === "paid" || r.status === "paid";
      const authorized = r.charge_status === "authorized";
      pushStep(setCardSteps, {
        kind: paid ? "ok" : authorized ? "warn" : "err",
        label: `Resposta: ${r.charge_status ?? r.status}`,
        detail: `Total ${brl(r.amount / 100)} • Split: ${r.split_applied ? "sim" : "não"} • Plataforma ${brl(r.platform_amount / 100)} • Loja ${brl(r.seller_amount / 100)}`,
      });
      const vendaId = await criarVenda({
        forma_pagamento: "cartao_credito",
        total: r.amount / 100,
        order: r,
        paid,
        installments: cardInstallments,
      });
      setCardVendaId(vendaId);
      pushStep(setCardSteps, {
        kind: paid ? "ok" : "info",
        label: `Venda criada (${paid ? "pago" : "pendente"}): ${vendaId.slice(0, 8)}…`,
      });
      if (paid) {
        setCardFinal("pago");
      } else if (r.charge_status === "failed" || r.charge_status === "not_authorized") {
        setCardFinal("falhou");
        pushStep(setCardSteps, { kind: "err", label: "Pagamento recusado pelo emissor." });
      } else {
        pushStep(setCardSteps, { kind: "info", label: "Iniciando polling até virar pago…" });
        startPolling(vendaId, "card");
      }
    } catch (e: any) {
      pushStep(setCardSteps, { kind: "err", label: "Falha", detail: e.message ?? String(e) });
      toast.error(e.message ?? "Erro no cartão");
    } finally {
      setCardLoading(false);
    }
  };

  // ---------- Polling compartilhado ----------
  const startPolling = (vendaId: string, target: "pix" | "card") => {
    const setter = target === "pix" ? setPixSteps : setCardSteps;
    const setFinal = target === "pix" ? setPixFinal : setCardFinal;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      try {
        const { data, error } = await supabase.functions.invoke("check-pos-order-status", {
          body: { venda_id: vendaId },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        const cs = data?.charge_status ?? "-";
        const ps = data?.pagamento_status ?? "-";
        const cap = data?.capture_attempted
          ? ` • captura: ${data.capture_ok ? "OK" : "falhou"}`
          : "";
        pushStep(setter, {
          kind: ps === "pago" ? "ok" : ps === "falhou" ? "err" : "info",
          label: `Poll #${attempts} — charge=${cs} • pagamento=${ps}${cap}`,
        });
        if (ps === "pago") {
          setFinal("pago");
          return;
        }
        if (ps === "falhou") {
          setFinal("falhou");
          return;
        }
        if (attempts >= POLL_MAX) {
          pushStep(setter, { kind: "warn", label: "Limite de polls atingido. Pare e verifique manualmente." });
          setFinal("timeout");
          return;
        }
        pixTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e: any) {
        pushStep(setter, { kind: "err", label: "Erro no poll", detail: e.message ?? String(e) });
        if (attempts < POLL_MAX) pixTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    pixTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
  };

  const copyPix = async () => {
    if (!pixResult?.pix_qr_code) return;
    await navigator.clipboard.writeText(pixResult.pix_qr_code);
    setPixCopied(true);
    toast.success("Código PIX copiado");
    setTimeout(() => setPixCopied(false), 2000);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Diagnóstico
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Teste de pagamento (homologação)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cria uma venda real, dispara PIX ou cartão no Pagar.me e acompanha o ciclo até
            confirmar <code className="mono">pagamento_status = pago</code> com split aplicado.
          </p>
        </header>

        <Card className="p-4 space-y-2">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Recipient da loja:</span>{" "}
              {loadingMeta ? (
                <Loader2 className="inline h-3 w-3 animate-spin" />
              ) : recipient ? (
                <code className="mono">{recipient}</code>
              ) : (
                <Badge variant="destructive">não configurado</Badge>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Loja:</span>{" "}
              <code className="mono">{lojaId ? lojaId.slice(0, 8) + "…" : "-"}</code>
            </div>
          </div>
          {!recipient && !loadingMeta && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Cadastre o <code className="mono">pagarme_recipient_id</code> na loja em Configurações antes de testar.
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Ambiente é definido pela chave <code className="mono">PAGARME_SECRET_KEY</code>:
            chaves <code className="mono">sk_test_*</code> usam sandbox (cartões de teste abaixo).
          </p>
        </Card>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* PIX */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">PIX</h2>
              {pixFinal && <FinalBadge value={pixFinal} />}
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Valor</Label>
                <Input
                  value={pixAmount}
                  onChange={(e) => setPixAmount(e.target.value)}
                  className="mono"
                  inputMode="decimal"
                  disabled={pixLoading || !!pixResult}
                />
              </div>
              <Button onClick={gerarPix} disabled={pixLoading || !recipient || !!pixResult} className="h-10">
                {pixLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                Gerar PIX
              </Button>
            </div>

            {pixResult?.pix_qr_code_url && (
              <div className="space-y-2">
                <div className="flex justify-center bg-white p-3 rounded-lg border">
                  <img src={pixResult.pix_qr_code_url} alt="QR PIX" className="h-48 w-48" />
                </div>
                <div className="flex gap-2">
                  <Input value={pixResult.pix_qr_code ?? ""} readOnly className="mono text-xs" />
                  <Button variant="outline" size="icon" onClick={copyPix}>
                    {pixCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <Timeline steps={pixSteps} />

            <Footer vendaId={pixVendaId} onReset={pixResult ? () => {
              setPixResult(null); setPixVendaId(null); setPixSteps([]); setPixFinal(null);
              if (pixTimerRef.current) window.clearTimeout(pixTimerRef.current);
            } : undefined} />
          </Card>

          {/* Cartão */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">Cartão de crédito</h2>
              {cardFinal && <FinalBadge value={cardFinal} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Valor</Label>
                <Input
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  className="mono"
                  inputMode="decimal"
                  disabled={cardLoading || !!cardResult}
                />
              </div>
              <div>
                <Label>Parcelas</Label>
                <Select
                  value={String(cardInstallments)}
                  onValueChange={(v) => setCardInstallments(Number(v))}
                  disabled={cardLoading || !!cardResult}
                >
                  <SelectTrigger className="mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 12].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}×</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Cartão de teste</Label>
                <Select
                  value={cardChoice}
                  onValueChange={(v) => setCardChoice(v as typeof cardChoice)}
                  disabled={cardLoading || !!cardResult}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEST_CARDS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label} — <span className="mono ml-1">{c.number}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={cobrarCartao} disabled={cardLoading || !recipient || !!cardResult} className="w-full h-10">
              {cardLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Cobrar cartão
            </Button>

            {cardResult && (
              <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                <Row k="Status charge" v={cardResult.charge_status ?? "-"} />
                <Row k="Base" v={brl(cardResult.base_amount / 100)} />
                <Row k="Total cobrado" v={brl(cardResult.amount / 100)} />
                <Row k="Plataforma" v={brl(cardResult.platform_amount / 100)} />
                <Row k="Loja recebe" v={brl(cardResult.seller_amount / 100)} />
                <Row k="Split aplicado" v={cardResult.split_applied ? "sim" : "não"} />
              </div>
            )}

            <Timeline steps={cardSteps} />

            <Footer vendaId={cardVendaId} onReset={cardResult ? () => {
              setCardResult(null); setCardVendaId(null); setCardSteps([]); setCardFinal(null);
            } : undefined} />
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function Timeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-1.5 max-h-72 overflow-y-auto">
      {steps.map((s, i) => {
        const Icon =
          s.kind === "ok" ? CheckCircle2 :
          s.kind === "err" ? XCircle :
          s.kind === "warn" ? AlertTriangle : Clock;
        const color =
          s.kind === "ok" ? "text-emerald-500" :
          s.kind === "err" ? "text-destructive" :
          s.kind === "warn" ? "text-amber-500" : "text-muted-foreground";
        return (
          <div key={i} className="flex items-start gap-2 text-xs">
            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
            <span className="mono text-muted-foreground">{s.ts}</span>
            <div className="flex-1">
              <div className="font-medium">{s.label}</div>
              {s.detail && <div className="text-muted-foreground">{s.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="num font-medium">{v}</span>
    </div>
  );
}

function FinalBadge({ value }: { value: string }) {
  if (value === "pago") return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">pago</Badge>;
  if (value === "falhou") return <Badge variant="destructive">falhou</Badge>;
  return <Badge variant="outline">{value}</Badge>;
}

function Footer({ vendaId, onReset }: { vendaId: string | null; onReset?: () => void }) {
  if (!vendaId && !onReset) return null;
  return (
    <div className="flex items-center justify-between pt-1">
      {vendaId ? (
        <Link to={`/vendas/${vendaId}/recibo`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> abrir recibo
        </Link>
      ) : <span />}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RefreshCw className="h-3 w-3 mr-1" /> Novo teste
        </Button>
      )}
    </div>
  );
}