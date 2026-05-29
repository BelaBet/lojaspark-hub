
CREATE OR REPLACE FUNCTION public.vendas_protect_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- service_role / system context (no auth.uid) is always allowed
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;
  -- admin or gerente of the loja can change anything
  IF public.has_loja_role(NEW.loja_id, 'admin')
     OR public.has_loja_role(NEW.loja_id, 'gerente') THEN
    RETURN NEW;
  END IF;
  -- vendedor (or any other role): block changes to financial fields
  IF NEW.split_rules IS DISTINCT FROM OLD.split_rules
     OR NEW.seller_recipient_id IS DISTINCT FROM OLD.seller_recipient_id
     OR NEW.pagarme_order_id IS DISTINCT FROM OLD.pagarme_order_id
     OR NEW.pagarme_charge_id IS DISTINCT FROM OLD.pagarme_charge_id
     OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
     OR NEW.platform_amount IS DISTINCT FROM OLD.platform_amount
     OR NEW.seller_amount IS DISTINCT FROM OLD.seller_amount
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Apenas admin ou gerente podem alterar campos financeiros da venda';
  END IF;
  RETURN NEW;
END;
$$;
