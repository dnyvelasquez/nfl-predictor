import { Component, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Service, Juego, Etapa, ETAPAS } from '../../services/data';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, forkJoin, of, map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { takeUntil, catchError, finalize } from 'rxjs/operators';

interface GrupoFecha {
  fecha: string;
  juegos: Juego[];
}

@Component({
  selector: 'app-juegos',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    CommonModule
  ],
  templateUrl: './juegos.html',
  styleUrls: ['./juegos.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Juegos implements OnDestroy {

  juegosAgrupados: GrupoFecha[] = [];
  currentWeekId: number | null = null;
  minWeek: number | null = null;
  maxWeek: number | null = null;
  loading = true;

  private destroy$ = new Subject<void>();
  private service = inject(Service);
  private cdr = inject(ChangeDetectorRef);

  private static readonly REFRESH_INTERVAL_MS = 60000;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.loading = true;

    forkJoin({
      sem: this.service.getSemanaActualId(),
      lim: this.service.getExtremosSemanas()
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: ({ sem, lim }) => {
        this.minWeek = lim.min;
        this.maxWeek = lim.max;
        this.currentWeekId = sem ?? lim.min ?? null;

        if (this.currentWeekId !== null) {
          this.loadGames();
        } else {
          this.loading = false;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private loadGames(): void {
    if (this.currentWeekId === null) return;

    this.clearAutoRefresh();
    this.loading = true;

    this.service.getJuegosPorSemanaId(this.currentWeekId).pipe(
      map(juegos => this.agruparPorFecha(juegos)),
      catchError(() => of([])),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe(grupos => {
      this.juegosAgrupados = grupos;
      this.scheduleAutoRefresh();
    });
  }

  /** Refresca los marcadores en segundo plano, sin mostrar el spinner de carga. */
  private refreshGamesQuietly(): void {
    if (this.currentWeekId === null) return;

    this.service.getJuegosPorSemanaId(this.currentWeekId).pipe(
      map(juegos => this.agruparPorFecha(juegos)),
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe(grupos => {
      if (grupos !== null) {
        this.juegosAgrupados = grupos;
        this.cdr.detectChanges();
      }
      this.scheduleAutoRefresh();
    });
  }

  /** Mientras haya juegos en vivo en la semana visible, reconsulta periódicamente. */
  private scheduleAutoRefresh(): void {
    this.clearAutoRefresh();
    if (!this.hayJuegosEnVivo()) return;

    this.refreshTimeoutId = setTimeout(
      () => this.refreshGamesQuietly(),
      Juegos.REFRESH_INTERVAL_MS
    );
  }

  private clearAutoRefresh(): void {
    if (this.refreshTimeoutId !== null) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }
  }

  hayJuegosEnVivo(): boolean {
    return this.juegosAgrupados.some(g => g.juegos.some(j => j.estado === 'en_vivo'));
  }

  private agruparPorFecha(juegos: Juego[]): GrupoFecha[] {
    const gruposMap = new Map<string, Juego[]>();

    for (const j of juegos) {
      if (!gruposMap.has(j.fecha)) {
        gruposMap.set(j.fecha, []);
      }
      gruposMap.get(j.fecha)!.push(j);
    }

    return Array.from(gruposMap.entries())
      .map(([fecha, juegos]) => ({
        fecha,
        juegos: juegos.sort((a, b) => a.hora.localeCompare(b.hora))
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  prevWeek(): void {
    if (this.currentWeekId === null || this.currentWeekId <= (this.minWeek ?? 0)) return;

    this.clearAutoRefresh();
    this.loading = true;
    this.service.getSemanaAnteriorId(this.currentWeekId).pipe(
      takeUntil(this.destroy$)
    ).subscribe(id => {
      if (id !== null) {
        this.currentWeekId = id;
        this.loadGames();
      } else {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  nextWeek(): void {
    if (this.currentWeekId === null || this.currentWeekId >= (this.maxWeek ?? 0)) return;

    this.clearAutoRefresh();
    this.loading = true;
    this.service.getSemanaSiguienteId(this.currentWeekId).pipe(
      takeUntil(this.destroy$)
    ).subscribe(id => {
      if (id !== null) {
        this.currentWeekId = id;
        this.loadGames();
      } else {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  etapaActual(): Etapa | null {
    return this.juegosAgrupados[0]?.juegos[0]?.etapa ?? null;
  }

  etapaLabel(etapa: Etapa): string {
    return ETAPAS.find(e => e.value === etapa)?.label ?? etapa;
  }

  trackByFecha(index: number, grupo: GrupoFecha): string {
    return grupo.fecha;
  }

  trackByJuegoId(index: number, juego: Juego): string {
    return juego.id;
  }

  ngOnDestroy(): void {
    this.clearAutoRefresh();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
