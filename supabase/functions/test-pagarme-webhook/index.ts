// Edge function para super_admins testarem se a Basic Auth do webhook Pagar.me
// está aceitando determinadas credenciais. Faz um POST sintético no próprio
// webhook e retorna status + corpo da resposta.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supaUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isSuper } = await supaUser.rpc("is_super_admin");
    if (isSuper !== true) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const user = (body?.user ?? "").toString();
    const pass = (body?.pass ?? "").toString();
    if (!user || !pass) {
      return new Response(JSON.stringify({ error: "user/pass obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/pagarme-webhook`;
    const basic = btoa(`${user}:${pass}`);
    const synthetic = {
      type: "__test__",
      data: { _origin: "admin-webhook-tester", at: new Date().toISOString() },
    };
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(synthetic),
    });
    const text = await res.text();

    return new Response(
      JSON.stringify({
        webhook_url: webhookUrl,
        sent_auth: `Basic ${basic.slice(0, 6)}…`,
        status: res.status,
        ok: res.ok,
        auth_ok: res.status !== 401,
        response: text.slice(0, 500),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});