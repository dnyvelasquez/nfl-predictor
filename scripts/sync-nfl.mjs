// sync-nfl.mjs
//
// Sincroniza equipos, calendario y resultados de la NFL desde la API
// pública (no oficial) de ESPN hacia la base de datos Neon del proyecto
// NFL Predictor.
//
// Qué hace:
//   1. Asigna espn_id a cada fila de `equipos` haciendo match por nombre
//      de mascota (ESPN también usa solo el nombre de mascota en team.name).
//   2. Recorre temporada regular (semanas 1-18) y playoffs
//      (wildcard, divisional, conferencia, superbowl).
//   3. Por cada juego devuelto por ESPN:
//        - Si ya existe una fila con ese espn_event_id -> la actualiza.
//        - Si no, busca una fila cargada manualmente sin espn_event_id
//          que coincida en semana/etapa/local/visitante -> le asigna el id.
//        - Si tampoco existe -> inserta una fila nueva.
//   4. Guarda en equipos.posicion_division (1-4) el orden de cada equipo
//      dentro de su división y en equipos.seed_conferencia (1-16) su puesto
//      en la conferencia (1-4 = líderes de división, 5-7 = wild card),
//      según los standings de ESPN, que ya vienen con los criterios de
//      desempate oficiales de la NFL aplicados.
//
// Modos (variable de entorno MODE):
//   full  (default) -> recorre las 22 semanas (regular + playoffs) y también
//                       refresca equipos.espn_id. Pensado para correr 1 vez
//                       por semana (calendario completo, cambios de horario,
//                       aplazamientos, brackets de playoffs recién definidos).
//   quick             -> NO barre las 22 semanas. Primero pregunta SOLO a ESPN
//                       (marcador de ayer, hoy, mañana y pasado, hora Bogotá)
//                       y se conecta a la base únicamente si hay un juego en
//                       vivo o uno que terminó hace poco (para dejar el
//                       resultado final). Así el cómputo de Neon puede
//                       dormirse el resto del tiempo: cada conexión lo
//                       despierta y lo mantiene encendido ~5 minutos, y antes
//                       (cuando este modo consultaba la base en cada corrida)
//                       el cómputo no se dormía nunca y se gastaba el cupo
//                       mensual del plan gratuito. Pensado para correr muy
//                       seguido (cada 5 min, todos los días).
//
// Uso:
//   DATABASE_URL="postgres://..." SEASON_YEAR=2026 MODE=full node sync-nfl.mjs
//   DATABASE_URL="postgres://..." SEASON_YEAR=2026 MODE=quick node sync-nfl.mjs
//
// Dependencias: solo "pg" (npm i pg). Node >= 18 (usa fetch nativo).

import { crearCliente } from "./conexion.mjs";
import fs from "node:fs";

const DATABASE_URL = process.env.DATABASE_URL;
const SEASON_YEAR = process.env.SEASON_YEAR || "2026";
const MODE = (process.env.MODE || "full").toLowerCase();

if (!DATABASE_URL) {
  console.error("Falta la variable de entorno DATABASE_URL (connection string de Neon).");
  process.exit(1);
}

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
// Los standings viven en /apis/v2 (no /apis/site/v2). level=3 agrupa por
// liga -> conferencia -> división; `season` sí se respeta aquí.
const ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";

// seasontype de ESPN: 1=pretemporada, 2=regular, 3=playoffs
// En playoffs, la "week" de ESPN se traduce así:
//   1=wildcard, 2=divisional, 3=conferencia, 4=pro bowl (se ignora), 5=superbowl
const POSTSEASON_WEEK_MAP = {
  1: { etapa: "wildcard", semana: 19 },
  2: { etapa: "divisional", semana: 20 },
  3: { etapa: "conferencia", semana: 21 },
  5: { etapa: "superbowl", semana: 22 },
};

// Un juego terminado sigue sincronizándose mientras su inicio fue hace menos
// de esto: un partido dura ~3 h 10 min (con tiempo extra, hasta ~3 h 45 min),
// así hay margen para que ESPN lo marque como final y quede escrito. Si algo
// se escapa (un juego larguísimo), el modo full del martes lo corrige.
const VENTANA_FINAL_MS = 4.5 * 60 * 60 * 1000;

// "Hoy" en hora de Bogotá, como objeto Date en UTC (medianoche Bogotá).
function bogotaTodayAsUtcMidnight() {
  const now = new Date();
  const bogotaMs = now.getTime() - 5 * 60 * 60 * 1000;
  const bogota = new Date(bogotaMs);
  return new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate()));
}

// Escribe un output para el step de GitHub Actions que llama a este script
// (no-op fuera de Actions, donde GITHUB_OUTPUT no existe).
function writeGithubOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(file, `${name}=${value}\n`);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "nfl-predictor-sync/1.0" },
  });
  if (!res.ok) {
    throw new Error(`ESPN respondió ${res.status} en ${url}`);
  }
  return res.json();
}

// Convierte la fecha ISO (UTC) que da ESPN a fecha/hora en horario de
// Bogotá (UTC-5, sin horario de verano), en el mismo formato que ya usa
// la tabla: fecha "YYYY/MM/DD", hora "HH:MM" 24h.
function toBogotaDateTime(isoString) {
  const utcDate = new Date(isoString);
  const bogota = new Date(utcDate.getTime() - 5 * 60 * 60 * 1000);
  const yyyy = bogota.getUTCFullYear();
  const mm = String(bogota.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bogota.getUTCDate()).padStart(2, "0");
  const hh = String(bogota.getUTCHours()).padStart(2, "0");
  const min = String(bogota.getUTCMinutes()).padStart(2, "0");
  return { fecha: `${yyyy}/${mm}/${dd}`, hora: `${hh}:${min}` };
}

function mapEstado(statusType) {
  const state = statusType?.state; // 'pre' | 'in' | 'post'
  const name = statusType?.name || "";
  if (name.includes("POSTPONED") || name.includes("CANCELED")) return "pospuesto";
  if (state === "in") return "en_vivo";
  if (state === "post") return "final";
  return "programado";
}

// Etiqueta de la fase del juego (solo tiene sentido mientras estado='en_vivo').
// Usa el mismo objeto `status` de ESPN que ya se descarga por cada sync, sin
// llamadas adicionales: status.type.name indica medio tiempo explícitamente,
// y status.period es el número de cuarto (5+ = tiempo extra).
const CUARTOS = { 1: "1er cuarto", 2: "2do cuarto", 3: "3er cuarto", 4: "4to cuarto" };

function mapPeriodo(status, estado) {
  if (estado !== "en_vivo") return null;
  if ((status?.type?.name || "").includes("HALFTIME")) return "Medio tiempo";
  const period = status?.period;
  if (!period) return null;
  if (period >= 5) return "Tiempo extra";
  return CUARTOS[period] || null;
}

async function syncTeams(client) {
  console.log("Sincronizando equipos...");
  const data = await fetchJson(`${ESPN_BASE}/teams?limit=32`);
  const teams =
    data?.sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];

  let matched = 0;
  const sinMatch = [];

  for (const team of teams) {
    // team.name en ESPN es solo el nombre de mascota (p.ej. "Vikings"),
    // igual que equipos.nombre en la base de datos.
    const { rowCount } = await client.query(
      `UPDATE equipos SET espn_id = $1 WHERE lower(nombre) = lower($2)`,
      [team.id, team.name]
    );
    if (rowCount > 0) {
      matched += rowCount;
    } else {
      sinMatch.push(team.name);
    }
  }

  console.log(`  equipos actualizados: ${matched}/${teams.length}`);
  if (sinMatch.length) {
    console.warn(`  sin match en 'equipos' (revisar nombre manualmente): ${sinMatch.join(", ")}`);
  }
}

// Recorre el árbol liga -> conferencia -> división de ESPN y devuelve, por
// cada división, sus entries en el orden en que ESPN las entrega (ya
// desempatadas). Ojo: no usar playoffSeed para ordenar la división — ese es
// el sembrado de conferencia, que usa las reglas de desempate de wild card y
// puede diferir del orden interno de la división. playoffSeed se guarda
// aparte, en seed_conferencia.
function collectDivisionStandings(group, out = []) {
  if (group?.standings?.entries?.length) {
    out.push({ division: group.name, entries: group.standings.entries });
  }
  for (const child of group?.children || []) {
    collectDivisionStandings(child, out);
  }
  return out;
}

async function syncStandings(client) {
  const data = await fetchJson(`${ESPN_STANDINGS_URL}?season=${SEASON_YEAR}&seasontype=2&level=3`);
  const divisiones = collectDivisionStandings(data);

  const valores = [];
  for (const { entries } of divisiones) {
    entries.forEach((e, i) => {
      const seed = Number(e.stats?.find((st) => st.name === "playoffSeed")?.value);
      valores.push([String(e.team.id), i + 1, seed >= 1 && seed <= 16 ? seed : null]);
    });
  }

  if (valores.length !== 32) {
    console.warn(`  standings: se esperaban 32 equipos y ESPN devolvió ${valores.length}, no se actualizan posiciones`);
    return;
  }

  const placeholders = valores
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}::smallint, $${i * 3 + 3}::smallint)`)
    .join(", ");
  const { rowCount } = await client.query(
    `UPDATE equipos e
        SET posicion_division = v.posicion, seed_conferencia = v.seed
       FROM (VALUES ${placeholders}) AS v(espn_id, posicion, seed)
      WHERE e.espn_id = v.espn_id`,
    valores.flat()
  );
  console.log(`  standings: posicion_division/seed_conferencia actualizados en ${rowCount}/32 equipos (${divisiones.length} divisiones)`);
}

async function getNextId(client) {
  const { rows } = await client.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM juegos`);
  return Number(rows[0].max_id);
}

async function upsertGame(client, { espnEventId, semana, etapa, visitante, local, fecha, hora, resultadoLocal, resultadoVisitante, estado, periodo, nextIdRef }) {
  // 1) ¿Ya existe por espn_event_id?
  const existing = await client.query(
    `SELECT id FROM juegos WHERE espn_event_id = $1`,
    [espnEventId]
  );
  if (existing.rowCount > 0) {
    await client.query(
      `UPDATE juegos
         SET fecha = $1, hora = $2, resultado_local = $3, resultado_visitante = $4,
             estado = $5, periodo = $6, actualizado_en = now()
       WHERE id = $7`,
      [fecha, hora, resultadoLocal, resultadoVisitante, estado, periodo, existing.rows[0].id]
    );
    return "actualizado";
  }

  // 2) ¿Hay una fila cargada manualmente (sin espn_event_id) que coincida?
  const manual = await client.query(
    `SELECT id FROM juegos
      WHERE espn_event_id IS NULL
        AND semana = $1 AND etapa = $2
        AND lower(local) = lower($3) AND lower(visitante) = lower($4)`,
    [semana, etapa, local, visitante]
  );
  if (manual.rowCount > 0) {
    await client.query(
      `UPDATE juegos
         SET espn_event_id = $1, fecha = $2, hora = $3,
             resultado_local = $4, resultado_visitante = $5,
             estado = $6, periodo = $7, actualizado_en = now()
       WHERE id = $8`,
      [espnEventId, fecha, hora, resultadoLocal, resultadoVisitante, estado, periodo, manual.rows[0].id]
    );
    return "vinculado";
  }

  // 3) No existe: insertar fila nueva.
  nextIdRef.value += 1;
  await client.query(
    `INSERT INTO juegos (id, semana, visitante, local, fecha, hora, etapa,
                          resultado_local, resultado_visitante,
                          espn_event_id, estado, periodo, actualizado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())`,
    [nextIdRef.value, semana, visitante, local, fecha, hora, etapa, resultadoLocal, resultadoVisitante, espnEventId, estado, periodo]
  );
  return "insertado";
}

async function syncWeek(client, { seasontype, week, semana, etapa, nextIdRef }) {
  const url = `${ESPN_BASE}/scoreboard?year=${SEASON_YEAR}&seasontype=${seasontype}&week=${week}`;
  const data = await fetchJson(url);
  const events = data?.events || [];

  const counts = { insertado: 0, actualizado: 0, vinculado: 0 };

  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const home = competition.competitors?.find((c) => c.homeAway === "home");
    const away = competition.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const { fecha, hora } = toBogotaDateTime(competition.date);
    const estado = mapEstado(competition.status?.type);
    const periodo = mapPeriodo(competition.status, estado);

    const resultadoLocal =
      estado === "programado" ? null : Number.parseInt(home.score, 10) || 0;
    const resultadoVisitante =
      estado === "programado" ? null : Number.parseInt(away.score, 10) || 0;

    const result = await upsertGame(client, {
      espnEventId: event.id,
      semana,
      etapa,
      visitante: away.team.name,
      local: home.team.name,
      fecha,
      hora,
      resultadoLocal,
      resultadoVisitante,
      periodo,
      estado,
      nextIdRef,
    });
    counts[result] += 1;
  }

  console.log(
    `  ${etapa} semana ${semana}: ${events.length} juegos de ESPN -> ` +
      `${counts.insertado} nuevos, ${counts.vinculado} vinculados, ${counts.actualizado} actualizados`
  );
}

// Juegos de ESPN de ayer, hoy, mañana y pasado mañana (hora Bogotá), sin
// tocar la base. El marcador de ESPN no acepta rangos de fechas, así que se
// pide día por día y se deduplica por id.
async function espnEventsNearToday() {
  const utcMidnight = bogotaTodayAsUtcMidnight();
  const porId = new Map();
  for (let delta = -1; delta <= 2; delta++) {
    const d = new Date(utcMidnight.getTime() + delta * 24 * 60 * 60 * 1000);
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const data = await fetchJson(`${ESPN_BASE}/scoreboard?dates=${ymd}`);
    for (const event of data?.events || []) porId.set(event.id, event);
  }
  return [...porId.values()];
}

// (semana, etapa) de nuestra tabla para un juego de ESPN, o null si no
// aplica (pretemporada, Pro Bowl).
function semanaEtapaDeEvento(event) {
  const tipo = Number(event.season?.type);
  const week = Number(event.week?.number);
  if (tipo === 2) return { seasontype: 2, week, semana: week, etapa: "regular" };
  if (tipo === 3 && POSTSEASON_WEEK_MAP[week]) {
    return { seasontype: 3, week, ...POSTSEASON_WEEK_MAP[week] };
  }
  return null;
}

// ¿Hay que escribir este juego en la base ahora? Sí si está en vivo, o si
// terminó (o se aplazó) hace poco. Los programados no cambian nada que
// importe minuto a minuto; el modo full del martes recoge cambios de horario.
function necesitaEscritura(event, ahora) {
  const state = event.competitions?.[0]?.status?.type?.state;
  if (state === "in") return true;
  if (state === "post") return ahora - new Date(event.date).getTime() < VENTANA_FINAL_MS;
  return false;
}

async function runQuick() {
  const ahora = Date.now();
  const eventos = (await espnEventsNearToday()).filter((e) => semanaEtapaDeEvento(e));

  // La cadena del workflow sigue viva mientras haya algo cerca de hoy (igual
  // que antes); cada eslabón solo cuesta minutos de GitHub, no cómputo de Neon.
  writeGithubOutput("reencadenar", eventos.length > 0 ? "true" : "false");

  const activos = eventos.filter((e) => necesitaEscritura(e, ahora));
  if (activos.length === 0) {
    console.log(
      `Modo rápido: ${eventos.length} juego(s) de ESPN cerca de hoy, ninguno en vivo ni recién ` +
        "terminado -> no se toca la base."
    );
    return;
  }

  const semanas = new Map();
  for (const e of activos) {
    const se = semanaEtapaDeEvento(e);
    semanas.set(`${se.etapa}-${se.semana}`, se);
  }
  console.log(
    `Modo rápido: ${activos.length} juego(s) en vivo o recién terminados en ${semanas.size} ` +
      "semana(s) -> sincronizando..."
  );

  await conBase(async (client) => {
    const nextIdRef = { value: await getNextId(client) };
    for (const se of semanas.values()) {
      await syncWeek(client, { ...se, nextIdRef });
    }
    // Un resultado nuevo puede mover el orden de una división.
    await syncStandings(client);
  });
}

async function runFull(client) {
  await syncTeams(client);

  const nextIdRef = { value: await getNextId(client) };

  console.log("Sincronizando temporada regular (semanas 1-18)...");
  for (let week = 1; week <= 18; week++) {
    await syncWeek(client, { seasontype: 2, week, semana: week, etapa: "regular", nextIdRef });
  }

  console.log("Sincronizando playoffs...");
  for (const [espnWeek, info] of Object.entries(POSTSEASON_WEEK_MAP)) {
    await syncWeek(client, {
      seasontype: 3,
      week: Number(espnWeek),
      semana: info.semana,
      etapa: info.etapa,
      nextIdRef,
    });
  }

  console.log("Sincronizando standings de división...");
  await syncStandings(client);
}

// Conectarse a Neon despierta el cómputo: solo se hace cuando hay algo que escribir.
async function conBase(fn) {
  const client = crearCliente(DATABASE_URL);
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function main() {
  if (MODE === "quick") {
    await runQuick();
  } else {
    await conBase(runFull);
  }
  console.log("Sincronización completa.");
}

main().catch((err) => {
  console.error("Error en la sincronización:", err);
  process.exit(1);
});
