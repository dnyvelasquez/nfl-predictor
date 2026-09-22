// sync-ranking.mjs
//
// Calcula el "ranking global de la temporada anterior" (regla #2 del
// reglamento) de los 32 equipos y lo carga en equipos.ranking, para poder
// comprobar a mano que la asignación hecha en el componente "Asignación"
// coincide con ese ranking.
//
// ranking = 1  -> campeón del Super Bowl (el mejor)
// ranking = 32 -> el equipo con peor desempeño de la temporada regular
//
// Es el inverso del orden de selección del Draft de la NFL (donde el peor
// equipo escoge de primero). No usamos los picks ya ejecutados del draft
// real de ESPN porque reflejan trades entre equipos (un equipo puede tener
// 2-3 picks en primera ronda y otro ninguno) — en cambio, calculamos el
// orden "por posición en la tabla" nosotros mismos, con las mismas reglas
// de desempate que usa la NFL para fijar el orden del draft:
//
//   1. Los 18 equipos que no llegaron a playoffs, ordenados de peor a mejor
//      récord de temporada regular.
//   2. Los 6 eliminados en Wild Card, de peor a mejor récord.
//   3. Los 4 eliminados en Ronda Divisional, de peor a mejor récord.
//   4. Los 2 eliminados en Final de Conferencia, de peor a mejor récord.
//   5. El perdedor del Super Bowl.
//   6. El campeón del Super Bowl.
//
// Dentro de cada grupo, si dos equipos empatan en récord, el desempate es
// por fuerza de calendario (strength of schedule): el equipo con el
// calendario más débil (rivales con peor récord promedio) queda de peor
// posición dentro del grupo — igual que hace la NFL para el draft.
//
// SEASON_YEAR es la temporada cuyo resultado se está rankeando — la misma
// temporada que usa sync-nfl.mjs mientras se juega (p.ej. SEASON_YEAR=2026
// para la temporada 2026-2027, cuyo Super Bowl es en febrero de 2027).
//
// Pensado para correrse una vez al año, apenas termine el Super Bowl de esa
// temporada. Antes de llamar a ESPN, revisa la propia tabla `juegos` de esta
// base de datos: si el juego con etapa='superbowl' todavía no tiene
// resultado cargado, termina de inmediato sin gastar llamadas a ESPN (igual
// que el chequeo de sync-nfl.mjs en modo quick). Una vez el resultado está,
// corre el cálculo completo contra el histórico de ESPN para esa temporada.
//
// Uso:
//   DATABASE_URL="postgres://..." SEASON_YEAR=2026 node sync-ranking.mjs
//
// Dependencias: solo "pg" (npm i pg). Node >= 18 (usa fetch nativo).

import pg from "pg";
import fs from "node:fs";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const SEASON_YEAR = process.env.SEASON_YEAR;

if (!DATABASE_URL) {
  console.error("Falta la variable de entorno DATABASE_URL (connection string de Neon).");
  process.exit(1);
}
if (!SEASON_YEAR) {
  console.error("Falta la variable de entorno SEASON_YEAR (la temporada a rankear, p.ej. 2025).");
  process.exit(1);
}

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const REGULAR_SEASON_WEEKS = 18;

// seasontype=3, la "week" de ESPN en playoffs: 1=wildcard, 2=divisional,
// 3=conferencia, 4=pro bowl (se ignora), 5=superbowl. En orden ascendente
// de avance, para poder quedarnos siempre con la ronda MÁS lejana a la que
// llegó cada equipo con solo sobrescribir en ese orden.
const POSTSEASON_WEEKS_EN_ORDEN = [
  { week: 1, etapa: "wildcard" },
  { week: 2, etapa: "divisional" },
  { week: 3, etapa: "conferencia" },
  { week: 5, etapa: "superbowl" },
];

// Escribe un output para el step de GitHub Actions que llama a este script
// (no-op fuera de Actions, donde GITHUB_OUTPUT no existe).
function writeGithubOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(file, `${name}=${value}\n`);
}

// ¿Ya se jugó el Super Bowl de la temporada en curso, según nuestra propia
// tabla `juegos`? Evita llamar a ESPN si todavía no hay nada que calcular.
async function superBowlYaJugado(client) {
  const { rows } = await client.query(
    `SELECT resultado_local, resultado_visitante FROM juegos WHERE etapa = 'superbowl' LIMIT 1`
  );
  const juego = rows[0];
  return !!juego && juego.resultado_local !== null && juego.resultado_visitante !== null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "nfl-predictor-sync/1.0" } });
  if (!res.ok) throw new Error(`ESPN respondió ${res.status} en ${url}`);
  return res.json();
}

async function fetchWeekGames(seasontype, week) {
  const url = `${ESPN_BASE}/scoreboard?dates=${SEASON_YEAR}&seasontype=${seasontype}&week=${week}`;
  const data = await fetchJson(url);
  return (data?.events || [])
    .map((e) => e.competitions?.[0])
    .filter(Boolean)
    .map((c) => {
      const home = c.competitors.find((x) => x.homeAway === "home");
      const away = c.competitors.find((x) => x.homeAway === "away");
      return {
        home: home.team.name,
        away: away.team.name,
        homeScore: Number.parseInt(home.score, 10) || 0,
        awayScore: Number.parseInt(away.score, 10) || 0,
        final: c.status?.type?.name === "STATUS_FINAL",
      };
    })
    .filter((g) => g.final);
}

// Récord de temporada regular + rivales enfrentados (para fuerza de
// calendario) de cada equipo, a partir de las 18 semanas de ESPN.
async function calcularRegularSeason() {
  const stats = new Map(); // nombre -> { wins, ties, losses, oponentes: string[] }
  const getStats = (nombre) =>
    stats.get(nombre) ?? (stats.set(nombre, { wins: 0, ties: 0, losses: 0, oponentes: [] }), stats.get(nombre));

  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
    console.log(`Temporada regular semana ${week}...`);
    const games = await fetchWeekGames(2, week);
    for (const g of games) {
      const home = getStats(g.home);
      const away = getStats(g.away);
      home.oponentes.push(g.away);
      away.oponentes.push(g.home);

      if (g.homeScore > g.awayScore) { home.wins++; away.losses++; }
      else if (g.homeScore < g.awayScore) { away.wins++; home.losses++; }
      else { home.ties++; away.ties++; }
    }
  }
  return stats;
}

function winPct({ wins, ties, losses }) {
  const jugados = wins + ties + losses;
  return jugados === 0 ? 0 : (wins + ties * 0.5) / jugados;
}

// Fuerza de calendario: win% promedio de los rivales enfrentados.
function strengthOfSchedule(nombre, regularStats) {
  const { oponentes } = regularStats.get(nombre);
  if (oponentes.length === 0) return 0;
  const total = oponentes.reduce((acc, op) => acc + winPct(regularStats.get(op)), 0);
  return total / oponentes.length;
}

// Furthest etapa de playoffs a la que llegó cada equipo, y si la ganó o
// la perdió. Se recorre en orden ascendente de avance (wildcard primero,
// superbowl al final) y siempre se sobrescribe, así el último valor que
// queda por equipo es su ronda más lejana.
async function calcularPlayoffs() {
  const furthest = new Map(); // nombre -> { etapa, gano }

  for (const { week, etapa } of POSTSEASON_WEEKS_EN_ORDEN) {
    console.log(`Playoffs (${etapa})...`);
    const games = await fetchWeekGames(3, week);
    for (const g of games) {
      const homeGano = g.homeScore > g.awayScore;
      furthest.set(g.home, { etapa, gano: homeGano });
      furthest.set(g.away, { etapa, gano: !homeGano });
    }
  }
  return furthest;
}

// Ordena un grupo de peor a mejor récord (empates por fuerza de calendario,
// más débil primero) y devuelve los nombres en ese orden.
function ordenarGrupoPeorAMejor(nombres, regularStats) {
  return [...nombres].sort((a, b) => {
    const pctA = winPct(regularStats.get(a));
    const pctB = winPct(regularStats.get(b));
    if (pctA !== pctB) return pctA - pctB;
    return strengthOfSchedule(a, regularStats) - strengthOfSchedule(b, regularStats);
  });
}

async function calcularRanking(client) {
  const { rows } = await client.query(`SELECT nombre FROM equipos`);
  const todosLosEquipos = rows.map((r) => r.nombre);

  const regularStats = await calcularRegularSeason();
  const playoffs = await calcularPlayoffs();

  const sbCampeon = [...playoffs.entries()].find(([, v]) => v.etapa === "superbowl" && v.gano)?.[0];
  const sbPerdedor = [...playoffs.entries()].find(([, v]) => v.etapa === "superbowl" && !v.gano)?.[0];
  const confPerdedores = [...playoffs.entries()].filter(([, v]) => v.etapa === "conferencia" && !v.gano).map(([k]) => k);
  const divisionalPerdedores = [...playoffs.entries()].filter(([, v]) => v.etapa === "divisional" && !v.gano).map(([k]) => k);
  const wildcardPerdedores = [...playoffs.entries()].filter(([, v]) => v.etapa === "wildcard" && !v.gano).map(([k]) => k);
  const sinPlayoffs = todosLosEquipos.filter((n) => !playoffs.has(n));

  console.log(
    `Grupos: sin playoffs=${sinPlayoffs.length}, wildcard=${wildcardPerdedores.length}, ` +
      `divisional=${divisionalPerdedores.length}, conferencia=${confPerdedores.length}, ` +
      `SB perdedor=${sbPerdedor ? 1 : 0}, SB campeón=${sbCampeon ? 1 : 0}`
  );

  // Posición de draft 1..32 (1 = peor equipo, escoge de primero), que
  // luego se invierte a ranking (1 = mejor, campeón del Super Bowl).
  const ordenDraft = [
    ...ordenarGrupoPeorAMejor(sinPlayoffs, regularStats),
    ...ordenarGrupoPeorAMejor(wildcardPerdedores, regularStats),
    ...ordenarGrupoPeorAMejor(divisionalPerdedores, regularStats),
    ...ordenarGrupoPeorAMejor(confPerdedores, regularStats),
    ...(sbPerdedor ? [sbPerdedor] : []),
    ...(sbCampeon ? [sbCampeon] : []),
  ];

  if (ordenDraft.length !== 32) {
    console.warn(`Advertencia: se esperaban 32 equipos en el orden calculado y salieron ${ordenDraft.length}.`);
  }

  let actualizados = 0;
  for (let i = 0; i < ordenDraft.length; i++) {
    const posicionDraft = i + 1;
    const ranking = 33 - posicionDraft;
    const { rowCount } = await client.query(
      `UPDATE equipos SET ranking = $1 WHERE lower(nombre) = lower($2)`,
      [ranking, ordenDraft[i]]
    );
    actualizados += rowCount;
  }

  console.log(`equipos actualizados: ${actualizados}/${ordenDraft.length}`);
  writeGithubOutput("calculado", "true");
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    if (!(await superBowlYaJugado(client))) {
      console.log("El Super Bowl de esta temporada todavía no tiene resultado cargado — nada que calcular.");
      writeGithubOutput("calculado", "false");
      return;
    }
    await calcularRanking(client);
    console.log("Listo.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error calculando el ranking:", err);
  process.exit(1);
});
