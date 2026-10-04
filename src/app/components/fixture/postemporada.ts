import { Etapa } from '../../services/core/etapas';

// Lógica pura del cuadro de postemporada del Fixture (sin Angular).
// Cada ronda se arma con los juegos reales si ESPN ya los publicó con equipos;
// si no, se proyecta con las semillas y los ganadores de la ronda anterior,
// siguiendo el formato de la NFL (7 equipos por conferencia, la semilla 1
// descansa en comodines y en la divisional se vuelve a sembrar).

export type Conferencia = 'AFC' | 'NFC';

export interface EquipoBracket {
  id: string;
  nombre: string;
  ciudad: string;
  logo: string;
  conf: Conferencia;
  seed: number | null;
  wins: number;
  losses: number;
  ties: number;
}

/** Forma mínima de un juego que usa el cuadro. */
export interface JuegoPlayoff {
  etapa: Etapa;
  local: string;
  visitante: string;
  fecha: string;
  hora: string;
  estado?: string;
  periodo?: string | null;
  resultado_local: number | null;
  resultado_visitante: number | null;
}

export type EstadoCruce = 'por_definir' | 'proyectado' | 'programado' | 'en_vivo' | 'final';

export interface Cruce {
  /** El de mejor semilla (o el local del juego real). Null = por definir. */
  local: EquipoBracket | null;
  visitante: EquipoBracket | null;
  estado: EstadoCruce;
  puntosLocal: number | null;
  puntosVisitante: number | null;
  ganador: EquipoBracket | null;
  fecha: string | null;
  hora: string | null;
  periodo: string | null;
}

export interface Ronda {
  etapa: Etapa;
  titulo: string;
  /** Rango de fechas de la ronda ("16–18 ene"), de los juegos de ESPN aunque aún digan TBD. */
  fechas: string | null;
  cruces: Cruce[];
  /** Solo en comodines: la semilla 1, que descansa. */
  descansa: EquipoBracket | null;
}

export interface Postemporada {
  conferencias: { conf: Conferencia; rondas: Ronda[] }[];
  superBowl: Ronda;
  /** Ya hay al menos un juego de playoffs con equipos definidos. */
  iniciada: boolean;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function rangoFechas(juegos: JuegoPlayoff[], etapa: Etapa): string | null {
  const fechas = juegos.filter(j => j.etapa === etapa).map(j => j.fecha).filter(Boolean).sort();
  if (!fechas.length) return null;
  const parte = (f: string) => {
    const [, m, d] = f.split(/[/-]/).map(Number);
    return { d, m: MESES[m - 1] };
  };
  const a = parte(fechas[0]);
  const b = parte(fechas[fechas.length - 1]);
  if (fechas[0] === fechas[fechas.length - 1]) return `${a.d} ${a.m}`;
  return a.m === b.m ? `${a.d}–${b.d} ${a.m}` : `${a.d} ${a.m}–${b.d} ${b.m}`;
}

function terminado(j: JuegoPlayoff): boolean {
  return j.estado === 'final'
    || (j.estado !== 'en_vivo' && j.resultado_local !== null && j.resultado_visitante !== null);
}

/** Cruce a partir de dos equipos; si hay un juego real entre ellos en la etapa, lo usa. */
function cruce(a: EquipoBracket | null, b: EquipoBracket | null, etapa: Etapa, juegos: JuegoPlayoff[], proyectado: boolean): Cruce {
  // El de mejor semilla va como "local" (en la NFL es quien recibe, salvo el Super Bowl).
  let local = a, visitante = b;
  if (a && b && (a.seed ?? 99) > (b.seed ?? 99)) { local = b; visitante = a; }

  const vacio: Cruce = {
    local, visitante, estado: !local || !visitante ? 'por_definir' : proyectado ? 'proyectado' : 'programado',
    puntosLocal: null, puntosVisitante: null, ganador: null, fecha: null, hora: null, periodo: null,
  };
  if (!local || !visitante) return vacio;

  const j = juegos.find(x => x.etapa === etapa
    && ((x.local === local!.nombre && x.visitante === visitante!.nombre)
      || (x.local === visitante!.nombre && x.visitante === local!.nombre)));
  if (!j) return vacio;

  // Respeta quién es local en el juego real.
  if (j.local === visitante.nombre) { [local, visitante] = [visitante, local]; }
  const fin = terminado(j);
  const pl = j.resultado_local, pv = j.resultado_visitante;
  return {
    local, visitante,
    estado: j.estado === 'en_vivo' ? 'en_vivo' : fin ? 'final' : 'programado',
    puntosLocal: pl, puntosVisitante: pv,
    ganador: fin && pl !== null && pv !== null && pl !== pv ? (pl > pv ? local : visitante) : null,
    fecha: j.fecha, hora: j.hora, periodo: j.periodo ?? null,
  };
}

// Cruces de una etapa tomados directamente de los juegos reales de una conferencia
// (por si ESPN publica un cruce distinto al proyectado, p. ej. con semillas que
// cambiaron); ordenados por la mejor semilla.
function crucesReales(etapa: Etapa, conf: Conferencia | null, juegos: JuegoPlayoff[], porNombre: Map<string, EquipoBracket>): Cruce[] {
  return juegos
    .filter(j => j.etapa === etapa)
    .map(j => [porNombre.get(j.local), porNombre.get(j.visitante)] as const)
    .filter(([l, v]) => l && v && (conf === null || (l.conf === conf && v.conf === conf)))
    .map(([l, v]) => cruce(l!, v!, etapa, juegos, false))
    .sort((x, y) => Math.min(x.local?.seed ?? 99, x.visitante?.seed ?? 99) - Math.min(y.local?.seed ?? 99, y.visitante?.seed ?? 99));
}

export function armarPostemporada(equipos: EquipoBracket[], juegos: JuegoPlayoff[]): Postemporada {
  const porNombre = new Map(equipos.map(e => [e.nombre, e]));
  const iniciada = juegos.some(j => j.etapa !== 'regular' && porNombre.has(j.local) && porNombre.has(j.visitante));

  const conferencias = (['AFC', 'NFC'] as Conferencia[]).map(conf => {
    const semilla = (n: number) => equipos.find(e => e.conf === conf && e.seed === n) ?? null;

    // Comodines: el cruce es fijo según la semilla (2-7, 3-6, 4-5).
    let comodines = [[2, 7], [3, 6], [4, 5]].map(([a, b]) => cruce(semilla(a), semilla(b), 'wildcard', juegos, true));
    const realesWc = crucesReales('wildcard', conf, juegos, porNombre);
    if (realesWc.length === 3) comodines = realesWc;

    // Divisional: la semilla 1 recibe a la peor semilla que quede; las otras dos se enfrentan.
    let divisional: Cruce[];
    const realesDiv = crucesReales('divisional', conf, juegos, porNombre);
    const ganadoresWc = comodines.map(c => c.ganador);
    if (realesDiv.length === 2) {
      divisional = realesDiv;
    } else if (ganadoresWc.every(Boolean) && semilla(1)) {
      const vivos = [semilla(1)!, ...ganadoresWc as EquipoBracket[]].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
      divisional = [
        cruce(vivos[0], vivos[3], 'divisional', juegos, true),
        cruce(vivos[1], vivos[2], 'divisional', juegos, true),
      ];
    } else {
      divisional = [cruce(semilla(1), null, 'divisional', juegos, true), cruce(null, null, 'divisional', juegos, true)];
    }

    // Final de conferencia: los dos ganadores de la divisional.
    const realesConf = crucesReales('conferencia', conf, juegos, porNombre);
    const final = realesConf.length === 1
      ? realesConf[0]
      : cruce(divisional[0].ganador, divisional[1].ganador, 'conferencia', juegos, true);

    const rondas: Ronda[] = [
      { etapa: 'wildcard', titulo: 'Comodines', fechas: rangoFechas(juegos, 'wildcard'), cruces: comodines, descansa: semilla(1) },
      { etapa: 'divisional', titulo: 'Divisional', fechas: rangoFechas(juegos, 'divisional'), cruces: divisional, descansa: null },
      { etapa: 'conferencia', titulo: 'Final de conferencia', fechas: rangoFechas(juegos, 'conferencia'), cruces: [final], descansa: null },
    ];
    return { conf, rondas };
  });

  // Super Bowl: campeón AFC contra campeón NFC.
  const realesSb = crucesReales('superbowl', null, juegos, porNombre);
  const campeon = (i: number) => conferencias[i].rondas[2].cruces[0].ganador;
  const sb = realesSb.length === 1 ? realesSb[0] : cruce(campeon(0), campeon(1), 'superbowl', juegos, true);
  // En el Super Bowl no hay "local" por semilla: se muestra AFC primero y NFC después.
  if (sb.local && sb.visitante && sb.local.conf === 'NFC') {
    [sb.local, sb.visitante] = [sb.visitante, sb.local];
    [sb.puntosLocal, sb.puntosVisitante] = [sb.puntosVisitante, sb.puntosLocal];
  }

  return {
    conferencias,
    superBowl: { etapa: 'superbowl', titulo: 'Super Bowl', fechas: rangoFechas(juegos, 'superbowl'), cruces: [sb], descansa: null },
    iniciada,
  };
}
