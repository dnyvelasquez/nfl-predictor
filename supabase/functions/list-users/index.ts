// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*", // opcional: restringe a tu dominio de GH Pages
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    // 1) Autenticación del solicitante (usuario logueado)
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: me, error: meErr } = await authClient.auth.getUser();
    if (meErr || !me.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    // (Opcional) Autorizar solo admins
    // if (!me.user.email?.endsWith("@tu-dominio.com")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });

    // 2) Parámetros
    const url = new URL(req.url);
    const page    = Number(url.searchParams.get("page") ?? "1");
    const perPage = Math.min(100, Number(url.searchParams.get("perPage") ?? "20"));
    const q       = (url.searchParams.get("q") ?? "").toLowerCase().trim();

    // 3) Admin client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // listUsers admite paginación (page/perPage)
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });

    let users = data.users ?? [];
    if (q) {
      users = users.filter(u =>
        u.email?.toLowerCase().includes(q) ||
        (u.user_metadata?.full_name ?? "").toLowerCase().includes(q)
      );
    }

    return new Response(JSON.stringify({
      page, perPage, users: users.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at
      }))
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? "Error" }), { status: 500, headers: cors });
  }
});
