import { Injectable } from '@angular/core';
import { from, map, of, switchMap } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa } from './core/etapas';

export interface Asignacion {
  id?: string;
  equipo_id: string;
  participante: string;
  etapa: Etapa;
  grupo_id?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AsignacionService {

  constructor(private supabaseClient: SupabaseClientService) {}

  assignEquipo(participanteNombre: string, division: string, equipoId: string | null, etapa: Etapa, grupoId: string) {
    return this.getEquipoIdsPorDivision(division).pipe(
      switchMap((idsMismaDivision) => {
        const delParticipante$ = idsMismaDivision.length
          ? from(
              this.supabaseClient
                .from('asignacion')
                .delete()
                .eq('participante', participanteNombre)
                .eq('etapa', etapa)
                .eq('grupo_id', grupoId)
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
            .insert([{ equipo_id: equipoId, participante: participanteNombre, etapa, grupo_id: grupoId }])
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
   * Asigna la temporada regular de un grupo por ranking (reglas #2-#8 del
   * reglamento), reemplazando por completo la asignación de "regular" de ese
   * grupo (el administrador solo puede pasar el suyo). El algoritmo vive en
   * Neon (`calcular_auto_asignacion_regular()`, aplicado por
   * `auto_asignar_temporada_regular()`, SECURITY DEFINER) para que el rol
   * administrador pueda ejecutarlo sin tener permiso de escritura directa
   * sobre `asignacion`. Ver CLAUDE.md para el detalle de las reglas.
   */
  autoAsignarTemporadaRegular(grupoId: string) {
    return from(
      this.supabaseClient.getClient().rpc('auto_asignar_temporada_regular', { p_grupo: grupoId })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return { ok: true as const, asignados: Number(data ?? 0) };
      })
    );
  }

  /**
   * Asigna la ronda de comodines de un grupo (reglamento, reglas 11-16 y 19),
   * reemplazando la asignación de "wildcard" de ese grupo. Lógica en Neon:
   * `calcular_auto_asignacion_wildcard()`, aplicada por `auto_asignar_wildcard()`.
   * Usa las semillas de ESPN que haya en el momento: antes de cerrar la
   * temporada regular son provisionales.
   */
  autoAsignarWildcard(grupoId: string) {
    return from(
      this.supabaseClient.getClient().rpc('auto_asignar_wildcard', { p_grupo: grupoId })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return { ok: true as const, asignados: Number(data ?? 0) };
      })
    );
  }

  /**
   * Asigna una ronda eliminatoria de un grupo (reglamento, reglas 11-16):
   * 'divisional' y 'conferencia' (un equipo por conferencia, compartidos de
   * forma pareja) o 'superbowl' (un solo equipo por participante, repartidos
   * de forma pareja entre los dos finalistas). Lógica en Neon:
   * `calcular_auto_asignacion_eliminatoria()` / `calcular_auto_asignacion_superbowl()`,
   * aplicadas por `auto_asignar_eliminatoria()`.
   */
  autoAsignarEliminatoria(grupoId: string, etapa: 'divisional' | 'conferencia' | 'superbowl') {
    return from(
      this.supabaseClient.getClient().rpc('auto_asignar_eliminatoria', { p_grupo: grupoId, p_etapa: etapa })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return { ok: true as const, asignados: Number(data ?? 0) };
      })
    );
  }

  resetAsignaciones(etapa: Etapa, grupoId: string) {
    return from(this.supabaseClient.from('asignacion').delete().eq('etapa', etapa).eq('grupo_id', grupoId))
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

  getAsignaciones(etapa: Etapa, grupoId: string) {
    return from(
      this.supabaseClient
        .from('asignacion')
        .select('id,equipo_id,participante')
        .eq('etapa', etapa)
        .eq('grupo_id', grupoId)
        .order('equipo_id', { ascending: true })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as Asignacion[];
      })
    );
  }

}
