import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { TablaPuntajes } from './components/tabla-puntajes/tabla-puntajes';
import { Juegos } from './components/juegos/juegos';
import { authGuard, rolGuard } from '../app/auth-guard';
import { guestGuard } from './guest-guard';

export const routes: Routes = [

  { path: '', component: Home, pathMatch: 'full' },
  { path: 'tabla-puntajes', component: TablaPuntajes },
  { path: 'equipos', loadComponent: () => import('./components/equipos/equipos').then(m => m.Equipos) },
  { path: 'juegos', component: Juegos },
  { path: 'fixture', loadComponent: () => import('./components/fixture/fixture').then(m => m.Fixture) },
  { path: 'ranking', loadComponent: () => import('./components/ranking/ranking').then(m => m.Ranking) },
  { path: 'reglamento', loadComponent: () => import('./components/reglamento/reglamento').then(m => m.Reglamento) },

  // Login, páginas de admin y las públicas menos visitadas (equipos, fixture,
  // ranking, reglamento) se cargan solo al abrirlas (lazy loading), para que la
  // carga inicial quede en lo que usa la portada.
  { path: 'login', loadComponent: () => import('./components/login/login').then(m => m.Login), canActivate: [guestGuard] },

  { path: 'admin', loadComponent: () => import('./components/admin/admin').then(m => m.Admin), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'nuevo-usuario', loadComponent: () => import('./components/nuevo-usuario/nuevo-usuario').then(m => m.NuevoUsuario), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'borrar-usuario', loadComponent: () => import('./components/borrar-usuario/borrar-usuario').then(m => m.BorrarUsuario), canActivate: [authGuard, rolGuard('superusuario')] },
  { path: 'ingresar-juego', loadComponent: () => import('./components/ingresar-juego/ingresar-juego').then(m => m.IngresarJuego), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'participantes', loadComponent: () => import('./components/participantes/participantes').then(m => m.Participantes), canActivate: [authGuard, rolGuard('administrador')] },
  { path: 'asignacion', loadComponent: () => import('./components/asignacion/asignacion').then(m => m.Asignacion), canActivate: [authGuard, rolGuard('administrador')] },

  { path: '**', redirectTo: '' }

];
