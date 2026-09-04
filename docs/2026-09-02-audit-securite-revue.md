# Revue critique de l'audit de sécurité — Ecclesia

**Date** : 2026-09-02
**Nature** : revue documentaire et revue de code. **Session en lecture seule** — aucun code modifié, aucune branche créée, aucun accès Supabase (ni MCP ni REST). Les vérifications qui exigent la base sont listées au §8, prêtes à exécuter.
**Base analysée** : `main` au 02/09/2026 (en cours de merge de sept branches, snapshot aux commits `624bba4`/`334c514`), plus les trois branches portant des migrations non encore fusionnées : `chantier-46-resultats-publics`, `chantier-43-outils-modo-transcription` (chantier 44), `chantier-48-changer-table`.
**Documents relus** : [audit-securite-2026-08-03.md](./audit-securite-2026-08-03.md) et [audit-securite-passation.md](./audit-securite-passation.md). Accessoirement [AUDIT.md](../AUDIT.md) (17/07/2026), voir §2.4.

---

## 1. Verdict en dix lignes

L'audit du 3 août est **solide, honnête et toujours d'actualité**. Un mois plus tard, **aucune de ses conclusions n'a été invalidée par le code** : les cinq policies `USING (true)` sont intactes, le canal Realtime est toujours public, le mot de passe superadmin est toujours en clair dans `sessionStorage`, les URLs de sources collaboratives ne sont toujours pas validées. Aucune migration de sécurité n'a été écrite depuis.

Ce qui a changé, en revanche, c'est que **le motif de reprise d'identité sans preuve de possession — la cause racine n°2 de l'audit — a été réimplémenté deux fois dans du code neuf** (chantiers 44 et 48), avec un commentaire de migration qui l'invoque explicitement comme un choix de conception à préserver. C'est le fait nouveau le plus important de cette revue : le défaut n'est plus seulement non corrigé, il est en train d'être normalisé.

Sur le point que tu signales comme structurellement le plus notable — les 76 fonctions `SECURITY DEFINER` sans `search_path` — mon verdict diverge du tien en gravité, pas en constat : **c'est une bonne pratique non respectée, pas une faille exploitable en l'état** (§6.1). Elle mérite une passe de durcissement ciblée sur quatre fonctions, pas un chantier de 76.

Sur le chantier 46 : **la fonction elle-même est bien faite** et ne fuit aucun identifiant de participant. Son problème n'est pas ce qu'elle expose, c'est ce qu'elle met en lumière — elle attire du public vers des séances dont la moitié identifiante reste ouverte à la lecture par ailleurs (§5).

---

## 2. Lecture critique des deux documents

### 2.1 Ce qui tient toujours — vérifié dans le code au 02/09

| Constat de l'audit | Vérification faite | État |
|---|---|---|
| A1 — canal Realtime public, broadcast → `refetch` sans contrôle | `src/context/TableContext.tsx:195` : `supabase.channel(\`table:${tableId}\`)`, **aucun** `{ config: { private: true } }` dans tout `src/`. `:269` : `ch.on('broadcast', {event:'refresh'})` → `refetch(payload.tables)`, sans débounce ni plafond. | **inchangé** |
| B4 — `session_members_select USING (true)` | `20260528_voting_app.sql:20`. Aucune migration ultérieure ne la remplace. | **inchangé** |
| B6 — `sessions_select USING (true)` | `20260526000001_sessions_schema.sql:44`. | **inchangé** |
| A1/A5 — `table_assignments_select USING (true)` | `20260528_voting_app.sql:105`. | **inchangé** |
| B2 — `collab_session_users_select` / `session_sources_select` en `USING (true)` | `20260527000006_collab_sources.sql:29,32`. | **inchangé** |
| B1 — XSS `javascript:` sur les sources collab | `add_collab_source` ne valide toujours pas `p_url` (`20260527000006:96`). Rendu brut en `href` : `CollabDocScreen.tsx:593`, `SuperadminScreen.tsx:4249`. React reste en `^18.3.1` (`package.json:22`). | **inchangé** |
| B3 — `confirm_attendance` cas 3, pseudo seul | `20260623_reclaim_code_plain.sql:96-116` : `UPDATE session_members SET user_id = v_caller, attending_in_person = true` sur simple correspondance de pseudo. | **inchangé** |
| B5 — auteur des assertions désanonymisable | `assertions_select_approved USING (status = 'approved')` porte sur **toutes les colonnes**, `member_id` compris ; jointure triviale avec `session_members` (public). | **inchangé** |
| A4 — `designate_moderator` sans code | `20260721_designate_moderator.sql` : conditions = table `leaderless` + appelant participant. Puis `created_by = auth.uid()`. | **inchangé** |
| A2 — `tables_delete_moderator USING (auth.uid() = created_by)` | `20260526000000:194`. | **inchangé** |
| C1 — `gemini-proxy` sans quota | Aucune occurrence de rate-limit / quota / plafond de payload dans `supabase/functions/gemini-proxy/index.ts`. | **inchangé** |
| C6 — mot de passe superadmin en clair | `SuperadminScreen.tsx:52-54`, `sessionStorage.getItem/setItem`. | **inchangé** |
| Sauvegardes chiffrées | `.github/workflows/` ne contient que `deploy.yml` et `supabase-ping.yml`. Le `db-backup.yml` annoncé dans la passation **n'est toujours pas commité**, donc **il n'y a aucune sauvegarde**. | **non fait** |

**Conclusion** : sur les 19 points de l'audit, aucun n'a été corrigé. Le document reste utilisable tel quel comme référence de constat.

Seule dérive mineure : les **numéros de ligne cités par l'audit sont périmés** (`TableContext.tsx:161/229` → aujourd'hui `195/269`). Ne pas s'y fier lors des corrections ; les identifiants de fonction et de policy, eux, sont bons.

### 2.2 Ce qui a bougé depuis — et que l'audit ne pouvait pas voir

**Deux nouvelles RPC rejouent le motif de reprise d'identité.** L'audit désignait comme cause racine n°2 le motif `ON CONFLICT (…) DO UPDATE SET user_id = auth.uid()` présent dans `join_table`, `confirm_attendance`, `reclaim_prevoting_member` et `register_collab_pseudo`. Depuis :

- `add_offline_participant` (chantier 44, branche `chantier-43-outils-modo-transcription`) — `INSERT INTO participants … ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id`. Le commentaire de migration l'assume : « Réutilise **volontairement** le même schéma de collision que `join_table` ».
- `switch_table` (chantier 48) — même motif, `GRANT EXECUTE … TO anon, authenticated`, appelable depuis `AllocatingScreen`.

`add_offline_participant` est correctement gardée (`created_by = auth.uid()`) : le pouvoir qu'elle donne ne dépasse pas celui d'un modérateur légitime. `switch_table` en revanche est ouverte à tout appelant qui connaît le `join_code` d'une table et un pseudo — c'est **A6 avec une porte d'entrée de plus**, et ce n'est pas un défaut d'implémentation : c'est le motif de conception qui est repris tel quel.

Le point à retenir n'est pas la gravité de ces deux RPC (modérée), c'est que **le correctif de la cause racine n°2 va coûter plus cher chaque mois** : chaque chantier qui touche à `participants` ou `session_members` recopie le motif, et le documente comme intentionnel.

**Chantier 46** ajoute une surface publique nouvelle : voir §5.

**Aucune migration de sécurité** n'a été écrite entre le 03/08 et le 02/09 (dernière migration sur `main` : `20260803_chantier37_set_member_moderator_seat.sql`).

### 2.3 Ce qui manque aux deux documents

Trois angles que ni l'audit ni la passation ne couvrent, et qui comptent :

1. **Aucun raisonnement sur la conservation des données.** L'audit traite B4 comme un problème d'accès (« qui peut lire ces 96 noms »). La question amont n'est jamais posée : **pourquoi la base de production contient-elle encore les noms et prénoms réels de participants à des séances passées ?** Pour une association étudiante, la mesure la moins chère et la plus efficace n'est pas de resserrer la RLS sur des données qu'on garde — c'est de purger ce qui n'a plus d'usage. Un `reclaim_code` n'a aucune raison de survivre à la clôture d'une séance ; un pseudo nominatif non plus, une fois l'analyse produite. Voir **F1** (§4).
2. **Le mot de passe modérateur unique et global est traité comme une faille à corriger** (A2 : « découpler, granulariser, révoquer »), alors que c'est une **contrainte produit**. La passation propose un chantier de refonte des secrets qui, à ma lecture, ne se fera pas. Il fallait poser la question autrement : à secret inchangé, comment réduire ce qu'il permet ? La réponse est courte et actionnable (retirer le `DELETE` direct) — voir **F4**.
3. **Aucun scénario de récupération.** Les deux documents évaluent la probabilité qu'une séance soit détruite ; aucun ne dit ce qui se passe ensuite. Or il n'y a **aucune sauvegarde** (§2.1) : la conséquence d'un `DELETE FROM tables` réussi n'est pas « on restaure », c'est « c'est perdu ». Cela change la gravité relative de tout le bloc A. Le workflow de sauvegarde écrit et non commité est, à mon sens, **la correction au meilleur rapport effort/effet de tout le dossier** — et la seule qui protège aussi contre l'erreur humaine et l'incident plateforme, pas seulement contre un attaquant.

### 2.4 Contradiction interne au dépôt

`AUDIT.md` (17/07/2026), à la racine, note l'axe **Sécurité en « 🟢 Bon »** avec le commentaire « RLS + SECURITY DEFINER, aucun secret commité ». C'est une revue de qualité de code qui n'a pas regardé les policies. Elle contredit frontalement l'audit du 3 août et **ne doit pas être citée sur le sujet sécurité** — sinon quelqu'un lira la ligne verte et en conclura que le dossier est clos.

---

## 3. Le modèle d'accès réel

### 3.1 Cartographie RLS (18 tables, RLS active partout)

| Régime | Tables | Commentaire |
|---|---|---|
| **Lecture totalement publique** (`USING (true)`) | `sessions`, `session_members`, `table_assignments`, `collab_session_users`, `session_sources` | Les cinq de l'audit. Inchangées. |
| **Lecture publique conditionnelle** | `assertions` (`status = 'approved'`) | Toutes colonnes, `member_id` compris → B5. |
| **Lecture par appartenance** | `tables`, `participants`, `queue_entries`, `speaking_turns` (`is_table_participant`) | Correct. |
| **Lecture par propriétaire** | `entry_responses`, `assertion_votes`, `private_notes`, `questionnaire_responses` | Correct. C'est ce qui empêche la publication des votes nominatifs. |
| **Aucune lecture** | `analysis_members` (`no_select`), `session_analysis` (membres d'une séance close) | Correct — c'est ce qui rend le nuage PCA du chantier 46 réellement nouveau. |
| **Zéro policy** (refus par défaut) | `app_config`, `assertion_merges` | Voir §3.2. |

L'asymétrie est nette et elle est le cœur du problème : **les tables de contenu sont correctement protégées, les tables d'identité ne le sont pas**. Un attaquant ne peut pas lire un vote, mais il peut lire la liste complète des votants avec leurs noms.

### 3.2 `app_config` et `assertion_merges`

**Vérifié dans le code** : les deux tables ont RLS activée et **aucune policy**. En pratique, refus total pour `anon` et `authenticated` sur l'API REST. `app_config` contient `creation_code_hash` et `superadmin_code_hash` (hashs bcrypt, `$2a$06$` d'après l'audit — coût 6).

Les accès légitimes passent tous par des fonctions `SECURITY DEFINER` détenues par `postgres`, lesquelles **contournent la RLS par construction** :
- `app_config` : lue par `check_superadmin_password` (`20260526000001:84`) et par les fonctions qui vérifient le code Ecclesia (`create_table`, `reclaim_moderator`, `claim_moderator_status`). Aucune ne retourne `value` — vérifié.
- `assertion_merges` : lue/écrite par `apply_assertion_merge`, `revert_assertion_merge`, `list_assertion_merges`, dont les variantes internes `_apply_assertion_merge` / `_revert_assertion_merge` sont explicitement `REVOKE`d à `anon`/`authenticated` (`20260728_chantier18_merge_undo.sql:167,238`). Bon modèle, le seul du dépôt.

**La réserve** : « RLS sans policy » est une barrière **unique**. Elle ne tient que tant qu'aucune fonction `SECURITY DEFINER` ne retourne, même accidentellement, une colonne `value` — un `RETURNS app_config`, un `RETURN to_jsonb(v_row)` de trop, un message d'erreur trop bavard, et le hash sort. Comme il n'existe aucune raison légitime pour `anon` de lire cette table, il faut une **seconde barrière indépendante** : `REVOKE ALL ON app_config FROM anon, authenticated`. Les fonctions definer continueront de fonctionner (elles s'exécutent en tant que `postgres`). Voir **F7**.

### 3.3 Les 93 fonctions `SECURITY DEFINER`

Mon décompte dans les migrations concorde avec le tien : 183 occurrences de `SECURITY DEFINER` (recréations comprises), **21 seulement portent un `SET search_path`**, toutes concentrées dans une poignée de migrations (`collab_sources`, `fix_crypt_path`, `merge_assertion_votes`, `chantier18_merge_undo`). Le reste, dont `check_superadmin_password` lui-même, hérite du `search_path` de l'appelant.

**Aucune fonction en `SECURITY INVOKER`** : c'est cohérent avec l'architecture (pas de backend, tout passe par des RPC privilégiées) et ce n'est pas en soi un défaut. C'est en revanche ce qui explique la taille de la surface : **presque toutes ces fonctions sont exécutables par `anon`**, soit par `GRANT EXECUTE … TO anon, authenticated` explicite (22 occurrences relevées), soit par le `EXECUTE` accordé à `PUBLIC` par défaut sur les fonctions du schéma `public`.

Analyse d'exploitabilité au §6.1 — conclusion : **non exploitable en l'état, à corriger quand même, mais par ordre de sensibilité et non en bloc**.

### 3.4 Ce qu'atteint un participant anonyme muni d'un simple code de table

En passant par l'interface : sa table, ses co-participants, la file, l'historique des tours, ses propres notes et votes. C'est correctement borné.

**En appelant les RPC directement** (le scénario qui compte, puisque la clé `anon` est dans le bundle public) :

| Sans aucun secret | Effet |
|---|---|
| `GET /rest/v1/sessions` | Toutes les séances : titres, `join_code`, URLs de docs internes, `phase`, `group_names`. |
| `GET /rest/v1/session_members` | **Tous les noms et prénoms réels**, `reclaim_code` en clair, `user_id`, `is_moderator`, `attending_in_person`. |
| `GET /rest/v1/assertions?status=eq.approved` | Contenu **et `member_id`** de chaque assertion → jointure avec le précédent = auteur nommé. |
| `GET /rest/v1/table_assignments` | Répartition complète : qui est à quelle table. |
| `rpc/confirm_attendance` (pseudo seul) | S'emparer de l'inscription de n'importe quel membre nommé ci-dessus. |
| `channel('table:<id>').send(broadcast refresh)` | Faire refetch tous les clients de n'importe quelle table. |
| `rpc/register_session_member` | S'inscrire à n'importe quelle séance, sans quota. |
| `rpc/check_superadmin_password` | Oracle silencieux de validation du mot de passe superadmin. |
| `rpc/register_collab_pseudo` + `add_collab_source` | Déposer une source (donc une URL) visible du superadmin. |

| Avec le `join_code` d'une table | Effet supplémentaire |
|---|---|
| `rpc/join_table` / `rpc/switch_table` | Voler la ligne `participants` de n'importe quel membre de cette table, par pseudo. |
| `rpc/designate_moderator` | Si la table est `leaderless` : en devenir `created_by`, irréversiblement. |
| `DELETE /rest/v1/tables` (une fois `created_by`) | Supprimer la table → cascade participants / file / historique. |

| Avec le code Ecclesia (secret partagé, connu de tous les animateurs) | Effet supplémentaire |
|---|---|
| `rpc/reclaim_moderator` | Devenir `created_by` de **n'importe quelle** table. Puis la supprimer. |

L'écart entre la première colonne et ce que permet l'interface est considérable, et il est entièrement dû aux cinq policies `USING (true)`.

---

## 4. Constats, par gravité réelle

Contexte d'évaluation assumé : **débats étudiants d'une association de CentraleSupélec**. Le préjudice à craindre est (1) l'exposition de personnes réelles nommées sur leurs opinions, (2) la perte définitive de données faute de sauvegarde, (3) le sabotage d'une soirée. Ce n'est ni une banque ni une infrastructure critique : la disponibilité transitoire compte moins que l'irréversible.

---

### F1 — 🔴 Fuite active de données personnelles : identité, opinions et statut de tous les participants passés

**Ce qui est exposé, maintenant, sans attaquant.** `session_members` en `USING (true)` : 96 membres, ~92 noms et prénoms réels, 29 `reclaim_code` en clair, le statut `is_moderator` et la présence physique. Croisé avec `assertions` (qui expose `member_id` sur toutes les lignes `approved`), on obtient **le nom réel de l'auteur de chacune des ~112 assertions approuvées**.

**Pourquoi c'est le constat n°1.** Toutes les autres entrées de cette liste décrivent ce qu'un attaquant *pourrait* faire. Celle-ci décrit un état de fait : ces données sont lisibles depuis n'importe quel navigateur, et elles l'ont été chaque jour depuis la mise en ligne. Il s'agit de personnes nommées, associées à des prises de position sur des sujets clivants, dans une école où elles se croisent. C'est exactement ce que la migration `20260721_hide_assertion_author` cherchait à empêcher — le masquage est resté cosmétique, la donnée sort par l'API.

**Scénario d'exploitation.** Aucun. Trois requêtes `GET` avec la clé publique du bundle JS ; l'audit les a exécutées le 03/08. Un `join` côté client suffit à produire un tableau nom → opinions.

**Correction.**
1. `session_members` : remplacer `USING (true)` par une lecture restreinte au membre lui-même (`user_id = auth.uid()`), et faire passer tout besoin légitime de liste par une RPC existante (`list_session_members_admin`, `get_allocation_inputs`) — elles sont déjà là et déjà gardées par mot de passe.
2. `assertions` : cesser d'exposer `member_id`. Le plus propre est une vue ou une RPC ne projetant que `id, content, status, created_at` ; à défaut, une policy restreignant les colonnes.
3. **Purger.** `reclaim_code` n'a aucune utilité après la clôture d'une séance : `UPDATE session_members SET reclaim_code = NULL` sur les séances closes. À faire **avant même** de toucher aux policies — c'est une requête, et ça retire immédiatement le contenu le plus sensible.
4. Puis reprendre le point `REPLICA IDENTITY FULL` que la passation signale à juste titre : `session_members` est en publication Realtime (`20260803_chantier35`) — une fois la RLS resserrée, vérifier que le WAL ne rediffuse pas `reclaim_code` aux abonnés.

---

### F2 — 🔴 Prise d'identité par pseudo seul, sur une liste de pseudos publique — et le motif se propage

**Le défaut.** `confirm_attendance` cas 3 (`20260623_reclaim_code_plain.sql:96-116`) transfère `user_id` sur simple correspondance de pseudo, sans code. `reclaim_prevoting_member`, `join_table`, `register_collab_pseudo`, et désormais `switch_table` (chantier 48) partagent le motif. La garde « l'appelant n'a pas encore de ligne » se contourne par un `signInAnonymously()` neuf — l'opération coûte une requête.

**Pourquoi c'est grave ici, et pas seulement gênant.** F1 fournit la liste des pseudos ; F2 fournit le moyen de les prendre. Les deux ensemble donnent un script de quelques lignes qui, sur une séance en cours, retire à chaque membre son inscription, son onboarding, ses votes et son affectation de table. Ce n'est pas réversible sans sauvegarde — et il n'y en a pas (F3). L'effet ne se voit pas immédiatement : les victimes le constatent au moment de rejoindre leur table.

**Note de gravité.** `confirm_attendance` n'a **aucune garde de phase** : elle s'applique aussi à une séance `closed`. Une séance passée reste donc « reprenable ». `reclaim_prevoting_member`, écrite plus tard, a bien une garde de phase — la bonne pratique existe déjà dans le dépôt, elle n'a simplement pas été rétroportée.

**Correction.** Exiger une preuve de possession sur toute reprise d'identité : le `reclaim_code` devient **obligatoire** et non plus « l'un ou l'autre suffit ». Le cas d'usage réel (« j'ai changé de téléphone ») est couvert par le code ; le cas « je tape juste mon nom » ne doit plus transférer, mais échouer avec un message invitant à voir un modérateur. Ajouter une garde de phase à `confirm_attendance`. Et, avant tout : **arrêter de recopier le motif** — le commentaire d'en-tête de la migration du chantier 44 le présente comme un choix à préserver ; c'est cette ligne-là qu'il faut corriger en premier, sinon la dette grossit à chaque chantier.

---

### F3 — 🔴 Aucune sauvegarde : toute destruction est définitive

**Constat.** `.github/workflows/` ne contient que `deploy.yml` et `supabase-ping.yml`. Le `db-backup.yml` annoncé comme « écrit, non commité » dans la passation du 03/08 ne l'est toujours pas un mois plus tard. Le free tier Supabase ne garantit pas de restauration.

**Pourquoi je le classe en critique alors que ce n'est pas une vulnérabilité.** C'est le multiplicateur de gravité de tout le bloc A. `DELETE FROM tables` cascade sur `participants`, `queue_entries`, `speaking_turns` ; `delete_session` cascade sur membres, assertions, votes, analyses et affectations. Avec une sauvegarde hebdomadaire, ces attaques coûtent une soirée. Sans, elles coûtent l'historique. Et le risque n'est pas seulement malveillant : une fausse manœuvre superadmin, un `ON DELETE CASCADE` déclenché par erreur ou un incident plateforme produisent le même résultat.

**Correction.** Committer le workflow, créer les deux secrets GitHub (`SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`) à la main. **Le chiffrement AES-256 n'est pas optionnel** : sur un dépôt public, les artefacts d'Actions sont téléchargeables par tous — un dump en clair transformerait la sauvegarde en la pire fuite du dossier. Attention aussi au caveat de la passation : GitHub désactive les crons après 60 jours sans commit.

C'est, de tout ce rapport, **l'action au meilleur rapport effort/effet** : une heure de travail, aucun risque de régression, et elle change la nature de toutes les autres.

---

### F4 — 🟠 Le mot de passe modérateur global donne un droit de suppression directe

**Cadrage.** Tu poses le secret unique et global comme une donnée non négociable. J'en tiens compte : ce constat ne demande pas de le changer. Ce qui se corrige, c'est **ce que sa détention permet**.

**Le défaut.** `reclaim_moderator(join_code, code)` réécrit `created_by`. La policy `tables_delete_moderator USING (auth.uid() = created_by)` accorde alors un `DELETE` **direct, via l'API REST**, sur la table et sa cascade. Il n'y a pas de RPC, donc pas de garde, pas de journal, pas de confirmation. Même chose pour `designate_moderator` sur une table `leaderless`, qui elle ne demande aucun secret du tout (A4).

**Scénario.** Un ancien animateur, ou quiconque a vu le code sur un projecteur, reprend les tables une par une et les supprime. Le modérateur légitime le voit dans la seconde (`TableContext` écoute l'UPDATE et bascule `isModerator` à `false`) mais ne peut que re-`reclaim` — boucle sans vainqueur, jusqu'au `DELETE` qui tranche.

**Correction — indépendante du modèle de secret.**
1. **Supprimer la policy `tables_delete_moderator`.** Faire passer la fin de table par une RPC (`end_table`) qui journalise, ou par un `closed_at` plutôt qu'un `DELETE`. Un modérateur a besoin de clore une table, pas de l'effacer.
2. Journaliser les changements de `created_by` (une table `moderator_takeovers`, quatre colonnes). Cela ne bloque rien mais rend l'incident lisible après coup — ce qui manque totalement aujourd'hui.
3. Pour `designate_moderator` : rendre la désignation révocable par le superadmin. Aujourd'hui elle est irréversible et sans secret.

Coût faible, et cela retire la moitié destructrice du pouvoir sans toucher au mot de passe.

---

### F5 — 🟠 XSS stocké dans les sources collaboratives → mot de passe superadmin → suppression de séance

**Inchangé depuis l'audit**, je le reprends pour la chaîne complète : `add_collab_source` n'impose aucun schéma d'URL ; React 18 n'a jamais neutralisé `javascript:` (le garde-fou de `sanitizeURL` est un `console.error` en dev, supprimé du build de production) ; l'`href` est écrit brut dans `CollabDocScreen.tsx:593` et `SuperadminScreen.tsx:4249` ; le mot de passe superadmin est en clair dans `sessionStorage`, même origine (`SuperadminScreen.tsx:52-54`).

**Ce que j'ajoute.** L'audit note « 0 ligne dans `session_sources`, impact actuel nul ». C'est exact, et c'est aussi ce qui rend le constat facile à repousser. Deux nuances :

- Le prérequis « le superadmin clique » est **plus faible qu'il n'y paraît** : le titre est contrôlé par l'attaquant, et le panneau des sources est précisément ce qu'on ouvre en préparant une séance.
- La correction la moins chère ne touche ni la RLS ni le stockage du mot de passe : **valider le schéma d'URL** (`http:`/`https:` uniquement) à l'écriture dans `add_collab_source` **et** à l'affichage. Une condition SQL et un helper de quinze lignes. Faire les deux — la validation à l'affichage protège les lignes déjà en base, celle à l'écriture protège les surfaces d'affichage à venir.
- Le durcissement de fond (sortir le mot de passe de `sessionStorage` pour un jeton opaque à durée de vie limitée) est le bon objectif, mais il est nettement plus coûteux et ne doit pas retarder la validation d'URL.

---

### F6 — 🟠 Déni de service Realtime : un anonyme fige toutes les tables

**Confirmé exploitable par l'audit** (test actif du 03/08), inchangé dans le code. `table_assignments` en `USING (true)` fournit tous les `table_id` ; le canal `table:<id>` est public ; le handler `broadcast` déclenche `refetch` sans aucun contrôle ni limitation.

**Pourquoi 🟠 et non 🔴.** C'est le chemin le plus court vers l'objectif « interrompre une séance », et il ne coûte rien. Mais il est **transitoire et sans perte** : l'attaque cesse, l'app repart, aucune donnée n'est touchée. Dans le contexte Ecclesia — une soirée de débat — c'est une soirée gâchée, pas un préjudice durable. Je le place donc sous F1/F2/F3, qui laissent des traces.

**Correction.** Par ordre de coût croissant : (a) plafonner côté client la fréquence des `refetch` déclenchés par broadcast (débounce ~1 s, ignorer au-delà de N/s) — quelques lignes dans `TableContext`, applicable tout de suite, réduit le DoS à une nuisance ; (b) restreindre la lecture de `table_assignments` — supprime la liste des cibles ; (c) passer les canaux en `private: true` avec des policies sur `realtime.messages` — la vraie correction, mais elle touche tout le flux temps réel et demande une recette complète.

---

### F7 — 🟡 `app_config` ne repose que sur une barrière unique

Voir §3.2. La table est correctement inaccessible aujourd'hui, mais uniquement parce que RLS est activée sans policy. Ajouter `REVOKE ALL ON app_config FROM anon, authenticated` (et de même sur `assertion_merges`) donne une seconde barrière indépendante, sans effet sur les fonctions `SECURITY DEFINER` qui s'exécutent en tant que `postgres`. Cinq minutes, aucun risque de régression.

Corollaire de discipline, plus important que la ligne SQL : **aucune fonction ne doit jamais retourner `app_config.value`**, directement ou via un `RETURNS app_config` / `to_jsonb(row)`. C'est vrai aujourd'hui — vérifié — mais rien dans le code ne l'empêche demain.

---

### F8 — 🟡 `gemini-proxy` : un JWT anonyme suffit, aucun quota

Inchangé. `supabase.auth.getUser()` est le seul contrôle, et `signInAnonymously()` en délivre un à quiconque. Ni contrôle de rôle, ni quota, ni plafond de taille de payload, ni limitation de débit.

**Risque concret Ecclesia** : facture Gemini d'un tiers, et surtout — si `moderation_policy = 'ai'` — arrêt de la modération automatique **pendant la séance**, donc assertions non filtrées à l'écran de vote. C'est le seul point du bloc C qui a un effet visible le jour J.

**Correction proportionnée** : un compteur par `user_id` en base (N appels/heure) dans l'Edge Function, plus un plafond de taille de payload. Pas besoin d'infrastructure de rate-limiting.

---

## 5. Chantier 46 — verdict dédié

C'est le point le plus sensible du moment, tu as raison ; mais le risque n'est pas là où on l'attend.

### 5.1 Ce qui est bien fait — et qui doit être conservé tel quel

La migration `20260901_chantier46_public_results_visibility.sql` est **correcte sur les trois points qui comptent** :

- **Le gate est côté serveur et il est double** : `IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND phase = 'closed' AND results_public = true) THEN RETURN NULL`. Une séance non close, ou close mais non marquée visible, retourne `NULL`. La colonne est `NOT NULL DEFAULT false` — l'opt-in est explicite et par séance. Rien à redire.
- **Le nuage de points ne contient aucun identifiant** : `jsonb_build_object('pca_x', …, 'pca_y', …, 'group_id', …)` — ni `member_id`, ni `user_id`, ni `is_self`. À comparer avec `get_results_map`, qui expose `is_self` mais est réservé au membre concerné. La distinction est faite correctement.
- **Les votes ne sortent qu'agrégés** : `COUNT(…) FILTER (WHERE av.vote = …)`, jamais une ligne d'`assertion_votes`. La policy `assertion_votes_select_own` reste la seule voie d'accès nominatif, et elle est bonne.

L'en-tête de migration porte même les requêtes de vérification à exécuter. C'est du travail soigné, et ma réponse à ta question directe est : **non, cette fonction ne laisse pas fuiter d'identifiant de participant à côté des coordonnées, et elle ne s'applique ni aux séances non closes ni aux séances non marquées visibles.**

### 5.2 Le vrai problème : l'anonymat du nuage est déjà défait ailleurs

Le chantier 46 publie des points anonymes. Mais **sur la même séance, au même instant, l'API REST publique donne** : la liste nominative des membres (F1), le statut `is_moderator`, la présence physique, la répartition en tables, et l'auteur nommé de chaque assertion approuvée.

Autrement dit, le soin apporté à anonymiser le nuage est **annulé par le contexte**. Pire : le chantier 46 met en avant, dans une modale de l'accueil, les séances closes dont les résultats sont publics — c'est-à-dire qu'il **désigne au visiteur curieux exactement les séances dont le fichier nominatif est ouvert**, et lui donne leur `id`. Il n'ouvre pas une porte, il installe un panneau devant une porte déjà ouverte.

**Recommandation de séquencement, et c'est la principale de ce rapport** : ne pas activer `results_public = true` sur une séance tant que F1 n'est pas corrigé (RLS `session_members` + `member_id` retiré d'`assertions` + purge des `reclaim_code`). Le chantier peut être fusionné — la colonne vaut `false` par défaut, rien ne s'ouvre tant que personne ne bascule le toggle. C'est le **toggle** qu'il faut retenir, pas le merge.

### 5.3 Trois points à corriger dans le chantier lui-même

**(a) `get_public_results` et `set_session_results_public` n'ont pas de `SET search_path`.** Ce sont deux fonctions neuves, écrites après que le défaut a été identifié et corrigé ailleurs dans le dépôt. Ce n'est pas exploitable (§6.1) mais c'est le moment le moins cher de le faire : deux lignes, dans une migration pas encore appliquée. `get_public_results` mérite une attention particulière — c'est la **seule fonction du schéma destinée à être appelée sans aucune authentification**, par un visiteur qui n'a même pas de JWT anonyme.

**(b) L'ordre du tableau `points` est non spécifié.** Le `jsonb_agg` sur `analysis_members` n'a pas d'`ORDER BY`, donc l'ordre restitué est celui du parcours physique, c'est-à-dire l'ordre d'insertion par `save_analysis`, lui-même l'ordre de `[...new Set(votes.map(v => v.member_id))]` (`AnalysisPanel.tsx`) — l'ordre de première apparition dans `get_all_votes_for_analysis`, soit approximativement l'ordre chronologique du premier vote de chaque membre.

Je ne considère pas cela comme exploitable aujourd'hui : reconstituer cet ordre exige de lire `assertion_votes`, qui est en `select_own`. C'est un **canal de corrélation résiduel**, pas une fuite. Mais il est gratuit à fermer, et il le sera moins plus tard : ajouter un `ORDER BY md5(am.id::text)` (ordre stable, décorrélé de tout attribut du membre) ou mélanger explicitement. À faire tant qu'on est dans le fichier.

**(c) Pas de seuil de k-anonymat.** Sur une petite séance, le nuage peut contenir cinq points dont un groupe à un seul membre — et la liste des présents est publique. Ajouter une garde dans `get_public_results` : retourner `NULL` en dessous d'un nombre plancher de points (dix me semble raisonnable pour des séances de cette taille), et ne pas publier `group_id` si un groupe compte moins de trois membres.

### 5.4 Un point de dette introduit, à connaître

`PastSessionsModal` (`EntryScreen.tsx`) liste les séances par un `select` REST direct sur `sessions` filtré côté client (`.eq('phase','closed').eq('results_public', true)`). Le filtre est **cosmétique** : la policy est `USING (true)`, n'importe qui peut retirer les `.eq()` et lire toutes les séances avec leurs `join_code`. Ce n'est pas une fuite nouvelle — c'est B6, inchangé — mais cela crée une **dépendance de plus** sur la policy permissive qu'il faudra resserrer. Le jour où `sessions_select` sera restreinte, cette modale cassera.

Prévoir dès maintenant une RPC `list_public_sessions()` ne retournant que `id, title, description, scheduled_at` des séances `closed AND results_public`, et faire pointer la modale dessus. Le chantier 46 est le bon endroit pour ça : il est le seul consommateur du besoin.

**Dernier point, non technique** : le contenu des assertions est du texte libre écrit par des participants. Il peut nommer des personnes. Le rendre public est irréversible en pratique. Une relecture humaine des assertions avant de basculer le toggle sur une séance donnée devrait faire partie de la procédure.

---

## 6. Ce qui n'est pas une faille — à distinguer nettement

Cette section existe pour éviter que du temps parte dans ce qui n'en vaut pas.

### 6.1 Les 76 fonctions `SECURITY DEFINER` sans `search_path`

**Le mécanisme.** Une fonction `SECURITY DEFINER` sans `search_path` figé résout ses noms non qualifiés avec le `search_path` **de l'appelant**. Un attaquant qui peut (a) créer un objet dans un schéma placé en amont du chemin **et** (b) influencer le `search_path` de la session, peut faire résoudre `crypt`, ou une table, vers son propre objet — et donc contrôler la vérification de mot de passe.

**Pourquoi ce n'est pas exploitable ici.** Les deux préconditions manquent :

- **(a)** L'audit du 03/08 a mesuré `has_schema_privilege('anon','public','CREATE')` → `false`, idem pour `authenticated`. Sans droit de création, rien à faire pointer. *(À revérifier — requête au §8.)*
- **(b)** Un client PostgREST **ne peut pas émettre de `SET`**. Le `search_path` d'une requête REST est celui configuré pour le rôle par Supabase, hors de portée de l'appelant.

**Verdict** : bonne pratique non respectée, **pas une vulnérabilité exploitable**. Cela n'en fait pas un non-sujet : la protection repose entièrement sur une configuration de privilèges que rien dans le dépôt ne documente ni ne teste. Une migration future qui accorde `CREATE` sur un schéma, un rôle dont le `search_path` par défaut change, ou un accès direct à la base convertissent instantanément 76 fonctions en 76 points d'entrée.

**Comment le corriger utilement** — et pas en bloc de 76 :

1. **D'abord les fonctions qui touchent aux secrets** : `check_superadmin_password`, `create_table`, `reclaim_moderator`, `claim_moderator_status`. Ce sont elles qui appellent `crypt()`, donc les seules dont le détournement donnerait autre chose qu'une nuisance. Quatre fonctions.
2. **Puis les nouvelles au fil de l'eau** : imposer `SET search_path = public, extensions` dans toute migration à venir. Les deux fonctions du chantier 46 sont le prochain cas.
3. **Le reste, jamais en bloc.**

⚠️ **Piège à signaler à qui fera la passe** : écrire `SET search_path = public` **sans `extensions`** casse les fonctions qui appellent `crypt()` — c'est exactement le bug qu'a corrigé `20260527150000_fix_crypt_path.sql`, et la panne se présente comme un « mot de passe incorrect », pas comme une erreur. Toujours `public, extensions`.

### 6.2 Autres points classés « pas une faille »

- **Aucune fonction en `SECURITY INVOKER`** — c'est une conséquence de l'architecture (pas de backend, `anon` sans droits directs), pas un défaut. Une fonction invoker ne pourrait de toute façon rien faire d'utile avec les droits d'`anon`.
- **Coût bcrypt 6** — ne compte qu'en cas de fuite du hash, or le hash ne sort pas de la base (§3.2). À remonter à 12 lors de la prochaine rotation, pas avant.
- **Mot de passe passé en argument de chaque RPC** — TLS protège le transport. Le risque de journalisation est réel mais **non vérifié**, et il ne devient un problème que si quelqu'un a déjà accès aux journaux Postgres. Requête de vérification au §8.
- **C3, `add_to_queue` et son `!=` qui échoue en ouverture** — le motif est mauvais et il faut le corriger par principe, mais l'exploitation exige un `participant_id` qui n'est pas public. Aucune urgence.
- **`assertion_merges` sans policy** — c'est le modèle correct, pas un manque. Voir §3.2.
- **Injection de prompt via les assertions (C2)** — réel, mais réparable : `apply_assertion_merge` enregistre le delta et `revert_assertion_merge` existe. Le risque est qu'une manipulation passe inaperçue, pas qu'elle soit irréversible. Relecture humaine des fusions proposées — ce que le chantier 7 impose déjà en mode manuel.

---

## 7. Ordre d'exécution recommandé

Classé par (gravité × facilité), pas par gravité seule.

| # | Action | Coût | Neutralise |
|---|---|---|---|
| 1 | Committer `db-backup.yml` + créer les deux secrets GitHub | ~1 h | Rend réversible tout le bloc A (**F3**) |
| 2 | `UPDATE session_members SET reclaim_code = NULL` sur les séances closes | 1 requête | La moitié la plus sensible de **F1** |
| 3 | Valider le schéma d'URL dans `add_collab_source` **et** à l'affichage | ~1 h | **F5** |
| 4 | Débounce/plafond sur le `refetch` déclenché par broadcast | ~30 min | Dégrade **F6** en nuisance |
| 5 | `REVOKE ALL ON app_config, assertion_merges FROM anon, authenticated` | 5 min | **F7** |
| 6 | Resserrer `session_members` + retirer `member_id` d'`assertions` ; puis revérifier `REPLICA IDENTITY FULL` | ~1 j | **F1**, dégrade **F2**, prérequis du toggle du chantier 46 |
| 7 | Rendre le `reclaim_code` obligatoire sur toute reprise d'identité ; garde de phase sur `confirm_attendance` ; **corriger le commentaire de la migration du chantier 44** | ~1 j | **F2** |
| 8 | Supprimer `tables_delete_moderator`, passer par une RPC journalisée | ~½ j | **F4** |
| 9 | `search_path` sur les 4 fonctions à `crypt()` + les 2 du chantier 46 | ~30 min | **§6.1** |
| 10 | Quota par utilisateur dans `gemini-proxy` | ~½ j | **F8** |
| 11 | Canaux Realtime privés (`private: true` + policies `realtime.messages`) | ~2-3 j + recette | **F6** à la racine |

Les cinq premières lignes tiennent en une journée et couvrent l'essentiel du risque irréversible.

---

## 8. Requêtes à exécuter (je n'ai pas eu accès à la base)

À passer dans le SQL Editor du dashboard. Aucune n'écrit.

```sql
-- 1. Confirmer la précondition qui rend §6.1 non exploitable.
--    Attendu : false partout. Si un seul true → §6.1 change de gravité.
SELECT r.rolname, n.nspname,
       has_schema_privilege(r.rolname, n.nspname, 'CREATE') AS can_create
FROM (VALUES ('anon'),('authenticated')) r(rolname)
CROSS JOIN (VALUES ('public'),('extensions')) n(nspname);

-- 2. Vérifier le search_path effectif des rôles API (précondition (b) de §6.1).
SELECT rolname, rolconfig FROM pg_roles
WHERE rolname IN ('anon','authenticated','authenticator');

-- 3. Inventaire réel des fonctions definer sans search_path, priorisées :
--    celles qui appellent crypt() sont à corriger en premier (§6.1).
SELECT p.proname,
       p.proconfig IS NULL          AS search_path_absent,
       p.prosrc ILIKE '%crypt(%'    AS touche_aux_secrets
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY touche_aux_secrets DESC, search_path_absent DESC, p.proname;

-- 4. Confirmer qu'aucune fonction ne peut retourner app_config.value (§3.2).
--    Attendu : uniquement les fonctions de vérification, aucune ne renvoyant la valeur.
SELECT p.proname, p.prorettype::regtype
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ILIKE '%app_config%';

-- 5. Mesurer l'ampleur exacte de F1 avant correction.
SELECT count(*)                                            AS membres,
       count(*) FILTER (WHERE reclaim_code IS NOT NULL)     AS codes_en_clair,
       count(*) FILTER (WHERE is_moderator)                 AS moderateurs,
       count(DISTINCT session_id)                           AS seances
FROM session_members;

-- 6. Combien d'auteurs d'assertions sont désanonymisables (F1, volet B5).
SELECT count(*) AS assertions_approuvees_avec_auteur_lisible
FROM assertions WHERE status = 'approved' AND member_id IS NOT NULL;

-- 7. Grants effectifs sur les tables sensibles (F7).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('app_config','assertion_merges','session_members')
  AND grantee IN ('anon','authenticated','PUBLIC')
ORDER BY table_name, grantee;

-- 8. Le mot de passe superadmin apparaît-il dans les journaux ? (§6.2)
SHOW log_statement;
SELECT query FROM pg_stat_statements
WHERE query ILIKE '%check_superadmin_password%' LIMIT 5;
-- Si la sortie montre le littéral et non $1, le paramètre est journalisé.

-- 9. Sanity check du chantier 46, une fois la migration appliquée.
SELECT id, title, phase, results_public FROM sessions ORDER BY scheduled_at DESC;
-- Attendu : results_public = false partout tant que personne n'a basculé le toggle.
```

---

## 9. Limites de cette revue — à lire avant de conclure quoi que ce soit

- **Aucun accès à la base.** Tout le §2.1 est établi par lecture des migrations et du code. Si des objets ont été modifiés directement dans le dashboard sans migration correspondante, je ne peux pas le voir — et le dépôt ne contient aucun mécanisme pour détecter cette dérive.
- **Aucun test actif.** Je n'ai rien exécuté contre la production. Les confirmations actives du 03/08 (A1, B4, B6) restent la seule preuve d'exploitation bout-en-bout ; je n'ai fait que vérifier que le code qui les rendait possibles n'a pas changé.
- **Les angles morts du §5 de la passation restent tous ouverts** : `npm audit` non lancé, configuration Auth Supabase non inspectée, journaux non vérifiés, B1 non confirmé en navigateur, les ~40 RPC superadmin non relues une par une. Je n'en ai levé aucun. Ils restent valables tels quels.
- **Je n'ai pas relu les ~40 RPC superadmin ligne à ligne** non plus. J'ai relu intégralement celles du chantier 46, `confirm_attendance`, `designate_moderator`, `add_collab_source`, `get_table_opinion_summary`, `save_analysis`, `get_all_votes_for_analysis`, `check_superadmin_password`, `is_table_participant`, et les deux nouvelles des chantiers 44 et 48.
- **Le second projet Supabase** (`fcdhbgsqzvxepzvjweod`, « Vote-assertions », en pause) n'a pas été examiné — même statut que dans la passation. S'il ne sert plus, le supprimer réduit la surface à coût nul.
- **`transcription-debat/`** : hors périmètre, conformément à la décision du 03/08.
- **Rappel de méthode, toujours valable** : le dépôt est public. Suppose que l'attaquant a lu ce document. Corriger côté serveur, pas côté interface ; publier les correctifs sans détailler publiquement les fenêtres encore ouvertes.
