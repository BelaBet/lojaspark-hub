import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  calculateCreditSplit,
  calculateDebitSplit,
  calculatePixSplit,
  getInstallmentTable,
  formatBRL,
  PLATFORM_RATE_DEBIT,
  PLATFORM_RATE_CREDIT_AVISTA,
  PLATFORM_RATE_CREDIT_PARC,
  ANTICIPATION_RATE,
  PIX_PLATFORM_FEE_CENTS,
} from "@/lib/pagarme-split";
import { Calculator, Wallet, CreditCard, QrCode } from "lucide-react";

type Method = "pix" | "debit" | "credit";

export default function SimuladorSplit() {
  const [amountStr, setAmountStr] = useState("100,00");
  const [method, setMethod] = useState<Method>("credit");
  const [installments, setInstallments] = useState(1);
  const [anticipation, setAnticipation] = useState(true);
  const [passToCustomer, setPassToCustomer] = useState(true);

  const baseCents = useMemo(() => {
    const n = Number(amountStr.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amountStr]);

  const result = useMemo(() => {
    if (baseCents <= 0) return null;
    if (method === "pix")   return { kind: "pix"   as const, data: calculatePixSplit(baseCents) };
    if (method === "debit") return { kind: "debit" as const, data: calculateDebitSplit(baseCents, passToCustomer) };
    return { kind: "credit" as const, data: calculateCreditSplit(baseCents, installments, passToCustomer, anticipation) };
  }, [baseCents, method, installments, anticipation, passToCustomer]);

  const installmentTable = useMemo(
    () => (method === "credit" && baseCents > 0 ? getInstallmentTable(baseCents, 12, anticipation) : []),
    [method, baseCents, anticipation],
  );

  const ratePctLabel = (() => {
    if (method === "pix")   return `R$ ${(PIX_PLATFORM_FEE_CENTS / 100).toFixed(2)} fixo`;
    if (method === "debit") return `${(PLATFORM_RATE_DEBIT * 100).toFixed(2)}%`;
    const base = installments === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC;
    const total = base + (anticipation ? ANTICIPATION_RATE : 0);
    return `${(total * 100).toFixed(2)}%`;
  })();

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <header className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Simulador de Split</h1>
            <p className="text-sm text-muted-foreground">
              Calcule taxas e repasse com base no método de pagamento.
            </p>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[1fr,1fr]">
          {/* ─── Formulário ─── */}
          <Card className="p-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="valor">Valor base (R$)</Label>
              <Input
                id="valor"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="100,00"
                className="text-lg"
              />
              <p className="text-xs text-muted-foreground">
                Valor que o lojista quer receber (antes das taxas).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Método de pagamento</Label>
              <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="pix" className="gap-2">
                    <QrCode className="h-4 w-4" /> Pix
                  </TabsTrigger>
                  <TabsTrigger value="debit" className="gap-2">
                    <Wallet className="h-4 w-4" /> Débito
                  </TabsTrigger>
                  <TabsTrigger value="credit" className="gap-2">
                    <CreditCard className="h-4 w-4" /> Crédito
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {method === "credit" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="parcelas">Parcelas</Label>
                  <Select
                    value={String(installments)}
                    onValueChange={(v) => setInstallments(Number(v))}
                  >
                    <SelectTrigger id="parcelas"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}× {n === 1 ? "(à vista 30d)" : "parcelado"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label htmlFor="antec" className="cursor-pointer">Antecipação</Label>
                    <p className="text-xs text-muted-foreground">
                      Acrescenta {(ANTICIPATION_RATE * 100).toFixed(2)}% à taxa.
                    </p>
                  </div>
                  <Switch id="antec" checked={anticipation} onCheckedChange={setAnticipation} />
                </div>
              </>
            )}

            {method !== "pix" && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="repasse" className="cursor-pointer">Repassar taxa ao cliente</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ligado, o cliente paga {ratePctLabel} a mais.
                  </p>
                </div>
                <Switch id="repasse" checked={passToCustomer} onCheckedChange={setPassToCustomer} />
              </div>
            )}
          </Card>

          {/* ─── Breakdown ─── */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Breakdown</h2>
              <Badge variant="secondary">Taxa: {ratePctLabel}</Badge>
            </div>

            {!result ? (
              <p className="text-sm text-muted-foreground">
                Informe um valor válido para simular.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Valor base" value={formatBRL(baseCents)} />
                {result.kind === "pix" && (
                  <>
                    <Row
                      label={`Taxa Pix (fixa)`}
                      value={`+ ${formatBRL(PIX_PLATFORM_FEE_CENTS)}`}
                      muted
                    />
                    <Divider />
                    <Row label="Total cobrado do cliente" value={formatBRL(result.data.totalAmount)} bold />
                    <Row label="Plataforma recebe" value={formatBRL(result.data.platformAmount)} accent />
                    <Row label="Lojista recebe" value={formatBRL(result.data.sellerAmount)} accent />
                  </>
                )}

                {result.kind === "debit" && (
                  <>
                    {passToCustomer && (
                      <Row
                        label={`Taxa débito (${(PLATFORM_RATE_DEBIT * 100).toFixed(2)}%)`}
                        value={`+ ${formatBRL(result.data.totalAmount - baseCents)}`}
                        muted
                      />
                    )}
                    <Divider />
                    <Row label="Total cobrado do cliente" value={formatBRL(result.data.totalAmount)} bold />
                    <Row label="Plataforma recebe" value={formatBRL(result.data.platformAmount)} accent />
                    <Row label="Lojista recebe" value={formatBRL(result.data.sellerAmount)} accent />
                  </>
                )}

                {result.kind === "credit" && (
                  <>
                    {passToCustomer && (
                      <>
                        <Row
                          label={`Taxa crédito ${installments === 1 ? "1×" : `${installments}×`} (${((installments === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC) * 100).toFixed(2)}%)`}
                          value={`+ ${formatBRL(Math.round(baseCents * (installments === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC)))}`}
                          muted
                        />
                        {anticipation && (
                          <Row
                            label={`Antecipação (${(ANTICIPATION_RATE * 100).toFixed(2)}%)`}
                            value={`+ ${formatBRL(Math.round(baseCents * ANTICIPATION_RATE))}`}
                            muted
                          />
                        )}
                      </>
                    )}
                    <Divider />
                    <Row label="Total cobrado do cliente" value={formatBRL(result.data.totalAmount)} bold />
                    {installments > 1 && (
                      <Row
                        label={`Parcela (${installments}×)`}
                        value={formatBRL(Math.round(result.data.totalAmount / installments))}
                        muted
                      />
                    )}
                    <Row label="Plataforma recebe" value={formatBRL(result.data.platformAmount)} accent />
                    <Row label="Lojista recebe" value={formatBRL(result.data.sellerAmount)} accent />
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        {method === "credit" && baseCents > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Tabela de parcelas</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Antecipação {anticipation ? "ligada" : "desligada"} · taxa repassada ao cliente.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Parcelas</th>
                    <th className="py-2 pr-3">Por parcela</th>
                    <th className="py-2 pr-3">Total cobrado</th>
                    <th className="py-2 pr-3">Taxa</th>
                    <th className="py-2 pr-3">Acréscimo</th>
                  </tr>
                </thead>
                <tbody>
                  {installmentTable.map((row) => (
                    <tr
                      key={row.installments}
                      className={`border-b last:border-0 ${row.installments === installments ? "bg-primary/5" : ""}`}
                    >
                      <td className="py-2 pr-3 font-medium">{row.installments}×</td>
                      <td className="py-2 pr-3 num">{formatBRL(row.perInstallment)}</td>
                      <td className="py-2 pr-3 num">{formatBRL(row.totalAmount)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{(row.totalRate * 100).toFixed(2)}%</td>
                      <td className="py-2 pr-3 num text-muted-foreground">+ {formatBRL(row.feeAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function Row({
  label, value, bold, muted, accent,
}: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between ${bold ? "border-t pt-2 font-semibold" : ""} ${accent ? "text-primary" : ""}`}
    >
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
