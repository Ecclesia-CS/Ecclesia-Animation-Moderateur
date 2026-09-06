# Plan de sécurité consolidé — Ecclesia

**Date** : 2026-09-06
**Nature** : consolidation. Remplace, comme référence de travail, les quatre documents suivants — **ils ne sont pas supprimés**, ils restent l'historique de comment on en est arrivé là :
- [audit-securite-2026-08-03.md](./audit-securite-2026-08-03.md) — constat initial (2026-08-03), tests actifs contre la production.
- [audit-securite-passation.md](./audit-securite-passation.md) — passation du même jour.
- [2026-09-02-audit-securite-revue.md](./2026-09-02-audit-securite-revue.md) — revue critique un mois plus tard, introduit la nomenclature F1-F8.
- [2026-09-02-plan-action-securite.md](./2026-09-02-plan-action-securite.md) — plan de 11 chantiers (49 à 59), séquencement et arbitrages.

**Méthode** : pour chaque constat des quatre documents, vérification **contre le code actuel et la base de production actuelle** (projet Supabase `plpjiehqsxxakbuykmkm`, lecture seule via MCP — aucune écriture, aucune migration appliquée par cette session). La vérité citée ici est celle de la base **au 2026-09-06**, pas celle des fichiers de migration (un fichier de migration peut être périmé par une redéfinition postérieure — c'est exactement le piège du chantier 44/60 rencontré et documenté au chantier 74, reproduit ici comme méthode).
**Périmètre** : aucune modification de code, aucune migration. Document uniquement.
**Ce que je n'ai pas pu vérifier** : voir §7. Notamment, une requête exploratoire sur des données personnelles réelles (agrégat par `user_id`/table) a été bloquée par le classificateur de permissions de la session — sans impact sur les conclusions ci-dessous, qui reposent sur des comptages agrégés et des définitions de fonctions/policies (code, pas données personnelles individuelles).

---

## 1. Résumé exécutif

**Ce qui a changé depuis le 2026-09-02** (date de la dernière revue) : six chantiers de sécurité ont été livrés et **sont appliqués en base aujourd'hui** — 49, 50, 51, 52 (complété par 72), 53, 57, 54, C3 (corrigé en marge du chantier 60). C'est plus que ce que suggérait le ton prudent de la revue du 09-02, qui n'avait constaté aucune correction depuis l'audit. Le rapport de force a changé : **la fuite active de données personnelles (F1/B4) est fermée**, la **destruction directe de table par un modérateur est fermée** (F4), le **DoS Realtime est dégradé en nuisance** (F6 partiel), et **l'anonymat des auteurs d'assertions tient à la lecture REST** (F1/B5, avec une réserve WebSocket jamais testée).

**Ce qui n'a pas bougé, vérifié aujourd'hui** : la reprise d'identité par pseudo seul (F2/B3, chantier 55), le durcissement `search_path` + `app_config` (chantier 56), les canaux Realtime publics à la racine (chantier 59), et les sauvegardes chiffrées (aucun commit sur `main`). Ce sont exactement les quatre points que Jules a cités de mémoire — la vérification d'aujourd'hui les confirme tous les quatre, sans changement.

**Fait nouveau que ni la revue ni le plan ne connaissaient** : `sessions.results_public = true` est aujourd'hui activé sur **deux séances closes** (« Multiculturalisme », 38 points/4 groupes ; « Retraite », aucune analyse). La règle du plan du 09-02 (« ne pas basculer le toggle tant que 50 et 51 ne sont pas livrés ») est **respectée par la chronologie** — 50 et 51 sont en base avant que ces deux séances ne soient passées publiques — mais les trois réserves mineures du §5.3 de la revue (pas de `search_path` sur `get_public_results`, pas d'`ORDER BY` décorrélé, pas de seuil de k-anonymat) n'ont pas été traitées, et sont donc désormais des réserves sur une fonctionnalité **active**, pas hypothétique.

**Le risque à ne pas prendre pendant l'absence de Jules** : voir §6. En un mot — ne pas toucher `app_config` ni les fonctions de mot de passe (chantier 56) sans lui.

---

## 2. Tableau de statut consolidé

Nomenclature : IDs de l'audit initial (A/B/C) entre parenthèses quand ils existent ; F-IDs de la revue du 09-02 en gras quand la revue en a introduit un. Légende : ✅ corrigé (vérifié en base/code aujourd'hui) · 🟡 partiel · 🔴 ouvert (vérifié inchangé) · ⚪ sans objet / accepté.

| # | Constat | Statut | Fermé par | Preuve du jour |
|---|---|---|---|---|
| **F1 / B4** | `session_members` lisible par tous (noms réels + `reclaim_code` en clair) | ✅ | Chantier 50 | Policy `session_members_select_own USING (user_id = auth.uid())` — vérifiée en base. |
| — | Purge des `reclaim_code` à la clôture | ✅ | Chantier 49 | `SELECT ... WHERE phase='closed'` → **0** `reclaim_code` non nul sur 88 membres en phase `closed`. |
| **A1(lecture)/A5** | `table_assignments` lisible par tous | ✅ | Chantier 50 | Policy `table_assignments_select_own USING (is_own_session_member(member_id))` — vérifiée en base. |
| **F1 / B5** | Auteur des assertions désanonymisable (`member_id` public) | ✅ (avec réserve) | Chantier 51 | `role_column_grants` sur `assertions` : seules `id, session_id, content, status, created_at` sont accordées à `anon`/`authenticated` — `member_id` absent. **Réserve non levée** : fuite possible par la charge utile Realtime `postgres_changes`, jamais testée en navigateur (voir §7). |
| **F6 / A1** | Canal Realtime public → DoS de toutes les tables par broadcast | 🟡 | Chantier 53 (atténue) | `TableContext.tsx` : débounce + plafond `REFRESH_RATE_LIMIT_PER_SECOND` sur la réception des broadcasts `refresh` — vérifié dans le code. **Non résolu à la racine** : `supabase.channel(\`table:${tableId}\`)` reste sans `{ config: { private: true } }` (`TableContext.tsx`, `SuperadminScreen.tsx`) — un anonyme peut toujours émettre sur le canal, seule la réception est désormais bridée côté client. Chantier 59. |
| **F4 / A2** (volet destruction) | `tables_delete_moderator` → DELETE direct, cascade | ✅ | Chantier 54 | Policy absente de `pg_policies` pour `tables` (seules `tables_select` et `tables_update_moderator` existent). Suppression de table réservée à `delete_table_admin` (RPC superadmin). |
| **A2** (volet prise de contrôle) | Code Ecclesia unique → `reclaim_moderator` sur n'importe quelle table | ⚪ accepté | — | Non corrigé, **assumé comme contrainte produit** par la revue (secret unique non négociable). N'est plus destructeur depuis le chantier 54 : au pire, boucle de reprise sans `DELETE` possible. |
| **A3** | Bruteforce mot de passe, bcrypt coût 6 | 🔴 inchangé | — | `check_superadmin_password` toujours sans limitation de débit (vérifié : pas de table de compteur, pas de garde dans son corps). Gravité déjà rétrogradée par l'audit (secrets ~12 caractères). |
| **A4** | `designate_moderator` : prise sans code d'une table `leaderless` | 🟡 | Chantier 54 (indirect) | La prise reste possible sans code (fonction inchangée), mais elle **ne mène plus à une suppression** — le levier destructeur a disparu avec `tables_delete_moderator`. |
| **A5** | Inscription de masse non bornée | 🔴 inchangé / non vérifiable | — | `register_session_member` toujours sans quota. Débit réel de `signInAnonymously` (config Auth Supabase) **non inspecté** aujourd'hui — hors de portée des outils disponibles à cette session (voir §7). |
| **A6 / F2** | `join_table`/`switch_table` : vol d'identité par pseudo, sans preuve de possession | 🔴 inchangé | — | Motif `ON CONFLICT ... DO UPDATE SET user_id` toujours présent, sans garde de possession, dans `join_table`, `switch_table`, `confirm_attendance`, `reclaim_prevoting_member`. Fait partie du périmètre du chantier 55. |
| **F5 / B1** | XSS stocké (sources collab, URL `javascript:`) → vol mot de passe superadmin | ✅ | Chantier 52 + 72 | `add_collab_source`/`update_collab_source` appellent `is_valid_source_url()` (`^https?://`) — vérifié dans leur corps en base ; **une seule** surcharge d'`add_collab_source` existe (l'ancienne, non validée, a été `DROP`ée par le chantier 72 — confirmé, un seul résultat pour ce nom de fonction). Côté affichage, `isSafeUrl()` est utilisé dans `CollabDocScreen.tsx` et `SuperadminScreen.tsx` (grep confirmé). |
| — | `collab_session_users` lisible par tous | ✅ | Chantier 52 | Policy `collab_session_users_select_own USING (user_id = auth.uid())` — vérifiée en base. |
| — | `session_sources` lisible par tous | 🔴 inchangé, sans urgence | — | Policy `session_sources_select USING (true)` toujours active. **0 ligne en base aujourd'hui** (vérifié) — poids mort réel, mais `collab_session_users` compte désormais **5 utilisateurs réels** : la fonctionnalité commence à servir. Volontairement non traité par le chantier 52 (dépend d'un remplacement du Realtime par du polling). |
| **B2** | `register_collab_pseudo` : vol de pseudo + vol des sources déjà déposées | 🔴 inchangé | — | Fonction relue en base aujourd'hui : `ON CONFLICT (session_id, pseudo) DO UPDATE SET user_id`, aucune preuve de possession, transfère aussi `session_sources.user_id`. Sans effet tant que `session_sources` reste vide. Dans le périmètre du chantier 55. |
| **F2 / B3** | `confirm_attendance` cas 3 : reprise d'identité par pseudo seul, aucune garde de phase | 🔴 inchangé | — | Corps de fonction relu en base : la branche `p_pseudo` fait toujours `UPDATE session_members SET user_id = v_caller ... WHERE pseudo = p_pseudo`, sans code. Garde de phase : seule `draft` est rejetée — une séance `closed` reste reprenable par ce chemin. **C'est le chantier 55, non commencé.** |
| — | `reclaim_prevoting_member` : même motif, mais avec garde de phase | 🔴 inchangé | — | Relu en base : garde `phase != 'pre_voting'` présente (bon), mais reprise par pseudo seul toujours possible sans code. |
| **B6 / F1** | `sessions` lisible par tous (join_code, docs internes, `group_names`) | 🟡 partiel | Chantier 58 (partiel) | 4 RPC de lecture (`get_session_by_id`, `get_session_by_join_code`, `list_sessions_admin`, `list_public_closed_sessions`) **existent en base**, vérifié. Mais `REVOKE SELECT ON sessions` / `GRANT` restreint **n'est pas appliqué** : `role_table_grants` confirme `SELECT` toujours accordé en entier à `anon`/`authenticated`. **Ne pas l'appliquer avant que le code correspondant soit déployé** (8 sites `select('*')` non encore migrés) — voir `docs/registre-merges-en-attente.md`. |
| **C1 / F8** | `gemini-proxy` sans quota | ✅ | Chantier 57 | Lu dans `supabase/functions/gemini-proxy/index.ts` : fenêtre glissante 60 s, 20 requêtes max par `user_id`, réponse `429` avec `Retry-After`. |
| **C2** | Injection de prompt via le contenu des assertions | ⚪ accepté (réparable) | — | Inchangé, jugé réparable par l'audit (`apply_assertion_merge`/`revert_assertion_merge` gardent un delta). Pas de chantier dédié — mitigation existante = relecture humaine des fusions proposées. |
| **C3** | `add_to_queue` : `!=` avec `auth.uid()` NULL contourne la garde | ✅ | Chantier 60 (effet de bord) | Corps relu en base : `auth.uid() IS DISTINCT FROM (...)`, plus `is_table_moderator()`. Corrigé au passage du chantier 60, sans être son objectif annoncé. |
| **C4** | Aucune limite de longueur/débit sur les soumissions | 🔴 inchangé | — | Non vérifié de nouveau en détail (pas de changement de code identifié) — reste bas de priorité. |
| **C5 / §6.1** | ~76-93 fonctions `SECURITY DEFINER` sans `search_path` | 🟡 amélioré, non ciblé | — | L'advisor Supabase liste aujourd'hui **68** fonctions `function_search_path_mutable` (contre l'ordre de grandeur de 76-93 cité par les deux audits) — le nombre a baissé au fil des chantiers qui ont réécrit des fonctions existantes (60, 51, 52…) et posé `SET search_path` en passant, sans que ce soit un chantier dédié. **Les 4 fonctions ciblées par le chantier 56 restent, elles, non corrigées** — voir ligne suivante. |
| — | `search_path` sur les 4 fonctions à `crypt()` | 🔴 inchangé | Chantier 56 (non fait) | Relu en base : `check_superadmin_password`, `create_table`, `reclaim_moderator` (les 2 surcharges), `claim_moderator_status` ont toutes `proconfig = null`. `get_public_results`/`set_session_results_public` (ajout du chantier 46) : idem, `proconfig = null`. |
| **F7 / (C5 annexe)** | `app_config`/`assertion_merges` : RLS zéro-policy, pas de `REVOKE` | 🔴 inchangé | Chantier 56 (non fait) | `role_table_grants` confirme : `anon`/`authenticated` ont toujours SELECT/INSERT/UPDATE/DELETE **au niveau privilège de table** sur `app_config` et `assertion_merges`. La seule barrière réelle est RLS activée sans policy (refus par défaut) — elle tient, mais c'est une barrière unique, pas deux. |
| **C6** | Mot de passe superadmin en clair (`sessionStorage`) + en argument de chaque RPC | 🔴 inchangé | — | Pas de changement identifié dans `SuperadminScreen.tsx`. Risque de journalisation Postgres toujours **non vérifié** (accès aux logs hors de portée des outils MCP disponibles ici). |
| **C7** | Un modérateur peut réécrire le `join_code`/`session_id` de sa table | 🔴 inchangé | — | Policy `tables_update_moderator` toujours sans restriction de colonnes (`USING/WITH CHECK is_table_moderator(id)`, aucune liste de colonnes). Le titulaire de l'autorité a changé (chantier 60 : `is_table_moderator` au lieu de `created_by`) mais la portée de l'UPDATE n'a pas rétréci. |
| — | Second projet Supabase (`fcdhbgsqzvxepzvjweod`, « Vote-assertions ») | 🔴 inchangé | — | Toujours présent, statut `INACTIVE` (en pause) — vérifié via l'API projets. Recommandation de suppression toujours valable, coût nul. |
| — | Sauvegardes chiffrées | 🔴 bloqué sur Jules | — | `db-backup.yml` **absent** de `.github/workflows/` sur `main` (seuls `deploy.yml` et `supabase-ping.yml` y sont) — confirmé par lecture directe du dossier. Le workflow existe sur la branche `chantier-secu-sauvegardes`, retenue hors de `main` en attendant deux secrets GitHub que seul Jules peut créer (`docs/registre-merges-en-attente.md`). |
| **F6 (nouveau)** | `sessions.results_public` : k-anonymat, ordre du nuage, `search_path` | 🔴 ouvert, désormais actif | — | Non traité (§5.3 de la revue). **Fait nouveau** : 2 séances ont `results_public = true` aujourd'hui (voir §1 et §4). |

---

## 3. Ce que la vérification d'aujourd'hui apporte de neuf

Points que ni la revue du 09-02 ni le plan du même jour ne pouvaient connaître :

1. **`results_public` est déjà utilisé, pas seulement possible.** Deux séances closes l'ont activé : « Multiculturalisme » (38 points, 4 groupes — analyse produite) et « Retraite » (aucune analyse produite, donc `points: []`, aucun risque de nuage à cette séance précise). La règle de séquencement du plan (« pas de toggle avant 50 et 51 ») est respectée chronologiquement — les deux chantiers sont en base — mais les trois réserves mineures du §5.3 de la revue (k-anonymat, ordre du nuage, `search_path` sur `get_public_results`) restent non traitées sur une fonctionnalité désormais réellement exposée à des visiteurs. Avec 38 points sur 4 groupes (~9-10 par groupe en moyenne), le risque de k-anonymat est probablement faible sur cette séance précise, mais rien ne le garantit si un groupe est déséquilibré, et rien ne l'empêchera sur une future petite séance.

2. **La fonctionnalité collaborative a commencé à servir.** `collab_session_users` compte **5 utilisateurs réels** (contre 0 lors de l'audit et de la revue). `session_sources` reste à 0 ligne. La correction XSS (chantier 52+72) était donc bien nécessaire avant, pas après, un usage réel — elle est en place avant que quiconque n'ait pu déposer une source piégée. Bon timing, à noter pour la suite : ne plus jamais attendre qu'une fonctionnalité serve pour la sécuriser.

3. **`add_to_queue` (C3) est corrigé**, sans qu'aucun des documents précédents ne le revendique — effet de bord du chantier 60, qui a réécrit la fonction pour une tout autre raison (garde d'autorité). Petit rappel utile : les chantiers qui touchent une fonction en corrigent parfois plus que leur objet annoncé — et ne le documentent pas toujours comme tel.

4. **Le compte de fonctions `search_path`-mutable a baissé** (68 aujourd'hui contre l'ordre de grandeur 76-93 cité par les deux audits), sans qu'un chantier dédié n'ait jamais été lancé — simple conséquence des fonctions réécrites en passant. Les 4 fonctions qui comptent vraiment (celles qui appellent `crypt()`) n'en font **pas** partie : elles n'ont jamais été touchées et restent exactement dans l'état constaté par l'audit du 08-03.

5. **`claim_table_as_moderator` (chantier 68, durci par le 72)** reprend le motif de reprise d'identité (`ON CONFLICT ... DO UPDATE user_id`) mais **derrière le Code Ecclesia et une vérification de pseudo du modérateur en place** (`table_moderator_is`) — sensiblement mieux gardé que `confirm_attendance`. Ce n'est pas un correctif du chantier 55, mais c'est un exemple, dans le dépôt, de ce à quoi ressemblerait une reprise d'identité correctement gardée : secret + correspondance, pas correspondance seule.

---

## 4. Détail des points encore ouverts (par ordre du tableau §2)

### Chantier 55 — Reprise d'identité par pseudo seul (F2/B3/A6/B2)

**Toujours entièrement ouvert**, vérifié aujourd'hui sur les corps de fonction en base :
- `confirm_attendance` : la branche « pseudo fourni, pas de ligne pour l'appelant » transfère `user_id` sur simple égalité de `pseudo`, sans demander de code. Aucune garde de phase au-delà de `draft` — une séance `closed` reste reprenable.
- `reclaim_prevoting_member` : a bien une garde de phase (`pre_voting` uniquement) mais accepte toujours le pseudo seul.
- `register_collab_pseudo` : aucune preuve de possession, transfère aussi les sources déposées sous ce pseudo.
- `join_table`/`switch_table` : motif identique côté `participants`.

C'est la **cause racine n°2** de l'audit initial, et elle est désormais utilisée par au moins six fonctions distinctes (le compte grossit à chaque chantier qui touche `participants`/`session_members`, comme la revue du 09-02 l'avait prédit). Le chantier 74 vient d'en ajouter implicitement une septième variante avec prudence (`add_offline_participant`, `user_id` synthétique généré, jamais partagé — donc **pas** une nouvelle occurrence du motif, au contraire un contre-exemple correct, voir la migration `20260906_chantier74_...`).

**Reste bloquant, comme le note le plan** : un arbitrage produit (code de rappel obligatoire vs filet de rattrapage superadmin). Rien à ajouter à l'analyse du plan du 09-02, §6 point 1 — elle tient toujours.

### Chantier 56 — `search_path` + `app_config`/`assertion_merges`

**Toujours entièrement ouvert**, vérifié aujourd'hui :
- Les 6 fonctions ciblées (`check_superadmin_password`, `create_table`, `reclaim_moderator` ×2, `claim_moderator_status`, `get_public_results`, `set_session_results_public`) ont toutes `proconfig = null` — aucune n'a de `search_path` figé.
- `app_config` et `assertion_merges` : `anon`/`authenticated` détiennent toujours SELECT/INSERT/UPDATE/DELETE au niveau du privilège de table (RLS zéro-policy est la seule barrière, elle tient mais reste unique).

**Ce chantier touche exclusivement de la base** — pas un fichier `src/`. C'est précisément pour cela qu'il **peut verrouiller Jules dehors** s'il est mal exécuté (une erreur dans `SET search_path` sur une fonction à `crypt()` se manifeste par un « mot de passe incorrect » silencieux, pas une erreur SQL visible — piège documenté par la revue elle-même, §6.1). Voir §6 ci-dessous : ce chantier ne doit être fait qu'en présence de Jules, jamais en autonomie pendant son absence.

### Chantier 59 — Canaux Realtime privés

**Toujours ouvert à la racine**, atténué en périphérie. Vérifié aujourd'hui : ni `TableContext.tsx` ni `SuperadminScreen.tsx` n'ouvrent leurs canaux avec `{ config: { private: true } }`. Le chantier 53 (débounce + plafond de réception) tient l'intervalle comme prévu par le plan, mais n'importe qui muni de la clé anon peut toujours **émettre** sur `table:<id>` — la correction de fond (canaux privés + policies `realtime.messages`) reste entière. Le plus gros chantier du dossier, à ne pas engager sous contrainte de calendrier (le plan le dit déjà, rien de nouveau).

### Sauvegardes chiffrées

**Bloqué sur Jules**, confirmé : `db-backup.yml` n'est pas sur `main`, il n'y a donc **aucune sauvegarde de la base de production aujourd'hui**. Ce n'est pas un chantier de code — c'est deux secrets GitHub (`SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`) que seul Jules peut créer dans les réglages du dépôt. La branche `chantier-secu-sauvegardes` est protégée en dur dans `scripts/cleanup-worktrees.sh` en attendant.

### Réserve non levée du chantier 51 — fuite `member_id` par Realtime

Le correctif par privilège de colonne est confirmé en base (§2). Ce qui n'a **jamais** été vérifié — ni par la revue, ni par le plan, ni aujourd'hui, faute d'un navigateur — c'est si la charge utile `postgres_changes` sur `assertions` (écoutée par `VoteScreen.tsx`) continue de porter `member_id` malgré la restriction de colonne au niveau REST. `A_VERIFIER.md` porte déjà ce point bloquant avec une recette précise (ouvrir la console, observer la trame WebSocket). **Ce test doit être joué avant de considérer B5 totalement clos** — voir §7.

### `sessions.results_public` — les trois réserves mineures, désormais actives

Trois points du §5.3 de la revue, non traités, sur une fonctionnalité qui sert déjà sur 2 séances :
1. Pas de `search_path` sur `get_public_results`/`set_session_results_public` (regroupé avec le chantier 56 ci-dessus).
2. `jsonb_agg` sans `ORDER BY` sur le nuage de points — canal de corrélation résiduel, faible, gratuit à fermer (`ORDER BY md5(am.id::text)`).
3. Pas de seuil de k-anonymat — aucune garde n'empêche un groupe à 1 ou 2 membres d'apparaître isolé dans le nuage public. Sur les 2 séances actuellement publiques, le risque semble faible (38 points/4 groupes sur l'une, aucune analyse sur l'autre) mais rien ne l'empêche sur la prochaine.

---

## 5. Ordre de traitement recommandé

Le plan du 09-02 (§2 et §7 de ce document-ci) reste la référence de méthode — trois critères : l'irréversible d'abord, le meilleur rapport effet/risque ensuite, le risque de casse en dernier. Six des onze chantiers qu'il proposait sont faits. Voici l'ordre pour ce qui reste, réévalué à la lumière d'aujourd'hui :

**1. Les sauvegardes — dépend de Jules, à relancer dès qu'il est disponible.**
Rien à corriger en code ; deux secrets GitHub à créer. C'était déjà « l'action au meilleur rapport effort/effet du dossier » selon la revue, et c'est toujours vrai : tant qu'elle n'est pas faite, chaque chantier qui touche `session_members`, `tables` ou `assertions` (55 y compris) s'exécute sans filet.

**2. Les trois réserves mineures de `results_public`** (k-anonymat, `ORDER BY`, `search_path` sur ces 2 fonctions) — coût faible (quelques lignes SQL), et la fonctionnalité est désormais active sur deux séances réelles. Ne plus attendre, comme pour le doc collaboratif (§3 point 2).

**3. Le test Realtime du chantier 51** (fuite `member_id` par WebSocket) — pas un chantier de code si le test est négatif ; potentiellement un chantier court (vue `assertions_public`) s'il est positif. À jouer dès qu'une session avec navigateur est disponible, avant de considérer B5 réglé.

**4. Chantier 55** (reprise d'identité) — reste bloqué sur l'arbitrage produit de Jules (§6 du plan du 09-02, point 1). Rien à faire techniquement avant qu'il ne tranche entre code obligatoire + filet superadmin, ou un compromis par phase.

**5. Chantier 56** (`search_path` sur les 4 fonctions à mot de passe + `REVOKE` sur `app_config`/`assertion_merges`) — **uniquement en présence de Jules**, voir §6. Bon marché, mais le seul chantier de ce dossier où une erreur peut le verrouiller hors de sa propre base.

**6. Chantier 58, le reste** (`REVOKE`/`GRANT` restreint sur `sessions`) — le préalable mécanique (8 sites `select('*')` à convertir) n'a pas commencé. Le plus coûteux et le moins urgent des trois chantiers RLS d'origine ; ce que ça laisse fuiter (URLs de docs de préparation, `group_names`) est gênant, pas grave.

**7. Chantier 59** (canaux Realtime privés) — le plus gros morceau, à ne faire qu'avec une marge confortable de recette (le plan le dit déjà : « à ne pas engager sous contrainte de calendrier »). Le chantier 53 tient l'intervalle depuis un mois sans incident connu.

**Durcissements bas de priorité, inchangés** : A3 (rate-limit sur `check_superadmin_password`, coût bcrypt), C4 (limites de longueur/débit sur les soumissions), C7 (portée de `tables_update_moderator`), suppression du second projet Supabase.

---

## 6. Ce qui ne doit pas être fait pendant l'absence de Jules

**Le chantier 56 ne doit être engagé qu'avec Jules disponible, jamais en autonomie.** C'est écrit noir sur blanc dans les notes qui m'ont été transmises pour ce chantier 76, et la vérification d'aujourd'hui ne change rien à cette prudence — au contraire, elle confirme que les 6 fonctions concernées sont exactement dans l'état où l'audit les a trouvées il y a un mois, donc rien n'urge à les toucher sans lui. La raison tient en une phrase : une erreur dans le `SET search_path` d'une fonction qui appelle `crypt()` (le piège documenté par la revue elle-même, déjà rencontré une fois dans ce dépôt — `20260527150000_fix_crypt_path.sql`) se manifeste par un **« mot de passe incorrect »**, pas par une erreur SQL visible. Si cette panne touche `check_superadmin_password` pendant que Jules est seul à détenir ce mot de passe et absent pour la diagnostiquer, il perd l'accès à l'administration de sa propre application, sans message d'erreur qui l'oriente vers la vraie cause. `REVOKE ALL ON app_config` porte un risque de même nature : si une fonction existante s'avérait dépendre d'un privilège de table plutôt que de son statut `SECURITY DEFINER` (pas identifié aujourd'hui, mais pas vérifié fonction par fonction non plus), la panne serait du même genre — silencieuse, et bloquante pour lui spécifiquement.

**Par extension, la même prudence s'applique** :
- Au **chantier 58** (colonnes de `sessions`) — le risque n'est pas un verrouillage mais une casse silencieuse de huit écrans (`select('*')`), qui inclut l'écran superadmin lui-même. Une casse de ce type découverte en l'absence de Jules serait tout aussi bloquante pour lui.
- Au **chantier 59** (canaux Realtime privés) — le plan le dit déjà, je le confirme : c'est le seul chantier du dossier où il vaut mieux ne pas le faire que le faire à moitié, et une session doit disposer d'une vraie fenêtre de recette, pas seulement de la présence de Jules.

**Ce qui reste sûr à faire sans lui**, parce que sans dépendance à un secret qu'il est seul à connaître et sans risque de casse silencieuse de l'accueil superadmin : les trois réserves mineures de `results_public` (§4), le test Realtime du chantier 51, et tout travail préparatoire du chantier 58 qui s'arrête **avant** le `REVOKE` proprement dit (convertir les 8 `select('*')` en listes de colonnes explicites, écrire — sans l'appliquer — la migration de restriction, exactement comme le veut la règle du projet pour toute session de chantier).

---

## 7. Limites de cette vérification — à lire avant de conclure quoi que ce soit

- **Aucun test actif, aucun navigateur.** Comme la revue du 09-02, cette consolidation ne fait que lire code et base. Les seules preuves d'exploitation bout-en-bout du dossier restent celles du 08-03 (A1, B4, B6, table_assignments) — jamais rejouées depuis, et les policies qu'elles ciblaient ont depuis changé (B4, table_assignments sont fermées ; A1/B6 restent dans l'état testé).
- **Le test Realtime du chantier 51 n'a pas pu être joué** (pas de navigateur dans cette session) — voir §4, c'est le point le plus urgent à lever dès qu'une session avec navigateur est disponible.
- **Configuration Auth Supabase non inspectée** — débit réel de `signInAnonymously`, réglages JWT. Les outils MCP disponibles à cette session donnent accès à la base (SQL) et aux advisors, pas à la configuration Auth elle-même. Conditionne toujours la faisabilité à grande échelle de A5.
- **`npm audit` non lancé** — aucun scan de CVE des dépendances front depuis l'audit initial.
- **Journaux Postgres/PostgREST non vérifiés** — la question C6 (le mot de passe superadmin apparaît-il dans les logs ?) reste sans réponse ; hors de portée des outils disponibles ici (nécessite un accès aux logs de la plateforme, pas seulement au schéma).
- **Une requête exploratoire a été bloquée par le classificateur de permissions** de cette session (comptage par `user_id`/table visant à repérer les participants ajoutés hors ligne, dans le cadre d'un autre chantier) — sans rapport avec les conclusions de sécurité ci-dessus, qui reposent uniquement sur des définitions de fonctions, des policies, des grants et des comptages agrégats sans identifiant personnel.
- **Les ~40 RPC superadmin ne sont toujours pas relues une par une** — ni par la revue, ni ici. Risque résiduel jugé faible par la revue, non revérifié.
- **Le second projet Supabase** (`fcdhbgsqzvxepzvjweod`) est confirmé `INACTIVE` via l'API, mais son contenu n'a pas été inspecté — juste sa non-utilisation.
- **`transcription-debat/`** reste hors périmètre, conformément à la décision du 08-03, jamais reconsidérée depuis.
- **Rappel de méthode, toujours valable** : le dépôt est public. Ce document l'est aussi dès qu'il y est commité. Corriger côté serveur, pas côté interface ; ne pas détailler publiquement au-delà de ce qui est nécessaire les fenêtres d'exploitation encore ouvertes — ce document en liste plusieurs (55, 56, 59, sauvegardes) qui restent, à cette date, réellement exploitables par quiconque lit le dépôt public.
