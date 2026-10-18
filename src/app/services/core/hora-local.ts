// Conversión de la fecha/hora de los juegos a la zona horaria del navegador
// (sin Angular). `fecha` (YYYY/MM/DD) y `hora` (HH:MM) de `juegos` se guardan
// en hora de Bogotá (UTC-5 fijo, sin horario de verano): así las escribe la
// sincronización con ESPN y así se ingresan a mano. Solo la presentación se
// pasa a la hora local de cada usuario; la base y las reglas siguen en Bogotá.

const DESFASE_BOGOTA_H = 5;

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface ConFechaHora { fecha?: string | null; hora?: string | null; }

const dos = (n: number) => String(n).padStart(2, '0');

function partesFecha(fecha?: string | null): [number, number, number] | null {
  const f = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(fecha ?? '');
  return f ? [+f[1], +f[2], +f[3]] : null;
}

/** ¿Tiene hora de inicio conocida? ESPN deja '00:00' en los juegos sin hora definida. */
export function tieneHora(j: ConFechaHora): boolean {
  return /^\d{1,2}:\d{2}$/.test((j.hora ?? '').trim()) && j.hora!.trim() !== '00:00';
}

/** Instante (ms UTC) del kickoff de un juego, o null si no tiene fecha/hora válidas. */
export function kickoffMs(j: ConFechaHora): number | null {
  const f = partesFecha(j.fecha);
  const h = /^(\d{1,2}):(\d{2})$/.exec((j.hora ?? '').trim());
  if (!f || !h) return null;
  return Date.UTC(f[0], f[1] - 1, f[2], +h[1] + DESFASE_BOGOTA_H, +h[2]);
}

/**
 * Fecha del juego en la zona del usuario, como Date con día/mes/año locales.
 * Sin hora conocida se queda con la fecha guardada (no hay instante que convertir).
 */
function fechaLocalDate(j: ConFechaHora): Date | null {
  const ms = tieneHora(j) ? kickoffMs(j) : null;
  if (ms !== null) return new Date(ms);
  const f = partesFecha(j.fecha);
  return f ? new Date(f[0], f[1] - 1, f[2], 12) : null;
}

/** Fecha local "YYYY/MM/DD" (mismo formato que `juegos.fecha`). */
export function fechaLocal(j: ConFechaHora): string {
  const d = fechaLocalDate(j);
  return d ? `${d.getFullYear()}/${dos(d.getMonth() + 1)}/${dos(d.getDate())}` : (j.fecha ?? '');
}

/** Hora local "HH:MM" del kickoff, o la guardada si no se puede convertir. */
export function horaLocal(j: ConFechaHora): string {
  const ms = tieneHora(j) ? kickoffMs(j) : null;
  return ms === null ? (j.hora ?? '') : horaLocalDeMs(ms);
}

/** "HH:MM" local de un instante cualquiera. */
export function horaLocalDeMs(ms: number): string {
  const d = new Date(ms);
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** "Dom 12 oct" con la fecha local. */
export function fechaCortaLocal(j: ConFechaHora): string {
  const d = fechaLocalDate(j);
  return d ? `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}` : (j.fecha ?? '');
}

/** Día y mes locales ({ d: 12, m: 'oct' }), para rangos de fechas. */
export function diaMesLocal(j: ConFechaHora): { d: number; m: string } | null {
  const d = fechaLocalDate(j);
  return d ? { d: d.getDate(), m: MESES[d.getMonth()] } : null;
}

/** Zona horaria del navegador ("America/Bogota", "Europe/Madrid"…), o null si no se puede saber. */
export function zonaHorariaLocal(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
