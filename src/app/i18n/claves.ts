// Todas las claves de texto, solo como tipo: los diccionarios de las páginas
// de carga diferida se importan con `import type`, así que no entran al bundle
// inicial. Al crear el `textos.ts` de una página nueva, agrégalo aquí.

import type { ES } from './textos.es';
import type { ES_FIXTURE } from '../components/fixture/textos';
import type { ES_EQUIPOS } from '../components/equipos/textos';
import type { ES_RANKING } from '../components/ranking/textos';

export type Clave =
  | keyof typeof ES
  | keyof typeof ES_FIXTURE
  | keyof typeof ES_EQUIPOS
  | keyof typeof ES_RANKING;
