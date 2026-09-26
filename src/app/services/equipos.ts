import { Injectable } from '@angular/core';
import { Observable, from, map, forkJoin } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS, registroEquipoEnEtapa } from './core/etapas';
import { JuegosService } from './juegos';

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
  left_mascot: string;
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
}

@Injectable({
  providedIn: 'root',
})
export class EquiposService {

  constructor(
    private supabaseClient: SupabaseClientService,
    private juegosService: JuegosService,
  ) {}

  getEquipos(etapa: Etapa = 'regular'): Observable<Equipo[]> {
    return forkJoin({
      equiposRes: from(
        this.supabaseClient
          .from('equipos')
          .select('id,nombre,ciudad,division,left_mascot,pg,pe,pp,pw,pd,pc,sb')
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
          left_mascot: e.left_mascot,
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

  getEquiposConPuntajePorEtapa(): Observable<(Equipo & { porEtapa: RegistroEquipoPorEtapa[] })[]> {
    return forkJoin({
      equiposRes: from(
        this.supabaseClient
          .from('equipos')
          .select('id,nombre,ciudad,division,left_mascot,pg,pe,pp,pw,pd,pc,sb')
          .order('id', { ascending: true })
      ),
      asignRes: from(
        this.supabaseClient.from('asignacion').select('equipo_id,participante,etapa')
      ),
      juegos: this.juegosService.getJuegosConResultado(),
    }).pipe(
      map(({ equiposRes, asignRes, juegos }: any) => {
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
              const { wins, ties, losses, puntos } = registroEquipoEnEtapa(e.nombre, et.value, juegos);
              return { etapa: et.value, label: et.label, participante, wins, ties, losses, puntos };
            })
            .filter(g => g.participante);

          return {
            id: e.id,
            nombre: e.nombre,
            ciudad: e.ciudad,
            puntaje: e.puntaje,
            division: e.division,
            left_mascot: e.left_mascot,
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
        .select('equipo_id, participante, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division,left_mascot)')
        .eq('participante', nombre)
        .eq('etapa', etapa)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id: row.equipos.id,
          nombre: row.equipos.nombre,
          division: row.equipos.division,
          left_mascot: row.equipos.left_mascot,
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

  getEquiposDeTodasEtapas(nombre: string): Observable<(Equipo & { etapa: Etapa })[]> {
    return from(
      this.supabaseClient
        .from('asignacion')
        .select('equipo_id, participante, etapa, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division,left_mascot)')
        .eq('participante', nombre)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id: row.equipos.id,
          nombre: row.equipos.nombre,
          division: row.equipos.division,
          left_mascot: row.equipos.left_mascot,
          pg: row.equipos.pg,
          pe: row.equipos.pe,
          pp: row.equipos.pp,
          pw: row.equipos.pw,
          pd: row.equipos.pd,
          pc: row.equipos.pc,
          sb: row.equipos.sb,
          participante: row.participante,
          etapa: row.etapa,
        })) as (Equipo & { etapa: Etapa })[];
      })
    );
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
