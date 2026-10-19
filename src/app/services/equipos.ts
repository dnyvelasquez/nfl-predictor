import { Injectable } from '@angular/core';
import { Observable, from, map, forkJoin } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS, registroEquipoEnEtapa, resultadoComoEleccion, puntosPorAcierto, bonoDiferencia } from './core/etapas';
import { JuegosService } from './juegos';
import { mascotaIzquierda } from './core/mascotas';
import { PronosticosService } from './pronosticos';

/** Lo que un equipo le ha dado a un participante en Modo Pronóstico. */
export interface PuntosEquipoParticipante {
  participante: string;
  /** Juegos terminados en que lo eligió (o eligió empate en un juego suyo). */
  elegido: number;
  /** De esos, en cuántos acertó el resultado. */
  aciertos: number;
  /** Aciertos de diferencia exacta en esos juegos. */
  diferencias: number;
  puntos: number;
}

/** Equipo en Modo Pronóstico: su récord y los puntos que dio a cada participante. */
export interface EquipoPronostico {
  id: string;
  nombre: string;
  ciudad: string;
  division: string;
  mascota: string;
  regular: { wins: number; ties: number; losses: number };
  /** Récord en playoffs ("G-P"), o null si todavía no ha jugado ninguno. */
  playoffs: string | null;
  participantes: PuntosEquipoParticipante[];
  puntosTotales: number;
}
export interface Equipo {
  id: string;
  nombre: string;
  ciudad: string;
  puntaje: number;
  pg: number;
  pe: number;
  pp: number;
  pw: number;
  pd: number;
  pc: number;
  sb: number;
  division: string;
  /** Puesto en la conferencia según ESPN (1 = primera semilla, descansa en comodines). */
  seed_conferencia?: number | null;
  /** Ranking global de la temporada anterior (1 = campeón); solo lo trae getEquipos(). */
  ranking?: number | null;
  /** Mascota ilustrada (256 px), derivada del nombre: ver core/mascotas.ts. */
  mascota: string;
  /** Logo oficial (NFL.com); solo lo traen las consultas de asignación. */
  logo?: string | null;
  participante?: string;
}

export interface EquipoStanding {
  id: string;
  nombre: string;
  ciudad: string;
  logo: string;
  posicion_division: number | null;
  /** Puesto en la conferencia según ESPN: 1-4 líderes de división, 5-7 wild card. */
  seed_conferencia: number | null;
  wins: number;
  losses: number;
  ties: number;
}

export interface EquipoRanking {
  id: string;
  nombre: string;
  ciudad: string;
  division: string;
  logo: string;
  ranking: number;
}

export interface DivisionStanding {
  division: string;
  equipos: EquipoStanding[];
}

export interface ConferenciaStanding {
  conferencia: 'AFC' | 'NFC';
  divisiones: DivisionStanding[];
}

export interface RegistroEquipoPorEtapa {
  etapa: Etapa;
  label: string;
  participante: string;
  wins: number;
  ties: number;
  losses: number;
  puntos: number;
  descanso: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class EquiposService {

  constructor(
    private supabaseClient: SupabaseClientService,
    private juegosService: JuegosService,
    private pronosticosService: PronosticosService,
  ) {}

  /**
   * Modo Pronóstico: cada equipo con su récord y, por participante, los puntos
   * que sacó en los juegos terminados en que eligió a ese equipo (resultado
   * acertado + bono de diferencia, que también se le acredita al equipo elegido
   * aunque haya perdido). Un empate pronosticado cuenta para los dos equipos del
   * juego, así que la suma de todas las tarjetas puede superar el total del
   * participante. Solo se ven pronósticos de juegos cerrados (RLS), que son
   * justamente los únicos con resultado.
   */
  getEquiposModoPronostico(grupoId: string): Observable<EquipoPronostico[]> {
    return forkJoin({
      equiposRes: from(this.supabaseClient.from('equipos').select('id,nombre,ciudad,division').order('id', { ascending: true })),
      participantesRes: from(this.supabaseClient.from('participantes').select('id,nombre').eq('grupo_id', grupoId)),
      juegos: this.juegosService.getJuegosConResultado(),
      pronosticos: this.pronosticosService.getPronosticos(grupoId),
    }).pipe(
      map(({ equiposRes, participantesRes, juegos, pronosticos }: any) => {
        if (equiposRes.error) throw equiposRes.error;
        if (participantesRes.error) throw participantesRes.error;
        const nombres = new Map<string, string>((participantesRes.data ?? []).map((p: any) => [p.id, p.nombre]));
        const juegosPorId = new Map<number, any>(juegos.map((j: any) => [Number(j.id), j]));

        // equipo -> participante -> acumulado
        const porEquipo = new Map<string, Map<string, PuntosEquipoParticipante>>();
        const sumar = (equipo: string, participante: string, acierto: boolean, puntos: number, diferencia: boolean) => {
          const mapa = porEquipo.get(equipo) ?? new Map<string, PuntosEquipoParticipante>();
          porEquipo.set(equipo, mapa);
          const fila = mapa.get(participante) ?? { participante, elegido: 0, aciertos: 0, diferencias: 0, puntos: 0 };
          mapa.set(participante, fila);
          fila.elegido++;
          if (acierto) fila.aciertos++;
          if (diferencia) fila.diferencias++;
          fila.puntos += puntos;
        };

        for (const pr of pronosticos) {
          const juego = juegosPorId.get(pr.juego_id);
          const nombre = nombres.get(pr.participante_id);
          const resultado = juego ? resultadoComoEleccion(juego) : null;
          if (!juego || !nombre || resultado === null) continue;
          const acierto = resultado === pr.eleccion;
          const bono = bonoDiferencia(pr.diferencia, juego);
          const puntos = (acierto ? puntosPorAcierto(juego.etapa) : 0) + bono;
          const equipos = pr.eleccion === 'empate' ? [juego.local, juego.visitante]
            : [pr.eleccion === 'local' ? juego.local : juego.visitante];
          for (const equipo of equipos) sumar(equipo, nombre, acierto, puntos, bono > 0);
        }

        return (equiposRes.data ?? []).map((e: any) => {
          const { wins, ties, losses } = registroEquipoEnEtapa(e.nombre, 'regular', juegos);
          let pg = 0, pp = 0;
          for (const et of ETAPAS) {
            if (et.value === 'regular') continue;
            const r = registroEquipoEnEtapa(e.nombre, et.value, juegos);
            pg += r.wins;
            pp += r.losses;
          }
          const participantes = [...(porEquipo.get(e.nombre)?.values() ?? [])]
            .sort((a, b) => b.puntos - a.puntos || a.participante.localeCompare(b.participante));
          return {
            id: e.id,
            nombre: e.nombre,
            ciudad: e.ciudad,
            division: e.division,
            mascota: mascotaIzquierda(e.nombre),
            regular: { wins, ties, losses },
            playoffs: pg + pp > 0 ? `${pg}-${pp}` : null,
            participantes,
            puntosTotales: participantes.reduce((a, p) => a + p.puntos, 0),
          } as EquipoPronostico;
        });
      })
    );
  }

  getEquipos(etapa: Etapa = 'regular'): Observable<Equipo[]> {
    return forkJoin({
      equiposRes: from(
        this.supabaseClient
          .from('equipos')
          .select('id,nombre,ciudad,division,ranking,seed_conferencia,pg,pe,pp,pw,pd,pc,sb')
          .order('id', { ascending: true })
      ),
      asignRes: from(
        this.supabaseClient.from('asignacion').select('equipo_id,participante').eq('etapa', etapa)
      )
    }).pipe(
      map(({ equiposRes, asignRes }: any) => {
        if (equiposRes.error) throw equiposRes.error;
        if (asignRes.error)   throw asignRes.error;

        const participantesPorEquipo: Record<string, string[]> = {};
        for (const a of (asignRes.data ?? [])) {
          const id = a?.equipo_id;
          const p  = (a?.participante ?? '').trim();
          if (!id || !p) continue;
          (participantesPorEquipo[id] ??= []).push(p);
        }
        for (const id of Object.keys(participantesPorEquipo)) {
          const uniq = Array.from(new Set(participantesPorEquipo[id]));
          uniq.sort((a, b) => a.localeCompare(b));
          participantesPorEquipo[id] = uniq;
        }

        return (equiposRes.data ?? []).map((e: any) => ({
          id: e.id,
          nombre: e.nombre,
          ciudad: e.ciudad,
          puntaje: e.puntaje,
          division:e.division,
          ranking: e.ranking ?? null,
          seed_conferencia: e.seed_conferencia ?? null,
          mascota: mascotaIzquierda(e.nombre),
          pg: e.pg,
          pe: e.pe,
          pp: e.pp,
          pw: e.pw,
          pd: e.pd,
          pc: e.pc,
          sb: e.sb,
          participante: (participantesPorEquipo[e.id]?.join(' / ')) ?? ''
        })) as Equipo[];
      })
    );
  }

  /** Con `grupoId`, el participante de cada equipo es el de ese grupo. Sin sesión RLS no devuelve asignaciones. */
  getEquiposConPuntajePorEtapa(grupoId?: string): Observable<(Equipo & { porEtapa: RegistroEquipoPorEtapa[] })[]> {
    let asignQuery = this.supabaseClient.from('asignacion').select('equipo_id,participante,etapa');
    if (grupoId) asignQuery = asignQuery.eq('grupo_id', grupoId);
    return forkJoin({
      equiposRes: from(
        this.supabaseClient
          .from('equipos')
          .select('id,nombre,ciudad,division,seed_conferencia,pg,pe,pp,pw,pd,pc,sb')
          .order('id', { ascending: true })
      ),
      asignRes: from(asignQuery),
      juegos: this.juegosService.getJuegosConResultado(),
      regularTerminada: this.juegosService.temporadaRegularTerminada(),
    }).pipe(
      map(({ equiposRes, asignRes, juegos, regularTerminada }: any) => {
        if (equiposRes.error) throw equiposRes.error;
        if (asignRes.error) throw asignRes.error;

        const participantesPorEquipoEtapa: Record<string, string[]> = {};
        for (const a of (asignRes.data ?? [])) {
          const id = a?.equipo_id;
          const p = (a?.participante ?? '').trim();
          if (!id || !p) continue;
          const key = `${id}|${a.etapa}`;
          (participantesPorEquipoEtapa[key] ??= []).push(p);
        }

        return (equiposRes.data ?? []).map((e: any) => {
          const porEtapa = ETAPAS
            .map(et => {
              const participantes = participantesPorEquipoEtapa[`${e.id}|${et.value}`] ?? [];
              const participante = participantes.join(' / ');
              const { wins, ties, losses, puntos, descanso } = registroEquipoEnEtapa(e.nombre, et.value, juegos, regularTerminada ? e.seed_conferencia : null);
              return { etapa: et.value, label: et.label, participante, wins, ties, losses, puntos, descanso };
            })
            .filter(g => g.participante);

          return {
            id: e.id,
            nombre: e.nombre,
            ciudad: e.ciudad,
            puntaje: e.puntaje,
            division: e.division,
            mascota: mascotaIzquierda(e.nombre),
            pg: e.pg,
            pe: e.pe,
            pp: e.pp,
            pw: e.pw,
            pd: e.pd,
            pc: e.pc,
            sb: e.sb,
            porEtapa,
          };
        }) as (Equipo & { porEtapa: RegistroEquipoPorEtapa[] })[];
      })
    );
  }

  getEquiposDe(nombre: string, etapa: Etapa = 'regular'): Observable<Equipo[]> {
    return from(
      this.supabaseClient
        .from('asignacion')
        .select('equipo_id, participante, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division)')
        .eq('participante', nombre)
        .eq('etapa', etapa)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id: row.equipos.id,
          nombre: row.equipos.nombre,
          division: row.equipos.division,
          mascota: mascotaIzquierda(row.equipos.nombre),
          pg: row.equipos.pg,
          pe: row.equipos.pe,
          pp: row.equipos.pp,
          pw: row.equipos.pw,
          pd: row.equipos.pd,
          pc: row.equipos.pc,
          sb: row.equipos.sb,
          participante: row.participante,
        })) as Equipo[];
      })
    );
  }

  /** Sin `grupoId` busca en todos los grupos (RLS igual limita a los grupos del usuario). */
  getEquiposDeTodasEtapas(nombre: string, grupoId?: string): Observable<(Equipo & { etapa: Etapa })[]> {
    let query = this.supabaseClient
      .from('asignacion')
      .select(EquiposService.COLUMNAS_ASIGNACION)
      .eq('participante', nombre);
    if (grupoId) query = query.eq('grupo_id', grupoId);
    return from(query).pipe(map((res: any) => this.filasAsignacion(res)));
  }

  /**
   * Todas las asignaciones de un grupo (todas las etapas y participantes) en una
   * sola consulta, para calcular la tabla de puntajes sin una consulta por
   * participante.
   */
  getEquiposDelGrupo(grupoId: string): Observable<(Equipo & { etapa: Etapa })[]> {
    return from(
      this.supabaseClient.from('asignacion').select(EquiposService.COLUMNAS_ASIGNACION).eq('grupo_id', grupoId)
    ).pipe(map((res: any) => this.filasAsignacion(res)));
  }

  private static readonly COLUMNAS_ASIGNACION =
    'equipo_id, participante, etapa, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division,seed_conferencia,logo)';

  private filasAsignacion({ data, error }: any): (Equipo & { etapa: Etapa })[] {
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.equipos.id,
      nombre: row.equipos.nombre,
      division: row.equipos.division,
      mascota: mascotaIzquierda(row.equipos.nombre),
      pg: row.equipos.pg,
      pe: row.equipos.pe,
      pp: row.equipos.pp,
      pw: row.equipos.pw,
      pd: row.equipos.pd,
      pc: row.equipos.pc,
      sb: row.equipos.sb,
      seed_conferencia: row.equipos.seed_conferencia,
      logo: row.equipos.logo,
      participante: row.participante,
      etapa: row.etapa,
    })) as (Equipo & { etapa: Etapa })[];
  }

  /**
   * Standings de temporada regular por conferencia/división, para el Fixture.
   * El récord solo cuenta juegos de etapa 'regular' ya terminados (excluye
   * 'en_vivo', que tiene marcador parcial). El orden viene de
   * equipos.posicion_division, que scripts/sync-nfl.mjs copia de los standings
   * de ESPN con los criterios de desempate oficiales ya aplicados; si a una
   * división le falta esa posición, se ordena por porcentaje de victorias
   * (empate = media victoria) sin desempates.
   */
  /**
   * Ranking global de la temporada anterior (`equipos.ranking`, 1 = campeón del
   * Super Bowl), con el que se hace la asignación de temporada regular.
   */
  getRanking(): Observable<EquipoRanking[]> {
    return from(
      this.supabaseClient
        .from('equipos')
        .select('id,nombre,ciudad,division,logo,ranking')
        .not('ranking', 'is', null)
        .order('ranking', { ascending: true })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as EquipoRanking[];
      })
    );
  }

  getStandingsTemporadaRegular(): Observable<ConferenciaStanding[]> {
    return forkJoin({
      equiposRes: from(
        this.supabaseClient
          .from('equipos')
          .select('id,nombre,ciudad,division,logo,posicion_division,seed_conferencia')
          .order('id', { ascending: true })
      ),
      juegos: this.juegosService.getJuegosConResultado(),
    }).pipe(
      map(({ equiposRes, juegos }: any) => {
        if (equiposRes.error) throw equiposRes.error;

        const terminados = (juegos as any[]).filter(j => j.estado !== 'en_vivo');
        const porDivision: Record<string, EquipoStanding[]> = {};

        for (const e of (equiposRes.data ?? [])) {
          const { wins, ties, losses } = registroEquipoEnEtapa(e.nombre, 'regular', terminados);
          (porDivision[e.division] ??= []).push({
            id: e.id, nombre: e.nombre, ciudad: e.ciudad, logo: e.logo,
            posicion_division: e.posicion_division ?? null,
            seed_conferencia: e.seed_conferencia ?? null, wins, losses, ties,
          });
        }

        const pct = (e: EquipoStanding) => {
          const jugados = e.wins + e.losses + e.ties;
          return jugados ? (e.wins + e.ties / 2) / jugados : 0;
        };

        return (['AFC', 'NFC'] as const).map(conferencia => ({
          conferencia,
          divisiones: Object.keys(porDivision)
            .filter(d => d.startsWith(conferencia))
            .sort()
            .map(division => {
              const equipos = porDivision[division];
              const conPosicion = equipos.every(e => e.posicion_division !== null);
              return {
                division,
                equipos: [...equipos].sort(conPosicion
                  ? (a, b) => a.posicion_division! - b.posicion_division!
                  : (a, b) => pct(b) - pct(a)),
              };
            }),
        }));
      })
    );
  }
}
