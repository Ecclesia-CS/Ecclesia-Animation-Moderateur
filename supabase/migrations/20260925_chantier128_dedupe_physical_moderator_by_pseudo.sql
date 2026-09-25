-- =============================================================
-- Chantier 128 — Modérateur affiché en double sur une même table
--                (vue superadmin, onglet Groupes/Tables)
--
-- CONSTAT (Jules, 2026-09-25)
-- ---------------------------
-- « À un moment, dans une séance, en vision superadmin, il y avait deux
--   fois la vision "Maxence Reinaudo" comme modérateur sur la table, deux
--   carrés côte à côte. »
--
-- Reproduit en base (donnée réelle, pas une hypothèse) :
--   SELECT t.id, t.created_by, t.active_moderator_member_id,
--          sm.user_id AS active_user_id, sm.pseudo AS active_pseudo,
--          p.pseudo AS physical_pseudo, p.user_id AS physical_user_id
--   FROM tables t
--   LEFT JOIN session_members sm ON sm.id = t.active_moderator_member_id
--   LEFT JOIN participants p ON p.table_id = t.id AND p.user_id = t.created_by
--   WHERE t.id = '80f37881-fd45-4f6b-8d80-4f8198245eb2';
--   → active_pseudo = 'Maxence reinaudo' (user_id e36a65f7…),
--     physical_pseudo = 'Maxence reinaudo' (user_id 90442af3… — DIFFÉRENT).
--
-- MÉCANISME
-- -------------------------------------------------------------------
-- Auth anonyme (`signInAnonymously`) : rejoindre depuis un nouvel appareil,
-- ou après un `localStorage` vidé, donne un nouveau `auth.uid()` — même
-- personne, identité technique différente. Maxence était déjà modérateur
-- « en exercice » Bloc C (session_members, table.active_moderator_member_id
-- posé sur SA ligne) ; il a ensuite réclamé la même table par Code Ecclesia
-- avec cette identité neuve (`claim_table_as_moderator`), en retapant son
-- pseudo. `tables.created_by` a basculé sur la nouvelle identité, mais
-- `active_moderator_member_id = COALESCE(active_moderator_member_id, …)`
-- (chantier 106/118) ne l'écrase JAMAIS s'il était déjà posé — il est donc
-- resté sur l'ancienne identité.
--
-- `list_table_assignments_admin` (chantier 117) émet alors DEUX lignes
-- pour la même table :
--   (a) branche existante — la ligne session_members de l'ANCIENNE
--       identité (active_moderator_member_id la désigne encore) ;
--   (b) branche UNION ALL (117) — la NOUVELLE identité physique, parce que
--       son `NOT EXISTS` ne teste que `sm2.user_id = t.created_by` : cette
--       nouvelle identité n'a effectivement AUCUNE ligne session_members,
--       le test dit donc « personne ne la couvre déjà » alors que la
--       MÊME PERSONNE (même pseudo) est déjà couverte par (a).
--
-- CORRECTIF — chantier purement d'affichage, comme le 117 dont il corrige
-- le NOT EXISTS. Ne touche à aucune autorité (claim_table_as_moderator,
-- release_table_moderation, table_has_moderator inchangées) : la racine
-- profonde (fusionner les deux identités techniques d'une même personne)
-- est hors périmètre, non demandée. On élargit le NOT EXISTS de la
-- branche 117 pour exclure aussi le cas où le pseudo du modérateur
-- physique correspond DÉJÀ à une ligne session_members de la séance —
-- `UNIQUE(session_id, pseudo)` sur session_members garantit qu'il ne peut
-- exister qu'une seule ligne de ce nom dans la séance, donc ce test ne
-- risque pas de masquer deux personnes distinctes homonymes ayant chacune
-- leur propre ligne session_members (il y en a au plus une par pseudo).
-- Reste un risque résiduel volontairement accepté : un participant NON
-- inscrit à la séance (aucune ligne session_members) qui partage par
-- coïncidence le pseudo d'un membre inscrit distinct serait aussi
-- masqué — jugé bien moins probable et moins gênant qu'un doublon visible
-- de la même personne.
--
-- VÉRITÉ EN BASE — comparée par pg_get_functiondef avant d'écrire ce
-- fichier (règle SQL du CLAUDE.md) : corps identique à
-- 20260921_chantier117_list_table_assignments_admin_physical_moderator.sql,
-- recopié tel quel ci-dessous pour la branche existante.
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

    -- Chantier 117, corrigée au 128 — modérateur physique sans AUCUNE
    -- ligne session_members POUR CETTE IDENTITÉ (user_id). Chantier 128 :
    -- exclut en plus le cas où son pseudo correspond déjà à une ligne
    -- session_members de la séance (même personne, identité anonyme
    -- renouvelée) — sinon doublon visuel, cf. commentaire de tête.
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
          AND (sm2.user_id = t.created_by OR sm2.pseudo = p.pseudo)
      )
  ) rows_union;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.list_table_assignments_admin(text, uuid) IS
  'Chantier 50, étendue 106/117, corrigée 128 — composition des tables '
  'd''une séance pour l''onglet Groupes du superadmin. Chantier 128 : la '
  'branche UNION ALL (117, modérateurs physiques orphelins de session_'
  'members) exclut désormais aussi un pseudo déjà porté par une ligne '
  'session_members de la séance (UNIQUE(session_id, pseudo) garantit '
  'l''unicité) — évite un doublon visuel quand la même personne réclame '
  'la table sous une nouvelle identité anonyme (auth.uid() renouvelé) sans '
  'que active_moderator_member_id (COALESCE, chantier 106/118) ne bascule '
  'sur elle.';

GRANT EXECUTE ON FUNCTION public.list_table_assignments_admin(text, uuid) TO anon, authenticated;

-- =============================================================
-- REQUÊTES DE VÉRIFICATION (après application)
-- =============================================================
--
-- 1. Cas réel de ce chantier (séance 76de0462-0222-4a28-bac5-d2e664338c4d,
--    table 80f37881-fd45-4f6b-8d80-4f8198245eb2) — ne doit plus renvoyer
--    qu'UNE seule ligne « Maxence reinaudo » pour le table_number 1 :
--    SELECT jsonb_array_length(
--      (SELECT list_table_assignments_admin('<mdp superadmin>',
--        '76de0462-0222-4a28-bac5-d2e664338c4d')
--       -> jsonb_path_query_array('$[*] ? (@.pseudo == "Maxence reinaudo")'))
--    );
--    -- plus simple : appeler la RPC et compter les entrées dont
--    -- pseudo = 'Maxence reinaudo' -> doit valoir 1 (celle de la branche
--    -- existante, member_id non NULL).
--
-- 2. Non-régression — cas d'origine du chantier 117 (modérateur physique
--    dont AUCUNE ligne session_members n'existe, ni par user_id ni par
--    pseudo, dans la séance) : toujours visible via la branche UNION ALL.
--
-- 3. Non-régression — modérateur Bloc C classique (table_assignments +
--    session_members) : toujours porté par la seule branche existante.
-- =============================================================
-- SQL D'ANNULATION (rollback)
-- =============================================================
-- Recopier le corps cité en tête de
-- 20260921_chantier117_list_table_assignments_admin_physical_moderator.sql
-- (état exact avant ce chantier).
-- =============================================================
