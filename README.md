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

## Funcionalidad principal

- **Equipos**: catálogo de los 32 equipos de la NFL agrupados por división; cada equipo muestra, por cada etapa en la que tiene un participante asignado, quién es ese participante y los puntos que el equipo le aportó en esa etapa.
- **Participantes**: personas inscritas en la quiniela.
- **Asignación** (admin): cada participante recibe equipos por división siguiendo un orden de selección basado en puntaje (ver reglamento completo en la app). Hay un cuadro de asignación independiente por etapa del campeonato — Temporada Regular, Wild Card, Ronda Divisional, Final de Conferencia y Super Bowl — para que un mismo equipo pueda quedar con un participante distinto en cada ronda.
- **Ingresar Juego** (admin): programa el calendario semanal (equipo local/visitante, fecha, hora, etapa del campeonato), permite editar un juego ya creado y cargar su resultado final — el resultado es lo que alimenta el puntaje de cada participante.
- **Nuevo Usuario / Borrar Usuario** (admin): gestión de las cuentas que pueden entrar al panel de administración.
- **Tabla de puntajes / Juegos de la semana**: vistas públicas de posiciones y calendario. En "Tabla de puntajes" los equipos de cada participante aparecen agrupados por etapa del campeonato, cada uno con su récord de juegos ganados-empatados-perdidos y los puntos que aportó (derrotas se muestran pero no puntúan); el puntaje total se calcula automáticamente a partir de los resultados cargados en "Ingresar Juego", atribuyendo cada ronda de playoffs a la asignación de esa misma ronda. "Juegos de la semana" muestra el marcador final de cada juego una vez que el admin lo carga.
- **Reglamento**: reglas completas de asignación de equipos, puntaje y repartición del premio.

Para más detalle de la arquitectura interna, ver [CLAUDE.md](CLAUDE.md).
