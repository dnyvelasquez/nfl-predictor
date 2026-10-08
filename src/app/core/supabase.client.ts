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

/** Vencimiento (ms) de un JWT, o 0 si no se puede leer. */
function vence(token: string): number {
  return Number(claimsJwt(token)?.['exp'] ?? 0) * 1000;
}

/** JWT de usuario que todavía sirve (no vence en los próximos 30 s). */
function esJwtVigente(token: string | null | undefined): token is string {
  return esJwtDeUsuario(token) && vence(token) - 30_000 > Date.now();
}

// Lo que llevó la última consulta al Data API, para el diagnóstico en consola.
let ultimaConsulta: { sub: string | null; role: string | null; venceEn: string; status?: number } | null = null;

/** Resumen del token de la última consulta (sin el token mismo). */
export function diagnosticoDataApi() {
  return ultimaConsulta;
}

// --- JWT del usuario guardado por la app -----------------------------------
// Una vez obtenido, se reutiliza hasta 30 s antes de vencer, así las consultas
// no dependen de que la librería consiga la sesión en cada una.
let jwtUsuario: { token: string; exp: number } | null = null;
let busquedaEnCurso: Promise<string | null> | null = null;
// Sin sesión confirmada: no se vuelve a buscar en cada consulta durante 30 s.
let sinSesionHasta = 0;

// Marca en el navegador de que hubo sesión: si existe y no se consigue el
// token, se reintenta en vez de mandar la consulta como anónima.
const MARCA_SESION = 'nfl-predictor.sesion';
function marcarSesion(activa: boolean) {
  try {
    if (activa) localStorage.setItem(MARCA_SESION, '1');
    else localStorage.removeItem(MARCA_SESION);
  } catch { /* sin almacenamiento: solo no hay reintentos */ }
}
function huboSesion(): boolean {
  try { return localStorage.getItem(MARCA_SESION) === '1'; } catch { return false; }
}

function guardar(token: string) {
  // Se queda el que vence más tarde: la librería puede traer uno más viejo.
  marcarSesion(true);
  if (jwtUsuario && vence(token) <= jwtUsuario.exp * 1000) return;
  jwtUsuario = { token, exp: vence(token) / 1000 };
}

function jwtVigente(): string | null {
  return jwtUsuario && jwtUsuario.exp * 1000 - 30_000 > Date.now() ? jwtUsuario.token : null;
}

/**
 * La app vio la sesión del usuario (AuthService.getSession$): si trae su JWT,
 * queda guardado para las consultas; si no, al menos se marca que hay sesión
 * para que la búsqueda del token reintente en vez de rendirse.
 */
export function notarSesionDataApi(session: any) {
  if (!session) return;
  if (esJwtVigente(session.access_token)) guardar(session.access_token);
  else marcarSesion(true);
  sinSesionHasta = 0;
}

/**
 * Pide al servidor un JWT nuevo para el usuario con sesión (sin pasar por la
 * caché de sesión de la librería) y lo deja para las consultas siguientes.
 */
export async function refrescarTokenDataApi(): Promise<boolean> {
  try {
    const res = await supabase.auth.getBetterAuthInstance().token();
    const jwt = res?.data?.token;
    if (esJwtVigente(jwt)) {
      jwtUsuario = null;
      guardar(jwt);
      sinSesionHasta = 0;
      return true;
    }
  } catch { /* quien llama decide qué hacer */ }
  return false;
}

/** Olvida el JWT guardado (login, logout). */
export function olvidarSesionDataApi(cerroSesion = false) {
  jwtUsuario = null;
  busquedaEnCurso = null;
  sinSesionHasta = 0;
  if (cerroSesion) marcarSesion(false);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Token JWT del usuario con sesión, o null si no hay sesión.
async function tokenDeUsuario(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;
  if (esJwtVigente(session.access_token)) return session.access_token;
  // Hay sesión pero su token no es un JWT (p. ej. el token opaco de Better Auth):
  // se pide el JWT directamente.
  const res = await supabase.auth.getBetterAuthInstance().token();
  const jwt = res?.data?.token;
  return esJwtVigente(jwt) ? jwt : null;
}

// Busca el JWT del usuario (una sola búsqueda a la vez); si en este navegador
// hubo sesión, reintenta antes de rendirse.
function buscarJwtUsuario(): Promise<string | null> {
  busquedaEnCurso ??= (async () => {
    const intentos = huboSesion() ? 4 : 1;
    for (let i = 0; i < intentos; i++) {
      try {
        const token = await tokenDeUsuario();
        if (token) {
          guardar(token);
          return token;
        }
      } catch { /* reintento */ }
      if (i < intentos - 1) await esperar(250 * (i + 1));
    }
    // La marca no se borra aquí (solo al cerrar sesión): si se borrara, una sola
    // falla dejaba las cargas siguientes sin reintentos.
    if (intentos > 1) {
      console.error('[neon] Había sesión en este navegador pero no se pudo obtener su token: la consulta va como anónima.');
    } else {
      sinSesionHasta = Date.now() + 30_000;
    }
    return null;
  })().finally(() => { busquedaEnCurso = null; });
  return busquedaEnCurso;
}

/**
 * fetch del Data API. La librería de Neon Auth (beta) pide la sesión en cada
 * consulta y, si en ese momento no obtiene el JWT del usuario, cae en silencio
 * al token anónimo (con varias consultas a la vez, comparten una sola petición
 * de sesión y fallan juntas). Con los datos de los grupos privados (RLS), eso
 * dejaba consultas vacías: "tu usuario no pertenece a ningún grupo" o
 * participantes con 0 puntos. Aquí, si la consulta no lleva el JWT de un
 * usuario, se usa el guardado o se busca el de la sesión.
 */
async function fetchDataApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const actual = (headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (esJwtVigente(actual)) guardar(actual);
  // Se usa el JWT de usuario vigente que venza más tarde (el de la librería o
  // el guardado); si no hay ninguno, se busca el de la sesión.
  const token = jwtVigente() ?? (Date.now() < sinSesionHasta ? null : await buscarJwtUsuario());
  if (token && token !== actual) {
    headers.set('Authorization', `Bearer ${token}`);
    if (!esJwtVigente(actual)) {
      console.warn(esJwtDeUsuario(actual)
        ? '[neon] La consulta llevaba un token de usuario vencido: se cambió por uno vigente.'
        : '[neon] La consulta iba sin token de usuario pese a haber sesión: se corrigió.');
    }
  }

  const usado = (headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const claims = claimsJwt(usado);
  const respuesta = await fetch(input, { ...init, headers });
  ultimaConsulta = {
    sub: claims?.['sub'] ?? null,
    role: claims?.['role'] ?? null,
    venceEn: claims?.['exp'] ? Math.round((claims['exp'] * 1000 - Date.now()) / 1000) + ' s' : '—',
    status: respuesta.status,
  };
  // Token rechazado (p. ej. vencido): se pide uno nuevo al servidor y se repite una vez.
  if (respuesta.status === 401 && esJwtDeUsuario(usado)) {
    console.warn('[neon] El Data API rechazó el token del usuario (401): se pide uno nuevo y se repite la consulta.');
    jwtUsuario = null;
    if (await refrescarTokenDataApi()) {
      headers.set('Authorization', 'Bearer ' + jwtVigente());
      return fetch(input, { ...init, headers });
    }
  }
  return respuesta;
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
