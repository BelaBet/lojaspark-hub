import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "or_klRQkdNtX1UjqE6M";
  const secretKey = Deno.env.get("PAGARME_SECRET_KEY")!;
  const res = await fetch(`https://api.pagar.me/core/v5/orders/${orderId}`, {
    headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
  });
  const data = await res.json();
  return new Response(JSON.stringify({ httpStatus: res.status, order: data }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});