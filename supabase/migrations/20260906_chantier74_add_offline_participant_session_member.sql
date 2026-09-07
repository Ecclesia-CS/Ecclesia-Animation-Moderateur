-- Chantier 74 — rendre visible au niveau séance une personne sans téléphone
-- ajoutée par le modérateur pendant le débat (`add_offline_participant`,
-- chantier 44).
--
-- DIAGNOSTIC (fait avant d'écrire cette migration, voir A_VERIFIER.md pour le
-- détail complet) :
--   - Le retour de Jules ("les participants sans téléphone ajoutés par les
--     modos n'existent pas en base") N'EST PAS causé par la garde
--     d'autorisation : `add_offline_participant` utilise déjà
--     `is_table_moderator(p_table_id)` en production (vérifié par lecture
--     directe de `pg_proc` sur le projet Supabase, chantier 60 appliqué).
--     La ligne `participants` est bien créée à chaque appel réussi.
--   - Le vrai gap, documenté dès l'écriture de la fonction (commentaire de
--     `20260902_chantier44_add_offline_participant.sql`) : cette fonction
--     n'écrit QUE dans `participants` (visible à SA table : file, prise de
--     parole, export CSV par table), jamais dans `session_members` (Bloc C).
--     Une personne ajoutée ainsi est donc invisible de tout ce qui liste les
--     membres au niveau SÉANCE (roster superadmin, `get_session_voting_stats`,
--     analyse, `list_table_assignments_admin`), même si son temps de parole
--     est réellement enregistré (`speaking_turns`, via son `participant_id`).
--
-- CE QUE CETTE MIGRATION FAIT : ajoute, en plus de l'INSERT `participants`
-- déjà existant, un INSERT dans `session_members` — UNIQUEMENT si la table
-- est rattachée à une séance (`tables.session_id IS NOT NULL` ; une table
-- standalone n'a pas de séance, donc pas de session_members).
--
-- OBSTACLE LEVÉ : `session_members` a une contrainte UNIQUE(session_id,
-- user_id) — un `user_id` ne peut être membre qu'une fois par séance. Cette
-- personne n'a pas de compte : la réutiliser sous l'identité du modérateur
-- (comme le fait `participants.user_id`, volontairement, pour la sémantique
-- de reprise ON CONFLICT) romprait cette contrainte dès le 2e ajout par le
-- même modérateur, ou fusionnerait deux personnes distinctes dans une seule
-- ligne `session_members`. Vérifié directement en base (information_schema) :
-- `session_members.user_id` ne porte AUCUNE contrainte FK vers `auth.users`
-- — ce n'est qu'un UUID sans vérification d'authenticité. On peut donc lui
-- attribuer un UUID synthétique (`gen_random_uuid()`), propre à cette
-- personne, distinct de `auth.uid()` du modérateur et de tout autre membre.
--
-- CONSÉQUENCE À FAIRE VÉRIFIER (non tranchée seule, cf. A_VERIFIER.md) :
-- `register_session_member` refuse explicitly toute inscription hors des
-- phases `pre_voting`/`voting`/`allocating` ("séance n'est pas en phase
-- d'inscription"). `add_offline_participant` n'existe QUE pendant `debating`
-- (ModeratorView n'apparaît qu'à ce moment) : cette migration introduit donc
-- le premier et seul chemin qui fait grandir `session_members` pendant le
-- débat. Additif et ON CONFLICT DO NOTHING (jamais de collision avec un
-- membre réel déjà inscrit sous le même pseudo — sa ligne n'est jamais
-- touchée), mais toute vue superadmin qui compte les membres d'une séance
-- (`get_session_voting_stats`, roster, exports — chantier 72, en cours en
-- parallèle) verra désormais apparaître ces personnes, avec
-- `joined_phase = 'debating'`, sans `entry_responses` ni vote. À vérifier
-- avec la session en charge du chantier 72 avant/à l'application : ses
-- agrégats doivent rester lisibles avec cette catégorie de membre (déjà le
-- cas de tout retardataire, mais celui-ci est nouveau).
--
-- Ce qui NE change PAS : `participants` (déjà existant, ON CONFLICT (table_id,
-- pseudo) DO UPDATE user_id — la reprise par un vrai téléphone plus tard reste
-- identique, sans toucher au `session_members` créé ici).

CREATE OR REPLACE FUNCTION public.add_offline_participant(
  p_table_id uuid,
  p_pseudo   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_participant_id uuid;
  v_session_id     uuid;
BEGIN
  -- Même garde que kick_participant / grant_floor (chantier 60).
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Pseudo requis';
  END IF;

  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (p_table_id, auth.uid(), btrim(p_pseudo))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  -- Chantier 74 — visibilité au niveau séance, voir commentaire de tête.
  SELECT session_id INTO v_session_id FROM tables WHERE id = p_table_id;
  IF v_session_id IS NOT NULL THEN
    INSERT INTO session_members (session_id, user_id, pseudo, joined_phase, attending_in_person)
    VALUES (v_session_id, gen_random_uuid(), btrim(p_pseudo), 'debating', true)
    ON CONFLICT (session_id, pseudo) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('participant_id', v_participant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_offline_participant(uuid, text) TO anon, authenticated;

-- =============================================================
-- VÉRIFICATIONS (à dérouler par la session de vérification dédiée)
-- =============================================================
--
-- 1. La fonction porte bien le nouveau corps (recherche `session_members`
--    dans sa définition) :
--    SELECT prosrc LIKE '%session_members%' AS a_le_fix
--    FROM pg_proc WHERE proname = 'add_offline_participant';
--    → attendu : true
--
-- 2. Sur une table de test rattachée à une séance en phase `debating`,
--    appeler `add_offline_participant` deux fois avec deux pseudos distincts,
--    puis vérifier que les deux ont bien une ligne `session_members` avec
--    `joined_phase = 'debating'`, `attending_in_person = true`, et un
--    `user_id` distinct l'un de l'autre ET de celui du modérateur :
--    SELECT pseudo, joined_phase, attending_in_person, user_id
--    FROM session_members WHERE session_id = '<id de test>'
--    ORDER BY created_at DESC LIMIT 5;
--
-- 3. Reproduire le cas de collision : appeler la fonction avec un pseudo déjà
--    utilisé par un membre RÉEL de cette séance (déjà inscrit au vote) →
--    vérifier que sa ligne `session_members` existante n'est PAS modifiée
--    (aucun changement sur `entry_responses`/votes/`attending_in_person` de
--    ce membre), alors que la ligne `participants` est bien créée à la table.
--
-- 4. Sur une table STANDALONE (`tables.session_id IS NULL`), vérifier qu'aucune
--    ligne `session_members` n'est créée (seule `participants` grandit),
--    comme avant cette migration.
--
-- 5. Non-régression : `get_session_voting_stats` / la vue Groupes du
--    superadmin restent lisibles sur une séance contenant ce nouveau type de
--    membre (`joined_phase = 'debating'`, sans onboarding ni vote) — à vérifier
--    en coordination avec la session du chantier 72.
--
-- =============================================================
-- ROLLBACK (retour au comportement chantier 60 — participants uniquement)
-- =============================================================
--
-- Rejouer intégralement le bloc `add_offline_participant` de
-- `20260902_chantier60_moderator_authority.sql` (CREATE OR REPLACE, identique
-- à la version ci-dessus moins le bloc `session_members`). Aucune donnée à
-- purger : les lignes `session_members` déjà créées par cette version restent
-- valides (elles ne violent aucune contrainte) et peuvent être conservées ou
-- supprimées au cas par cas :
--   DELETE FROM session_members WHERE joined_phase = 'debating';
-- (repère fiable : `register_session_member` ne pose jamais cette valeur —
-- seul ce chemin le fait.)
