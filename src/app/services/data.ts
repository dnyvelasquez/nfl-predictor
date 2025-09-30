import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map, switchMap, forkJoin, tap } from 'rxjs';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
  providedIn: 'root'
})
export class Service { 

  private supabase: SupabaseClient;

  constructor(private http: HttpClient) {

    this.supabase = createClient(
      'https://pvbulapbudwrxukilivj.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2YnVsYXBidWR3cnh1a2lsaXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1ODU4MzcsImV4cCI6MjA3NDE2MTgzN30.ubiomG_a0XBqL8mnLu9ujyuXUSa1Zr7o_GBlMizmq0k'
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
        return res.data as Participante[]
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
        return res.data as Equipo[]
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

}

