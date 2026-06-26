
-- 1) get_loja_id honors session-level current loja
CREATE OR REPLACE FUNCTION public.get_loja_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  raw text;
  candidate uuid;
  found uuid;
BEGIN
  BEGIN
    raw := current_setting('app.current_loja_id', true);
  EXCEPTION WHEN OTHERS THEN
    raw := NULL;
  END;

  IF raw IS NOT NULL AND raw <> '' THEN
    BEGIN
      candidate := raw::uuid;
    EXCEPTION WHEN OTHERS THEN
      candidate := NULL;
    END;

    IF candidate IS NOT NULL THEN
      SELECT loja_id INTO found
      FROM public.loja_usuarios
      WHERE user_id = auth.uid() AND loja_id = candidate
      LIMIT 1;
      IF found IS NOT NULL THEN
        RETURN found;
      END IF;
    END IF;
  END IF;

  SELECT loja_id INTO found
  FROM public.loja_usuarios
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC, loja_id ASC
  LIMIT 1;

  RETURN found;
END;
$$;

-- helper to set the active loja for the current session/request
CREATE OR REPLACE FUNCTION public.set_current_loja(_loja_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _loja_id IS NULL THEN
    PERFORM set_config('app.current_loja_id', '', true);
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.loja_usuarios
    WHERE user_id = auth.uid() AND loja_id = _loja_id
  ) THEN
    RAISE EXCEPTION 'Usuário não pertence a esta loja';
  END IF;

  PERFORM set_config('app.current_loja_id', _loja_id::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_current_loja(uuid) TO authenticated;

-- 2) Movimentacoes_estoque: explicit admin-only DELETE policy
DROP POLICY IF EXISTS movimentacoes_delete ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_delete
ON public.movimentacoes_estoque
FOR DELETE
TO authenticated
USING (loja_id = public.get_loja_id() AND public.has_loja_role('admin'));

-- 3) Vendas update restricted to admin/gerente at policy level
DROP POLICY IF EXISTS vendas_update ON public.vendas;
CREATE POLICY vendas_update
ON public.vendas
FOR UPDATE
TO authenticated
USING (
  loja_id = public.get_loja_id()
  AND (public.has_loja_role('admin') OR public.has_loja_role('gerente'))
)
WITH CHECK (
  loja_id = public.get_loja_id()
  AND (public.has_loja_role('admin') OR public.has_loja_role('gerente'))
);
