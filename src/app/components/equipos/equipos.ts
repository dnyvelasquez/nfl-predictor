import { Component, OnInit } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';

import { Service, Equipo } from '../../services/data';

@Component({
  selector: 'app-equipos',
  standalone: true,
  imports: [
    
    
    MatCardModule,
    MatDividerModule,
    MatTableModule


  ], 
  templateUrl: './equipos.html',
  styleUrl: './equipos.css'
})
export class Equipos implements OnInit {

  //
  displayedColumns: string[] = ['nombre', 'logo', 'division', 'puntaje', 'participante'];
  //


  //equipos: Equipo[] = [];

  equipos: any[] = [];

  constructor(private service: Service) {}

  ngOnInit(): void {
    this.equipos = this.service.getEquipos();
  }
}
