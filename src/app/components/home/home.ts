import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { CommonModule } from '@angular/common';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { Service, Participante } from '../../services/data';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,    
    MatCardModule,
    MatDividerModule,
    MatTableModule ,
    AsyncPipe, 
    MatIconModule
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})

export class Home {
  
  displayedColumns: string[] = ['nombre', 'puntaje'];
  participantes$: Observable<Participante[]>;

  constructor(private service: Service) {

    this.participantes$ = this.service.getParticipantesConPuntaje();

  }


}


