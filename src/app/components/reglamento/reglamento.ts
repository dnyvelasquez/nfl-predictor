import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { GruposService, GrupoDisponible, formatearApuesta } from '../../services/grupos';
import { SelectorGrupo } from '../selector-grupo/selector-grupo';

/**
 * Reglamento. Lo común a todos los grupos es público; lo que depende del grupo
 * (por ahora el valor de la apuesta, punto 22) solo se ve con sesión y sale del
 * grupo elegido. Si en el futuro un grupo tiene reglas propias, deben salir de
 * `grupo()` igual que la apuesta.
 */
@Component({
  selector: 'app-reglamento',
  standalone: true,
  imports: [
    RouterModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    SelectorGrupo
  ],
  templateUrl: './reglamento.html',
  styleUrls: ['./reglamento.css']
})
export class Reglamento {
  private gruposService = inject(GruposService);

  cargado = signal(false);
  logueado = signal(false);
  grupos = signal<GrupoDisponible[]>([]);
  grupoId = signal<string | null>(null);

  grupo = computed(() => this.grupos().find((g) => g.id === this.grupoId()) ?? null);
  apuesta = computed(() => {
    const g = this.grupo();
    return g ? formatearApuesta(g) : null;
  });

  constructor() {
    this.gruposService.contexto$().subscribe(({ logueado, grupos, seleccionado }) => {
      this.logueado.set(logueado);
      this.grupos.set(grupos);
      this.grupoId.set(seleccionado);
      this.cargado.set(true);
    });
  }
}
