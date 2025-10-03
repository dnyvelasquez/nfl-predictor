import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { Service, Equipo } from '../../services/data';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-puntajes',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    AsyncPipe,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    RouterModule
  ],
  templateUrl: './puntajes.html',
  styleUrls: ['./puntajes.css']
})
export class Puntajes {

  equipos$: Observable<Equipo[]>;

  constructor(private service: Service, private router: Router) {

    this.equipos$ = this.service.getEquipos(); 

  }

  modificarPuntos(equipo: Equipo, cambio: number) {
    equipo.puntaje = (equipo.puntaje ?? 0) + cambio;
  }

  guardarPuntos(equipo: Equipo) {
    this.service.actualizarPuntaje(equipo.id, equipo.puntaje)
      .subscribe({
        next: () => console.log(`Puntaje actualizado para ${equipo.nombre}`),
        error: (err) => console.error('Error al actualizar puntaje:', err)
      });
  }
  
  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }  

}
