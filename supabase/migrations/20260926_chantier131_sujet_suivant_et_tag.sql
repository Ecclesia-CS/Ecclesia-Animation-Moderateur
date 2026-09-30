-- Chantier 131 — bouton "d'accord pour le sujet suivant" + tag de sujet à la prise de parole
--
-- Deux ajouts indépendants demandés par Jules (docs/chantiers-a-faire.md, chantier 131) :
--
--   1. Chaque participant peut activer/désactiver un booléen "d'accord pour passer au
--      sujet suivant" sur sa propre ligne `participants`. Le modérateur voit le compte
--      total (via la lecture normale de `participants`, déjà repliquée en Realtime sur
--      le canal `table:<id>` existant — aucun nouveau topic nécessaire) et peut
--      réinitialiser le compteur manuellement quand il passe au sujet suivant (pas de
--      notion de "sujet courant" dans le modèle de données, donc pas de reset auto
--      possible : choix tranché ici, à documenter dans docs/chantiers.md).
--
--   2. Un tag de sujet optionnel, saisi au moment de rejoindre une file d'attente,
--      stocké sur `queue_entries` et diffusé comme le reste de la file (déjà couvert
--      par le broadcast `addToQueue` existant, cf. CLAUDE.md § Broadcast par action).
--
-- `participants` n'a aucune policy UPDATE (seulement INSERT/SELECT) : le toggle passe
-- donc par une RPC SECURITY DEFINER, comme le reste des actions self-service de ce
-- projet (cf. `add_to_queue`).

ALTER TABLE public.participants
  ADD COLUMN wants_next_topic boolean NOT NULL DEFAULT false;

ALTER TABLE public.queue_entries
  ADD COLUMN topic_tag text NULL,
  ADD CONSTRAINT queue_entries_topic_tag_length CHECK (topic_tag IS NULL OR char_length(topic_tag) <= 60);

-- ── set_next_topic_vote — toggle self-service ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_next_topic_vote(p_participant_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT user_id FROM participants WHERE id = p_participant_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE participants
  SET wants_next_topic = p_value
  WHERE id = p_participant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_next_topic_vote(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_next_topic_vote(uuid, boolean) TO anon, authenticated;

-- ── reset_next_topic_votes — remise à zéro par le modérateur ───────────────
CREATE OR REPLACE FUNCTION public.reset_next_topic_votes(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT is_table_moderator(p_table_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE participants
  SET wants_next_topic = false
  WHERE table_id = p_table_id AND wants_next_topic = true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_next_topic_votes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_next_topic_votes(uuid) TO anon, authenticated;

-- ── add_to_queue — nouveau paramètre optionnel p_topic_tag ─────────────────
-- Corps repris à l'identique de la définition courante en base (pg_get_functiondef,
-- conformément à la garde CLAUDE.md), seul le tag est ajouté.
--
-- Le nombre d'arguments change (4 → 5) : CREATE OR REPLACE ne remplacerait pas
-- l'ancienne fonction mais créerait une SURCHARGE ambiguë (cf. CLAUDE.md § Règle
-- SQL, précédent réel avec get_all_votes_for_analysis). DROP explicite de la
-- signature exacte avant recréation, puis regrant (un DROP perd les privilèges).
DROP FUNCTION IF EXISTS public.add_to_queue(uuid, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.add_to_queue(
  p_table_id uuid, p_participant_id uuid, p_queue_type text,
  p_position integer DEFAULT NULL::integer, p_topic_tag text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pos int;
  v_tag text;
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT user_id FROM participants WHERE id = p_participant_id)
     AND NOT is_table_moderator(p_table_id)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_tag := NULLIF(TRIM(p_topic_tag), '');

  IF p_position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM queue_entries
    WHERE table_id = p_table_id AND queue_type = p_queue_type;
  ELSE
    v_pos := p_position;
    UPDATE queue_entries
    SET position = position + 1
    WHERE table_id   = p_table_id
      AND queue_type = p_queue_type
      AND position  >= p_position;
  END IF;

  INSERT INTO queue_entries (table_id, participant_id, queue_type, position, topic_tag)
  VALUES (p_table_id, p_participant_id, p_queue_type, v_pos, v_tag)
  ON CONFLICT (table_id, participant_id, queue_type) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_to_queue(uuid, uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_to_queue(uuid, uuid, text, integer, text) TO anon, authenticated;
