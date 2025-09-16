import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { combineLatest, Observable, map, switchMap, forkJoin } from 'rxjs';

export interface Participante {
  nombre: string;
}

export interface Equipo {
  nombre: string;
  puntaje: number;
  division: string;
  logo: string;
  participante: string;
}

@Injectable({
  providedIn: 'root'
})
export class Service { 

  private dataUrl = 'https://dnyvelasquez.github.io/APIs/nflapi/nflapi.json';

  constructor(private http: HttpClient) {}

  getParticipantes(): Observable<Participante[]> {
    return this.http.get<any>(this.dataUrl).pipe(map(data => data.participantes));
  }

  getEquipos(): Observable<Equipo[]> {
    return this.http.get<any>(this.dataUrl).pipe(map(data => data.equipos));
  }

  getEquiposDe(nombre: string): Observable<Equipo[]> {
    return this.getEquipos().pipe(map(equipos => equipos.filter(eq => eq.participante === nombre)));
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
                puntaje: equipos.reduce((acc, eq) => acc + eq.puntaje, 0) 
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

}

