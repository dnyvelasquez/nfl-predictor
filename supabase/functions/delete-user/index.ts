// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: me, error: meErr } = await authClient.auth.getUser();
    if (meErr || !me.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    // (Opcional) Regla de admin
    // if (!me.user.email?.endsWith("@tu-dominio.com")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });

    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: "userId requerido" }), { status: 400, headers: cors });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? "Error" }), { status: 500, headers: cors });
  }
});
