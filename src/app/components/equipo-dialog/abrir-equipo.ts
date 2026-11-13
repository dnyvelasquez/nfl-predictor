// Abrir la temporada de un equipo desde cualquier mascota, logo o nombre.
//
// `EquipoDialogService.abrir(nombre)` carga el diálogo (y sus textos) bajo
// demanda con `import()`, así no entra al bundle inicial. La directiva
// `[appEquipo]="nombre"` vuelve clicable cualquier elemento: clic, Enter o
// espacio, rol de botón y foco con teclado. Detiene la propagación para no
// disparar lo que tenga el contenedor (filas que abren otro diálogo o enlaces).

import { Directive, HostListener, Injectable, computed, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { IdiomaService } from '../../i18n/idioma';

@Injectable({ providedIn: 'root' })
export class EquipoDialogService {
  private dialog = inject(MatDialog);
  private abriendo = false;

  async abrir(nombre: string | null | undefined): Promise<void> {
    if (!nombre || nombre === 'TBD' || this.abriendo) return;
    this.abriendo = true;
    try {
      const { EquipoDialog } = await import('./equipo-dialog');
      this.dialog.open(EquipoDialog, {
        data: { nombre },
        width: '680px',
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: '92vh',
        panelClass: 'equipo-dialog-panel',
        autoFocus: 'dialog',
        restoreFocus: true,
      });
    } finally {
      this.abriendo = false;
    }
  }
}

@Directive({
  selector: '[appEquipo]',
  standalone: true,
  host: {
    class: 'equipo-clicable',
    '[attr.role]': 'activo() ? "button" : null',
    '[attr.tabindex]': 'activo() ? 0 : null',
    '[attr.title]': 'activo() ? etiqueta() : null',
  },
})
export class AbrirEquipo {
  readonly appEquipo = input<string | null | undefined>();
  private servicio = inject(EquipoDialogService);
  private idioma = inject(IdiomaService);

  readonly activo = computed(() => {
    const n = this.appEquipo();
    return !!n && n !== 'TBD';
  });
  readonly etiqueta = computed(() => this.idioma.t('equipo.verTemporada', { equipo: this.appEquipo() ?? '' }));

  @HostListener('click', ['$event'])
  @HostListener('keydown.enter', ['$event'])
  @HostListener('keydown.space', ['$event'])
  abrir(event: Event): void {
    if (!this.activo()) return;
    event.preventDefault();
    event.stopPropagation();
    this.servicio.abrir(this.appEquipo());
  }
}
