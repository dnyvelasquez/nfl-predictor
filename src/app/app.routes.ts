import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { Equipos } from './components/equipos/equipos';
import { TablaPuntajes } from './components/tabla-puntajes/tabla-puntajes';
import { Reglamento } from './components/reglamento/reglamento';
import { Juegos } from './components/juegos/juegos';

export const routes: Routes = [
  { path: '', component: Home }, 
  { path: 'puntajes', component: TablaPuntajes },
  { path: 'equipos', component: Equipos },
  { path: 'juegos', component: Juegos },
  { path: 'reglamento', component: Reglamento }
];