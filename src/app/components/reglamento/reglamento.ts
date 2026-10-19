import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { GruposService, GrupoDisponible, ModoGrupo, MODOS_GRUPO, formatearApuesta } from '../../services/grupos';
import { IdiomaService, registrarTextos } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
import { ES_REGLAMENTO, EN_REGLAMENTO } from './textos';
import { SelectorGrupo } from '../selector-grupo/selector-grupo';

registrarTextos(ES_REGLAMENTO, EN_REGLAMENTO);

/**
 * Reglamento. Hay uno por modo de juego (Equipos y Pronóstico), los dos
 * públicos: se muestra el del modo del grupo elegido (Equipos sin grupo) y se
 * puede pasar al otro. Lo que depende del grupo (por ahora el valor de la
 * apuesta) solo se ve con sesión y sale del grupo elegido. Si en el futuro un
 * grupo tiene reglas propias, deben salir de `grupo()` igual que la apuesta.
 */
@Component({
  selector: 'app-reglamento',
  standalone: true,
  imports: [
    RouterModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatButtonToggleModule,
    NgTemplateOutlet,
    SelectorGrupo,
    TPipe
  ],
  templateUrl: './reglamento.html',
  styleUrls: ['./reglamento.css']
})
export class Reglamento {
  private gruposService = inject(GruposService);
  private idioma = inject(IdiomaService);

  /** Las reglas están escritas en los dos idiomas en el HTML; se muestra la del idioma actual. */
  en = computed(() => this.idioma.actual() === 'en');

  cargado = signal(false);
  logueado = signal(false);
  grupos = signal<GrupoDisponible[]>([]);
  grupoId = signal<string | null>(null);

  grupo = computed(() => this.grupos().find((g) => g.id === this.grupoId()) ?? null);
  apuesta = computed(() => {
    const g = this.grupo();
    return g ? formatearApuesta(g) : null;
  });

  readonly modos = MODOS_GRUPO;
  readonly etiquetaModo = (modo: ModoGrupo) => this.idioma.t(`modo.${modo}` as 'modo.equipos');
  /** Modo que el usuario eligió leer; null = el del grupo elegido (o Equipos sin grupo). */
  modoElegido = signal<ModoGrupo | null>(null);
  modo = computed<ModoGrupo>(() => this.modoElegido() ?? this.grupo()?.modo ?? 'equipos');

  cambiarGrupo(id: string): void {
    this.grupoId.set(id);
    this.modoElegido.set(null);
  }

  constructor() {
    this.gruposService.contexto$().subscribe(({ logueado, grupos, seleccionado }) => {
      this.logueado.set(logueado);
      this.grupos.set(grupos);
      this.grupoId.set(seleccionado);
      this.cargado.set(true);
    });
  }
}
