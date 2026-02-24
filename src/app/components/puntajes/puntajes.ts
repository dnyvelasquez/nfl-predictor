import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ],
  templateUrl: './puntajes.html',
  styleUrls: ['./puntajes.css']
})
export class Puntajes {

  equipos$: Observable<Equipo[]>;

  constructor(private service: Service, private router: Router) {

    this.equipos$ = this.service.getEquipos(); 

  }

  guardarPuntos(equipo: Equipo) {
    this.service.actualizarPuntaje(equipo.id, equipo.pg, equipo.pe, equipo.pp, equipo.pw, equipo.pd, equipo.pc, equipo.sb)
      .subscribe({
        next: () => alert(`Puntaje actualizado para ${equipo.nombre}`),
        error: () => alert('Error al actualizar puntaje:')
      });
  }
  
  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }  


  resetAll() {
    const ok = confirm('¿Poner en 0 el puntaje de TODOS los equipos?');
    if (!ok) return;

    this.service.resetPuntajes().subscribe({
      next: () => {
        this.equipos$ = this.service.getEquipos();
        alert('Puntajes reiniciados a 0');
      },
      error: (e) => alert('Error al resetear puntajes: ' + (e?.message || ''))
    });
  }

  acumular() {
    const ok = confirm('¿Sumar el puntaje de cada equipo al "acumulado" de su participante?');
    if (!ok) return;

    this.service.acumularPuntajesEnParticipantes().subscribe({
      next: (r: any) => {
        alert(`Acumulado actualizado (${r?.updated ?? 0} participante(s)).`);
        this.equipos$ = this.service.getEquipos();
      },
      error: (e) => alert('Error al acumular: ' + (e?.message || ''))
    });
  }


}
