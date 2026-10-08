import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, map, of, switchMap, catchError, timer } from 'rxjs';
import { refrescarTokenDataApi, diagnosticoDataApi } from '../core/supabase.client';
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

  // Último grupo elegido, compartido por todas las páginas y guardado en el
  // navegador para que sobreviva a recargas. Solo es una preferencia: la
  // pertenencia real la valida `gruposDisponibles$()` (y RLS en la base).
  private static readonly CLAVE_GRUPO = 'nfl-predictor.grupo';
  private ultimoGrupoId: string | null = GruposService.leerGrupoGuardado();

  private static leerGrupoGuardado(): string | null {
    try {
      return localStorage.getItem(GruposService.CLAVE_GRUPO);
    } catch {
      return null;
    }
  }

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
        if (perfil && disponibles.length === 0) {
          console.warn('[grupos] Sin grupos disponibles', {
            superusuario: perfil.esSuperusuario, membresias: perfil.membresias.length, gruposVisibles: grupos.length,
          });
        }
        const seleccionado = disponibles.find((g) => g.id === this.ultimoGrupoId)?.id
          ?? disponibles[0]?.id
          ?? null;
        return { grupos: disponibles, seleccionado };
      })
    );
  }

  private reintentarGrupos(intento: number): Observable<{ grupos: GrupoDisponible[]; seleccionado: string | null }> {
    return timer(600 * intento).pipe(
      switchMap(() => from(refrescarTokenDataApi())),
      switchMap(() => this.gruposDisponibles$()),
      switchMap((d) => {
        if (d.grupos.length > 0) {
          console.warn('[grupos] Con sesión no llegaron grupos; aparecieron en el reintento ' + intento + '.');
          return of(d);
        }
        if (intento < 2) return this.reintentarGrupos(intento + 1);
        console.warn('[grupos] Con sesión pero sin grupos tras reintentar.', diagnosticoDataApi());
        return of(d);
      })
    );
  }

  recordarGrupo(grupoId: string | null) {
    this.ultimoGrupoId = grupoId;
    try {
      if (grupoId) localStorage.setItem(GruposService.CLAVE_GRUPO, grupoId);
      else localStorage.removeItem(GruposService.CLAVE_GRUPO);
    } catch {
      // Sin almacenamiento disponible: la elección vale solo para esta sesión de la app.
    }
  }

  /**
   * Contexto de grupo para las páginas públicas que muestran datos de un grupo
   * (portada, tabla de puntajes, equipos, juegos, reglamento): sin sesión no hay
   * grupos (RLS no deja leer participantes, asignaciones ni grupos); con sesión,
   * los grupos del usuario y el que está elegido.
   */
  contexto$(): Observable<{ logueado: boolean; grupos: GrupoDisponible[]; seleccionado: string | null }> {
    return this.authService.isAuthenticated$().pipe(
      switchMap((logueado) => logueado
        ? this.gruposDisponibles$().pipe(
            // Sin grupos con sesión suele ser una consulta que salió con un token
            // malo: antes de mostrar "no perteneces a ningún grupo" se pide un JWT
            // nuevo al servidor y se reintenta (hasta 2 veces, con espera creciente).
            switchMap((d) => d.grupos.length > 0 ? of(d) : this.reintentarGrupos(1)),
            map((d) => ({ logueado, ...d })))
        : of({ logueado, grupos: [] as GrupoDisponible[], seleccionado: null })),
      catchError(() => of({ logueado: false, grupos: [] as GrupoDisponible[], seleccionado: null }))
    );
  }
}
