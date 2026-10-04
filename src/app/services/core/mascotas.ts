// URLs de las mascotas ilustradas de cada equipo. Ya no se guardan en `equipos`
// (antes columnas `left_mascot`/`right_mascot`): todas siguen el mismo patrón en
// el repo dnyvelasquez/assets, así que se derivan de `equipos.nombre`:
//   nfl-logos/{nombre en minúsculas}{right|left}-{logo|masc}.webp
// Se sirven desde jsDelivr (CDN con caché) en vez de github.com/...?raw=true,
// que redirige y no cachea. Si una franquicia cambia de nombre, hay que
// renombrar sus archivos en el repo de assets.

/** Commit o rama del repo de assets. Fijado a un commit para que la caché de jsDelivr sea permanente. */
const ASSETS_REF = '117b3119fa8e6d9d2ed51b196b633efc9e1c231e';
const BASE = `https://cdn.jsdelivr.net/gh/dnyvelasquez/assets@${ASSETS_REF}/nfl-logos/`;

/** 'logo' = 256 px (listas, tablas); 'masc' = 640 px (tarjetas grandes, portada). */
export type TamanoMascota = 'logo' | 'masc';

function url(nombre: string, mira: 'right' | 'left', tamano: TamanoMascota): string {
  return `${BASE}${nombre.trim().toLowerCase()}${mira}-${tamano}.webp`;
}

/** Mascota para el lado izquierdo (visitante): el archivo "...right-..." mira hacia la derecha. */
export function mascotaIzquierda(nombre: string, tamano: TamanoMascota = 'logo'): string {
  return url(nombre, 'right', tamano);
}

/** Mascota para el lado derecho (local): el archivo "...left-..." mira hacia la izquierda. */
export function mascotaDerecha(nombre: string, tamano: TamanoMascota = 'logo'): string {
  return url(nombre, 'left', tamano);
}
