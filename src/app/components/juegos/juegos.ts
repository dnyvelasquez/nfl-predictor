import { Component } from '@angular/core';
import { Service, Juego } from '../../services/data';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-juegos',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatChipsModule,
    AsyncPipe,
    CommonModule
],
  templateUrl: './juegos.html',
  styleUrls: ['./juegos.css']
})

export class Juegos  {
  displayedColumns: string[] = ['visitante', 'local', 'fecha', 'hora'];
  juegos$: Observable<Juego[]>;

  constructor(private service: Service) {

    this.juegos$ = this.service.getJuegosPorSemana("actual");
    
  }

}

