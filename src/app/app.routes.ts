import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { Equipos } from './components/equipos/equipos';
import { TablaPuntajes } from './components/tabla-puntajes/tabla-puntajes';
import { Reglamento } from './components/reglamento/reglamento';

export const routes: Routes = [
  { path: '', component: Home }, 
  { path: 'equipos', component: Equipos },
  { path: 'puntajes', component: TablaPuntajes },
  { path: 'reglamento', component: Reglamento }
];