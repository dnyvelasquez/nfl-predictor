import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';
import { EquiposService, EquipoRanking } from '../../services/equipos';
import { JuegosService } from '../../services/juegos';

/**
 * Niveles del ranking global, en el orden en que los arma scripts/sync-ranking.mjs
 * (el orden del Draft de la NFL, invertido). Supone el formato actual de 14
 * equipos en playoffs. Dentro de cada nivel, de mejor a peor récord de temporada regular.
 */
const NIVELES: { desde: number; hasta: number; titulo: string }[] = [
  { desde: 1, hasta: 1, titulo: 'Campeón del Super Bowl' },
  { desde: 2, hasta: 2, titulo: 'Subcampeón del Super Bowl' },
  { desde: 3, hasta: 4, titulo: 'Perdieron la final de conferencia' },
  { desde: 5, hasta: 8, titulo: 'Perdieron en la ronda divisional' },
  { desde: 9, hasta: 14, titulo: 'Perdieron en la ronda de comodines' },
  { desde: 15, hasta: 32, titulo: 'No clasificaron a playoffs' },
];

/** Página informativa: el ranking de la temporada anterior con el que se hizo la asignación inicial. */
@Component({
  selector: 'app-ranking',
  standalone: true,
  imports: [RouterModule, MatCardModule, MatDividerModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './ranking.html',
  styleUrls: ['./ranking.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Ranking {
  private equiposService = inject(EquiposService);
  private juegosService = inject(JuegosService);

  cargando = signal(true);
  error = signal<string | null>(null);
  private equipos = signal<EquipoRanking[]>([]);
  private anio = signal<number | null>(null);

  /** "2025-2026": la temporada anterior a la que se está jugando. */
  temporada = computed(() => {
    const a = this.anio();
    return a ? `${a - 1}-${a}` : null;
  });

  niveles = computed(() => NIVELES
    .map((n) => ({ ...n, equipos: this.equipos().filter((e) => e.ranking >= n.desde && e.ranking <= n.hasta) }))
    .filter((n) => n.equipos.length > 0));

  constructor() {
    forkJoin({
      equipos: this.equiposService.getRanking(),
      anio: this.juegosService.getAnioTemporada(),
    }).subscribe({
      next: ({ equipos, anio }) => {
        this.equipos.set(equipos);
        this.anio.set(anio);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar el ranking. Intenta de nuevo.');
        this.cargando.set(false);
      },
    });
  }

  conferencia(division: string): 'AFC' | 'NFC' {
    return division.startsWith('AFC') ? 'AFC' : 'NFC';
  }
}
