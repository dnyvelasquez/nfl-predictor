-- Esquema para Neon, replicando 1:1 lo que existe hoy en Supabase
-- (extraído por introspección de information_schema/pg_policies el 2026-08-25),
-- salvo la política de UPDATE público sobre `equipos` para el rol `anon`, que
-- existía en Supabase pero se descarta a propósito (decisión del usuario) para
-- que la escritura quede siempre detrás de autenticación, igual que fifa-predictor.

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
  id         smallint PRIMARY KEY,
  semana     numeric NOT NULL,
  visitante  text,
  local      text,
  fecha      text,
  hora       text
);

CREATE TABLE asignacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id    text REFERENCES equipos(id),
  participante text
);

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
-- RLS: lectura pública sin sesión, CRUD completo solo autenticado
-- (mismo patrón que fifa-predictor; se descarta a propósito la
-- política de UPDATE público sobre equipos que existía en Supabase).
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
    EXECUTE format('CREATE POLICY "Usuarios autenticados pueden insertar %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Usuarios autenticados pueden actualizar %1$s" ON %1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Usuarios autenticados pueden eliminar %1$s" ON %1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;
