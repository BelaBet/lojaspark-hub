## Diagnóstico

Cruzando código + banco, identifiquei **dois problemas independentes** que juntos explicam por que as capturas não acontecem:

### 1. Split nunca é enviado (recipient null)
- A loja "Igreja Batista da Lagoinha" tem `pagarme_recipient_id = re_cmpcr534o9me40l9ti0cnqz6e` cadastrado.
- Mas todas as 41 vendas POS recentes ficaram com `seller_recipient_id = null` e `split_rules = null`.
- Causa: `src/pages/Vendas.tsx:141` faz `supabase.from("lojas").select("pagarme_recipient_id").maybeSingle()`, porém a RLS `lojas_select` só libera leitura para **admin ou gerente**. Se quem opera o PDV é `vendedor`, a query devolve `null` silenciosamente — e o PDV envia a cobrança sem split.

### 2. Webhook Pagar.me não está chegando
- A tabela `webhook_logs` está completamente vazia, mesmo após 41 vendas POS hoje.
- Como `charge.authorized` nunca chega na edge function, a captura automática (com split) nunca é disparada → as vendas ficam eternamente `pendente`.
- Você confirmou que o webhook está cadastrado no painel, então o problema é configuração externa (URL, eventos, ambiente ou credenciais Basic Auth) — não dá pra corrigir só por código. Preciso de um diagnóstico ao vivo.

---

## Plano

### Parte A — Expor `pagarme_recipient_id` a qualquer membro da loja (corrige o split)

Criar uma função SQL `SECURITY DEFINER` que retorna apenas o recipient da loja do usuário logado, e usá-la no PDV.

```sql
create or replace function public.get_loja_pagarme_recipient()
returns text
language sql stable security definer set search_path = public
as $$
  select pagarme_recipient_id from public.lojas where id = public.get_loja_id();
$$;
grant execute on function public.get_loja_pagarme_recipient() to authenticated;
```

Em `src/pages/Vendas.tsx` (linha 141 / 144), trocar a leitura direta de `lojas` por:
```ts
const { data: recipient } = await supabase.rpc("get_loja_pagarme_recipient");
setSellerRecipientId((recipient as string | null) ?? null);
```

Isso garante que **vendedor, gerente e admin** todos enxerguem o recipient — sem afetar a RLS atual de `lojas` (que continua restrita a admin/gerente para o resto dos campos).

### Parte B — Diagnóstico do webhook (sem mudança de código)

Vou rodar duas verificações comigo dirigindo e te peço para conferir no painel Pagar.me:

1. **Pingar a função com Basic Auth correto** via `curl_edge_functions`, simulando um payload `charge.authorized`. Se a função responder 200 e gravar em `webhook_logs`, confirmamos que a edge function está saudável e que o problema é exclusivamente no painel.
2. **Conferir no painel Pagar.me** (você):
   - URL exata: `https://ujopuhxmmykakxdjemlw.supabase.co/functions/v1/pagarme-webhook`
   - Eventos marcados: `charge.authorized`, `charge.paid`, `charge.payment_failed`, `order.paid`, `order.payment_failed`
   - Tipo de autenticação: **Basic Auth** com `PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASS` exatamente iguais aos secrets do projeto.
   - Ambiente correto (a chave `PAGARME_SECRET_KEY` é produção ou sandbox? O webhook precisa estar no mesmo ambiente).
   - Ver a aba de **histórico de entregas** do webhook — se o Pagar.me está tentando enviar e levando erro (4xx/5xx), isso prova de qual lado está o problema.

Depois desse diagnóstico, faço a próxima venda de teste e validamos:
- `webhook_logs` recebe `charge.authorized`
- Captura automática roda (`captureRes.ok`)
- `vendas.pagamento_status` vira `pago`, `split_rules` populado

### Não faz parte deste plano
- Mexer em `create-pos-order` ou no webhook (o código deles está correto; só falta o recipient chegar e o webhook ser entregue).
- Adicionar botão "Gerar PIX" no PDV (assunto separado da mensagem anterior, podemos retomar depois).

---

## Resumo dos arquivos tocados
- **Nova migração**: cria `public.get_loja_pagarme_recipient()` + grant.
- **`src/pages/Vendas.tsx`**: troca leitura de `lojas` por `rpc("get_loja_pagarme_recipient")`.
