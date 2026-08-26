import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { Service, Equipo } from '../../services/data';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-puntajes',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FormsModule
  ],
  templateUrl: './puntajes.html',
  styleUrls: ['./puntajes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Puntajes implements OnInit, OnDestroy {

  equipos: Equipo[] = [];
  loading = true;

  private destroy$ = new Subject<void>();
  private service = inject(Service);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.loadEquipos();
  }

  private loadEquipos(): void {
    this.loading = true;

    this.service.getEquipos().pipe(
      catchError(err => {
        console.error('Error loading equipos:', err);
        return of([]);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe(equipos => {
      this.equipos = equipos.filter(e => {
        const participante = (e.participante ?? '').trim();
        return participante && participante.toLowerCase() !== 'no asignado';
      });
    });
  }

  guardarPuntos(equipo: Equipo) {
    this.service.actualizarPuntaje(equipo.id, equipo.pg, equipo.pe, equipo.pp, equipo.pw, equipo.pd, equipo.pc, equipo.sb)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => alert(`Puntaje actualizado para ${equipo.nombre}`),
        error: () => alert('Error al actualizar puntaje:')
      });
  }

  resetAll() {
    const ok = confirm('¿Poner en 0 el puntaje de TODOS los equipos?');
    if (!ok) return;

    this.service.resetPuntajes().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        alert('Puntajes reiniciados a 0');
        this.loadEquipos();
      },
      error: (e) => alert('Error al resetear puntajes: ' + (e?.message || ''))
    });
  }

  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }

  acumular() {
    const ok = confirm('¿Sumar el puntaje de cada equipo al "acumulado" de su participante?');
    if (!ok) return;

    this.service.acumularPuntajesEnParticipantes().pipe(takeUntil(this.destroy$)).subscribe({
      next: (r: any) => {
        alert(`Acumulado actualizado (${r?.updated ?? 0} participante(s)).`);
        this.loadEquipos();
      },
      error: (e) => alert('Error al acumular: ' + (e?.message || ''))
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
