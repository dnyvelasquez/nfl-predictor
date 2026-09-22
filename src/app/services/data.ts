import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, forkJoin } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS, registroEquipoEnEtapa, marcaEquipoEnEtapa, estadoEquipoEnEtapa, marcaEquipoPorEtapa } from './core/etapas';
import { EquiposService, Equipo, RegistroEquipoPorEtapa } from './equipos';

export type { Etapa, Equipo, RegistroEquipoPorEtapa };
export { ETAPAS, marcaEquipoEnEtapa, estadoEquipoEnEtapa, marcaEquipoPorEtapa };

export interface RegistroEquipoParticipante {
  equipo: Equipo & { etapa: Etapa };
  wins: number;
  ties: number;
  losses: number;
  puntos: number;
}

export interface Participante {
  id: string;
  numero: number;
  nombre: string;
  acumulado: number;
  puntaje?: number;
  equiposPorEtapa?: { etapa: Etapa; label: string; equipos: RegistroEquipoParticipante[] }[];
  max?: boolean;
  second?: boolean;
}

export type EstadoJuego = 'programado' | 'en_vivo' | 'final' | 'pospuesto';

export interface Juego {
  id: string;
  semana: string;
  visitante: string;
  local: string;
  fecha: string;
  hora: string;
  actual: boolean;
  etapa: Etapa;
  resultado_local: number | null;
  resultado_visitante: number | null;
  estado?: EstadoJuego;
  periodo?: string | null;
  logoVisitante?: string;
  logoLocal?: string;
  participanteVisitante? : string;
  participanteLocal? : string;
}

export interface Asignacion {
  id?: string;
  equipo_id: string;
  participante: string;
  etapa: Etapa;
}

@Injectable({
  providedIn: 'root',
})
export class Service {

  constructor(
    private supabaseClient: SupabaseClientService,
    private equiposService: EquiposService,
  ) {}

  private get supabase() {
    return this.supabaseClient.getClient();
  }

  getParticipantes(): Observable<Participante[]> {
    return from(
      this.supabase
        .from('participantes')
        .select('*')
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

  getJuegosConResultado(): Observable<Juego[]> {
    return from(
      this.supabase
        .from('juegos')
        .select('*')
        .not('resultado_local', 'is', null)
        .not('resultado_visitante', 'is', null)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as Juego[];
      })
    );
  }

  getParticipantesConPuntaje(): Observable<(Participante & {
  })[]> {
    return forkJoin({
      participantes: this.getParticipantes(),
      juegos: this.getJuegosConResultado(),
    }).pipe(
      switchMap(({ participantes, juegos }) =>
        forkJoin(
          participantes.map(p =>
            this.equiposService.getEquiposDeTodasEtapas(p.nombre).pipe(
              map(equiposTodasEtapas => {
                const equiposPorEtapa = ETAPAS
                  .map(e => ({
                    etapa: e.value,
                    label: e.label,
                    equipos: equiposTodasEtapas
                      .filter(eq => eq.etapa === e.value)
                      .map(equipo => ({ equipo, ...registroEquipoEnEtapa(equipo.nombre, e.value, juegos) })),
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

  createParticipante(nombre: string) {
    return from(
      this.supabase.from('participantes').select('numero')
    ).pipe(
      switchMap(({ data, error }: any) => {
        if (error) throw error;
        const maxNumero = (data ?? []).reduce(
          (max: number, r: any) => Math.max(max, Number(r.numero) || 0), 0
        );
        return from(
          this.supabase
            .from('participantes')
            .insert([{ nombre, numero: maxNumero + 1 }])
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
      this.supabase
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

  asignarNumerosAleatorios(): Observable<{ id: string; nombre: string; numero: number }[]> {
    return this.getParticipantes().pipe(
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
              this.supabase
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
      this.supabase
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

  private hoyYYYYMMDD(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  private toTs(fecha?: string, hora?: string): number {
    if (!fecha) return Number.MAX_SAFE_INTEGER;
    const [Y, M, D] = fecha.replace(/-/g, '/').split('/').map(n => parseInt(n, 10));
    let h = 0, m = 0;
    if (hora) {
      const s = hora.trim().toUpperCase();
      const m1 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (m1) {
        h = parseInt(m1[1], 10);
        m = parseInt(m1[2], 10);
        const ap = m1[3];
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
      } else {
        const [hh, mm] = s.split(':');
        h = parseInt(hh || '0', 10);
        m = parseInt(mm || '0', 10);
      }
    }
    return new Date(Y, (M || 1) - 1, D || 1, h, m, 0, 0).getTime();
  }

  getJuegosSemanaActual(): Observable<Juego[]> {
    const hoy = this.hoyYYYYMMDD();
    const semanaId$ = from(
      this.supabase
        .from('semana')
        .select('id,inicio,fin')
        .lte('inicio', hoy)
        .gte('fin', hoy)
        .limit(1)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.[0]?.id ?? null;
      }),
      switchMap(id => {
        if (id !== null) return of(id);
        return from(
          this.supabase
            .from('semana')
            .select('id,inicio')
            .lte('inicio', hoy)
            .order('inicio', { ascending: false })
            .limit(1)
        ).pipe(map(({ data }: any) => data?.[0]?.id ?? null));
      })
    );

    return semanaId$.pipe(
      switchMap((semId) => {
        if (semId === null) return of({ juegos: [], equipos: [], asign: [] });

        return forkJoin({
          juegos: from(
            this.supabase
              .from('juegos')
              .select('*')
              .eq('semana', semId)
              .order('fecha', { ascending: true })
              .order('hora', { ascending: true })
          ).pipe(map((res: any) => res.data || [])),
          equipos: from(
            this.supabase.from('equipos').select('*')
          ).pipe(map((res: any) => res.data || [])),
          asign: from(
            this.supabase.from('asignacion').select('equipo_id,participante,etapa')
          ).pipe(map((res: any) => res.data || []))
        });
      }),
      map(({ juegos, equipos, asign }: any) => this.enrichJuegos(juegos, equipos, asign))
    );
  }

  getNextJuegoId() {
    return from(
      this.supabase
        .from('juegos')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        const last = data?.[0]?.id ?? 0;
        return (Number(last) || 0) + 1;
      })
    );
  }

  getSemanaIdPorFecha(fecha: string) {
    return from(
      this.supabase
        .from('semana')
        .select('id,inicio,fin')
        .lte('inicio', fecha)
        .gte('fin', fecha)
        .limit(1)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.[0]?.id ?? null;
      })
    );
  }

  crearJuego(input: { visitante: string; local: string; fecha: string; hora: string; etapa: Etapa }) {
    return forkJoin({
      nextId: this.getNextJuegoId(),
      semanaId: this.getSemanaIdPorFecha(input.fecha),
    }).pipe(
      switchMap(({ nextId, semanaId }) =>
        from(
          this.supabase
            .from('juegos')
            .insert([
              {
                id: nextId,
                semana: semanaId,
                visitante: input.visitante,
                local: input.local,
                fecha: input.fecha,
                hora: input.hora,
                etapa: input.etapa,
              },
            ])
            .select()
        )
      ),
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.[0];
      })
    );
  }

  actualizarJuego(id: string, patch: Partial<{
    visitante: string;
    local: string;
    fecha: string;
    hora: string;
    etapa: Etapa;
    resultado_local: number | null;
    resultado_visitante: number | null;
  }>): Observable<Juego> {
    const semanaId$ = patch.fecha ? this.getSemanaIdPorFecha(patch.fecha) : of(undefined);

    return semanaId$.pipe(
      switchMap((semanaId) => {
        const fullPatch = semanaId !== undefined ? { ...patch, semana: semanaId } : patch;
        return from(
          this.supabase.from('juegos').update(fullPatch).eq('id', id).select().single()
        );
      }),
      map(({ data, error }: any) => {
        if (error) throw error;
        return data as Juego;
      })
    );
  }

  eliminarJuego(id: string): Observable<void> {
    return from(
      this.supabase.from('juegos').delete().eq('id', id)
    ).pipe(
      map(({ error }: any) => {
        if (error) throw error;
      })
    );
  }

  eliminarTodosLosJuegos(): Observable<void> {
    return from(
      this.supabase.from('juegos').delete().not('id', 'is', null)
    ).pipe(
      map(({ error }: any) => {
        if (error) throw error;
      })
    );
  }

  getSemanaActualId() {
    const hoy = this.hoyYYYYMMDD();
    return this.getSemanaIdPorFecha(hoy).pipe(
      switchMap(id => {
        if (id !== null) return of(id);
        return from(
          this.supabase.from('semana')
            .select('id,inicio')
            .lte('inicio', hoy)
            .order('inicio', { ascending: false })
            .limit(1)
        ).pipe(map((r: any) => r.data?.[0]?.id ?? null));
      })
    );
  }

  getExtremosSemanas() {
    return forkJoin({
      min: from(this.supabase.from('semana').select('id').order('id', { ascending: true }).limit(1))
            .pipe(map((r: any) => r.data?.[0]?.id ?? null)),
      max: from(this.supabase.from('semana').select('id').order('id', { ascending: false }).limit(1))
            .pipe(map((r: any) => r.data?.[0]?.id ?? null)),
    });
  }

  getSemanaAnteriorId(currentId: number) {
    return from(
      this.supabase.from('semana')
        .select('id')
        .lt('id', currentId)
        .order('id', { ascending: false })
        .limit(1)
    ).pipe(map((r: any) => r.data?.[0]?.id ?? null));
  }

  getSemanaSiguienteId(currentId: number) {
    return from(
      this.supabase.from('semana')
        .select('id')
        .gt('id', currentId)
        .order('id', { ascending: true })
        .limit(1)
    ).pipe(map((r: any) => r.data?.[0]?.id ?? null));
  }

  getJuegosPorSemanaId(semId: number): Observable<Juego[]> {
    return forkJoin({
      juegos: from(
        this.supabase
          .from('juegos')
          .select('*')
          .eq('semana', semId)
          .order('fecha', { ascending: true })
          .order('hora', { ascending: true })
      ).pipe(map((res: any) => res.data || [])),
      equipos: from(this.supabase.from('equipos').select('*'))
                .pipe(map((res: any) => res.data || [])),
      asign: from(this.supabase.from('asignacion').select('equipo_id,participante,etapa'))
              .pipe(map((res: any) => res.data || []))
    }).pipe(
      map(({ juegos, equipos, asign }: any) => this.enrichJuegos(juegos, equipos, asign))
    );
  }

  /** Adjunta logos y el participante asignado (para la misma etapa del juego) a cada juego. */
  private enrichJuegos(juegos: any[], equipos: any[], asign: Array<{ equipo_id: string; participante: string; etapa: Etapa }>): Juego[] {
    const byNombre: Record<string, any> = {};
    for (const e of equipos) { byNombre[e.nombre] = e; }

    const participantesPorEquipoEtapa: Record<string, string[]> = {};
    for (const a of asign) {
      if (!a?.equipo_id) continue;
      const p = (a.participante || '').trim();
      if (!p) continue;
      const key = `${a.equipo_id}|${a.etapa}`;
      (participantesPorEquipoEtapa[key] ??= []).push(p);
    }

    const enrich = (j: any): Juego => {
      const v = byNombre[j.visitante];
      const l = byNombre[j.local];

      const listV = v ? (participantesPorEquipoEtapa[`${v.id}|${j.etapa}`] ?? []) : [];
      const listL = l ? (participantesPorEquipoEtapa[`${l.id}|${j.etapa}`] ?? []) : [];

      return {
        ...j,
        logoVisitante: v?.logo || '',
        logoLocal:     l?.logo_2 || l?.logo || '',
        participanteVisitante: listV.join(' / '),
        participanteLocal:     listL.join(' / '),
      } as Juego;
    };

    return (juegos as any[])
      .map(enrich)
      .sort((a: Juego, b: Juego) => this.toTs(a.fecha, a.hora) - this.toTs(b.fecha, b.hora));
  }

  assignEquipo(participanteNombre: string, division: string, equipoId: string | null, etapa: Etapa = 'regular') {
    return this.getEquipoIdsPorDivision(division).pipe(
      switchMap((idsMismaDivision) => {
        const delParticipante$ = idsMismaDivision.length
          ? from(
              this.supabase
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
          this.supabase
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


  resetAsignaciones(etapa: Etapa = 'regular') {
    return from(this.supabase.from('asignacion').delete().eq('etapa', etapa))
      .pipe(
        map(({ error }: any) => {
          if (error) throw error;
          return { ok: true };
        })
      );
  }

  private getEquipoIdsPorDivision(division: string) {
    return from(
      this.supabase.from('equipos').select('id').eq('division', division)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((r: any) => r.id as string);
      })
    );
  }

  getAsignaciones(etapa: Etapa = 'regular') {
    return from(
      this.supabase
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

