import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy, ElementRef, afterRenderEffect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of, switchMap, catchError, map } from 'rxjs';
import { ParticipanteDialog } from '../participante-dialog/participante-dialog';
import { ParticipantesService, Participante } from '../../services/participantes';
import { JuegosService, Juego } from '../../services/juegos';
import { AuthService } from '../../services/auth/auth';
import { GruposService, GrupoDisponible } from '../../services/grupos';
import { registroEquipoEnEtapa, ETAPAS } from '../../services/core/etapas';
import { mascotaIzquierda, mascotaDerecha } from '../../services/core/mascotas';
import { horaLocal } from '../../services/core/hora-local';
import { IdiomaService, traducirPeriodo } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
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
    MatDialogModule,
    MatProgressSpinnerModule,
    TPipe
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
  private idioma = inject(IdiomaService);

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

  /** Con varios grupos (o el superusuario), cada tabla es plegable y solo una va abierta. */
  variosGrupos = computed(() => this.grupos().length > 1);
  /** Grupo con la tabla desplegada; null = todas plegadas (así arranca la portada). */
  abierto = signal<string | null>(null);

  /** Fase actual = la etapa más avanzada que ya tiene asignaciones en el grupo. */
  private faseActual = computed(() => {
    const conAsignacion = new Set(
      (this.participantes() ?? []).flatMap((p) => (p.equiposPorEtapa ?? []).map((g) => g.etapa))
    );
    return [...ETAPAS].reverse().find((e) => conAsignacion.has(e.value))?.value ?? null;
  });

  /** En parejas: si no caben en un renglón, bajan de a dos (2 + 2, no 3 + 1). */
  equiposEnFase(p: Participante) {
    const equipos = (p.equiposPorEtapa?.find((g) => g.etapa === this.faseActual())?.equipos ?? [])
      .filter((item) => item.equipo.logo);
    const parejas = [];
    for (let i = 0; i < equipos.length; i += 2) parejas.push(equipos.slice(i, i + 2));
    return parejas;
  }

  ahora = signal(Date.now());

  destacado = computed(() => elegirDestacado([...this.juegosSemana(), ...this.juegosSiguiente()]));
  listaSemana = computed(() => ordenarSemana(this.juegosSemana()));
  nombreGrupo = computed(() => this.grupos().find(g => g.id === this.grupoId())?.nombre ?? '');

  // Helpers para el template (los que muestran texto leen el idioma actual).
  etiquetaPrime = (j: Juego) => etiquetaPrime(j, this.idioma.actual());
  fechaCorta = (j: Juego) => fechaCorta(j, this.idioma.actual());
  horaLocal = (j: Juego) => horaLocal(j, this.idioma.actual());
  periodo = (p: string) => traducirPeriodo(this.idioma.actual(), p);
  estado = estadoVisible;
  mascotaIzquierda = mascotaIzquierda;
  mascotaDerecha = mascotaDerecha;

  private refresco?: ReturnType<typeof setTimeout>;
  private reloj?: ReturnType<typeof setInterval>;
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observadorAncho?: ResizeObserver;

  constructor() {
    // Al cambiar la tabla se vuelve a decidir si los logos van en uno o dos renglones.
    afterRenderEffect(() => {
      this.participantes();
      this.abierto();
      this.cargando();
      this.cargandoTabla();
      this.ajustarRenglonesLogos();
    });
  }

  ngOnInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.observadorAncho = new ResizeObserver(() => this.ajustarRenglonesLogos());
      this.observadorAncho.observe(this.host.nativeElement);
    }
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
    this.observadorAncho?.disconnect();
  }

  /**
   * Si en alguna fila los logos no caben en un renglón, todas las filas los
   * muestran en dos (de a dos). Se mide con el diseño natural (sin la clase)
   * y se aplica directo sobre el DOM, antes de pintar, para que no parpadee.
   */
  private ajustarRenglonesLogos(): void {
    const card = this.host.nativeElement.querySelector('.posiciones');
    if (!card) return;
    card.classList.remove('logos-en-dos-renglones');
    const algunaPartida = Array.from(card.querySelectorAll('.equipos-fase')).some((fila) => {
      const parejas = Array.from(fila.children) as HTMLElement[];
      return parejas.some((pareja) => pareja.offsetTop !== parejas[0].offsetTop);
    });
    card.classList.toggle('logos-en-dos-renglones', algunaPartida);
  }

  /**
   * Abre la tabla de un grupo (plegando la que estuviera abierta) o la pliega
   * si ya estaba abierta. El grupo abierto pasa a ser el elegido: también
   * define qué participante se muestra en cada equipo de los juegos.
   */
  alternarGrupo(grupoId: string): void {
    if (this.abierto() === grupoId) {
      this.abierto.set(null);
      return;
    }
    this.abierto.set(grupoId);
    if (grupoId !== this.grupoId()) {
      this.grupoId.set(grupoId);
      this.gruposService.recordarGrupo(grupoId);
      this.participantes.set(null);
      this.cargarJuegos();
    }
    if (this.participantes() === null) this.cargarTabla();
  }

  cuentaRegresiva(j: Juego): string | null {
    return cuentaRegresiva(j, this.ahora(), this.idioma.actual());
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
        if (!silencioso) this.error.set(this.idioma.t('home.errorJuegos'));
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
    // Con varios grupos la tabla se carga al abrirla (ver `alternarGrupo`).
    if (!this.logueado() || !grupoId || (this.variosGrupos() && this.abierto() !== grupoId)) {
      this.participantes.set(null);
      return;
    }
    this.cargandoTabla.set(true);
    this.participantesService.getParticipantesConPuntaje(grupoId).pipe(
      catchError(() => of([] as Participante[]))
    ).subscribe((lista) => {
      if (grupoId !== this.grupoId()) return; // se abrió otro grupo mientras cargaba
      this.participantes.set(lista);
      this.cargandoTabla.set(false);
    });
  }
}
