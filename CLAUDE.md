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

- **equipos** (`Equipo` interface) — all 32 NFL teams, grouped by `division`, with 7 season-stat counters entered by hand by an admin (not computed from game results), per `reglamento`: `pg` = regular-season win (10 pts), `pw` = Wildcard-round win (20 pts), `pd` = Divisional-round win (30 pts), `pc` = Conference Championship win (40 pts), `sb` = Super Bowl win (50 pts), `pe` = a tie in any round (half that round's points — the column stores something already halved/tie-specific, not a separate weight category), `pp` = losses (tracked but not scored). The scoring formula (used in both `Service.getParticipantesConPuntaje()` and `acumularPuntajesEnParticipantes()`) is `pg`×10 + `pe`×5 + `pw`×20 + `pd`×30 + `pc`×40 + `sb`×50.
- **participantes** — the people competing in the pool, with a persistent `acumulado` point total.
- **asignacion** — many-to-many assignment of teams to participants (one team per `division` per participant); a team's `participante` field is derived by joining `equipos` with `asignacion` in `Service.getEquipos()`, not a column on `equipos` itself.
- **juegos** — schedule only (`local`/`visitante` team names, `fecha`, `hora`, `semana` FK). There are **no score/result fields** — unlike `fifa-predictor`, nothing here drives automatic scoring; `juegos` exists purely so `Service.getJuegosSemanaActual()`/`getJuegosPorSemanaId()` can render "what's playing this week."
- **semana** — defines week date ranges (`inicio`/`fin`) for the schedule's week-by-week navigation.

**Scores are entered manually, not computed.** On the `puntajes` page, an admin types each team's 7 counters directly (`Service.actualizarPuntaje()`) and saves per team. `Service.acumularPuntajesEnParticipantes()` rolls the currently-computed team-based score into each participant's persistent `acumulado` (same forkJoin-of-N-individual-updates pattern as `fifa-predictor`'s accumulation step), after which `Service.resetPuntajes()` can zero the team counters to start the next scoring period. A pre-existing bug in this formula — the Super Bowl term used `pe` a second time instead of `sb`, silently zeroing any Super Bowl bonus whenever `pe` was 0 — was fixed during the Neon migration (2026-08-25); `getParticipantesConPuntaje()`'s copy of the same formula was already correct.

### Routing & auth

Routes are defined in `src/app/app.routes.ts`. Admin/management routes (`admin`, `puntajes`, `nuevo-usuario`, `borrar-usuario`, `ingresar-juego`, `participantes`, `asignacion`) are protected by `authGuard`; `login` is protected by `guestGuard` (redirects to `/admin` if already authenticated). Public routes (`''`, `tabla-puntajes`, `equipos`, `juegos`, `reglamento`) require no auth. Unlike `fifa-predictor`, user creation/deletion are two separate routes (`nuevo-usuario`, `borrar-usuario`) rather than one combined `usuarios` page, and there is no FIFA-Annex-C-style manual bracket-seeding step (no knockout bracket in this domain).

### Component conventions

Components are standalone and import Angular Material modules directly per-component (no shared Material module). Most data-loading components use RxJS (`forkJoin`/`switchMap`) directly against `Service`'s methods rather than `async` pipes throughout.
