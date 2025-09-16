import { Component } from '@angular/core';
import { Service, Participante, Equipo } from '../../services/data';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-tabla-puntajes',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatChipsModule,
    AsyncPipe
  ],
  templateUrl: './tabla-puntajes.html',
  styleUrls: ['./tabla-puntajes.css']
})

export class TablaPuntajes  {
  displayedColumns: string[] = ['participante', 'puntaje', 'equipos'];
  participantes$: Observable<Participante[]>;

  constructor(private service: Service) {

    this.participantes$ = this.service.getParticipantesConPuntaje();
    
  }

}

