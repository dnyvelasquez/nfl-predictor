import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, map } from 'rxjs';
import { SupabaseClientService } from './core/supabase-client';
import { AuthService } from './auth/auth';

export interface Grupo {
  id: string;
  nombre: string;
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
      this.supabaseClient.from('grupos').select('id,nombre').order('nombre', { ascending: true })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as Grupo[];
      })
    );
  }

  crearGrupo(nombre: string): Observable<Grupo> {
    return from(
      this.supabaseClient.from('grupos').insert({ nombre }).select('id,nombre').single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data as Grupo;
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
   * Grupos sobre los que el usuario en sesión opera en las páginas de admin:
   * todos para el super usuario, solo el suyo para el resto. `seleccionado` es
   * el grupo con el que arranca la página.
   */
  gruposDisponibles$(): Observable<{ grupos: Grupo[]; seleccionado: string | null }> {
    return forkJoin({ perfil: this.authService.getPerfil$(), grupos: this.getGrupos() }).pipe(
      map(({ perfil, grupos }) => {
        const disponibles = perfil?.rol === 'superusuario'
          ? grupos
          : grupos.filter((g) => g.id === perfil?.grupo_id);
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
