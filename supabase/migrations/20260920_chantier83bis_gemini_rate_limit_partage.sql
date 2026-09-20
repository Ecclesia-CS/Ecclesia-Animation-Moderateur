-- Chantier 83bis — compteur de quota gemini-proxy partagé (suite du 57 / 83)
--
-- Constat du 20/09 (A_VERIFIER.md, chantier 83) : le quota 20 req/60s de
-- gemini-proxy est implémenté avec une Map en mémoire, par instance de
-- l'Edge Function. Test navigateur : 122 requêtes envoyées (dont 60
-- séquentielles et 40 en parallèle) sur le même compte anonyme, 0 réponse
-- 429 — la Map ne survit pas d'un appel à l'autre entre instances Deno
-- Deploy. Remplacement par un compteur partagé en Postgres, comme envisagé
-- puis écarté au chantier 57 (une écriture par appel, jugé alors trop
-- coûteux pour un projet à faible trafic — mais sans compteur partagé, le
-- quota n'existe simplement pas).
--
-- Chaque ligne = un appel accepté. La fenêtre glissante de 60s est purgée
-- au fil de l'eau (pas de TTL global) : un utilisateur normal ne dépasse
-- jamais ~12 lignes (voir calibrage dans gemini-proxy/index.ts), la table
-- reste petite.

CREATE TABLE IF NOT EXISTS public.gemini_rate_limit_calls (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL,
  called_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gemini_rate_limit_calls_user_time_idx
  ON public.gemini_rate_limit_calls (user_id, called_at);

-- Aucune policy SELECT/INSERT/UPDATE/DELETE côté API REST : cette table
-- n'est manipulée que par la fonction SECURITY DEFINER ci-dessous, jamais
-- directement par le frontend ou l'Edge Function elle-même.
ALTER TABLE public.gemini_rate_limit_calls ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_gemini_rate_limit(
  p_user_id uuid,
  p_max_requests int DEFAULT 20,
  p_window_seconds int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count        int;
  v_oldest       timestamptz;
  v_retry_after  int;
BEGIN
  -- Sérialise les appels concurrents du même utilisateur (le test du 20/09
  -- envoyait jusqu'à 40 requêtes en parallèle) : sans ce verrou, deux
  -- appels lisant le même compte juste avant l'insertion pourraient tous
  -- les deux passer sous le seuil.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  DELETE FROM gemini_rate_limit_calls
  WHERE user_id = p_user_id AND called_at <= v_window_start;

  SELECT count(*), min(called_at) INTO v_count, v_oldest
  FROM gemini_rate_limit_calls
  WHERE user_id = p_user_id;

  IF v_count >= p_max_requests THEN
    v_retry_after := GREATEST(1, ceil(extract(epoch FROM (v_oldest + make_interval(secs => p_window_seconds) - now())))::int);
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after);
  END IF;

  INSERT INTO gemini_rate_limit_calls (user_id) VALUES (p_user_id);
  RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.check_gemini_rate_limit(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_gemini_rate_limit(uuid, int, int) TO authenticated;

-- Supabase accorde EXECUTE par défaut à anon/authenticated/service_role sur
-- toute nouvelle fonction du schéma public (ALTER DEFAULT PRIVILEGES) : le
-- REVOKE ALL FROM PUBLIC ci-dessus ne suffit pas à retirer ce droit à anon
-- (confirmé par get_advisors après application). anon n'a aucune raison
-- d'appeler cette RPC : gemini-proxy authentifie l'appelant via un JWT
-- (l'utilisateur obtient le rôle authenticated dès signInAnonymously)
-- avant de l'invoquer.
REVOKE EXECUTE ON FUNCTION public.check_gemini_rate_limit(uuid, int, int) FROM anon;
