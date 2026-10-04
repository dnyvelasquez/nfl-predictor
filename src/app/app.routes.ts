import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { Equipos } from './components/equipos/equipos';
import { TablaPuntajes } from './components/tabla-puntajes/tabla-puntajes';
import { Reglamento } from './components/reglamento/reglamento';
import { Juegos } from './components/juegos/juegos';
import { Fixture } from './components/fixture/fixture';
import { Ranking } from './components/ranking/ranking';
import { authGuard, rolGuard } from '../app/auth-guard';
import { guestGuard } from './guest-guard';

export const routes: Routes = [

  { path: '', component: Home, pathMatch: 'full' },
  { path: 'tabla-puntajes', component: TablaPuntajes },
  { path: 'equipos', component: Equipos },
  { path: 'juegos', component: Juegos },
  { path: 'fixture', component: Fixture },
  { path: 'ranking', component: Ranking },
  { path: 'reglamento', component: Reglamento },

  // Login y páginas de admin se cargan solo al abrirlas (lazy loading): la
  // mayoría de visitas son a las páginas públicas y no necesitan este código.
  { path: 'login', loadComponent: () => import('./components/login/login').then(m => m.Login), canActivate: [guestGuard] },

  { path: 'admin', loadComponent: () => import('./components/admin/admin').then(m => m.Admin), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'nuevo-usuario', loadComponent: () => import('./components/nuevo-usuario/nuevo-usuario').then(m => m.NuevoUsuario), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'borrar-usuario', loadComponent: () => import('./components/borrar-usuario/borrar-usuario').then(m => m.BorrarUsuario), canActivate: [authGuard, rolGuard('superusuario')] },
  { path: 'ingresar-juego', loadComponent: () => import('./components/ingresar-juego/ingresar-juego').then(m => m.IngresarJuego), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'participantes', loadComponent: () => import('./components/participantes/participantes').then(m => m.Participantes), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'asignacion', loadComponent: () => import('./components/asignacion/asignacion').then(m => m.Asignacion), canActivate: [authGuard, rolGuard('administrador')] },

  { path: '**', redirectTo: '' }

];
