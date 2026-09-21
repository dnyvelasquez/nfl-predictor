# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` / `ng serve` — dev server at `http://localhost:4200`
- `npm run build` / `ng build` — production build to `dist/nfl-predictor`
- `npm run watch` — incremental dev build (no server)
- `npm test` / `ng test` — run Karma/Jasmine unit tests (all specs)
  - To run a single spec file, use Karma's `--include` or temporarily scope with `fdescribe`/`fit` in the spec — there is no built-in single-file CLI filter configured in this project
- `npm run serve:ssr:nfl-predictor` — run the built Express SSR server from `dist/nfl-predictor/server/server.mjs` (see "Not actually SSR" below before relying on this)
- `ng generate component components/<name>` — scaffold a new standalone component following existing conventions

## Architecture

This is an Angular 20 app (standalone components) backed by [Neon](https://neon.com) — Postgres plus its Data API (PostgREST-compatible) and Neon Auth (managed Better Auth). The site is deployed as a fully static client-side SPA on GitHub Pages; there is no custom backend — every table access and auth call goes straight from the browser to Neon's Data API / Auth service.

The project migrated from Supabase to Neon on 2026-08-25, as a follow-up to the same migration on the sibling project `fifa-predictor` (same author, same original architecture). The schema was carried over 1:1 except one deliberate change: Supabase had a public (`anon`) `UPDATE` RLS policy on `equipos` (anyone could edit team stats without logging in) — this was dropped, so writes now always require authentication. See `schema.sql` at the repo root for the DDL (tables, RLS policies, grants) applied to the Neon project.

**Not actually SSR**, despite appearances: `@angular/ssr`, `express`, `app.routes.server.ts` (`RenderMode.Prerender` for `'**'`), and `provideClientHydration()` are all present, but there is no `main.server.ts` and `angular.json`'s build target has no `server`/`ssr`/`prerender` keys wired up. `src/main.ts` just calls plain `bootstrapApplication()`. The app builds and deploys as an ordinary client-rendered SPA (`angular-cli-ghpages`, with `404.html` = `index.html` copied for SPA routing fallback) — the SSR scaffolding is inert.

### Neon access layer

Unlike `fifa-predictor` (which splits data access across several per-domain services plus an injectable `SupabaseClientService` wrapper), this app keeps everything in **one file**: `src/app/services/data.ts`, exporting a single `@Injectable` class named `Service`. It covers participantes, equipos, juegos/semana, asignacion, session/login/logout, and admin user management. `auth-guard.ts` and `login.ts` import the raw `supabase` client directly (same as `Service` does) rather than going through `Service`.

- `src/app/core/supabase.client.ts` — creates and exports the `supabase` client singleton via `@neondatabase/neon-js`'s `createClient()`, configured with `environment.neonAuthUrl`/`neonDataApiUrl` and the `SupabaseAuthAdapter` (mimics `@supabase/auth-js`'s API — `signInWithPassword`, `getSession`, `onAuthStateChange`, `signOut` — so `Service`/the guards needed almost no changes from the Supabase version). `allowAnonymous: true` is required in the auth config or anonymous/public reads fail — Neon's Data API needs a short-lived anonymous JWT (fetched automatically by the SDK from `{authUrl}/token/anonymous`) even for unauthenticated requests, unlike Supabase's static anon key. The filename/export still say "supabase" for historical reasons (to avoid renaming every import site) but neither talks to Supabase anymore.
- Admin user management (`Service.createUserAsAdmin`/`listUsers`/`deleteUser`, used by the `nuevo-usuario`/`borrar-usuario` pages) replaced the old Supabase Edge Functions (`supabase/functions/` was deleted). It calls Better Auth's Admin plugin, but **not** via `supabase.auth.admin` — that property is `undefined` on the `SupabaseAuthAdapter` in `@neondatabase/neon-js@0.7.0-beta`. Instead it goes through the native client: `supabase.auth.getBetterAuthInstance().admin.{createUser,listUsers,removeUser}` (see the private `admin()` helper at the top of `Service`). The admin-role check is enforced server-side by Neon Auth (verified empirically: a non-admin session gets a hard rejection from the backend, not just a hidden UI), so no extra client-side gate is needed beyond `authGuard`.

### RLS

`schema.sql` enables Postgres RLS on all 5 tables with the same policy shape everywhere: `SELECT` open to the `anonymous` role, full CRUD open to the `authenticated` role — no policy references `auth.uid()`/`auth.user_id()`. Neon's Data API role names are `authenticated`/`anonymous` (not Supabase's `anon`). RLS alone isn't sufficient on Neon — each role also needs an explicit `GRANT` (see the top of `schema.sql`); a policy with no matching grant is silently never evaluated.

### Domain model

The app runs an NFL season-long prediction pool with these entities (Postgres tables in Neon):

- **equipos** (`Equipo` interface) — all 32 NFL teams, grouped by `division`. Still has 7 legacy stat columns (`pg/pe/pp/pw/pd/pc/sb`) in the schema, but as of 2026-08-27 **nothing reads or writes them anymore** — they're dead weight kept only because dropping columns needs a manual migration nobody's requested. The public `equipos` page (`src/app/components/equipos/`) was updated the same day to stop displaying them: each team's row now shows a per-etapa breakdown (`Service.getEquiposConPuntajePorEtapa()`) of the participant holding that team and the points it earned, one line per etapa the team is actually assigned in — same `registroEquipoEnEtapa()` calculation described below, just grouped by team instead of by participant. As of 2026-09-21 it also has `espn_id` (text, unique when non-null) mapping the row to its team ID in the ESPN API — see "Sincronización automática con ESPN" below.
- **participantes** — the people competing in the pool. Still has a persistent `acumulado` column in the schema, but it is **no longer read anywhere** — `Service.getParticipantesConPuntaje()` stopped adding it to `puntaje` on 2026-08-27 (see below).
- **asignacion** — many-to-many assignment of teams to participants (one team per `division` per participant), scoped by an `etapa` column (`'regular' | 'wildcard' | 'divisional' | 'conferencia' | 'superbowl'`, see `Etapa`/`ETAPAS` in `data.ts`) so each playoff round has its own independent set of assignments — a team can belong to a different participant in Wild Card than in the regular season, enforced by a `UNIQUE (equipo_id, etapa)` constraint. A team's `participante` field is derived by joining `equipos` with `asignacion` in `Service.getEquipos()`, not a column on `equipos` itself.
- **juegos** — schedule (`local`/`visitante` team names, `fecha`, `hora`, `semana` FK), plus `etapa` (same `Etapa`/`ETAPAS` domain as `asignacion`, added 2026-08-26) and nullable `resultado_local`/`resultado_visitante` (also added 2026-08-26, set from "Ingresar Juego"). As of 2026-08-27 these results are the **source of truth for scoring** (see below), not just informational display — `resultado_local`/`resultado_visitante` also still render on the public `Juegos de la semana` page once both are non-null (NULL/NULL means not played/entered yet, distinct from a real 0-0 score). `juegos` exists so `Service.getJuegosSemanaActual()`/`getJuegosPorSemanaId()` can render "what's playing this week," and `Service.actualizarJuego()` lets an admin edit any field of an existing game (recomputing `semana` from `fecha` if the date moves to another week). As of 2026-09-09 "Ingresar Juego" also has delete buttons per row (`Service.eliminarJuego()`) and a "Borrar todos los juegos" action that clears the whole table (`Service.eliminarTodosLosJuegos()`, an unfiltered `DELETE` expressed as `.not('id', 'is', null)` since the Data API requires a `WHERE` clause). As of 2026-09-21 it also has `espn_event_id` (text, unique when non-null), `estado` (text, default `'programado'`; one of `programado | en_vivo | final | pospuesto`), and `actualizado_en` (timestamptz, default `now()`) — see "Sincronización automática con ESPN" below; these are additive columns not yet reflected in `schema.sql`'s fresh-DB DDL (same "apply manually on an existing Neon DB, then `NOTIFY pgrst, 'reload schema';`" pattern as the `etapa` column).
- **semana** — defines week date ranges (`inicio`/`fin`) for the schedule's week-by-week navigation.

### Scoring is computed from game results (2026-08-27)

There is no more manual score entry. The old "Puntajes" admin page/route and `Service.actualizarPuntaje()`/`resetPuntajes()`/`acumularPuntajesEnParticipantes()` were deleted outright (not deprecated in place) — they wrote to `equipos.pg/pe/pp/pw/pd/pc/sb` and rolled that into `participantes.acumulado`, both of which are now unused.

`Service.getParticipantesConPuntaje()` (backs `tabla-puntajes` and the `participante-dialog` popup opened from `Home`) now computes each participant's score directly from `juegos`: it fetches every `juego` with a non-null result once (`Service.getJuegosConResultado()`), plus each participant's picks across **every** etapa (`Service.getEquiposDeTodasEtapas()`, already etapa-aware from the 2026-08-26 work). For each `(equipo, etapa)` pick, the private `Service.registroEquipoEnEtapa()` scans that etapa's finished games for one where `equipo.nombre` matches `juego.local` or `juego.visitante` (matched by **name**, since `juegos` stores team names, not ids) and tallies wins/ties/losses by comparing scores. Losses count toward the visible record but contribute 0 points; a win scores that etapa's full value, a tie scores half — the same weights the old formula used (`regular`=10, `wildcard`=20, `divisional`=30, `conferencia`=40, `superbowl`=50), now applied **per etapa's own assignment** instead of always through the regular-season one. This closes the gap flagged in the 2026-08-26 asignación-por-etapa work (see below) — playoff picks now actually score.

`Service.getEquiposConPuntajePorEtapa()` (backs the `equipos` page) reuses the same `registroEquipoEnEtapa()` helper from the opposite direction — per team instead of per participant — returning each team with a `porEtapa: RegistroEquipoPorEtapa[]` (etapa, label, participant, points), skipping etapas the team has no assignment in.

`Participante.equiposPorEtapa` (`{ etapa, label, equipos: RegistroEquipoParticipante[] }[]`, empty groups skipped) carries the computed `{ equipo, wins, ties, losses, puntos }` per pick straight from this calculation — `tabla-puntajes.html` and `participante-dialog.html` render it identically (both show a `wins-ties-losses` record plus `puntos` per team, grouped under an etapa heading); keep them in sync if this shape changes again, since they're two independent templates over the same data, not a shared component.

### Asignación por etapa (playoffs)

Added 2026-08-26. The `asignacion` component (`src/app/components/asignacion/`) renders one assignment grid (8 divisions × participantes, unchanged from before) per `Etapa`, switched via a `MatTabsModule` tab strip (first use of Material tabs in this codebase) — `etapaActiva` is a signal driving which etapa's rows are fetched; participantes/equipos master data loads once, only the `asignacion` rows are refetched on tab change. `Service.assignEquipo()`, `getAsignaciones()`, `resetAsignaciones()` all now take an `etapa` parameter (default `'regular'`), and the delete-before-insert in `assignEquipo()` is scoped by `etapa` too, so editing a cell in one stage cannot clear a participant's pick in another stage. "Reset" now clears only the active tab's etapa, not the whole table (behavior change from the original single-grid version).

`schema.sql` documents the resulting `asignacion` schema (fresh-DB DDL); an existing Neon database needs the `etapa` column/constraints added manually via `ALTER TABLE` (not scripted — this repo has no migration tooling), followed by `NOTIFY pgrst, 'reload schema';` (and, if that alone doesn't take effect, a compute-endpoint restart from the Neon dashboard) so the Data API picks up the new column.

### Sincronización automática con ESPN (2026-09-21)

`scripts/sync-nfl.mjs` is a standalone Node script (not part of the Angular app/build — connects to Neon directly with `pg`, not through the Data API) that pulls schedule/results from ESPN's public, unofficial, key-less endpoint (`https://site.api.espn.com/apis/site/v2/sports/football/nfl/...`) and upserts them into `equipos`/`juegos`. It:

1. Matches every `equipos` row to its ESPN team by mascot name (`team.name` in ESPN's API, e.g. "Vikings", equals `equipos.nombre`) and sets `equipos.espn_id`.
2. Walks regular season weeks 1–18 (ESPN `seasontype=2`) and postseason (`seasontype=3`, ESPN week mapped to `etapa`/`semana` via `POSTSEASON_WEEK_MAP`: 1→wildcard/19, 2→divisional/20, 3→conferencia/21, 5→superbowl/22 — ESPN's week 4 is the Pro Bowl and is skipped).
3. For each ESPN event, upserts into `juegos` in this priority: update the row with a matching `espn_event_id` if one exists → else link an existing manually-entered row (no `espn_event_id` yet) matching on `semana`+`etapa`+`local`+`visitante` → else insert a new row (id = current `MAX(id)+1`, tracked in-process across the run). This means games entered by hand through "Ingresar Juego" before the first sync get adopted rather than duplicated, as long as team names/week/etapa match exactly.
4. Converts ESPN's UTC kickoff time to Bogotá time (UTC-5, fixed offset, no DST) into the same `fecha` (`YYYY/MM/DD`) / `hora` (`HH:MM` 24h) string format the rest of the app already uses.
5. Maps ESPN's game status to `juegos.estado` (`programado | en_vivo | final | pospuesto`) and stamps `actualizado_en = now()` on every write; `resultado_local`/`resultado_visitante` stay `NULL` while `estado = 'programado'`.

Run manually with Node ≥18 (uses native `fetch`) and the `pg` dependency (already in `package.json`):

```
DATABASE_URL="postgres://..." SEASON_YEAR=2026 node scripts/sync-nfl.mjs
```

`DATABASE_URL` is the Neon connection string (required); `SEASON_YEAR` defaults to `2026` if omitted.

`.github/workflows/sync-nfl.yml` runs the script on a cron schedule (all times UTC; Bogotá is UTC-5 year-round, no DST) targeting NFL windows where games are actually live — Sunday from ~13:00 Bogotá through past midnight (covers Sunday Night Football), Monday night (Monday Night Football), Thursday night (Thursday Night Football) — polling every 15 minutes inside those windows, plus manual triggering via `workflow_dispatch` from the Actions tab. It reads the Neon connection string from the repo secret `DATABASE_URL` (Settings → Secrets and variables → Actions) — never hardcoded — and pins `SEASON_YEAR` to `"2026"` in the workflow itself (update it there for the next season). Known gap: the cron windows don't cover Saturday games (common in the final weeks of the regular season and in playoffs) and the job doesn't run at all outside these windows, so playoff brackets only fill in when a sync happens to fall inside a scheduled window — `workflow_dispatch` is the fallback for anything missed.

### Routing & auth

Routes are defined in `src/app/app.routes.ts`. Admin/management routes (`admin`, `nuevo-usuario`, `borrar-usuario`, `ingresar-juego`, `participantes`, `asignacion`) are protected by `authGuard`; `login` is protected by `guestGuard` (redirects to `/admin` if already authenticated). Public routes (`''`, `tabla-puntajes`, `equipos`, `juegos`, `reglamento`) require no auth. Unlike `fifa-predictor`, user creation/deletion are two separate routes (`nuevo-usuario`, `borrar-usuario`) rather than one combined `usuarios` page, and there is no FIFA-Annex-C-style manual bracket-seeding step (no knockout bracket in this domain).

### Component conventions

Components are standalone and import Angular Material modules directly per-component (no shared Material module). Most data-loading components use RxJS (`forkJoin`/`switchMap`) directly against `Service`'s methods rather than `async` pipes throughout.
