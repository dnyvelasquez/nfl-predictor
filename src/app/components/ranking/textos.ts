// Textos de la página Ranking inicial (carga diferida).

export const ES_RANKING = {
  'ranking.titulo': 'Ranking inicial',
  'ranking.global': 'Ranking global {temporada}',
  'ranking.intro1': 'Este es el orden con el que se hizo la asignación inicial de equipos de la temporada regular (',
  'ranking.introReglamento': 'reglamento',
  'ranking.intro2': ', reglas 4 a 10). Primero va el campeón del Super Bowl y al final el equipo con peor récord de la temporada anterior: es el orden del Draft de la NFL, al revés.',
  'ranking.nota': 'Dentro de cada grupo, los equipos van de mejor a peor récord de temporada regular; los empates se desempatan por fortaleza del calendario.',
  'ranking.cargando': 'Cargando ranking...',
  'ranking.error': 'No fue posible cargar el ranking. Intenta de nuevo.',
  'ranking.vacio': 'Todavía no hay ranking cargado.',
  'ranking.nivel.campeon': 'Campeón del Super Bowl',
  'ranking.nivel.subcampeon': 'Subcampeón del Super Bowl',
  'ranking.nivel.conferencia': 'Perdieron la final de conferencia',
  'ranking.nivel.divisional': 'Perdieron en la ronda divisional',
  'ranking.nivel.comodines': 'Perdieron en la ronda de comodines',
  'ranking.nivel.fuera': 'No clasificaron a playoffs',
} as const;

export const EN_RANKING: Record<keyof typeof ES_RANKING, string> = {
  'ranking.titulo': 'Initial ranking',
  'ranking.global': 'Overall ranking {temporada}',
  'ranking.intro1': "This is the order used for the initial regular-season team assignment (",
  'ranking.introReglamento': 'rules',
  'ranking.intro2': ', rules 4 to 10). The Super Bowl champion comes first and the team with the worst record of the previous season comes last: it is the NFL Draft order, reversed.',
  'ranking.nota': 'Within each tier, teams go from best to worst regular-season record; ties are broken by strength of schedule.',
  'ranking.cargando': 'Loading ranking...',
  'ranking.error': "Couldn't load the ranking. Please try again.",
  'ranking.vacio': 'No ranking has been loaded yet.',
  'ranking.nivel.campeon': 'Super Bowl champion',
  'ranking.nivel.subcampeon': 'Super Bowl runner-up',
  'ranking.nivel.conferencia': 'Lost the conference championship',
  'ranking.nivel.divisional': 'Lost in the divisional round',
  'ranking.nivel.comodines': 'Lost in the wild card round',
  'ranking.nivel.fuera': "Didn't make the playoffs",
};
