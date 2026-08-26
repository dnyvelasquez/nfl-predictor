import { Component, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { Service, Participante } from '../../services/data';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { catchError, shareReplay, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-tabla-puntajes',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    AsyncPipe,
    CommonModule
  ],
  templateUrl: './tabla-puntajes.html',
  styleUrls: ['./tabla-puntajes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablaPuntajes implements OnDestroy {

  participantes$: Observable<Participante[]>;
  loading$ = new Subject<boolean>();
  error$ = new Subject<string | null>();
  private destroy$ = new Subject<void>();

  private service = inject(Service);

  constructor() {
    this.loading$.next(true);

    this.participantes$ = this.service.getParticipantesConPuntaje().pipe(
      catchError(error => {
        console.error('Error loading participants:', error);
        this.error$.next('Error al cargar los participantes. Por favor, recarga la página.');
        this.loading$.next(false);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      takeUntil(this.destroy$)
    );

    this.participantes$.subscribe({
      next: () => this.loading$.next(false),
      error: () => this.loading$.next(false)
    });
  }

  trackByParticipanteId(index: number, participante: Participante): string {
    return participante.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.loading$.complete();
    this.error$.complete();
  }
}
