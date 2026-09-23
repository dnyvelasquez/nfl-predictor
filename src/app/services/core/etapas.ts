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

export function registroEquipoEnEtapa(
  nombreEquipo: string, etapa: Etapa, juegos: JuegoConResultado[]
): { wins: number; ties: number; losses: number; puntos: number } {
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
  const puntos = wins * valorWin + ties * (valorWin / 2);
  return { wins, ties, losses, puntos };
}

export function marcaEquipoEnEtapa(etapa: Etapa, wins: number, ties: number, losses: number): string {
  if (etapa === 'regular') {
    return `${wins}-${losses}-${ties}`;
  }
  if (wins > 0) return 'Ganó';
  if (losses > 0) return 'Perdió';
  if (ties > 0) return 'Empató';
  return 'Pendiente';
}

export function estadoEquipoEnEtapa(item: { equipo: { etapa: Etapa }; wins: number; ties: number; losses: number }): string {
  return marcaEquipoEnEtapa(item.equipo.etapa, item.wins, item.ties, item.losses);
}

export function marcaEquipoPorEtapa(item: { etapa: Etapa; wins: number; ties: number; losses: number }): string {
  return marcaEquipoEnEtapa(item.etapa, item.wins, item.ties, item.losses);
}
