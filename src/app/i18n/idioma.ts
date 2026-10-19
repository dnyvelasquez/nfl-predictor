import { Injectable, signal } from '@angular/core';
import { ES } from './textos.es';
import { EN } from './textos.en';
import type { Clave } from './claves';

export type { Clave } from './claves';

// Idioma de la interfaz. Se traduce en el navegador (sin recargar ni cambiar la
// URL): el idioma vive en una signal, y todo lo que la lee en una plantilla
// (el pipe `t`, o un helper del componente que llame a `t()`) se vuelve a
// pintar solo al cambiarla. Arranca con el idioma guardado o, si no hay, en
// español (decisión del usuario: el idioma del navegador no se tiene en cuenta).
//
// Los textos comunes y los de las páginas del bundle inicial (encabezado,
// portada, juegos, tabla) están en `textos.es.ts` / `textos.en.ts`. Cada página
// de carga diferida trae los suyos en su propio `textos.ts` y los registra con
// `registrarTextos()` al cargarse, para no engordar el bundle inicial. El tipo
// `Clave` (claves.ts) junta todas las claves solo a nivel de tipos.

export type Idioma = 'es' | 'en';

export const IDIOMAS: { value: Idioma; label: string }[] = [
  { value: 'es', label: 'ES' },
  { value: 'en', label: 'EN' },
];

const CLAVE_STORAGE = 'nfl-predictor.idioma';
const DICCIONARIOS: Record<Idioma, Record<string, string>> = { es: { ...ES }, en: { ...EN } };

/** Agrega los textos de una página de carga diferida (se llama al cargar su módulo). */
export function registrarTextos(es: Record<string, string>, en: Record<string, string>): void {
  Object.assign(DICCIONARIOS.es, es);
  Object.assign(DICCIONARIOS.en, en);
}

function existe(clave: string): boolean {
  return clave in DICCIONARIOS.es;
}

/** Parámetros de un texto: "{n} puntos" con { n: 3 }. */
export type Params = Record<string, string | number | null | undefined>;

function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (guardado === 'es' || guardado === 'en') return guardado;
  } catch { /* sin storage: español */ }
  return 'es';
}

/** Traduce una clave sin depender de Angular (para módulos puros). */
export function traducir(idioma: Idioma, clave: Clave, params?: Params): string {
  let texto: string = DICCIONARIOS[idioma][clave] ?? DICCIONARIOS.es[clave] ?? clave;
  if (params) {
    for (const [k, v] of Object.entries(params)) texto = texto.split(`{${k}}`).join(v == null ? "" : String(v));
  }
  return texto;
}

/** Nombre de una etapa ('regular', 'wildcard', ...). */
export function traducirEtapa(idioma: Idioma, etapa: string): string {
  const clave = `etapa.${etapa}` as Clave;
  return existe(clave) ? traducir(idioma, clave) : etapa;
}

/** `juegos.periodo` viene de la base en español ("3er cuarto"); desconocido, se deja como está. */
export function traducirPeriodo(idioma: Idioma, periodo: string | null | undefined): string {
  if (!periodo) return '';
  const clave = `periodo.${periodo}` as Clave;
  return existe(clave) ? traducir(idioma, clave) : periodo;
}

/** Los errores de las funciones SQL llegan en español; si hay traducción se usa, si no el original. */
export function traducirErrorBase(idioma: Idioma, mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  const clave = `db.${mensaje}` as Clave;
  return existe(clave) ? traducir(idioma, clave) : mensaje;
}

@Injectable({ providedIn: 'root' })
export class IdiomaService {
  readonly actual = signal<Idioma>(idiomaInicial());

  constructor() {
    this.aplicarAlDocumento(this.actual());
  }

  cambiar(idioma: Idioma): void {
    this.actual.set(idioma);
    try { localStorage.setItem(CLAVE_STORAGE, idioma); } catch { /* sin storage: dura la sesión */ }
    this.aplicarAlDocumento(idioma);
  }

  /** Texto en el idioma actual. Leído desde una plantilla, se actualiza al cambiar de idioma. */
  t(clave: Clave, params?: Params): string {
    return traducir(this.actual(), clave, params);
  }

  private aplicarAlDocumento(idioma: Idioma): void {
    if (typeof document !== 'undefined') document.documentElement.lang = idioma;
  }
}
