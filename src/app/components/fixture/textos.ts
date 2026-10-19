// Textos de la página Fixture (carga diferida: se registran al cargar la página).

export const ES_FIXTURE = {
  'fixture.cargando': 'Cargando fixture...',
  'fixture.error': 'Error al cargar el fixture. Por favor, intenta de nuevo.',
  'fixture.tabRegular': 'Temporada regular',
  'fixture.tabPost': 'Postemporada',
  'fixture.gpe': 'G-P-E',
  'fixture.provisional': 'Clasificación provisional',
  'fixture.notaProvisional': 'Los cruces se proyectan con las semillas actuales y cambian hasta que termine la temporada regular.',
  'fixture.descansa': 'Descansa · pasa directo',
  'fixture.porDefinir': 'Por definir',
  'fixture.proyectado': 'Proyectado',
  'fixture.programado': 'Programado',
  'fixture.enVivoPeriodo': 'En vivo · {periodo}',
  'fixture.ronda.wildcard': 'Comodines',
  'fixture.ronda.divisional': 'Divisional',
  'fixture.ronda.conferencia': 'Final de conferencia',
  'fixture.ronda.superbowl': 'Super Bowl',
} as const;

export const EN_FIXTURE: Record<keyof typeof ES_FIXTURE, string> = {
  'fixture.cargando': 'Loading standings...',
  'fixture.error': "Couldn't load the standings. Please try again.",
  'fixture.tabRegular': 'Regular season',
  'fixture.tabPost': 'Postseason',
  'fixture.gpe': 'W-L-T',
  'fixture.provisional': 'Provisional standings',
  'fixture.notaProvisional': 'Matchups are projected with the current seeds and will change until the regular season ends.',
  'fixture.descansa': 'Bye · advances',
  'fixture.porDefinir': 'TBD',
  'fixture.proyectado': 'Projected',
  'fixture.programado': 'Scheduled',
  'fixture.enVivoPeriodo': 'Live · {periodo}',
  'fixture.ronda.wildcard': 'Wild Card',
  'fixture.ronda.divisional': 'Divisional',
  'fixture.ronda.conferencia': 'Conference Championship',
  'fixture.ronda.superbowl': 'Super Bowl',
};
