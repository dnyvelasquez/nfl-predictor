import { Component } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';

import { CommonModule } from '@angular/common';
import { Service, Participante } from '../../services/data';

type ParticipanteConPuntaje = Participante & { puntaje: number };

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    
    MatCardModule,
    MatDividerModule,
    MatTableModule
  
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class Home {
  participantes: ParticipanteConPuntaje[] = [];
  displayedColumns: string[] = ['nombre', 'puntaje'];

  constructor(private service: Service) {
    this.participantes = this.service.getParticipantes().map(p => ({
      ...p,
      puntaje: this.service.getPuntajeDeParticipante(p.nombre)
    }));

    this.participantes.sort((a, b) => b.puntaje - a.puntaje);
  }
}




// import { Component } from '@angular/core';
// import { Service, Participante } from '../../services/data';
// import { CommonModule } from '@angular/common';

// type ParticipanteConPuntaje = Participante & { puntaje: number };

// @Component({
//   selector: 'app-home',
//   standalone: true,
//   imports: [CommonModule], 
//   templateUrl: './home.html',
//   styleUrls: ['./home.css']
// })
// export class Home {
//   participantes: ParticipanteConPuntaje[] = [];

//   constructor(private service: Service) {

//     this.participantes = this.service.getParticipantes().map(p => ({
//       ...p,
//       puntaje: this.service.getPuntajeDeParticipante(p.nombre) 
//     }));

//     this.participantes.sort((a, b) => b.puntaje - a.puntaje);
//   }

//  equiposDe(nombre: string) {
//     return this.service.getEquiposDe(nombre);
//   }

// puntajeDe(nombre: string) {
//     return this.service.getPuntajeDeParticipante(nombre);
//   }

// }
