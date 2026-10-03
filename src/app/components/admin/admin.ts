import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Injectable } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService, etiquetaRol } from '../../services/auth/auth';
import { GruposService } from '../../services/grupos';
import { map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,    
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatToolbarModule,
    RouterModule
  ],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})

export class Admin {

  constructor(private authService: AuthService, private router: Router) {}

  esSuperusuario = toSignal(inject(AuthService).esSuperusuario$(), { initialValue: false });
  esAdministrador = toSignal(inject(AuthService).esAdministrador$(), { initialValue: false });

  // "Super usuario", o el rol en cada grupo ("Grupo principal: Solo lectura").
  rolLabel = toSignal(
    inject(GruposService).gruposDisponibles$().pipe(
      map(({ grupos }) =>
        grupos.some((g) => g.rol === 'superusuario')
          ? 'Super usuario'
          : grupos.map((g) => `${g.nombre}: ${etiquetaRol(g.rol)}`).join(' · ')
      )
    ),
    { initialValue: '' }
  );

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }  

}


