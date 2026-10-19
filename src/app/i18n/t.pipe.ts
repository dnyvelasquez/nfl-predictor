import { Pipe, PipeTransform, inject } from '@angular/core';
import { IdiomaService, Params } from './idioma';
import { Clave } from './textos.es';

/**
 * `{{ 'home.cargando' | t }}` o `{{ 'juegos.titulo' | t: { n: semana } }}`.
 * Impuro a propósito: la clave no cambia pero el idioma sí, y así lee la
 * signal del idioma en cada pasada de detección de cambios.
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  private idioma = inject(IdiomaService);

  transform(clave: Clave, params?: Params): string {
    return this.idioma.t(clave, params);
  }
}
