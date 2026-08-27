# NFL Predictor

Aplicación para gestionar una quiniela/pool de predicciones de la temporada de la NFL: asignación de equipos a participantes, registro manual de puntajes por ronda de playoffs y tabla de posiciones.

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

- **Equipos**: catálogo de los 32 equipos de la NFL agrupados por división.
- **Participantes**: personas inscritas en la quiniela.
- **Asignación** (admin): cada participante recibe equipos por división siguiendo un orden de selección basado en puntaje (ver reglamento completo en la app). Hay un cuadro de asignación independiente por etapa del campeonato — Temporada Regular, Wild Card, Ronda Divisional, Final de Conferencia y Super Bowl — para que un mismo equipo pueda quedar con un participante distinto en cada ronda.
- **Puntajes** (admin): a diferencia de un cálculo automático por resultados, aquí el admin ingresa a mano, por equipo, cuántas veces ganó en temporada regular y en cada ronda de playoffs (Comodines, Divisional, Campeonato de Conferencia, Super Bowl). Los puntos se calculan con esos contadores: victoria de temporada regular 10 pts, Comodines 20, Divisional 30, Campeonato de Conferencia 40, Super Bowl 50, empate la mitad de los puntos de esa ronda.
- **Ingresar Juego** (admin): programa el calendario semanal (equipo local/visitante, fecha, hora, etapa del campeonato), permite editar un juego ya creado y cargar su resultado — es solo informativo, no alimenta el cálculo de puntajes.
- **Nuevo Usuario / Borrar Usuario** (admin): gestión de las cuentas que pueden entrar al panel de administración.
- **Tabla de puntajes / Juegos de la semana**: vistas públicas de posiciones y calendario; en "Tabla de puntajes" los equipos de cada participante aparecen agrupados por etapa del campeonato; "Juegos de la semana" muestra el marcador final de cada juego una vez que el admin lo carga. Por ahora el puntaje total solo cuenta los equipos de temporada regular — queda pendiente decidir si cada ronda de playoffs debe sumar según su propia asignación.
- **Reglamento**: reglas completas de asignación de equipos, puntaje y repartición del premio.

Para más detalle de la arquitectura interna, ver [CLAUDE.md](CLAUDE.md).
