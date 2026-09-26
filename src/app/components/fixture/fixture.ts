import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { EquiposService, ConferenciaStanding, EquipoStanding } from '../../services/equipos';

const LOGOS_CONFERENCIA: Record<'AFC' | 'NFC', string> = {
  AFC: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/American_Football_Conference_logo.svg',
  NFC: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/National_Football_Conference_logo.svg',
};

@Component({
  selector: 'app-fixture',
  standalone: true,
  imports: [
    MatProgressSpinnerModule,
    MatIconModule,
    CommonModule
  ],
  templateUrl: './fixture.html',
  styleUrls: ['./fixture.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Fixture implements OnInit, OnDestroy {

  readonly logosConferencia = LOGOS_CONFERENCIA;

  conferencias: ConferenciaStanding[] = [];
  loading = true;
  error: string | null = null;

  private destroy$ = new Subject<void>();
  private service = inject(EquiposService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.service.getStandingsTemporadaRegular().pipe(
      catchError(err => {
        console.error('Error loading fixture:', err);
        this.error = 'Error al cargar el fixture. Por favor, intenta de nuevo.';
        return of([]);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe(conferencias => {
      this.conferencias = conferencias;
    });
  }

  /** Nombre de la división sin el prefijo de conferencia ("AFC East" → "East"). */
  nombreDivision(division: string): string {
    return division.replace(/^(AFC|NFC)\s*/, '');
  }

  /**
   * Clasificación a playoffs según seed_conferencia (ESPN): amarillo = seed 1
   * (única con bye en Wild Card), azul = los otros campeones de división
   * (seeds 2-4), rojo = wild cards (seeds 5-7), sin color = fuera de playoffs.
   */
  claseFila(e: EquipoStanding): string {
    const seed = e.seed_conferencia;
    if (seed === 1) return 'seed-uno';
    if (seed !== null && seed <= 4) return 'campeon-division';
    if (seed !== null && seed <= 7) return 'wildcard';
    return '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
