import { Component, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { Etapa, ETAPAS, Eleccion, puntosPorAcierto, resultadoComoEleccion, bonoDiferencia, TOPE_BONO_DIFERENCIA } from '../../services/core/etapas';
import { PronosticosService, pronosticoAbierto, cierrePronosticoMs } from '../../services/pronosticos';
import { JuegosService, Juego } from '../../services/juegos';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, forkJoin, of, map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { takeUntil, catchError, finalize, switchMap } from 'rxjs/operators';
import { GruposService, GrupoDisponible } from '../../services/grupos';
import { SelectorGrupo } from '../selector-grupo/selector-grupo';

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
    CommonModule,
    SelectorGrupo
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
  private service = inject(JuegosService);
  private cdr = inject(ChangeDetectorRef);

  private static readonly REFRESH_INTERVAL_MS = 60000;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private gruposService = inject(GruposService);

  // La página es pública; quién tiene cada equipo solo se ve con sesión y es el del grupo elegido.
  logueado = false;
  grupos: GrupoDisponible[] = [];
  grupoId: string | null = null;

  // Modo Pronóstico: el participante en sesión elige ganador (o empate) hasta 5 minutos antes.
  private pronosticosService = inject(PronosticosService);
  miParticipanteId: string | null = null;
  misPronosticos = new Map<number, { eleccion: Eleccion; diferencia: number | null }>();
  readonly topeDiferencia = TOPE_BONO_DIFERENCIA;
  guardando = new Set<number>();
  errorPronostico: string | null = null;
  ahora = Date.now();
  private reloj = setInterval(() => { this.ahora = Date.now(); this.cdr.markForCheck(); }, 30_000);

  get esPronostico(): boolean {
    return this.grupos.find(g => g.id === this.grupoId)?.modo === 'pronostico';
  }

  /** En Modo Equipos se muestra quién tiene cada equipo; en Modo Pronóstico no hay equipos asignados. */
  get mostrarTitulares(): boolean {
    return this.logueado && !this.esPronostico;
  }

  constructor() {
    this.loadInitialData();
  }

  cambiarGrupo(grupoId: string): void {
    this.grupoId = grupoId;
    this.loadGames();
  }

  private loadInitialData(): void {
    this.loading = true;

    forkJoin({
      contexto: this.gruposService.contexto$(),
      sem: this.service.getSemanaActualId(),
      lim: this.service.getExtremosSemanas()
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: ({ contexto, sem, lim }) => {
        this.logueado = contexto.logueado;
        this.grupos = contexto.grupos;
        this.grupoId = contexto.seleccionado;
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

    this.service.getJuegosPorSemanaId(this.currentWeekId, this.grupoId ?? undefined).pipe(
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
      this.cargarPronosticos();
    });
  }

  /** Participante del usuario en el grupo y sus pronósticos de los juegos visibles. */
  private cargarPronosticos(): void {
    this.misPronosticos = new Map();
    this.errorPronostico = null;
    const grupoId = this.grupoId;
    if (!this.logueado || !grupoId || !this.esPronostico) {
      this.miParticipanteId = null;
      return;
    }
    const ids = this.juegosAgrupados.flatMap(g => g.juegos.map(j => Number(j.id)));
    this.pronosticosService.getMiParticipanteId(grupoId).pipe(
      switchMap(participanteId => {
        this.miParticipanteId = participanteId;
        if (!participanteId) return of([]);
        return this.pronosticosService.getPronosticos(grupoId, ids).pipe(
          map(lista => lista.filter(p => p.participante_id === participanteId))
        );
      }),
      catchError(() => {
        this.errorPronostico = 'No fue posible cargar tus pronósticos.';
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(lista => {
      if (grupoId !== this.grupoId) return;
      this.misPronosticos = new Map(lista.map(p => [p.juego_id, { eleccion: p.eleccion, diferencia: p.diferencia }]));
      this.cdr.detectChanges();
    });
  }

  miPronostico(j: Juego): Eleccion | null {
    return this.misPronosticos.get(Number(j.id))?.eleccion ?? null;
  }

  miDiferencia(j: Juego): number | null {
    return this.misPronosticos.get(Number(j.id))?.diferencia ?? null;
  }

  abierto(j: Juego): boolean {
    return pronosticoAbierto(j, this.ahora);
  }

  /** Hora (Bogotá) a la que cierran los pronósticos del juego, "HH:MM". */
  horaCierre(j: Juego): string {
    const cierre = cierrePronosticoMs(j);
    if (cierre === null) return '';
    const d = new Date(cierre - 5 * 3600_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  /** El empate solo existe en temporada regular. */
  admiteEmpate(j: Juego): boolean {
    return j.etapa === 'regular';
  }

  private terminado(j: Juego): boolean {
    return j.estado === 'final' || (j.estado !== 'en_vivo' && resultadoComoEleccion(j) !== null);
  }

  /** Puntos por el ganador (null si el juego no ha terminado o no hubo pronóstico). */
  puntosPronostico(j: Juego): number | null {
    const mio = this.miPronostico(j);
    if (!mio || !this.terminado(j)) return null;
    return resultadoComoEleccion(j) === mio ? puntosPorAcierto(j.etapa) : 0;
  }

  /** Puntos por la diferencia (null si no la pronosticó o el juego no ha terminado). */
  puntosDiferencia(j: Juego): number | null {
    const dif = this.miDiferencia(j);
    if (!dif || !this.terminado(j)) return null;
    return bonoDiferencia(dif, j);
  }

  elegir(j: Juego, eleccion: Eleccion): void {
    if (this.miPronostico(j) === eleccion) return;
    // Con empate no hay diferencia; al cambiar de equipo se conserva la que había.
    this.guardar(j, eleccion, eleccion === 'empate' ? null : this.miDiferencia(j));
  }

  /** Guarda la diferencia escrita (vacía = sin diferencia). Requiere haber elegido ganador. */
  cambiarDiferencia(j: Juego, input: HTMLInputElement): void {
    const eleccion = this.miPronostico(j);
    const texto = input.value.trim();
    const valor = texto === '' ? null : Math.round(Number(texto));
    if (!eleccion || eleccion === 'empate') return;
    if (valor !== null && (!Number.isFinite(valor) || valor < 1 || valor > 99)) {
      this.errorPronostico = 'La diferencia debe ser un número entre 1 y 99.';
      input.value = this.miDiferencia(j)?.toString() ?? '';
      return;
    }
    if (valor === this.miDiferencia(j)) return;
    this.guardar(j, eleccion, valor);
  }

  private guardar(j: Juego, eleccion: Eleccion, diferencia: number | null): void {
    const grupoId = this.grupoId;
    const id = Number(j.id);
    if (!grupoId || !this.abierto(j) || this.guardando.has(id)) return;
    const anterior = this.misPronosticos.get(id);
    this.misPronosticos.set(id, { eleccion, diferencia });
    this.guardando.add(id);
    this.errorPronostico = null;
    this.pronosticosService.pronosticar(grupoId, id, eleccion, diferencia).pipe(
      finalize(() => {
        this.guardando.delete(id);
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      error: (e) => {
        if (anterior) this.misPronosticos.set(id, anterior); else this.misPronosticos.delete(id);
        this.errorPronostico = e?.message || 'No se pudo guardar el pronóstico.';
      }
    });
  }

  /** Refresca los marcadores en segundo plano, sin mostrar el spinner de carga. */
  private refreshGamesQuietly(): void {
    if (this.currentWeekId === null) return;

    this.service.getJuegosPorSemanaId(this.currentWeekId, this.grupoId ?? undefined).pipe(
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
    clearInterval(this.reloj);
    this.clearAutoRefresh();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
