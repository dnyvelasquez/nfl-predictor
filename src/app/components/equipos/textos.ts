// Textos de la página Equipos en competición (carga diferida).

export const ES_EQUIPOS = {
  'equipos.titulo': 'Equipos en Competición',
  'equipos.cargando': 'Cargando equipos...',
  'equipos.privado': 'Qué participante tiene cada equipo es información privada de cada grupo.',
  'equipos.error': 'Error al cargar los equipos. Por favor, intenta de nuevo.',
  'equipos.notaPronostico': 'Cada tarjeta muestra los puntos que el equipo le ha dado a cada participante en los juegos terminados en que lo eligió: el resultado acertado más el bono por diferencia exacta. Un empate acertado cuenta para los dos equipos.',
  'equipos.temporadaRegular': 'Temporada regular',
  'equipos.playoffs': 'Playoffs',
  'equipos.puntosDados': 'Puntos dados al grupo',
  'equipos.aciertos1': '{a} de {n} acierto',
  'equipos.aciertosN': '{a} de {n} aciertos',
  'equipos.diferencia1': '1 diferencia',
  'equipos.diferenciasN': '{n} diferencias',
  'equipos.nadieLoEligio': 'Nadie lo ha elegido todavía en un juego terminado.',
  'equipos.sinAsignados': 'No hay equipos con participantes asignados',
} as const;

export const EN_EQUIPOS: Record<keyof typeof ES_EQUIPOS, string> = {
  'equipos.titulo': 'Teams in Competition',
  'equipos.cargando': 'Loading teams...',
  'equipos.privado': "Which participant holds each team is private to each group.",
  'equipos.error': "Couldn't load the teams. Please try again.",
  'equipos.notaPronostico': "Each card shows the points the team has given each participant in the finished games where they picked it: the correct result plus the exact-margin bonus. A correct tie pick counts for both teams.",
  'equipos.temporadaRegular': 'Regular season',
  'equipos.playoffs': 'Playoffs',
  'equipos.puntosDados': 'Points given to the group',
  'equipos.aciertos1': '{a} of {n} correct',
  'equipos.aciertosN': '{a} of {n} correct',
  'equipos.diferencia1': '1 exact margin',
  'equipos.diferenciasN': '{n} exact margins',
  'equipos.nadieLoEligio': 'Nobody has picked it in a finished game yet.',
  'equipos.sinAsignados': 'No teams have been assigned to participants',
};
