import { Injectable, signal } from '@angular/core';
import { ES, Clave } from './textos.es';
import { EN } from './textos.en';

// Idioma de la interfaz. Se traduce en el navegador (sin recargar ni cambiar la
// URL): el idioma vive en una signal, y todo lo que la lee en una plantilla
// (el pipe `t`, o un helper del componente que llame a `t()`) se vuelve a
// pintar solo al cambiarla. Arranca con el idioma guardado o, si no hay, en
// español (decisión del usuario: el idioma del navegador no se tiene en cuenta).

export type Idioma = 'es' | 'en';

export const IDIOMAS: { value: Idioma; label: string }[] = [
  { value: 'es', label: 'ES' },
  { value: 'en', label: 'EN' },
];

const CLAVE_STORAGE = 'nfl-predictor.idioma';
const DICCIONARIOS: Record<Idioma, Record<Clave, string>> = { es: ES, en: EN };

/** Parámetros de un texto: "{n} puntos" con { n: 3 }. */
export type Params = Record<string, string | number>;

function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (guardado === 'es' || guardado === 'en') return guardado;
  } catch { /* sin storage: español */ }
  return 'es';
}

/** Traduce una clave sin depender de Angular (para módulos puros). */
export function traducir(idioma: Idioma, clave: Clave, params?: Params): string {
  let texto: string = DICCIONARIOS[idioma][clave] ?? ES[clave] ?? clave;
  if (params) {
    for (const [k, v] of Object.entries(params)) texto = texto.split(`{${k}}`).join(String(v));
  }
  return texto;
}

/** Nombre de una etapa ('regular', 'wildcard', ...). */
export function traducirEtapa(idioma: Idioma, etapa: string): string {
  const clave = `etapa.${etapa}` as Clave;
  return clave in ES ? traducir(idioma, clave) : etapa;
}

/** `juegos.periodo` viene de la base en español ("3er cuarto"); desconocido, se deja como está. */
export function traducirPeriodo(idioma: Idioma, periodo: string | null | undefined): string {
  if (!periodo) return '';
  const clave = `periodo.${periodo}` as Clave;
  return clave in ES ? traducir(idioma, clave) : periodo;
}

/** Los errores de las funciones SQL llegan en español; si hay traducción se usa, si no el original. */
export function traducirErrorBase(idioma: Idioma, mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  const clave = `db.${mensaje}` as Clave;
  return clave in ES ? traducir(idioma, clave) : mensaje;
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
