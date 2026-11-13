import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, forkJoin } from 'rxjs';
import { EquiposService, EquipoFicha } from '../../services/equipos';
import { JuegosService } from '../../services/juegos';
import { fechaCortaLocal, horaLocal, tieneHora, zonaHorariaLocal } from '../../services/core/hora-local';
import { IdiomaService, registrarTextos, traducirEtapa, traducirPeriodo } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
import { ES_EQUIPO_DIALOGO, EN_EQUIPO_DIALOGO } from './textos';
import { armarTemporada, PartidoEquipo, TemporadaEquipo, textoMarca, Marca } from './temporada';

registrarTextos(ES_EQUIPO_DIALOGO, EN_EQUIPO_DIALOGO);

export interface EquipoDialogData { nombre: string; }

const REFRESCO_MS = 60_000;

/**
 * Temporada de un equipo: marca, partidos jugados con marcador, en vivo y por
 * jugar. Se abre desde cualquier mascota, logo o nombre de equipo
 * (`EquipoDialogService`). Tocar un rival cambia el diálogo a ese equipo, con
 * un botón para volver.
 */
@Component({
  selector: 'app-equipo-dialog',
  standalone: true,
  imports: [NgTemplateOutlet, MatDialogModule, MatIconModule, MatProgressSpinnerModule, TPipe],
  templateUrl: './equipo-dialog.html',
  styleUrls: ['./equipo-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipoDialog implements OnInit {
  private equiposService = inject(EquiposService);
  private juegosService = inject(JuegosService);
  private dialogRef = inject(MatDialogRef<EquipoDialog>);
  private data = inject<EquipoDialogData>(MAT_DIALOG_DATA);
  protected idioma = inject(IdiomaService);

  readonly nombre = signal(this.data.nombre);
  readonly anteriores = signal<string[]>([]);
  readonly equipo = signal<EquipoFicha | null>(null);
  readonly temporada = signal<TemporadaEquipo | null>(null);
  readonly cargando = signal(true);
  readonly error = signal(false);
  readonly zona = zonaHorariaLocal();

  private sub?: Subscription;
  private refresco?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      clearTimeout(this.refresco);
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(silencioso = false): void {
    this.sub?.unsubscribe();
    clearTimeout(this.refresco);
    const nombre = this.nombre();
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(false);
    }
    this.sub = forkJoin({
      equipo: this.equiposService.getEquipoPorNombre(nombre),
      juegos: this.juegosService.getJuegosDeEquipo(nombre),
    }).subscribe({
      next: ({ equipo, juegos }) => {
        this.equipo.set(equipo);
        const t = armarTemporada(nombre, juegos);
        this.temporada.set(t);
        this.cargando.set(false);
        if (t.enVivo.length > 0) this.refresco = setTimeout(() => this.cargar(true), REFRESCO_MS);
      },
      error: (e) => {
        console.error('[equipo] No se pudo cargar la temporada', e);
        if (!silencioso) this.error.set(true);
        this.cargando.set(false);
      },
    });
  }

  verRival(p: PartidoEquipo): void {
    if (!p.rival || p.rival === 'TBD') return;
    this.anteriores.update(a => [...a, this.nombre()]);
    this.nombre.set(p.rival);
    this.equipo.set(null);
    this.temporada.set(null);
    this.cargar();
  }

  volver(): void {
    const a = this.anteriores();
    if (!a.length) return;
    this.nombre.set(a[a.length - 1]);
    this.anteriores.set(a.slice(0, -1));
    this.equipo.set(null);
    this.temporada.set(null);
    this.cargar();
  }

  ultimoAnterior(): string {
    const a = this.anteriores();
    return a[a.length - 1] ?? '';
  }

  cerrar(): void {
    this.dialogRef.close();
  }

  // ---- Presentación ----

  conferencia(division: string | undefined): 'AFC' | 'NFC' | null {
    return division?.startsWith('AFC') ? 'AFC' : division?.startsWith('NFC') ? 'NFC' : null;
  }

  marcaRegular(m: Marca): string {
    return `${m.g}-${m.p}-${m.e}`;
  }

  marca(m: Marca): string {
    return textoMarca(m);
  }

  tieneMarca(m: Marca): boolean {
    return m.g + m.p + m.e > 0;
  }

  diferencia(t: TemporadaEquipo): string {
    const d = t.favor - t.contra;
    return d > 0 ? `+${d}` : String(d);
  }

  racha(t: TemporadaEquipo): string {
    if (!t.racha) return '–';
    return `${this.idioma.t(('eqd.' + t.racha.resultado) as 'eqd.G')}${t.racha.n}`;
  }

  letra(p: PartidoEquipo): string {
    return p.resultado ? this.idioma.t(('eqd.' + p.resultado) as 'eqd.G') : '';
  }

  textoResultado(p: PartidoEquipo): string {
    return p.resultado ? this.idioma.t(('eqd.resultado.' + p.resultado) as 'eqd.resultado.G') : '';
  }

  /** "Sem. 7" en temporada regular; el nombre de la ronda en playoffs. */
  ronda(p: PartidoEquipo): string {
    const j = p.juego;
    return j.etapa === 'regular'
      ? this.idioma.t('eqd.semana', { n: j.semana })
      : traducirEtapa(this.idioma.actual(), j.etapa);
  }

  esPlayoff(p: PartidoEquipo): boolean {
    return p.juego.etapa !== 'regular';
  }

  fecha(p: PartidoEquipo): string {
    return fechaCortaLocal(p.juego, this.idioma.actual());
  }

  hora(p: PartidoEquipo): string {
    return tieneHora(p.juego) ? horaLocal(p.juego, this.idioma.actual()) : this.idioma.t('eqd.horaPorDefinir');
  }

  periodo(p: PartidoEquipo): string {
    return traducirPeriodo(this.idioma.actual(), p.juego.periodo) || this.idioma.t('eqd.enVivo');
  }

  rival(p: PartidoEquipo): string {
    return !p.rival || p.rival === 'TBD' ? this.idioma.t('eqd.porDefinir') : p.rival;
  }

  rivalConocido(p: PartidoEquipo): boolean {
    return !!p.rival && p.rival !== 'TBD';
  }
}
