import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, forkJoin } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS, registroEquipoEnEtapa } from './core/etapas';
import { EquiposService, Equipo } from './equipos';
import { JuegosService } from './juegos';

export interface RegistroEquipoParticipante {
  equipo: Equipo & { etapa: Etapa };
  wins: number;
  ties: number;
  losses: number;
  puntos: number;
  descanso: boolean;
}

export interface Participante {
  id: string;
  numero: number;
  nombre: string;
  grupo_id?: string;
  acumulado: number;
  puntaje?: number;
  equiposPorEtapa?: { etapa: Etapa; label: string; equipos: RegistroEquipoParticipante[] }[];
  max?: boolean;
  second?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ParticipantesService {

  constructor(
    private supabaseClient: SupabaseClientService,
    private equiposService: EquiposService,
    private juegosService: JuegosService,
  ) {}

  /** Sin `grupoId` devuelve los de todos los grupos (páginas públicas, donde el grupo aún no aplica). */
  getParticipantes(grupoId?: string): Observable<Participante[]> {
    let query = this.supabaseClient.from('participantes').select('*');
    if (grupoId) query = query.eq('grupo_id', grupoId);
    return from(
      query
        .order('numero', { ascending: true })
        .order('nombre', { ascending: true })
    ).pipe(
      map((res:any) => {
        if (res.error) {
          return[];
        }
        return res.data as Participante[];
      })
    );
  }

  /** Sin `grupoId` mezcla todos los grupos (páginas públicas, donde el grupo aún no aplica). */
  getParticipantesConPuntaje(grupoId?: string): Observable<(Participante & {
  })[]> {
    return forkJoin({
      participantes: this.getParticipantes(grupoId),
      juegos: this.juegosService.getJuegosConResultado(),
      regularTerminada: this.juegosService.temporadaRegularTerminada(),
    }).pipe(
      switchMap(({ participantes, juegos, regularTerminada }) =>
        forkJoin(
          participantes.map(p =>
            this.equiposService.getEquiposDeTodasEtapas(p.nombre, grupoId).pipe(
              map(equiposTodasEtapas => {
                const equiposPorEtapa = ETAPAS
                  .map(e => ({
                    etapa: e.value,
                    label: e.label,
                    equipos: equiposTodasEtapas
                      .filter(eq => eq.etapa === e.value)
                      .map(equipo => ({ equipo, ...registroEquipoEnEtapa(equipo.nombre, e.value, juegos, regularTerminada ? equipo.seed_conferencia : null) })),
                  }))
                  .filter(g => g.equipos.length > 0);
                const puntaje = equiposPorEtapa.reduce(
                  (acc, g) => acc + g.equipos.reduce((a, it) => a + it.puntos, 0), 0
                );
                return { ...p, equiposPorEtapa, puntaje };
              })
            )
          )
        )
      ),
      map(list => {
        const participantesOrdenados = list.sort((a, b) => b.puntaje - a.puntaje);
        const puntajesUnicos = [...new Set(participantesOrdenados.map(p => p.puntaje))]
          .filter(p => p > 0)
          .sort((a, b) => b - a);
        const primerPuntaje = puntajesUnicos.length > 0 ? puntajesUnicos[0] : 0;
        const hayEmpatePrimerLugar = participantesOrdenados.filter(p => p.puntaje === primerPuntaje).length > 1;
        const segundoPuntaje = !hayEmpatePrimerLugar && puntajesUnicos.length > 1 ? puntajesUnicos[1] : 0;

        return participantesOrdenados.map(p => ({
          ...p,
          max: p.puntaje === primerPuntaje && p.puntaje > 0,
          second: !hayEmpatePrimerLugar && p.puntaje === segundoPuntaje && p.puntaje > 0
        }));
      })
    );
  }

  createParticipante(nombre: string, grupoId: string) {
    return from(
      this.supabaseClient.from('participantes').select('numero').eq('grupo_id', grupoId)
    ).pipe(
      switchMap(({ data, error }: any) => {
        if (error) throw error;
        const maxNumero = (data ?? []).reduce(
          (max: number, r: any) => Math.max(max, Number(r.numero) || 0), 0
        );
        return from(
          this.supabaseClient
            .from('participantes')
            .insert([{ nombre, numero: maxNumero + 1, grupo_id: grupoId }])
            .select('id, nombre, numero')
            .single()
        );
      }),
      map(({ data, error }: any) => {
        if (error) throw error;
        return data;
      })
    );
  }

  updateParticipante(id: string, patch: { nombre?: string; numero?: number }) {
    return from(
      this.supabaseClient
        .from('participantes')
        .update(patch)
        .eq('id', id)
        .select('id, nombre, numero')
        .single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data;
      })
    );
  }

  asignarNumerosAleatorios(grupoId: string): Observable<{ id: string; nombre: string; numero: number }[]> {
    return this.getParticipantes(grupoId).pipe(
      switchMap((participantes) => {
        if (participantes.length === 0) return of([]);

        const numeros = participantes.map((_, i) => i + 1);
        for (let i = numeros.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [numeros[i], numeros[j]] = [numeros[j], numeros[i]];
        }

        return forkJoin(
          participantes.map((p, i) =>
            from(
              this.supabaseClient
                .from('participantes')
                .update({ numero: numeros[i] })
                .eq('id', p.id)
                .select('id, nombre, numero')
                .single()
            )
          )
        );
      }),
      map((results: any[]) =>
        results
          .map(({ data, error }: any) => {
            if (error) throw error;
            return data;
          })
          .sort((a, b) => a.numero - b.numero)
      )
    );
  }

  deleteParticipante(id: string) {
    return from(
      this.supabaseClient
        .from('participantes')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }
}
