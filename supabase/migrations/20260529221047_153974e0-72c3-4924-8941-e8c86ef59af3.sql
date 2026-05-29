
-- =====================================================================
-- 1. STORAGE POLICIES — scope by loja membership instead of auth.uid()
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own product images" ON storage.objects;
DROP POLICY IF EXISTS product_images_owner_select ON storage.objects;
DROP POLICY IF EXISTS produtos_owner_select ON storage.objects;
DROP POLICY IF EXISTS produtos_user_delete ON storage.objects;
DROP POLICY IF EXISTS produtos_user_insert ON storage.objects;
DROP POLICY IF EXISTS produtos_user_update ON storage.objects;

-- product-images bucket: members of the loja (folder = loja_id) can manage
CREATE POLICY product_images_loja_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY product_images_loja_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY product_images_loja_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'product-images' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY product_images_loja_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);

-- produtos bucket: same rules
CREATE POLICY produtos_loja_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'produtos' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY produtos_loja_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'produtos' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY produtos_loja_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'produtos' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'produtos' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY produtos_loja_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'produtos' AND EXISTS (
    SELECT 1 FROM public.loja_usuarios lu
    WHERE lu.user_id = auth.uid()
      AND lu.loja_id::text = (storage.foldername(name))[1]
  )
);

-- =====================================================================
-- 2. VENDAS — block 'vendedor' from changing financial fields
-- =====================================================================
CREATE OR REPLACE FUNCTION public.vendas_protect_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  is_gerente boolean;
BEGIN
  is_admin := public.has_loja_role(NEW.loja_id, 'admin');
  is_gerente := public.has_loja_role(NEW.loja_id, 'gerente');
  IF is_admin OR is_gerente THEN
    RETURN NEW;
  END IF;
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

DROP TRIGGER IF EXISTS trg_vendas_protect_financial_fields ON public.vendas;
CREATE TRIGGER trg_vendas_protect_financial_fields
BEFORE UPDATE ON public.vendas
FOR EACH ROW
EXECUTE FUNCTION public.vendas_protect_financial_fields();
