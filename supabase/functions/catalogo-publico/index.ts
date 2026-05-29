// Edge function pública: retorna os produtos ativos de uma loja para o catálogo público.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const loja_id = url.searchParams.get("loja_id");
    if (!loja_id) {
      return new Response(JSON.stringify({ error: "loja_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: loja }, { data: produtos }] = await Promise.all([
      supabase
        .from("lojas")
        .select("id, nome, logo_url, telefone, cor_primaria, cor_secundaria")
        .eq("id", loja_id)
        .maybeSingle(),
      supabase
        .from("produtos")
        .select("id,nome,sku,categoria,preco_venda,fotos,descricao,estoque(quantidade)")
        .eq("loja_id", loja_id)
        .eq("ativo", true)
        .order("nome"),
    ]);

    if (!loja) {
      return new Response(JSON.stringify({ error: "Loja não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ loja, produtos: produtos ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("catalogo-publico error:", e);
    return new Response(JSON.stringify({ error: "Erro interno. Tente novamente." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});