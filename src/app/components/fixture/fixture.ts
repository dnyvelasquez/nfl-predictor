import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { CommonModule } from '@angular/common';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { EquiposService, ConferenciaStanding, EquipoStanding } from '../../services/equipos';
import { JuegosService } from '../../services/juegos';
import { armarPostemporada, rangoFechas, Postemporada, Cruce, EquipoBracket, Ronda, Conferencia, JuegoPlayoff } from './postemporada';
import { fechaCortaLocal, horaLocal, tieneHora } from '../../services/core/hora-local';
import { Etapa } from '../../services/core/etapas';
import { IdiomaService, registrarTextos, traducirPeriodo } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
import { ES_FIXTURE, EN_FIXTURE } from './textos';

registrarTextos(ES_FIXTURE, EN_FIXTURE);

const LOGOS_CONFERENCIA: Record<'AFC' | 'NFC', string> = {
  AFC: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/American_Football_Conference_logo.svg',
  NFC: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/National_Football_Conference_logo.svg',
};

const REFRESCO_EN_VIVO_MS = 60_000;

/** Columna del cuadro de postemporada: una ronda de una conferencia, o el Super Bowl. */
interface ColumnaBracket {
  clave: string;
  conf: Conferencia | null;
  ronda: Ronda;
  /** Posición al apilar en pantallas angostas: AFC, luego NFC, al final el Super Bowl. */
  orden: number;
}

@Component({
  selector: 'app-fixture',
  standalone: true,
  imports: [
    MatCardModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    CommonModule,
    TPipe
  ],
  templateUrl: './fixture.html',
  styleUrls: ['./fixture.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Fixture implements OnInit, OnDestroy {

  readonly logosConferencia = LOGOS_CONFERENCIA;

  conferencias: ConferenciaStanding[] = [];
  postemporada: Postemporada | null = null;
  columnas: ColumnaBracket[] = [];
  /** La temporada regular no ha terminado: las semillas son provisionales. */
  provisional = true;
  /** Pestaña inicial: postemporada si ya hay juegos de playoffs definidos. */
  pestana = 0;
  loading = true;
  error: string | null = null;

  private destroy$ = new Subject<void>();
  private service = inject(EquiposService);
  private juegosService = inject(JuegosService);
  private idioma = inject(IdiomaService);
  private playoffs: JuegoPlayoff[] = [];
  private cdr = inject(ChangeDetectorRef);
  private refresco?: ReturnType<typeof setTimeout>;
  private primeraCarga = true;

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    clearTimeout(this.refresco);
    forkJoin({
      conferencias: this.service.getStandingsTemporadaRegular(),
      playoffs: this.juegosService.getJuegosPostemporada().pipe(catchError(() => of([]))),
      terminada: this.juegosService.temporadaRegularTerminada().pipe(catchError(() => of(false))),
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: ({ conferencias, playoffs, terminada }) => {
        this.conferencias = conferencias;
        this.provisional = !terminada;
        this.playoffs = playoffs;
        this.postemporada = armarPostemporada(this.equiposBracket(conferencias), playoffs);
        this.columnas = this.armarColumnas(this.postemporada);
        if (this.primeraCarga) {
          this.pestana = this.postemporada.iniciada ? 1 : 0;
          this.primeraCarga = false;
        }
        this.error = null;
        this.loading = false;
        this.cdr.detectChanges();
        this.programarRefresco();
      },
      error: (err) => {
        console.error('Error loading fixture:', err);
        if (this.primeraCarga) this.error = this.idioma.t('fixture.error');
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  // Mientras haya un juego de playoffs en vivo, se refresca cada minuto.
  private programarRefresco(): void {
    const enVivo = this.columnas.some(c => c.ronda.cruces.some(x => x.estado === 'en_vivo'));
    if (enVivo) this.refresco = setTimeout(() => this.cargar(), REFRESCO_EN_VIVO_MS);
  }

  private equiposBracket(conferencias: ConferenciaStanding[]): EquipoBracket[] {
    return conferencias.flatMap(c => c.divisiones.flatMap(d => d.equipos.map(e => ({
      id: e.id, nombre: e.nombre, ciudad: e.ciudad, logo: e.logo, conf: c.conferencia,
      seed: e.seed_conferencia, wins: e.wins, losses: e.losses, ties: e.ties,
    }))));
  }

  // AFC de izquierda a derecha, Super Bowl al centro, NFC en espejo.
  private armarColumnas(p: Postemporada): ColumnaBracket[] {
    const afc = p.conferencias.find(c => c.conf === 'AFC')!.rondas;
    const nfc = p.conferencias.find(c => c.conf === 'NFC')!.rondas;
    return [
      ...afc.map((r, i) => ({ clave: 'AFC-' + r.etapa, conf: 'AFC' as Conferencia, ronda: r, orden: i + 1 })),
      { clave: 'SB', conf: null, ronda: p.superBowl, orden: 7 },
      ...[...nfc].reverse().map((r, i) => ({ clave: 'NFC-' + r.etapa, conf: 'NFC' as Conferencia, ronda: r, orden: 6 - i })),
    ];
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

  /** Título de una ronda en el idioma actual. */
  tituloRonda(etapa: Etapa): string {
    return this.idioma.t(`fixture.ronda.${etapa}` as 'fixture.ronda.wildcard');
  }

  /** Rango de fechas de una ronda en el idioma actual. */
  fechasRonda(etapa: Etapa): string | null {
    return rangoFechas(this.playoffs, etapa, this.idioma.actual());
  }

  /** Texto de estado de un cruce. */
  estadoCruce(c: Cruce): string {
    const idioma = this.idioma.actual();
    switch (c.estado) {
      case 'final': return this.idioma.t('comun.final');
      case 'en_vivo': return c.periodo
        ? this.idioma.t('fixture.enVivoPeriodo', { periodo: traducirPeriodo(idioma, c.periodo) })
        : this.idioma.t('comun.enVivo');
      case 'programado': return this.fechaHora(c);
      case 'proyectado': return this.idioma.t('fixture.proyectado');
      default: return this.idioma.t('fixture.porDefinir');
    }
  }

  /** Fecha y hora del cruce en la hora local del usuario. */
  private fechaHora(c: Cruce): string {
    const idioma = this.idioma.actual();
    if (!/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(c.fecha ?? '')) return this.idioma.t('fixture.programado');
    const hora = tieneHora(c) ? ` · ${horaLocal(c, idioma)}` : '';
    return `${fechaCortaLocal(c, idioma)}${hora}`;
  }

  esPerdedor(c: Cruce, e: EquipoBracket | null): boolean {
    return !!c.ganador && !!e && c.ganador.id !== e.id;
  }

  ngOnDestroy(): void {
    clearTimeout(this.refresco);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
