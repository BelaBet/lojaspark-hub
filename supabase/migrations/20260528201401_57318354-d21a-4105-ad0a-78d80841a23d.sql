
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS pagamento_status text NOT NULL DEFAULT 'pago';

-- Atualiza trigger de validação para incluir pagamento_status
CREATE OR REPLACE FUNCTION public.validar_venda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if new.status not in ('rascunho','concluida','cancelada') then
    raise exception 'status inválido: %', new.status;
  end if;
  if new.forma_pagamento is not null
     and new.forma_pagamento not in ('dinheiro','pix','cartao_debito','cartao_credito','misto') then
    raise exception 'forma_pagamento inválida: %', new.forma_pagamento;
  end if;
  if new.pagamento_status not in ('pendente','pago','falhou') then
    raise exception 'pagamento_status inválido: %', new.pagamento_status;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_validar_venda ON public.vendas;
CREATE TRIGGER trg_validar_venda
  BEFORE INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.validar_venda();

-- Realtime para Dashboard
ALTER TABLE public.vendas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendas;
