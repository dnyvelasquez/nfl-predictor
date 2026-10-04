import { Juego } from '../../services/juegos';

// Lógica pura de la portada (sin Angular): qué juego destacar, cómo
// etiquetarlo, cuánto falta para que empiece y en qué orden listar la semana.
// `fecha`/`hora` de `juegos` están en hora de Bogotá (UTC-5 fijo, sin horario
// de verano), así que el instante real del kickoff es esa hora + 5 h en UTC.

const HORA_PRIME = '19:00';

/** Instante (ms UTC) del kickoff de un juego, o null si no tiene fecha/hora válidas. */
export function kickoffMs(j: Pick<Juego, 'fecha' | 'hora'>): number | null {
  const f = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(j.fecha ?? '');
  const h = /^(\d{1,2}):(\d{2})$/.exec((j.hora ?? '').trim());
  if (!f || !h) return null;
  return Date.UTC(+f[1], +f[2] - 1, +f[3], +h[1] + 5, +h[2]);
}

function esPrime(j: Juego): boolean {
  return (j.hora ?? '') >= HORA_PRIME;
}

// Los juegos ingresados a mano antes de la sincronización con ESPN quedaron con
// estado 'programado' aunque tengan resultado: el resultado también cuenta.
function jugado(j: Juego): boolean {
  return j.estado === 'final'
    || (j.estado !== 'en_vivo' && j.resultado_local !== null && j.resultado_visitante !== null);
}

function terminado(j: Juego): boolean {
  return jugado(j) || j.estado === 'pospuesto';
}

/** Estado a mostrar, con la misma corrección de `jugado()`. */
export function estadoVisible(j: Juego): 'en_vivo' | 'final' | 'pospuesto' | 'programado' {
  if (j.estado === 'en_vivo') return 'en_vivo';
  if (jugado(j)) return 'final';
  return j.estado === 'pospuesto' ? 'pospuesto' : 'programado';
}

function porKickoff(a: Juego, b: Juego): number {
  return (kickoffMs(a) ?? Infinity) - (kickoffMs(b) ?? Infinity);
}

/**
 * Juego destacado, a partir de los juegos de la semana actual y la siguiente:
 * 1. un juego en horario prime que esté en vivo;
 * 2. si no, el próximo juego en horario prime que no haya terminado (así,
 *    pasado el Monday Night, salta al Thursday Night de la semana siguiente);
 * 3. si no hay juegos prime pendientes (p. ej. en playoffs), el próximo juego
 *    pendiente a cualquier hora;
 * 4. si todo terminó (fin de temporada), el último juego jugado.
 * Un domingo a mediodía puede haber muchos juegos en vivo a la vez; por eso el
 * destacado no elige entre ellos, y la lista de la semana los muestra primero.
 */
export function elegirDestacado(juegos: Juego[]): Juego | null {
  const orden = [...juegos].sort(porKickoff);
  return orden.find((j) => esPrime(j) && j.estado === 'en_vivo')
    ?? orden.find((j) => esPrime(j) && !terminado(j))
    ?? orden.find((j) => !terminado(j))
    ?? orden.filter(jugado).pop()
    ?? null;
}

/** "Thursday Night Football", "Sunday Night Football", "Monday Night Football", "Horario prime" o null. */
export function etiquetaPrime(j: Juego): string | null {
  if (!esPrime(j)) return null;
  const ms = kickoffMs(j);
  if (ms === null) return 'Horario prime';
  // Día de la semana en Bogotá: se resta el desfase para leerlo en UTC.
  const dia = new Date(ms - 5 * 3600_000).getUTCDay();
  return ({ 4: 'Thursday Night Football', 0: 'Sunday Night Football', 1: 'Monday Night Football' } as Record<number, string>)[dia]
    ?? 'Horario prime';
}

/** "en 2 d 5 h", "en 3 h 20 min", "en 12 min", "en instantes", o null si ya empezó. */
export function cuentaRegresiva(j: Juego, ahora: number): string | null {
  const ms = kickoffMs(j);
  if (ms === null || ms <= ahora) return null;
  const min = Math.floor((ms - ahora) / 60_000);
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `en ${d} d ${h} h`;
  if (h > 0) return `en ${h} h ${m} min`;
  return m > 0 ? `en ${m} min` : 'en instantes';
}

/** "Dom 12 oct" a partir de `fecha` (YYYY/MM/DD). */
export function fechaCorta(j: Pick<Juego, 'fecha'>): string {
  const f = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(j.fecha ?? '');
  if (!f) return j.fecha ?? '';
  const d = new Date(Date.UTC(+f[1], +f[2] - 1, +f[3], 12));
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()} ${meses[d.getUTCMonth()]}`;
}

/** Orden de la lista de la semana: en vivo, luego próximos (por hora), luego terminados (el más reciente primero). */
export function ordenarSemana(juegos: Juego[]): Juego[] {
  const enVivo = juegos.filter((j) => j.estado === 'en_vivo').sort(porKickoff);
  const proximos = juegos.filter((j) => j.estado !== 'en_vivo' && !terminado(j)).sort(porKickoff);
  const terminados = juegos.filter((j) => terminado(j)).sort((a, b) => porKickoff(b, a));
  return [...enVivo, ...proximos, ...terminados];
}
