// Textos cortos de la página Reglamento (carga diferida). Las reglas en sí
// están escritas en los dos idiomas directamente en reglamento.html.

export const ES_REGLAMENTO = {
  'reglamento.titulo': 'Reglamento NFL Predictor',
  'reglamento.delGrupo': 'Reglamento del grupo',
  'reglamento.modoDeJuego': 'Modo de juego',
  'reglamento.juegaEsteModo': '{grupo} juega en este modo.',
  'reglamento.juegaOtroModo': '{grupo} juega en {modo}; este reglamento no le aplica.',
  'reglamento.apuestaCargando': 'El valor de la apuesta se está cargando…',
  'reglamento.apuestaSinSesion1': 'El valor de la apuesta lo define cada grupo. ',
  'reglamento.apuestaSinSesionLink': 'Inicia sesión',
  'reglamento.apuestaSinSesion2': ' para ver el de tu grupo.',
  'reglamento.apuestaSinGrupo': 'El valor de la apuesta lo define cada grupo; tu usuario todavía no pertenece a ninguno.',
  'reglamento.apuestaValor': 'El valor de la apuesta lo define cada grupo; en {grupo} es de {apuesta}.',
  'reglamento.apuestaSinDefinir': 'El valor de la apuesta lo define cada grupo; {grupo} todavía no lo ha definido.',
} as const;

export const EN_REGLAMENTO: Record<keyof typeof ES_REGLAMENTO, string> = {
  'reglamento.titulo': 'NFL Predictor Rules',
  'reglamento.delGrupo': "Group's rules",
  'reglamento.modoDeJuego': 'Game mode',
  'reglamento.juegaEsteModo': '{grupo} plays in this mode.',
  'reglamento.juegaOtroModo': "{grupo} plays in {modo}; these rules don't apply to it.",
  'reglamento.apuestaCargando': 'Loading the entry fee…',
  'reglamento.apuestaSinSesion1': 'Each group sets its own entry fee. ',
  'reglamento.apuestaSinSesionLink': 'Sign in',
  'reglamento.apuestaSinSesion2': " to see your group's.",
  'reglamento.apuestaSinGrupo': "Each group sets its own entry fee; your account doesn't belong to any group yet.",
  'reglamento.apuestaValor': 'Each group sets its own entry fee; in {grupo} it is {apuesta}.',
  'reglamento.apuestaSinDefinir': "Each group sets its own entry fee; {grupo} hasn't set one yet.",
};
