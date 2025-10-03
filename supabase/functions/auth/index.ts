// @ts-ignore: Deno handles URL imports
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore: Deno handles URL imports
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
// @ts-ignore: Deno handles URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { action, nombre, contrasena } = await req.json();

  if (action === "register") {
    const hash = await bcrypt.hash(contrasena);
    const { error } = await supabase.from("usuarios").insert({
      nombre,
      contrasena: hash,
    });
    if (error)
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 400,
      });

    return new Response(
      JSON.stringify({ ok: true, message: "Usuario registrado" }),
      { status: 200 }
    );
  }

  if (action === "login") {
    const { data: user, error } = await supabase
      .from("usuarios")
      .select("id, nombre, contrasena")
      .eq("nombre", nombre)
      .single();

    if (error || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Usuario no encontrado" }),
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(contrasena, user.contrasena);
    if (!valid) {
      return new Response(
        JSON.stringify({ ok: false, error: "Contraseña incorrecta" }),
        { status: 401 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user: { id: user.id, nombre: user.nombre },
      }),
      { status: 200 }
    );
  }

  return new Response(
    JSON.stringify({ ok: false, error: "Acción no válida" }),
    { status: 400 }
  );
});
