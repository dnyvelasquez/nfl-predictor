import { Injectable } from '@angular/core';
import { Observable, from, map, catchError, of, switchMap, shareReplay, forkJoin } from 'rxjs';
import { SupabaseClientService } from '../core/supabase-client';
import { environment } from '../../../environments/environment';

// Acceso de un usuario autenticado:
// - `roles_usuario`: solo marca al super usuario (global, opera sobre todos los grupos).
// - `miembros_grupo`: un usuario puede pertenecer a varios grupos, con un rol
//   distinto en cada uno ('administrador' o 'lectura').
// Las políticas RLS usan las mismas tablas (`es_superusuario()`, `rol_en_grupo()`),
// así que esto solo decide qué muestra la UI. El super usuario además lleva el
// rol 'admin' de Better Auth, necesario para el plugin Admin (crear/borrar usuarios).
export type RolGrupo = 'administrador' | 'lectura';
/** Rol efectivo en un grupo: el super usuario cuenta como tal en todos. */
export type RolEnGrupo = RolGrupo | 'superusuario';

export const ROLES_GRUPO: { value: RolGrupo; label: string }[] = [
  { value: 'administrador', label: 'Administrador' },
  { value: 'lectura', label: 'Solo lectura' },
];

export function etiquetaRol(rol: RolEnGrupo): string {
  return rol === 'superusuario' ? 'Super usuario' : ROLES_GRUPO.find((r) => r.value === rol)?.label ?? rol;
}

export interface Membresia {
  grupo_id: string;
  rol: RolGrupo;
}

export interface Perfil {
  esSuperusuario: boolean;
  membresias: Membresia[];
}

export interface MembresiaVisible extends Membresia {
  grupo: string;
}

export interface UsuarioVisible {
  id: string;
  email: string;
  esSuperusuario: boolean;
  membresias: MembresiaVisible[];
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
          perfil$ = forkJoin({
            superusuario: from(
              this.supabaseClient.from('roles_usuario').select('rol').eq('user_id', userId).maybeSingle()
            ),
            membresias: from(
              this.supabaseClient.from('miembros_grupo').select('grupo_id,rol').eq('user_id', userId)
            ),
          }).pipe(
            map(({ superusuario, membresias }: any) => ({
              esSuperusuario: superusuario.data?.rol === 'superusuario',
              membresias: (membresias.data ?? []) as Membresia[],
            })),
            catchError(() => of({ esSuperusuario: false, membresias: [] })),
            shareReplay(1)
          );
          this.perfilCache.set(userId, perfil$);
        }
        return perfil$;
      })
    );
  }

  esSuperusuario$(): Observable<boolean> {
    return this.getPerfil$().pipe(map((p) => !!p?.esSuperusuario));
  }

  /** Super usuario, o administrador de al menos un grupo (puede crear usuarios de solo lectura). */
  esAdministrador$(): Observable<boolean> {
    return this.getPerfil$().pipe(
      map((p) => !!p && (p.esSuperusuario || p.membresias.some((m) => m.rol === 'administrador')))
    );
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
   * Crea un usuario y lo agrega a un grupo con un rol, o lo agrega al grupo si
   * ya existía (en ese caso la contraseña se ignora y su rol en otros grupos no
   * cambia). El super usuario crea con el plugin Admin de Better Auth. El
   * administrador no tiene acceso a ese plugin (darle el rol 'admin' de Better
   * Auth le permitiría, entre otras cosas, suplantar al super usuario), así que
   * usa el registro público de Neon Auth con `credentials: 'omit'` — la cookie
   * de sesión del usuario nuevo se descarta y la sesión del administrador no se
   * toca. La membresía se crea con `agregar_miembro()`, que solo le permite al
   * administrador agregar 'lectura' a grupos que administra.
   */
  crearUsuario(email: string, password: string, grupoId: string, rol: RolGrupo): Observable<{ yaExistia: boolean }> {
    return this.esSuperusuario$().pipe(
      switchMap((esSuper) =>
        (esSuper ? this.crearConAdmin(email, password) : this.registrar(email, password)).pipe(
          map(() => false),
          catchError((e) => {
            if (this.esUsuarioExistente(e)) return of(true);
            throw e;
          })
        )
      ),
      switchMap((yaExistia) =>
        this.agregarMiembro(email, grupoId, rol).pipe(map(() => ({ yaExistia })))
      )
    );
  }

  private esUsuarioExistente(e: any): boolean {
    return /ALREADY_EXISTS/i.test(e?.code ?? '') || /already exists/i.test(e?.message ?? '');
  }

  private crearConAdmin(email: string, password: string): Observable<string> {
    return from(
      this.admin().createUser({ email, password, name: email, role: 'user' })
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
          const err: any = new Error(body?.message || `No fue posible registrar el usuario (${res.status})`);
          err.code = body?.code;
          throw err;
        }
        return body.user.id as string;
      })
    );
  }

  agregarMiembro(email: string, grupoId: string, rol: RolGrupo): Observable<string> {
    return from(
      this.supabaseClient.getClient().rpc('agregar_miembro', { p_email: email, p_grupo: grupoId, p_rol: rol })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data as string;
      })
    );
  }

  /** Solo super usuario: cambia el rol de un usuario en un grupo. */
  setRolEnGrupo(userId: string, grupoId: string, rol: RolGrupo) {
    return from(
      this.supabaseClient.from('miembros_grupo').update({ rol }).eq('user_id', userId).eq('grupo_id', grupoId)
    ).pipe(
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  /** Solo super usuario: saca a un usuario de un grupo. */
  quitarDeGrupo(userId: string, grupoId: string) {
    return from(
      this.supabaseClient.from('miembros_grupo').delete().eq('user_id', userId).eq('grupo_id', grupoId)
    ).pipe(
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  /**
   * Solo super usuario: da o quita el rol de super usuario. Primero el rol de
   * Better Auth (admin/user), luego `roles_usuario`.
   */
  setSuperusuario(userId: string, esSuper: boolean) {
    return from(
      this.admin().setRole({ userId, role: esSuper ? 'admin' : 'user' })
    ).pipe(
      switchMap(({ error }: any) => {
        if (error) throw error;
        const tabla = this.supabaseClient.from('roles_usuario');
        return from(
          esSuper
            ? tabla.upsert({ user_id: userId, rol: 'superusuario' }, { onConflict: 'user_id' })
            : tabla.delete().eq('user_id', userId)
        );
      }),
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  /** Usuarios visibles para el usuario en sesión: todos (super usuario) o los de los grupos que administra. */
  listUsers(): Observable<UsuarioVisible[]> {
    return from(this.supabaseClient.getClient().rpc('usuarios_visibles')).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        const porUsuario = new Map<string, UsuarioVisible>();
        for (const fila of data ?? []) {
          let u = porUsuario.get(fila.user_id);
          if (!u) {
            u = { id: fila.user_id, email: fila.email, esSuperusuario: fila.es_superusuario, membresias: [] };
            porUsuario.set(fila.user_id, u);
          }
          if (fila.grupo_id) {
            u.membresias.push({ grupo_id: fila.grupo_id, grupo: fila.grupo, rol: fila.rol as RolGrupo });
          }
        }
        return [...porUsuario.values()];
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
