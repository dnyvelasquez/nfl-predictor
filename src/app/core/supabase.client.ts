import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { environment } from '../../environments/environment';

// Claims del payload de un JWT, o null si no es un JWT legible.
function claimsJwt(token: string | null | undefined): Record<string, any> | null {
  const partes = (token ?? '').split('.');
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/** JWT de un usuario con sesión (no el token anónimo de Neon Auth, cuyo `sub`/`role` es 'anonymous'). */
function esJwtDeUsuario(token: string | null | undefined): token is string {
  const claims = claimsJwt(token);
  return !!claims && claims['sub'] !== 'anonymous' && claims['role'] !== 'anonymous';
}

// Token JWT del usuario con sesión, o null si no hay sesión.
async function tokenDeUsuario(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;
  if (esJwtDeUsuario(session.access_token)) return session.access_token;
  // Hay sesión pero su token no es un JWT (p. ej. el token opaco de Better Auth):
  // se pide el JWT directamente.
  const res = await supabase.auth.getBetterAuthInstance().token();
  const jwt = res?.data?.token;
  return esJwtDeUsuario(jwt) ? jwt : null;
}

/**
 * fetch del Data API. La librería de Neon Auth (beta) pide la sesión en cada
 * consulta y, si en ese momento no obtiene el JWT del usuario, cae en silencio
 * al token anónimo. Desde que los datos de los grupos son privados (RLS), eso
 * hacía que algunas consultas de un usuario con sesión volvieran vacías: "tu
 * usuario no pertenece a ningún grupo" o participantes con 0 puntos, distinto
 * en cada recarga. Aquí, si una consulta va a salir sin JWT de usuario pero
 * hay sesión, se reemplaza por el token del usuario.
 */
async function fetchDataApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const actual = (headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!esJwtDeUsuario(actual)) {
    try {
      const token = await tokenDeUsuario();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        console.warn('[neon] Consulta sin token de usuario pese a haber sesión: se corrigió con el token de la sesión.');
      }
    } catch {
      // Sin sesión disponible: la consulta sigue como anónima.
    }
  }
  return fetch(input, { ...init, headers });
}

export const supabase: any = createClient({
  auth: {
    url: environment.neonAuthUrl,
    adapter: SupabaseAuthAdapter(),
    allowAnonymous: true,
  },
  dataApi: {
    url: environment.neonDataApiUrl,
    options: {
      global: { fetch: fetchDataApi },
    },
  },
});
