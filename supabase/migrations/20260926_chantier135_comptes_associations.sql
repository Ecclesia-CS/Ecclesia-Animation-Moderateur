-- Chantier 135 — comptes associations externes (débat simple + sondage).
--
-- Jules crée un compte par association (nom + mot de passe). L'association se
-- connecte sur #asso et gère SES séances « débat simple » et « sondage », avec
-- au plus N séances non clôturées à la fois (3 par défaut) et une date
-- d'expiration facultative. Ses membres se déclarent modérateurs avec le mot
-- de passe de l'association (à l'entrée comme en cours de séance).
--
-- Principe d'autorisation (fail-closed) :
--   * Une association s'authentifie par nom + mot de passe (org_login) et
--     reçoit un JETON opaque 'org_…' (haché en base, 24 h). C'est ce jeton que
--     le front passe dans le paramètre p_password des RPC d'administration —
--     aucune signature existante ne change.
--   * check_session_admin(p_password, p_session_id) : superadmin → tout ;
--     jeton d'association → uniquement les séances de cette association.
--   * Ce helper ne remplace le contrôle superadmin QUE dans une liste blanche
--     de RPC (section 8). Toutes les autres (allocation, IA, questionnaire,
--     multi-tables, résultats publics…) restent superadmin seul : un jeton
--     d'association y échoue comme un mauvais mot de passe.
--
-- Les réécritures de la section 8 et 9 partent de pg_get_functiondef (corps
-- COURANT en base, pas des anciens fichiers — règle CLAUDE.md § Règle SQL) et
-- ne remplacent que le bloc de contrôle, avec vérification stricte qu'il
-- apparaît exactement une fois. Rejouable sur prod sans risquer d'y écraser
-- un corps plus récent que ce fichier.

-- ── 1. Tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (btrim(name) <> ''),
  password_hash     text NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  expires_at        timestamptz,
  max_open_sessions int NOT NULL DEFAULT 3 CHECK (max_open_sessions >= 0),
  note              text,
  failed_logins     int NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_key ON organizations (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS organization_tokens (
  token_hash      text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_tokens_org_idx ON organization_tokens (organization_id);

-- Aucun accès direct : tout passe par des RPC SECURITY DEFINER.
ALTER TABLE organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organizations, organization_tokens FROM anon, authenticated;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS sessions_organization_idx ON sessions (organization_id) WHERE organization_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_org_type_check') THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_org_type_check
      CHECK (organization_id IS NULL OR session_type IN ('debate', 'poll'));
  END IF;
END $$;

-- ── 2. Helpers d'authentification (internes, non exposés) ──────────────────
CREATE OR REPLACE FUNCTION is_superadmin_password(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_config
    WHERE key = 'superadmin_code_hash' AND value = crypt(coalesce(p_password, ''), value)
  );
$$;

-- Jeton d'association valide → id de l'association (active, non expirée).
-- Tout le reste → NULL (y compris le mot de passe superadmin).
CREATE OR REPLACE FUNCTION org_from_token(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT o.id
  FROM organization_tokens t
  JOIN organizations o ON o.id = t.organization_id
  WHERE p_token LIKE 'org\_%'
    AND t.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND t.expires_at > now()
    AND o.active
    AND (o.expires_at IS NULL OR o.expires_at > now())
  LIMIT 1;
$$;

-- Portée d'administration : NULL = superadmin, sinon l'association. Lève si
-- ni l'un ni l'autre (message « mot de passe » : le front déconnecte).
CREATE OR REPLACE FUNCTION admin_org_scope(p_password text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org uuid := org_from_token(p_password);
BEGIN
  IF v_org IS NOT NULL THEN RETURN v_org; END IF;
  PERFORM check_superadmin_password(p_password);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_session_admin(p_password text, p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org uuid := org_from_token(p_password);
BEGIN
  IF v_org IS NULL THEN
    PERFORM check_superadmin_password(p_password);
    RETURN;
  END IF;
  IF p_session_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM sessions WHERE id = p_session_id AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Accès refusé : cette séance n''appartient pas à votre association';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_table_admin(p_password text, p_table_id uuid)
RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT check_session_admin(p_password, (SELECT session_id FROM tables WHERE id = p_table_id)); $$;

CREATE OR REPLACE FUNCTION check_assertion_admin(p_password text, p_assertion_id uuid)
RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT check_session_admin(p_password, (SELECT session_id FROM assertions WHERE id = p_assertion_id)); $$;

CREATE OR REPLACE FUNCTION check_member_admin(p_password text, p_member_id uuid)
RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT check_session_admin(p_password, (SELECT session_id FROM session_members WHERE id = p_member_id)); $$;

CREATE OR REPLACE FUNCTION check_analysis_admin(p_password text, p_analysis_id uuid)
RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$ SELECT check_session_admin(p_password, (SELECT session_id FROM session_analysis WHERE id = p_analysis_id)); $$;

-- Code de prise de modération : le Code Ecclesia (partout, comme avant), OU
-- le mot de passe de l'association propriétaire de la séance (seulement sur
-- ses propres séances — le mot de passe d'une asso n'ouvre rien ailleurs).
CREATE OR REPLACE FUNCTION check_moderator_code(p_code text, p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM app_config
      WHERE key = 'creation_code_hash' AND value = crypt(coalesce(p_code, ''), value)
    )
    OR EXISTS (
      SELECT 1
      FROM sessions s
      JOIN organizations o ON o.id = s.organization_id
      WHERE s.id = p_session_id
        AND o.active
        AND (o.expires_at IS NULL OR o.expires_at > now())
        AND o.password_hash = crypt(coalesce(p_code, ''), o.password_hash)
    );
$$;

REVOKE ALL ON FUNCTION is_superadmin_password(text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_from_token(text)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_org_scope(text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_session_admin(text, uuid)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_table_admin(text, uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_assertion_admin(text, uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_member_admin(text, uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_analysis_admin(text, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_moderator_code(text, uuid)        FROM PUBLIC, anon, authenticated;

-- ── 3. Quota et invariants des séances d'association ───────────────────────
-- Trigger plutôt que contrôle dans create_session : couvre aussi la
-- réouverture d'une séance clôturée (set_session_phase closed → autre).
CREATE OR REPLACE FUNCTION enforce_org_session_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max  int;
  v_open int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'L''association d''une séance ne peut pas être modifiée';
  END IF;

  IF NEW.organization_id IS NULL OR NEW.phase = 'closed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.phase <> 'closed' THEN
    RETURN NEW;  -- déjà comptée comme ouverte
  END IF;

  -- Verrou sur l'association : deux créations simultanées ne passent pas
  -- toutes les deux sous la limite.
  SELECT max_open_sessions INTO v_max FROM organizations WHERE id = NEW.organization_id FOR UPDATE;
  SELECT count(*) INTO v_open
  FROM sessions
  WHERE organization_id = NEW.organization_id AND phase <> 'closed' AND id <> NEW.id;

  IF v_open >= v_max THEN
    RAISE EXCEPTION 'Limite atteinte : % séance(s) non clôturée(s) à la fois pour votre association. Clôturez-en une avant d''en ouvrir une autre.', v_max;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION enforce_org_session_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sessions_org_rules ON sessions;
CREATE TRIGGER sessions_org_rules
  BEFORE INSERT OR UPDATE OF phase, organization_id ON sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_org_session_rules();

-- ── 4. Connexion d'une association ──────────────────────────────────────────
-- Renvoie {token, organization} ou {error} — pas d'exception sur échec, sinon
-- le compteur d'échecs (verrou 15 min après 10 échecs) serait annulé avec
-- la transaction.
CREATE OR REPLACE FUNCTION org_login(p_name text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org   organizations%ROWTYPE;
  v_token text;
  v_err   constant text := 'Nom d''association ou mot de passe incorrect';
BEGIN
  SELECT * INTO v_org FROM organizations
  WHERE lower(btrim(name)) = lower(btrim(coalesce(p_name, '')))
  FOR UPDATE;

  IF v_org.id IS NULL THEN
    RETURN jsonb_build_object('error', v_err);
  END IF;
  IF v_org.locked_until IS NOT NULL AND v_org.locked_until > now() THEN
    RETURN jsonb_build_object('error', 'Trop de tentatives. Réessayez dans quelques minutes.');
  END IF;
  IF v_org.password_hash IS DISTINCT FROM crypt(coalesce(p_password, ''), v_org.password_hash) THEN
    UPDATE organizations
    SET failed_logins = CASE WHEN failed_logins + 1 >= 10 THEN 0 ELSE failed_logins + 1 END,
        locked_until  = CASE WHEN failed_logins + 1 >= 10 THEN now() + interval '15 minutes' ELSE locked_until END
    WHERE id = v_org.id;
    RETURN jsonb_build_object('error', v_err);
  END IF;
  IF NOT v_org.active THEN
    RETURN jsonb_build_object('error', 'Ce compte est désactivé. Contactez Ecclesia.');
  END IF;
  IF v_org.expires_at IS NOT NULL AND v_org.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'Ce compte a expiré. Contactez Ecclesia.');
  END IF;

  UPDATE organizations SET failed_logins = 0, locked_until = NULL WHERE id = v_org.id;
  DELETE FROM organization_tokens WHERE expires_at <= now();

  v_token := 'org_' || encode(gen_random_bytes(32), 'hex');
  INSERT INTO organization_tokens (token_hash, organization_id, expires_at)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_org.id, now() + interval '24 hours');

  RETURN jsonb_build_object(
    'token', v_token,
    'organization', jsonb_build_object(
      'id', v_org.id, 'name', v_org.name,
      'expires_at', v_org.expires_at, 'max_open_sessions', v_org.max_open_sessions
    )
  );
END;
$$;

-- Qui suis-je (reconnexion automatique depuis sessionStorage). Lève si le
-- jeton n'est plus valable.
CREATE OR REPLACE FUNCTION org_whoami(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org organizations%ROWTYPE;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = org_from_token(p_token);
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Session expirée : mot de passe à ressaisir';
  END IF;
  RETURN jsonb_build_object(
    'id', v_org.id, 'name', v_org.name,
    'expires_at', v_org.expires_at, 'max_open_sessions', v_org.max_open_sessions,
    'open_sessions', (SELECT count(*) FROM sessions WHERE organization_id = v_org.id AND phase <> 'closed')
  );
END;
$$;

CREATE OR REPLACE FUNCTION org_logout(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  DELETE FROM organization_tokens WHERE token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- L'association change elle-même son mot de passe (ancien requis). Les
-- autres connexions ouvertes de l'association sont fermées.
CREATE OR REPLACE FUNCTION org_change_password(p_token text, p_old_password text, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org organizations%ROWTYPE;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = org_from_token(p_token) FOR UPDATE;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Session expirée : mot de passe à ressaisir';
  END IF;
  IF v_org.password_hash IS DISTINCT FROM crypt(coalesce(p_old_password, ''), v_org.password_hash) THEN
    RAISE EXCEPTION 'Ancien mot de passe incorrect';
  END IF;
  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Le nouveau mot de passe doit faire au moins 8 caractères';
  END IF;
  UPDATE organizations SET password_hash = crypt(p_new_password, gen_salt('bf')) WHERE id = v_org.id;
  DELETE FROM organization_tokens
  WHERE organization_id = v_org.id
    AND token_hash <> encode(digest(p_token, 'sha256'), 'hex');
END;
$$;

GRANT EXECUTE ON FUNCTION org_login(text, text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION org_whoami(text)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION org_logout(text)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION org_change_password(text, text, text)    TO anon, authenticated;

-- ── 5. Gestion des comptes par le superadmin ───────────────────────────────
CREATE OR REPLACE FUNCTION list_organizations_admin(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'active', o.active, 'expires_at', o.expires_at,
      'max_open_sessions', o.max_open_sessions, 'note', o.note, 'created_at', o.created_at,
      'open_sessions',  (SELECT count(*) FROM sessions s WHERE s.organization_id = o.id AND s.phase <> 'closed'),
      'total_sessions', (SELECT count(*) FROM sessions s WHERE s.organization_id = o.id)
    ) ORDER BY lower(o.name))
    FROM organizations o
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION create_organization(
  p_password          text,
  p_name              text,
  p_org_password      text,
  p_expires_at        timestamptz DEFAULT NULL,
  p_max_open_sessions int         DEFAULT 3,
  p_note              text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM check_superadmin_password(p_password);
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Nom de l''association requis';
  END IF;
  IF length(coalesce(p_org_password, '')) < 8 THEN
    RAISE EXCEPTION 'Le mot de passe doit faire au moins 8 caractères';
  END IF;
  BEGIN
    INSERT INTO organizations (name, password_hash, expires_at, max_open_sessions, note)
    VALUES (btrim(p_name), crypt(p_org_password, gen_salt('bf')), p_expires_at,
            coalesce(p_max_open_sessions, 3), nullif(btrim(coalesce(p_note, '')), ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Une association porte déjà ce nom';
  END;
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Met à jour TOUS les champs (le front renvoie l'objet complet) : une date
-- d'expiration NULL signifie « pas d'expiration ».
CREATE OR REPLACE FUNCTION update_organization(
  p_password          text,
  p_org_id            uuid,
  p_name              text,
  p_active            boolean,
  p_expires_at        timestamptz,
  p_max_open_sessions int,
  p_note              text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Nom de l''association requis';
  END IF;
  BEGIN
    UPDATE organizations
    SET name = btrim(p_name), active = coalesce(p_active, active), expires_at = p_expires_at,
        max_open_sessions = coalesce(p_max_open_sessions, max_open_sessions),
        note = nullif(btrim(coalesce(p_note, '')), '')
    WHERE id = p_org_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Une association porte déjà ce nom';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Association introuvable';
  END IF;
  IF p_active = false THEN
    DELETE FROM organization_tokens WHERE organization_id = p_org_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION set_organization_password(p_password text, p_org_id uuid, p_org_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM check_superadmin_password(p_password);
  IF length(coalesce(p_org_password, '')) < 8 THEN
    RAISE EXCEPTION 'Le mot de passe doit faire au moins 8 caractères';
  END IF;
  UPDATE organizations
  SET password_hash = crypt(p_org_password, gen_salt('bf')), failed_logins = 0, locked_until = NULL
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Association introuvable';
  END IF;
  DELETE FROM organization_tokens WHERE organization_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION list_organizations_admin(text)                                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_organization(text, text, text, timestamptz, int, text)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_organization(text, uuid, text, boolean, timestamptz, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_organization_password(text, uuid, text)                           TO anon, authenticated;

-- Nom de l'association organisatrice, pour l'affichage côté participant
-- (« Organisé par … ») et le libellé du code modérateur. Information publique.
CREATE OR REPLACE FUNCTION get_session_organization_name(p_session_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name FROM sessions s JOIN organizations o ON o.id = s.organization_id WHERE s.id = p_session_id;
$$;
GRANT EXECUTE ON FUNCTION get_session_organization_name(uuid) TO anon, authenticated;

-- ── 6. Création d'une table de séance (interne) ─────────────────────────────
-- Extrait de admin_create_session_table (corps courant au 2026-09-26) pour que
-- create_session puisse créer la table d'un débat simple sans lui repasser le
-- mot de passe (un jeton d'association y serait refusé : ajouter des tables
-- reste réservé au superadmin, les associations ont une seule table).
CREATE OR REPLACE FUNCTION create_session_table_internal(p_session_id uuid, p_leaderless boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_join_code text;
  v_table_id  uuid;
  v_number    int;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Séance requise';
  END IF;

  SELECT COALESCE(MAX(n), 0) + 1 INTO v_number
  FROM (
    SELECT table_number AS n FROM tables             WHERE session_id = p_session_id
    UNION ALL
    SELECT table_number AS n FROM table_assignments  WHERE session_id = p_session_id
  ) s;

  LOOP
    v_join_code := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tables WHERE join_code = v_join_code);
  END LOOP;

  INSERT INTO tables (join_code, created_by, session_id, leaderless, leaderless_by_design, table_number)
  VALUES (v_join_code, auth.uid(), p_session_id, p_leaderless, p_leaderless, v_number)
  RETURNING id INTO v_table_id;

  RETURN jsonb_build_object('table_id', v_table_id, 'join_code', v_join_code, 'table_number', v_number);
END;
$$;
REVOKE ALL ON FUNCTION create_session_table_internal(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_session_table(p_password text, p_session_id uuid, p_leaderless boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM check_superadmin_password(p_password);
  RETURN create_session_table_internal(p_session_id, p_leaderless);
END;
$function$;

-- ── 7. RPC de séance réécrites à la main ────────────────────────────────────

-- create_session — corps de 134b + portée association.
CREATE OR REPLACE FUNCTION create_session(
  p_password           text,
  p_title              text,
  p_description        text        DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_doc_info_url       text        DEFAULT NULL,
  p_doc_summary_url    text        DEFAULT NULL,
  p_doc_collab_url     text        DEFAULT NULL,
  p_onboarding_enabled boolean     DEFAULT true,
  p_session_type       text        DEFAULT 'full'
)
RETURNS sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_session sessions;
  v_org     uuid := admin_org_scope(p_password);  -- NULL = superadmin
BEGIN
  IF p_session_type NOT IN ('full', 'debate', 'poll') THEN
    RAISE EXCEPTION 'Type de séance invalide: %', p_session_type;
  END IF;
  -- Chantier 135 — une association n'a que le débat simple et le sondage.
  IF v_org IS NOT NULL AND p_session_type NOT IN ('debate', 'poll') THEN
    RAISE EXCEPTION 'Type de séance non disponible pour une association';
  END IF;

  INSERT INTO sessions (title, description, scheduled_at, join_code,
                        doc_info_url, doc_summary_url, doc_collab_url,
                        onboarding_enabled, session_type, results_public, organization_id)
  VALUES (p_title, p_description, p_scheduled_at, generate_session_join_code(),
          p_doc_info_url, p_doc_summary_url,
          -- Chantier 135 — pas de document collaboratif pour une association.
          CASE WHEN v_org IS NULL THEN p_doc_collab_url END,
          -- Un débat simple n'a pas de phase de vote : l'onboarding (questionnaire
          -- d'entrée avant le vote) n'a rien à précéder. Une association n'a pas
          -- d'onboarding non plus (questions propres à Ecclesia).
          CASE WHEN p_session_type = 'debate' OR v_org IS NOT NULL THEN false ELSE p_onboarding_enabled END,
          p_session_type,
          -- Sondage Ecclesia : consultable par tous à la clôture (134b). Séance
          -- d'association : jamais publique (arbitrage de Jules, chantier 135).
          p_session_type = 'poll' AND v_org IS NULL,
          v_org)
  RETURNING * INTO v_session;

  -- Débat simple : une seule table par défaut, animée (pas leaderless) et en
  -- attente de son modérateur.
  IF p_session_type = 'debate' THEN
    PERFORM create_session_table_internal(v_session.id, false);
  END IF;

  RETURN v_session;
END;
$function$;

-- list_sessions_admin — une association ne voit que les siennes.
CREATE OR REPLACE FUNCTION public.list_sessions_admin(p_password text)
 RETURNS SETOF sessions
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org uuid := admin_org_scope(p_password);
BEGIN
  IF v_org IS NULL THEN
    RETURN QUERY SELECT * FROM sessions ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM sessions WHERE organization_id = v_org ORDER BY created_at DESC;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_session_member_counts(p_password text)
 RETURNS TABLE(session_id uuid, cnt bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org uuid := admin_org_scope(p_password);
BEGIN
  RETURN QUERY
    SELECT sm.session_id, COUNT(*)::bigint
    FROM session_members sm
    JOIN sessions s ON s.id = sm.session_id
    WHERE v_org IS NULL OR s.organization_id = v_org
    GROUP BY sm.session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_session_table_counts(p_password text)
 RETURNS TABLE(session_id uuid, cnt bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org uuid := admin_org_scope(p_password);
BEGIN
  RETURN QUERY
    SELECT t.session_id, COUNT(*)::bigint
    FROM tables t
    JOIN sessions s ON s.id = t.session_id
    WHERE v_org IS NULL OR s.organization_id = v_org
    GROUP BY t.session_id;
END;
$function$;

-- delete_session — une association ne supprime qu'une séance jamais ouverte
-- (phase 0). Une fois ouverte, elle la clôture : Jules garde l'historique.
CREATE OR REPLACE FUNCTION public.delete_session(p_password text, p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);
  IF org_from_token(p_password) IS NOT NULL
     AND EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND phase <> 'draft') THEN
    RAISE EXCEPTION 'Une séance déjà ouverte ne peut pas être supprimée : clôturez-la.';
  END IF;
  DELETE FROM sessions WHERE id = p_session_id;
END;
$function$;

-- update_session_config — la modération par IA (Gemini) reste réservée à
-- Ecclesia (quota partagé de l'Edge Function).
CREATE OR REPLACE FUNCTION public.update_session_config(p_password text, p_session_id uuid, p_moderation_policy text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row  sessions%ROWTYPE;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);

  IF p_moderation_policy NOT IN ('open', 'closed', 'ai') THEN
    RAISE EXCEPTION 'moderation_policy invalide: %', p_moderation_policy;
  END IF;
  IF p_moderation_policy = 'ai' AND org_from_token(p_password) IS NOT NULL THEN
    RAISE EXCEPTION 'La modération par IA n''est pas disponible pour une association';
  END IF;

  UPDATE sessions
  SET moderation_policy = p_moderation_policy
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;

-- ── 8. Liste blanche : réécriture du seul bloc de contrôle ──────────────────
CREATE OR REPLACE FUNCTION pg_temp.c135_swap(p_fn regprocedure, p_pattern text, p_replacement text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text := pg_get_functiondef(p_fn);
  v_n   int;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, p_pattern, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Chantier 135 : % — bloc de contrôle trouvé % fois (attendu : 1), réécriture annulée', p_fn, v_n;
  END IF;
  EXECUTE regexp_replace(v_def, p_pattern, p_replacement);
END;
$$;

DO $$
DECLARE
  -- Contrôle délégué (PERFORM check_superadmin_password(p_password);)
  c_perform constant text := 'PERFORM check_superadmin_password\(p_password\);';
  -- Contrôle en ligne (bcrypt recopié dans la fonction)
  c_inline  constant text := 'SELECT value INTO v_hash FROM app_config WHERE key = ''superadmin_code_hash'';\s*IF NOT crypt\(p_password, v_hash\) = v_hash THEN\s*RAISE EXCEPTION ''Mot de passe superadmin incorrect'';\s*END IF;';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- séance
    ('public.set_session_phase(text, uuid, text)',                          'inline',  'check_session_admin(p_password, p_session_id)'),
    ('public.close_session(text, uuid)',                                    'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.update_session_meta(text, uuid, text, text)',                  'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.update_session_docs(text, uuid, text, text, text)',            'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.set_session_assertions_locked(text, uuid, boolean)',           'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.list_session_tables(text, uuid)',                              'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.get_session_voting_stats(text, uuid)',                         'inline',  'check_session_admin(p_password, p_session_id)'),
    ('public.get_vote_counts_admin(text, uuid)',                            'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.list_assertions_admin(text, uuid)',                            'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.list_assertion_merges(text, uuid)',                            'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.admin_submit_assertion(text, uuid, text)',                     'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.delete_assertions_admin(text, uuid, uuid[])',                  'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.list_session_members_admin(text, uuid)',                       'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.list_table_assignments_admin(text, uuid)',                     'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.assign_moderator_to_table(text, uuid, integer, uuid)',         'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.set_member_moderator(text, uuid, uuid, boolean)',              'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.get_all_votes_for_analysis(text, uuid, boolean, text)',        'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.save_analysis(text, uuid, integer, double precision, jsonb, jsonb, jsonb, jsonb, text)', 'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.get_latest_analysis(text, uuid)',                              'perform', 'check_session_admin(p_password, p_session_id)'),
    ('public.list_session_analyses(text, uuid)',                            'perform', 'check_session_admin(p_password, p_session_id)'),
    -- assertion
    ('public.approve_assertion(text, uuid)',                                'inline',  'check_assertion_admin(p_password, p_assertion_id)'),
    ('public.reject_assertion(text, uuid)',                                 'inline',  'check_assertion_admin(p_password, p_assertion_id)'),
    ('public.update_assertion_content(text, uuid, text)',                   'perform', 'check_assertion_admin(p_password, p_assertion_id)'),
    -- table
    ('public.get_table_participants(text, uuid)',                           'perform', 'check_table_admin(p_password, p_table_id)'),
    ('public.get_table_speaking_turns_admin(text, uuid)',                   'perform', 'check_table_admin(p_password, p_table_id)'),
    ('public.release_table_moderation(text, uuid)',                         'perform', 'check_table_admin(p_password, p_table_id)'),
    ('public.set_table_leaderless(text, uuid)',                             'perform', 'check_table_admin(p_password, p_table_id)'),
    -- membre / analyse
    ('public.regenerate_reclaim_code_admin(text, uuid)',                    'perform', 'check_member_admin(p_password, p_member_id)'),
    ('public.get_analysis_by_id(text, uuid)',                               'perform', 'check_analysis_admin(p_password, p_analysis_id)')
  ) AS t(sig, kind, call)
  LOOP
    PERFORM pg_temp.c135_swap(
      r.sig::regprocedure,
      CASE r.kind WHEN 'inline' THEN c_inline ELSE c_perform END,
      'PERFORM ' || r.call || ';'
    );
  END LOOP;
END $$;

-- ── 9. Code de prise de modération : Code Ecclesia OU mot de passe de l'asso ─
DO $$
DECLARE
  -- Forme « IF v_hash IS NULL OR crypt(p_creation_code, v_hash) IS DISTINCT FROM v_hash »
  c_a constant text := 'SELECT value INTO v_hash FROM app_config WHERE key = ''creation_code_hash'';\s*IF v_hash IS NULL OR crypt\(p_creation_code, v_hash\) IS DISTINCT FROM v_hash THEN\s*RAISE EXCEPTION ''([^'']+)'';\s*END IF;';
  -- Forme de reclaim_moderator
  c_b constant text := 'SELECT value INTO v_creation_hash FROM app_config WHERE key = ''creation_code_hash'';\s*IF crypt\(p_moderator_code, v_creation_hash\) IS DISTINCT FROM v_creation_hash THEN\s*RAISE EXCEPTION ''([^'']+)'';\s*END IF;';
BEGIN
  PERFORM pg_temp.c135_swap('public.claim_moderator_status(uuid, text, text, text)'::regprocedure, c_a,
    'IF NOT check_moderator_code(p_creation_code, p_session_id) THEN RAISE EXCEPTION ''\1''; END IF;');
  PERFORM pg_temp.c135_swap('public.join_simple_debate(uuid, text, text)'::regprocedure, c_a,
    'IF NOT check_moderator_code(p_creation_code, p_session_id) THEN RAISE EXCEPTION ''\1''; END IF;');
  PERFORM pg_temp.c135_swap('public.claim_table_as_moderator(text, text, text, uuid)'::regprocedure, c_a,
    'IF NOT check_moderator_code(p_creation_code, (SELECT t.session_id FROM tables t WHERE t.join_code = upper(p_join_code))) THEN RAISE EXCEPTION ''\1''; END IF;');
  PERFORM pg_temp.c135_swap('public.reclaim_table_as_moderator(uuid, text)'::regprocedure, c_a,
    'IF NOT check_moderator_code(p_creation_code, (SELECT t.session_id FROM tables t WHERE t.id = p_table_id)) THEN RAISE EXCEPTION ''\1''; END IF;');
  PERFORM pg_temp.c135_swap('public.reclaim_moderator(text, text)'::regprocedure, c_b,
    'IF NOT check_moderator_code(p_moderator_code, (SELECT t.session_id FROM tables t WHERE t.id = v_table_id)) THEN RAISE EXCEPTION ''\1''; END IF;');
  PERFORM pg_temp.c135_swap('public.reclaim_moderator(text, text, text)'::regprocedure, c_b,
    'IF NOT check_moderator_code(p_moderator_code, (SELECT t.session_id FROM tables t WHERE t.id = v_table_id)) THEN RAISE EXCEPTION ''\1''; END IF;');
END $$;
