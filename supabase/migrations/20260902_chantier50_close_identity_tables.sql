-- =============================================================
-- Chantier 50 — fermer la lecture publique de session_members et
-- table_assignments
--
-- Audit du 2026-08-03 (constat B4), confirmé en base le 2026-09-02 :
-- `session_members` et `table_assignments` ont toutes deux une policy
-- SELECT `USING (true)` pour le rôle public. `session_members` expose
-- notamment `pseudo` (nom + prénom réels) et `reclaim_code` (code à
-- 4 chiffres en clair permettant de reprendre une inscription) — un
-- simple GET /rest/v1/session_members avec la clé anon du site retourne
-- tout, sans authentification. `table_assignments` expose la composition
-- complète des tables.
--
-- Correctif : policies restreintes au propriétaire de la ligne
-- (`user_id = auth.uid()` pour session_members, via un helper
-- anti-récursion pour table_assignments — même schéma que
-- is_table_participant()), + une RPC SECURITY DEFINER dédiée pour le
-- seul écran superadmin qui avait besoin d'une lecture croisée
-- (SuperadminScreen.loadGroups(), qui joignait déjà les deux tables).
--
-- Lectures directes déjà filtrées `.eq('user_id', userId)` — non affectées :
--   TableContext.tsx:147, SessionRouterScreen.tsx:72/90, VoteScreen.tsx:178
-- Abonnements Realtime qui rejettent déjà côté client ce qui n'est pas
-- soi — recevront moins d'événements, en utiliseront autant, non affectés :
--   TableContext.tsx:312, AllocatingScreen.tsx:70/86
-- =============================================================

-- ── 1. Helper anti-récursion, sur le modèle de is_table_participant() ──
-- Anti-récursion : la policy de `table_assignments` doit lire
-- `session_members`, elle-même sous RLS. SECURITY DEFINER contourne cette
-- lecture (même schéma qu'is_table_participant / is_table_moderator).
CREATE OR REPLACE FUNCTION is_own_session_member(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session_members WHERE id = p_member_id AND user_id = auth.uid()
  );
$$;

-- ── 2. session_members — self-only ─────────────────────────────
-- Inventaire des policies existantes au 2026-09-02, vérifié dans
-- `supabase/migrations/` (seule `20260528_voting_app.sql` en crée sur ces
-- deux tables ; le chantier 60, mergé le même jour, n'a touché que `tables`,
-- `queue_entries` et `speaking_turns`) :
--   session_members   : session_members_select  SELECT USING (true)     ← fermée ici
--                       session_members_insert  INSERT WITH CHECK (false)
--   table_assignments : table_assignments_select SELECT USING (true)    ← fermée ici
-- Aucune policy UPDATE ni DELETE : toutes les écritures passent déjà par des
-- fonctions SECURITY DEFINER. Rien d'autre à fermer.
--
-- `IF EXISTS` / re-création : la migration est ré-exécutable telle quelle.
DROP POLICY IF EXISTS session_members_select     ON session_members;
DROP POLICY IF EXISTS session_members_select_own ON session_members;
CREATE POLICY session_members_select_own ON session_members
  FOR SELECT USING (user_id = auth.uid());

-- ── 3. table_assignments — self-only (via le helper) ───────────
DROP POLICY IF EXISTS table_assignments_select     ON table_assignments;
DROP POLICY IF EXISTS table_assignments_select_own ON table_assignments;
CREATE POLICY table_assignments_select_own ON table_assignments
  FOR SELECT USING (is_own_session_member(member_id));

-- ── 3 bis. Garde-fou : signaler toute policy SELECT permissive résiduelle ──
-- Les policies PERMISSIVE se cumulent en OR : une seule `USING (true)`
-- oubliée (ajoutée par un chantier parallèle, par exemple) suffirait à
-- rouvrir les deux tables sans que rien ne le signale. Ce bloc lève une
-- exception plutôt que de laisser passer une fermeture illusoire.
DO $chk$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
    INTO v_extra
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('session_members', 'table_assignments')
    AND cmd IN ('SELECT', 'ALL')
    AND permissive = 'PERMISSIVE'
    AND policyname NOT IN ('session_members_select_own', 'table_assignments_select_own');

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'Chantier 50 : policies SELECT permissives résiduelles (%). La lecture publique resterait ouverte — les inspecter avant de rejouer cette migration.',
      v_extra;
  END IF;
END;
$chk$;

-- ── 4. RPC de remplacement pour SuperadminScreen.loadGroups() ──
-- Remplace la jointure imbriquée PostgREST
--   table_assignments.select('table_number, member_id, table_id,
--     session_members!member_id(pseudo, is_moderator)')
-- qui, sous les policies restreintes ci-dessus, ne renvoie plus d'erreur
-- mais un objet imbriqué null — les listes de membres se videraient
-- silencieusement sans cette RPC.
CREATE OR REPLACE FUNCTION list_table_assignments_admin(
  p_password   text,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_number', ta.table_number,
    'member_id',    ta.member_id,
    'table_id',     ta.table_id,
    'pseudo',       sm.pseudo,
    'is_moderator', sm.is_moderator
  ) ORDER BY ta.table_number), '[]'::jsonb) INTO v_rows
  FROM table_assignments ta
  JOIN session_members sm ON sm.id = ta.member_id
  WHERE ta.session_id = p_session_id;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION list_table_assignments_admin(text, uuid) TO anon, authenticated;

-- =============================================================
-- ROLLBACK (à exécuter en un bloc si besoin de revenir en arrière) :
--
-- DROP FUNCTION IF EXISTS list_table_assignments_admin(text, uuid);
-- DROP POLICY IF EXISTS session_members_select_own ON session_members;
-- CREATE POLICY session_members_select ON session_members FOR SELECT USING (true);
-- DROP POLICY IF EXISTS table_assignments_select_own ON table_assignments;
-- CREATE POLICY table_assignments_select ON table_assignments FOR SELECT USING (true);
-- DROP FUNCTION IF EXISTS is_own_session_member(uuid);
-- =============================================================

-- =============================================================
-- Requêtes de vérification (session de vérification dédiée) :
--
-- 1. Lecture publique fermée (clé anon, hors navigateur / sans session) :
--    GET /rest/v1/session_members?select=pseudo,reclaim_code   -- attendu []
--    GET /rest/v1/table_assignments?select=member_id           -- attendu []
--
-- 2. RPC superadmin fonctionnelle :
--    SELECT list_table_assignments_admin('<mot de passe superadmin>', '<session_id>');
--    -- attendu : jsonb array avec table_number, member_id, table_id, pseudo, is_moderator
--
-- 3. RPC refuse un mauvais mot de passe :
--    SELECT list_table_assignments_admin('mauvais-mot-de-passe', '<session_id>');
--    -- attendu : exception 'Mot de passe superadmin incorrect'
--
-- 4. Lecture self-only toujours fonctionnelle pour un participant connecté
--    (session Supabase active, user_id = auth.uid()) :
--    SELECT * FROM session_members WHERE session_id = '<id>';
--    -- attendu : uniquement la/les ligne(s) où user_id = son propre auth.uid()
--
-- 5. REPLICA IDENTITY FULL sur session_members (migration
--    20260803_chantier35_session_members_replica_identity.sql) : le WAL
--    continue de transporter reclaim_code, mais Realtime ne le livre plus
--    qu'au propriétaire de la ligne désormais — à vérifier avec deux
--    participants A et B dans la même séance : une modification sur le
--    membre A ne doit plus déclencher d'événement Realtime chez B.
-- =============================================================
