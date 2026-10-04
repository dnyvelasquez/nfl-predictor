import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { EquiposService, Equipo, RegistroEquipoPorEtapa } from '../../services/equipos';
import { marcaEquipoPorEtapa } from '../../services/core/etapas';
import { GruposService, GrupoDisponible } from '../../services/grupos';
import { SelectorGrupo } from '../selector-grupo/selector-grupo';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

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
    MatButtonModule,
    RouterModule,
    CommonModule,
    SelectorGrupo
  ],
  templateUrl: './equipos.html',
  styleUrls: ['./equipos.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Equipos implements OnInit, OnDestroy {

  readonly marca = marcaEquipoPorEtapa;

  equipos: EquipoConEtapas[] = [];
  loading = true;
  error: string | null = null;

  private destroy$ = new Subject<void>();
  private service = inject(EquiposService);
  private cdr = inject(ChangeDetectorRef);
  private gruposService = inject(GruposService);

  // Quién tiene cada equipo es dato privado del grupo: sin sesión se invita a iniciarla.
  logueado = false;
  grupos: GrupoDisponible[] = [];
  grupoId: string | null = null;

  ngOnInit(): void {
    this.gruposService.contexto$().pipe(takeUntil(this.destroy$)).subscribe(({ logueado, grupos, seleccionado }) => {
      this.logueado = logueado;
      this.grupos = grupos;
      this.grupoId = seleccionado;
      if (seleccionado) {
        this.loadEquipos();
      } else {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  cambiarGrupo(grupoId: string): void {
    this.grupoId = grupoId;
    this.loadEquipos();
  }

  private loadEquipos(): void {
    this.loading = true;
    this.error = null;

    this.service.getEquiposConPuntajePorEtapa(this.grupoId ?? undefined).pipe(
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
