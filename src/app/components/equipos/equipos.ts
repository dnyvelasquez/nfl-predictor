import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { Service, Equipo, RegistroEquipoPorEtapa } from '../../services/data';

type EquipoConEtapas = Equipo & { porEtapa: RegistroEquipoPorEtapa[] };

@Component({
  selector: 'app-equipos',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatIconModule,
    CommonModule
  ],
  templateUrl: './equipos.html',
  styleUrls: ['./equipos.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Equipos implements OnInit, OnDestroy {

  equipos: EquipoConEtapas[] = [];
  loading = true;
  error: string | null = null;

  private destroy$ = new Subject<void>();
  private service = inject(Service);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.loadEquipos();
  }

  private loadEquipos(): void {
    this.loading = true;
    this.error = null;

    this.service.getEquiposConPuntajePorEtapa().pipe(
      catchError(err => {
        console.error('Error loading equipos:', err);
        this.error = 'Error al cargar los equipos. Por favor, intenta de nuevo.';
        return of([]);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe(equipos => {
      this.equipos = equipos.filter(e => e.porEtapa.length > 0);
    });
  }

  trackByEquipoId(index: number, equipo: Equipo): string {
    return equipo.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
