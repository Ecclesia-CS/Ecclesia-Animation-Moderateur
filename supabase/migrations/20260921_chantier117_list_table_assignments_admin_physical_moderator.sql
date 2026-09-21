-- =============================================================
-- Chantier 117 — Vue Groupes : rendre visible un modérateur
--                « physique » qui n'a jamais de ligne session_members
--
-- CONSTAT (Jules, 2026-09-21)
-- ---------------------------
-- Séance « Réunion apprentissage modération 21/09 » : une personne assise
-- comme modérateur d'une table (tables.created_by = son user_id,
-- leaderless = false, ModeratorView normal chez elle) n'apparaît JAMAIS
-- dans l'onglet Groupes du superadmin, reload ou pas.
--
-- Vérifié en base : cette table a exactement 2 lignes `participants`
-- (le modérateur ET un participant ordinaire), mais UNE SEULE ligne
-- `session_members` pour la séance — celle du participant ordinaire. Le
-- modérateur a rejoint directement par Code Ecclesia
-- (`claim_table_as_moderator`, chantier 68/72) sans jamais s'inscrire à la
-- séance : il n'a NI ligne `session_members`, NI ligne `table_assignments`.
--
-- `list_table_assignments_admin` (chantier 50, étendue au chantier 106)
-- ne lit QUE `table_assignments` × `session_members` — c'est exactement le
-- « défaut A » déjà documenté dans
-- `20260906_chantier72_1_reprise_moderation.sql` (« un modérateur physique
-- n'apparaît pas dans la carte de groupe du superadmin ») : ce fichier-là
-- corrigeait le LEVIER (release_table_moderation, pour pouvoir reprendre
-- la table), jamais l'AFFICHAGE. Ce chantier corrige l'affichage.
--
-- CORRECTIF
-- =============================================================
-- Ajoute une seconde branche à la requête : pour chaque table de la
-- séance, si `tables.created_by` correspond à un `participants` réellement
-- assis à CETTE table (le créateur physique), ET que ce `user_id` n'a
-- AUCUNE ligne `session_members` dans la séance (sinon il est déjà couvert
-- par la branche existante), on émet une ligne synthétique :
--   member_id = NULL (aucune ligne session_members à référencer),
--   is_moderator = true, active_moderator_member_id = NULL.
-- `active` se déduit côté frontend par `active_moderator_member_id ===
-- member_id` (NULL === NULL → true en JS) : ce modérateur physique est
-- TOUJOURS actif sur sa table (pas de notion de « surplus » pour ce
-- chemin, qui est intrinsèquement 1 table = 1 créateur).
--
-- `t.leaderless = false` exclut le cas déjà documenté et volontairement
-- non traité ici (CLAUDE.md, « Exception confirmée par Jules ») d'un
-- modérateur Bloc C en surplus assis par hasard sur une table restée
-- leaderless : ce cas-là A une ligne session_members et est déjà couvert
-- par la branche existante.
--
-- Ne touche à AUCUNE autorité : `is_table_moderator`, `claim_table_as_
-- moderator`, `release_table_moderation` sont inchangées. Chantier
-- purement d'affichage.
--
-- VÉRITÉ EN BASE — comparé avant application
-- -------------------------------------------------------------------
-- SELECT pg_get_functiondef(p.oid) FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'list_table_assignments_admin';
-- → corps identique à 20260921_chantier106_active_moderator_member_id.sql
--   (section 8), recopié tel quel ci-dessous pour la branche existante.
-- =============================================================

CREATE OR REPLACE FUNCTION public.list_table_assignments_admin(p_password text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'table_number')::int), '[]'::jsonb)
  INTO v_rows
  FROM (
    -- Branche existante (chantier 50/106), inchangée : modérateurs et
    -- participants Bloc C, affectés via table_assignments.
    SELECT jsonb_build_object(
      'table_number',               ta.table_number,
      'member_id',                  ta.member_id,
      'table_id',                   ta.table_id,
      'pseudo',                     sm.pseudo,
      'is_moderator',               sm.is_moderator,
      'active_moderator_member_id', t.active_moderator_member_id
    ) AS r
    FROM table_assignments ta
    JOIN session_members sm ON sm.id = ta.member_id
    LEFT JOIN tables t ON t.id = ta.table_id
    WHERE ta.session_id = p_session_id

    UNION ALL

    -- Chantier 117 — modérateur physique sans AUCUNE ligne session_members
    -- (rejoint par Code Ecclesia, jamais inscrit à la séance).
    SELECT jsonb_build_object(
      'table_number',               t.table_number,
      'member_id',                  NULL,
      'table_id',                   t.id,
      'pseudo',                     p.pseudo,
      'is_moderator',               true,
      'active_moderator_member_id', NULL
    ) AS r
    FROM tables t
    JOIN participants p ON p.table_id = t.id AND p.user_id = t.created_by
    WHERE t.session_id = p_session_id
      AND t.leaderless = false
      AND NOT EXISTS (
        SELECT 1 FROM session_members sm2
        WHERE sm2.session_id = p_session_id
          AND sm2.user_id    = t.created_by
      )
  ) rows_union;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.list_table_assignments_admin(text, uuid) IS
  'Chantier 50, étendue 106/117 — composition des tables d''une séance pour '
  'l''onglet Groupes du superadmin. Chantier 117 : union avec les '
  'modérateurs "physiques" (tables.created_by, via claim_table_as_moderator '
  'ou l''ancien designate_moderator) qui n''ont AUCUNE ligne session_members '
  '- invisibles jusqu''ici (défaut A du chantier 72, jamais corrigé côté '
  'affichage). Ligne synthétique : member_id NULL, is_moderator true, '
  'active_moderator_member_id NULL (le frontend en déduit active=true).';

GRANT EXECUTE ON FUNCTION public.list_table_assignments_admin(text, uuid) TO anon, authenticated;

-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 1. Cas réel de ce chantier (séance « Réunion apprentissage modération
--    21/09 ») — doit désormais renvoyer 2 lignes pour le table_number 1,
--    dont une avec member_id NULL, pseudo = 'Jules Bec Ordi',
--    is_moderator = true :
--    SELECT list_table_assignments_admin('<mdp superadmin>',
--      'fb9a2c6b-42a7-40c6-bd88-d8f1db3505d4');
--
-- 2. Non-régression — table normale, aucun modérateur physique orphelin :
--    la branche UNION ALL ne doit renvoyer aucune ligne (NOT EXISTS
--    toujours vrai pour un created_by = superadmin, qui n'est jamais
--    assis comme participant).
--
-- 3. Non-régression — modérateur Bloc C classique (a une ligne
--    session_members ET une ligne table_assignments) : toujours porté par
--    la branche existante uniquement (pas de doublon, le NOT EXISTS de la
--    branche 117 l'exclut).
-- =============================================================
