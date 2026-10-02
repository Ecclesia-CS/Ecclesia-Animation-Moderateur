-- Chantier 151 — activité à trois niveaux : passif / intermédiaire / actif
--
-- Demande de Jules (2026-10-02) : un troisième bouton à l'onboarding.
--   passif        « je ne compte pas parler du tout »
--   intermédiaire « je compte éventuellement prendre la parole »
--   actif         « je compte prendre la parole »
-- Dans l'allocation, les passifs restent passifs ; les intermédiaires comptent
-- comme des actifs.
--
-- Stockage : les trois niveaux en base (`entry_responses.participation_style`).
-- Valeurs : 'listener' (passif, inchangé), 'intermediate' (NOUVEAU), 'active'
-- (inchangé). Aucune conversion de données : les anciennes réponses gardent leur
-- valeur et leur sens, donc les anciennes séances sont strictement inchangées.
--
-- Vérifié avant écriture (lecture seule, dev ET prod) :
--   · le CHECK existant est identique des deux côtés :
--     entry_responses_participation_style_check = ('listener','active') ;
--   · seules trois fonctions lisent la colonne : get_allocation_inputs (à changer),
--     list_table_members_for_moderator (simple passe-plat de la valeur, text),
--     submit_entry_response (n'inspecte pas la valeur, c'est le CHECK qui valide).
--
-- ⚠️ get_allocation_inputs : corps repris de la définition COURANTE EN BASE DEV
-- (pg_get_functiondef), pas d'un ancien fichier. Elle porte déjà le
-- COALESCE(..., true) du chantier 72_2 — sur prod, cette migration suppose donc
-- que 20260906_chantier72_2_* est appliquée avant (ordre chronologique des fichiers).
-- Seule la ligne is_active change.

ALTER TABLE public.entry_responses
  DROP CONSTRAINT entry_responses_participation_style_check;

ALTER TABLE public.entry_responses
  ADD CONSTRAINT entry_responses_participation_style_check
  CHECK (participation_style = ANY (ARRAY['listener'::text, 'intermediate'::text, 'active'::text]));

CREATE OR REPLACE FUNCTION public.get_allocation_inputs(p_password text, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_analysis_id uuid;
  v_members     jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);

  SELECT id INTO v_analysis_id
  FROM session_analysis
  WHERE session_id = p_session_id
    AND status = 'done'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at, t.member_id), '[]'::jsonb)
    INTO v_members
  FROM (
    SELECT
      sm.id                                  AS member_id,
      sm.pseudo,
      sm.is_moderator,
      sm.created_at,
      -- Chantier 151 : l'intermédiaire compte comme actif. Sans réponse
      -- d'onboarding (NULL) → actif par défaut, comme depuis le chantier 72_2.
      COALESCE(er.participation_style IN ('active', 'intermediate'), true)  AS is_active,
      COALESCE(er.consent_transcript, false)             AS consents,
      COALESCE(er.ecclesia_experience, false)            AS is_veteran,
      am.group_id
    FROM session_members sm
    LEFT JOIN entry_responses er
      ON er.member_id = sm.id
     AND er.session_id = p_session_id
    LEFT JOIN analysis_members am
      ON am.member_id = sm.id
     AND am.analysis_id = v_analysis_id
    WHERE sm.session_id = p_session_id
      AND sm.attending_in_person = true
  ) t;

  RETURN jsonb_build_object(
    'members',            v_members,
    'opinions_available', (v_analysis_id IS NOT NULL),
    'analysis_id',        v_analysis_id
  );
END;
$function$;
