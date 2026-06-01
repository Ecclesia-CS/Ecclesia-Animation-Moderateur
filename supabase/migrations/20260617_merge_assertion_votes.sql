-- Transfère les votes d'une assertion rejetée vers l'assertion conservée lors d'une fusion.
-- Règles :
--   - Un membre ayant voté sur les deux ne compte qu'une fois.
--   - En cas de conflit, 'agree' prime sur tout autre vote.

CREATE OR REPLACE FUNCTION merge_assertion_votes(
  p_password  text,
  p_keep_id   uuid,
  p_reject_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT value INTO v_hash FROM app_config WHERE key = 'superadmin_code_hash';
  IF NOT crypt(p_password, v_hash) = v_hash THEN
    RAISE EXCEPTION 'Mot de passe incorrect';
  END IF;

  -- 1. Membres ayant voté sur les deux assertions : si l'un des deux votes est 'agree',
  --    mettre à jour le vote de l'assertion conservée en 'agree'.
  UPDATE assertion_votes av_keep
  SET vote = 'agree'
  FROM assertion_votes av_reject
  WHERE av_reject.assertion_id = p_reject_id
    AND av_reject.member_id    = av_keep.member_id
    AND av_keep.assertion_id   = p_keep_id
    AND 'agree' IN (av_keep.vote, av_reject.vote)
    AND av_keep.vote <> 'agree';

  -- 2. Membres ayant voté uniquement sur l'assertion rejetée : transférer leur vote.
  INSERT INTO assertion_votes (assertion_id, session_id, member_id, vote)
  SELECT p_keep_id, av.session_id, av.member_id, av.vote
  FROM assertion_votes av
  WHERE av.assertion_id = p_reject_id
    AND NOT EXISTS (
      SELECT 1 FROM assertion_votes
      WHERE assertion_id = p_keep_id
        AND member_id    = av.member_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_assertion_votes(text, uuid, uuid) TO anon, authenticated;
