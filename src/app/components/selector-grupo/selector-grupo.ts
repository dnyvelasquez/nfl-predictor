import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { GrupoDisponible, GruposService } from '../../services/grupos';

/**
 * Selector del grupo que se está viendo. Con un solo grupo muestra su nombre;
 * con varios, un desplegable. Recuerda la elección (`GruposService.recordarGrupo`)
 * para que todas las páginas muestren el mismo grupo.
 */
@Component({
  selector: 'app-selector-grupo',
  standalone: true,
  imports: [MatSelectModule],
  template: `
    @if (grupos.length > 1) {
      <mat-select class="selector" [value]="grupoId" (selectionChange)="elegir($event.value)" aria-label="Grupo">
        @for (g of grupos; track g.id) {
          <mat-option [value]="g.id">{{ g.nombre }}</mat-option>
        }
      </mat-select>
    } @else if (grupos.length === 1) {
      <span class="nombre">{{ grupos[0].nombre }}</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .selector { min-width: 160px; max-width: 220px; }
    .nombre { font-size: 0.85rem; opacity: 0.75; }
  `]
})
export class SelectorGrupo {
  @Input() grupos: GrupoDisponible[] = [];
  @Input() grupoId: string | null = null;
  @Output() cambio = new EventEmitter<string>();

  private gruposService = inject(GruposService);

  elegir(grupoId: string) {
    this.gruposService.recordarGrupo(grupoId);
    this.cambio.emit(grupoId);
  }
}
