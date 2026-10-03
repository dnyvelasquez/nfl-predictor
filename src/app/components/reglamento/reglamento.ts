import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { catchError, map, of } from 'rxjs';
import { GruposService, formatearApuesta } from '../../services/grupos';

@Component({
  selector: 'app-reglamento',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule
  ],
  templateUrl: './reglamento.html',
  styleUrls: ['./reglamento.css']
})
export class Reglamento {
  // El valor de la apuesta (punto 26) sale de `grupos.apuesta`. La página es
  // pública y aún no distingue grupos: con uno solo se muestra su valor, con
  // varios se listan todos.
  apuestas = toSignal(
    inject(GruposService).getGrupos().pipe(
      map((grupos) => grupos
        .map((g) => ({ nombre: g.nombre, valor: formatearApuesta(g) }))
        .filter((g): g is { nombre: string; valor: string } => g.valor !== null)),
      catchError(() => of([]))
    ),
    { initialValue: null }
  );
}
