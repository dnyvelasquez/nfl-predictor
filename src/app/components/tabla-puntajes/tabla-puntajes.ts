import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ParticipantesService, Participante } from '../../services/participantes';
import { estadoEquipoEnEtapa } from '../../services/core/etapas';
import { GruposService, GrupoDisponible } from '../../services/grupos';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { catchError, filter, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SelectorGrupo } from '../selector-grupo/selector-grupo';

/** Tabla de puntajes del grupo elegido. Los datos de los grupos son privados: sin sesión se invita a iniciarla. */
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
    MatButtonModule,
    RouterModule,
    CommonModule,
    SelectorGrupo
  ],
  templateUrl: './tabla-puntajes.html',
  styleUrls: ['./tabla-puntajes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablaPuntajes {

  private service = inject(ParticipantesService);
  private gruposService = inject(GruposService);

  loading = signal(true);
  error = signal<string | null>(null);
  logueado = signal(false);
  grupos = signal<GrupoDisponible[]>([]);
  grupoId = signal<string | null>(null);

  // undefined = todavía no se sabe si hay sesión/grupo.
  private grupo$ = new BehaviorSubject<string | null | undefined>(undefined);

  participantes = signal<Participante[] | null>(null);

  private participantes$: Observable<Participante[]> = this.grupo$.pipe(
    filter((g) => g !== undefined),
    tap(() => { this.loading.set(true); this.error.set(null); }),
    switchMap((g) => !g ? of([] as Participante[]) : this.service.getParticipantesConPuntaje(g).pipe(
      catchError((error) => {
        console.error('Error loading participants:', error);
        this.error.set('Error al cargar los participantes. Por favor, recarga la página.');
        return of([] as Participante[]);
      })
    )),
    tap(() => this.loading.set(false))
  );

  constructor() {
    this.participantes$.pipe(takeUntilDestroyed()).subscribe((lista) => this.participantes.set(lista));
    this.gruposService.contexto$().subscribe(({ logueado, grupos, seleccionado }) => {
      this.logueado.set(logueado);
      this.grupos.set(grupos);
      this.grupoId.set(seleccionado);
      this.grupo$.next(seleccionado);
    });
  }

  cambiarGrupo(grupoId: string): void {
    this.grupoId.set(grupoId);
    this.grupo$.next(grupoId);
  }

  readonly estadoEquipo = estadoEquipoEnEtapa;
}
