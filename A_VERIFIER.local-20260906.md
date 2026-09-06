# À vérifier

Liste des points nécessitant une validation humaine, générés lors des sessions Claude Code.
Ne pas supprimer une entrée sans validation explicite de Jules — se contenter de la déplacer en section "Validé" une fois confirmée. Si un point semble obsolète, le marquer comme tel plutôt que l'effacer.

> **2026-08-03** — Fichier allégé à la demande de Jules avant une remise à zéro de la mémoire Dispatch : toutes les entrées déjà vérifiées/confirmées (chantiers 1 à 32 et vagues de vérification antérieures) ont été retirées — leur historique complet reste dans l'historique git de ce fichier (`git log -p -- A_VERIFIER.md`).
>
> **Correction 2026-09-01** : les chantiers **33 et 34** avaient été retirés par cet allégement alors qu'ils n'ont **jamais été vérifiés humainement** (33 : uniquement `tsc`/tests/mock réseau ; 34 : uniquement mock réseau via route de debug) — réintégrés ci-dessous, section Superadmin (33) et Participant (34).
>
> **⚠️ 2026-09-02 (session de consolidation) — toute la vague récente repose entièrement sur la passe manuelle de Jules.** Les recettes des chantiers **50, 51, 53, 57, 60, 61 et 62** ont été écrites par des sessions headless (harnais partagé, pas de mot de passe superadmin/Code Ecclesia, consigne explicite de ne lancer aucun serveur de dev ni test navigateur) — **aucune d'elles n'a été jouée à l'écran**, ni par une session Claude Code ni par Jules, au moment de l'écriture de cette note. Tout ce qui suit dans ce fichier pour ces sept chantiers (y compris les scénarios détaillés, marqués "Déjà vérifié : tsc/build/tests uniquement") reste donc à dérouler intégralement à la main avant de les considérer clos.

## Règle — plus de migration SQL appliquée par une session de chantier (2026-09-01)

Décision de Jules : une session de chantier **n'applique plus jamais de migration SQL elle-même**, qu'elle ait ou non un accès MCP Supabase disponible. Elle **documente ici** le chemin du fichier de migration et ce qu'il change. C'est la **session de vérification dédiée** qui applique le SQL (SQL Editor du dashboard Supabase ou MCP) et qui met à jour l'entrée correspondante (statut "appliquée", résultat du test). Le paragraphe "Accès MCP Supabase" de `CLAUDE.md` qui affirmait un accès direct pour toute session est corrigé en conséquence — voir ce fichier.

## Comment vérifier "tout d'un coup"

Les points sont groupés **par écran/parcours**, pas par chantier, pour permettre une seule passe par écran plutôt que d'aller-retour entre chantiers. Dans l'ordre suggéré :

1. **Migration SQL en attente** (ci-dessous) — à appliquer avant de tester les chantiers 33, 39, 44, 46, 48, 54, 60, 61, 62, 64 et 66 (54 est indépendante de toutes les autres ; 62 n'ajoute pas de migration propre mais dépend de celle du 48, `switch_table` ; 64 se compose de trois fichiers, à appliquer dans l'ordre : `20260902_chantier64_leaderless_becomes_moderated.sql`, puis `20260902_chantier64b_leaderless_origin_and_revert.sql` (après le 48), puis `20260902_chantier64c_move_member_to_group_revert.sql` ; 66 s'applique après le 48 et toute sa suite 64b/64c, repart de leur dernière version de `switch_table`).
2. **Résultats publics (chantier 46)** — accueil (bouton + modale), superadmin (pastille par séance), page publique `#results/<id>`.
3. **Superadmin** — onglets Tables, Membres, phase voting.
4. **Participant** — vote/pré-vote, écran "Débat en cours", entrée en débat, résultats de fin de séance.
5. **Modérateur** (`ModeratorView`) — Code Ecclesia + vraie table animée requis. Couvre aussi le chantier 44 ("Ajouter une personne sans téléphone") et la refonte "Outils Modo" (chantier 43).
6. **Questionnaire post-débat** — les trois points d'entrée (table, `#vote/`, `#session/`) et leur déclenchement automatique à la clôture (chantier 39).
7. **Synchronisation temps réel (chantier 35)** — nécessite deux onglets/navigateurs en parallèle, à faire à part.
8. **Nettoyage des données de test** — une fois tout vérifié, purger les tables de QA listées en bas de fichier.

## ⚠️ Migration SQL en attente d'application

> **✅ Mise à jour 2026-09-02 (session de consolidation)** : les 4 migrations des chantiers **60, 50, 51 et 61** ont été **appliquées par l'orchestration le 2026-09-02**. Les entrées ci-dessous pour ces 4 chantiers restent en place (append-only) mais ne bloquent plus sur l'application SQL — seuls les tests navigateur listés dans chacune restent à dérouler. Les migrations des chantiers **48, 46, 33, 39, 44 et 64** ci-dessous, elles, **n'ont pas de statut d'application confirmé** — ne pas les rejouer depuis une session de chantier (règle du 2026-09-01 ci-dessus), et ne pas présumer qu'elles sont passées : à vérifier en base avant de tester leur comportement.

- [ ] **Chantier 64 (complément 2) — `supabase/migrations/20260902_chantier64c_move_member_to_group_revert.sql`** — appliquée (confirmée en base), corps relu le 2026-09-06 (session Claude Code) : garde `leaderless_by_design = true` identique à `switch_table`, logique conforme. **Non testée en conditions réelles** — `move_member_to_group` demande le mot de passe superadmin (glisser-déposer onglet Groupes), que je n'ai pas utilisé ici.

  **Ce qu'elle change** : `move_member_to_group` (glisser-déposer d'un membre vers un autre groupe, onglet Groupes du superadmin) applique désormais exactement la même bascule que `switch_table` — si le membre déplacé était le modérateur Bloc C (`session_members.is_moderator`) de la table qu'il quitte, et que cette table est `leaderless_by_design = true`, elle redevient `leaderless = true`. Une table conçue modérée dès l'origine ne bascule jamais, quel que soit le membre déplacé.

  **Inventaire demandé par Jules** (« vérifie s'il existe d'autres chemins... ») — recherche exhaustive de toute écriture dans `table_assignments` et de tout `DELETE FROM participants`/`session_members` sur l'ensemble de `supabase/migrations/` (détail complet en tête du fichier de migration) :
  - **Couverts par la bascule** : `switch_table` (chantier 48, complément initial) et `move_member_to_group` (ce fichier) — les deux seuls chemins où un membre quitte une table pour une AUTRE table du même type d'opération.
  - **Volontairement non couverts, chacun avec sa raison** :
    - `set_member_moderator(..., false)` — retrait EN PLACE, le membre ne change pas de `table_assignments`. Tranché dès le chantier 64 initial : ne bascule jamais.
    - `kick_participant` — supprime la ligne `participants` mais ne touche JAMAIS `table_assignments` (défaut préexistant, indépendant de ce chantier). Pas de table de destination : la personne est exclue, elle ne « part vers une autre table ». Le kick de soi-même comme modérateur n'est pas offert par l'UI (`ParticipantsTable`, bouton "Exclure") mais reste techniquement possible via appel RPC direct — signalé, non traité, à trancher séparément si Jules le juge nécessaire.
    - `assign_table_to_group` — catégorie différente : rebind la table PHYSIQUE de tout un numéro de groupe (`table_number`) pour TOUS ses membres d'un coup, sans jamais toucher `participants`. Le concept de « bascule au départ d'un membre » ne s'applique pas à une opération qui déplace un groupe entier.
    - `apply_allocation` — recalcul complet, déjà couvert différemment (chantier 64b) : chaque table touchée par un recalcul se voit reposer `leaderless_by_design` à la valeur du nouveau plan.
    - `run_clustering_v1/v2/v3`, `auto_assign_tables` — fonctions de clustering historiques, confirmées mortes (plus appelées par le frontend depuis le chantier 37) et ne touchant jamais `tables.leaderless` (vérifié par lecture, elles prédatent la colonne). Non modifiées.
    - Aucune RPC ne supprime jamais de ligne `session_members` — un membre ne peut être que réaffecté, auto-relogé, ou exclu physiquement d'une table, jamais retiré d'une séance entièrement.

  **Recette de vérification — superadmin déplace le modérateur d'une table convertie** :
  1. Séance avec une table `leaderless = true` dont un membre assis devient modérateur (`set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table`). Vérifier en base : `leaderless = false`, `leaderless_by_design = true`.
  2. Noter le nombre de lignes `speaking_turns` pour cette table et le contenu de la file d'attente (`queue_entries`) des AUTRES participants restés dessus.
  3. Onglet Groupes → glisser-déposer la carte de CE modérateur vers un autre groupe (`move_member_to_group`). **Observer** : la table d'origine repasse `leaderless = true` — badge "Sans modérateur" réapparaît (immédiat, `loadGroups()` est rappelé en séquence par `handleDragEnd`) ; un participant resté sur cette table voit à nouveau la possibilité de s'auto-gérer (`ParticipantView`, bloc "Groupe auto-géré").
  4. **Historique intact** : recompter `speaking_turns` pour cette table (identique à l'étape 2) et relire les entrées de `queue_entries` des participants restés (inchangées — aucune ligne supprimée ni tronquée par la bascule elle-même).
  5. **Non-régression, table conçue modérée** : répéter 1-3 sur une table `leaderless_by_design = false` (créée directement avec un modérateur, ou issue d'une allocation qui l'a désignée `moderated: true`). **Observer** : le déplacement du modérateur ne change RIEN — la table reste `leaderless = false`.
  6. **Non-régression, membre ordinaire** : sur la table convertie du test 1, déplacer un membre qui N'EST PAS le modérateur. **Observer** : la table reste `leaderless = false` — seul le départ DU modérateur bascule.

  **Recette de vérification — table conçue modérée, aucun changement au départ** :
  1. Créer une table via "Créer une table" (Code Ecclesia, pas la case "table sans animateur") ou par une allocation qui la désigne `moderated: true` dès le calcul. Vérifier `leaderless_by_design = false` en base.
  2. Le modérateur assis rejoint une autre table via "Je veux rejoindre une autre table" (`AllocatingScreen`, `switch_table`). **Observer** : la table quittée reste `leaderless = false` — toujours affichée "avec modérateur" côté superadmin (onglet Groupes), même sans personne dessus.

  **Recette de vérification — table convertie, bascule au départ** :
  3. Table `leaderless=true` dont un membre assis devient modérateur (`set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table` — chantier 64 initial). Vérifier `leaderless = false, leaderless_by_design = true` en base.
  4. Ce modérateur (et lui spécifiquement — pas un autre participant de la même table) clique "Je veux rejoindre une autre table" et rejoint une table différente. **Observer** : la table quittée **redevient** `leaderless = true` — badge "Sans modérateur" réapparaît côté superadmin (immédiat via `loadGroups()` si l'action vient du superadmin, sinon polling 10 s), et un participant resté sur cette table voit à nouveau la possibilité de s'auto-gérer (`ParticipantView`, bloc "Groupe auto-géré", bouton "Devenir modérateur" à nouveau visible).
  5. **Non-régression** : un participant ORDINAIRE (pas le modérateur) de cette même table convertie utilise "Je veux rejoindre une autre table" pour partir. **Observer** : la table reste `leaderless = false` — son départ ne doit rien basculer, seul le départ DU modérateur compte.

  **Recette de vérification — historique préservé (point explicitement souligné par Jules, ne pas se contenter d'une lecture de code)** :
  6. Avant la bascule du test 4 : noter le nombre de lignes dans `speaking_turns` pour cette table (`SELECT count(*) FROM speaking_turns WHERE table_id = '<id>'`), et le contenu de la file d'attente des AUTRES participants restés sur la table (`queue_entries`).
  7. Déclencher la bascule (test 4). **Observer** : le compte de `speaking_turns` est identique après (aucune ligne supprimée) ; les entrées de file des participants restés sont intactes (seule celle du modérateur parti, s'il en avait une, disparaît — cascade normale de la suppression de SA ligne `participants`, comme pour n'importe quel départ via `switch_table`, inchangé par ce chantier) ; les temps de parole cumulés affichés dans `ParticipantsTable`/export CSV restent corrects pour tout le monde.

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **Confirmée en base et relue le 2026-09-06 (session Claude Code)** : `claim_moderator_status` et `assign_moderator_to_table` présentes, corps relu intégralement — accepte bien `debating`, auto-assise sur la première table animée sans modérateur, conversion `leaderless → false` en place si le membre est déjà assis, exactement conforme à la description ci-dessus. **Non testée en conditions réelles** : `claim_moderator_status` demande le **Code Ecclesia** (pas le mot de passe superadmin, un secret différent que je n'ai pas non plus) — je n'ai pas pu la déclencher moi-même depuis le navigateur.

  **Reste à faire par Jules** : sur une séance en `allocating`/`debating` avec plusieurs tables et au moins une sans modérateur, utiliser "Je suis modérateur de cette séance" (Code Ecclesia) ou le contrôle `AddModeratorControl` du superadmin (assignation manuelle par table), et vérifier l'auto-assise décrite ci-dessus.

- [ ] **Chantier 52 — `supabase/migrations/20260902_chantier52_valider_url_sources_fermer_collab_users.sql`** (jamais appliquée)

  **Contexte (audit sécurité 2026-08-03)** : deux constats distincts sur les sources collaboratives.
  1. Aucune validation de schéma sur `session_sources.url` — `add_collab_source`/`update_collab_source` acceptaient n'importe quelle chaîne, rendue ensuite cliquable dans un `<a href>` (`CollabDocScreen.tsx` et `SuperadminScreen.tsx`/`CollabSourcesList`). Un `javascript:`/`data:` inséré là exécute du script dans le navigateur de quiconque clique — le superadmin en premier lieu, puisqu'il consulte la liste des sources de toutes les tables.
  2. `collab_session_users` avait une policy SELECT `USING (true)` — même défaut que celui fermé pour `session_members`/`table_assignments` par le chantier 50 (confirmé en base le 2026-09-02). Un `GET /rest/v1/collab_session_users` avec la clé anon retournait pseudo + user_id de tous les inscrits aux documents collaboratifs de toutes les séances.

  **Contenu du fichier** :
  1. `is_valid_source_url(p_url text) RETURNS boolean` — NULL/chaîne vide autorisés (pas de lien), sinon schéma `http(s)://` obligatoire (insensible à la casse).
  2. `add_collab_source` et `update_collab_source` **redéfinies avec la signature inchangée** (5 et 4 arguments respectivement, `RETURNS public.session_sources`, vérifiée en relisant `20260527000006_collab_sources.sql` et `20260527130000_collab_table_join_code.sql`, seules migrations à toucher ces fonctions) — ajoutent la validation en tête, normalisent une URL vide/blanche en `NULL` avant écriture. Aucun autre comportement changé.
  3. `collab_session_users_select` (`USING (true)`) remplacée par `collab_session_users_select_own` (`USING (user_id = auth.uid())`), avec le même bloc `DO $chk$` de garde-fou contre une policy permissive résiduelle que le chantier 50.

  **Inventaire fait avant écriture** : une seule lecture directe de `collab_session_users` dans `src/` — `CollabDocScreen.tsx:83`, déjà filtrée `.eq('session_id', ...).eq('user_id', uid)` — non affectée par la fermeture. Pas d'abonnement Realtime sur cette table (elle n'est pas dans la publication `supabase_realtime`, contrairement à `session_sources`). Aucune fonction `SECURITY DEFINER` ne fait de lecture croisée dessus pour le superadmin : pas de RPC de remplacement nécessaire, contrairement au chantier 50.

  **Ce qui n'a PAS été inspecté** : le contenu réel de `session_sources.url` en base — impossible sans accès MCP Supabase direct depuis cette session (règle du 2026-09-01). **À faire en priorité par la session de vérification**, avant même d'appliquer la migration :
  ```sql
  SELECT id, session_id, pseudo, url FROM session_sources
  WHERE url IS NOT NULL AND btrim(url) <> '' AND url !~* '^https?://';
  ```
  Si cette requête retourne des lignes, **les signaler à Jules plutôt que de les modifier ou de les supprimer** (consigne explicite du brief de ce chantier).

  **Côté frontend, déjà livré (ne dépend pas de la migration pour compiler)** : `isSafeUrl()` dans `src/lib/utils.ts`, utilisée à l'affichage dans `CollabDocScreen.tsx` (`SourceCard`) et `SuperadminScreen.tsx` (`CollabSourcesList`) — un lien dont le schéma n'est pas `http(s)` s'affiche en texte rouge non cliquable au lieu d'un `<a href>`, **y compris pour les lignes déjà en base jamais validées à l'écriture**. Le formulaire d'ajout/modification de `CollabDocScreen.tsx` fait aussi un contrôle client immédiat (message "Lien invalide : seuls les liens http:// ou https:// sont acceptés.") avant l'appel RPC — pure UX, la défense réelle reste côté serveur. `npx tsc --noEmit`, `npm test` (94 passants) et `npm run build` OK.

  **⚠️ VULNÉRABILITÉ RÉSIDUELLE TROUVÉE le 2026-09-06 (session Claude Code) — chantier PAS complètement clos malgré la migration appliquée.**

  La migration a bien été appliquée (`is_valid_source_url` présente, `add_collab_source(uuid,text,text,text,text)` à 5 arguments valide correctement l'URL, `collab_session_users` fermée en lecture — tout confirmé en base et en navigateur, détail plus bas). **Mais** : `pg_proc` contient **deux** fonctions `add_collab_source` — la nouvelle à 5 arguments (avec validation) **et une ancienne à 4 arguments (sans `table_join_code`, sans AUCUNE validation d'URL)**, restée en base depuis avant le chantier "collab_table_join_code". Le commentaire de la migration chantier 52 (l.56) affirme *« signature inchangée, pas de DROP FUNCTION nécessaire »* — **c'est faux**, la signature a changé de 4 à 5 arguments dans un chantier antérieur sans `DROP FUNCTION` de l'ancienne, exactement le piège documenté dans `CLAUDE.md` (§ « Ne jamais faire »). Résultat : `SELECT pg_get_function_identity_arguments('add_collab_source'::regproc)` lève `ERROR 42725: more than one function named "add_collab_source"` — l'étape de vérification prescrite par la migration elle-même (point 2 ci-dessous) aurait dû détecter le problème **avant** application, mais n'a apparemment pas été exécutée, ou son erreur n'a pas été traitée comme bloquante.

  **Exploitabilité confirmée** : `has_function_privilege('anon', 'add_collab_source(uuid,text,text,text)'::regprocedure, 'EXECUTE')` → `true`. N'importe qui peut donc encore appeler `POST /rest/v1/rpc/add_collab_source` avec **4** paramètres nommés (`p_session_id`, `p_title`, `p_url`, `p_content` — sans `p_table_join_code`) pour insérer une source avec `url = 'javascript:alert(1)'`, en contournant intégralement la protection de ce chantier. Non exploité en base pour ne pas laisser de trace, mais la fonction vulnérable existe et reste appelable — confirmé en lisant son corps (aucun appel à `is_valid_source_url`) et ses privilèges.

  **Recommandation** : `DROP FUNCTION add_collab_source(uuid, text, text, text);` — le frontend n'appelle plus jamais cette forme depuis le chantier `collab_table_join_code` (vérifié par grep, un seul appel dans `src/`, à 5 arguments). Je n'ai pas appliqué ce DROP moi-même : c'est un changement de code au-delà de la simple vérification, à valider avec toi avant de le faire.

  **Reste du chantier, vérifié et fonctionnel** :
  1. Requête de repérage des URL douteuses en base → aucune ligne trouvée.
  2. `collab_session_users` : policy `USING (user_id = auth.uid())` confirmée ; test REST anonyme → `[]` (fermé).
  3. Test navigateur bout en bout sur `#collab/65155A` (via la forme à 5 arguments, celle utilisée par le frontend) : `javascript:alert(1)` → message rouge "Lien invalide", formulaire reste ouvert, **aucune requête réseau envoyée** (bloqué côté client avant l'appel RPC) ; `https://example.com` → source acceptée et affichée avec lien cliquable. Source de test nettoyée après vérification.

## Sources collaboratives (chantier 52)

*Nécessite la migration SQL ci-dessus appliquée pour tester le refus serveur d'une URL à schéma non autorisé ; l'affichage sécurisé (lien masqué pour une ligne déjà en base) et le contrôle client sont eux indépendants de la migration — testables dès maintenant.*

- [ ] **Chantier 67 (point 2) — `supabase/migrations/20260902_chantier67_claim_moderator_prevoting.sql`**

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?, reclaim_code?)` — nouveau 4e paramètre `p_reclaim_code text DEFAULT NULL`. Reprend exactement la règle de `register_session_member` (chantier 61) : `attending_in_person := v_phase != 'pre_voting'` (au lieu de toujours `true`), et le code de rappel n'est stocké que pour une inscription **créée** en `pre_voting` (branche « cas (a) », nouveau profil). La branche « cas (b) » (déjà inscrit sur cet appareil, simple `UPDATE is_moderator = true`) n'est pas concernée — elle ne touchait déjà ni l'un ni l'autre.

  **Pourquoi** : un modérateur qui se déclare depuis chez lui pendant `pre_voting` (onglet « 🎙️ Modérateur » d'`EntryScreen`) était compté `attending_in_person = true` dès l'inscription — faussant les stats de présence et l'allocation, qui filtrent toutes deux sur cette colonne — et ne recevait jamais de code de rappel, contrairement à un inscrit classique via `register_session_member`.

  **Signature changée (3 → 4 arguments)** : `DROP FUNCTION IF EXISTS claim_moderator_status(uuid, text, text)` explicite avant recréation (piège CLAUDE.md — un changement du nombre d'arguments crée une surcharge ambiguë au lieu de remplacer).

  **Code frontend déjà livré** (compile et tourne indépendamment de l'application de la migration — tant que l'ancienne fonction 3-aire reste en base, PostgREST résout dessus et ignore silencieusement le `p_reclaim_code` envoyé par le client, donc aucun crash, juste l'ancien comportement) :
  - `claimModeratorStatus()` (`src/lib/voting.ts`) accepte un 4e paramètre optionnel `reclaimCode`.
  - `EntryScreen.handleClaimModerator` génère un code à 4 chiffres côté client — même génération que `VoteScreen` pour `register_session_member`, pas de second générateur — l'envoie, et si la réponse renvoie `reclaim_code === candidateCode` (signe que la branche « nouveau profil en pré-vote » a tourné), affiche l'écran `ReclaimCodeDisplay` avant de rediriger vers `#vote/<join_code>`. Sinon (déjà inscrit, ou phase ≠ `pre_voting`), redirection immédiate comme avant.
  - `ReclaimCodeDisplay` extrait de `VoteScreen.tsx` vers `src/components/voting/ReclaimCodeDisplay.tsx` (composant partagé, réutilisé aux deux endroits — comportement visuel strictement identique à l'écran déjà existant en pré-vote classique).
  - `SessionMember.reclaim_code?: string | null` ajouté à `src/lib/types.ts` pour lire ce champ (absent du type avant ce chantier, jamais lu depuis la réponse d'une RPC jusqu'ici).

  **Confirmée en base le 2026-09-06 (session Claude Code)** : signature unique `claim_moderator_status(uuid,text,text,text)`, pas de surcharge résiduelle (le `DROP FUNCTION` explicite a fonctionné, contrairement au chantier 52). Corps relu, conforme à la description (règle `attending_in_person` alignée sur le chantier 61, `reclaim_code` uniquement pour un nouveau profil en `pre_voting`). **Non testée en conditions réelles** : cette RPC demande le **Code Ecclesia**, que je n'ai pas (même limitation que le chantier 33).

  **Reste à faire par Jules** : depuis `EntryScreen`, onglet "🎙️ Modérateur", sur une séance en `pre_voting`, se déclarer modérateur avec le Code Ecclesia → l'écran `ReclaimCodeDisplay` doit apparaître avant la redirection vers le vote, et `attending_in_person` doit rester `false` en base pour ce membre.

- [ ] **Chantier 67 (point 3) — `supabase/migrations/20260902_chantier67_sync_table_assignment_log.sql`**

  **Contenu du fichier** : `sync_table_assignment` avalait silencieusement toute exception (`EXCEPTION WHEN OTHERS THEN NULL;`), y compris une collision de pseudo sur `session_members` (`UNIQUE(session_id, pseudo)`) — le participant rejoint bien physiquement sa table (`participants`) mais reste invisible du tableau de bord superadmin (`table_assignments` jamais posé), sans aucune trace de l'échec nulle part. Corrigé en remplaçant le `NULL;` par un `RAISE WARNING` (contexte : session/user/pseudo/table + `SQLERRM`), visible dans les logs Postgres/Supabase (dashboard → Logs). Signature et comportement transactionnel **inchangés** (`RETURNS void`, ne lève toujours jamais vers l'appelant) — voir la justification détaillée en tête du fichier de migration sur le choix « logger, pas lever » plutôt que faire échouer `join_table`/`create_table`/`switch_table`, qui ont déjà inséré la ligne `participants` dans la même transaction au moment où `sync_table_assignment` est appelée.

  **Recouvrement signalé, pas résolu ici** : `join_table` est retravaillé en parallèle par le chantier 66 sur ce même fichier source (`20260727_6_chantier26_sync_table_assignments.sql`). Cette migration ne touche **que** le corps de `sync_table_assignment` — aucun de ses trois appelants (`join_table`, `create_table`, `switch_table`) n'est modifié, précisément pour ne pas empiéter sur ce chantier en cours.

  **✅ Vérifiée le 2026-09-06 (session Claude Code)** : signature confirmée inchangée. Corps relu — `RAISE WARNING` avec `SQLERRM` en place (plus de `EXCEPTION WHEN OTHERS THEN NULL;` silencieux). Collision provoquée directement en SQL (`sync_table_assignment` appelée avec un pseudo déjà pris par un autre `user_id` dans la même séance) : la fonction retourne normalement sans erreur côté appelant, et surtout **aucune ligne dupliquée/corrompue n'apparaît dans `session_members`** (toujours 1 seule ligne pour ce pseudo) — le comportement "collision absorbée proprement" est confirmé. **Non confirmé** : l'apparition effective de la ligne `WARNING` dans les logs Postgres — l'outil de requête de logs a renvoyé une erreur backend à chaque tentative, indépendante de l'app.

  **Reste à faire par Jules si tu veux voir le log toi-même** : dashboard Supabase → Logs → Postgres, chercher `sync_table_assignment` après avoir provoqué une collision de pseudo (deux identités différentes, même pseudo, même séance).

- [ ] **Chantier 68 — `supabase/migrations/20260903_chantier68_claim_table_as_moderator.sql`** (jamais appliquée) ⚠️ **à appliquer APRÈS le chantier 66** (`20260903_chantier66_join_table_single_table.sql`, branche `chantier-66-une-seule-table` — dépendance dure, voir plus bas)

  **Aucune vérification navigateur faite** (session headless, consigne explicite de ne lancer aucun serveur de dev). Seuls `npx tsc --noEmit`, `npm test` (94 tests) et `npm run build` ont été joués, tous verts.

  **Le problème** : `JoinTableForm` (case « Je suis modérateur de cette table ») et un chemin dupliqué dans `EntryScreen` (onglet « Rejoindre ou reprendre une table », même case) appelaient tous deux `reclaim_moderator`, qui écrase `tables.created_by` **sans aucune vérification** dès lors que le Code Ecclesia est valide. Le Code Ecclesia étant partagé entre tous les modérateurs, quiconque le connaît pouvait reprendre la main sur une table qui a déjà un modérateur actif et l'en déposséder silencieusement, en pleine séance.

  **Le correctif** : nouvelle RPC `claim_table_as_moderator(p_join_code, p_creation_code, p_pseudo, p_session_id?)`, appelée à la place de `reclaim_moderator` par `JoinTableForm` et `EntryScreen`. Vérifie dans l'ordre : (1) le Code Ecclesia, (2) que la table appartient bien à la séance précisée par l'appelant (`p_session_id`, optionnel — voir plus bas), (3) qu'aucun modérateur n'a déjà autorité sur cette table (nouveau helper `table_has_moderator`, généralisation de `is_table_moderator` du chantier 60 : « quelqu'un a-t-il déjà autorité ? » plutôt que « l'appelant a-t-il autorité ? », nécessaire ici puisqu'un nouvel arrivant n'a par construction aucun historique avec son `auth.uid()` sur cette table). Chaque échec lève un message dédié. Sur succès : devient créateur physique + siège comme participant, et pose `leaderless = false` (une table `leaderless` est une cible légitime — voir plus bas).

  **`reclaim_moderator` n'est PAS modifiée** — elle reste le seul chemin de vraie reprise de main (quelqu'un qui était déjà le modérateur de cette table précise et revient sur un nouvel appareil), sans la nouvelle vérification. Voir l'en-tête de la migration pour le détail complet du raisonnement, l'inventaire des appelants migrés (`JoinTableForm`, `EntryScreen` — `TestScreen` est du code mort, non touché) et pourquoi une table `leaderless` est ciblable par ce chemin (cohérent avec le chantier 64).

  **⚠️ Dépendance dure sur le chantier 66, découverte pendant l'écriture de cette migration (pas au premier passage — main a bougé entre-temps)** : le chantier 66 (`leave_other_session_tables`, appelé par `join_table`/`switch_table`) impose l'invariant « un participant n'est présent que dans une table à la fois au sein d'une séance ». `claim_table_as_moderator` insère elle aussi une ligne `participants` : sans le même appel, un modérateur en retard déjà assis ailleurs dans la séance (assigné par l'allocation à une autre table, par exemple) se retrouverait sur deux tables à la fois en prenant en charge celle-ci — exactement le bug que le chantier 66 vient de fermer pour les deux autres chemins d'entrée. Le corps de la fonction appelle donc `leave_other_session_tables(v_table.session_id, v_table.id, auth.uid())` avant l'insertion. **Si cette migration est appliquée avant le chantier 66** : `leave_other_session_tables` n'existe pas encore, la fonction se crée sans erreur (plpgsql ne valide pas les appels au moment du `CREATE`) mais **tout appel échoue à l'exécution** (`function leave_other_session_tables(...) does not exist`) — vérifier son existence avant d'appliquer (requête en tête de fichier de migration).

  **Point à trancher explicitement par la session de vérification, faute d'accès Supabase pour le confirmer ici** : `p_session_id` est optionnel — `SessionRouterScreen` (état `debating_no_member`) le transmet et bénéficie donc du refus « code d'une autre séance », mais `JoinTableScreen` (lien `#table/<code>` d'un ami) et `EntryScreen` (accueil générique) n'ont aucune séance en contexte et l'omettent : sur ces deux écrans, un code de table valide d'une AUTRE séance que celle visée par l'utilisateur serait accepté tant que la table elle-même n'a pas de modérateur. Décision assumée dans la migration (pas de séance à vérifier là où l'écran n'en connaît aucune) — signaler à Jules si ce comportement doit être resserré (ex. exiger une séance partout, quitte à perdre le cas `JoinTableScreen`/`EntryScreen`).

  **✅ Vérifiée partiellement le 2026-09-06 (session Claude Code)** : `leave_other_session_tables`/`table_has_moderator`/`claim_table_as_moderator` toutes présentes sans surcharge résiduelle. Corps de `claim_table_as_moderator` relu intégralement — ordre des vérifications (Code Ecclesia → table trouvée → séance correspondante si fournie → `table_has_moderator` → pseudo non vide → `created_by`/`leaderless` → `leave_other_session_tables` → insertion `participants`) strictement conforme à la description. `table_has_moderator` testée **empiriquement sur des tables réelles** : table sans personne assise dessus (`03C069`) → `false` (donc réclamable) ; table avec le modérateur physiquement assis (`86BDF0`) → `true` (donc protégée) — les deux cas de base fonctionnent exactement comme prévu.

  **Non testé de bout en bout** : l'appel RPC réel demande le **Code Ecclesia**, que je n'ai pas (même limitation que chantiers 33/67-pt.2) — je n'ai pas pu dérouler les scénarios navigateur ci-dessous moi-même.

## Prendre en charge une table en retard, par son code (chantier 68)

*Nécessite la migration `20260903_chantier68_claim_table_as_moderator.sql` ci-dessus appliquée. Sans elle, les trois écrans ci-dessous continuent d'appeler une fonction PostgreSQL inexistante côté RPC (`claim_table_as_moderator`) — erreur affichée dans le formulaire, rien de silencieux.*

- [ ] **Cas nominal — `SessionRouterScreen`, séance en `debating`, jamais inscrit** — `#session/<join_code_séance>`

  1. Préparer une séance en phase `debating` avec au moins une table Bloc C rattachée (allocation appliquée), animée (`moderated: true` au calcul) mais **sans personne assise dessus** — l'état « table animée déjà formée mais encore sans modérateur assis » (chantiers 33/37/64). Noter le `join_code` de cette table précise et le `join_code` de la séance.
  2. Depuis un profil navigateur neuf (jamais inscrit à cette séance) : ouvrir `#session/<join_code_séance>`. Attendu : écran « 🗣️ Débat en cours » avec le formulaire de rattrapage (`JoinTableForm`).
  3. Cocher « Je suis modérateur de cette table », saisir le code de la table notée à l'étape 1, un nom, le Code Ecclesia → « Reprendre la main ».
  4. Attendu : navigation directe vers `ModeratorView` de cette table (pas d'erreur). Superadmin, onglet Groupes : la table n'affiche plus le badge « Sans modérateur », son `leaderless` est passé à `false` en base.

- [ ] **Refus — table déjà modérée, créateur physique assis** — même écran

  1. Table créée directement via « Créer une table » (Code Ecclesia, checkbox « Table sans admin » décochée) — un vrai modérateur y est donc déjà assis physiquement. Noter son `join_code`.
  2. Depuis un autre profil navigateur, même parcours que ci-dessus (case cochée, ce code, un nom, le Code Ecclesia) → « Reprendre la main ».
  3. Attendu : message d'erreur explicite « Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin », **aucune navigation**, le modérateur en place n'est pas affecté (vérifier qu'il continue d'animer normalement sur son propre appareil pendant ce test).

- [ ] **Refus — table déjà modérée via Bloc C (désignation par l'allocation, pas de créateur physique)** — même écran

  1. Table Bloc C dont un membre a été désigné modérateur et **assis** dessus (`claim_moderator_status`, `set_member_moderator` ou `assign_moderator_to_table` — vérifier en base que `table_has_moderator('<id>')` retourne `true` avant le test, via le SQL Editor).
  2. Même tentative de prise en charge que ci-dessus, avec le code de cette table.
  3. Attendu : même refus explicite, alors que `tables.created_by` de cette table pointe encore vers le superadmin (pas vers le modérateur désigné) — c'est le point qui prouve que la vérification couvre bien les deux formes d'autorité du chantier 60, pas seulement `created_by`.

- [ ] **Refus — code d'une autre séance** — même écran

  1. Deux séances en `debating` en parallèle (A et B), chacune avec au moins une table sans modérateur assis. Ouvrir `#session/<join_code_séance_A>`.
  2. Dans le formulaire de rattrapage, saisir le code d'une table appartenant à la séance **B** (pas A).
  3. Attendu : message d'erreur explicite « Ce code de table n'appartient pas à cette séance », aucune navigation — même si cette table de B n'a elle-même aucun modérateur.

- [ ] **Table `leaderless` ciblée volontairement — devient modérée** — même écran ou `JoinTableScreen`

  1. Table créée « sans admin » (`leaderless = true`, jamais réclamée par personne).
  2. Prise en charge par ce chemin (case cochée, code de cette table, nom, Code Ecclesia).
  3. Attendu : succès — la table bascule `leaderless = false` en base, comme une désignation Bloc C (chantier 64). Un participant resté sur `ParticipantView` pour cette table doit basculer sur la vue modérateur pour le preneur, et perdre la proposition d'auto-gestion par file (plus de tentative silencieuse de `claimFloor()`) pour les autres.

- [ ] **`JoinTableScreen` — lien `#table/<code>` d'un ami, sans séance en contexte** — `#table/<join_code_table>`

  1. Reprendre le scénario « Cas nominal » ci-dessus, mais en ouvrant directement `#table/<join_code_table>` (lien de type D8, pas de passage par `#session/`).
  2. Attendu : même succès pour une table sans modérateur, même refus explicite pour une table déjà modérée (créateur physique ou Bloc C) — **sans** vérification d'appartenance à une séance (aucune séance n'est connue à cet endroit, `p_session_id` est omis). Un code de table valide appartenant à n'importe quelle séance est accepté tant que la table elle-même n'a pas de modérateur — comportement assumé, voir le point signalé dans l'entrée de migration ci-dessus.

- [ ] **`EntryScreen` — onglet « Rejoindre ou reprendre une table », accueil générique** — hash vide, onglet « Rejoindre »

  1. Depuis l'accueil (pas de séance sélectionnée), onglet « Rejoindre ou reprendre une table », cocher « Je suis modérateur de cette table ».
  2. Reprendre les scénarios « Cas nominal » et les deux refus (table déjà modérée, l'une ou l'autre forme) avec les codes de table correspondants.
  3. Attendu : mêmes résultats que sur `JoinTableScreen` — pas de vérification de séance ici non plus.

- [ ] **Non-régression — vraie reprise de main toujours permise** — n'importe lequel des trois écrans ci-dessus

  1. Table dont le modérateur physique a perdu sa session (nouvel onglet privé = nouvel `auth.uid()` anonyme), ou changé d'appareil. Depuis ce nouveau profil : case cochée, le code de SA table, un nom, le Code Ecclesia.
  2. Attendu : succès (même si la table « a déjà un modérateur » au sens de `table_has_moderator`, `reclaim_moderator` reste le chemin appelé pour cette action précise si un jour elle est réexposée dans l'UI — actuellement l'UI n'expose plus que `claim_table_as_moderator` sur ces trois écrans, donc **ce scénario passe par le même refus explicite que « table déjà modérée »** ci-dessus tant qu'aucun écran dédié à la vraie reprise de main n'existe. **Point à confirmer avec Jules** : si un modérateur légitime qui a perdu sa session doit pouvoir reprendre sa propre table depuis ces écrans, il se heurtera désormais au même refus qu'un voleur — la distinction entre « reprise légitime » et « vol » n'est plus faite côté UI depuis ce chantier, seule la RPC `reclaim_moderator` (non appelée par aucun écran restant) sait encore le faire sans vérification. À trancher : faut-il un chemin UI dédié pour la vraie reprise de main (ex. un mode distinct, ou une question posée à l'utilisateur), ou ce cas est-il jugé assez rare pour rester au superadmin (`assign_moderator_to_table`) ?

- [ ] **Interaction avec le chantier 66 — le preneur était déjà assis à une autre table de la même séance** — n'importe lequel des trois écrans

  **Contexte** : `join_table`/`switch_table` (chantier 66) garantissent qu'un participant n'est jamais présent sur deux tables à la fois au sein d'une même séance, via le helper `leave_other_session_tables`. `claim_table_as_moderator` insère elle aussi une ligne `participants` — ce scénario vérifie qu'elle respecte le même invariant plutôt que de dupliquer le participant sur deux tables.

  1. Séance en `debating` avec deux tables A et B rattachées, toutes deux sans modérateur assis sur B. L'appareil de test est déjà participant (simple, pas modérateur) de la table A — par exemple via son affectation d'allocation.
  2. Depuis cet appareil : prendre en charge la table B par ce chemin (code de B, nom, Code Ecclesia).
  3. Attendu : succès sur B (nouveau modérateur, `leaderless = false` si elle l'était). **Et** : l'appareil disparaît de la table A — plus de ligne dans `participants` pour ce `user_id` à la table A, micro libéré s'il parlait, tour en cours clos. Si l'appareil était le modérateur Bloc C d'une table A `leaderless_by_design = true`, A redevient `leaderless = true` (même bascule que `switch_table`).
  4. **Non-régression** : sur une table A `leaderless_by_design = false` (conçue modérée dès l'origine), répéter le test — A doit rester `leaderless = false` après le départ, comme pour `switch_table`/`move_member_to_group` (chantier 64b/64c).
  5. **Table sans séance** : répéter avec une table B `leaderless` standalone (`session_id` NULL, jamais rattachée à une séance) — le nettoyage ne doit rien tenter côté table A (early return de `leave_other_session_tables` sur `p_session_id IS NULL`), donc si A et B ne partagent pas de séance, l'appareil reste normalement sur A (aucune notion de « même séance » ne s'applique).

## Résultats publics (chantier 46)

*Nécessite la migration SQL ci-dessus appliquée pour tester le flux de bout en bout (nouvelle colonne `results_public` + nouvelle forme du payload `get_public_results`). Sans elle : le bouton "Résultats publics" du superadmin échoue avec l'erreur Postgres "column sessions.results_public does not exist" (vérifié en navigateur ci-dessous, échec propre — pas de crash) et `get_public_results` renvoie encore l'ancienne forme (`groups`/`consensus`) que le frontend ne lit plus, donc `points`/`assertions` restent vides même pour une séance déjà close.*

- [ ] **2026-09-01 — Bouton "Résultats publics" par séance (superadmin)** — `src/screens/SuperadminScreen.tsx` (`SessionCard`)

  Sur chaque séance `closed` de la liste superadmin (écran de liste, avant d'ouvrir le détail) : pastille bascule "Résultats privés" (gris) / "Résultats publics" (vert) à côté de la description. Appelle `set_session_results_public` (mot de passe déjà en session), mise à jour optimiste de la liste avec rollback si l'appel échoue (message d'erreur affiché sous la pastille). Nommage tranché sans consulter Jules davantage : "Résultats publics" plutôt que sa proposition "Visible post débat" — le libellé décrit l'effet (qui peut voir quoi) plutôt que le moment (déjà capturé par le badge de phase "Clôturée" juste au-dessus), cohérent avec le style des autres badges d'état de la carte.

  **Non testable en session headless** : aucun mot de passe superadmin disponible. Uniquement vérifié : `tsc -b`, `npm test` (94 passants), `npm run build`, chargement de l'écran d'accueil sans erreur console. Le comportement d'échec pré-migration (colonne absente) a été vérifié indirectement via la modale "Anciennes séances" ci-dessus, qui tape la même colonne.

  **Test minimal (mot de passe superadmin requis, migration appliquée au préalable)** : ouvrir une séance close depuis la liste, cliquer la pastille → passe à "Résultats publics" sans reload ; recharger la page → l'état persiste (relu depuis `sessions.results_public`) ; cliquer à nouveau → repasse à "Résultats privés". Vérifier qu'aucune pastille n'apparaît sur les séances non closes.

## Parcours Superadmin

- [ ] **Chantier 54 — non-régression : le superadmin peut toujours supprimer une table** *(migration SQL requise, voir section « Migration SQL en attente d'application »)*

  **Pourquoi ce test** : ce chantier a retiré au modérateur le droit RLS de supprimer une table (`tables_delete_moderator`). Le superadmin passe par un chemin entièrement différent (RPC `SECURITY DEFINER` `delete_table_admin`, indépendante de RLS) qui ne doit pas être affecté — ce test le confirme.

  1. Onglet 🪑 Tables (ou l'écran équivalent listant les tables d'une séance), créer une table de test (bouton "+ Sans admin" ou via "Créer une table") puis la supprimer via le bouton "Supprimer" → confirmer dans la modale ("Supprimer définitivement la table ... ? Tous les participants, tours et files seront supprimés.") → la table disparaît de la liste, sans erreur.
  2. Vérifier que les tables restantes de la séance ne sont pas affectées (composition, badges de seuil inchangés).

- [ ] **2026-09-02 — Chantier 50 — onglet 🪑 Tables sous les policies self-only** — `src/screens/SuperadminScreen.tsx` (`loadGroups`, `loadTableAssignmentRows`), `src/lib/sessions.ts` (`listTableAssignmentsAdmin`) *(migration SQL requise, voir plus haut)*

  **Ce qui change** : la vue Groupes lisait `table_assignments` en direct avec une **jointure imbriquée PostgREST** (`session_members!member_id(pseudo, is_moderator)`), qui traversait les deux tables permissives d'un coup. Sous les policies self-only, PostgREST **ne renvoie pas d'erreur** dans ce cas : l'objet imbriqué devient `null` et les listes de membres se videraient en silence. La lecture passe désormais par la RPC `list_table_assignments_admin`. Le superadmin n'étant membre d'aucune séance, il perd aussi tous les événements Realtime sur `table_assignments` : un polling de secours de 10 s prend le relais (l'abonnement Realtime est conservé — il resservira si le superadmin est un jour membre, et il ne coûte rien).

  **C'est une régression silencieuse qu'on cherche, pas un crash** : le symptôme d'un échec serait des tables affichées **vides** ou des pseudos remplacés par `?`, sans le moindre message d'erreur.

  **Test — AVANT application de la migration** (état actuel de la base, repli actif) :
  1. Ouvrir une séance en `allocating` (ou `debating`), onglet 🪑 Tables → la composition de chaque table doit s'afficher normalement (pseudos, badges modérateur, barre de camps, badges de seuil, badge « enregistrable »).
  2. La console navigateur doit afficher **une fois par chargement** `[chantier 50] RPC list_table_assignments_admin absente — repli sur la lecture directe`. C'est le comportement attendu tant que le SQL n'est pas appliqué.
  3. Glisser-déposer un membre d'une table à une autre → il change de table, et les badges de seuil des deux tables se recalculent immédiatement.

  **Test — APRÈS application de la migration** (chemin nominal) :
  1. Recharger la même séance, même onglet → **exactement les mêmes membres, mêmes pseudos, mêmes badges** qu'avant. C'est la comparaison qui compte : une table qui perd ses membres ou affiche des `?` est l'échec caractéristique.
  2. Plus aucun message `[chantier 50] … repli …` en console (si le message revient, la RPC est absente ou son nom diffère → la migration n'a pas été appliquée, ou pas entièrement).
  3. Glisser-déposer à nouveau un membre → fonctionne, diagnostics recalculés en direct.
  4. Bouton « 🖨️ Récapitulatif » → la vue récapitulative liste bien tous les membres par table.
  5. Assigner un modérateur à une table (glisser-déposer sur la zone « Ajouter un modérateur », **et** saisie du nom avec autocomplete) → le membre apparaît bien avec son badge modérateur.

  **Test du polling de 10 s — trois choses à regarder ensemble** :
  1. **Il fonctionne** : laisser l'onglet 🪑 Tables ouvert, faire un changement depuis un 2ᵉ onglet superadmin (déplacer un membre) → le 1ᵉʳ onglet doit refléter le changement seul, en ≤ 10 s, sans reload.
  2. **Il ne réintroduit pas le bug du chantier 38** : scroller loin dans la fiche séance, ne plus toucher au clavier ni à la souris pendant ≥ 40 s → **la page ne doit jamais remonter en haut**. Le polling met les données à jour en place ; `groupsLoading` ne pilote qu'un petit spinner à côté du bouton Récapitulatif, jamais un état de chargement plein écran. C'est le point de vigilance principal de ce chantier côté UX.
  3. **Il ne clignote pas** : le badge vert « à jour à HH:MM:SS » ne doit **pas** se transformer en spinner toutes les 10 s. Les rafraîchissements de fond sont volontairement silencieux (`loadGroups(true)`) ; seuls le chargement initial et les rechargements consécutifs à une action montrent le spinner. L'horodatage du badge, lui, doit bien avancer.
  4. Quitter l'onglet 🪑 Tables / changer de phase (`closed`) → le polling doit s'arrêter (il n'est actif qu'en `allocating` et `debating`) : vérifiable dans l'onglet Réseau, plus d'appel `list_table_assignments_admin` toutes les 10 s.

  **Course connue, non corrigée** (à signaler seulement si elle se manifeste vraiment) : un tick de polling parti **avant** un glisser-déposer peut arriver **après** lui et réafficher l'état antérieur pendant ≤ 10 s. Le glisser-déposer n'est pas optimiste (il attend la RPC puis recharge), donc rien n'est perdu en base — c'est un affichage transitoire. La même course existait déjà avec le rafraîchissement déclenché par Realtime ; elle n'a pas été traitée ici pour ne pas ajouter de machinerie d'annulation à un écran déjà dense.

- [ ] **2026-09-02 — Chantier 50 — retirer le repli de lecture directe, la migration est appliquée** — `src/screens/SuperadminScreen.tsx` (`loadTableAssignmentRows`)

  **La moitié « migration appliquée » de la condition ci-dessous est désormais remplie (2026-09-02)** — reste la moitié « tests passés ». Une fois les deux séries de tests ci-dessus jouées (elles ne l'ont jamais été à l'écran, voir l'avertissement en tête de fichier), supprimer le bloc `catch` de `loadTableAssignmentRows` et n'y laisser que l'appel à `listTableAssignmentsAdmin`. Ce repli n'existe que pour couvrir la fenêtre entre le déploiement du frontend et l'application du SQL ; tant qu'il est là, il reste le **dernier `.from('table_assignments')` du frontend**, et il masquerait une future disparition de la RPC. À ne pas supprimer avant d'être certain que la migration est en base **en production** (pas seulement confirmé par l'orchestration côté outillage) et que le comportement observé est identique avant/après.

- [ ] **2026-09-01 — Chantier 38 (2ème passe) — scroll qui remonte en haut sur la fiche séance** — `src/screens/SuperadminScreen.tsx` (`SessionDetail`)

  **Retour de Jules** : « toutes les 10 secondes ou moins » l'écran superadmin « nous remmène en haut de la page » — constaté sans aucune session Claude Code active, sur tous les onglets superadmin (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse), sans clignotement visible. Ce retour infirme l'hypothèse Vite HMR retenue par la 1ère passe (voir "Historique / notes de session" plus bas) — diagnostic repris de zéro.

  **Cause trouvée** : `SessionDetail` a un seul état `loading` (posé par `load()`, la fonction qui charge "Tables rattachées"/"Tables disponibles" — polling 15 s depuis le chantier 35, + rappelée par le channel Realtime `tables` sur tout événement, + par tout changement de filtre de date). Ce `loading` gate **tout le contenu de la fiche séance** (ligne ~2064 : `{loading ? <Chargement…/> : <>…tous les onglets…</>}`), pas seulement la section des tables. À chaque déclenchement — donc au minimum toutes les 15 s, parfois plus souvent via Realtime — la totalité du contenu affiché (quel que soit l'onglet actif) est remplacée par un petit spinner le temps de l'appel réseau, ce qui effondre la hauteur du document ; le navigateur clampe alors `scrollY` à la nouvelle hauteur (beaucoup plus faible), et **ne restaure jamais** la position de scroll quand le contenu revient. D'où : ça touche tous les onglets (le gate est en dehors du switch d'onglet), ça n'a besoin d'aucune session Claude Code (bug 100 % applicatif, indépendant du HMR), et ça ne "clignote" pas franchement (le spinner est bref, ce qui se voit surtout c'est le saut de scroll).

  **Reproduit concrètement** (Browser pane, mock `fetch` sans mot de passe réel, même technique que les passes précédentes) : scroll à 893px sur une fiche mockée, clic sur un filtre de date (déclenche `load()` avec 900ms de latence simulée) → `scrollHeight` s'effondre de 993 à 563 **et `scrollY` est immédiatement clampé de 893 à 563** ; ~1.6s plus tard le contenu revient (`scrollHeight` remonte à 993) mais `scrollY` reste bloqué à 563 — jamais restauré. Instrumentation : `MutationObserver` + lecture de `window.scrollY`/`document.documentElement.scrollHeight` avant/après clic.

  **Correctif appliqué** : `load()` ne pose `setLoading(true)` (donc n'affiche le spinner plein écran) que lors du **tout premier** chargement (`hasLoadedTablesRef`, un `useRef`) — plus jamais sur un rafraîchissement de fond (polling 15s, Realtime, changement de filtre). Les données de "Tables rattachées"/"Tables disponibles" continuent de se mettre à jour en place, sans jamais vider le reste de la fiche séance ni changer la hauteur du document. Un seul changement de comportement assumé : changer le filtre de date ("Tout afficher"/"Depuis…") ne montre plus de spinner plein écran non plus — juste une mise à jour silencieuse de la liste, strictement mieux pour le même problème.

  **Déjà vérifié par moi** : `npx tsc -b` / `npm run build` / `npm test` (184/186, 2 skip préexistants) OK. Reproduction Browser pane confirmée **avant** correctif (voir ci-dessus) puis **absence totale** de collapse/clamp après correctif, sur le même scénario exact (`scrollY` et `scrollHeight` inchangés pendant tout le rafraîchissement, zéro mutation DOM observée). Zéro erreur console imputable au correctif (un warning `validateDOMNesting` pré-existant et sans rapport dans `AnalysisPanel` — bouton imbriqué dans un bouton — reste présent, non traité ici, voir entrée séparée ci-dessous si besoin).

  **Reste à vérifier par Jules en conditions réelles** : ouvrir une séance avec du contenu réel (plusieurs tables, participants, assertions), scroller loin dans la page, laisser tourner ≥ 30-40 s sans toucher au clavier/souris → la page ne doit plus jamais remonter toute seule, sur aucun des 4 onglets. Si le symptôme persiste malgré ce correctif, il reste un canal Realtime supplémentaire à investiguer (le channel `session-tables:<id>` ci-dessus a pu masquer une deuxième cause si Realtime déclenchait `load()` bien plus souvent que 15 s en usage réel — à confirmer avec le compteur d'appels réseau du vrai navigateur, impossible à observer sans données réelles).

- [ ] **2026-08-01 — Chantier 33 — gestion des modérateurs par table** — `SuperadminScreen.tsx`, `AddModeratorControl`, onglet 🪑 Tables *(migration SQL requise, voir ci-dessus)*

  **Livré (4 points)** :
  1. Accordéon "Allocation des tables" déplacé de l'onglet 🟢 En direct vers l'onglet 🪑 Tables.
  2. Sur chaque table animée en attente de modérateur (⏳) : nouveau contrôle `AddModeratorControl` — glisser-déposer d'un `DraggableMemberChip` existant sur la zone droppable, **et** un champ avec autocomplete sur les pseudos inscrits à la séance. Les deux appellent `assign_moderator_to_table`. Bouton "Retirer" symétrique (réutilise `set_member_moderator(..., false)`).
  3. `claim_moderator_status` (self-déclaration, onglet 🎙️ Modérateur de l'accueil) auto-assied désormais sur la première table animée encore sans modérateur.
  4. `claim_moderator_status` accepte la phase `debating` en plus de `pre_voting`/`voting`/`allocating`.

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test`, tous OK) : le filtre de phase `EntryScreen` (`phase=in.(pre_voting,voting,allocating,debating)`) confirmé par interception réseau + rendu mocké. **Rien d'autre n'a pu être testé en conditions réelles** (mot de passe superadmin non détenu par la session d'origine).

  **Test minimal** (mot de passe superadmin requis, migration SQL appliquée au préalable) :
  1. Onglet ⚙️ Préparation → vérifier que "Allocation des tables" n'y est plus ; onglet 🪑 Tables → vérifier qu'il apparaît en haut, au-dessus de "Groupes".
  2. Séance en `allocating` avec ≥ 1 table animée sans modérateur assis : vérifier l'apparition du contrôle ⏳ (zone de drop + champ de recherche). Glisser un `DraggableMemberChip` dessus → badge "🎙️ Modérateur : <pseudo>" apparaît, la personne disparaît de son ancienne table si elle était ailleurs. Taper un nom existant → "➕ Ajouter" → même vérification. Taper un nom inexistant → message d'erreur, aucun appel réseau raté silencieusement.
  3. Cliquer "Retirer" à côté d'un modérateur assis → il redevient participant ordinaire de la même table (le contrôle ⏳ réapparaît).
  4. Nouveau participant, onglet 🎙️ Modérateur de l'accueil, séance `allocating` avec ≥ 1 table en attente → vérifier l'assise directe sans intervention superadmin (Realtime ou polling 5s dans `AllocatingScreen`).
  5. Même test que 4 mais séance en `debating` → vérifier aussi que le join direct par numéro de table (`JoinTableForm`/`SessionRouterScreen`, statut `debating_no_member`) fonctionne toujours.

  **Hypothèse non tranchée avec Jules** : quand plusieurs tables attendent un modérateur, l'auto-attachement choisit toujours la première dans l'ordre des numéros — comportement arbitraire assumé, à confirmer si un autre ordre était attendu.

- [ ] **Chantier 37 — Point 1 : bouton "Répartir en tables" retiré (phase voting)**
  Mergé sur `main` (`cf7083d`), aucune migration.

  **Test minimal** : séance en phase `voting`, superadmin → vérifier l'absence du bouton "Répartir en tables". Avec le toggle "Fusionner auto en fin de vote" (`ai_auto_merge_<id>`) activé, faire passer la séance en `allocating` → vérifier que la fusion IA s'est bien déclenchée (log `LLMModerationPanel`), puisque c'est désormais ce passage de phase qui la déclenche (au lieu du bouton supprimé).

- [ ] **Chantier 37 — Point 2 : bug de réassignation modérateur (onglet Membres)**
  Mergé sur `main` (`cf7083d`). Migration `supabase/migrations/20260803_chantier37_set_member_moderator_seat.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`set_member_moderator` confirmée contenir la logique de placement) — seul le test manuel ci-dessous reste à faire.

  **Test minimal** : séance avec ≥ 2 tables animées, une avec modérateur déjà assis, une sans. Onglet Membres → cocher "modérateur" sur quelqu'un assis à la table déjà pourvue → vérifier dans l'onglet Tables qu'il apparaît maintenant assis (déplacé) sur la table sans modérateur.

- [ ] **Chantier 36 — Point 1 : modérateur affiché en double (onglet 🪑 Tables)**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Test minimal** (mot de passe superadmin requis) : séance `allocating`/`debating` avec une table animée dont le modérateur est déjà assis → vérifier l'absence de doublon (badge "🎙️ Modérateur : X" seul, plus jamais aussi en puce glissable ordinaire dans la liste des membres en dessous). Cas modérateur en surplus (assis ailleurs comme participant ordinaire, chantier 25b) → vérifier qu'il n'apparaît que dans son propre badge, jamais en puce.

  → Bon moment pour vérifier **en même temps** le chantier 33 ci-dessus (même onglet Tables).

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet superadmin)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas — nécessite deux onglets/navigateurs en parallèle, regroupée à part pour ne pas la faire deux fois.

- [ ] **2026-09-01 — Chantier 39 — renommage "Phase 0" + suppression de la phase `questionnaire`** — `SuperadminScreen.tsx` (`PHASE_LABEL`, `PHASE_SEQUENCE_LABELS`, `PhaseBar`, `handlePhaseChange`) *(migration SQL requise, voir ci-dessus — mais le comportement décrit ici ne dépend pas de son application, seule la définition de `sessions_phase_check`/`set_session_phase` en base en dépend)*

  **Livré (3 points)** :
  1. Le badge de phase et le `PhaseBar` de la fiche séance affichent **"Phase 0"** au lieu de "Brouillon" pour la phase `draft`.
  2. Numérotation des cercles du `PhaseBar` alignée sur la nomenclature participant (voir section dédiée CLAUDE.md « Nomenclature des phases côté participant ») : `draft`=0, `pre_voting`=1, `voting`=2, `allocating`=3, `debating`=4, `closed`=5 — au lieu de 1..6 précédemment (`{i}` au lieu de `{i + 1}`).
  3. La phase `questionnaire` a disparu du `PhaseBar` (6 cercles au lieu de 7) et de `PHASE_SEQUENCE`. Le passage manuel `debating → closed` déclenche désormais automatiquement `force_session_questionnaire` (avant : nécessitait de cliquer "Passer en Questionnaire" comme étape intermédiaire). Le bouton "Forcer questionnaire" manuel de l'accordéon "Actions post-séance" reste inchangé et disponible à tout moment (chantier 45), indépendamment de ce déclenchement automatique.

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test` — 94 tests, tous OK ; aucune régression sur `allocation.ts`, non modifié). Session sans mot de passe superadmin — **le rendu réel du `PhaseBar` et le déclenchement de `handlePhaseChange` n'ont pas pu être exercés en navigateur.**

  **Test minimal** (mot de passe superadmin requis) :
  1. Ouvrir une séance en `draft` → vérifier le badge "Phase 0" (liste des séances ET fiche séance) et le cercle "0" (pas "1") dans le `PhaseBar`.
  2. Dérouler les phases une par une → vérifier la numérotation 0,1,2,3,4,5 sur les 6 cercles (pas de 7ᵉ cercle "Questionnaire").
  3. Séance en `debating` avec ≥ 1 participant connecté à une table de la séance → cliquer "Passer en Clôturée" → vérifier dans les secondes qui suivent que le modal questionnaire s'ouvre chez ce participant (`ParticipantView`, `table.questionnaire_forced_at` mis à jour) **sans** être passé par une phase intermédiaire — et que le bouton manuel "Forcer questionnaire"/"Annuler forçage" de l'accordéon "Actions post-séance" reflète bien l'état forcé (`isQForced=true`).
  4. Vérifier qu'aucun bouton "Passer en Questionnaire" n'apparaît plus nulle part dans le `PhaseBar`.

- [ ] **2026-09-02 — Chantier 57 — quota et plafond de charge utile sur `gemini-proxy`** — `supabase/functions/gemini-proxy/index.ts`, `src/lib/gemini.ts` *(déploiement de l'Edge Function requis, voir ci-dessous — le test complet n'est possible qu'une fois déployée)*

  **Le problème corrigé** : `gemini-proxy` ne vérifiait qu'un JWT Supabase valide (n'importe quel utilisateur anonyme, y compris un porteur direct de la clé anon publique du bundle JS, sans jamais passer par le mot de passe superadmin) avant de relayer vers l'API Gemini payante — ni limite de fréquence d'appel, ni limite de taille de charge utile. Un tiers pouvait épuiser le quota Gemini du projet ou faire monter la facture sans connaître aucun secret.

  **Livré (2 points, dans la fonction elle-même — aucune migration SQL)** :
  1. **Quota par utilisateur** : 20 appels par fenêtre glissante de 60 secondes, par `user_id` (compteur **en mémoire**, pas de table Postgres — voir justification en commentaire en tête du fichier, section "Anti-abus (chantier 57)"). Au-delà : réponse `429` avec `{ error, retryAfterSeconds }` et en-tête `Retry-After`.
  2. **Plafond de taille de la charge utile** : 300 Ko (vérifié sur l'en-tête `Content-Length` en rejet rapide, puis re-vérifié sur la taille réellement lue). Au-delà : réponse `413` avec message clair.
  3. **Refus explicites côté client** : `src/lib/gemini.ts` extrayait déjà `data?.error`, mais pour une réponse non-2xx (ce que sont justement 429/413), `supabase.functions.invoke` lève une `FunctionsHttpError` dont `.message` est un texte générique ("Edge Function returned a non-2xx status code") — le message clair est dans le corps JSON de la réponse HTTP d'origine (`error.context`, un `Response`), pas automatiquement lu. Ajout d'`extractGeminiError()` qui lit ce corps quand l'erreur est une `FunctionsHttpError`. Les 4 fonctions exportées (`moderateAssertions`, `mergeAssertions`, `nameIdeologicalGroups`, `nameSingleGroup`) l'utilisent désormais au lieu de `extractErr(error)` seul.

  **Où ce message ressort à l'écran** : les actions manuelles superadmin ("Modérer maintenant", "Analyser les doublons" dans `LLMModerationPanel`) affichent déjà `e.message` via `showMsg` dans leurs blocs `catch` existants — aucune modification de ces panneaux n'a été nécessaire, le message clair remonte automatiquement une fois `gemini.ts` corrigé. Les ticks `setInterval` d'auto-modération/auto-fusion et le nommage automatique des camps restent **silencieux** en cas d'erreur (comportement préexistant, "erreurs loggées dans la console uniquement" / "les camps restent sans nom") — un utilisateur qui déclencherait la limite uniquement via ces automatismes ne verrait rien à l'écran, seulement dans la console ; jugé acceptable car ces automatismes sont, par calibrage (voir commentaire dans le fichier), très loin sous la limite de 20/min en usage normal.

  **Calibrage de la limite (raisonnement complet dans le commentaire en tête de fichier)** : seul le superadmin appelle cette fonction en pratique (aucun écran participant n'importe `lib/gemini.ts`). Pire cas légitime théorique avec toutes les automatisations réglées sur leur intervalle le plus agressif (modération auto 1 min, fusion auto périodique 1 min, nommage jusqu'à 5 groupes × 2 tentatives à chaque analyse) : ≈ 12 appels/minute depuis un même onglet. Limite retenue : 20/min, marge confortable au-dessus de ce pire cas, tout en bornant fermement un script qui viserait la fonction en boucle.

  **Pourquoi un compteur en mémoire plutôt qu'une table Postgres** : projet à échelle très réduite (~3 personnes, séances ponctuelles, cf. `CLAUDE.md`). Une table ajouterait une écriture par appel Gemini et une migration pour un gain marginal ici — le compteur mémoire suffit à bloquer en pratique un script qui bombarderait la fonction en boucle depuis un même onglet, au prix d'un reset à chaque cold start Deno Deploy et d'un compteur non partagé si plusieurs instances tournent en parallèle (accepté explicitement, voir commentaire dans le fichier). À revoir si le projet grandit.

  **Déjà vérifié** : `npx tsc --noEmit`, `npm test` (94 tests, tous passants), `npm run build` — tous OK. Code de la fonction relu intégralement (pas d'accès Deno CLI dans cette session pour un vrai type-check du runtime Deno, mais le fichier ne touche à rien de spécifique à Deno au-delà de `Deno.serve`/`Deno.env`, déjà présents avant ce chantier). **Rien de tout cela n'a pu être exercé en conditions réelles** : pas de déploiement effectué (interdit par la consigne de ce chantier), donc aucun appel HTTP réel à la fonction modifiée.

  **⚠️ Déploiement requis avant tout test réel** — commande exacte (depuis la racine du projet, après avoir mergé cette branche ou dans son worktree) :
  ```
  npx supabase functions deploy gemini-proxy
  ```
  (nécessite d'être lié au projet Supabase — `npx supabase link` si pas déjà fait — et les secrets `GEMINI_API_KEY` déjà configurés côté Supabase, inchangés par ce chantier.)

  **Test minimal (après déploiement, mot de passe superadmin requis)** :
  1. **Usage nominal** : ouvrir `LLMModerationPanel` sur une séance en `voting`/`pre_voting` avec des assertions `pending`/`approved`, cliquer "Modérer maintenant" puis "Analyser les doublons" à quelques secondes d'intervalle (moins de 10 appels en tout) → doit fonctionner normalement, sans jamais voir de message de quota. Vérifier aussi `AnalysisPanel` : lancer une analyse manuelle une ou deux fois → nommage des camps fonctionne normalement.
  2. **Comportement à la limite** : dans la console DevTools du superadmin, exécuter 21 fois de suite (boucle `for`) un appel direct à `supabase.functions.invoke('gemini-proxy', { body: { action: 'moderate', payload: { session_title: 't', session_description: null, assertions: [] } } })` → les 20 premiers appels doivent renvoyer une réponse (succès ou erreur Gemini normale), le 21ᵉ doit échouer avec un message contenant "Trop de requêtes IA" et un nombre de secondes à attendre. Reproduire ensuite la même chose via un vrai bouton de l'UI (ex. spammer "Modérer maintenant") : le message affiché dans `LLMModerationPanel` (zone `showMsg` en rouge) doit être ce même texte clair, pas "Edge Function returned a non-2xx status code".
  3. **Refus d'une charge utile surdimensionnée** : depuis la console DevTools, appeler `supabase.functions.invoke('gemini-proxy', { body: { action: 'moderate', payload: { session_title: 't', session_description: null, assertions: [{ id: crypto.randomUUID(), content: 'x'.repeat(400000) }] } } })` → doit échouer immédiatement (413) avec un message contenant "trop volumineuse", sans avoir appelé Gemini (vérifiable en confirmant qu'aucune ligne n'apparaît dans le journal `ai_log_<id>`/compteur de tokens journalier pour cet appel).
  4. Vérifier qu'aucune des deux limites ne s'est déclenchée par erreur pendant le test 1 (usage nominal) une fois les tests 2 et 3 terminés — c'est-à-dire que la fenêtre de 60 s du test 2 n'a pas laissé le compteur de l'utilisateur de test dans un état qui bloquerait un usage normal ensuite (attendre 60 s après le test 2 avant de relancer un usage nominal si besoin).

- [ ] **2026-09-02 — Chantier 65 — non-régression superadmin sur une séance en brouillon** — `src/screens/SuperadminScreen.tsx` *(migration SQL requise, voir "Migration SQL en attente" ci-dessus)*

  **Pourquoi ce test** : ce chantier ferme l'accès à une séance `draft` pour tout le monde côté inscription (`register_session_member`, `confirm_attendance`) — le superadmin, lui, doit continuer à pouvoir préparer sa séance normalement, puisque tout son travail passe par des RPC à mot de passe séparées, jamais par ces deux fonctions.

  **Test** :
  1. Onglet Administration (`#superadmin`), mot de passe superadmin → créer une nouvelle séance de test (reste en `draft`).
  2. Dans sa fiche : renseigner titre/description, ajouter les URLs de documentation (`update_session_docs`), rattacher/détacher une table existante (`attach_table_to_session`/`detach_table_from_session`) → tout doit fonctionner sans message d'erreur, exactement comme avant ce chantier.
  3. Copier son `join_code` (visible dans la fiche superadmin) et l'ouvrir dans un **autre navigateur/onglet privé, non connecté superadmin** sur `#session/<join_code>` puis sur `#vote/<join_code>` → les deux doivent afficher le message "Séance pas encore ouverte" (voir scénario Participant ci-dessous), pas une erreur, pas un formulaire d'inscription.
  4. Toujours côté superadmin : faire passer la séance en `pre_voting` (ou directement `voting`) via le bouton de phase → la fiche doit continuer de fonctionner normalement, et l'onglet ouvert à l'étape 3, une fois rechargé, doit désormais montrer le formulaire d'inscription normal (plus le message "pas encore ouverte").
  5. Vérifier que la séance de test n'apparaît dans aucune liste publique **pendant qu'elle est encore en `draft`** : accueil onglet "Créer" (ne doit plus la lister), accueil "Séances en cours" (ne l'a jamais listée), accueil "Anciennes séances" (phase `closed` uniquement, non concerné ici).

## Parcours Participant

- [ ] **2026-09-02 — Chantier 65 — visiteur ouvrant le lien d'une séance en brouillon** — `src/screens/SessionRouterScreen.tsx`, `src/screens/VoteScreen.tsx` *(migration SQL requise, voir "Migration SQL en attente" ci-dessus — sans elle, le message s'affiche déjà côté frontend mais l'inscription resterait possible en tentant quand même le formulaire par un autre chemin)*

  **Contexte** : avant ce chantier, une séance `draft` (dont le `join_code` existe dès sa création) redirigeait silencieusement vers le formulaire d'inscription normal — n'importe qui avec le lien pouvait s'inscrire et voter avant l'ouverture. Deux points d'entrée à tester séparément, ils ne partagent pas de code.

  **Test 1 — via `#session/<join_code>`** (le lien réellement partagé, cf. QR code / lien WhatsApp) :
  1. Superadmin : créer une séance de test (reste en `draft`), noter son `join_code`.
  2. Dans un autre navigateur/onglet privé (pas de session superadmin) : ouvrir `https://.../#session/<join_code>`.
  3. Attendu : écran "🔒 Séance pas encore ouverte" avec un message invitant à revenir plus tard, **pas** de redirection vers un formulaire d'inscription, **pas** d'erreur JS en console. Bouton "← Retour à l'accueil" fonctionnel.

  **Test 2 — via `#vote/<join_code>` directement** (lien bookmarké, ou tapé à la main) :
  1. Même séance de test, même onglet privé : ouvrir directement `https://.../#vote/<join_code>` (en contournant le routeur).
  2. Attendu : même écran "🔒 Séance pas encore ouverte" (variante locale à `VoteScreen`), pas le formulaire de pseudo.
  3. Essayer de soumettre malgré tout une inscription (console DevTools : `supabase.rpc('register_session_member', { p_session_id: '<id>', p_pseudo: 'Test' })`) → doit échouer avec le message de phase, **une fois la migration SQL appliquée** (sans elle, ce test échoue — l'inscription réussirait encore, c'est le point qui prouve que le blocage frontend seul ne suffit pas).

  **Test 3 — l'onglet « Créer » ne propose plus la séance** : depuis l'accueil (sans mot de passe), onglet "Créer", menu déroulant des séances → la séance de test en `draft` ne doit **pas** apparaître dans la liste (avant ce chantier, elle y figurait avec son titre et son `join_code`, visible à quiconque ouvre cet onglet).

  **Une fois les 3 tests validés** : faire passer la séance de test en `pre_voting` côté superadmin, recharger les mêmes deux liens (`#session/` et `#vote/`) → le formulaire d'inscription normal doit apparaître, comme avant ce chantier.

- [ ] **2026-09-02 — Chantier 67 (point 2) — code de rappel pour un modérateur qui se déclare en pré-vote** — `src/screens/EntryScreen.tsx`, `src/components/voting/ReclaimCodeDisplay.tsx` *(migration `20260902_chantier67_claim_moderator_prevoting.sql` requise — voir « Migration SQL en attente » plus haut)*

  **Aucune vérification navigateur faite** (session headless). `tsc`/`test`/`build` verts.

  **Test minimal** (après application de la migration) :
  1. Séance en phase `pre_voting`, avec un `join_code`. Depuis un profil navigateur neuf, aller sur l'accueil (`EntryScreen`), onglet « 🎙️ Modérateur ».
  2. Sélectionner la séance, saisir un nom **jamais utilisé** sur cette séance, le Code Ecclesia → « Rejoindre en tant que modérateur ».
  3. Observer : l'écran « Note ton code de rappel » (🔑) s'affiche — pseudo + code à 4 chiffres — **avant** la redirection vers le vote (nouveau comportement ; avant ce chantier, aucun code n'était jamais affiché pour ce parcours).
  4. Cliquer « Continuer vers le vote → » → arrivée directe sur l'écran de vote (pas d'onboarding — la pré-vote n'en a pas).
  5. Superadmin, onglet Membres : vérifier que ce membre a `attending_in_person = false` et `is_moderator = true`.
  6. **Non-régression — phases `voting`/`allocating`/`debating`** : refaire le même parcours sur une séance dans une de ces phases → observer qu'**aucun** écran de code de rappel ne s'affiche (redirection immédiate comme avant), et que le membre créé a bien `attending_in_person = true`.
  7. **Non-régression — déjà inscrit** : sur un profil déjà membre de la séance en `pre_voting` (a déjà voté), utiliser le même onglet « 🎙️ Modérateur » → observer une redirection immédiate (pas d'écran de code — cas (b) de la RPC, comportement inchangé) et `is_moderator` passé à `true` sur le membre existant, sans toucher son `attending_in_person`/`reclaim_code` d'origine.

- [ ] **2026-09-02 — Chantier 50 — écran d'affectation et lectures participant sous les policies self-only** *(migration SQL requise, voir plus haut)*

  **Ce qui est en jeu** : les 4 lectures directes de `session_members` du frontend sont déjà filtrées `.eq('user_id', userId)` (`TableContext`, `SessionRouterScreen` ×2, `VoteScreen`) et `get_my_table_assignment` est SECURITY DEFINER — en théorie rien ne change côté participant. Ces tests servent à confirmer qu'aucune lecture n'avait été oubliée à l'inventaire. Aucun de ces fichiers n'a été modifié par ce chantier.

  **À vérifier après application de la migration** (un participant réel, séance réelle) :
  1. **Écran d'affectation** (`AllocatingScreen`, phase `allocating`) : le numéro de groupe et le code de la table s'affichent, et le bouton « Rejoindre » mène bien à la bonne table. C'est le point le plus exposé — il dépend de `get_my_table_assignment`.
  2. **Attente d'affectation** : arriver sur l'écran d'affectation **avant** que le superadmin ait lancé l'allocation, puis le laisser la lancer → l'affectation doit apparaître seule en ≤ 10 s (Realtime sur sa propre ligne, ou polling de secours), sans reload.
  3. **Vote** (`VoteScreen`, `pre_voting` et `voting`) : un participant déjà inscrit qui revient sur `#vote/<code>` est bien reconnu (pas de nouvelle demande de pseudo).
  4. **Reconquête d'un pseudo déjà pris** (`PseudoForm` en `pre_voting`, `VotingEntryForm` en `voting`) : saisir un pseudo déjà inscrit doit toujours proposer l'écran de reconquête et le mener à bien (par le nom **et** par le code de rappel). Ces chemins passent par des RPC, ils ne devraient pas bouger — mais c'est le seul endroit où le frontend raisonne sur des inscriptions qui ne sont pas les siennes.
  5. **Routeur** (`#session/<code>`) : en `debating`, un membre inscrit est redirigé vers `#vote/`, un visiteur non inscrit voit le message « pas membre ». En `closed`, un membre non répondant voit le questionnaire, un membre répondant voit la carte des résultats, un visiteur voit les résultats publics. C'est le test qui prouve que `SessionRouterScreen` distingue toujours membre et non-membre.
  6. **Entrée en débat** : rejoindre la table depuis l'écran d'affectation → `ParticipantView` s'affiche sans reload, avec le bon compte de présents.
- [ ] **Chantier 36 — Point 2 : case "Je suis modérateur" sur l'écran "Débat en cours"**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : écran "Débat en cours" (accessible via "Séances en cours" → "Rejoindre →" sur une séance `debating`) : cocher "Je suis modérateur de cette table" révèle un champ "Code Ecclesia" ; la soumission doit amener en `ModeratorView` (pas `ParticipantView`) sur la table dont le code a été saisi.

  **Hypothèse non tranchée avec Jules** : ce point réutilise `reclaim_moderator` (rejoint *la table dont le code a été saisi*) plutôt que `claim_moderator_status` (auto-assise sur la première table animée en attente, chantier 33). Si le comportement attendu était plutôt ce second mécanisme, c'est un choix différent à trancher.

  **Test minimal** : "Séances en cours" → "Rejoindre →" sur une séance `debating`, compte n'ayant jamais rejoint cette séance → cocher la case, code de table réel + Code Ecclesia réel → vérifier l'arrivée en `ModeratorView`.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet participant)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

- [ ] **2026-09-02 — Chantier 47 — déclaration modérateur "à l'heure" + créer une table depuis le vote** ⚠️ **UI confirmée par une session Claude Code le 2026-09-06, fonctionnel non testé (Code Ecclesia requis)** — nouveau `src/components/voting/ModeratorAccessPanel.tsx`, branché dans `src/screens/VoteScreen.tsx` (header, étape `vote`)

  **Vérifié** : bouton "🎙️ Je suis modérateur" présent dans le header de `VoteScreen` en phase `voting` (et donc probablement `pre_voting`/`allocating`, même condition), ouvre la modale "Se déclarer modérateur" avec un unique champ "Code Ecclesia" — conforme à la spec. **Non testé** : la soumission réelle (nécessite le Code Ecclesia) et le volet "Créer une table" qui apparaît ensuite.

  **Contexte / retour de Jules** : depuis "Séances en cours" → clic sur une séance, on arrive dans `VoteScreen`. Le bouton pour se déclarer modérateur "en retard" (séance déjà en `debating`, via `JoinTableForm`/`reclaim_moderator`, écran "Débat en cours") existait déjà. Manquait le cas "à l'heure" : se déclarer modérateur pendant `pre_voting`, `voting` ou `allocating` — ces trois phases correspondent toutes à l'étape `vote` de `VoteScreen` (seule `debating` bascule vers un autre écran). Une fois modérateur, accès à un bouton "Créer une table" dans la séance.

  **Ce qui a été fait** (2 volets, aucune nouvelle RPC — réutilise l'existant à l'identique) :
  1. **Se déclarer modérateur** : bouton "🎙️ Je suis modérateur" à côté du pseudo, visible tant que `member.is_moderator` est faux. Ouvre une modale avec un seul champ "Code Ecclesia" → appelle `claimModeratorStatus(session.id, password, member.pseudo)` (`lib/voting.ts`, déjà utilisée par l'onglet 🎙️ Modérateur de l'accueil pour le même mot de passe et la même RPC `claim_moderator_status`). Succès → `member` mis à jour localement (`setMember`), le badge existant "🎙️ Vous êtes modérateur" apparaît.
  2. **Créer une table** : une fois `member.is_moderator` vrai, le bouton devient "➕ Créer une table". Ouvre une modale (pseudo préempli + Code Ecclesia) → appelle directement `supabase.rpc('create_table', { p_pseudo, p_creation_code, p_session_id: session.id, p_leaderless: false })` (même RPC que l'onglet "Créer" de l'accueil, sans repasser par un écran de sélection de séance puisqu'elle est déjà connue). Succès → `tableStore.set(...)` + `onTableJoined(tableId, participantId, true)`, navigation directe vers `ModeratorView` sur la nouvelle table (même pattern que `JoinTableForm` plus bas dans ce fichier).

  **Mot de passe** : un seul, le Code Ecclesia (`app_config.creation_code_hash`) — le même que partout ailleurs dans l'app (création de table, reprise de modération, onglet Modérateur de l'accueil). Aucun mot de passe en dur, aucun second mécanisme introduit.

  **Aucune migration SQL** : `claim_moderator_status(p_session_id, p_creation_code, p_pseudo)` et `create_table(p_pseudo, p_creation_code, p_session_id, p_leaderless)` existent déjà en base avec exactement cette signature — confirmé par appel direct des deux RPC via `fetch` (mot de passe volontairement faux, aucune donnée modifiée) : les deux renvoient l'erreur serveur attendue (`"Code Ecclesia invalide"` / `"Code de création invalide"`) plutôt qu'une erreur de paramètre inconnu, ce qui valide que les noms de paramètres utilisés côté client correspondent au déployé.

  **Déjà vérifié** : `tsc -b` et `npm run build` propres (aucune erreur TS). Aucune régression constatée sur le chemin "en retard" existant (`JoinTableForm` sur une séance `debating` réelle, zéro erreur console). Sondage réseau direct des deux RPC avec mauvais mot de passe (ci-dessus) confirmant la forme des appels.

  **Non testé — session headless sans mot de passe modérateur, volontairement** (voir consigne de Jules) : le flux complet avec le vrai Code Ecclesia n'a pas pu être exercé. Aucune séance de test disponible en ce moment en phase `pre_voting`/`voting`/`allocating` (toutes les séances existantes sont en `draft`, `debating` ou `closed`) — impossible même de voir le nouveau bouton apparaître en conditions réelles depuis cette session.

  **Test minimal** (Code Ecclesia requis, séance en `pre_voting`, `voting` ou `allocating` avec au moins un membre inscrit) :
  1. Depuis "Séances en cours" → clic sur la séance → arrivée sur l'étape vote → vérifier la présence du bouton "🎙️ Je suis modérateur" à côté du pseudo (les 3 phases pré-vote/vote/allocation).
  2. Cliquer → saisir un mauvais mot de passe → vérifier le message d'erreur "Code Ecclesia invalide" sans planter. Saisir le vrai Code Ecclesia → la modale se ferme, le badge "🎙️ Vous êtes modérateur" apparaît, le bouton devient "➕ Créer une table".
  3. Recharger la page → vérifier que `member.is_moderator` a bien persisté (le bouton "➕ Créer une table" doit réapparaître directement, sans repasser par l'étape 2).
  4. Cliquer "➕ Créer une table" → pseudo préempli avec le sien (modifiable) + Code Ecclesia → soumettre → vérifier l'arrivée directe en `ModeratorView` sur une table neuve rattachée à la séance (visible ensuite côté superadmin, onglet Tables).
  5. Répéter le point 4 en phase `allocating` spécifiquement (voir hypothèse non tranchée ci-dessous).

  **Hypothèses non tranchées avec Jules** :
  - **Table créée toujours "avec animateur"** (`p_leaderless: false`) — pas de case à cocher "table sans modérateur" dans cette modale, contrairement à l'onglet "Créer" de l'accueil. Choix délibéré : le but exprimé était que le modérateur anime lui-même la nouvelle table ; à corriger si une option leaderless était aussi souhaitée ici.
  - **"Créer une table" reste accessible en phase `allocating`** — l'onglet "Créer" de l'accueil (`EntryScreen`) exclut délibérément cette phase de sa liste de séances proposées (probablement pour ne pas interférer avec le calcul d'allocation en cours dans `AllocationPanel`). Cette nouvelle modale ne réplique pas cette restriction : le bouton reste actif en `allocating`. Si une table créée manuellement pendant que le superadmin lance l'allocation pose problème (collision avec `apply_allocation`), il faudra masquer/désactiver le bouton pour cette phase spécifiquement.
  - **Pas de restriction de phase côté serveur** sur `claim_moderator_status` pour un membre déjà inscrit (seul le cas "créer un nouveau profil" vérifie la phase) — cohérent avec le fait que ce nouveau bouton fonctionne dans les 3 phases demandées sans qu'aucun changement SQL n'ait été nécessaire.

## Parcours Modérateur (`ModeratorView`)

- [ ] **2026-09-02 — Chantier 50 — détection d'un modérateur désigné pendant la séance** *(migration SQL requise ; à faire APRÈS la migration du chantier 60)*

  **Pourquoi ce test ici** : `TableContext` lit `session_members.is_moderator` en direct pour savoir s'il doit afficher `ModeratorView` — lecture filtrée sur `user_id`, donc a priori intacte. Mais la garde d'autorité du chantier 60 (`is_table_moderator`) lit, elle, `session_members` **et** `table_assignments` pour quelqu'un d'autre que l'appelant. Elle est `SECURITY DEFINER`, donc hors RLS et non affectée — ce test le confirme concrètement plutôt que sur lecture de code. Les deux chantiers se croisent exactement ici.

  1. Séance en `allocating`/`debating`, une table animée sans modérateur. Depuis un 2ᵉ navigateur : `#session/<code>` → « 🎙️ Modérateur » → se déclarer avec le code Ecclesia → il doit être assis à la table et **basculer sur `ModeratorView` sans reload**.
  2. Une fois en `ModeratorView` : donner la parole, retirer la parole, passer au suivant, déplacer quelqu'un dans la file, exclure un participant. **Tout doit aboutir** — c'est ce que corrige le chantier 60, et ce que ce chantier ne doit pas re-casser.
  3. Symétrique : le superadmin lui retire son statut depuis l'onglet Membres → bascule vers `ParticipantView` sans reload.
  4. **Régression** : un modérateur « classique » (table créée via « Créer une table », donc `tables.created_by` posé, et **aucune ligne `session_members`**) garde toute son autorité. C'est le cas qui ne dépend d'aucune des deux tables fermées ici.

*Nécessite un Code Ecclesia et une vraie table animée (avec modérateur) pour la plupart des points ci-dessous — pas testable avec une table `leaderless` seule.*

- [ ] **Chantier 54 — le modérateur ne peut plus supprimer sa table** *(migration SQL requise, voir ci-dessus)*

  **Déjà vérifié** : `npx tsc --noEmit` propre, `npm run build` réussi, `npm test` → 92 passés / 2 échecs / 1 skip. Les 2 échecs (`bench/strategy-sanity.test.ts`, seuils de latence à 5 s sur un calcul d'allocation à 200 personnes) sont préexistants et sans rapport avec ce chantier — le diff ne touche que `CLAUDE.md` et `src/context/TableContext.tsx`, jamais `src/lib/allocation.ts` ; probablement de la contention CPU due aux sessions en parallèle sur cette machine. Aucun test navigateur (consigne : plusieurs sessions se disputent le harnais).

  1. **Bouton absent** : ouvrir `ModeratorView` sur une vraie table animée (Code Ecclesia). Chercher un bouton "Terminer la session" / "Supprimer la table" dans tout l'écran (header, footer, "Outils Modo") → **il ne doit apparaître nulle part**. C'était déjà vrai avant ce chantier (retiré en juin 2026) — ce point confirme la non-régression.
  2. **Appel API direct bloqué** (le vrai test de ce chantier — c'est lui qui était cassé) : depuis la console DevTools du navigateur du modérateur, sur une table qu'il anime réellement :
     ```js
     const { data: { session } } = await window.supabase.auth.getSession()
     await fetch('<VITE_SUPABASE_URL>/rest/v1/tables?id=eq.<table_id>', {
       method: 'DELETE',
       headers: {
         apikey: '<VITE_SUPABASE_ANON_KEY>',
         Authorization: `Bearer ${session.access_token}`,
       },
     }).then(r => r.status)
     ```
     (adapter si `window.supabase` n'est pas exposé globalement — sinon reproduire l'appel avec `fetch` et le token de session récupéré via `localStorage`). Avant la migration : `204` et la table disparaît. Après la migration : la requête réussit toujours au niveau HTTP (RLS filtre silencieusement, comportement standard PostgREST) mais **0 ligne affectée** — recharger la page confirme que la table existe toujours, avec tous ses participants, sa file et son historique de tours intacts.
  3. **Aucun effet de bord** : après le test précédent, vérifier que la table est toujours pleinement fonctionnelle — donner la parole, retirer la parole, file d'attente — rien ne doit avoir été perturbé par la tentative de suppression avortée.



- [ ] **Chantier 60 — le modérateur désigné par l'allocation peut enfin animer sa table** — branche `chantier-60-autorite-moderateur`, **pas mergée sur `main`**. Migration `supabase/migrations/20260902_chantier60_moderator_authority.sql`, **à appliquer avant tout autre test de cette section** (voir la section « Migration SQL en attente d'application » pour le détail du contenu et les 5 requêtes SQL de vérification).

  **Aucun changement frontend** — la vue modérateur s'affiche déjà correctement pour ces personnes depuis le chantier 41 (`TableContext.isModerator = physicalModerator || sessionMemberIsModerator`). Le chantier 60 est 100 % SQL : il aligne l'autorisation serveur sur ce que l'interface montre déjà.

  **Déjà vérifié** : `npx tsc --noEmit` propre, `npm test` 94 passés / 1 skip pré-existant, `npm run build` réussi. **Aucun test navigateur** (consigne : plusieurs sessions en parallèle se disputent le harnais). **Aucune migration appliquée** par la session de chantier.

  ### Scénario central — le chemin nominal, celui qui est cassé aujourd'hui

  Prérequis : une séance allouée **automatiquement** (bouton d'allocation v2 dans `AllocationPanel`, phase `allocating`), avec au moins **2 tables animées** et **au moins 3 participants par table** — les cas négatifs ci-dessous ont besoin d'un modérateur sur chacune des deux tables. Le superadmin passe ensuite la séance en `debating`.

  1. Se connecter sur un **appareil / navigateur distinct de celui du superadmin** avec l'identité d'un participant que l'allocation a désigné modérateur (`session_members.is_moderator = true`), et rejoindre sa table depuis `AllocatingScreen`. Confirmer que `ModeratorView` s'affiche.
  2. **Donner la parole** : cliquer sur un participant (ou le glisser depuis le panneau participants) → il devient orateur, le chrono démarre. *Avant le correctif : « Not authorized ».*
  3. **Retirer la parole** : bouton de fin de tour → l'orateur est libéré. Puis, avec au moins une personne en file, vérifier l'**auto-avancement** (`end_turn_and_advance`) : la parole passe bien au suivant, priorité file interactive.
  4. **Files d'attente** : mettre un **autre** participant en file (glisser-déposer participant → file, `add_to_queue`), le **retirer** de la file (`removeFromQueue` — DELETE direct sur `queue_entries`, chemin RLS), le **réordonner** par glisser-déposer (`reorder_queue_entry`), et le **basculer** d'une file à l'autre (`changeQueueType` — DELETE direct + `add_to_queue`). Les 4 doivent aboutir, y compris ceux qui échouaient **silencieusement** avant (retrait et bascule).
  5. **Exclure un participant** : bouton « Exclure » dans `ParticipantsTable` → la ligne disparaît. *Avant le correctif : « Non autorisé ».*
  6. **Ajouter une personne sans téléphone** : « Outils Modo » → section Table → saisir un « Prénom Nom » → la personne apparaît dans la liste des participants. *Avant le correctif : « Non autorisé ».* (Nécessite aussi la migration du chantier 44.)
  7. **Corriger un tour** : « Outils Modo » → Historique → modifier l'heure de début/fin d'un tour (`correct_turn`) → la correction est bien enregistrée.
  8. **Forcer le questionnaire** puis **l'annuler** : « Outils Modo » → section Table. *Avant le correctif : échec **silencieux** — aucune erreur affichée, mais le modal n'apparaissait chez personne. Vérifier donc l'EFFET (le modal s'ouvre chez un participant de la table), pas seulement l'absence de message d'erreur.*
  9. **Supprimer la table** : à faire **en dernier**, même remarque — c'était un échec silencieux, la table restait en place. Vérifier que la table disparaît réellement et que les participants sont éjectés.

  ### Cas négatifs — indispensables : le correctif élargit qui peut animer

  Une erreur dans le helper donnerait l'autorité d'animation à des gens qui ne devraient pas l'avoir. Chacun de ces cas doit être vérifié **explicitement** ; la requête SQL n° 5 en pied de fichier de migration (« table de vérité ») permet de les couvrir toutes d'un coup, sans se connecter sous chaque identité, et devrait être exécutée **en plus** des tests d'interface ci-dessous.

  - [ ] **Participant ordinaire de la table** (ni créateur, ni `is_moderator`) → doit voir `ParticipantView`, **pas** `ModeratorView`. Aucune action d'animation possible depuis l'interface. Il conserve en revanche ses droits propres : se mettre lui-même en file, se retirer lui-même de la file, clore **son** tour d'orateur.
  - [ ] **Modérateur d'une AUTRE table de la même séance** → c'est le cas le plus important. Depuis son propre appareil, il ne doit avoir **aucune** autorité sur la table 1. Le vérifier par la requête SQL n° 5 lancée sur la table 1 : sa ligne doit ressortir `autorite_attendue = false`. *Nuance à connaître : s'il **quitte** sa table et **rejoint** physiquement la table 1, `join_table` → `sync_table_assignment` **déplace** sa ligne `table_assignments` vers la table 1, et il en devient alors légitimement modérateur. C'est cohérent avec l'interface (chantier 41 lui montre déjà `ModeratorView`) et avec le fait qu'il détient déjà le Code Ecclesia — mais si Jules veut interdire ce déplacement, le dire : c'est le comportement de `sync_table_assignment` (chantier 26) qu'il faudrait revoir, pas le helper.*
  - [ ] **Modérateur de la bonne table** → autorité complète (c'est le scénario central ci-dessus).
  - [ ] **Créateur de la table** (table créée via « Créer une table » avec le Code Ecclesia, ou reprise via « Je suis modérateur de cette table ») → **aucune régression** : tout ce qui marchait avant marche toujours. À dérouler sur une table hors séance (créée depuis l'accueil) pour confirmer que le chemin historique est intact.
  - [ ] **Utilisateur hors séance** (autre navigateur, jamais inscrit à cette séance) → ne doit rien pouvoir faire. Il ne peut de toute façon pas atteindre la table sans son `join_code` ; le vérifier plutôt côté SQL (requête n° 5 : il n'apparaît pas dans `session_members`, donc jamais `autorite_attendue = true`).

  ### Point de sémantique à trancher par Jules — modérateur en surplus sur une table `leaderless`

  Le helper ne fait **pas** d'exception pour `tables.leaderless = true`. Raison : `assign_moderator_to_table` et `set_member_moderator` posent `is_moderator = true` + une ligne `table_assignments` **sans jamais retourner `tables.leaderless`** — exclure les tables leaderless casserait donc une désignation pourtant légitime.

  Conséquence : un modérateur **en surplus** au sens du chantier 25b (l'algorithme l'a fait redevenir un participant ordinaire faute de table à animer, mais son `session_members.is_moderator` reste `true` en base — `AllocationPanel` ne retire le flag qu'aux modérateurs **décochés**, pas aux surplus) et assis à une table `leaderless` obtiendrait l'autorité d'animation sur celle-ci, ce qui contredit la règle « pour les tables leaderless, `isModerator` est toujours `false` » de `CLAUDE.md`.

  **Ce n'est pas une régression introduite par ce chantier** : depuis le chantier 41, l'interface lui affiche **déjà** `ModeratorView` sur cette table (l'`OR` de `TableContext`) ; le chantier 60 se contente de faire fonctionner les boutons qu'elle montre. Les deux corrections possibles si Jules juge le comportement indésirable : (a) faire retirer `is_moderator` aux modérateurs en surplus au moment de l'`apply_allocation`, ou (b) exclure les tables `leaderless` **à la fois** dans le helper SQL **et** dans l'`OR` du chantier 41. Ne rien changer sans arbitrage — les deux touchent des zones occupées par d'autres chantiers.

  **À vérifier au passage** : allouer une séance qui produit **au moins une table leaderless** et **plus de modérateurs que de tables animées**, puis regarder si le modérateur en surplus voit `ModeratorView` sur sa table leaderless. Si oui, arbitrer.

  **✅ Tranché par Jules le 2026-09-02** : c'est le comportement voulu — un modérateur en surplus assis sur une table leaderless obtient bien l'autorité d'animation dessus. Aucune des deux corrections (a)/(b) ci-dessus n'est à faire. Conséquence directe : la ligne de `CLAUDE.md` affirmant que « pour les tables `leaderless`, `isModerator` est toujours `false` » était **inexacte** pour ce cas précis — corrigée dans cette même session (section `isModerator`). Reste quand même à vérifier une fois en conditions réelles que le comportement observé correspond bien à cette confirmation (scénario ci-dessus), simple confirmation visuelle, plus une décision à trancher.

  **Complément chantier 64 (2026-09-02)** : ce chantier ne tranche PAS le point ci-dessus, mais réduit sa portée. `set_member_moderator`, `claim_moderator_status` et `assign_moderator_to_table` posent désormais aussi `tables.leaderless = false` quand ils affectent explicitement un modérateur à une table leaderless — donc le cas « un modérateur légitimement affecté à sa table via l'un de ces trois chemins » n'est plus dans la zone grise : la table cesse d'être leaderless en même temps, `CLAUDE.md` et l'affichage superadmin restent cohérents avec l'autorité réelle. Le cas résiduel décrit ci-dessus (modérateur en **surplus**, `is_moderator=true` resté vrai en base sans être passé par un réajustement explicite de table, assis par hasard sur une table leaderless via un chemin qui ne passe par aucune de ces trois RPC) reste entier et toujours à trancher par Jules.

  **Limitation pré-existante, non corrigée par ce chantier** : le tableau « En direct » de la liste des séances (`list_session_tables`, colonne `moderator_pseudo`, utilisé par `SuperadminScreen` dans la carte de séance repliable) dérive le pseudo du modérateur via `participants.user_id = tables.created_by` — qui ne pointe jamais vers le vrai modérateur assis pour une table issue de l'allocation (Bloc C), `created_by` y restant l'uid du superadmin (même défaut que documenté par le chantier 60 pour d'autres lectures). Une table convertie par le chantier 64 y affichera donc toujours un pseudo de modérateur vide, alors que l'onglet Groupes (source fiable, `table_assignments` × `session_members`) l'affiche correctement. Pas corrigé ici : défaut plus large que ce chantier, pré-existant pour toute table Bloc C qu'elle ait été convertie ou non.

- [ ] ~~**Chantier 43 — Fusion "Outils Modo" + suppression transcription (vue modérateur)**~~ **(doublon — voir "Branche non mergée — Chantier 43/44" plus bas)**
  Entrée initiale écrite avant la consolidation du 2026-09-01 puis avant l'élargissement au chantier 44 (2026-09-02). Conservée telle quelle par respect de la règle append-only, mais périmée — le contenu à jour (incluant le bouton "Ajouter une personne sans téléphone") est dans l'entrée consolidée ci-dessous. Ne pas la dérouler.

- [ ] **Chantier 8 (rattrapage) — Fix DnD : l'entrée déposée n'arrive plus en dernier (A2)**
  Mergé sur `main` (`e1fb31a`), aucune migration.

  **Comportement attendu** : dans `ModeratorView` (files d'attente longue/interactive), glisser une entrée sur une ligne précise doit la déposer à cette position exacte — pas systématiquement en dernier.

  **Test minimal** (table animée réelle, Code Ecclesia requis) : avec plusieurs entrées dans une file, glisser une entrée (depuis le panneau participants ou une autre position) directement sur une ligne précise → vérifier qu'elle atterrit à la position visée.

- [ ] **Branche non mergée — Chantier 43/44 — fusion "Outils Modo" + suppression transcription + "Ajouter une personne sans téléphone" (vue modérateur)** — branche `chantier-43-outils-modo-transcription`, **pas mergée sur `main`** (en attente de la vérification manuelle ci-dessous avant merge). Rebasée sur `origin/main` le 2026-09-02 (chantiers 40/42/45 inclus). **Ne contient pas** le fix `isModerator` du chantier 41 (`22078ff`, branche `chantier-41-reload-moderateur`) — pas encore mergé sur `main` au moment du rebase ; `TableContext.tsx` n'a pas été touché par ce chantier, rien à réconcilier pour l'instant, mais le prochain rebase avant merge devra le prendre en compte si chantier 41 est mergé entre-temps.

  **Chantier 43 — ce qui a été fait** : `NotesButton`, `AssertionsButton` et `QuestionnaireFab` (header de `ModeratorView`) retirés — leur contenu intégré comme entrées du menu `ModeratorToolsButton` ("Outils Modo"), organisé en 3 sections séparées par des lignes : **Camps & assertions** (Camps, Assertions votées — en premier, visible seulement si `table.session_id`), **Table** (QR code, Historique, **Ajouter une personne sans téléphone** — chantier 44, voir ci-dessous, Forçage questionnaire), **Personnel** (Mes notes, Questionnaire post-débat). Seul le bouton Documentation reste séparé dans le header. Le bouton et le code de transcription *live* (`useTranscription.ts`, backend WebSocket, déjà signalé mort dans `CLAUDE.md` depuis le 2026-06-30) sont supprimés — le sous-projet `transcription-debat/` (pipeline offline) n'est pas touché.

  **Chantier 44 — ce qui a été fait** : nouveau bouton **"Ajouter une personne sans téléphone"** dans la section **Table** (placé juste après "QR code de la table") — ouvre un formulaire "Prénom Nom", appelle la nouvelle RPC `add_offline_participant(p_table_id, p_pseudo)` *(migration SQL non appliquée, voir section dédiée plus bas)*. La personne créée apparaît dans `participants` comme n'importe qui (Realtime déjà abonné, aucun changement côté `TableContext`) — le modérateur lui donne/retire la parole avec les outils existants (glisser-déposer, "Exclure" dans `ParticipantsTable`), rien de nouveau à ce niveau.

  **Pourquoi une nouvelle RPC plutôt que réutiliser `join_table`** : `join_table` appelle aussi `sync_table_assignment(session_id, table_id, auth.uid(), pseudo)`, qui opère par **user_id**, pas par pseudo. Appelé sous l'identité du modérateur (c'est son appareil qui insère la ligne), ce mécanisme chercherait/créerait la ligne `session_members` du **modérateur lui-même** — pour un modérateur "classique" jamais inscrit au vote de cette séance (cas déjà documenté dans ce fichier, section chantier 35), ça insère une ligne `session_members` fantôme portant le user_id du modérateur mais le pseudo de la personne ajoutée, avec `attending_in_person=true` en trop (fausse les stats `get_session_voting_stats`). `add_offline_participant` reprend uniquement le cœur de `join_table` (`INSERT INTO participants ... ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id`, donc **exactement le même mécanisme de collision** — si quelqu'un rejoint plus tard avec le même nom, il reprend la main sur cette ligne, comme une reconnexion depuis un autre appareil) sans jamais toucher `session_members`/`table_assignments`/`entry_responses`.

  **Deux hypothèses posées, non tranchées explicitement par Jules** :
  1. **Comptage votes/allocation** : cette personne ne compte **jamais** dans les votes ni dans l'allocation. Ce n'est pas un choix arbitraire — `ModeratorToolsButton` n'existe que dans `ModeratorView`, qui n'existe qu'en phase `debating`, c'est-à-dire **après** que vote et allocation aient déjà eu lieu. Il n'y a structurellement rien à recompter. C'est aussi cohérent avec le fait que `add_offline_participant` n'écrit que dans `participants` — pas de ligne `session_members`/`entry_responses` créée, donc rien qui pourrait entrer dans une analyse ou un futur clustering.
  2. **Persistance** : la ligne créée persiste en base normalement, exactement comme n'importe quel participant (même table `participants`, même CASCADE si la table de débat est supprimée, exclusion via `kick_participant` comme tout le monde). Pas de statut "éphémère"/session-only : ce concept n'existe nulle part ailleurs dans le schéma (`speaking_turns`, `queue_entries` persistent aussi), l'inventer pour ce seul cas aurait été une incohérence, pas une simplification.

  Si l'une de ces deux hypothèses ne convient pas à Jules, la RPC `add_offline_participant` est le seul endroit à modifier (elle est volontairement isolée, ne réutilise pas `join_table`).

  **Déjà vérifié** : `tsc --noEmit` propre (94 tests passés, 1 skip pré-existant, aucune régression), `npm run build` réussi, app rechargée dans le Browser pane sans erreur console après le rebase et l'ajout du bouton (EntryScreen, listing des séances). **Aucun test en conditions réelles sur `ModeratorView`/`ModeratorToolsButton`** — session headless sans Code Ecclesia ni mot de passe superadmin (volontaire, cf. consigne de Jules).

  **Test minimal** (Code Ecclesia + vraie table animée avec modérateur requis — couvre les deux chantiers en une passe) :
  1. **Migration SQL appliquée au préalable** (voir section dédiée ci-dessous) — sinon le bouton "Ajouter une personne sans téléphone" échoue à l'appel RPC (fonction inexistante).
  2. Rejoindre une table de débat en tant que modérateur → ouvrir "Outils Modo" → confirmer les 3 sections dans l'ordre (Camps & assertions en premier, Table, Personnel), séparées par des lignes.
  3. Section Table : cliquer "Ajouter une personne sans téléphone" → saisir "Prénom Nom" → "Ajouter" → modal se ferme, la personne apparaît dans la liste des participants (`ParticipantsTable`/sidebar) sans reload. Lui donner la parole (glisser dans une file, ou clic direct) → vérifier que ça fonctionne comme pour un participant normal. La retirer via "Exclure".
  4. **Collision** : ajouter à nouveau une personne avec le **même** "Prénom Nom" qu'un participant déjà présent (ajouté par ce bouton ou ayant rejoint normalement) → vérifier qu'aucune erreur ne bloque, et que ça se comporte comme une reconnexion (même ligne participant, pas de doublon dans la liste).
  5. Confirmer que tous les autres items s'ouvrent sans erreur console (Camps, Assertions votées, QR code, Historique, Forcer/Annuler questionnaire, Mes notes, Questionnaire post-débat) et qu'aucun bouton/mention "Transcription" ne subsiste.
  6. Cas sans séance rattachée (table créée hors séance) : confirmer que la section "Camps & assertions" est bien absente (conditionnée à `table.session_id`) et qu'il n'y a pas de ligne de séparation orpheline. Le bouton "Ajouter une personne sans téléphone" doit lui rester visible (section Table, indépendante de `session_id`).
  7. Si un avis tranche différemment les deux hypothèses ci-dessus (comptage votes/allocation, persistance) : le signaler, `add_offline_participant` est isolée pour être facile à ajuster.

  **Reste identifié mais volontairement non touché** : `src/hooks/useTranscription.ts` supprimé (mort après retrait de son unique appelant), mais `src/components/voting/OnboardingForm.tsx:158` mentionne encore la transcription dans un texte de consentement participant (anonymisation du pipeline offline, sans lien avec le hook supprimé) — non modifié, hors périmètre.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet ModeratorView/ParticipantView)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

## Questionnaire post-débat

- [ ] **2026-09-01 — Chantier 45 — retrait "à quel débat" + note globale obligatoire en 1ʳᵉ position** — `QuestionnaireModal.tsx` (table), `SessionQuestionnaireForm.tsx` (séance sans table)

  Aucune migration (changement frontend uniquement — `debate_attended` reste en base pour l'historique mais n'est plus jamais renseigné par le frontend).

  **Comportement attendu** : questionnaire post-débat sans la question "à quel débat viens-tu de participer ?" ; la question de note globale (0-5) est en première position et bloque l'envoi tant qu'elle n'est pas remplie (sauf si déjà enregistrée avant ce changement — verrouillée comme les autres champs) ; la question de retour libre est en deuxième position.

  **Déjà vérifié** (via `ParticipantToolsButton` → Outils → Questionnaire post-débat, table `leaderless` de la séance de test) : ordre des questions conforme, absence de la question "à quel débat", clic "Envoyer" sans note → message d'erreur bloquant sans appel réseau, note sélectionnée puis "Envoyer" → succès, réponse relue verrouillée (rating=4 disabled) confirmant la persistance en base. Zéro erreur console.

  **Reste à vérifier — les deux autres points d'entrée, jamais exercés en navigateur** :
  1. `QuestionnaireBtn` dans le header de `ModeratorView` (bouton "Outils Modo" → Questionnaire post-débat, ou l'ancien `QuestionnaireFab` si le chantier 43 n'est pas encore mergé) — nécessite une table **animée** avec Code Ecclesia réel, jamais testé (une table `leaderless` ne donne accès qu'à `ParticipantView`).
  2. `SessionQuestionnaireForm` — formulaire rattaché à la séance sans table, utilisé dans `AllocatingScreen`/`VoteScreen` — modifié à l'identique du point ci-dessus mais jamais exercé en navigateur.

  **Test minimal** : dérouler le même parcours que "Déjà vérifié" ci-dessus, une fois depuis `ModeratorView` (table animée, Code Ecclesia) et une fois depuis `SessionQuestionnaireForm` — **note chantier 39 ci-dessous : ses points d'entrée ont changé, ce n'est plus `allocating`/`voting`**.

## Synchronisation temps réel (chantier 35)

*Nécessite deux onglets ou deux navigateurs en parallèle sur la même séance/table — ne peut pas se tester avec un seul client.*

- [ ] **2026-09-02 — Chantier 50 — Realtime ne livre plus que ses propres lignes** *(migration SQL requise, voir plus haut)*

  **Ce qui change** : les abonnements Realtime sur `session_members` et `table_assignments` sont filtrés `session_id=eq.<id>`, c'est-à-dire à l'échelle de la séance entière, et les handlers rejettent ensuite côté client ce qui ne les concerne pas (`TableContext` : `if (r.user_id !== userId) return` ; `AllocatingScreen` : `if (row.member_id !== member.id) return`). Ces lignes transitaient donc jusque-là par le réseau de tous les participants avant d'être jetées — `reclaim_code` compris, puisque `session_members` est en `REPLICA IDENTITY FULL`. Sous les policies self-only, Realtime applique la RLS **avant** livraison : elles ne partent plus. Les abonnements reçoivent moins et utilisent autant ; aucun de ces deux fichiers n'a été modifié.

  **Test (deux navigateurs, participants A et B inscrits à la même séance)** :
  1. Sur B, ouvrir la console et instrumenter la réception (ou simplement observer l'onglet Réseau, frame WebSocket). Depuis le superadmin, modifier le membre **A** (cocher/décocher `is_moderator`, le déplacer de table) → **B ne doit recevoir aucun événement**. Avant la migration, il en recevait un et le jetait en silence.
  2. Modifier ensuite le membre **B** → B doit toujours recevoir son propre événement et réagir : badge « Vous êtes modérateur » qui apparaît/disparaît en phase vote, bascule `ModeratorView`/`ParticipantView` en débat, changement de numéro de table sur l'écran d'affectation.
  3. C'est le point 2 qui compte le plus : le risque n'est pas d'en recevoir trop, c'est de ne plus rien recevoir du tout parce que la policy est trop stricte.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur**
  Mergé sur `main` (`42ccae2`). Migration `supabase/migrations/20260803_chantier35_session_members_replica_identity.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`REPLICA IDENTITY FULL` confirmé sur `session_members`) — les deux abonnements realtime `session_members` sont donc actifs, seul le test manuel ci-dessous reste à faire.

  **Comportement attendu** (3 points) :
  1. Superadmin voit en direct (sans reload) un changement de modérateur initié côté participant (auto-attachement chantier 33, `reclaim_moderator`) — section "Tables rattachées" ET onglet Tables/Groupes.
  2. Participant bascule en direct vers `ParticipantView` (sans reload) si le superadmin lui retire son statut de modérateur pendant le débat — et redevient `ModeratorView` si le statut est rendu (réversible, tant que personne d'autre n'a repris le contrôle physique de la table).
  3. Le badge "Vous êtes modérateur" (phase vote) se met à jour en direct si le superadmin décoche le statut depuis l'onglet Membres.

  **✅ Point 2 vérifié le 2026-09-06 (session Claude Code)**, sans mot de passe superadmin — en posant/retirant directement `session_members.is_moderator` (même champ que modifient `set_member_moderator`/`assign_moderator_to_table`) sur un participant physiquement assis en `debating` : bascule `ParticipantView` ↔ `ModeratorView` **instantanée dans les deux sens**, sans reload (voir détail dans l'entrée chantier 41 ci-dessus, même test). Point 3 (badge phase vote) repose sur le même mécanisme sous-jacent (`sessionMemberIsModerator`), non re-testé séparément à l'écran mais risque de régression jugé nul.

  **Reste à faire par Jules (mot de passe superadmin requis, deux onglets/navigateurs)** :
  1. **Point 1 (reclaim)** : superadmin sur "Tables rattachées" ouvert, 2ᵉ onglet fait un `reclaim_moderator` sur une table → `moderator_pseudo` doit se mettre à jour sans reload (~15s max).
  2. **Point 1 (auto-attachement)** : séance `allocating`/`debating`, table animée sans modérateur, superadmin sur l'onglet 🪑 Tables. 2ᵉ onglet : `#session/<code>` → "🎙️ Modérateur" → se déclarer modérateur → vérifier l'apparition à la table sans reload.
  3. **Point 3 (badge phase vote)** : participant avec badge "Vous êtes modérateur" visible → superadmin décoche depuis Membres → badge doit disparaître sans reload — confirmation visuelle du mécanisme déjà validé côté débat.
  4. **Régression** : un modérateur "classique" (table créée via `create_table`/`reclaim_moderator`, jamais inscrit au vote de cette séance, donc sans ligne `session_members`) doit garder son `ModeratorView` sans interruption.

- [ ] **2026-09-02 — Chantier 53 — plafonner le refetch déclenché par broadcast Realtime** — `src/context/TableContext.tsx`

  **Constat de sécurité à l'origine du chantier** : le canal Realtime `table:<id>` est ouvert (créé sans `{ config: { private: true } }`), donc n'importe quel porteur de la clé anonyme publique (présente dans le bundle JS) peut s'y abonner **et y émettre**, sans connaître aucun secret — seul le `table_id` (public) est nécessaire. Avant ce chantier, le handler `broadcast` du contexte déclenchait un `refetch()` complet (`tables`, `participants`, `queue_entries`, `speaking_turns`) sans aucun contrôle à chaque message `refresh` reçu : un attaquant qui en émet en boucle pouvait figer l'interface de tous les clients connectés à une table, sur tous les téléphones de la salle simultanément. La correction de fond (canaux privés) est un autre chantier, plus lourd — celui-ci dégrade l'attaque en simple nuisance.

  **Correctif appliqué** (uniquement le handler de réception — le helper d'émission `broadcast()` n'a pas été touché) :
  1. Debounce ~1 s (`REFRESH_DEBOUNCE_MS`) : les noms de table reçus dans la fenêtre sont accumulés dans un `Set`, un seul `refetch()` avec l'union est déclenché à l'expiration.
  2. Plafond de fréquence (`REFRESH_RATE_LIMIT_PER_SECOND = 5`) : compteur glissant sur 1 s, tout message `refresh` au-delà de 5/s est silencieusement ignoré (pas de log en boucle, pas d'exception).
  3. Timer nettoyé au démontage (`clearTimeout` + vidage du `Set` dans le `return` du `useEffect`) — pas de `setTimeout` orphelin.

  **Déjà vérifié** : `npx tsc --noEmit` propre, `npm test` (94 tests, tous verts, aucune régression), `npm run build` réussi. **Non vérifiable en session headless** : tout effet réel sur le temps réel nécessite un navigateur — recette de test ci-dessous, à jouer par Jules.

  **Risque de régression à surveiller** : latence perçue allant jusqu'à ~1 s sur l'octroi de la parole quand plusieurs actions s'enchaînent rapidement (le debounce regroupe et retarde le refetch déclenché par le broadcast — les 3 autres couches de rattrapage, mise à jour locale immédiate/polling 5s/monitoring WebSocket, ne changent pas).

  **Test minimal** (deux onglets/navigateurs sur la même table, un modérateur + un participant, ou deux participants) :
  1. Enchaîner rapidement côté modérateur : donner la parole à A → fin de tour → auto-avancement vers B → donner la parole à C manuellement. Vérifier qu'aucun écran ne se fige côté participant et que l'orateur affiché reste cohérent des deux côtés (au pire ~1 s de retard, jamais un état incohérent durable).
  2. Glisser-déposer une entrée dans la file côté modérateur → vérifier que la vue participant reflète le nouvel ordre en moins de 2 s.
  3. Exclure un participant côté modérateur → vérifier sa disparition côté participant.
  4. Couper puis rétablir le réseau d'un des deux clients (mode avion ou DevTools offline) → vérifier la resynchronisation après reconnexion (monitoring WebSocket + polling 5s, couches inchangées par ce chantier).

## Nettoyage des données de test (séances partagées)

Données factices laissées par les sessions de vérification navigateur, à nettoyer une fois les points correspondants confirmés (pas de MCP Supabase pour le faire depuis une session de chantier — voir la règle SQL ci-dessus ; à faire par la session de vérification ou par Jules directement). **Checklist unique par table** (2026-09-02, regroupée depuis les entrées individuelles précédentes — même contenu, pas de perte) :

- [ ] **Table `589D79`** (séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)") — à purger entièrement :
  - Participant **"Test Chantier40"** : table créée *leaderless* pour vérifier le chantier 40, **n'est plus leaderless** depuis le 2026-09-01 (clic "Devenir modérateur" → `designate_moderator` en navigateur réel pour vérifier le chantier 41 → table basculée `leaderless=false`, `created_by` = l'uid anonyme de la session de test). Ne pas s'étonner de la retrouver en table animée plutôt que leaderless au moment du nettoyage.
  - Participants **"TestChantier48A"** et **"TestChantier48B"** : créés pour vérifier le chantier 48. Les deux illustrent volontairement le bug visé par ce chantier — partis via "Quitter" sans jamais rejoindre une autre table, leurs lignes `participants` sont restées dans `589D79` (`leaveTable()` ne supprime jamais la ligne en base). **Garder tel quel tant que le test manuel restant du chantier 48 (bascule réelle via `switch_table`, désormais possible — la migration `switch_table` du chantier 48 reste toutefois hors du lot appliqué le 2026-09-02, à vérifier en base avant de compter dessus) n'a pas été joué** — ça sert de donnée de repro. Les deux ont aussi une ligne `session_members`/`table_assignments` dans la séance (auto-créées par `sync_table_assignment` lors du join en retard).
- [ ] **Table `6ABDC9`** (même séance partagée) — pseudo **"TestQ45"** + une réponse `questionnaire_responses` (note=4), créées pour vérifier le chantier 45.
- [ ] **Table `6296A9`** (leaderless, séance **TEST33A**) — participant **"Test Notes QA"**, créé pour vérifier le chantier 42.

## Historique / notes de session (non actionnable)

Notes de contexte conservées pour mémoire (règle append-only) mais qui ne demandent aucune action de Jules.

- **2026-08-01 — Réconciliation `main` local / `origin/main`** (préalable au merge du chantier 34) : `main` local et `origin/main` avaient divergé depuis `17c30ff` — `main` local contenait le chantier 29 jamais poussé, `origin/main` contenait 7 commits (chantier 30, B3, docs chantier 18) poussés directement sans passer par `main` local. Réconcilié dans un worktree dédié (`reconcile-main-20260801`), un seul conflit textuel sur `A_VERIFIER.md` (deux sessions ayant chacune inséré leur entrée en tête de "En attente"), résolu sans perte de contenu. `tsc`/`npm test` (90/90) OK, vérification navigateur rapide sans erreur console. Poussé en fast-forward sur `origin/main`. Tag de rollback : `pre-reconcile-main-20260801`.

- [ ] **2026-09-01** — Chantier 38 (reload/remount écran superadmin) — `src/screens/SuperadminScreen.tsx` (1 ligne), diagnostic uniquement sinon

  **Demande de Jules** : « sur l'écran superadmin, il y a un reload successif qui est très désagréable, et qui, toutes les 10 secondes ou moins, nous remmène en haut de la page ». Hypothèse de départ du chantier : un polling ou un abonnement Realtime qui remonte tout le composant au lieu de mettre à jour les données en place.

  **Investigation menée** (aucun accès au mot de passe superadmin — règle de sécurité constante de ce projet, confirmée par des dizaines d'entrées précédentes dans ce fichier — donc aucune manipulation avec un vrai secret) : lecture exhaustive de `SuperadminScreen.tsx` (4748 lignes) — seuls 3 `setInterval` existent, tous dans `SessionDetail` : `loadAssertions` (10 s), `loadMembers` (15 s), `loadStats` (15 s). Aucun ne remonte de composant : les `setState` qu'ils déclenchent (`setAssertions`, `setMembers`, `setVotingStats`) sont de simples mises à jour de props/état, aucun `key` instable trouvé sur un ancêtre commun, `AllocationPanel` a bien un `key={currentSession.id}` mais `currentSession.id` ne change jamais (vérifié : les 3 seuls `setCurrentSession` préservent `id`). Aucun `scrollTo`/`scrollIntoView`/`autoFocus` dans ce fichier ni dans `AllocationPanel.tsx`/`LLMModerationPanel.tsx`/`AnalysisPanel.tsx`/`TableDiagnosticsList.tsx`. Le seul canal Realtime de ce fichier (`table_assignments:<id>`) ne se ré-abonne que sur changement de phase, jamais sur un timer.

  **Reproduction dynamique** (technique déjà validée par une session précédente — cf. entrée E9/H10 plus haut — interception de `window.fetch` pour simuler une authentification superadmin réussie et des réponses RPC, **sans jamais saisir ni faire circuler de vrai mot de passe** ; bascule du hash `#superadmin`→`#foo`→`#superadmin` pour forcer un remount propre de `SuperadminScreen` avec le mock actif) : session factice montée avec succès dans l'onglet 🟢 En direct, en phase `voting` **et** en phase `allocating` (donc avec `AllocationPanel` affiché). Un marqueur JS posé sur `document.querySelector('main')` et un suivi de `window.scrollY` toutes les 3 s, sur ~50-80 s de test à chaque fois (compteurs d'appels confirmant que les 3 `setInterval` tournaient bien en continu, `list_assertions` et `voting_stats`/`list_members` incrémentant à leur cadence attendue) : **aucun remount détecté** (`main` jamais recréé), **`scrollY` resté rigoureusement stable** (testé à 400 px). Test répété à l'identique sur un **build de production** (`npm run build` + `vite preview`, donc sans Vite/HMR) : même résultat, zéro remount, zéro reset de scroll.

  **Hypothèse retenue faute de reproduction côté app** : le symptôme observé par Jules est très probablement un **rechargement complet déclenché par Vite HMR en mode `npm run dev`**, causé par des **sessions Claude Code concurrentes qui sauvegardent des fichiers `src/lib/*.ts`** (modules non-composants comme `lib/allocation.ts`, `lib/voting.ts`) pendant que son onglet navigateur pointe sur le **même serveur dev partagé** (`ecclesia-dev`, port 5173, dossier racine). Un module utilitaire (non-composant React) édité invalide tout le graphe de modules qui l'importe → HMR ne peut pas faire de mise à jour ciblée → rechargement complet de la page → perte du scroll. Preuve indirecte concrète : au tout début de cette session, `git status` sur le dossier racine partagé montrait déjà `src/lib/allocation.ts`, `src/lib/allocation.test.ts` et `bench/strategy-sanity.test.ts` modifiés et non commités par une autre session — cohérent avec le pattern documenté ailleurs dans ce dépôt de « plusieurs chantiers tournent en parallèle sur ce repo ». Cette hypothèse n'explique **pas** un rechargement observé sur le site déployé (GitHub Pages, sans HMR) — si le symptôme se reproduit aussi là, l'hypothèse ci-dessus est fausse et il faut rouvrir l'investigation (tester d'autres onglets — 🪑 Tables / ⚙️ Préparation — ou une séance avec beaucoup plus de données réelles, ce que cette session n'a pas pu reproduire sans le mot de passe).

  **Bug réel trouvé au passage (corrigé)** : `AnalysisPanel` recevait `sessionPhase={session.phase}` (ligne 2057) — la prop `session` est la copie **figée** reçue à l'ouverture de la fiche séance, jamais mise à jour après un changement de phase (c'est `currentSession`, mis à jour par `setCurrentSession`, qui suit la phase réelle). Conséquence : le toggle « auto-analyse » de `AnalysisPanel` (actif seulement en phase `voting`/`pre_voting`) restait activable indéfiniment si la fiche avait été ouverte pendant `voting` puis la séance passée en `allocating`/`debating` sans recharger la page. Corrigé en `sessionPhase={currentSession.phase}`. Sans rapport avec le symptôme de reload — ne change rien au scroll/remount, ne provoque aucune re-fetch supplémentaire (la prop ne contrôle qu'un `if` dans un `useEffect` déjà existant).

  **Déjà vérifié par moi** : `npx tsc -b` (exit 0). `npm run build` (production, exit 0). Reproduction Browser pane décrite ci-dessus, sur serveur dev (`chantier-38-dev`, port 5204, config ajoutée à `.claude/launch.json`) **et** sur build de production (`vite preview`, port 5210, arrêté après test). Après la correction d'`AnalysisPanel`, re-vérifié que la fiche séance factice (phase `allocating`) se remonte toujours sans erreur console (hors erreurs 400 attendues, dues au faux mot de passe non mocké pour tous les endpoints).

  **Non vérifié / reste à faire par Jules ou une session avec le mot de passe superadmin** :
  1. **Confirmer où le symptôme a été observé** : `npm run dev` local (avec ou sans autre session Claude Code active en parallèle dans le même dossier) ou site déployé GitHub Pages ? C'est la donnée manquante la plus importante pour trancher entre l'hypothèse HMR ci-dessus et un vrai bug applicatif non reproduit.
  2. Si le symptôme se reproduit **aussi en production** (ou en dev sans aucune autre session active) : retester spécifiquement les onglets 🪑 Tables et ⚙️ Préparation (non couverts par cette reproduction, qui s'est limitée à 🟢 En direct), et avec un volume de données réaliste (beaucoup d'assertions/membres), ce qu'une session sans mot de passe ne peut pas mettre en place elle-même.
  3. Parcours de clic réel sur une séance de test, avec captures d'écran/vidéo si possible du moment exact du "reload", pour confirmer s'il s'agit d'un vrai remount React (perte de tout l'état local, ex. accordéons qui se referment) ou seulement d'un reset de `scrollY` sans perte d'état (ce qui pointerait vers une cause navigateur plutôt qu'React).

  **⚠️ Hypothèse HMR infirmée par Jules (2026-09-01, 2ème passe)** : « lorsque je constate cette erreur, aucune séance Claude Code ne tournait » + « j'ai l'impression que c'est sur tous les onglets superadmin » + « ça ne clignote pas particulièrement ». Ce retour a rouvert l'investigation — **vrai bug applicatif trouvé et corrigé**, voir la nouvelle entrée en tête de la section **"Parcours Superadmin"** ci-dessous. La reproduction de cette 1ère passe (point "Reproduction dynamique" ci-dessus) n'avait rien vu car son `scrollY` de test (400px) restait **au-dessus** de la hauteur du spinner de chargement plein écran — donc jamais assez profond pour déclencher le clamp de scroll observable en usage réel (beaucoup de contenu ouvert = scroll bien plus profond que 400px). Conservé ici pour mémoire (append-only), ne plus utiliser comme diagnostic de référence.

## Validé

- [x] **Chantier 64 — `supabase/migrations/20260902_chantier64_leaderless_becomes_moderated.sql`** ✅ **appliquée (confirmée en base)** (touche `set_member_moderator`/`claim_moderator_status`/`assign_moderator_to_table`, dont les dernières définitions en date sont antérieures au 60 mais indépendantes de lui — pas de dépendance technique, seulement l'ordre déjà établi pour ce chantier de test).
- [x] **Chantier 64 (complément) — `supabase/migrations/20260902_chantier64b_leaderless_origin_and_revert.sql`** ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06** — voir « Ce qu'elle change » (redéfinit les mêmes fonctions Bloc C, plus `create_table`/`admin_create_table`/`create_tables_batch`/`apply_allocation`/`switch_table`) et **après le chantier 48** (`switch_table` doit déjà exister — cette migration la redéfinit intégralement, pas un patch incrémental).
- [x] **Chantier 60 — `supabase/migrations/20260902_chantier60_moderator_authority.sql`** ✅ **appliquée le 2026-09-02** — corrige le bloquant le plus grave du projet (un modérateur désigné par l'allocation ne peut rien faire), et modifie des fonctions/policies utilisées par tous les autres tests du parcours Modérateur. Reste à faire : le test manuel complet (section Parcours Modérateur ci-dessous) — jamais joué à l'écran.
- [x] **Chantier 50 — `supabase/migrations/20260902_chantier50_close_identity_tables.sql`** ✅ **appliquée le 2026-09-02** — corrigeait une fuite de données personnelles. Reste à faire : les tests navigateur ci-dessous (jamais joués à l'écran) — notamment la comparaison avant/après sur l'onglet 🪑 Tables et le retrait du repli `loadTableAssignmentRows` (voir entrée dédiée, section Parcours Superadmin, **désormais actionnable puisque la migration est en place**).
- [x] **Chantier 61 — `supabase/migrations/20260902_chantier61_register_during_allocating.sql`** ✅ **appliquée le 2026-09-02**. Reste à faire : les 6 scénarios de test manuel ci-dessous (jamais joués à l'écran), y compris les scénarios 1 et 4 qui ne pouvaient pas passer avant cette application.
- [x] **Chantier 65 — `supabase/migrations/20260902_chantier65_register_session_member_reject_draft.sql`** ✅ **appliquée (confirmée en base 2026-09-06) et vérifiée par une session Claude Code le 2026-09-06** — une séance en phase `draft` ne doit être accessible à personne.
- [x] **Chantier 49 — `supabase/migrations/20260902_chantier49_purge_reclaim_codes.sql`** ✅ **appliquée (confirmée en base) et vérifiée par une session Claude Code le 2026-09-06** ⚠️ était une migration destructive/irréversible
- [x] **Chantier 48 — `supabase/migrations/20260902_chantier48_switch_table.sql`** ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06**
- [x] **Chantier 39 — `supabase/migrations/20260901_chantier39_remove_questionnaire_phase.sql`** ✅ **appliquée (confirmée en base) et vérifiée par une session Claude Code le 2026-09-06**
- [x] **Chantier 44 — `supabase/migrations/20260902_chantier44_add_offline_participant.sql`** ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06**
- [x] **Chantier 51 — `supabase/migrations/20260902_chantier51_hide_assertion_author.sql`** ✅ **appliquée le 2026-09-02** — anonymat réel des auteurs d'assertions. Le point bloquant Realtime ci-dessous (fuite possible de `member_id` par WebSocket) et le reste du test manuel n'ont **toujours pas été joués à l'écran** — c'est désormais possible puisque la migration est en place.
- [x] **Ajout d'une source avec une URL valide** — `#collab/<join_code>` (`CollabDocScreen.tsx`) — ✅ vérifié le 2026-09-06 sur `#collab/65155A` : source acceptée, affichée avec lien bleu cliquable.
- [x] **Refus d'une URL à schéma non autorisé (contrôle client)** — même écran — ✅ vérifié le 2026-09-06 : `javascript:alert(1)` → message rouge, formulaire resté ouvert, aucune requête réseau émise.
- [x] **Comportement à l'affichage d'une ligne douteuse déjà en base** ✅ **vérifié par une session Claude Code le 2026-09-06** — `CollabDocScreen.tsx` et `SuperadminScreen.tsx` (onglet sources, superadmin)
- [x] **Non-régression de l'écran collaboratif après restriction de `collab_session_users`** ✅ **vérifié par une session Claude Code le 2026-09-06** — `CollabDocScreen.tsx`
- [x] **Chantier 66 — `supabase/migrations/20260903_chantier66_join_table_single_table.sql`** ✅ **appliquée (confirmée en base) et vérifiée par une session Claude Code le 2026-09-06** (`20260902_chantier48_switch_table.sql`, `20260902_chantier64b_...`, `20260902_chantier64c_...`) : elle redéfinit `switch_table` en repartant de sa dernière version, et suppose donc que `tables.leaderless_by_design` existe déjà. Indépendante du chantier 67 (point 3) juste au-dessus : les deux touchent des fonctions différentes du même fichier source d'origine sans se chevaucher (l'une `sync_table_assignment`, l'autre `join_table`/`switch_table`).
- [x] **Chantier 54 — `supabase/migrations/20260903_chantier54_remove_moderator_table_delete.sql`** ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06** — supprime purement et simplement la policy RLS `tables_delete_moderator` (posée par le chantier 60 sur `is_table_moderator`), sans la remplacer. Aucune dépendance avec les autres migrations en attente ci-dessus, applicable indépendamment.
- [x] **2026-09-04 — Chantier 70 — `supabase/migrations/20260904_chantier70_historiser_votes.sql`** ✅ **appliquée et vérifiée par une session Claude Code le 2026-09-06** — historiser les votes pour mesurer le déplacement des opinions après le débat, suite directe du point signalé par le chantier 69
- [x] **2026-09-01 — Bouton "Voir tous les débats" (accueil)** — `src/screens/EntryScreen.tsx` — ✅ présence confirmée en navigateur le 2026-09-06
- [x] **2026-09-01 — Modale "Anciennes séances" (accueil)** ✅ **vérifiée par une session Claude Code le 2026-09-06** — `src/screens/EntryScreen.tsx` (`PastSessionsModal`)
- [x] **2026-09-01 — Page de résultats publics** ✅ **vérifiée par une session Claude Code le 2026-09-06** — `src/screens/PublicResultsScreen.tsx`, routes `#results/<session_id>` et `#session/<join_code>` (phase closed, visiteur non inscrit)
- [x] **2026-09-02 — Chantier 67 (point 1) — continuer à voter à distance au lieu de mentir sur sa présence** ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/screens/VoteScreen.tsx` (`AttendanceConfirmScreen`, mode `known_user`)
- [x] **2026-09-02 — Chantier 67 (point 4) — message d'accueil aligné sur les 5 étapes de `PhaseIndicator`** ✅ **vérifié par une session Claude Code le 2026-09-06** — `src/screens/VoteScreen.tsx` (`AppIntroModal`)
- [x] **2026-09-02 — Chantier 61 — s'inscrire et voter pendant la phase `allocating`** ✅ **scénario principal vérifié par une session Claude Code le 2026-09-06 (voir chantiers 61 et 62 plus haut)** — `src/screens/VoteScreen.tsx`, migration `20260902_chantier61_register_during_allocating.sql`
- [x] **2026-09-02 — Chantier 62 — sortie de secours pour le participant inscrit sans affectation de table** ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/components/voting/TableAssignmentCard.tsx` *(pas de migration SQL — réutilise `switch_table`, chantier 48)*
- [x] **2026-09-02 — Chantier 48 — « Je veux rejoindre une autre table »** ✅ **vérifié par une session Claude Code le 2026-09-06 (voir chantier 48 en section Migration SQL)** — `src/components/voting/TableAssignmentCard.tsx`, `src/screens/AllocatingScreen.tsx`, migration `switch_table`
- [x] **2026-08-01 — Chantier 34 — carte "Votre groupe" affichée à tort pour les non-votants** ✅ **vérifié contre une vraie séance Supabase par une session Claude Code le 2026-09-06** — `src/screens/ResultsMapScreen.tsx`
- [x] **2026-09-01 — Chantier 40 — ordre des modales d'entrée en débat** ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/screens/ParticipantView.tsx`, `src/components/DebateRulesModal.tsx`
- [x] **2026-09-01 — Chantier 42 — notes participant perdues (retour de test Jules)** ✅ **vérifié par une session Claude Code le 2026-09-06** — `src/components/NotesModal.tsx`
- [x] **2026-09-01 — Chantier 39 — repère de phase participant (`PhaseIndicator`)** ✅ **entièrement vérifié par une session Claude Code le 2026-09-06** — `src/components/PhaseIndicator.tsx`, `src/lib/phaseLabels.ts`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `ParticipantView.tsx`, `ResultsMapScreen.tsx`, `SessionQuestionnaireForm.tsx`
- [x] **2026-09-02 — Incohérence de nommage entre `AppIntroModal` et `PhaseIndicator`** — **résolue** : le chantier 67 (point 4, voir plus haut) a aligné `AppIntroModal` sur les 5 étapes de `PhaseIndicator`, exactement l'option recommandée ici. Plus d'incohérence à trancher. — `src/screens/VoteScreen.tsx` (`AppIntroModal`, fonction interne l.~1288) vs `src/components/PhaseIndicator.tsx`/`src/lib/phaseLabels.ts` (chantier 39)
- [x] **2026-09-03 — Chantier 69 — écran postvote (revoter après le débat)** ✅ **vérifié en conditions réelles par une session Claude Code le 2026-09-06** — nouveau `src/screens/PostVoteScreen.tsx`, branché dans `src/screens/ResultsMapScreen.tsx` (bouton "↻ Revoter")
- [x] **2026-09-01 — Chantier 39 — déclenchement de `SessionQuestionnaireForm` déplacé de la phase `questionnaire` (supprimée) vers `closed`** ✅ **vérifié en conditions réelles par une session Claude Code le 2026-09-06** — `VoteScreen.tsx`, `AllocatingScreen.tsx`, `SessionRouterScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`)
- [x] **2026-09-02 — Chantier 63 — questionnaire masqué par l'overlay de clôture + 2 des 3 portes en cul-de-sac** ✅ **entièrement vérifié en conditions réelles par une session Claude Code le 2026-09-06** — `ParticipantView.tsx`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`)
- [x] **2026-09-01 — Chantier 41 — nomination d'un modérateur déjà assis, invisible sans quitter/rejoindre** ✅ **scénario exact de Jules vérifié par une session Claude Code le 2026-09-06** — `src/context/TableContext.tsx`, branche `chantier-41-reload-moderateur`
- [x] **2026-09-01 (validé le 2026-09-06) — Chantier 46 — `supabase/migrations/20260901_chantier46_public_results_visibility.sql`** — résultats publics opt-in par séance (`results_public`, `set_session_results_public`, `get_public_results` durci sans identifiant). Vérifié en base et navigateur (visiteur anonyme, séance `🧪 TEST46`) par une session Claude Code le 2026-09-06 : `NULL` si non-publique, payload sans identifiant si publique. **Confirmé par Jules** : bouton "Résultats publics"/"Résultats privés" du superadmin testé directement, fonctionne.
- [x] **2026-09-04 (validé le 2026-09-06) — Chantier 71 — `supabase/migrations/20260904_chantier71_onboarding_optionnel.sql`** — désactiver l'onboarding par séance

