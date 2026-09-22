import { Injectable } from '@angular/core';
import { Observable, from, map, forkJoin } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS, registroEquipoEnEtapa } from './core/etapas';

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
  logo: string;
  participante?: string;
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

  constructor(private supabaseClient: SupabaseClientService) {}

  getEquipos(etapa: Etapa = 'regular'): Observable<Equipo[]> {
    return forkJoin({
      equiposRes: from(
        this.supabaseClient.from('equipos').select('*').order('id', { ascending: true })
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
          logo: e.logo,
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
          .select('id,nombre,ciudad,division,logo,pg,pe,pp,pw,pd,pc,sb')
          .order('id', { ascending: true })
      ),
      asignRes: from(
        this.supabaseClient.from('asignacion').select('equipo_id,participante,etapa')
      ),
      // TODO(paso Juegos): esta consulta duplica temporalmente lo que hará
      // JuegosService.getJuegosConResultado() — inyectar ese service aquí
      // cuando exista y quitar esta copia.
      juegos: from(
        this.supabaseClient
          .from('juegos')
          .select('*')
          .not('resultado_local', 'is', null)
          .not('resultado_visitante', 'is', null)
      ).pipe(
        map(({ data, error }: any) => {
          if (error) throw error;
          return data ?? [];
        })
      ),
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
            logo: e.logo,
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
        .select('equipo_id, participante, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division,logo)')
        .eq('participante', nombre)
        .eq('etapa', etapa)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id: row.equipos.id,
          nombre: row.equipos.nombre,
          division: row.equipos.division,
          logo: row.equipos.logo,
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
        .select('equipo_id, participante, etapa, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division,logo)')
        .eq('participante', nombre)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id: row.equipos.id,
          nombre: row.equipos.nombre,
          division: row.equipos.division,
          logo: row.equipos.logo,
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
}
