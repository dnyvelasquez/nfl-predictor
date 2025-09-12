import { Component } from '@angular/core';
import { Service, Participante, Equipo } from '../../services/data';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';

type ParticipanteConPuntaje = Participante & { puntaje: number };

@Component({
  selector: 'app-tabla-puntajes',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatChipsModule
  ], 
  templateUrl: './tabla-puntajes.html',
  styleUrls: ['./tabla-puntajes.css'] 
})
export class TablaPuntajes {
  displayedColumns: string[] = ['participante', 'puntaje', 'equipos'];


  participantes: ParticipanteConPuntaje[] = [];

  constructor(private service: Service) {
    this.participantes = this.service.getParticipantes().map(p => ({
      ...p,
      puntaje: this.service.getPuntajeDeParticipante(p.nombre)
    }));
    
    this.participantes.sort((a, b) => b.puntaje - a.puntaje);
  }

  equiposDe(nombre: string): Equipo[] {
    return this.service.getEquiposDe(nombre);
  }

}
