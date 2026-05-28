-- reclaim_moderator : le reprenant choisit son propre pseudo
-- (au lieu d'hériter du pseudo de l'ancien modérateur)

CREATE OR REPLACE FUNCTION reclaim_moderator(
  p_join_code      text,
  p_moderator_code text,
  p_pseudo         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_id       uuid;
  v_creation_hash  text;
  v_participant_id uuid;
  v_result         jsonb;
BEGIN
  -- 1. Récupère l'ID de la table
  SELECT id
  INTO   v_table_id
  FROM   tables
  WHERE  join_code = upper(p_join_code);

  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'Table introuvable (code %)', upper(p_join_code);
  END IF;

  -- 2. Valide le code Ecclesia
  SELECT value INTO v_creation_hash FROM app_config WHERE key = 'creation_code_hash';
  IF crypt(p_moderator_code, v_creation_hash) IS DISTINCT FROM v_creation_hash THEN
    RAISE EXCEPTION 'Code Ecclesia incorrect';
  END IF;

  -- 3. Valide le pseudo
  IF trim(p_pseudo) = '' THEN
    RAISE EXCEPTION 'Le pseudo ne peut pas être vide';
  END IF;

  -- 4. Met à jour la table : nouveau modérateur
  UPDATE tables SET created_by = auth.uid() WHERE id = v_table_id;

  -- 5. Insère ou réutilise le participant avec le pseudo choisi par le reprenant
  INSERT INTO participants (table_id, user_id, pseudo)
  VALUES (v_table_id, auth.uid(), trim(p_pseudo))
  ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_participant_id;

  -- 6. Retourne les données de la table
  SELECT jsonb_build_object(
    'id',                      s.id,
    'join_code',               s.join_code,
    'created_by',              s.created_by,
    'current_speaker_id',      s.current_speaker_id,
    'current_turn_started_at', s.current_turn_started_at,
    'created_at',              s.created_at,
    'participant_id',          v_participant_id
  ) INTO v_result
  FROM tables s WHERE s.id = v_table_id;

  RETURN v_result;
END;
$$;
