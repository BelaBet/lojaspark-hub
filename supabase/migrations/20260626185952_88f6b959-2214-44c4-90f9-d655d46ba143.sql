
-- 1) Permitir status "reembolso_parcial"
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
  if new.pagamento_status not in ('pendente','pago','falhou','reembolso_parcial') then
    raise exception 'pagamento_status inválido: %', new.pagamento_status;
  end if;
  return new;
end;
$function$;

-- 2) Validar estoque disponível antes de inserir item de venda
CREATE OR REPLACE FUNCTION public.validar_estoque_disponivel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja_id uuid;
  v_disponivel numeric(10,3);
  v_nome_produto text;
BEGIN
  IF new.produto_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT loja_id INTO v_loja_id FROM public.vendas WHERE id = new.venda_id;

  SELECT COALESCE(SUM(quantidade), 0) INTO v_disponivel
  FROM public.estoque
  WHERE produto_id = new.produto_id AND loja_id = v_loja_id;

  IF v_disponivel < new.quantidade THEN
    SELECT nome INTO v_nome_produto FROM public.produtos WHERE id = new.produto_id;
    RAISE EXCEPTION 'Estoque insuficiente para "%": disponível %, solicitado %',
      COALESCE(v_nome_produto, new.produto_id::text), v_disponivel, new.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_estoque_disponivel ON public.venda_itens;
CREATE TRIGGER trg_validar_estoque_disponivel
  BEFORE INSERT ON public.venda_itens
  FOR EACH ROW EXECUTE FUNCTION public.validar_estoque_disponivel();

REVOKE EXECUTE ON FUNCTION public.validar_estoque_disponivel() FROM PUBLIC, anon, authenticated;
