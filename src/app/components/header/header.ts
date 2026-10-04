import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { filter, forkJoin, map, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth/auth';

type Acceso = 'anonimo' | 'lectura' | 'admin';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterModule,
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule
  ],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class Header {

  private router = inject(Router);
  private authService = inject(AuthService);

  // Se recalcula en cada navegación (login y logout siempre navegan).
  // 'anonimo': "Admin" lleva a iniciar sesión. 'admin': "Admin" como siempre.
  // 'lectura': sin acceso a admin; se muestra "Cerrar sesión" en su lugar.
  acceso = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      switchMap(() => forkJoin({
        logueado: this.authService.isAuthenticated$(),
        esAdmin: this.authService.esAdministrador$(),
      })),
      map(({ logueado, esAdmin }): Acceso => !logueado ? 'anonimo' : esAdmin ? 'admin' : 'lectura')
    ),
    { initialValue: 'anonimo' as Acceso }
  );

  cerrarSesion(): void {
    this.authService.logout().subscribe(() => {
      // Pasa por otra ruta para que la portada se vuelva a montar sin sesión
      // aunque ya estuviéramos en ella.
      this.router.navigateByUrl('/login', { skipLocationChange: true })
        .then(() => this.router.navigateByUrl('/'));
    });
  }

}
