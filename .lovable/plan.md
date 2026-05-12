## Objetivo

Adicionar um fluxo de **inicialização da loja** (onboarding) que aparece logo após o cadastro/login, antes do dashboard, para o lojista preencher os dados básicos da sua loja.

## Como funciona hoje

- Quando um usuário se cadastra, um trigger no banco já cria automaticamente uma loja chamada **"Minha Loja"** vinculada a ele.
- O usuário vai direto para `/dashboard`, sem nunca configurar nome real, telefone, CNPJ ou logo.

## Proposta

### 1. Marcar quando o onboarding foi concluído
Adicionar uma coluna `onboarding_completo` (boolean, default `false`) na tabela `lojas`. Assim conseguimos diferenciar loja recém-criada de loja já configurada — sem depender de heurísticas frágeis (tipo "nome = Minha Loja").

### 2. Nova página `/onboarding`
Página de boas-vindas com um formulário em **2 passos curtos**:

**Passo 1 — Identidade da loja**
- Nome da loja *(obrigatório)*
- Telefone / WhatsApp
- E-mail de contato (pré-preenchido com o do usuário)

**Passo 2 — Dados opcionais**
- CNPJ (com máscara)
- Logo da loja (upload — usa o bucket `product-images` ou novo bucket `logos`)
- Botão "Concluir e ir para o painel"

Ao concluir: salva os campos em `lojas`, marca `onboarding_completo = true` e redireciona para `/dashboard`.
Botão "Pular por enquanto" também marca como concluído (para não bloquear quem quer explorar antes).

### 3. Guarda de rota (redirect automático)
No `AppLayout` (que já protege as rotas autenticadas), adicionar uma checagem extra: se `lojas.onboarding_completo === false`, redirecionar para `/onboarding`. A página `/onboarding` em si fica fora desse redirect para evitar loop.

### 4. Visual
Mesmo padrão do `/login` — painel lateral com a marca **LojaHub** e o formulário ao lado. Indicador de progresso "Passo 1 de 2 / Passo 2 de 2". Totalmente responsivo (mobile-first, já que o preview atual é 390px).

## Detalhes técnicos

- **Migration:** `ALTER TABLE public.lojas ADD COLUMN onboarding_completo boolean NOT NULL DEFAULT false;`
- **Arquivos novos:**
  - `src/pages/Onboarding.tsx` — página com os 2 passos.
  - Rota `/onboarding` em `src/App.tsx`.
- **Arquivos editados:**
  - `src/components/AppLayout.tsx` — após validar sessão, buscar `lojas.onboarding_completo` via `get_loja_id()` e redirecionar se falso.
- **Upload do logo:** reaproveitar o bucket público `product-images` numa pasta `logos/{loja_id}/...` (evita criar bucket novo); salvar a URL em `lojas.logo_url`.
- **Validação:** zod no client (nome obrigatório, telefone formato BR opcional, CNPJ opcional com checagem de 14 dígitos).
- **Mensagens:** todas em PT-BR, seguindo o padrão dos toasts já usados no app.

## Fluxo final

```text
signup/login → AppLayout busca loja
                ├── onboarding_completo = false → /onboarding
                │       ├── Passo 1 → Passo 2 → salva → /dashboard
                │       └── "Pular" → marca concluído → /dashboard
                └── onboarding_completo = true  → /dashboard
```
