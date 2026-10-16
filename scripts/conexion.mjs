// Cliente de Postgres para los scripts de sincronización.
//
// Fuerza sslmode=verify-full sin importar lo que traiga DATABASE_URL (Neon
// entrega "sslmode=require"): así se verifica el certificado del servidor, y
// el comportamiento no cambia cuando pg v9 / pg-connection-string v3 pasen
// "require" a la semántica de libpq (cifrar sin verificar). Neon usa
// certificados públicos válidos, no hace falta ningún CA propio.
import pg from "pg";

export function crearCliente(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.set("sslmode", "verify-full");
  return new pg.Client({ connectionString: url.toString() });
}
