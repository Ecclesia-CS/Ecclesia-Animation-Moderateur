-- =============================================================
-- Chantier 51 — Anonymat réel des auteurs d'assertions (B5)
--
-- Constat : assertions_select_approved (migration 20260528_voting_app.sql)
-- filtre les LIGNES (status = 'approved') mais laisse passer TOUTES LES
-- COLONNES, dont member_id. session_members est lisible publiquement et
-- contient nom/prénom réels → une jointure côté client (ou un simple appel
-- REST filtré sur member_id) donne l'identité réelle de l'auteur de
-- n'importe quelle assertion approuvée. Le masquage posé par la migration
-- 20260721_hide_assertion_author.sql (qui ne couvrait que list_assertions_admin,
-- une RPC SECURITY DEFINER) ne protège donc pas ce chemin.
--
-- Colonnes de `assertions` (20260528_voting_app.sql, jamais modifiées
-- depuis — vérifié dans tout supabase/migrations/) :
--   id, session_id, member_id, content, status, created_at
-- Choix par colonne :
--   id, session_id, content, status, created_at → lisibles : aucune ne
--     révèle l'auteur, et VoteScreen.tsx les lit déjà explicitement
--     (l.308, l.441 — commentaire "pas member_id (E2 — anonymat des auteurs)").
--   member_id → retiré : seul identifiant reliant une assertion à son
--     auteur ; combiné à session_members (nom/prénom), il désanonymise.
--
-- La policy de ligne (assertions_select_approved) reste inchangée — c'est
-- un problème de colonnes, pas de lignes.
-- =============================================================

REVOKE SELECT ON assertions FROM anon, authenticated;
GRANT  SELECT (id, session_id, content, status, created_at)
  ON assertions TO anon, authenticated;

-- ------------------------------------------------------------
-- Remplacement de VoteScreen.tsx (avant correctif) :
--   supabase.from('assertions').select('id').eq('session_id', s.id).eq('member_id', m.id)
-- Ce site lisait member_id dans la clause WHERE pour retrouver "mes propres
-- assertions" (compteur `proposedCount`). En PostgreSQL, un GRANT SELECT
-- restreint à certaines colonnes interdit aussi d'utiliser les colonnes non
-- accordées dans WHERE — ce site doit donc passer par une RPC SECURITY
-- DEFINER, insensible aux privilèges de colonne (comme submit_assertion,
-- approve_assertion, etc.).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_assertion_ids(p_session_id uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT COALESCE(array_agg(a.id), '{}')
  FROM assertions a
  JOIN session_members sm ON sm.id = a.member_id
  WHERE a.session_id = p_session_id AND sm.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_assertion_ids(uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- ROLLBACK
-- ------------------------------------------------------------
-- GRANT SELECT ON assertions TO anon, authenticated;
-- DROP FUNCTION IF EXISTS get_my_assertion_ids(uuid);
