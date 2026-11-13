// Resumen de la temporada de un equipo a partir de sus juegos (sin Angular):
// récord, partidos jugados con marcador, en vivo y por jugar.

import type { Etapa } from '../../services/core/etapas';
import { kickoffMs } from '../../services/core/hora-local';

/** Forma mínima de un juego que necesita el resumen. */
export interface JuegoEquipo {
  id: string | number;
  semana: string | number;
  local: string;
  visitante: string;
  fecha: string;
  hora: string;
  etapa: Etapa;
  resultado_local: number | null;
  resultado_visitante: number | null;
  estado?: string | null;
  periodo?: string | null;
  logoVisitante?: string;
  logoLocal?: string;
}

export type Resultado = 'G' | 'P' | 'E';

export interface PartidoEquipo {
  juego: JuegoEquipo;
  rival: string;
  logoRival: string | null;
  esLocal: boolean;
  propio: number | null;
  contra: number | null;
  /** Solo en los jugados. */
  resultado: Resultado | null;
  pospuesto: boolean;
}

export interface Marca { g: number; p: number; e: number; }

export interface TemporadaEquipo {
  jugados: PartidoEquipo[];
  enVivo: PartidoEquipo[];
  proximos: PartidoEquipo[];
  regular: Marca;
  playoffs: Marca;
  local: Marca;
  visitante: Marca;
  /** Puntos a favor / en contra en los juegos terminados (temporada regular y playoffs). */
  favor: number;
  contra: number;
  /** Racha actual: resultado y cuántos seguidos ("G", 3), o null sin juegos. */
  racha: { resultado: Resultado; n: number } | null;
}

/** Un juego cuenta como jugado si está 'final' o tiene marcador y no está en vivo ni pospuesto (los cargados a mano dicen 'programado'). */
export function juegoTerminado(j: JuegoEquipo): boolean {
  if (j.estado === 'final') return true;
  return j.resultado_local !== null && j.resultado_visitante !== null
    && j.estado !== 'en_vivo' && j.estado !== 'pospuesto';
}

const marcaVacia = (): Marca => ({ g: 0, p: 0, e: 0 });

function sumar(m: Marca, r: Resultado): void {
  if (r === 'G') m.g++;
  else if (r === 'P') m.p++;
  else m.e++;
}

function orden(j: JuegoEquipo): number {
  return kickoffMs(j) ?? kickoffMs({ fecha: j.fecha, hora: '12:00' }) ?? 0;
}

export function armarTemporada(nombre: string, juegos: JuegoEquipo[]): TemporadaEquipo {
  const t: TemporadaEquipo = {
    jugados: [], enVivo: [], proximos: [],
    regular: marcaVacia(), playoffs: marcaVacia(), local: marcaVacia(), visitante: marcaVacia(),
    favor: 0, contra: 0, racha: null,
  };

  const propios = juegos
    .filter(j => j.local === nombre || j.visitante === nombre)
    .sort((a, b) => orden(a) - orden(b));

  for (const j of propios) {
    const esLocal = j.local === nombre;
    const rival = esLocal ? j.visitante : j.local;
    const propio = esLocal ? j.resultado_local : j.resultado_visitante;
    const contra = esLocal ? j.resultado_visitante : j.resultado_local;
    const partido: PartidoEquipo = {
      juego: j,
      rival,
      logoRival: rival && rival !== 'TBD' ? ((esLocal ? j.logoVisitante : j.logoLocal) ?? null) : null,
      esLocal, propio, contra,
      resultado: null,
      pospuesto: j.estado === 'pospuesto',
    };

    if (j.estado === 'en_vivo') {
      t.enVivo.push(partido);
    } else if (juegoTerminado(j) && propio !== null && contra !== null) {
      const r: Resultado = propio > contra ? 'G' : propio < contra ? 'P' : 'E';
      partido.resultado = r;
      sumar(j.etapa === 'regular' ? t.regular : t.playoffs, r);
      sumar(esLocal ? t.local : t.visitante, r);
      t.favor += propio;
      t.contra += contra;
      t.jugados.push(partido);
    } else {
      t.proximos.push(partido);
    }
  }

  for (let i = t.jugados.length - 1; i >= 0; i--) {
    const r = t.jugados[i].resultado!;
    if (!t.racha) t.racha = { resultado: r, n: 1 };
    else if (t.racha.resultado === r) t.racha.n++;
    else break;
  }

  // Lo jugado, del más reciente al más antiguo.
  t.jugados.reverse();
  return t;
}

/** "10-4-1" (sin empates: "10-4"). */
export function textoMarca(m: Marca): string {
  return m.e > 0 ? `${m.g}-${m.p}-${m.e}` : `${m.g}-${m.p}`;
}
