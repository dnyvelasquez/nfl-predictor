import { Injectable } from '@angular/core';
import { Observable, from, map, catchError, of } from 'rxjs';
import { SupabaseClientService } from '../core/supabase-client';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

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

  login(email: string, password: string): Observable<any> {
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
    return from(this.supabaseClient.auth().signOut()).pipe(
      map(({ error }: any) => {
        if (error) {
          return { error: error.message };
        }
        return { data: 'Sesión cerrada correctamente' };
      })
    );
  }

  createUserAsAdmin(email: string, password: string, fullName?: string) {
    return from(
      this.admin().createUser({
        email,
        password,
        name: fullName || email,
      })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return { ok: true, userId: data?.user?.id };
      })
    );
  }

  listUsers(page = 1, perPage = 20, q = '') {
    return from(
      this.admin().listUsers({ query: { limit: perPage, offset: (page - 1) * perPage } })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        let users = data?.users ?? [];
        const query = q.toLowerCase().trim();
        if (query) {
          users = users.filter((u: any) =>
            u.email?.toLowerCase().includes(query) ||
            (u.name ?? '').toLowerCase().includes(query)
          );
        }
        return {
          page,
          perPage,
          users: users.map((u: any) => ({
            id: u.id,
            email: u.email,
            full_name: u.name ?? null,
            created_at: u.createdAt,
            last_sign_in_at: null,
          })),
        };
      }),
      catchError((err) => of({ error: err?.message || 'Error listando usuarios', users: [] }))
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
