import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, forkJoin, BehaviorSubject, catchError } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';


//Descarte login prod
console.log('[ENV]', environment.production ? 'prod' : 'dev',
  environment.supabaseUrl,
  environment.supabaseAnonKey?.slice(0, 8));
//


export interface Participante {
  id: string;
  nombre: string;
  puntaje?: number;
  equipos?: Equipo[];
}

export interface Equipo {
  id: string;
  nombre: string;
  puntaje: number;
  division: string;
  logo: string;
  participante: string;
}

export interface EquipoSupa {
  id: string;
  nombre: string;
  puntaje: number;
  division: string;
  logo: string;
  participante: string;
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

@Injectable({
  providedIn: 'root',
})
export class Service { 

  private supabase: SupabaseClient;
  private loggedIn$ = new BehaviorSubject<boolean>(false);
  private FUNCTION_URL = environment.functionAuthUrl;

  constructor(private http: HttpClient) {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey
    );
  }
  
  getParticipantes(): Observable<Participante[]> {
    return from(
      this.supabase.from('participantes').select('*')
    ).pipe(
      map((res:any) => {
        if (res.error) {
          return[];
        }
        return res.data as Participante[];
      })
    );
  }

  getEquipos(): Observable<Equipo[]> {
    return from(
      this.supabase.from('equipos').select('*').order('id', { ascending: true })
    ).pipe(
      map((res:any) => {
        if (res.error) {
          return[];
        }
        return res.data as Equipo[];
      })
    );
  }

  getEquiposDe(nombre: string): Observable<Equipo[]> {
    return from(
      this.supabase
        .from('equipos')
        .select('*')
        .eq('participante', nombre)
    ).pipe(      
      map((res: any) => res.data as Equipo[])
    );
  }

  getParticipantesConPuntaje(): Observable<(Participante & { equipos: Equipo[], puntaje: number })[]> {
    return this.getParticipantes().pipe(
      switchMap(participantes =>
        forkJoin(
          participantes.map(p =>
            this.getEquiposDe(p.nombre).pipe(   
              map(equipos => ({
                ...p,
                equipos,
                puntaje: equipos.reduce((acc, eq) => acc + (eq.puntaje ?? 0), 0) 
              }))
            )
          )
        )
      ),
      map(participantesConPuntaje =>
        participantesConPuntaje.sort((a, b) => b.puntaje - a.puntaje)        
      )
    );
  }

  actualizarPuntaje(id: string, nuevoPuntaje: number): Observable<any> {
    return from(
      this.supabase
        .from('equipos')
        .update({ puntaje: nuevoPuntaje })
        .eq('id', id)
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
      if (semId === null) return of({ juegos: [], equipos: [] });

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
      });
    }),
    map(({ juegos, equipos }: any) => {
      const enriquecidos = (juegos as any[]).map((juego) => {
        const visitante = (equipos as any[]).find(e => e.nombre === juego.visitante);
        const local = (equipos as any[]).find(e => e.nombre === juego.local);
        return {
          ...juego,
          logoVisitante: visitante?.logo || '',
          logoLocal: local?.logo || '',
          participanteVisitante: visitante?.participante || '',
          participanteLocal: local?.participante || '',
        } as Juego;
      });

      return enriquecidos.sort(
        (a, b) => this.toTs(a.fecha, a.hora) - this.toTs(b.fecha, b.hora)
      );
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

}
