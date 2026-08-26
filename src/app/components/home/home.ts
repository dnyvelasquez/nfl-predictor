import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { CommonModule } from '@angular/common';
import { Observable, Subject, BehaviorSubject, of } from 'rxjs';
import { map, shareReplay, catchError, switchMap,
  startWith, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ParticipanteDialog } from '../participante-dialog/participante-dialog';
import { Service, Participante } from '../../services/data';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatIconModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Home implements OnInit, OnDestroy {

  displayedColumns: string[] = ['nombre', 'puntaje'];

  private refreshTrigger$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);

  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  participantes$: Observable<Participante[]>;

  private dialog = inject(MatDialog);
  private service = inject(Service);

  constructor() {
    this.participantes$ = this.refreshTrigger$.pipe(
      startWith(null),
      debounceTime(100),
      distinctUntilChanged(),
      switchMap(() => {
        this.loadingSubject.next(true);
        this.errorSubject.next(null);
        return this.service.getParticipantesConPuntaje().pipe(
          catchError(error => {
            console.error('Error loading participants:', error);
            this.errorSubject.next('Error al cargar los participantes. Por favor, intenta de nuevo.');
            return of([]);
          })
        );
      }),
      map(participantes => {
        this.loadingSubject.next(false);
        return participantes;
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  ngOnInit(): void {
  }

  refreshData(): void {
    this.refreshTrigger$.next();
  }

  abrirDetalleParticipante(participante: Participante): void {
    if (this.dialog.openDialogs.length > 0) {
      return;
    }

    this.dialog.open(ParticipanteDialog, {
      width: 'auto',
      maxWidth: '90vw',
      data: participante,
      panelClass: 'participante-dialog-panel',
      disableClose: false,
      autoFocus: true,
      restoreFocus: true
    });
  }

  trackByParticipanteId(index: number, participante: Participante): string {
    return participante.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.refreshTrigger$.complete();
    this.loadingSubject.complete();
    this.errorSubject.complete();
  }
}
