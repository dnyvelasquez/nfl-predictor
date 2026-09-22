# NFL Predictor

Aplicación para gestionar una quiniela/pool de predicciones de la temporada de la NFL: asignación de equipos a participantes, calendario de juegos con resultados por ronda de playoffs, y tabla de posiciones calculada automáticamente.

Construida con Angular 20 (componentes standalone) y [Neon](https://neon.com) (Postgres, vía su Data API y Neon Auth). Es un sitio 100% estático (sin backend propio) — todo el acceso a datos y autenticación va directo del navegador a Neon.

## Requisitos

- Node.js y npm
- Un proyecto de Neon con el Data API y Neon Auth habilitados, con el esquema de `schema.sql` aplicado, y las URLs configuradas en `src/environments/environment.ts` (`neonDataApiUrl`, `neonAuthUrl`)

## Desarrollo

```bash
npm install
npm start
```

Abre `http://localhost:4200`. La app recarga automáticamente al modificar el código fuente.

## Build

```bash
npm run build
```

Genera los artefactos en `dist/nfl-predictor`.

## Tests

```bash
npm test
```

Ejecuta las pruebas unitarias con Karma/Jasmine.

## Sincronización de datos NFL

El calendario y los resultados se pueden mantener al día automáticamente desde la API pública (no oficial) de ESPN — no requiere API key.

El script `scripts/sync-nfl.mjs` tiene dos modos, controlados por la variable `MODE`:

- **`full`** (por defecto): recorre las 18 semanas de temporada regular y los playoffs (wildcard, divisional, conferencia, superbowl), y además actualiza `equipos.espn_id` de los 32 equipos. Pensado para correr aproximadamente una vez por semana.
- **`quick`**: no recorre las 22 semanas — primero revisa la propia base de datos para ver si hay juegos programados entre ayer y pasado mañana (hora Bogotá); si no hay ninguno, termina sin llamar a ESPN. Si encuentra alguno, sincroniza solo esas semanas/etapas. Pensado para correr muy seguido (cada 5 minutos) sin gastar de más.

**Manual (PowerShell, ya que el desarrollo es en Windows):**

```powershell
$env:DATABASE_URL="postgres://..."; $env:SEASON_YEAR="2026"; $env:MODE="full"; node scripts/sync-nfl.mjs
```

```powershell
$env:DATABASE_URL="postgres://..."; $env:MODE="quick"; node scripts/sync-nfl.mjs
```

- `DATABASE_URL`: connection string de Neon (requerido).
- `SEASON_YEAR`: temporada a sincronizar (opcional, por defecto `2026`).
- `MODE`: `full` o `quick` (opcional, por defecto `full`).
- Requiere Node.js 18+ y la dependencia `pg` (ya incluida en `package.json`).

En ambos modos, por cada juego: si ya existe una fila con ese ID de evento de ESPN la actualiza; si hay un juego cargado manualmente que coincide en semana/etapa/local/visitante lo vincula (en vez de duplicarlo); si no existe ninguno, lo inserta.

**Automática:** existe una GitHub Action programada (`.github/workflows/sync-nfl.yml`, usa minutos ilimitados de Actions por ser repo público) con dos horarios: cada 5 minutos, todos los días, en modo `quick` (el mínimo que permite GitHub — cubre juegos de jueves, sábado y domingo temprano sin necesidad de ventanas horarias fijas), y una vez por semana (martes 06:00 UTC, ya terminado el Monday Night Football) en modo `full`. Usa el secret `DATABASE_URL` configurado en el repositorio. También se puede lanzar manualmente desde la pestaña Actions, eligiendo `quick` o `full`.

⚠️ GitHub no garantiza que ese cron de "cada 5 minutos" se dispare realmente cada 5 minutos — se ha visto en producción que puede demorarse varias horas entre corridas. Para compensarlo, cada corrida en modo `quick` se reencadena a sí misma cada ~4 minutos (llamando a la API de GitHub para disparar la siguiente corrida) mientras siga habiendo algún juego cerca de "hoy" — así deja de depender del cron una vez arranca, y se detiene sola cuando ya no hay nada que sincronizar.

### Ranking de equipos

El script `scripts/sync-ranking.mjs` calcula el ranking de los 32 equipos de la temporada que acaba de terminar (1 = campeón del Super Bowl, 32 = peor récord de temporada regular, el inverso del orden del Draft de la NFL) y lo guarda en `equipos.ranking` — se usa para comprobar a mano que la asignación de equipos hecha en el panel de administración siguió el reglamento. Corre una vez al año, apenas termina el Super Bowl:

```powershell
$env:DATABASE_URL="postgres://..."; $env:SEASON_YEAR="2026"; node scripts/sync-ranking.mjs
```

También tiene una GitHub Action (`.github/workflows/sync-ranking.yml`) que corre todos los días entre el 1 y el 20 de febrero — el script mismo revisa si el Super Bowl de la temporada ya tiene resultado antes de llamar a ESPN, así que las corridas de los días previos no gastan nada. Ver [CLAUDE.md](CLAUDE.md) para el detalle de cómo se calcula.

## Funcionalidad principal

- **Equipos**: catálogo de los 32 equipos de la NFL agrupados por división, mostrando la ciudad antes del nombre de cada uno (ej. "Buffalo Bills"); cada equipo muestra, por cada etapa en la que tiene un participante asignado, quién es ese participante y los puntos que el equipo le aportó en esa etapa.
- **Participantes** (admin): personas inscritas en la quiniela. El número de cada participante (usado como orden de selección de equipos) ya no se ingresa manualmente — se asigna con el botón "Sortear números", que reparte de una sola vez un número aleatorio y sin repetir entre 1 y N a todos los participantes.
- **Asignación** (admin): cada participante recibe equipos por división siguiendo un orden de selección basado en puntaje (ver reglamento completo en la app). Hay un cuadro de asignación independiente por etapa del campeonato — Temporada Regular, Wild Card, Ronda Divisional, Final de Conferencia y Super Bowl — para que un mismo equipo pueda quedar con un participante distinto en cada ronda.
- **Ingresar Juego** (admin): programa el calendario semanal (equipo local/visitante, fecha, hora, etapa del campeonato), permite editar un juego ya creado y cargar su resultado final — el resultado es lo que alimenta el puntaje de cada participante. También permite borrar un juego individual o vaciar por completo el calendario almacenado.
- **Nuevo Usuario / Borrar Usuario** (admin): gestión de las cuentas que pueden entrar al panel de administración.
- **Tabla de puntajes / Juegos de la semana**: vistas públicas de posiciones y calendario. En "Tabla de puntajes" los equipos de cada participante aparecen agrupados por etapa del campeonato, cada uno con su récord de juegos ganados-empatados-perdidos y los puntos que aportó (derrotas se muestran pero no puntúan); el puntaje total se calcula automáticamente a partir de los resultados cargados en "Ingresar Juego", atribuyendo cada ronda de playoffs a la asignación de esa misma ronda. "Juegos de la semana" muestra la hora programada o el marcador final de cada juego, y mientras un partido está en curso muestra el marcador parcial con un letrero "En vivo" (sin la hora, que ya no aplica) y la fase actual del juego (1er/2do/3er/4to cuarto, medio tiempo o tiempo extra), que se actualiza solo (sin recargar la página) reflejando la sincronización automática con ESPN.
- **Reglamento**: reglas completas de asignación de equipos, puntaje y repartición del premio.

Para más detalle de la arquitectura interna, ver [CLAUDE.md](CLAUDE.md).
