# Plan — fermer les chemins d'interruption d'une séance en cours

**Date** : 2026-09-19
**Origine** : demande de Jules à la suite du [chantier 100](./2026-09-19-audit-chantier100-interruption-exfiltration.md) — « fais un plan pour qu'on ne puisse pas arrêter la séance en plein milieu ».
**Périmètre** : uniquement l'interruption d'une séance en cours. L'exfiltration (chantier 100 §3) est hors périmètre ici, sauf là où les deux se recoupent (lot 2).
**Rien n'est appliqué par ce document.** Il décrit quatre lots, ordonnés du plus sûr au plus délicat, chacun applicable seul.

---

## Principe directeur

Le jour de la séance, **rien ne doit pouvoir bloquer le débat** — c'est déjà la règle écrite pour l'allocation v2 (« l'algorithme ne doit *jamais* échouer »). On l'étend ici à la surface d'API : une fonction exposée doit soit vérifier qui appelle, soit ne pas être exposée.

Conséquence de méthode, à tenir tout au long : **chaque lot ne doit pas pouvoir casser la séance qu'il protège.** Deux lots sur quatre portent un risque de casse silencieuse (RLS, grants), c'est-à-dire d'écrans vides sans message d'erreur — le mode de panne le plus coûteux de ce projet. D'où l'ordre choisi, et la recette exigée à chaque étape.

---

## Lot 1 — Refermer les cinq helpers exposés (le gros du gain)

**Ce qu'on ferme** : `leave_other_session_tables`, `sync_table_assignment`, `clear_reclaim_attempts`, `record_reclaim_failure`, `gen_member_reclaim_code`. Soit, dans l'ordre d'impact : l'éjection d'un participant en plein débat, son déplacement de table, et la neutralisation du verrou anti-bruteforce du chantier 93.

**Le geste** : `REVOKE EXECUTE ... FROM anon, authenticated` sur ces cinq fonctions. Rien d'autre.

**Pourquoi c'est sans risque, vérifié et pas supposé** :
- **Aucune n'est appelée depuis `src/`** — grep exhaustif sur les cinq noms : zéro occurrence.
- **Leurs seuls appelants sont d'autres fonctions `SECURITY DEFINER`**, toutes `OWNER = postgres` : `join_table`, `switch_table`, `create_table`, `claim_table_as_moderator`, `confirm_attendance`, `reclaim_prevoting_member`, `register_session_member`, `claim_moderator_status`, `regenerate_reclaim_code_admin`, `regenerate_reclaim_code_moderator`. Dans un corps `SECURITY DEFINER`, le droit d'exécuter est contrôlé contre le **propriétaire**, pas contre l'appelant : retirer le droit à `anon` ne les gêne pas.
- Le chemin nominal du participant (rejoindre, changer de table, se reconnecter avec son code) passe **exclusivement** par ces appelants-là.

> ⚠️ **Correction de la recommandation du chantier 100.** Le document d'audit proposait d'ajouter à cette liste `is_table_participant`, `is_table_moderator`, `is_own_session_member` et `can_join_realtime_topic`. **Il ne faut pas.** Ces quatre-là sont appelées **dans les expressions de policies RLS** (`tables_select`, `participants_select`, `queue_entries_*`, `speaking_turns_*`, `table_assignments_select_own`, et les deux policies de `realtime.messages`), qui sont évaluées avec les droits du rôle appelant. Leur retirer `EXECUTE` risque de faire échouer — ou pire, vider en silence — toutes les lectures de table, de file et de tours de parole, c'est-à-dire exactement la panne qu'on cherche à empêcher. Elles ne renvoient de toute façon qu'un booléen sur l'appelant lui-même : les exposer ne donne rien à un attaquant. **On les laisse.** `generate_session_join_code` peut être révoquée avec les cinq autres (inutilisée partout), gain nul mais coût nul.

**Recette** : après application, sur une séance de test jetable — rejoindre une table par `join_code`, changer de table, se reconnecter avec son code de rappel, créer une table modérateur. Les quatre chemins couvrent les cinq fonctions. Plus un appel REST direct sur `leave_other_session_tables` qui doit désormais répondre une erreur de permission.

**Rollback** : `GRANT EXECUTE` inverse, une ligne.

---

## Lot 2 — Ne plus faire confiance au `user_id` reçu en paramètre

**Ce qu'on ferme** : le fait que le lot 1 ne tienne qu'à un `GRANT`. Un grant se défait sans trace — on en a la preuve dans ce dépôt même, la restriction de colonne du chantier 51 sur `assertions` n'est plus en vigueur en base sans qu'aucune migration ne l'explique.

**Le geste** : dans `leave_other_session_tables` et `sync_table_assignment`, remplacer le paramètre `p_user_id` par `auth.uid()`, et retirer le paramètre de la signature.

**Vérifié** : les quatre appelants (`join_table`, `switch_table`, `create_table`, `claim_table_as_moderator`) passent **déjà** `auth.uid()` — la lecture des quatre corps en base le confirme mot pour mot. Le changement est donc neutre fonctionnellement, et il rend le défaut inexploitable même si le grant revenait un jour.

**Piège à respecter** : `DROP FUNCTION` + `CREATE` change la signature ; les quatre appelants doivent être recréés dans la **même** migration, et leur corps repris de `pg_get_functiondef` en base, jamais des fichiers de migration (règle SQL du projet — le corps en base a divergé plusieurs fois).

**Recette** : la même que le lot 1, plus la vérification qu'il n'existe pas deux surcharges de chaque fonction après coup (piège du chantier 70).

---

## Lot 3 — Restreindre ce qu'un modérateur peut réécrire sur sa table (C7)

**Ce qu'on ferme** : `tables_update_moderator` n'a aucune restriction de colonne, et `UPDATE` est accordé à `anon` sur **toutes** les colonnes de `tables`. Qui est modérateur d'une table peut donc en réécrire le `join_code` — plus personne ne peut la rejoindre — ou la rattacher à une autre séance.

**Le geste** : `REVOKE UPDATE ON tables FROM anon, authenticated`, puis `GRANT UPDATE (questionnaire_forced_at)`. La policy RLS ne bouge pas.

**Pourquoi cette colonne et elle seule** : c'est le **seul** `UPDATE` direct sur `tables` dans tout le frontend (`TableContext.tsx:538` et `:547`, forçage et annulation du questionnaire). Tout le reste — parole en cours, `leaderless`, numéro de table, rattachement — passe déjà par des RPC `SECURITY DEFINER`, que le privilège de table ne concerne pas.

**Risque** : c'est le lot le plus exposé à la casse silencieuse. Un `UPDATE` refusé par manque de privilège de colonne remonte une erreur PostgREST, mais plusieurs écrans du projet avalent leurs erreurs. À appliquer avec la recette jouée juste après, pas la veille d'une séance.

**Recette** : forcer puis annuler le questionnaire depuis les outils modérateur ; vérifier qu'un `UPDATE` direct sur `join_code` est refusé ; dérouler un tour de parole complet (prise, fin, avancement) pour confirmer que les RPC sont intactes.

---

## Lot 4 — L'auto-désignation de modérateur (A4) — **arbitrage de Jules requis**

**Ce qu'on ferme** : `designate_moderator` ne demande **aucun secret**. Sur une table `leaderless`, n'importe quel participant se fait modérateur, ce qui lui ouvre d'un coup `kick_participant`, `grant_floor`, `correct_turn`, `add_offline_participant` — et, tant que le lot 3 n'est pas passé, la réécriture du `join_code`. C'est le chemin d'interruption le plus court qui ne demande rien.

**Ce n'est pas un bug** : c'est le mécanisme prévu pour qu'une table sans animateur puisse en désigner un sur place. Le fermer sans rien mettre à la place casse un parcours voulu — d'où l'arbitrage. Trois options, par ordre de friction croissante :

1. **Ne rien faire ici, et se contenter des lots 1 à 3.** L'auto-désignation reste ouverte, mais ce qu'elle permet de casser est réduit à la table concernée, et surtout n'est plus irréversible : le superadmin reprend la main avec `release_table_moderation`. C'est défendable si la salle est physiquement contrôlée — un saboteur y est assis à côté de ses victimes.
2. **Premier arrivé seulement** : n'autoriser `designate_moderator` que pendant une fenêtre après l'ouverture de la table, ou qu'une fois par table (une reprise ultérieure passe par le Code Ecclesia via `claim_table_as_moderator`, qui existe déjà et est correctement gardé).
3. **Demander le Code Ecclesia**, comme `claim_table_as_moderator`. Le plus sûr, le plus contraignant : il faut que le code circule jusqu'aux tables sans animateur le jour J.

**Ma recommandation** : option 2. Elle garde le parcours (la table se donne un animateur toute seule) et supprime la reprise hostile en cours de débat, qui est le scénario qui t'inquiète.

---

## Ce que ce plan ne couvre pas, volontairement

- **Les sauvegardes (chantier 85)** restent devant tout le reste. Les quatre lots ci-dessus protègent d'une interruption réparable ; l'absence de sauvegarde, elle, expose à une perte qui ne se répare pas. Deux secrets GitHub à créer, rien d'autre.
- **La régression du chantier 51** (`assertions.member_id` de nouveau lisible) — sujet exfiltration, pas interruption. À traiter à part, et à reposer *dans une migration du dépôt*.
- **Le durcissement de `reclaim_attempts`** (verrou de 1 min après 10 échecs, faible sur un code à 4 chiffres) — le lot 1 supprime le contournement trivial, mais pas la faiblesse du plafond lui-même.
- **`participants_insert`** n'exige pas le `join_code` : un `table_id` connu suffit à s'asseoir. Aujourd'hui `table_id` ne fuite pas largement, mais la garde repose sur ce seul secret d'implémentation. À reprendre quand les quatre lots seront passés.
- **Le débit de `signInAnonymously`** (configuration Auth Supabase, non inspectable depuis ici) : il conditionne toute attaque en volume. À regarder dans le dashboard.

---

## Ordre et découpage proposés

| Lot | Effet sur « on ne peut plus arrêter la séance » | Risque de casse | Dépend de |
|---|---|---|---|
| 1 — `REVOKE EXECUTE` sur 5 helpers | **L'essentiel** : supprime l'éjection et le déplacement à distance | Quasi nul (aucun appel frontend, appelants `SECURITY DEFINER`) | rien |
| 2 — `auth.uid()` au lieu du paramètre | Rend le lot 1 permanent | Faible, mais touche 4 fonctions du parcours d'entrée | lot 1 de préférence |
| 3 — colonnes de `tables` (C7) | Supprime la réécriture du `join_code` | Moyen — casse silencieuse possible | rien |
| 4 — `designate_moderator` (A4) | Supprime la prise de contrôle d'une table `leaderless` | Produit, pas technique | **décision de Jules** |

Les lots 1 à 3 sont faisables sans Jules et sans mot de passe superadmin (aucune fonction à `crypt()` n'est touchée — le piège du chantier 56 ne s'applique pas ici). Le lot 4 attend sa décision.
