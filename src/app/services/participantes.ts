import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, forkJoin } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS, registroEquipoEnEtapa, puntosPorAcierto, resultadoComoEleccion } from './core/etapas';
import { PronosticosService } from './pronosticos';
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
  /** Modo Pronóstico: aciertos por etapa sobre los juegos terminados que pronosticó. */
  pronosticosPorEtapa?: ResumenPronosticoEtapa[];
  max?: boolean;
  second?: boolean;
}

export interface ResumenPronosticoEtapa {
  etapa: Etapa;
  label: string;
  aciertos: number;
  /** Juegos terminados que el participante pronosticó. */
  pronosticados: number;
  puntos: number;
}

@Injectable({
  providedIn: 'root',
})
export class ParticipantesService {

  constructor(
    private supabaseClient: SupabaseClientService,
    private equiposService: EquiposService,
    private juegosService: JuegosService,
    private pronosticosService: PronosticosService,
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

  /**
   * Participantes con su puntaje. Con `grupoId`, todas las asignaciones del grupo
   * se traen en una sola consulta; sin él (no se usa hoy), una por participante.
   */
  getParticipantesConPuntaje(grupoId?: string): Observable<(Participante & {
  })[]> {
    if (!grupoId) return this.puntajeModoEquipos();
    // El modo del grupo decide cómo se suman los puntos.
    return from(this.supabaseClient.from('grupos').select('modo').eq('id', grupoId).maybeSingle()).pipe(
      switchMap(({ data }: any) => data?.modo === 'pronostico'
        ? this.puntajeModoPronostico(grupoId)
        : this.puntajeModoEquipos(grupoId))
    );
  }

  /**
   * Modo Pronóstico: cada acierto (ganador o empate) en un juego terminado suma
   * los puntos de su etapa. Los pronósticos de juegos sin terminar no cuentan.
   */
  private puntajeModoPronostico(grupoId: string): Observable<Participante[]> {
    return forkJoin({
      participantes: this.getParticipantes(grupoId),
      juegos: this.juegosService.getJuegosConResultado(),
      pronosticos: this.pronosticosService.getPronosticos(grupoId),
    }).pipe(
      map(({ participantes, juegos, pronosticos }) => {
        const porId = new Map(juegos.map(j => [Number(j.id), j]));
        const lista = participantes.map(p => {
          const pronosticosPorEtapa: ResumenPronosticoEtapa[] = ETAPAS.map(e => ({
            etapa: e.value, label: e.label, aciertos: 0, pronosticados: 0, puntos: 0,
          }));
          for (const pr of pronosticos) {
            if (pr.participante_id !== p.id) continue;
            const juego = porId.get(pr.juego_id);
            const resultado = juego ? resultadoComoEleccion(juego) : null;
            if (!juego || resultado === null) continue;
            const resumen = pronosticosPorEtapa.find(r => r.etapa === juego.etapa)!;
            resumen.pronosticados++;
            if (resultado === pr.eleccion) {
              resumen.aciertos++;
              resumen.puntos += puntosPorAcierto(juego.etapa);
            }
          }
          const conJuegos = pronosticosPorEtapa.filter(r => r.pronosticados > 0);
          return { ...p, equiposPorEtapa: [], pronosticosPorEtapa: conJuegos, puntaje: conJuegos.reduce((a, r) => a + r.puntos, 0) };
        });
        return this.marcarPodio(lista);
      })
    );
  }

  private puntajeModoEquipos(grupoId?: string): Observable<Participante[]> {
    return forkJoin({
      participantes: this.getParticipantes(grupoId),
      juegos: this.juegosService.getJuegosConResultado(),
      regularTerminada: this.juegosService.temporadaRegularTerminada(),
      equiposGrupo: grupoId ? this.equiposService.getEquiposDelGrupo(grupoId) : of(null),
    }).pipe(
      switchMap(({ participantes, juegos, regularTerminada, equiposGrupo }) =>
        participantes.length === 0 ? of([]) : forkJoin(
          participantes.map(p =>
            (equiposGrupo
              ? of(equiposGrupo.filter(eq => eq.participante === p.nombre))
              : this.equiposService.getEquiposDeTodasEtapas(p.nombre, grupoId)
            ).pipe(
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
      map(list => this.marcarPodio(list))
    );
  }

  /** Ordena por puntaje y marca primer y segundo lugar (sin segundo si hay empate en el primero). */
  private marcarPodio<T extends Participante & { puntaje: number }>(list: T[]): T[] {
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

  // Sorteo de números (1..N, sin repetir) en una función SQL: la pueden usar el
  // superusuario y los administradores del grupo, que no escriben directo en participantes.
  asignarNumerosAleatorios(grupoId: string): Observable<{ id: string; nombre: string; numero: number }[]> {
    return from(
      this.supabaseClient.getClient().rpc('sortear_numeros', { p_grupo: grupoId })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return ((data ?? []) as any[])
          .map(r => ({ id: r.id, nombre: r.nombre, numero: Number(r.numero) }))
          .sort((a, b) => a.numero - b.numero);
      })
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
