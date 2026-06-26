// Tradução de mensagens de erro comuns (Supabase Auth, PostgREST e storage) para PT-BR.
// Usar em toasts: toast.error(traduzErro(error))

type ErrorLike = { message?: string; code?: string; status?: number; error_description?: string } | string | null | undefined;

const MAP: Array<[RegExp, string]> = [
  // Estoque (trigger validar_estoque_disponivel)
  [/estoque insuficiente para "?([^":]+)"?:?\s*dispon[ií]vel\s*([\d.,]+),?\s*solicitado\s*([\d.,]+)/i,
    'Estoque insuficiente para "$1": disponível $2, solicitado $3.'],

  // Auth
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/invalid email or password/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "E-mail ainda não confirmado. Verifique sua caixa de entrada."],
  [/email link is invalid or has expired/i, "Link de e-mail inválido ou expirado."],
  [/user already registered/i, "Este e-mail já está cadastrado."],
  [/user not found/i, "Usuário não encontrado."],
  [/password should be at least (\d+) characters?/i, "A senha deve ter pelo menos $1 caracteres."],
  [/signup is disabled/i, "Cadastro desativado."],
  [/signups not allowed/i, "Cadastros não permitidos."],
  [/email rate limit exceeded/i, "Muitas tentativas. Aguarde um momento e tente novamente."],
  [/rate limit exceeded/i, "Limite de tentativas excedido. Aguarde um momento."],
  [/over_email_send_rate_limit/i, "Muitos e-mails enviados. Aguarde alguns minutos."],
  [/unable to validate email address/i, "Não foi possível validar este e-mail."],
  [/invalid email/i, "E-mail inválido."],
  [/weak password/i, "Senha muito fraca."],
  [/new password should be different/i, "A nova senha deve ser diferente da atual."],
  [/token has expired or is invalid/i, "Token inválido ou expirado."],
  [/jwt expired/i, "Sessão expirada. Faça login novamente."],
  [/refresh token not found/i, "Sessão expirada. Faça login novamente."],
  [/auth session missing/i, "Sessão não encontrada. Faça login novamente."],
  [/same as the old password/i, "A nova senha deve ser diferente da atual."],
  [/should be different from the old password/i, "A nova senha deve ser diferente da atual."],
  [/password is too short/i, "Senha muito curta."],
  [/password is known to be weak/i, "Esta senha é muito comum. Escolha uma mais segura."],
  [/code (verifier|challenge)/i, "Link inválido ou expirado. Solicite um novo e-mail de recuperação."],
  [/invalid (request|grant|code)/i, "Link inválido ou expirado. Solicite um novo e-mail de recuperação."],
  [/flow state (not found|expired)/i, "Link expirado. Solicite um novo e-mail de recuperação."],
  [/otp_expired|otp expired/i, "Código expirado. Solicite um novo e-mail de recuperação."],
  [/user not allowed/i, "Operação não permitida."],

  // PostgREST / banco
  [/duplicate key value violates unique constraint/i, "Registro duplicado."],
  [/violates foreign key constraint/i, "Operação inválida: existem registros relacionados."],
  [/violates not-null constraint/i, "Preencha todos os campos obrigatórios."],
  [/violates check constraint/i, "Valor inválido para um dos campos."],
  [/permission denied/i, "Sem permissão para esta operação."],
  [/row-level security/i, "Sem permissão para acessar este registro."],
  [/no rows returned/i, "Nenhum registro encontrado."],
  [/jwt|invalid token/i, "Sessão expirada. Faça login novamente."],

  // Rede
  [/failed to fetch/i, "Falha de conexão. Verifique sua internet."],
  [/network ?error/i, "Erro de rede. Tente novamente."],
  [/timeout/i, "Tempo esgotado. Tente novamente."],

  // Storage
  [/the resource already exists/i, "Este arquivo já existe."],
  [/payload too large/i, "Arquivo muito grande."],
  [/invalid file type/i, "Tipo de arquivo inválido."],
];

export function traduzErro(err: ErrorLike, fallback = "Ocorreu um erro. Tente novamente."): string {
  if (!err) return fallback;
  const raw =
    typeof err === "string"
      ? err
      : err.message || err.error_description || "";
  if (!raw) return fallback;
  for (const [re, pt] of MAP) {
    if (re.test(raw)) return raw.replace(re, pt);
  }
  return raw;
}