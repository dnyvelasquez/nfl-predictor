import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { AsyncPipe } from '@angular/common';
import { Observable, map } from 'rxjs';
import { Service, Equipo } from '../../services/data';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-equipos',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    AsyncPipe,
    CommonModule
  ], 
  templateUrl: './equipos.html',
  styleUrls: ['./equipos.css']
})

export class Equipos  {

  equipos$: Observable<Equipo[]>;

  constructor(private service: Service) {

    this.equipos$ = this.service.getEquipos(); 

  }


}
