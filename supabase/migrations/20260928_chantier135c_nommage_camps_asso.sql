-- Chantier 135 (suite, 2026-09-28) — nommage IA des camps ouvert aux associations,
-- plafonné à 5 nommages par jour et par association (demande de Jules).
--
-- 1. organization_naming_uses : une ligne par nommage déclenché par une asso.
-- 2. org_consume_naming_quota(p_password, p_session_id) : appelée par le front
--    JUSTE AVANT l'appel Gemini (un nommage redondant — répartition inchangée —
--    sort avant, sans rien consommer). Superadmin : illimité. Association :
--    refus au-delà de 5 sur la journée (Europe/Paris), sinon enregistre l'usage.
-- 3. update_group_names : ajoutée à la liste blanche (check_session_admin),
--    même remplacement du seul bloc de contrôle qu'en 20260926_chantier135 §8.
--
-- Limite de la garde : l'Edge Function gemini-proxy reste appelable par tout
-- utilisateur authentifié (état antérieur, quota 20/min par utilisateur,
-- chantier 83bis) — ce plafond borne la FONCTIONNALITÉ côté asso, pas l'accès
-- brut à Gemini.

CREATE TABLE IF NOT EXISTS organization_naming_uses (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES sessions(id) ON DELETE SET NULL,
  used_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_naming_uses_org_day_idx ON organization_naming_uses (organization_id, used_at);
ALTER TABLE organization_naming_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_naming_uses FROM anon, authenticated;

CREATE OR REPLACE FUNCTION org_consume_naming_quota(p_password text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  c_max constant int := 5;
  v_org  uuid;
  v_used int;
BEGIN
  PERFORM check_session_admin(p_password, p_session_id);
  v_org := org_from_token(p_password);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'remaining', NULL);  -- superadmin
  END IF;

  PERFORM 1 FROM organizations WHERE id = v_org FOR UPDATE;  -- sérialise les appels simultanés
  SELECT count(*) INTO v_used
  FROM organization_naming_uses
  WHERE organization_id = v_org
    AND used_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris';

  IF v_used >= c_max THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'max', c_max);
  END IF;

  INSERT INTO organization_naming_uses (organization_id, session_id) VALUES (v_org, p_session_id);
  RETURN jsonb_build_object('allowed', true, 'remaining', c_max - v_used - 1, 'max', c_max);
END;
$$;
GRANT EXECUTE ON FUNCTION org_consume_naming_quota(text, uuid) TO anon, authenticated;

-- update_group_names → liste blanche (corps courant en base, seul le contrôle change).
DO $$
DECLARE
  c_inline constant text := 'SELECT value INTO v_hash FROM app_config WHERE key = ''superadmin_code_hash'';\s*IF NOT crypt\(p_password, v_hash\) = v_hash THEN\s*RAISE EXCEPTION ''Mot de passe superadmin incorrect'';\s*END IF;';
  v_def text := pg_get_functiondef('public.update_group_names(text, uuid, jsonb)'::regprocedure);
  v_n   int;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, c_inline, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Chantier 135c : update_group_names — bloc de contrôle trouvé % fois (attendu : 1)', v_n;
  END IF;
  EXECUTE regexp_replace(v_def, c_inline, 'PERFORM check_session_admin(p_password, p_session_id);');
END $$;
