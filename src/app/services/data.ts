import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, forkJoin, catchError, throwError } from 'rxjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { supabase } from '../core/supabase.client';

export interface Participante {
  id: string;
  numero: number;
  nombre: string;
  acumulado: number;
  puntaje?: number;
  equipos?: Equipo[];
}

export interface Equipo {
  id: string;
  nombre: string;
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

export interface Juego {
  id: string;
  semana: string;
  visitante: string;
  local: string;
  fecha: string;
  hora: string;
  actual: boolean;
  logoVisitante?: string;
  logoLocal?: string;
  participanteVisitante? : string;
  participanteLocal? : string;
}

export interface Asignacion {
  id?: string;
  equipo_id: string;
  participante: string;
}

@Injectable({
  providedIn: 'root',
})
export class Service { 

  private supabase: SupabaseClient;
  private FUNCTION_URL = environment.functionAuthUrl;

  constructor(private http: HttpClient) {
    this.supabase = supabase;
  }
  
  getParticipantes(): Observable<Participante[]> {
    return from(
      this.supabase
        .from('participantes')
        .select('*')
        .order('numero', { ascending: true })
        .order('nombre', { ascending: true })
    ).pipe(
      map((res:any) => {
        if (res.error) {
          return[];
        }
        return res.data as Participante[];
      })
    );
  }

  getParticipantesConPuntaje(): Observable<(Participante & {
  })[]> {
    return this.getParticipantes().pipe(
      switchMap(participantes =>
        forkJoin(
          participantes.map(p =>
            this.getEquiposDe(p.nombre).pipe(
              map(equipos => {
                const puntajeEquipos = equipos.reduce((acc, eq) => acc + (eq.pg ?? 0) * 10 + (eq.pe ?? 0) * 5 + (eq.pw ?? 0) * 20 + (eq.pd ?? 0) * 30 + (eq.pc ?? 0) * 40 + (eq.sb ?? 0) * 50, 0);
                const acumulado = p.acumulado ?? 0;
                return { ...p, equipos, puntajeEquipos, puntaje: puntajeEquipos + acumulado };
              })
            )
          )
        )
      ),
      map(list => list.sort((a, b) => b.puntaje - a.puntaje))
    );
  }

  createParticipante(nombre: string, numero: number) {
    return from(
      this.supabase
        .from('participantes')
        .insert([{ nombre, numero }])
        .select('id, nombre, numero')
        .single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data;
      })
    );
  }

  updateParticipante(id: string, patch: { nombre?: string; numero?: number }) {
    return from(
      this.supabase
        .from('participantes')
        .update(patch)
        .eq('id', id)
        .select('id, nombre, numero')
        .single()
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data;
      })
    );
  }

  deleteParticipante(id: string) {
    return from(
      this.supabase
        .from('participantes')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }: any) => {
        if (error) throw error;
        return { ok: true };
      })
    );
  }

  getEquipos(): Observable<Equipo[]> {
    return forkJoin({
      equiposRes: from(
        this.supabase.from('equipos').select('*').order('id', { ascending: true })
      ),
      asignRes: from(
        this.supabase.from('asignacion').select('equipo_id,participante')
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

  getEquiposDe(nombre: string): Observable<Equipo[]> {
    return from(
      this.supabase
        .from('asignacion')
        .select('equipo_id, participante, equipos!inner(id,nombre,pg,pe,pp,pw,pd,pc,sb,division,logo)')
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
        })) as Equipo[];
      })
    );
  }
  
  validarUsuario(): Observable<any> {
    return from(this.supabase.auth.getSession()).pipe(
      switchMap((sessionRes) => {
        const token = sessionRes.data.session?.access_token;
        if (!token) {
          return of({ error: 'No hay sesión activa' });
        }
        return this.http.get(this.FUNCTION_URL, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }),
      catchError(err => of({ error: err.message }))
    );
  }

  getSession$() {
    return from(this.supabase.auth.getSession()).pipe(
      map(({ data }) => data.session ?? null)
    );
  }

  isAuthenticated$() {
    return this.getSession$().pipe(map((s) => !!s));
  }

  login(email: string, password: string): Observable<any> {
    return from(
      this.supabase.auth.signInWithPassword({ email, password })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          return { error: error.message };
        }
        return { data: data.user };
      })
    );
  }

  logout(): Observable<any> {
    return from(this.supabase.auth.signOut()).pipe(
      map(({ error }) => {
        if (error) {
          return { error: error.message };
        }
        return { data: 'Sesión cerrada correctamente' };
      })
    );
  }

  private hoyYYYYMMDD(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  private toTs(fecha?: string, hora?: string): number {
    if (!fecha) return Number.MAX_SAFE_INTEGER;
    const [Y, M, D] = fecha.replace(/-/g, '/').split('/').map(n => parseInt(n, 10));
    let h = 0, m = 0;
    if (hora) {
      const s = hora.trim().toUpperCase();
      const m1 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (m1) {
        h = parseInt(m1[1], 10);
        m = parseInt(m1[2], 10);
        const ap = m1[3];
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
      } else {
        const [hh, mm] = s.split(':');
        h = parseInt(hh || '0', 10);
        m = parseInt(mm || '0', 10);
      }
    }
    return new Date(Y, (M || 1) - 1, D || 1, h, m, 0, 0).getTime();
  }

  getJuegosSemanaActual(): Observable<Juego[]> {
    const hoy = this.hoyYYYYMMDD();
    const semanaId$ = from(
      this.supabase
        .from('semana')
        .select('id,inicio,fin')
        .lte('inicio', hoy)
        .gte('fin', hoy)
        .limit(1)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.[0]?.id ?? null;
      }),
      switchMap(id => {
        if (id !== null) return of(id);
        return from(
          this.supabase
            .from('semana')
            .select('id,inicio')
            .lte('inicio', hoy)
            .order('inicio', { ascending: false })
            .limit(1)
        ).pipe(map(({ data }: any) => data?.[0]?.id ?? null));
      })
    );

    return semanaId$.pipe(
      switchMap((semId) => {
        if (semId === null) return of({ juegos: [], equipos: [], asign: [] });

        return forkJoin({
          juegos: from(
            this.supabase
              .from('juegos')
              .select('*')
              .eq('semana', semId)
              .order('fecha', { ascending: true })
              .order('hora', { ascending: true })
          ).pipe(map((res: any) => res.data || [])),
          equipos: from(
            this.supabase.from('equipos').select('*')
          ).pipe(map((res: any) => res.data || [])),
          asign: from(
            this.supabase.from('asignacion').select('equipo_id,participante')
          ).pipe(map((res: any) => res.data || []))
        });
      }),
      map(({ juegos, equipos, asign }: any) => {
        const byNombre: Record<string, any> = {};
        const byId: Record<string, any> = {};
        for (const e of equipos) { byNombre[e.nombre] = e; byId[e.id] = e; }

        const participantesPorEquipoId: Record<string, string[]> = {};
        for (const a of asign as Array<{equipo_id: string; participante: string}>) {
          if (!a?.equipo_id) continue;
          const p = (a.participante || '').trim();
          if (!p) continue;
          (participantesPorEquipoId[a.equipo_id] ??= []).push(p);
        }

        const enrich = (j: any): Juego => {
          const v = byNombre[j.visitante];
          const l = byNombre[j.local];

          const listV = v ? (participantesPorEquipoId[v.id] ?? []) : [];
          const listL = l ? (participantesPorEquipoId[l.id] ?? []) : [];

          return {
            ...j,
            logoVisitante: v?.logo || '',
            logoLocal:     l?.logo || '',
            participanteVisitante: listV.join(' / '), 
            participanteLocal:     listL.join(' / '),
          } as Juego;
        };

        return (juegos as any[])
          .map(enrich)
          .sort((a: Juego, b: Juego) => this.toTs(a.fecha, a.hora) - this.toTs(b.fecha, b.hora));
      })
    );
  }

  getNextJuegoId() {
    return from(
      this.supabase
        .from('juegos')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        const last = data?.[0]?.id ?? 0;
        return (Number(last) || 0) + 1;
      })
    );
  }

  getSemanaIdPorFecha(fecha: string) {
    return from(
      this.supabase
        .from('semana')
        .select('id,inicio,fin')
        .lte('inicio', fecha)
        .gte('fin', fecha)
        .limit(1)
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.[0]?.id ?? null;
      })
    );
  }

  crearJuego(input: { visitante: string; local: string; fecha: string; hora: string }) {
    return forkJoin({
      nextId: this.getNextJuegoId(),
      semanaId: this.getSemanaIdPorFecha(input.fecha),
    }).pipe(
      switchMap(({ nextId, semanaId }) =>
        from(
          this.supabase
            .from('juegos')
            .insert([
              {
                id: nextId,
                semana: semanaId, 
                visitante: input.visitante,
                local: input.local,
                fecha: input.fecha,
                hora: input.hora,
              },
            ])
            .select()
        )
      ),
      map(({ data, error }: any) => {
        if (error) throw error;
        return data?.[0];
      })
    );
  }

  createUserAsAdmin(email: string, password: string, fullName?: string) {
    return from(this.supabase.auth.getSession()).pipe(
      switchMap(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return throwError(() => new Error('No autenticado'));

        return this.http.post(
          environment.functionCreateUserUrl,
          { email, password, fullName },
          {
            headers: new HttpHeaders({
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            })
          }
        );
      })
    );
  }

  listUsers(page = 1, perPage = 20, q = '') {
    return from(this.supabase.auth.getSession()).pipe(
      switchMap(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return of({ error: 'No autenticado' });
        const url = `${environment.functionListUsersUrl}?page=${page}&perPage=${perPage}&q=${encodeURIComponent(q)}`;
        return this.callFn(url, { headers: { Authorization: `Bearer ${token}` } });
      }),
      catchError(err => of({ error: err?.message || 'Error listando usuarios' }))
    );
  }

  deleteUser(userId: string) {
    return from(this.supabase.auth.getSession()).pipe(
      switchMap(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return of({ error: 'No autenticado' });
        return this.http.post(
          environment.functionDeleteUserUrl,
          { userId },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
      }),
      catchError(err => of({ error: err?.message || 'Error eliminando usuario' }))
    );
  }




  private callFn<T = any>(url: string, init?: RequestInit) {
    return from(this.supabase.auth.getSession()).pipe(
      switchMap(async ({ data }) => {
        let token = data.session?.access_token;
        if (!token) {
          await new Promise(r => setTimeout(r, 200));
          token = (await this.supabase.auth.getSession()).data.session?.access_token ?? undefined;
        }
        if (!token) throw new Error('No autenticado');

        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

        const res1 = await fetch(url, { ...init, headers });
        if (res1.status !== 401) {
          if (!res1.ok) throw new Error(await res1.text());
          return (await res1.json()) as T;
        }

        const r = await this.supabase.auth.refreshSession();
        const t2 = r.data.session?.access_token;
        if (!t2) throw new Error('Sesión expirada');

        const headers2 = new Headers(init?.headers);
        headers2.set('Authorization', `Bearer ${t2}`);
        if (!headers2.has('Content-Type')) headers2.set('Content-Type', 'application/json');

        const res2 = await fetch(url, { ...init, headers: headers2 });
        if (!res2.ok) throw new Error(await res2.text());
        return (await res2.json()) as T;
      })
    );
  }

  getSemanaActualId() {
    const hoy = this.hoyYYYYMMDD();
    return this.getSemanaIdPorFecha(hoy).pipe(
      switchMap(id => {
        if (id !== null) return of(id);
        return from(
          this.supabase.from('semana')
            .select('id,inicio')
            .lte('inicio', hoy)
            .order('inicio', { ascending: false })
            .limit(1)
        ).pipe(map((r: any) => r.data?.[0]?.id ?? null));
      })
    );
  }

  getExtremosSemanas() {
    return forkJoin({
      min: from(this.supabase.from('semana').select('id').order('id', { ascending: true }).limit(1))
            .pipe(map((r: any) => r.data?.[0]?.id ?? null)),
      max: from(this.supabase.from('semana').select('id').order('id', { ascending: false }).limit(1))
            .pipe(map((r: any) => r.data?.[0]?.id ?? null)),
    });
  }

  getSemanaAnteriorId(currentId: number) {
    return from(
      this.supabase.from('semana')
        .select('id')
        .lt('id', currentId)
        .order('id', { ascending: false })
        .limit(1)
    ).pipe(map((r: any) => r.data?.[0]?.id ?? null));
  }

  getSemanaSiguienteId(currentId: number) {
    return from(
      this.supabase.from('semana')
        .select('id')
        .gt('id', currentId)
        .order('id', { ascending: true })
        .limit(1)
    ).pipe(map((r: any) => r.data?.[0]?.id ?? null));
  }

  getJuegosPorSemanaId(semId: number): Observable<Juego[]> {
    return forkJoin({
      juegos: from(
        this.supabase
          .from('juegos')
          .select('*')
          .eq('semana', semId)
          .order('fecha', { ascending: true })
          .order('hora', { ascending: true })
      ).pipe(map((res: any) => res.data || [])),
      equipos: from(this.supabase.from('equipos').select('*'))
                .pipe(map((res: any) => res.data || [])),
      asign: from(this.supabase.from('asignacion').select('equipo_id,participante'))
              .pipe(map((res: any) => res.data || []))
    }).pipe(
      map(({ juegos, equipos, asign }: any) => {
        const byNombre: Record<string, any> = {};
        const byId: Record<string, any> = {};
        for (const e of equipos) { byNombre[e.nombre] = e; byId[e.id] = e; }

        const participantesPorEquipoId: Record<string, string[]> = {};
        for (const a of asign as Array<{equipo_id: string; participante: string}>) {
          if (!a?.equipo_id) continue;
          const p = (a.participante || '').trim();
          if (!p) continue;
          (participantesPorEquipoId[a.equipo_id] ??= []).push(p);
        }

        const enrich = (j: any): Juego => {
          const v = byNombre[j.visitante];
          const l = byNombre[j.local];
          const listV = v ? (participantesPorEquipoId[v.id] ?? []) : [];
          const listL = l ? (participantesPorEquipoId[l.id] ?? []) : [];

          return {
            ...j,
            logoVisitante: v?.logo || '',
            logoLocal:     l?.logo || '',
            participanteVisitante: listV.join(' / '),
            participanteLocal:     listL.join(' / '),
          } as Juego;
        };

        return (juegos as any[])
          .map(enrich)
          .sort((a: Juego, b: Juego) => this.toTs(a.fecha, a.hora) - this.toTs(b.fecha, b.hora));
      })
    );
  }

  assignEquipo(participanteNombre: string, division: string, equipoId: string | null) {
    return this.getEquipoIdsPorDivision(division).pipe(
      switchMap((idsMismaDivision) => {
        const delParticipante$ = idsMismaDivision.length
          ? from(
              this.supabase
                .from('asignacion')
                .delete()
                .eq('participante', participanteNombre)
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
            .insert([{ equipo_id: equipoId, participante: participanteNombre }])
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


  resetAsignaciones() {
    return from(this.supabase.from('asignacion').delete().neq('equipo_id', ''))
      .pipe(
        map(({ error }: any) => {
          if (error) throw error;
          return { ok: true };
        })
      );
  }

  actualizarPuntaje(id: string, pg: number, pe: number, pp: number, pw: number, pd: number, pc: number, sb: number): Observable<any> {
    return from(
      this.supabase
        .from('equipos')
        .update({ 
          pg: pg,
          pe: pe,
          pp: pp,
          pw: pw,
          pd: pd,
          pc: pc,
          sb: sb,
        })
        .eq('id', id)
    );
  }  

  resetPuntajes(): Observable<any> {
    return from(
      this.supabase
        .from('equipos')
        .update({ 
          pg: 0,
          pe: 0,
          pp: 0,
          pw: 0,
          pd: 0,
          pc: 0,
          sb: 0,
        })
        .not('id', 'is', null)
    );
  }

  acumularPuntajesEnParticipantes() {
    return forkJoin({
      asign: from(
        this.supabase
          .from('asignacion')
          .select('participante, equipos!inner(pg, pe, pp, pw, pd, pc, sb)')
      ),
      parts: from(
        this.supabase
          .from('participantes')
          .select('id,nombre,acumulado')
      )
    }).pipe(
      switchMap(({ asign, parts }: any) => {
        if (asign.error) throw asign.error;
        if (parts.error) throw parts.error;

        const totales: Record<string, number> = {};
        for (const row of asign.data ?? []) {
          const nombre = (row.participante || '').trim();
          const pts = Number((row.equipos?.pg ?? 0) * 10 + (row.equipos?.pe ?? 0) * 5 + (row.equipos?.pw ?? 0) * 20 + (row.equipos?.pd ?? 0) * 30 + (row.equipos?.pc ?? 0) * 40 + (row.equipos?.pe ?? 0) * 50);
          if (!nombre || !pts) continue;
          totales[nombre] = (totales[nombre] ?? 0) + pts;
        }

        const updates = (parts.data ?? [])
          .filter((p: any) => totales[p.nombre])
          .map((p: any) =>
            from(
              this.supabase
                .from('participantes')
                .update({ acumulado: Number(p.acumulado ?? 0) + totales[p.nombre] })
                .eq('id', p.id)
            )
          );

        if (!updates.length) return of({ ok: true, updated: 0 });
        return forkJoin(updates).pipe(map(() => ({ ok: true, updated: updates.length })));
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

  getAsignaciones() {
    return from(
      this.supabase
        .from('asignacion')
        .select('id,equipo_id,participante')
        .order('equipo_id', { ascending: true })
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as Asignacion[];
      })
    );
  }


}

