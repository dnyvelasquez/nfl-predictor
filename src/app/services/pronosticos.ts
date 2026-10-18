import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, take } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { AuthService } from './auth/auth';
import { Eleccion } from './core/etapas';
import { Juego } from './juegos';
import { kickoffMs } from '../components/home/portada';

/** Minutos antes del inicio en que se cierran los pronósticos (igual que `juego_cerrado()` en la base). */
export const MINUTOS_CIERRE = 5;

export interface Pronostico {
  participante_id: string;
  juego_id: number;
  eleccion: Eleccion;
}

/** Instante (ms UTC) en que cierran los pronósticos de un juego, o null si no tiene fecha/hora válidas. */
export function cierrePronosticoMs(j: Pick<Juego, 'fecha' | 'hora'>): number | null {
  const inicio = kickoffMs(j);
  return inicio === null ? null : inicio - MINUTOS_CIERRE * 60_000;
}

/**
 * ¿Todavía se puede pronosticar este juego? Misma regla que `juego_cerrado()`
 * en la base (que es la que manda): juego 'programado', con equipos definidos
 * y hasta 5 minutos antes del inicio.
 */
export function pronosticoAbierto(j: Juego, ahora = Date.now()): boolean {
  if ((j.estado ?? 'programado') !== 'programado') return false;
  if (j.local === 'TBD' || j.visitante === 'TBD') return false;
  const cierre = cierrePronosticoMs(j);
  return cierre !== null && ahora < cierre;
}

/**
 * Pronósticos del Modo Pronóstico. Escribir solo se puede por la función
 * `pronosticar()` de la base (valida grupo, participante y cierre). Al leer,
 * RLS deja ver los propios siempre y los de los demás miembros del grupo solo
 * cuando el juego ya cerró.
 */
@Injectable({
  providedIn: 'root',
})
export class PronosticosService {

  constructor(private supabaseClient: SupabaseClientService, private authService: AuthService) {}

  /** Id del participante del usuario en sesión en ese grupo (null si no es participante). */
  getMiParticipanteId(grupoId: string): Observable<string | null> {
    return this.authService.getUserId$().pipe(
      take(1),
      switchMap((userId) => !userId ? of(null) : from(
        this.supabaseClient.from('participantes').select('id').eq('grupo_id', grupoId).eq('user_id', userId).maybeSingle()
      ).pipe(
        map(({ data, error }: any) => {
          if (error) throw error;
          return (data?.id as string) ?? null;
        })
      ))
    );
  }

  /** Pronósticos visibles del grupo, opcionalmente solo de ciertos juegos. */
  getPronosticos(grupoId: string, juegoIds?: number[]): Observable<Pronostico[]> {
    if (juegoIds && juegoIds.length === 0) return of([]);
    let query = this.supabaseClient.from('pronosticos').select('participante_id,juego_id,eleccion').eq('grupo_id', grupoId);
    if (juegoIds) query = query.in('juego_id', juegoIds);
    return from(query).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return ((data ?? []) as any[]).map((p) => ({ ...p, juego_id: Number(p.juego_id) })) as Pronostico[];
      })
    );
  }

  pronosticar(grupoId: string, juegoId: number, eleccion: Eleccion): Observable<Eleccion> {
    return from(
      this.supabaseClient.getClient().rpc('pronosticar', { p_grupo: grupoId, p_juego: juegoId, p_eleccion: eleccion })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data as Eleccion;
      })
    );
  }
}
