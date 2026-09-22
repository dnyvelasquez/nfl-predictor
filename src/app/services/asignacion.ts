import { Injectable } from '@angular/core';
import { forkJoin, from, map, of, switchMap } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa } from './core/etapas';

export interface Asignacion {
  id?: string;
  equipo_id: string;
  participante: string;
  etapa: Etapa;
}

@Injectable({
  providedIn: 'root',
})
export class AsignacionService {

  constructor(private supabaseClient: SupabaseClientService) {}

  assignEquipo(participanteNombre: string, division: string, equipoId: string | null, etapa: Etapa = 'regular') {
    return this.getEquipoIdsPorDivision(division).pipe(
      switchMap((idsMismaDivision) => {
        const delParticipante$ = idsMismaDivision.length
          ? from(
              this.supabaseClient
                .from('asignacion')
                .delete()
                .eq('participante', participanteNombre)
                .eq('etapa', etapa)
                .in('equipo_id', idsMismaDivision)
            )
          : of({});

        if (!equipoId) {
          return delParticipante$.pipe(
            map(({ error }: any) => {
              if (error) throw error;
              return { ok: true };
            })
          );
        }

        const insert$ = from(
          this.supabaseClient
            .from('asignacion')
            .insert([{ equipo_id: equipoId, participante: participanteNombre, etapa }])
            .select()
        );

        return delParticipante$.pipe(
          switchMap(() => insert$),
          map(({ error }: any) => {
            if (error && error.code !== '23505') throw error;
            return { ok: true };
          })
        );
      })
    );
  }

  /**
   * Asigna la temporada regular por ranking (reglas #2-#8 del reglamento).
   * Reemplaza por completo la asignación de "regular". Lee participantes/
   * equipos al momento de ejecutarse (no asume que el ranking ya exista
   * cuando se crean los participantes, ni al revés).
   *
   * Recorre los equipos en orden de ranking (1 = mejor) y los reparte entre
   * los participantes en "rondas" de tamaño N (N = número de participantes):
   * rondas impares en orden ascendente de número, rondas pares en orden
   * descendente (regla #5), repitiendo el patrón tantas rondas como
   * alcancen los equipos disponibles — no asume 8 participantes ni 32
   * equipos. Dentro de cada ronda, cada equipo se ofrece al primer
   * participante de la cola (en el orden de esa ronda) que pueda recibirlo;
   * si el que sigue en la cola no puede, el equipo pasa al siguiente que sí
   * pueda, y el que fue saltado queda de primero en la cola para el próximo
   * equipo (regla #7). Un participante NO puede recibir un equipo si ya
   * tiene otro de la misma división (regla #7), o si ya tiene dos equipos de
   * la misma conferencia (regla #8, "tercer equipo de una conferencia").
   *
   * Todos los participantes terminan con el mismo número de equipos: si N
   * no divide exacto la cantidad de equipos con ranking, la última ronda
   * queda incompleta y se descarta entera, dejando sin asignar los equipos
   * de peor ranking que sobren (p.ej. con 7 participantes y 32 equipos, se
   * hacen 4 rondas de 7 = 28 equipos asignados, y los 4 de peor ranking
   * quedan sin asignar).
   */
  autoAsignarTemporadaRegular() {
    return forkJoin({
      participantes: from(
        this.supabaseClient.from('participantes').select('numero,nombre').order('numero', { ascending: true })
      ),
      equipos: from(
        this.supabaseClient.from('equipos').select('id,ranking,division').order('ranking', { ascending: true })
      ),
    }).pipe(
      switchMap(({ participantes, equipos }: any) => {
        if (participantes.error) throw participantes.error;
        if (equipos.error) throw equipos.error;

        const listaParticipantes = (participantes.data ?? []) as { numero: number; nombre: string }[];
        const listaEquipos = (equipos.data ?? []) as { id: string; ranking: number | null; division: string }[];

        const ordenAscendente = listaParticipantes.map((p) => p.nombre);
        const ordenDescendente = [...ordenAscendente].reverse();
        const n = ordenAscendente.length;

        const conferenciaDe = (division: string) => (division.startsWith('AFC') ? 'AFC' : 'NFC');

        const divisionesPorParticipante = new Map<string, Set<string>>();
        const conferenciasPorParticipante = new Map<string, Map<string, number>>();
        const filas: { equipo_id: string; participante: string; etapa: 'regular' }[] = [];

        const puedeRecibir = (participante: string, division: string) => {
          if (divisionesPorParticipante.get(participante)?.has(division)) return false;
          const conteoConf = conferenciasPorParticipante.get(participante)?.get(conferenciaDe(division)) ?? 0;
          return conteoConf < 2;
        };

        const asignar = (equipo: { id: string; division: string }, participante: string) => {
          filas.push({ equipo_id: equipo.id, participante, etapa: 'regular' });

          (divisionesPorParticipante.get(participante) ?? divisionesPorParticipante.set(participante, new Set()).get(participante)!)
            .add(equipo.division);

          const conf = conferenciaDe(equipo.division);
          const conteoConf = conferenciasPorParticipante.get(participante) ?? conferenciasPorParticipante.set(participante, new Map()).get(participante)!;
          conteoConf.set(conf, (conteoConf.get(conf) ?? 0) + 1);
        };

        // Reparte un tramo de `equipos` (ya en orden de ranking) entre una
        // cola de participantes en el orden dado, saltando por división
        // repetida o por tercer equipo de conferencia. Devuelve cuántos
        // equipos del tramo quedaron sin dueño (no debería pasar con 8
        // divisiones/2 conferencias y colas de 8 participantes).
        const repartirRonda = (equiposDeLaRonda: typeof listaEquipos, ordenRonda: string[]) => {
          const cola = [...ordenRonda];
          for (const equipo of equiposDeLaRonda) {
            const idx = cola.findIndex((p) => puedeRecibir(p, equipo.division));
            if (idx === -1) continue; // nadie en la cola puede recibirlo
            const [participante] = cola.splice(idx, 1);
            asignar(equipo, participante);
          }
        };

        const numRondas = n > 0 ? Math.floor(listaEquipos.length / n) : 0;
        for (let ronda = 0; ronda < numRondas; ronda++) {
          const ordenRonda = ronda % 2 === 0 ? ordenAscendente : ordenDescendente; // impar=asc, par=desc (1-indexado)
          repartirRonda(listaEquipos.slice(ronda * n, (ronda + 1) * n), ordenRonda);
        }

        return from(
          this.supabaseClient.from('asignacion').delete().eq('etapa', 'regular')
        ).pipe(
          switchMap(({ error }: any) => {
            if (error) throw error;
            if (filas.length === 0) return of({ error: null });
            return from(this.supabaseClient.from('asignacion').insert(filas));
          }),
          map(({ error }: any) => {
            if (error) throw error;
            return { ok: true as const, asignados: filas.length };
          })
        );
      })
    );
  }

  resetAsignaciones(etapa: Etapa = 'regular') {
    return from(this.supabaseClient.from('asignacion').delete().eq('etapa', etapa))
      .pipe(
        map(({ error }: any) => {
          if (error) throw error;
          return { ok: true };
        })
      );
  }

  private getEquipoIdsPorDivision(division: string) {
    return from(
      this.supabaseClient.from('equipos').select('id').eq('division', division)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => r.id as string);
      })
    );
  }

  getAsignaciones(etapa: Etapa = 'regular') {
    return from(
      this.supabaseClient
        .from('asignacion')
        .select('id,equipo_id,participante')
        .eq('etapa', etapa)
        .order('equipo_id', { ascending: true })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as Asignacion[];
      })
    );
  }

}
