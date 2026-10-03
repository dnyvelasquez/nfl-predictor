import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, map } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { AuthService, RolEnGrupo } from './auth/auth';

export interface Grupo {
  id: string;
  nombre: string;
  /** Valor de la apuesta por participante (null = sin definir). */
  apuesta: number | null;
  moneda: string;
}

/** Grupo sobre el que opera el usuario en sesión, con su rol en él. */
export interface GrupoDisponible extends Grupo {
  rol: RolEnGrupo;
}

const COLUMNAS = 'id,nombre,apuesta,moneda';

/** "$50.000 COP", o null si el grupo no tiene apuesta definida. */
export function formatearApuesta(g: Pick<Grupo, 'apuesta' | 'moneda'>): string | null {
  if (g.apuesta === null || g.apuesta === undefined) return null;
  const monto = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(g.apuesta));
  return `$${monto} ${g.moneda}`;
}

@Injectable({
  providedIn: 'root',
})
export class GruposService {

  // Último grupo elegido por el super usuario en las páginas de admin, para no
  // tener que volver a elegirlo al pasar de Participantes a Asignación.
  private ultimoGrupoId: string | null = null;

  constructor(private supabaseClient: SupabaseClientService, private authService: AuthService) {}

  getGrupos(): Observable<Grupo[]> {
    return from(
      this.supabaseClient.from('grupos').select(COLUMNAS).order('nombre', { ascending: true })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((g: any) => ({ ...g, apuesta: g.apuesta === null ? null : Number(g.apuesta) })) as Grupo[];
      })
    );
  }

  crearGrupo(nombre: string, apuesta: number | null): Observable<Grupo> {
    return from(
      this.supabaseClient.from('grupos').insert({ nombre, apuesta }).select(COLUMNAS).single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data as Grupo;
      })
    );
  }

  actualizarApuesta(id: string, apuesta: number | null): Observable<void> {
    return from(this.supabaseClient.from('grupos').update({ apuesta }).eq('id', id)).pipe(
      map(({ error }: any) => {
        if (error) throw error;
      })
    );
  }

  /**
   * Borra un grupo vacío. Si todavía tiene participantes, asignaciones o
   * usuarios, las llaves foráneas lo impiden (23503) y se devuelve un mensaje claro.
   */
  borrarGrupo(id: string): Observable<void> {
    return from(this.supabaseClient.from('grupos').delete().eq('id', id)).pipe(
      map(({ error }: any) => {
        if (error?.code === '23503') {
          throw new Error('El grupo todavía tiene participantes, asignaciones o usuarios; muévelos o bórralos primero.');
        }
        if (error) throw error;
      })
    );
  }

  /**
   * Grupos sobre los que el usuario en sesión opera en las páginas de admin,
   * con su rol en cada uno: todos para el super usuario, aquellos de los que
   * es miembro para el resto. `seleccionado` es el grupo con el que arranca la página.
   */
  gruposDisponibles$(): Observable<{ grupos: GrupoDisponible[]; seleccionado: string | null }> {
    return forkJoin({ perfil: this.authService.getPerfil$(), grupos: this.getGrupos() }).pipe(
      map(({ perfil, grupos }) => {
        const disponibles: GrupoDisponible[] = perfil?.esSuperusuario
          ? grupos.map((g) => ({ ...g, rol: 'superusuario' as const }))
          : grupos.flatMap((g) => {
              const m = perfil?.membresias.find((x) => x.grupo_id === g.id);
              return m ? [{ ...g, rol: m.rol }] : [];
            });
        const seleccionado = disponibles.find((g) => g.id === this.ultimoGrupoId)?.id
          ?? disponibles[0]?.id
          ?? null;
        return { grupos: disponibles, seleccionado };
      })
    );
  }

  recordarGrupo(grupoId: string | null) {
    this.ultimoGrupoId = grupoId;
  }
}
