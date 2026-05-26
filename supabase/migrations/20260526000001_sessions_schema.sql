-- ============================================================
-- B1 : Schéma sessions (séances)
-- Crée la table `sessions` (niveau au-dessus de `tables`),
-- rattache `tables.session_id`, pose RLS + fonctions SECURITY DEFINER.
-- Le mot de passe superadmin est stocké hashé dans app_config
-- (même pattern que creation_code_hash).
--
-- ⚠️  Après application, Jules doit définir le vrai mot de passe :
--   INSERT INTO app_config (key, value)
--   VALUES ('superadmin_code_hash', crypt('MON_MOT_DE_PASSE', gen_salt('bf')))
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- ============================================================

-- ── A. Table sessions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  scheduled_at timestamptz,
  join_code    text,
  phase        text NOT NULL DEFAULT 'draft'
               CHECK (phase IN ('draft', 'voting', 'allocating', 'debating', 'questionnaire', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Unicité du join_code parmi les séances non-fermées uniquement.
-- Permet de réutiliser un code d'une séance fermée.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_join_code_active_idx
  ON sessions (join_code)
  WHERE phase != 'closed' AND join_code IS NOT NULL;

-- ── B. Colonne session_id sur tables ──────────────────────────

ALTER TABLE tables ADD COLUMN IF NOT EXISTS
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;

-- ── C. RLS sur sessions ───────────────────────────────────────

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Lecture publique : tout utilisateur authentifié peut lister les séances.
DROP POLICY IF EXISTS sessions_select ON sessions;
CREATE POLICY sessions_select ON sessions
  FOR SELECT USING (true);

-- Pas de politique INSERT / UPDATE / DELETE → bloqué sauf SECURITY DEFINER.

-- ── D. Hash superadmin placeholder ───────────────────────────

-- ON CONFLICT DO NOTHING : si Jules a déjà défini une valeur réelle, on ne l'écrase pas.
INSERT INTO app_config (key, value)
VALUES ('superadmin_code_hash', crypt('PLACEHOLDER_CHANGE_ME', gen_salt('bf')))
ON CONFLICT (key) DO NOTHING;

-- ── E. Helper : génération du join_code de séance ─────────────

CREATE OR REPLACE FUNCTION generate_session_join_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code text;
  v_attempts int := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Impossible de générer un join_code unique pour la séance après 10 tentatives';
    END IF;
    v_code := upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6));
    -- Vérifie unicité parmi les séances non-fermées (reflète l'index partiel)
    IF NOT EXISTS (
      SELECT 1 FROM sessions
      WHERE join_code = v_code AND phase != 'closed'
    ) THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

-- ── F. Helper interne : vérification mot de passe superadmin ──

CREATE OR REPLACE FUNCTION check_superadmin_password(p_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_config
    WHERE key = 'superadmin_code_hash'
      AND value = crypt(p_password, value)
  ) THEN
    RAISE EXCEPTION 'Mot de passe superadmin incorrect';
  END IF;
END;
$$;

-- ── G. Fonctions SECURITY DEFINER ─────────────────────────────

-- G1. create_session
DROP FUNCTION IF EXISTS create_session(text, text, text, timestamptz);
CREATE OR REPLACE FUNCTION create_session(
  p_password    text,
  p_title       text,
  p_description text        DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  INSERT INTO sessions (title, description, scheduled_at, join_code)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code())
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- G2. attach_table_to_session
DROP FUNCTION IF EXISTS attach_table_to_session(text, uuid, uuid);
CREATE OR REPLACE FUNCTION attach_table_to_session(
  p_password   text,
  p_table_id   uuid,
  p_session_id uuid
) RETURNS tables
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table tables;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE tables
  SET session_id = p_session_id
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable : %', p_table_id;
  END IF;

  RETURN v_table;
END;
$$;

-- G3. detach_table_from_session
DROP FUNCTION IF EXISTS detach_table_from_session(text, uuid);
CREATE OR REPLACE FUNCTION detach_table_from_session(
  p_password text,
  p_table_id uuid
) RETURNS tables
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_table tables;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE tables
  SET session_id = NULL
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table introuvable : %', p_table_id;
  END IF;

  RETURN v_table;
END;
$$;

-- G4. close_session
DROP FUNCTION IF EXISTS close_session(text, uuid);
CREATE OR REPLACE FUNCTION close_session(
  p_password   text,
  p_session_id uuid
) RETURNS sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session sessions;
BEGIN
  PERFORM check_superadmin_password(p_password);

  UPDATE sessions
  SET phase = 'closed'
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Séance introuvable : %', p_session_id;
  END IF;

  RETURN v_session;
END;
$$;

-- ── H. Realtime publication ───────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
