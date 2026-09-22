import { Injectable } from '@angular/core';
import { from, map, of, switchMap } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { Etapa, ETAPAS } from './core/etapas';
import { Participante } from './participantes';

export type { Etapa, Participante };
export { ETAPAS };

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

  constructor(private supabaseClient: SupabaseClientService) {}

  private get supabase() {
    return this.supabaseClient.getClient();
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
