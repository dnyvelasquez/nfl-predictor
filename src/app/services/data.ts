import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, forkJoin, BehaviorSubject, catchError } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

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

  getJuegosPorSemana(semana: string): Observable<Juego[]> {
    return forkJoin({
      juegos: from(
        this.supabase
          .from('juegos')
          .select('*')
          .eq('semana', semana)
      ).pipe(map((res: any) => res.data || [])),
      equipos: from(
        this.supabase
          .from('equipos')
          .select('*')
      ).pipe(map((res: any) => res.data || []))
    }).pipe(
      map(({ juegos, equipos }) =>
        juegos.map((juego: any) => {
          const visitante = equipos.find((e: any) => e.nombre === juego.visitante);
          const local = equipos.find((e: any) => e.nombre === juego.local);

          return {
            ...juego,
            logoVisitante: visitante?.logo || '',
            logoLocal: local?.logo || '',
            participanteVisitante: visitante?.participante || '',
            participanteLocal: local?.participante || ''
          };
        })
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




}
