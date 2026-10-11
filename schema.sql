-- Esquema para Neon, replicando 1:1 lo que existe hoy en Supabase
-- (extraído por introspección de information_schema/pg_policies el 2026-08-25),
-- salvo la política de UPDATE público sobre `equipos` para el rol `anon`, que
-- existía en Supabase pero se descarta a propósito (decisión del usuario) para
-- que la escritura quede siempre detrás de autenticación, igual que fifa-predictor.
--
-- 2026-08-26: se agregó la columna `etapa` a `asignacion` para soportar cuadros
-- de asignación independientes por ronda de playoffs (Wild Card, Divisional,
-- Conferencia, Super Bowl) además de la temporada regular. Este archivo define
-- el esquema de una base nueva; sobre una base Neon ya existente hay que aplicar
-- la migración manualmente (ver PR/commit correspondiente para el ALTER TABLE).
--
-- 2026-08-26: se agregaron las columnas `etapa`, `resultado_local` y
-- `resultado_visitante` a `juegos`, para registrar la etapa del campeonato de
-- cada juego y permitir editar el resultado desde "Ingresar Juego". El
-- resultado es puramente informativo: no alimenta el cálculo de puntajes
-- (`equipos.pg/pw/pd/pc/sb`), igual que el resto del calendario.

-- ============================================================
-- TABLAS
-- ============================================================

CREATE TABLE equipos (
  id        text PRIMARY KEY DEFAULT '0',
  nombre    text NOT NULL,
  division  text,
  logo      text,
  pg        numeric,
  pe        numeric,
  pp        numeric,
  pw        numeric,
  pd        numeric,
  pc        numeric,
  sb        numeric
);

CREATE TABLE semana (
  id      smallint PRIMARY KEY,
  inicio  text,
  fin     text
);

CREATE TABLE juegos (
  id                   smallint PRIMARY KEY,
  semana               numeric NOT NULL,
  visitante            text,
  local                text,
  fecha                text,
  hora                 text,
  etapa                text NOT NULL DEFAULT 'regular'
    CHECK (etapa IN ('regular', 'wildcard', 'divisional', 'conferencia', 'superbowl')),
  resultado_local      smallint,
  resultado_visitante  smallint
);

CREATE TABLE asignacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id    text REFERENCES equipos(id),
  participante text,
  etapa        text NOT NULL DEFAULT 'regular'
    CHECK (etapa IN ('regular', 'wildcard', 'divisional', 'conferencia', 'superbowl')),
  CONSTRAINT asignacion_equipo_etapa_unique UNIQUE (equipo_id, etapa)
);

CREATE INDEX IF NOT EXISTS idx_asignacion_participante_etapa
  ON asignacion (participante, etapa);

CREATE TABLE participantes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero     numeric NOT NULL,
  nombre     text,
  acumulado  numeric DEFAULT 0
);

-- ============================================================
-- GRANTS (requeridos por el Data API de Neon además de las
-- políticas RLS: sin GRANT, la política nunca llega a evaluarse)
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated, anonymous;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT SELECT ON equipos, semana, juegos, asignacion, participantes TO anonymous;

-- ============================================================
-- ROLES DE USUARIO (2026-10-02): superusuario / administrador / lectura.
-- Sin fila en roles_usuario = 'lectura'. Solo superusuario escribe directo en
-- las tablas de dominio y gestiona roles; administrador solo puede ejecutar
-- auto_asignar_temporada_regular() (SECURITY DEFINER, ver más abajo).
-- ============================================================

CREATE TABLE roles_usuario (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  rol     text NOT NULL DEFAULT 'lectura'
    CHECK (rol IN ('superusuario', 'administrador', 'lectura'))
);

CREATE OR REPLACE FUNCTION rol_actual() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rol FROM public.roles_usuario WHERE user_id::text = auth.user_id()), 'lectura')
$$;

CREATE OR REPLACE FUNCTION es_superusuario() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.rol_actual() = 'superusuario'
$$;

REVOKE ALL ON FUNCTION rol_actual(), es_superusuario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rol_actual(), es_superusuario() TO authenticated, anonymous;

GRANT SELECT, INSERT, UPDATE, DELETE ON roles_usuario TO authenticated;
ALTER TABLE roles_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver rol propio o todos si superusuario" ON roles_usuario FOR SELECT TO authenticated
  USING (user_id::text = auth.user_id() OR rol_actual() = 'superusuario');
CREATE POLICY "Superusuario inserta roles" ON roles_usuario FOR INSERT TO authenticated
  WITH CHECK (rol_actual() = 'superusuario');
CREATE POLICY "Superusuario actualiza roles" ON roles_usuario FOR UPDATE TO authenticated
  USING (rol_actual() = 'superusuario') WITH CHECK (rol_actual() = 'superusuario');
CREATE POLICY "Superusuario elimina roles" ON roles_usuario FOR DELETE TO authenticated
  USING (rol_actual() = 'superusuario');

-- ============================================================
-- RLS: lectura pública sin sesión; escritura directa solo para
-- superusuario (es_superusuario()). Antes del 2026-10-02 cualquier
-- autenticado podía escribir.
-- ============================================================

ALTER TABLE equipos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE semana        ENABLE ROW LEVEL SECURITY;
ALTER TABLE juegos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignacion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE participantes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipos', 'semana', 'juegos', 'asignacion', 'participantes']
  LOOP
    EXECUTE format('CREATE POLICY "Acceso publico de lectura a %1$s" ON %1$I FOR SELECT TO anonymous USING (true)', t);
    EXECUTE format('CREATE POLICY "Usuarios autenticados pueden ver %1$s" ON %1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Superusuario puede insertar %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (public.es_superusuario())', t);
    EXECUTE format('CREATE POLICY "Superusuario puede actualizar %1$s" ON %1$I FOR UPDATE TO authenticated USING (public.es_superusuario()) WITH CHECK (public.es_superusuario())', t);
    EXECUTE format('CREATE POLICY "Superusuario puede eliminar %1$s" ON %1$I FOR DELETE TO authenticated USING (public.es_superusuario())', t);
  END LOOP;
END $$;

-- ============================================================
-- GRUPOS (2026-10-02). Participantes, asignaciones y usuarios pertenecen a un
-- grupo (pool independiente, con su propia asignación por etapa). El
-- superusuario no tiene grupo y opera sobre todos. Las páginas públicas aún
-- no filtran por grupo (SELECT sigue abierto).
-- ============================================================

CREATE TABLE grupos (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE
);

INSERT INTO grupos (nombre) VALUES ('Grupo principal');

ALTER TABLE participantes ADD COLUMN grupo_id uuid NOT NULL REFERENCES grupos(id);

ALTER TABLE asignacion ADD COLUMN grupo_id uuid NOT NULL REFERENCES grupos(id);
ALTER TABLE asignacion DROP CONSTRAINT asignacion_equipo_etapa_unique;
ALTER TABLE asignacion ADD CONSTRAINT asignacion_equipo_etapa_grupo_unique UNIQUE (equipo_id, etapa, grupo_id);

ALTER TABLE roles_usuario ADD COLUMN grupo_id uuid REFERENCES grupos(id);
ALTER TABLE roles_usuario ADD CONSTRAINT roles_usuario_grupo_requerido
  CHECK (rol = 'superusuario' OR grupo_id IS NOT NULL);

CREATE OR REPLACE FUNCTION grupo_actual() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT grupo_id FROM public.roles_usuario WHERE user_id::text = auth.user_id()
$$;
REVOKE ALL ON FUNCTION grupo_actual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupo_actual() TO authenticated, anonymous;

ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON grupos TO anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON grupos TO authenticated;
CREATE POLICY "Acceso publico de lectura a grupos" ON grupos FOR SELECT TO anonymous USING (true);
CREATE POLICY "Usuarios autenticados pueden ver grupos" ON grupos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superusuario puede insertar grupos" ON grupos FOR INSERT TO authenticated WITH CHECK (es_superusuario());
CREATE POLICY "Superusuario puede actualizar grupos" ON grupos FOR UPDATE TO authenticated
  USING (es_superusuario()) WITH CHECK (es_superusuario());
CREATE POLICY "Superusuario puede eliminar grupos" ON grupos FOR DELETE TO authenticated USING (es_superusuario());

-- roles_usuario: el administrador ve los de su grupo y puede agregar usuarios
-- de solo lectura a su grupo (crea la cuenta con el registro público de Neon Auth).
DROP POLICY "Ver rol propio o todos si superusuario" ON roles_usuario;
CREATE POLICY "Ver rol propio, del grupo si administrador, o todos si superusuario" ON roles_usuario
  FOR SELECT TO authenticated USING (
    user_id::text = auth.user_id()
    OR rol_actual() = 'superusuario'
    OR (rol_actual() = 'administrador' AND grupo_id = grupo_actual())
  );
CREATE POLICY "Administrador agrega usuarios de solo lectura a su grupo" ON roles_usuario
  FOR INSERT TO authenticated WITH CHECK (
    rol_actual() = 'administrador' AND rol = 'lectura' AND grupo_id = grupo_actual()
  );

-- Usuarios visibles para la UI (neon_auth.user no está expuesto en el Data API).
CREATE OR REPLACE FUNCTION usuarios_visibles()
RETURNS TABLE (user_id uuid, email text, rol text, grupo_id uuid, grupo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, coalesce(r.rol, 'lectura'), r.grupo_id, g.nombre
  FROM neon_auth."user" u
  LEFT JOIN public.roles_usuario r ON r.user_id = u.id
  LEFT JOIN public.grupos g ON g.id = r.grupo_id
  WHERE public.rol_actual() = 'superusuario'
     OR (public.rol_actual() = 'administrador' AND r.grupo_id = public.grupo_actual())
  ORDER BY u.email
$$;
REVOKE ALL ON FUNCTION usuarios_visibles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION usuarios_visibles() TO authenticated;

-- ============================================================
-- AUTO-ASIGNACIÓN DE TEMPORADA REGULAR (2026-10-02), por grupo.
-- Port del algoritmo que antes corría en el navegador (reglas #2/#5/#7/#8).
-- calcular_* solo calcula; auto_asignar_* (superusuario sobre cualquier grupo,
-- administrador solo sobre el suyo) reemplaza la etapa 'regular' del grupo.
-- ============================================================

CREATE OR REPLACE FUNCTION calcular_auto_asignacion_regular(p_grupo uuid)
RETURNS TABLE (equipo_id text, participante text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  orden_asc text[];
  n int;
  eq_ids text[];
  eq_div text[];
  num_rondas int;
  cola text[];
  idx int;
  conf text;
  res_eq text[] := '{}';
  res_part text[] := '{}';
  res_div text[] := '{}';
BEGIN
  SELECT coalesce(array_agg(p.nombre ORDER BY p.numero), '{}') INTO orden_asc
    FROM participantes p WHERE p.grupo_id = p_grupo;
  n := cardinality(orden_asc);
  SELECT coalesce(array_agg(e.id ORDER BY e.ranking NULLS LAST, e.id), '{}'),
         coalesce(array_agg(e.division ORDER BY e.ranking NULLS LAST, e.id), '{}')
    INTO eq_ids, eq_div FROM equipos e;
  num_rondas := CASE WHEN n > 0 THEN cardinality(eq_ids) / n ELSE 0 END;

  FOR ronda IN 0 .. num_rondas - 1 LOOP
    IF ronda % 2 = 0 THEN
      cola := orden_asc;
    ELSE
      SELECT array_agg(x ORDER BY o DESC) INTO cola FROM unnest(orden_asc) WITH ORDINALITY u(x, o);
    END IF;

    FOR i IN ronda * n + 1 .. (ronda + 1) * n LOOP
      conf := CASE WHEN eq_div[i] LIKE 'AFC%' THEN 'AFC' ELSE 'NFC' END;
      idx := NULL;
      FOR k IN 1 .. coalesce(cardinality(cola), 0) LOOP
        IF NOT EXISTS (SELECT 1 FROM unnest(res_part, res_div) r(p, d) WHERE r.p = cola[k] AND r.d = eq_div[i])
           AND (SELECT count(*) FROM unnest(res_part, res_div) r(p, d)
                 WHERE r.p = cola[k] AND (CASE WHEN r.d LIKE 'AFC%' THEN 'AFC' ELSE 'NFC' END) = conf) < 2 THEN
          idx := k;
          EXIT;
        END IF;
      END LOOP;
      CONTINUE WHEN idx IS NULL;
      res_eq := res_eq || eq_ids[i];
      res_part := res_part || cola[idx];
      res_div := res_div || eq_div[i];
      cola := cola[1:idx - 1] || cola[idx + 1:];
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT u.e, u.p FROM unnest(res_eq, res_part) u(e, p);
END $$;

CREATE OR REPLACE FUNCTION auto_asignar_temporada_regular(p_grupo uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g uuid;
  asignados int;
BEGIN
  IF public.rol_actual() = 'superusuario' THEN
    g := p_grupo;
  ELSIF public.rol_actual() = 'administrador' THEN
    g := public.grupo_actual();
    IF p_grupo IS NOT NULL AND p_grupo <> g THEN
      RAISE EXCEPTION 'No autorizado para auto-asignar otro grupo' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'No autorizado para auto-asignar' USING ERRCODE = '42501';
  END IF;
  IF g IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  DELETE FROM asignacion WHERE etapa = 'regular' AND grupo_id = g;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, 'regular', g FROM calcular_auto_asignacion_regular(g) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

REVOKE ALL ON FUNCTION calcular_auto_asignacion_regular(uuid), auto_asignar_temporada_regular(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_asignar_temporada_regular(uuid) TO authenticated;

-- ============================================================
-- APUESTA POR GRUPO (2026-10-03). Valor por participante, mostrado en el
-- punto 26 del reglamento (22 desde la reescritura del 2026-10-03). Numérico para poder calcular el recaudo.
-- ============================================================

ALTER TABLE grupos ADD COLUMN apuesta numeric(12,0) CHECK (apuesta >= 0);
ALTER TABLE grupos ADD COLUMN moneda text NOT NULL DEFAULT 'COP';
UPDATE grupos SET apuesta = 50000 WHERE nombre = 'Grupo principal';

-- ============================================================
-- VARIOS GRUPOS POR USUARIO (2026-10-03). Un usuario puede pertenecer a
-- varios grupos con un rol distinto en cada uno (miembros_grupo).
-- roles_usuario queda solo para marcar al superusuario (global).
-- Reemplaza rol_actual()/grupo_actual() y las versiones anteriores de
-- usuarios_visibles()/auto_asignar_temporada_regular() definidas arriba.
-- ============================================================

CREATE TABLE miembros_grupo (
  user_id  uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES grupos(id),
  rol      text NOT NULL DEFAULT 'lectura' CHECK (rol IN ('administrador', 'lectura')),
  PRIMARY KEY (user_id, grupo_id)
);

INSERT INTO miembros_grupo (user_id, grupo_id, rol)
  SELECT user_id, grupo_id, rol FROM roles_usuario WHERE rol <> 'superusuario' AND grupo_id IS NOT NULL;
DELETE FROM roles_usuario WHERE rol <> 'superusuario';

DROP POLICY "Superusuario inserta roles" ON roles_usuario;
DROP POLICY "Superusuario actualiza roles" ON roles_usuario;
DROP POLICY "Superusuario elimina roles" ON roles_usuario;
DROP POLICY "Ver rol propio, del grupo si administrador, o todos si superusu" ON roles_usuario;
DROP POLICY "Administrador agrega usuarios de solo lectura a su grupo" ON roles_usuario;
DROP FUNCTION usuarios_visibles();
DROP FUNCTION auto_asignar_temporada_regular(uuid);
DROP FUNCTION grupo_actual();

CREATE OR REPLACE FUNCTION es_superusuario() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.roles_usuario WHERE user_id::text = auth.user_id() AND rol = 'superusuario')
$$;
DROP FUNCTION rol_actual();

ALTER TABLE roles_usuario DROP CONSTRAINT roles_usuario_grupo_requerido;
ALTER TABLE roles_usuario DROP COLUMN grupo_id;
ALTER TABLE roles_usuario DROP CONSTRAINT roles_usuario_rol_check;
ALTER TABLE roles_usuario ADD CONSTRAINT roles_usuario_rol_check CHECK (rol = 'superusuario');
ALTER TABLE roles_usuario ALTER COLUMN rol SET DEFAULT 'superusuario';

-- 'superusuario' (en todos los grupos), 'administrador', 'lectura', o NULL si no es miembro.
CREATE FUNCTION rol_en_grupo(p_grupo uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.es_superusuario() THEN 'superusuario'
    ELSE (SELECT rol FROM public.miembros_grupo WHERE user_id::text = auth.user_id() AND grupo_id = p_grupo) END
$$;
REVOKE ALL ON FUNCTION rol_en_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rol_en_grupo(uuid) TO authenticated, anonymous;

CREATE POLICY "Ver rol propio o todos si superusuario" ON roles_usuario FOR SELECT TO authenticated
  USING (user_id::text = auth.user_id() OR es_superusuario());
CREATE POLICY "Superusuario inserta roles" ON roles_usuario FOR INSERT TO authenticated WITH CHECK (es_superusuario());
CREATE POLICY "Superusuario actualiza roles" ON roles_usuario FOR UPDATE TO authenticated
  USING (es_superusuario()) WITH CHECK (es_superusuario());
CREATE POLICY "Superusuario elimina roles" ON roles_usuario FOR DELETE TO authenticated USING (es_superusuario());

ALTER TABLE miembros_grupo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON miembros_grupo TO authenticated;
CREATE POLICY "Ver membresias propias, de grupos que administra, o todas si superusuario" ON miembros_grupo
  FOR SELECT TO authenticated USING (
    user_id::text = auth.user_id() OR rol_en_grupo(grupo_id) IN ('superusuario', 'administrador'));
CREATE POLICY "Superusuario inserta membresias" ON miembros_grupo FOR INSERT TO authenticated WITH CHECK (es_superusuario());
CREATE POLICY "Superusuario actualiza membresias" ON miembros_grupo FOR UPDATE TO authenticated
  USING (es_superusuario()) WITH CHECK (es_superusuario());
CREATE POLICY "Superusuario elimina membresias" ON miembros_grupo FOR DELETE TO authenticated USING (es_superusuario());

-- Unica via de escritura en `asignacion` para un administrador, y solo en los grupos que administra.
CREATE FUNCTION auto_asignar_temporada_regular(p_grupo uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.rol_en_grupo(p_grupo), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = 'regular' AND grupo_id = p_grupo;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, 'regular', p_grupo FROM calcular_auto_asignacion_regular(p_grupo) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

-- Una fila por (usuario, grupo); usuarios sin grupos salen una vez con grupo NULL.
-- Superusuario: todos. Administrador: miembros de los grupos que administra.
CREATE FUNCTION usuarios_visibles()
RETURNS TABLE (user_id uuid, email text, es_superusuario boolean, grupo_id uuid, grupo text, rol text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, (r.user_id IS NOT NULL), m.grupo_id, g.nombre, m.rol
  FROM neon_auth."user" u
  LEFT JOIN public.roles_usuario r ON r.user_id = u.id
  LEFT JOIN public.miembros_grupo m ON m.user_id = u.id
  LEFT JOIN public.grupos g ON g.id = m.grupo_id
  WHERE public.es_superusuario()
     OR (m.grupo_id IS NOT NULL AND public.rol_en_grupo(m.grupo_id) = 'administrador')
  ORDER BY u.email, g.nombre
$$;

-- Agrega a un grupo a un usuario que ya existe en Neon Auth (buscado por email).
-- Superusuario: cualquier grupo y rol. Administrador: solo 'lectura' en grupos que administra.
-- Si ya era miembro no cambia su rol.
CREATE FUNCTION agregar_miembro(p_email text, p_grupo uuid, p_rol text DEFAULT 'lectura') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid;
  rol_caller text := public.rol_en_grupo(p_grupo);
BEGIN
  IF p_rol NOT IN ('administrador', 'lectura') THEN
    RAISE EXCEPTION 'Rol invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT (rol_caller = 'superusuario' OR (rol_caller = 'administrador' AND p_rol = 'lectura')) THEN
    RAISE EXCEPTION 'No autorizado para agregar miembros a este grupo' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO uid FROM neon_auth."user" WHERE lower(email) = lower(trim(p_email));
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario con ese email' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO miembros_grupo (user_id, grupo_id, rol) VALUES (uid, p_grupo, p_rol)
    ON CONFLICT (user_id, grupo_id) DO NOTHING;
  RETURN uid;
END $$;

REVOKE ALL ON FUNCTION auto_asignar_temporada_regular(uuid), usuarios_visibles(), agregar_miembro(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_asignar_temporada_regular(uuid), usuarios_visibles(), agregar_miembro(text, uuid, text) TO authenticated;

-- ============================================================
-- DATOS DE GRUPO PRIVADOS (2026-10-03). participantes, asignacion y grupos
-- solo se leen con sesión y solo los de los grupos del usuario (el
-- superusuario ve todos). equipos, juegos y semana siguen públicos.
-- Se mantiene el GRANT SELECT a anonymous a propósito: sin política, una
-- consulta anónima devuelve cero filas en vez de un error de permisos.
-- ============================================================

DROP POLICY "Acceso publico de lectura a asignacion" ON asignacion;
DROP POLICY "Usuarios autenticados pueden ver asignacion" ON asignacion;
DROP POLICY "Acceso publico de lectura a participantes" ON participantes;
DROP POLICY "Usuarios autenticados pueden ver participantes" ON participantes;
DROP POLICY "Acceso publico de lectura a grupos" ON grupos;
DROP POLICY "Usuarios autenticados pueden ver grupos" ON grupos;

CREATE POLICY "Miembros ven asignaciones de sus grupos" ON asignacion
  FOR SELECT TO authenticated USING (rol_en_grupo(grupo_id) IS NOT NULL);
CREATE POLICY "Miembros ven participantes de sus grupos" ON participantes
  FOR SELECT TO authenticated USING (rol_en_grupo(grupo_id) IS NOT NULL);
CREATE POLICY "Miembros ven sus grupos" ON grupos
  FOR SELECT TO authenticated USING (rol_en_grupo(id) IS NOT NULL);

-- ============================================================
-- AUTO-ASIGNACIÓN DE LA RONDA DE COMODINES (2026-10-04)
-- Reglamento, reglas 11-16 y 19. Ver CLAUDE.md para las decisiones.
-- ============================================================

-- Puntaje de cada participante del grupo, con la misma fórmula que el frontend.
CREATE OR REPLACE FUNCTION puntajes_grupo(p_grupo uuid)
RETURNS TABLE (participante text, numero numeric, puntos numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH valores(etapa, valor) AS (
    VALUES ('regular', 10), ('wildcard', 20), ('divisional', 30), ('conferencia', 40), ('superbowl', 50)
  ),
  regular_terminada AS (
    SELECT EXISTS (SELECT 1 FROM juegos WHERE etapa = 'regular')
       AND NOT EXISTS (SELECT 1 FROM juegos WHERE etapa = 'regular' AND estado IN ('programado', 'en_vivo')) AS t
  ),
  por_asignacion AS (
    SELECT a.participante,
           v.valor * (
             SELECT coalesce(sum(CASE WHEN x.propio > x.rival THEN 1 WHEN x.propio = x.rival THEN 0.5 ELSE 0 END), 0)
             FROM (
               SELECT CASE WHEN j.local = e.nombre THEN j.resultado_local ELSE j.resultado_visitante END AS propio,
                      CASE WHEN j.local = e.nombre THEN j.resultado_visitante ELSE j.resultado_local END AS rival
               FROM juegos j
               WHERE j.etapa = a.etapa
                 AND (j.local = e.nombre OR j.visitante = e.nombre)
                 AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
             ) x
           )
           + CASE WHEN a.etapa = 'wildcard' AND e.seed_conferencia = 1 AND (SELECT t FROM regular_terminada) THEN 20 ELSE 0 END
           AS puntos
    FROM asignacion a
    JOIN equipos e ON e.id = a.equipo_id
    JOIN valores v ON v.etapa = a.etapa
    WHERE a.grupo_id = p_grupo
  )
  SELECT p.nombre, p.numero, coalesce(sum(pa.puntos), 0)
  FROM participantes p
  LEFT JOIN por_asignacion pa ON pa.participante = p.nombre
  WHERE p.grupo_id = p_grupo
  GROUP BY p.nombre, p.numero
$$;

CREATE OR REPLACE FUNCTION calcular_auto_asignacion_wildcard(p_grupo uuid)
RETURNS TABLE (equipo_id text, participante text, conferencia text, motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- 1. Quien tiene la primera semilla de una conferencia va solo con ese equipo
--    (descansa y cuenta como victoria) y cede los demás.
-- 2. Los demás conservan sus equipos vivos de temporada regular; con dos de la
--    misma conferencia se quedan con el de mejor récord (desempate: semilla).
-- 3. De menor a mayor puntaje (empate: número de sorteo), cada uno completa la
--    conferencia que le falta con el equipo libre de mejor récord.
-- "Récord" = % de victorias de temporada regular (empate = media victoria).
#variable_conflict use_column
DECLARE
  part record;
  v_conf text;
  elegido text;
BEGIN
  DROP TABLE IF EXISTS _wc_equipos;
  DROP TABLE IF EXISTS _wc_resultado;

  CREATE TEMP TABLE _wc_equipos ON COMMIT DROP AS
  SELECT e.id, e.nombre, left(e.division, 3) AS conf, e.seed_conferencia AS seed,
         coalesce(r.pct, 0) AS pct, a.participante AS dueno
  FROM equipos e
  LEFT JOIN LATERAL (
    SELECT sum(CASE WHEN x.propio > x.rival THEN 1 WHEN x.propio = x.rival THEN 0.5 ELSE 0 END) / nullif(count(*), 0) AS pct
    FROM (
      SELECT CASE WHEN j.local = e.nombre THEN j.resultado_local ELSE j.resultado_visitante END AS propio,
             CASE WHEN j.local = e.nombre THEN j.resultado_visitante ELSE j.resultado_local END AS rival
      FROM juegos j
      WHERE j.etapa = 'regular' AND j.estado <> 'en_vivo'
        AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
        AND (j.local = e.nombre OR j.visitante = e.nombre)
    ) x
  ) r ON true
  LEFT JOIN asignacion a ON a.equipo_id = e.id AND a.etapa = 'regular' AND a.grupo_id = p_grupo
  WHERE e.seed_conferencia BETWEEN 1 AND 7;

  CREATE TEMP TABLE _wc_resultado (equipo_id text, participante text, conf text, motivo text) ON COMMIT DROP;

  INSERT INTO _wc_resultado
  SELECT id, dueno, conf, 'Primera semilla: descansa y cuenta como victoria'
  FROM _wc_equipos WHERE seed = 1 AND dueno IS NOT NULL;

  INSERT INTO _wc_resultado
  SELECT DISTINCT ON (dueno, conf) id, dueno, conf, 'Conserva su equipo de temporada regular'
  FROM _wc_equipos
  WHERE seed BETWEEN 2 AND 7 AND dueno IS NOT NULL
    AND dueno NOT IN (SELECT r.participante FROM _wc_resultado r)
  ORDER BY dueno, conf, pct DESC, seed ASC;

  FOR part IN
    SELECT pg.participante AS nombre
    FROM puntajes_grupo(p_grupo) pg
    WHERE pg.participante NOT IN (SELECT r.participante FROM _wc_resultado r WHERE r.motivo LIKE 'Primera semilla%')
    ORDER BY pg.puntos ASC, pg.numero ASC
  LOOP
    FOREACH v_conf IN ARRAY ARRAY['AFC', 'NFC'] LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM _wc_resultado r WHERE r.participante = part.nombre AND r.conf = v_conf);
      elegido := NULL;
      SELECT e.id INTO elegido
      FROM _wc_equipos e
      WHERE e.conf = v_conf AND e.seed BETWEEN 2 AND 7
        AND e.id NOT IN (SELECT r.equipo_id FROM _wc_resultado r)
      ORDER BY e.pct DESC, e.seed ASC
      LIMIT 1;
      IF elegido IS NOT NULL THEN
        INSERT INTO _wc_resultado VALUES (elegido, part.nombre, v_conf, 'Asignado por puntaje');
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT r.equipo_id, r.participante, r.conf, r.motivo FROM _wc_resultado r;
END $$;

-- Reemplaza la asignación de comodines del grupo. Superusuario o administrador del grupo.
CREATE OR REPLACE FUNCTION auto_asignar_wildcard(p_grupo uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.rol_en_grupo(p_grupo), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = 'wildcard' AND grupo_id = p_grupo;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, 'wildcard', p_grupo FROM calcular_auto_asignacion_wildcard(p_grupo) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

REVOKE ALL ON FUNCTION puntajes_grupo(uuid), calcular_auto_asignacion_wildcard(uuid), auto_asignar_wildcard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_asignar_wildcard(uuid) TO authenticated;

-- ============================================================
-- AUTO-ASIGNACIÓN DE LA RONDA DIVISIONAL (2026-10-04)
-- Desde la ronda divisional hay más participantes que equipos vivos por
-- conferencia, así que un equipo puede tener varios participantes en la misma
-- etapa (regla 16). En temporada regular y comodines sigue siendo único.
-- ============================================================

ALTER TABLE asignacion DROP CONSTRAINT asignacion_equipo_etapa_grupo_unique;
ALTER TABLE asignacion ADD CONSTRAINT asignacion_equipo_etapa_grupo_participante_unique
  UNIQUE (equipo_id, etapa, grupo_id, participante);
CREATE UNIQUE INDEX asignacion_equipo_unico_sin_compartir ON asignacion (equipo_id, etapa, grupo_id)
  WHERE etapa IN ('regular', 'wildcard');

CREATE OR REPLACE FUNCTION calcular_auto_asignacion_divisional(p_grupo uuid)
RETURNS TABLE (equipo_id text, participante text, conferencia text, motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- Vivos: las dos primeras semillas y los ganadores de comodines con resultado.
-- 1. Cada uno conserva sus equipos de comodines que siguen vivos (uno por conferencia).
-- 2. De menor a mayor puntaje (empate: número de sorteo), cada uno completa la
--    conferencia que le falta: primero el equipo con menos participantes, y entre
--    ellos el de mejor récord (desempate: semilla).
#variable_conflict use_column
DECLARE
  part record;
  v_conf text;
  elegido text;
  ya_tiene int;
BEGIN
  DROP TABLE IF EXISTS _dv_equipos;
  DROP TABLE IF EXISTS _dv_resultado;

  CREATE TEMP TABLE _dv_equipos ON COMMIT DROP AS
  WITH ganadores_comodines AS (
    SELECT CASE WHEN j.resultado_local > j.resultado_visitante THEN j.local ELSE j.visitante END AS nombre
    FROM juegos j
    WHERE j.etapa = 'wildcard' AND j.estado <> 'en_vivo'
      AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
      AND j.resultado_local <> j.resultado_visitante
  )
  SELECT e.id, e.nombre, left(e.division, 3) AS conf, e.seed_conferencia AS seed, coalesce(r.pct, 0) AS pct
  FROM equipos e
  LEFT JOIN LATERAL (
    SELECT sum(CASE WHEN x.propio > x.rival THEN 1 WHEN x.propio = x.rival THEN 0.5 ELSE 0 END) / nullif(count(*), 0) AS pct
    FROM (
      SELECT CASE WHEN j.local = e.nombre THEN j.resultado_local ELSE j.resultado_visitante END AS propio,
             CASE WHEN j.local = e.nombre THEN j.resultado_visitante ELSE j.resultado_local END AS rival
      FROM juegos j
      WHERE j.etapa = 'regular' AND j.estado <> 'en_vivo'
        AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
        AND (j.local = e.nombre OR j.visitante = e.nombre)
    ) x
  ) r ON true
  WHERE e.seed_conferencia = 1 OR e.nombre IN (SELECT g.nombre FROM ganadores_comodines g);

  CREATE TEMP TABLE _dv_resultado (equipo_id text, participante text, conf text, motivo text) ON COMMIT DROP;

  INSERT INTO _dv_resultado
  SELECT DISTINCT ON (a.participante, e.conf) e.id, a.participante, e.conf,
         CASE WHEN e.seed = 1 THEN 'Conserva su primera semilla' ELSE 'Conserva: ganó en comodines' END
  FROM asignacion a
  JOIN _dv_equipos e ON e.id = a.equipo_id
  WHERE a.etapa = 'wildcard' AND a.grupo_id = p_grupo
  ORDER BY a.participante, e.conf, e.pct DESC, e.seed ASC;

  FOR part IN
    SELECT pg.participante AS nombre FROM puntajes_grupo(p_grupo) pg ORDER BY pg.puntos ASC, pg.numero ASC
  LOOP
    FOREACH v_conf IN ARRAY ARRAY['AFC', 'NFC'] LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM _dv_resultado r WHERE r.participante = part.nombre AND r.conf = v_conf);
      elegido := NULL;
      SELECT e.id, coalesce(c.n, 0) INTO elegido, ya_tiene
      FROM _dv_equipos e
      LEFT JOIN (SELECT r.equipo_id, count(*) AS n FROM _dv_resultado r GROUP BY r.equipo_id) c ON c.equipo_id = e.id
      WHERE e.conf = v_conf
      ORDER BY coalesce(c.n, 0) ASC, e.pct DESC, e.seed ASC
      LIMIT 1;
      IF elegido IS NOT NULL THEN
        INSERT INTO _dv_resultado VALUES (elegido, part.nombre, v_conf,
          CASE WHEN ya_tiene = 0 THEN 'Asignado por puntaje' ELSE 'Asignado por puntaje (compartido)' END);
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT r.equipo_id, r.participante, r.conf, r.motivo FROM _dv_resultado r;
END $$;

CREATE OR REPLACE FUNCTION auto_asignar_divisional(p_grupo uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.rol_en_grupo(p_grupo), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = 'divisional' AND grupo_id = p_grupo;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, 'divisional', p_grupo FROM calcular_auto_asignacion_divisional(p_grupo) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

REVOKE ALL ON FUNCTION calcular_auto_asignacion_divisional(uuid), auto_asignar_divisional(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_asignar_divisional(uuid) TO authenticated;

-- ============================================================
-- RONDAS ELIMINATORIAS GENERALIZADAS (2026-10-04): divisional y final de
-- conferencia comparten el mismo algoritmo. calcular_auto_asignacion_divisional
-- y auto_asignar_divisional quedan como atajos hacia la versión general.
-- ============================================================

CREATE OR REPLACE FUNCTION calcular_auto_asignacion_eliminatoria(p_grupo uuid, p_etapa text)
RETURNS TABLE (equipo_id text, participante text, conferencia text, motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- Vivos: los ganadores de la ronda anterior con resultado (en divisional,
-- además las dos primeras semillas, que descansaron en comodines).
-- 1. Cada uno conserva sus equipos de la ronda anterior que siguen vivos.
-- 2. De menor a mayor puntaje (empate: número de sorteo), cada uno completa la
--    conferencia que le falta: primero el equipo con menos participantes, y entre
--    ellos el de mejor récord de temporada regular (desempate: semilla).
#variable_conflict use_column
DECLARE
  anterior text;
  nombre_anterior text;
  part record;
  v_conf text;
  elegido text;
  ya_tiene int;
BEGIN
  IF p_etapa = 'divisional' THEN
    anterior := 'wildcard'; nombre_anterior := 'comodines';
  ELSIF p_etapa = 'conferencia' THEN
    anterior := 'divisional'; nombre_anterior := 'la ronda divisional';
  ELSE
    RAISE EXCEPTION 'Etapa no soportada: %', p_etapa USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _el_equipos;
  DROP TABLE IF EXISTS _el_resultado;

  CREATE TEMP TABLE _el_equipos ON COMMIT DROP AS
  WITH ganadores AS (
    SELECT CASE WHEN j.resultado_local > j.resultado_visitante THEN j.local ELSE j.visitante END AS nombre
    FROM juegos j
    WHERE j.etapa = anterior AND j.estado <> 'en_vivo'
      AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
      AND j.resultado_local <> j.resultado_visitante
  )
  SELECT e.id, e.nombre, left(e.division, 3) AS conf, e.seed_conferencia AS seed, coalesce(r.pct, 0) AS pct
  FROM equipos e
  LEFT JOIN LATERAL (
    SELECT sum(CASE WHEN x.propio > x.rival THEN 1 WHEN x.propio = x.rival THEN 0.5 ELSE 0 END) / nullif(count(*), 0) AS pct
    FROM (
      SELECT CASE WHEN j.local = e.nombre THEN j.resultado_local ELSE j.resultado_visitante END AS propio,
             CASE WHEN j.local = e.nombre THEN j.resultado_visitante ELSE j.resultado_local END AS rival
      FROM juegos j
      WHERE j.etapa = 'regular' AND j.estado <> 'en_vivo'
        AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
        AND (j.local = e.nombre OR j.visitante = e.nombre)
    ) x
  ) r ON true
  WHERE e.nombre IN (SELECT g.nombre FROM ganadores g)
     OR (p_etapa = 'divisional' AND e.seed_conferencia = 1);

  CREATE TEMP TABLE _el_resultado (equipo_id text, participante text, conf text, motivo text) ON COMMIT DROP;

  INSERT INTO _el_resultado
  SELECT DISTINCT ON (a.participante, e.conf) e.id, a.participante, e.conf,
         CASE WHEN p_etapa = 'divisional' AND e.seed = 1 THEN 'Conserva su primera semilla'
              ELSE 'Conserva: ganó en ' || nombre_anterior END
  FROM asignacion a
  JOIN _el_equipos e ON e.id = a.equipo_id
  WHERE a.etapa = anterior AND a.grupo_id = p_grupo
  ORDER BY a.participante, e.conf, e.pct DESC, e.seed ASC;

  FOR part IN
    SELECT pg.participante AS nombre FROM puntajes_grupo(p_grupo) pg ORDER BY pg.puntos ASC, pg.numero ASC
  LOOP
    FOREACH v_conf IN ARRAY ARRAY['AFC', 'NFC'] LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM _el_resultado r WHERE r.participante = part.nombre AND r.conf = v_conf);
      elegido := NULL;
      SELECT e.id, coalesce(c.n, 0) INTO elegido, ya_tiene
      FROM _el_equipos e
      LEFT JOIN (SELECT r.equipo_id, count(*) AS n FROM _el_resultado r GROUP BY r.equipo_id) c ON c.equipo_id = e.id
      WHERE e.conf = v_conf
      ORDER BY coalesce(c.n, 0) ASC, e.pct DESC, e.seed ASC
      LIMIT 1;
      IF elegido IS NOT NULL THEN
        INSERT INTO _el_resultado VALUES (elegido, part.nombre, v_conf,
          CASE WHEN ya_tiene = 0 THEN 'Asignado por puntaje' ELSE 'Asignado por puntaje (compartido)' END);
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT r.equipo_id, r.participante, r.conf, r.motivo FROM _el_resultado r;
END $$;

CREATE OR REPLACE FUNCTION auto_asignar_eliminatoria(p_grupo uuid, p_etapa text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF p_etapa NOT IN ('divisional', 'conferencia') THEN
    RAISE EXCEPTION 'Etapa no soportada: %', p_etapa USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.rol_en_grupo(p_grupo), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = p_etapa AND grupo_id = p_grupo;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, p_etapa, p_grupo FROM calcular_auto_asignacion_eliminatoria(p_grupo, p_etapa) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

CREATE OR REPLACE FUNCTION calcular_auto_asignacion_divisional(p_grupo uuid)
RETURNS TABLE (equipo_id text, participante text, conferencia text, motivo text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM calcular_auto_asignacion_eliminatoria(p_grupo, 'divisional')
$$;

CREATE OR REPLACE FUNCTION auto_asignar_divisional(p_grupo uuid) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT auto_asignar_eliminatoria(p_grupo, 'divisional')
$$;

REVOKE ALL ON FUNCTION calcular_auto_asignacion_eliminatoria(uuid, text), auto_asignar_eliminatoria(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_asignar_eliminatoria(uuid, text) TO authenticated;

-- ============================================================
-- AUTO-ASIGNACIÓN DEL SUPER BOWL (2026-10-04): un solo equipo por
-- participante, repartidos de forma pareja entre los dos finalistas.
-- ============================================================

CREATE OR REPLACE FUNCTION calcular_auto_asignacion_superbowl(p_grupo uuid)
RETURNS TABLE (equipo_id text, participante text, conferencia text, motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- 1. Quien tiene vivo uno de los finalistas en su asignación de la final de
--    conferencia lo conserva; si tiene los dos, conserva el de mejor récord.
-- 2. Si un equipo queda con más de la mitad (redondeando hacia arriba), los de
--    mayor puntaje de ese lado pasan al otro.
-- 3. Quien no tiene equipo, de menor a mayor puntaje (empate: número de sorteo),
--    va al equipo con menos participantes; si empatan, al de mejor récord.
-- "Mejor récord" = % de victorias de temporada regular, luego semilla, luego
-- diferencia de puntos (los finalistas pueden empatar en récord y semilla).
#variable_conflict use_column
DECLARE
  total int;
  cupo int;
  part record;
  elegido text;
  v_conf text;
BEGIN
  DROP TABLE IF EXISTS _sb_equipos;
  DROP TABLE IF EXISTS _sb_resultado;

  CREATE TEMP TABLE _sb_equipos ON COMMIT DROP AS
  WITH ganadores AS (
    SELECT CASE WHEN j.resultado_local > j.resultado_visitante THEN j.local ELSE j.visitante END AS nombre
    FROM juegos j
    WHERE j.etapa = 'conferencia' AND j.estado <> 'en_vivo'
      AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
      AND j.resultado_local <> j.resultado_visitante
  )
  SELECT e.id, e.nombre, left(e.division, 3) AS conf, e.seed_conferencia AS seed,
         coalesce(r.pct, 0) AS pct, coalesce(r.dif, 0) AS dif
  FROM equipos e
  LEFT JOIN LATERAL (
    SELECT sum(CASE WHEN x.propio > x.rival THEN 1 WHEN x.propio = x.rival THEN 0.5 ELSE 0 END) / nullif(count(*), 0) AS pct,
           sum(x.propio - x.rival) AS dif
    FROM (
      SELECT CASE WHEN j.local = e.nombre THEN j.resultado_local ELSE j.resultado_visitante END AS propio,
             CASE WHEN j.local = e.nombre THEN j.resultado_visitante ELSE j.resultado_local END AS rival
      FROM juegos j
      WHERE j.etapa = 'regular' AND j.estado <> 'en_vivo'
        AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
        AND (j.local = e.nombre OR j.visitante = e.nombre)
    ) x
  ) r ON true
  WHERE e.nombre IN (SELECT g.nombre FROM ganadores g);

  CREATE TEMP TABLE _sb_resultado (
    equipo_id text, participante text, conf text, motivo text, puntos numeric, numero numeric
  ) ON COMMIT DROP;

  INSERT INTO _sb_resultado
  SELECT DISTINCT ON (a.participante) e.id, a.participante, e.conf,
         CASE WHEN count(*) OVER (PARTITION BY a.participante) > 1
              THEN 'Conserva el de mejor récord (tenía los dos)'
              ELSE 'Conserva: ganó la final de conferencia' END,
         pg.puntos, pg.numero
  FROM asignacion a
  JOIN _sb_equipos e ON e.id = a.equipo_id
  JOIN puntajes_grupo(p_grupo) pg ON pg.participante = a.participante
  WHERE a.etapa = 'conferencia' AND a.grupo_id = p_grupo
  ORDER BY a.participante, e.pct DESC, e.seed ASC, e.dif DESC;

  SELECT count(*) INTO total FROM participantes p WHERE p.grupo_id = p_grupo;
  cupo := ceil(total / 2.0);
  UPDATE _sb_resultado r
  SET equipo_id = otro.id, conf = otro.conf, motivo = 'Pasa al otro equipo para repartir parejo'
  FROM (
    SELECT r2.participante, r2.equipo_id,
           row_number() OVER (PARTITION BY r2.equipo_id ORDER BY r2.puntos ASC, r2.numero ASC) AS orden
    FROM _sb_resultado r2
  ) o, _sb_equipos otro
  WHERE o.participante = r.participante AND o.orden > cupo AND otro.id <> o.equipo_id;

  FOR part IN
    SELECT pg.participante AS nombre, pg.puntos, pg.numero
    FROM puntajes_grupo(p_grupo) pg
    WHERE pg.participante NOT IN (SELECT r.participante FROM _sb_resultado r)
    ORDER BY pg.puntos ASC, pg.numero ASC
  LOOP
    elegido := NULL;
    SELECT e.id, e.conf INTO elegido, v_conf
    FROM _sb_equipos e
    LEFT JOIN (SELECT r.equipo_id, count(*) AS cuantos FROM _sb_resultado r GROUP BY r.equipo_id) c ON c.equipo_id = e.id
    ORDER BY coalesce(c.cuantos, 0) ASC, e.pct DESC, e.seed ASC, e.dif DESC
    LIMIT 1;
    IF elegido IS NOT NULL THEN
      INSERT INTO _sb_resultado VALUES (elegido, part.nombre, v_conf, 'Asignado por puntaje', part.puntos, part.numero);
    END IF;
  END LOOP;

  RETURN QUERY SELECT r.equipo_id, r.participante, r.conf, r.motivo FROM _sb_resultado r;
END $$;

CREATE OR REPLACE FUNCTION auto_asignar_eliminatoria(p_grupo uuid, p_etapa text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF p_etapa NOT IN ('divisional', 'conferencia', 'superbowl') THEN
    RAISE EXCEPTION 'Etapa no soportada: %', p_etapa USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.rol_en_grupo(p_grupo), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = p_etapa AND grupo_id = p_grupo;
  IF p_etapa = 'superbowl' THEN
    INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
      SELECT c.equipo_id, c.participante, p_etapa, p_grupo FROM calcular_auto_asignacion_superbowl(p_grupo) c;
  ELSE
    INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
      SELECT c.equipo_id, c.participante, p_etapa, p_grupo FROM calcular_auto_asignacion_eliminatoria(p_grupo, p_etapa) c;
  END IF;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

REVOKE ALL ON FUNCTION calcular_auto_asignacion_superbowl(uuid) FROM PUBLIC;

-- ============================================================
-- PUNTAJES SOLO CON JUEGOS TERMINADOS (2026-10-04): puntajes_grupo() deja de
-- contar juegos en vivo (marcador parcial) o pospuestos.
-- ============================================================

CREATE OR REPLACE FUNCTION puntajes_grupo(p_grupo uuid)
RETURNS TABLE (participante text, numero numeric, puntos numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH valores(etapa, valor) AS (
    VALUES ('regular', 10), ('wildcard', 20), ('divisional', 30), ('conferencia', 40), ('superbowl', 50)
  ),
  regular_terminada AS (
    SELECT EXISTS (SELECT 1 FROM juegos WHERE etapa = 'regular')
       AND NOT EXISTS (SELECT 1 FROM juegos WHERE etapa = 'regular' AND estado IN ('programado', 'en_vivo')) AS t
  ),
  por_asignacion AS (
    SELECT a.participante,
           v.valor * (
             SELECT coalesce(sum(CASE WHEN x.propio > x.rival THEN 1 WHEN x.propio = x.rival THEN 0.5 ELSE 0 END), 0)
             FROM (
               SELECT CASE WHEN j.local = e.nombre THEN j.resultado_local ELSE j.resultado_visitante END AS propio,
                      CASE WHEN j.local = e.nombre THEN j.resultado_visitante ELSE j.resultado_local END AS rival
               FROM juegos j
               WHERE j.etapa = a.etapa
                 AND (j.local = e.nombre OR j.visitante = e.nombre)
                 AND j.resultado_local IS NOT NULL AND j.resultado_visitante IS NOT NULL
                 AND j.estado NOT IN ('en_vivo', 'pospuesto')
             ) x
           )
           + CASE WHEN a.etapa = 'wildcard' AND e.seed_conferencia = 1 AND (SELECT t FROM regular_terminada) THEN 20 ELSE 0 END
           AS puntos
    FROM asignacion a
    JOIN equipos e ON e.id = a.equipo_id
    JOIN valores v ON v.etapa = a.etapa
    WHERE a.grupo_id = p_grupo
  )
  SELECT p.nombre, p.numero, coalesce(sum(pa.puntos), 0)
  FROM participantes p
  LEFT JOIN por_asignacion pa ON pa.participante = p.nombre
  WHERE p.grupo_id = p_grupo
  GROUP BY p.nombre, p.numero
$$;

-- 2026-10-04: sorteo de números de participantes en SQL, para que también lo
-- puedan hacer los administradores del grupo (no escriben directo en participantes).
CREATE OR REPLACE FUNCTION sortear_numeros(p_grupo uuid) RETURNS TABLE (id uuid, nombre text, numero numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(public.rol_en_grupo(p_grupo), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para sortear los números de este grupo' USING ERRCODE = '42501';
  END IF;
  UPDATE participantes p SET numero = s.n
    FROM (SELECT x.id, row_number() OVER (ORDER BY random()) AS n FROM participantes x WHERE x.grupo_id = p_grupo) s
    WHERE p.id = s.id;
  RETURN QUERY SELECT p.id, p.nombre, p.numero FROM participantes p WHERE p.grupo_id = p_grupo ORDER BY p.numero;
END $$;

REVOKE ALL ON FUNCTION sortear_numeros(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sortear_numeros(uuid) TO authenticated;

-- 2026-10-10: las reglas de lectura de grupos/participantes/asignacion y las de
-- escritura del superusuario comparan auth.user_id() directamente, en vez de pasar
-- por es_superusuario()/rol_en_grupo() (SECURITY DEFINER): dentro de esas funciones
-- auth.user_id() a veces respondía vacío y la consulta devolvía 0 filas sin error
-- (reproducido: el superusuario vio 0 grupos y, segundos después, 1). Las reglas de
-- roles_usuario y miembros_grupo (lectura) no cambian: ya comparan su propia fila
-- directamente, y una subconsulta a la misma tabla en su regla sería recursiva.
ALTER POLICY "Miembros ven sus grupos" ON grupos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario') OR EXISTS (SELECT 1 FROM public.miembros_grupo m WHERE m.grupo_id = grupos.id AND m.user_id::text = auth.user_id()));
ALTER POLICY "Miembros ven participantes de sus grupos" ON participantes USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario') OR EXISTS (SELECT 1 FROM public.miembros_grupo m WHERE m.grupo_id = participantes.grupo_id AND m.user_id::text = auth.user_id()));
ALTER POLICY "Miembros ven asignaciones de sus grupos" ON asignacion USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario') OR EXISTS (SELECT 1 FROM public.miembros_grupo m WHERE m.grupo_id = asignacion.grupo_id AND m.user_id::text = auth.user_id()));
ALTER POLICY "Superusuario puede eliminar asignacion" ON asignacion USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede insertar asignacion" ON asignacion WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede actualizar asignacion" ON asignacion USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede eliminar equipos" ON equipos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede insertar equipos" ON equipos WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede actualizar equipos" ON equipos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede eliminar grupos" ON grupos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede insertar grupos" ON grupos WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede actualizar grupos" ON grupos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede eliminar juegos" ON juegos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede insertar juegos" ON juegos WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede actualizar juegos" ON juegos USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede eliminar participantes" ON participantes USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede insertar participantes" ON participantes WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede actualizar participantes" ON participantes USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede eliminar semana" ON semana USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede insertar semana" ON semana WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario puede actualizar semana" ON semana USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario elimina membresias" ON miembros_grupo USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario inserta membresias" ON miembros_grupo WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));
ALTER POLICY "Superusuario actualiza membresias" ON miembros_grupo USING (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario')) WITH CHECK (EXISTS (SELECT 1 FROM public.roles_usuario r WHERE r.user_id::text = auth.user_id() AND r.rol = 'superusuario'));

-- 2026-10-11: las funciones que llama la app (auto-asignar, sorteo, agregar
-- miembro, usuarios visibles) también fallaban de vez en cuando con "No
-- autorizado": comprobaban el rol con rol_en_grupo()/es_superusuario(), y dentro
-- de SECURITY DEFINER auth.user_id() a veces responde vacío. Ahora cada una es una
-- envoltura SECURITY INVOKER en public (la que expone el Data API) que lee
-- auth.user_id() en el contexto del usuario y se lo pasa a su núcleo SECURITY
-- DEFINER en el esquema `privado`. El Data API solo expone `public`, así que nadie
-- puede llamar el núcleo pasando el id de otro usuario. Las envolturas usan cuerpo
-- SQL estándar (BEGIN ATOMIC): se guarda ya analizado, como una regla RLS, porque
-- `authenticated` no tiene USAGE sobre el esquema `auth`.
CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC;
GRANT USAGE ON SCHEMA privado TO authenticated;

CREATE OR REPLACE FUNCTION privado.es_superusuario_de(p_uid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.roles_usuario WHERE user_id::text = p_uid AND rol = 'superusuario')
$$;

CREATE OR REPLACE FUNCTION privado.rol_en_grupo_de(p_grupo uuid, p_uid text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN privado.es_superusuario_de(p_uid) THEN 'superusuario'
    ELSE (SELECT rol FROM public.miembros_grupo WHERE user_id::text = p_uid AND grupo_id = p_grupo) END
$$;

CREATE OR REPLACE FUNCTION privado.auto_asignar_temporada_regular(p_grupo uuid, p_uid text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(privado.rol_en_grupo_de(p_grupo, p_uid), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = 'regular' AND grupo_id = p_grupo;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, 'regular', p_grupo FROM calcular_auto_asignacion_regular(p_grupo) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

CREATE OR REPLACE FUNCTION privado.auto_asignar_wildcard(p_grupo uuid, p_uid text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(privado.rol_en_grupo_de(p_grupo, p_uid), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = 'wildcard' AND grupo_id = p_grupo;
  INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
    SELECT c.equipo_id, c.participante, 'wildcard', p_grupo FROM calcular_auto_asignacion_wildcard(p_grupo) c;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

CREATE OR REPLACE FUNCTION privado.auto_asignar_eliminatoria(p_grupo uuid, p_etapa text, p_uid text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asignados int;
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF p_etapa NOT IN ('divisional', 'conferencia', 'superbowl') THEN
    RAISE EXCEPTION 'Etapa no soportada: %', p_etapa USING ERRCODE = '22023';
  END IF;
  IF coalesce(privado.rol_en_grupo_de(p_grupo, p_uid), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para auto-asignar este grupo' USING ERRCODE = '42501';
  END IF;
  DELETE FROM asignacion WHERE etapa = p_etapa AND grupo_id = p_grupo;
  IF p_etapa = 'superbowl' THEN
    INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
      SELECT c.equipo_id, c.participante, p_etapa, p_grupo FROM calcular_auto_asignacion_superbowl(p_grupo) c;
  ELSE
    INSERT INTO asignacion (equipo_id, participante, etapa, grupo_id)
      SELECT c.equipo_id, c.participante, p_etapa, p_grupo FROM calcular_auto_asignacion_eliminatoria(p_grupo, p_etapa) c;
  END IF;
  GET DIAGNOSTICS asignados = ROW_COUNT;
  RETURN asignados;
END $$;

CREATE OR REPLACE FUNCTION privado.sortear_numeros(p_grupo uuid, p_uid text) RETURNS TABLE (id uuid, nombre text, numero numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_grupo IS NULL THEN
    RAISE EXCEPTION 'Grupo requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(privado.rol_en_grupo_de(p_grupo, p_uid), '') NOT IN ('superusuario', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado para sortear los números de este grupo' USING ERRCODE = '42501';
  END IF;
  UPDATE participantes p SET numero = s.n
    FROM (SELECT x.id, row_number() OVER (ORDER BY random()) AS n FROM participantes x WHERE x.grupo_id = p_grupo) s
    WHERE p.id = s.id;
  RETURN QUERY SELECT p.id, p.nombre, p.numero FROM participantes p WHERE p.grupo_id = p_grupo ORDER BY p.numero;
END $$;

CREATE OR REPLACE FUNCTION privado.agregar_miembro(p_email text, p_grupo uuid, p_rol text, p_uid text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- Superusuario: cualquier grupo y rol. Administrador: solo 'lectura' en grupos que administra.
-- Si ya era miembro no cambia su rol.
DECLARE
  uid uuid;
  rol_caller text := privado.rol_en_grupo_de(p_grupo, p_uid);
BEGIN
  IF p_rol NOT IN ('administrador', 'lectura') THEN
    RAISE EXCEPTION 'Rol invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT (rol_caller = 'superusuario' OR (rol_caller = 'administrador' AND p_rol = 'lectura')) THEN
    RAISE EXCEPTION 'No autorizado para agregar miembros a este grupo' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO uid FROM neon_auth."user" u WHERE lower(u.email) = lower(trim(p_email));
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario con ese email' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO miembros_grupo (user_id, grupo_id, rol) VALUES (uid, p_grupo, p_rol)
    ON CONFLICT (user_id, grupo_id) DO NOTHING;
  RETURN uid;
END $$;

CREATE OR REPLACE FUNCTION privado.usuarios_visibles(p_uid text)
RETURNS TABLE (user_id uuid, email text, es_superusuario boolean, grupo_id uuid, grupo text, rol text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Una fila por (usuario, grupo); usuarios sin grupos salen una vez con grupo NULL.
  -- Superusuario: todos. Administrador: miembros de los grupos que administra.
  SELECT u.id, u.email, (r.user_id IS NOT NULL), m.grupo_id, g.nombre, m.rol
  FROM neon_auth."user" u
  LEFT JOIN public.roles_usuario r ON r.user_id = u.id
  LEFT JOIN public.miembros_grupo m ON m.user_id = u.id
  LEFT JOIN public.grupos g ON g.id = m.grupo_id
  WHERE privado.es_superusuario_de(p_uid)
     OR (m.grupo_id IS NOT NULL AND privado.rol_en_grupo_de(m.grupo_id, p_uid) = 'administrador')
  ORDER BY u.email, g.nombre
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA privado FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA privado TO authenticated;

-- Envolturas públicas (mismas firmas que antes; el frontend no cambia).
CREATE OR REPLACE FUNCTION public.auto_asignar_temporada_regular(p_grupo uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER
BEGIN ATOMIC
  SELECT privado.auto_asignar_temporada_regular(p_grupo, auth.user_id());
END;

CREATE OR REPLACE FUNCTION public.auto_asignar_wildcard(p_grupo uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER
BEGIN ATOMIC
  SELECT privado.auto_asignar_wildcard(p_grupo, auth.user_id());
END;

CREATE OR REPLACE FUNCTION public.auto_asignar_eliminatoria(p_grupo uuid, p_etapa text) RETURNS integer
LANGUAGE sql SECURITY INVOKER
BEGIN ATOMIC
  SELECT privado.auto_asignar_eliminatoria(p_grupo, p_etapa, auth.user_id());
END;

CREATE OR REPLACE FUNCTION public.auto_asignar_divisional(p_grupo uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER
BEGIN ATOMIC
  SELECT privado.auto_asignar_eliminatoria(p_grupo, 'divisional', auth.user_id());
END;

CREATE OR REPLACE FUNCTION public.sortear_numeros(p_grupo uuid) RETURNS TABLE (id uuid, nombre text, numero numeric)
LANGUAGE sql SECURITY INVOKER
BEGIN ATOMIC
  SELECT s.id, s.nombre, s.numero FROM privado.sortear_numeros(p_grupo, auth.user_id()) s;
END;

CREATE OR REPLACE FUNCTION public.agregar_miembro(p_email text, p_grupo uuid, p_rol text DEFAULT 'lectura') RETURNS uuid
LANGUAGE sql SECURITY INVOKER
BEGIN ATOMIC
  SELECT privado.agregar_miembro(p_email, p_grupo, p_rol, auth.user_id());
END;

CREATE OR REPLACE FUNCTION public.usuarios_visibles()
RETURNS TABLE (user_id uuid, email text, es_superusuario boolean, grupo_id uuid, grupo text, rol text)
LANGUAGE sql STABLE SECURITY INVOKER
BEGIN ATOMIC
  SELECT v.user_id, v.email, v.es_superusuario, v.grupo_id, v.grupo, v.rol FROM privado.usuarios_visibles(auth.user_id()) v;
END;

NOTIFY pgrst, 'reload schema';
