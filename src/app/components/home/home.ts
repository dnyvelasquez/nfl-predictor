import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of, switchMap, catchError, map } from 'rxjs';
import { ParticipanteDialog } from '../participante-dialog/participante-dialog';
import { ParticipantesService, Participante } from '../../services/participantes';
import { JuegosService, Juego } from '../../services/juegos';
import { AuthService } from '../../services/auth/auth';
import { GruposService, GrupoDisponible } from '../../services/grupos';
import { registroEquipoEnEtapa } from '../../services/core/etapas';
import { mascotaIzquierda, mascotaDerecha } from '../../services/core/mascotas';
import { elegirDestacado, etiquetaPrime, cuentaRegresiva, fechaCorta, ordenarSemana, estadoVisible } from './portada';

const REFRESCO_EN_VIVO_MS = 60_000;
const TICK_RELOJ_MS = 30_000;

/**
 * Portada. Para todos: el juego destacado (ver `elegirDestacado`) y los juegos
 * de la semana. Con sesión: además, la tabla de posiciones del grupo y qué
 * participante del grupo tiene cada equipo. Sin sesión, la tabla se reemplaza
 * por una invitación a iniciar sesión.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatDialogModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Home implements OnInit, OnDestroy {

  private dialog = inject(MatDialog);
  private participantesService = inject(ParticipantesService);
  private juegosService = inject(JuegosService);
  private authService = inject(AuthService);
  private gruposService = inject(GruposService);

  cargando = signal(true);
  error = signal<string | null>(null);

  logueado = signal(false);
  grupos = signal<GrupoDisponible[]>([]);
  grupoId = signal<string | null>(null);

  semanaId = signal<number | null>(null);
  private juegosSemana = signal<Juego[]>([]);
  private juegosSiguiente = signal<Juego[]>([]);
  // "G-P-E" de temporada regular por nombre de equipo (sin juegos en vivo).
  private records = signal<Record<string, string>>({});

  participantes = signal<Participante[] | null>(null);
  cargandoTabla = signal(false);

  ahora = signal(Date.now());

  destacado = computed(() => elegirDestacado([...this.juegosSemana(), ...this.juegosSiguiente()]));
  listaSemana = computed(() => ordenarSemana(this.juegosSemana()));
  nombreGrupo = computed(() => this.grupos().find(g => g.id === this.grupoId())?.nombre ?? '');

  // Helpers para el template.
  etiquetaPrime = etiquetaPrime;
  fechaCorta = fechaCorta;
  estado = estadoVisible;
  mascotaIzquierda = mascotaIzquierda;
  mascotaDerecha = mascotaDerecha;

  private refresco?: ReturnType<typeof setTimeout>;
  private reloj?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.reloj = setInterval(() => this.ahora.set(Date.now()), TICK_RELOJ_MS);

    this.authService.isAuthenticated$().pipe(
      switchMap((logueado) => {
        this.logueado.set(logueado);
        return logueado ? this.gruposService.gruposDisponibles$() : of({ grupos: [], seleccionado: null });
      }),
      catchError(() => of({ grupos: [], seleccionado: null }))
    ).subscribe(({ grupos, seleccionado }) => {
      this.grupos.set(grupos);
      this.grupoId.set(seleccionado);
      this.cargarJuegos();
      this.cargarTabla();
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.refresco);
    clearInterval(this.reloj);
  }

  cambiarGrupo(grupoId: string): void {
    this.grupoId.set(grupoId);
    this.gruposService.recordarGrupo(grupoId);
    this.cargarJuegos();
    this.cargarTabla();
  }

  cuentaRegresiva(j: Juego): string | null {
    return cuentaRegresiva(j, this.ahora());
  }

  record(nombre: string): string {
    return this.records()[nombre] ?? '';
  }

  abrirDetalleParticipante(participante: Participante): void {
    if (this.dialog.openDialogs.length > 0) return;
    this.dialog.open(ParticipanteDialog, {
      width: 'auto',
      maxWidth: '90vw',
      maxHeight: '90vh',
      data: participante,
      panelClass: 'participante-dialog-panel',
      autoFocus: true,
      restoreFocus: true
    });
  }

  // Juegos de esta semana y la siguiente (para el destacado después del Monday
  // Night), con el participante del grupo elegido en cada equipo si hay sesión.
  private cargarJuegos(silencioso = false): void {
    clearTimeout(this.refresco);
    if (!silencioso) this.cargando.set(true);
    const grupo = this.logueado() ? this.grupoId() ?? undefined : undefined;

    this.juegosService.getSemanaActualId().pipe(
      switchMap((semId: number | null) => {
        if (semId === null) return of({ semId, actual: [] as Juego[], siguiente: [] as Juego[], resultados: [] as Juego[] });
        return forkJoin({
          actual: this.juegosService.getJuegosPorSemanaId(semId, grupo),
          siguiente: this.juegosService.getJuegosPorSemanaId(semId + 1, grupo),
          resultados: this.juegosService.getJuegosConResultado(),
        }).pipe(map((r) => ({ semId, ...r })));
      })
    ).subscribe({
      next: ({ semId, actual, siguiente, resultados }) => {
        this.semanaId.set(semId);
        this.juegosSemana.set(actual);
        this.juegosSiguiente.set(siguiente);
        this.records.set(this.calcularRecords(resultados));
        this.error.set(null);
        this.cargando.set(false);
        this.programarRefresco();
      },
      error: () => {
        if (!silencioso) this.error.set('No fue posible cargar los juegos. Intenta de nuevo.');
        this.cargando.set(false);
        this.programarRefresco();
      },
    });
  }

  // Mientras haya juegos en vivo, refresca marcadores cada minuto sin spinner.
  private programarRefresco(): void {
    const hayEnVivo = [...this.juegosSemana(), ...this.juegosSiguiente()].some(j => j.estado === 'en_vivo');
    if (hayEnVivo) this.refresco = setTimeout(() => this.cargarJuegos(true), REFRESCO_EN_VIVO_MS);
  }

  private calcularRecords(resultados: Juego[]): Record<string, string> {
    const terminados = resultados.filter(j => j.estado !== 'en_vivo');
    const nombres = new Set(terminados.flatMap(j => [j.local, j.visitante]));
    const out: Record<string, string> = {};
    for (const n of nombres) {
      const { wins, losses, ties } = registroEquipoEnEtapa(n, 'regular', terminados);
      out[n] = `${wins}-${losses}-${ties}`;
    }
    return out;
  }

  private cargarTabla(): void {
    const grupoId = this.grupoId();
    if (!this.logueado() || !grupoId) {
      this.participantes.set(null);
      return;
    }
    this.cargandoTabla.set(true);
    this.participantesService.getParticipantesConPuntaje(grupoId).pipe(
      catchError(() => of([] as Participante[]))
    ).subscribe((lista) => {
      this.participantes.set(lista);
      this.cargandoTabla.set(false);
    });
  }
}
