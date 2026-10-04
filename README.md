# NFL Predictor

Aplicación para gestionar una quiniela/pool de predicciones de la temporada de la NFL: asignación de equipos a participantes (automática en todas las etapas, según el reglamento), calendario de juegos con resultados en vivo sincronizados desde ESPN, y tabla de posiciones calculada automáticamente. Varios grupos (pools independientes) pueden usar la misma instalación, cada uno con sus propios participantes, asignaciones y valor de apuesta.

Construida con Angular 20 (componentes standalone) y [Neon](https://neon.com) (Postgres, vía su Data API y Neon Auth). Es un sitio 100% estático (sin backend propio) — todo el acceso a datos y autenticación va directo del navegador a Neon.

## Requisitos

- Node.js y npm
- Un proyecto de Neon con el Data API y Neon Auth habilitados, con el esquema de `schema.sql` aplicado, y las URLs configuradas en `src/environments/environment.ts` (`neonDataApiUrl`, `neonAuthUrl`)

## Desarrollo

```bash
npm install
npm start
```

Abre `http://localhost:4200/nfl-predictor/` (la app usa ese `baseHref` porque se publica en GitHub Pages bajo `/nfl-predictor/`). La app recarga automáticamente al modificar el código fuente.

Cada push a `main` publica el sitio en GitHub Pages automáticamente (`.github/workflows/deploy.yml`).

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

Al final de cada corrida `full`, y de cada corrida `quick` que encontró juegos cerca de hoy, el script también descarga los standings de ESPN (una sola petición) y guarda en `equipos.posicion_division` (1-4) el orden de cada equipo dentro de su división y en `equipos.seed_conferencia` (1-16) su puesto en la conferencia. ESPN ya entrega ambos con los criterios de desempate oficiales de la NFL aplicados (división y wild card), así que la app no los calcula por su cuenta.

**Automática:** existe una GitHub Action programada (`.github/workflows/sync-nfl.yml`, usa minutos ilimitados de Actions por ser repo público) con dos horarios: cada 5 minutos, todos los días, en modo `quick` (el mínimo que permite GitHub — cubre juegos de jueves, sábado y domingo temprano sin necesidad de ventanas horarias fijas), y una vez por semana (martes 06:00 UTC, ya terminado el Monday Night Football) en modo `full`. Usa el secret `DATABASE_URL` configurado en el repositorio. También se puede lanzar manualmente desde la pestaña Actions, eligiendo `quick` o `full`.

⚠️ GitHub no garantiza que ese cron de "cada 5 minutos" se dispare realmente cada 5 minutos — se ha visto en producción que puede demorarse varias horas entre corridas. Para compensarlo, cada corrida en modo `quick` se reencadena a sí misma cada ~4 minutos (llamando a la API de GitHub para disparar la siguiente corrida) mientras siga habiendo algún juego cerca de "hoy" — así deja de depender del cron una vez arranca, y se detiene sola cuando ya no hay nada que sincronizar.

### Ranking de equipos

El script `scripts/sync-ranking.mjs` calcula el ranking de los 32 equipos de la temporada que acaba de terminar (1 = campeón del Super Bowl, 32 = peor récord de temporada regular, el inverso del orden del Draft de la NFL) y lo guarda en `equipos.ranking` — es el orden con el que se hace la asignación automática de temporada regular, y se muestra en la página pública "Ranking inicial". Corre una vez al año, apenas termina el Super Bowl:

```powershell
$env:DATABASE_URL="postgres://..."; $env:SEASON_YEAR="2026"; node scripts/sync-ranking.mjs
```

También tiene una GitHub Action (`.github/workflows/sync-ranking.yml`) que corre todos los días entre el 1 y el 20 de febrero — el script mismo revisa si el Super Bowl de la temporada ya tiene resultado antes de llamar a ESPN, así que las corridas de los días previos no gastan nada. Ver [CLAUDE.md](CLAUDE.md) para el detalle de cómo se calcula.

## Funcionalidad principal

**Páginas públicas**

- **Portada**: el juego destacado de la semana (el de horario prime, en vivo o el próximo, con las mascotas de los dos equipos enfrentadas, su récord y una cuenta regresiva) y los juegos de la semana, con los que están en vivo primero. Con sesión muestra además la tabla de posiciones del grupo y qué participante tiene cada equipo.
- **Juegos de la semana**: calendario por semana con la hora, el marcador final o, mientras el juego está en curso, el marcador parcial con un letrero "En vivo" y el cuarto que se está jugando; se actualiza solo. Con sesión muestra qué participante del grupo tiene cada equipo.
- **Equipos → Fixture**: standings de temporada regular por conferencia y división, con el récord (Ganados-Perdidos-Empatados) y el orden oficial de la NFL; una franja de color marca la clasificación a playoffs (amarillo: semilla 1, azul: otros campeones de división, rojo: wild cards).
- **Equipos → Ranking inicial**: el ranking de la temporada anterior con el que se hizo la asignación inicial, agrupado según hasta dónde llegó cada equipo en los playoffs.
- **Reglamento**: reglas de asignación de equipos, puntaje y repartición del premio. El valor de la apuesta (regla 22) depende del grupo y solo se ve con sesión.

**Páginas de cada grupo (requieren sesión)**

- **Tabla de puntajes**: posiciones del grupo, con los equipos de cada participante agrupados por etapa, su récord y los puntos que aportaron.
- **Equipos → En competición**: qué participante del grupo tiene cada equipo en cada etapa y cuántos puntos le dio.

**Panel de administración** (solo super usuario y administradores de grupo)

- **Asignación**: un cuadro por etapa (Temporada Regular, Wild Card, Ronda Divisional, Final de Conferencia y Super Bowl). Cada pestaña tiene "Auto-asignar", que aplica el reglamento: la temporada regular por el ranking, y cada ronda de playoffs por puntaje, con los resultados de la ronda anterior. Si la ronda anterior todavía no termina, la confirmación lo avisa.
- **Participantes**: personas inscritas en el grupo; el orden de selección se reparte con el botón "Sortear números".
- **Ingresar Juego**: calendario y resultados (la sincronización con ESPN los mantiene al día; aquí se pueden corregir a mano).
- **Nuevo Usuario / Usuarios**: alta de usuarios en un grupo y gestión de roles, grupos y apuestas.

**Roles**

- **Super usuario**: hace todo, en todos los grupos.
- **Administrador** (de un grupo): ve el panel, usa "Auto-asignar" y crea usuarios de solo lectura en su grupo.
- **Solo lectura**: no entra al panel; inicia sesión para ver la tabla, los equipos y la apuesta de su grupo (pensado como una cuenta compartida por grupo).

Un mismo usuario puede pertenecer a varios grupos, con un rol distinto en cada uno. Los datos de cada grupo (participantes, asignaciones, apuesta) son privados: la base de datos solo se los muestra a sus miembros.

Para más detalle de la arquitectura interna, ver [CLAUDE.md](CLAUDE.md).
