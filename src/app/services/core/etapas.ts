export type Etapa = 'regular' | 'wildcard' | 'divisional' | 'conferencia' | 'superbowl';

export const ETAPAS: { value: Etapa; label: string }[] = [
  { value: 'regular',     label: 'Temporada Regular' },
  { value: 'wildcard',    label: 'Wild Card' },
  { value: 'divisional',  label: 'Ronda Divisional' },
  { value: 'conferencia', label: 'Final de Conferencia' },
  { value: 'superbowl',   label: 'Super Bowl' },
];

const PUNTOS_POR_ETAPA: Record<Etapa, number> = {
  regular: 10, wildcard: 20, divisional: 30, conferencia: 40, superbowl: 50,
};

/** Forma mínima de un juego con resultado que necesita el cálculo de puntaje por etapa. */
export interface JuegoConResultado {
  local: string;
  visitante: string;
  etapa: Etapa;
  resultado_local: number | null;
  resultado_visitante: number | null;
}

/**
 * Récord y puntos de un equipo en una etapa. `seedConferencia` activa el bono
 * de descanso (reglamento, regla 19): la primera semilla de cada conferencia no
 * juega la ronda de comodines, así que quien la tenga asignada en esa ronda
 * recibe los mismos puntos que daría ganarla (20) para no quedar en desventaja.
 * Quien llama solo debe pasar la semilla cuando la temporada regular ya
 * terminó (`JuegosService.temporadaRegularTerminada()`): antes de eso la
 * semilla de ESPN todavía puede cambiar y el bono no se otorga.
 */
export function registroEquipoEnEtapa(
  nombreEquipo: string, etapa: Etapa, juegos: JuegoConResultado[], seedConferencia?: number | null
): { wins: number; ties: number; losses: number; puntos: number; descanso: boolean } {
  let wins = 0, ties = 0, losses = 0;
  for (const j of juegos) {
    if (j.etapa !== etapa) continue;
    let propio: number | null, rival: number | null;
    if (j.local === nombreEquipo) { propio = j.resultado_local; rival = j.resultado_visitante; }
    else if (j.visitante === nombreEquipo) { propio = j.resultado_visitante; rival = j.resultado_local; }
    else continue;
    if (propio === null || rival === null) continue;
    if (propio > rival) wins++;
    else if (propio === rival) ties++;
    else losses++;
  }
  const valorWin = PUNTOS_POR_ETAPA[etapa];
  const descanso = etapa === 'wildcard' && seedConferencia === 1;
  const puntos = wins * valorWin + ties * (valorWin / 2) + (descanso ? PUNTOS_POR_ETAPA.wildcard : 0);
  return { wins, ties, losses, puntos, descanso };
}

export function marcaEquipoEnEtapa(etapa: Etapa, wins: number, ties: number, losses: number, descanso = false): string {
  if (etapa === 'regular') {
    return `${wins}-${losses}-${ties}`;
  }
  if (descanso) return 'Descansó (1ª semilla)';
  if (wins > 0) return 'Ganó';
  if (losses > 0) return 'Perdió';
  if (ties > 0) return 'Empató';
  return 'Pendiente';
}

export function estadoEquipoEnEtapa(item: { equipo: { etapa: Etapa }; wins: number; ties: number; losses: number; descanso?: boolean }): string {
  return marcaEquipoEnEtapa(item.equipo.etapa, item.wins, item.ties, item.losses, item.descanso);
}

export function marcaEquipoPorEtapa(item: { etapa: Etapa; wins: number; ties: number; losses: number; descanso?: boolean }): string {
  return marcaEquipoEnEtapa(item.etapa, item.wins, item.ties, item.losses, item.descanso);
}
