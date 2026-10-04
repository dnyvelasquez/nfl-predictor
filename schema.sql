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
