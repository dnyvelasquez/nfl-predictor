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

## Funcionalidad principal

- **Equipos**: catálogo de los 32 equipos de la NFL agrupados por división; cada equipo muestra, por cada etapa en la que tiene un participante asignado, quién es ese participante y los puntos que el equipo le aportó en esa etapa.
- **Participantes**: personas inscritas en la quiniela.
- **Asignación** (admin): cada participante recibe equipos por división siguiendo un orden de selección basado en puntaje (ver reglamento completo en la app). Hay un cuadro de asignación independiente por etapa del campeonato — Temporada Regular, Wild Card, Ronda Divisional, Final de Conferencia y Super Bowl — para que un mismo equipo pueda quedar con un participante distinto en cada ronda.
- **Ingresar Juego** (admin): programa el calendario semanal (equipo local/visitante, fecha, hora, etapa del campeonato), permite editar un juego ya creado y cargar su resultado final — el resultado es lo que alimenta el puntaje de cada participante. También permite borrar un juego individual o vaciar por completo el calendario almacenado.
- **Nuevo Usuario / Borrar Usuario** (admin): gestión de las cuentas que pueden entrar al panel de administración.
- **Tabla de puntajes / Juegos de la semana**: vistas públicas de posiciones y calendario. En "Tabla de puntajes" los equipos de cada participante aparecen agrupados por etapa del campeonato, cada uno con su récord de juegos ganados-empatados-perdidos y los puntos que aportó (derrotas se muestran pero no puntúan); el puntaje total se calcula automáticamente a partir de los resultados cargados en "Ingresar Juego", atribuyendo cada ronda de playoffs a la asignación de esa misma ronda. "Juegos de la semana" muestra el marcador final de cada juego una vez que el admin lo carga.
- **Reglamento**: reglas completas de asignación de equipos, puntaje y repartición del premio.

Para más detalle de la arquitectura interna, ver [CLAUDE.md](CLAUDE.md).
