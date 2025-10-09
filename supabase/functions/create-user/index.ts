// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }


    const { email, password, fullName } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email y password son requeridos" }), { status: 400, headers: cors });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      user_metadata: fullName ? { full_name: fullName } : undefined,
      email_confirm: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true, userId: data.user?.id }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? "Error" }), { status: 500, headers: cors });
  }
});
