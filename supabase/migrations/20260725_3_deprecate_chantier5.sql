-- =============================================================
-- Chantier 19 (G5) — Dépréciation de l'existant devenu caduc
--
-- Remplacés par l'algorithme d'allocation v2 (src/lib/allocation.ts +
-- get_allocation_inputs / apply_allocation) :
--   · get_moderator_responses  (E4, juillet) — s'appuyait sur
--     entry_responses.moderator_pref, colonne supprimée par G3.
--   · run_clustering_v3        (B1, juillet) — « allocation avancée ».
--
-- CONSERVÉES volontairement : run_clustering_v1 et run_clustering_v2.
-- Elles restent en base le temps de valider l'algorithme v2 en production
-- (spec §9). À retirer dans un chantier ultérieur, pas ici.
--
-- ⚠️ À appliquer APRÈS 20260725_1 et 20260725_2.
-- =============================================================

DROP FUNCTION IF EXISTS get_moderator_responses(text, uuid);
DROP FUNCTION IF EXISTS run_clustering_v3(text, uuid, int);
