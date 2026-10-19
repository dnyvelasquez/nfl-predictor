import { Component, inject, computed } from '@angular/core';
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
import { AuthService, RolEnGrupo } from '../../services/auth/auth';
import { GruposService } from '../../services/grupos';
import { map } from 'rxjs';
import { IdiomaService } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
import { registrarTextosAdmin } from '../../i18n/textos.admin';

registrarTextosAdmin();

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
    RouterModule, TPipe
  ],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})

export class Admin {
  private idioma = inject(IdiomaService);

  constructor(private authService: AuthService, private router: Router) {}

  esSuperusuario = toSignal(inject(AuthService).esSuperusuario$(), { initialValue: false });
  esAdministrador = toSignal(inject(AuthService).esAdministrador$(), { initialValue: false });

  // "Super usuario", o el rol en cada grupo ("Grupo principal: Solo lectura"), en el idioma actual.
  private gruposConRol = toSignal(
    inject(GruposService).gruposDisponibles$().pipe(map(({ grupos }) => grupos)),
    { initialValue: [] }
  );
  rolLabel = computed(() => {
    const grupos = this.gruposConRol();
    const rol = (r: RolEnGrupo) => this.idioma.t(`rol.${r}` as 'rol.lectura');
    return grupos.some((g) => g.rol === 'superusuario')
      ? rol('superusuario')
      : grupos.map((g) => `${g.nombre}: ${rol(g.rol)}`).join(' · ');
  });

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }  

}


