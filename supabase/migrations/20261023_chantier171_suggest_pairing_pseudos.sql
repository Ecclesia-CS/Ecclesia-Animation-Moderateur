-- Chantier 171a — autocomplétion des pseudos pour le champ « avec qui être appairé ».
--
-- session_members est en lecture self-only (chantier 50) : le client ne peut pas
-- lister les inscrits. Cette RPC SECURITY DEFINER renvoie au plus 5 pseudos de la
-- séance dont le début correspond à la saisie (casse, accents et espaces multiples
-- ignorés). Exposition des pseudos des inscrits acceptée par Jules (2026-10-23).
-- Réservée aux membres de la séance ; ne suggère jamais l'appelant lui-même.
-- Fonction nouvelle : rien à comparer à une définition existante.

CREATE OR REPLACE FUNCTION public.suggest_pairing_pseudos(p_session_id uuid, p_prefix text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me   uuid;
  v_key  text;
  v_from constant text := 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœ';
  v_to   constant text := 'aaaaaaceeeeiiiinooooouuuuyyo';
BEGIN
  SELECT id INTO v_me FROM session_members
  WHERE session_id = p_session_id AND user_id = auth.uid() LIMIT 1;
  IF v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_key := translate(pairing_norm(coalesce(p_prefix, '')), v_from, v_to);
  IF v_key = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(s.pseudo ORDER BY s.pseudo)
    FROM (
      SELECT sm.pseudo
      FROM session_members sm
      WHERE sm.session_id = p_session_id
        AND sm.id <> v_me
        AND translate(pairing_norm(sm.pseudo), v_from, v_to) LIKE
            replace(replace(replace(v_key, '\', '\'), '%', '\%'), '_', '\_') || '%'
      ORDER BY sm.pseudo
      LIMIT 5
    ) s
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_pairing_pseudos(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_pairing_pseudos(uuid, text) TO authenticated;
