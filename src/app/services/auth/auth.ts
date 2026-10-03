import { Injectable } from '@angular/core';
import { Observable, from, map, catchError, of, switchMap, shareReplay } from 'rxjs';
import { SupabaseClientService } from '../core/supabase-client';
import { environment } from '../../../environments/environment';

// Nivel de acceso de un usuario autenticado. La fuente de verdad es la tabla
// `roles_usuario` (sin fila = 'lectura' sin grupo); las políticas RLS de
// escritura usan la misma tabla vía `public.es_superusuario()`, y el
// administrador solo puede escribir a través de `auto_asignar_temporada_regular()`
// y agregando usuarios de solo lectura a su propio grupo, así que esto solo
// decide qué muestra la UI. 'superusuario' además lleva el rol 'admin' de
// Better Auth, necesario para el plugin Admin (crear/borrar usuarios, cambiar roles).
export type Rol = 'superusuario' | 'administrador' | 'lectura';

export const ROLES: { value: Rol; label: string }[] = [
  { value: 'superusuario', label: 'Super usuario' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'lectura', label: 'Solo lectura' },
];

/** Rol y grupo del usuario. `grupo_id` es null para el super usuario (ve todos los grupos). */
export interface Perfil {
  rol: Rol;
  grupo_id: string | null;
}

export interface UsuarioVisible {
  id: string;
  email: string;
  rol: Rol;
  grupo_id: string | null;
  grupo: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private perfilCache = new Map<string, Observable<Perfil>>();

  constructor(private supabaseClient: SupabaseClientService) {}

  private admin() {
    return this.supabaseClient.auth().getBetterAuthInstance().admin;
  }

  getSession$() {
    return from(this.supabaseClient.auth().getSession()).pipe(
      map(({ data }: any) => data.session ?? null)
    );
  }

  isAuthenticated$() {
    return this.getSession$().pipe(map((s) => !!s));
  }

  getUserId$(): Observable<string | null> {
    return this.getSession$().pipe(map((s: any) => s?.user?.id ?? null));
  }

  /** Perfil del usuario en sesión (null si no hay sesión). Cacheado por usuario hasta login/logout. */
  getPerfil$(): Observable<Perfil | null> {
    return this.getUserId$().pipe(
      switchMap((userId) => {
        if (!userId) return of(null);
        let perfil$ = this.perfilCache.get(userId);
        if (!perfil$) {
          perfil$ = from(
            this.supabaseClient.from('roles_usuario').select('rol,grupo_id').eq('user_id', userId).maybeSingle()
          ).pipe(
            map(({ data }: any) => ({
              rol: (data?.rol ?? 'lectura') as Rol,
              grupo_id: (data?.grupo_id ?? null) as string | null,
            })),
            catchError(() => of({ rol: 'lectura' as Rol, grupo_id: null })),
            shareReplay(1)
          );
          this.perfilCache.set(userId, perfil$);
        }
        return perfil$;
      })
    );
  }

  getRol$(): Observable<Rol | null> {
    return this.getPerfil$().pipe(map((p) => p?.rol ?? null));
  }

  /** Administrador solo puede ejecutar la auto-asignación de temporada regular. */
  puedeAutoAsignar$(): Observable<boolean> {
    return this.getRol$().pipe(map((r) => r === 'superusuario' || r === 'administrador'));
  }

  esSuperusuario$(): Observable<boolean> {
    return this.getRol$().pipe(map((r) => r === 'superusuario'));
  }

  login(email: string, password: string): Observable<any> {
    this.perfilCache.clear();
    return from(
      this.supabaseClient.auth().signInWithPassword({ email, password })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) {
          return { error: error.message };
        }
        return { data: data.user };
      })
    );
  }

  logout(): Observable<any> {
    this.perfilCache.clear();
    return from(this.supabaseClient.auth().signOut()).pipe(
      map(({ error }: any) => {
        if (error) {
          return { error: error.message };
        }
        return { data: 'Sesión cerrada correctamente' };
      })
    );
  }

  /**
   * Crea un usuario y le asigna rol/grupo. El super usuario usa el plugin Admin
   * de Better Auth (cualquier rol y grupo). El administrador no tiene acceso a
   * ese plugin (darle el rol 'admin' de Better Auth le permitiría, entre otras
   * cosas, suplantar al super usuario), así que usa el registro público de
   * Neon Auth con `credentials: 'omit'` — la cookie de sesión del usuario nuevo
   * se descarta y la sesión del administrador no se toca — y luego RLS solo le
   * deja insertar `roles_usuario` con rol 'lectura' en su propio grupo.
   */
  crearUsuario(email: string, password: string, rol: Rol, grupoId: string | null) {
    return this.getRol$().pipe(
      switchMap((miRol) => {
        const userId$ = miRol === 'superusuario'
          ? this.crearConAdmin(email, password, rol)
          : this.registrar(email, password);
        return userId$.pipe(
          switchMap((userId) =>
            from(
              this.supabaseClient.from('roles_usuario').insert({
                user_id: userId,
                rol,
                grupo_id: rol === 'superusuario' ? null : grupoId,
              })
            ).pipe(
              map(({ error }: any) => {
                if (error) throw error;
                return { ok: true, userId };
              })
            )
          )
        );
      })
    );
  }

  private crearConAdmin(email: string, password: string, rol: Rol): Observable<string> {
    return from(
      this.admin().createUser({
        email,
        password,
        name: email,
        role: rol === 'superusuario' ? 'admin' : 'user',
      })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.user?.id as string;
      })
    );
  }

  private registrar(email: string, password: string): Observable<string> {
    return from(
      fetch(`${environment.neonAuthUrl}/sign-up/email`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: email }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.user?.id) {
          throw new Error(body?.message || `No fue posible registrar el usuario (${res.status})`);
        }
        return body.user.id as string;
      })
    );
  }

  /**
   * Cambia rol y grupo de un usuario (solo super usuario): primero el rol de
   * Better Auth (admin/user), luego `roles_usuario`.
   */
  setRol(userId: string, rol: Rol, grupoId: string | null) {
    return from(
      this.admin().setRole({ userId, role: rol === 'superusuario' ? 'admin' : 'user' })
    ).pipe(
      switchMap(({ error }: any) => {
        if (error) throw error;
        return from(
          this.supabaseClient.from('roles_usuario').upsert(
            { user_id: userId, rol, grupo_id: rol === 'superusuario' ? null : grupoId },
            { onConflict: 'user_id' }
          )
        );
      }),
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  /** Usuarios que el usuario en sesión puede ver: todos (super usuario) o los de su grupo (administrador). */
  listUsers(): Observable<UsuarioVisible[]> {
    return from(this.supabaseClient.getClient().rpc('usuarios_visibles')).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []).map((u: any) => ({
          id: u.user_id,
          email: u.email,
          rol: u.rol as Rol,
          grupo_id: u.grupo_id,
          grupo: u.grupo,
        }));
      })
    );
  }

  deleteUser(userId: string) {
    return from(this.admin().removeUser({ userId })).pipe(
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }
}
