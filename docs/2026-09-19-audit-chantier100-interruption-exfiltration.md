# Chantier 100 — Diagnostic cybersécurité : peut-on interrompre une séance, ou voler des données ?

**Date** : 2026-09-19
**Nature** : audit, aucune modification de code ni de base. Lecture seule de la base de production (`plpjiehqsxxakbuykmkm`) via MCP, plus relecture du code de `src/` et des migrations.
**Question posée par Jules** : « Cybersécu : faire une discussion check pour savoir si on est safe (personne ne peut interrompre la séance en cours) ou voler des données. »
**Référence de méthode** : [`2026-09-06-plan-securite-consolide.md`](./2026-09-06-plan-securite-consolide.md). Ce document-ci ne le remplace pas : il l'actualise au 19/09 et l'attaque sous deux angles que le plan ne traitait pas nommément — **l'interruption** d'une séance en cours et **l'exfiltration**.

> ⚠️ Le dépôt est public. Les fenêtres encore ouvertes sont nommées et localisées, sans recette d'exploitation détaillée.

---

## 1. Réponse courte

**Voler des données : non, pas à grande échelle.** Les deux fuites de masse de l'audit du 03/08 (`session_members` et `table_assignments` lisibles par tous) sont fermées et le sont restées. Le PIN de rappel n'existe plus en clair (`reclaim_code_hash`, chantier 93). `sessions` reste lisible en entier par n'importe qui (chantier 58 inachevé) — c'est de la métadonnée de séance, gênant, pas grave.

**Interrompre une séance en cours : oui, et c'est le point faible réel aujourd'hui.** Pas par un changement de phase (verrouillé par mot de passe), mais par **cinq fonctions internes exposées à `anon`** que le frontend n'appelle jamais et qui ne vérifient aucune autorité. La plus gênante, `leave_other_session_tables`, éjecte un participant désigné de sa table et coupe sa prise de parole en cours ; `clear_reclaim_attempts` efface le compteur anti-bruteforce que le chantier 93 vient juste de poser.

**Le correctif principal tient en une ligne de SQL par fonction** (`REVOKE EXECUTE ... FROM anon, authenticated`), sans toucher au frontend, puisqu'**aucune de ces fonctions n'est appelée depuis `src/`** (grep exhaustif).

---

## 2. Ce qui a été vérifié, et l'état au 19/09

### Ce qui tient

| Point | Constat du jour |
|---|---|
| Changement de phase | `set_session_phase` exige le mot de passe superadmin. Aucun autre chemin n'écrit `sessions.phase` : `sessions` n'a **aucune policy UPDATE** (RLS refuse). Un participant **ne peut pas** faire avancer ou reculer une séance. |
| Suppression de table / de séance | `delete_table_admin`, `delete_session` : mot de passe. `tables` n'a **pas** de policy DELETE (chantier 54 confirmé toujours en place). |
| Identité par pseudo seul | **Fermé** (chantier 93) : `confirm_attendance` exige nom **et** code, compare via `crypt()` sur `reclaim_code_hash`, et journalise les échecs. C'était la cause racine n°2 de l'audit du 03/08 — elle est traitée. |
| PIN de rappel en clair | **Disparu du schéma** : la colonne accordée à `anon` est `reclaim_code_hash`, pas `reclaim_code`. |
| `session_members` / `table_assignments` | Toujours self-only (`user_id = auth.uid()`, `is_own_session_member`). |
| Realtime | Les deux policies sur `realtime.messages` sont en place, `can_join_realtime_topic` est fail-closed et couvre les 8 topics (chantier 59). Émission restreinte à `extension = 'broadcast'`. |
| `search_path` des fonctions à `crypt()` | **Corrigé** (chantier 56) : `check_superadmin_password` et consorts portent `search_path=public, extensions`. L'advisor Supabase ne remonte plus qu'**1** fonction `search_path` mutable contre 68 au 06/09. |
| `app_config` / `assertion_merges` | Plus aucun grant pour `anon`/`authenticated` (chantier 56) — double barrière rétablie. |
| Dépendances front | `npm audit` : 9 vulnérabilités, **toutes dans la chaîne de build** (vite, vitest, postcss, babel, browserslist, nanoid). Rien n'est servi au navigateur en production par ces paquets. Non urgent. |

### Ce qui ne tient pas

Cinq fonctions `SECURITY DEFINER` ont `EXECUTE` accordé à `anon`, sont donc appelables par n'importe qui via PostgREST avec la clé publique du bundle, **ne vérifient aucune autorité**, et ne sont **appelées nulle part dans `src/`** — ce sont des helpers internes exposés par inadvertance.

| Fonction | Ce qu'elle fait sans aucun contrôle | Effet |
|---|---|---|
| `leave_other_session_tables(session, table, **user_id**)` | Prend le `user_id` **en paramètre** au lieu de `auth.uid()`. Supprime les lignes `participants` de cet utilisateur sur toutes les tables de la séance sauf une, met `current_speaker_id` à NULL, clôt son tour de parole en cours, et peut remettre une table en `leaderless`. | **Éjection d'un participant désigné, en plein débat, et coupure de sa parole.** Répétable. |
| `sync_table_assignment(session, table, **user_id**, pseudo)` | Même défaut de paramètre. Crée une ligne `session_members` arbitraire (`attending_in_person = true`) et écrase le `table_assignments` de la cible (`ON CONFLICT DO UPDATE`). Avale ses erreurs (`EXCEPTION WHEN OTHERS`). | Déplacement d'un participant vers une autre table ; bourrage de faux inscrits qui pèsent sur l'allocation. |
| `clear_reclaim_attempts(session, pseudo)` | `DELETE FROM reclaim_attempts` pour ce pseudo. | **Neutralise le verrou anti-bruteforce du chantier 93.** Le code de rappel n'a que 4 chiffres : sans ce verrou il n'y a plus de coût. |
| `record_reclaim_failure(session, pseudo)` | Incrémente le compteur d'échecs de n'importe quel pseudo. | Blocage volontaire d'un participant légitime (déni de service ciblé à la reconnexion). |
| `gen_member_reclaim_code(session)` | Tire un code libre pour la séance. | Fuite de faible ampleur (réduit l'espace des codes encore libres) ; aucune raison d'être public. |

Le pré-requis commun aux deux premières est de connaître le `user_id` de la victime. **Il est à portée** : `participants` accorde la colonne `user_id` à `anon`, et sa policy `SELECT` est `is_table_participant(table_id)` — donc **tout participant assis à une table lit le `user_id` de tous ses voisins**, et peut les éjecter un par un.

`reclaim_attempts` mérite en outre une note : le verrou est de **1 minute après 10 échecs**, soit ~10 essais/minute. Sur un code à 4 chiffres, même sans `clear_reclaim_attempts`, c'est un plafond faible.

### Ce qui reste ouvert depuis le plan du 06/09, et qui compte pour ces deux questions

- **C7 — `tables_update_moderator` ne restreint aucune colonne** (inchangé, vérifié). `UPDATE` est accordé à `anon` sur toutes les colonnes de `tables`, `join_code` et `session_id` compris. Quiconque est modérateur d'une table — y compris par auto-désignation sur une table `leaderless`, cf. ci-dessous — peut réécrire son `join_code` (les retardataires ne peuvent plus entrer) ou la rattacher à une autre séance. **C'est une interruption de séance à part entière**, et c'est le seul point de cette liste que le plan avait déjà identifié sans lui donner ce poids.
- **A4 — `designate_moderator`** : toujours aucun secret demandé. Un participant d'une table `leaderless` s'y fait modérateur, ce qui lui ouvre `kick_participant`, `grant_floor`, `correct_turn`, `add_offline_participant` et l'UPDATE ci-dessus. Cumulé à C7, c'est le chemin d'interruption le plus court qui ne demande aucun secret.
- **`participants_insert` n'exige que `user_id = auth.uid()`** — pas de vérification du `join_code`. Un `table_id` fuité ou deviné suffit à s'asseoir à une table. Le `table_id` ne fuite pas largement aujourd'hui (`tables` est lisible seulement par ses participants), mais la garde repose sur ce seul secret d'implémentation.
- **Régression du chantier 51** : le `REVOKE SELECT` + `GRANT SELECT (id, session_id, content, status, created_at)` sur `assertions` **n'est plus en vigueur en base** — `role_column_grants` montre aujourd'hui `member_id` de nouveau accordé à `anon` et `authenticated`. Aucune migration du dépôt ne le réaccorde : le grant a été rétabli hors migration. L'auteur d'une assertion redevient donc corrélable par identifiant pseudonyme (pas par nom, `session_members` restant self-only). **Point à reprendre**, et surtout symptôme : une correction posée uniquement par `GRANT` se défait sans laisser de trace dans le dépôt.
- **`sessions` lisible en entier** (chantier 58 inachevé) : `join_code`, `group_names`, URLs des documents de préparation, phase. Sert de point de départ à tout le reste, mais ne donne accès à aucune donnée personnelle.
- **`session_sources` en `USING (true)`** : 0 ligne, inchangé.
- **Sauvegardes** : toujours absentes de `main` (chantier 85, bloqué sur deux secrets GitHub). Reste le pire des risques de ce dossier : n'importe laquelle des interruptions ci-dessus se répare à la main, une perte de base ne se répare pas du tout.

---

## 3. Verdict par question

### « Personne ne peut interrompre la séance en cours ? »

Non, ce n'est pas le cas aujourd'hui. Trois chemins, par ordre de facilité :

1. **`leave_other_session_tables` sur un voisin de table** — aucun secret, aucune autorité, un appel HTTP. Éjecte et coupe la parole.
2. **Auto-désignation sur une table `leaderless`, puis réécriture du `join_code`** (A4 + C7) — aucun secret non plus, puisque `designate_moderator` n'en demande pas.
3. **`sync_table_assignment`** pour déplacer des gens de table ou gonfler la liste des inscrits avant l'allocation.

Aucun de ces chemins ne détruit de données (le chantier 54 a bien retiré le levier destructeur) ni ne change la phase. Ce sont des interruptions **réparables** — mais en séance réelle, réparable veut dire « le débat s'arrête pendant qu'on répare ».

### « Personne ne peut voler des données ? »

Pas de fuite de masse. Le seul scénario d'exfiltration ciblée crédible est la prise d'identité d'un participant dont on connaît le nom, en brute-forçant son code à 4 chiffres — le chantier 93 l'a rendu coûteux, `clear_reclaim_attempts` annule ce coût. Fermer cette fonction referme le scénario.

---

## 4. Ce que je recommande, dans cet ordre

1. **`REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated`** sur les cinq fonctions du §2, plus `generate_session_join_code`, toutes inutilisées par `src/` (grep). Coût : une migration d'une dizaine de lignes, aucun changement de frontend, aucun risque de casse silencieuse — elles restent appelables depuis les RPC `SECURITY DEFINER` qui les utilisent en interne (contrôle du droit contre le propriétaire, `postgres`). **C'est le meilleur rapport effet/risque du dossier après les sauvegardes.**
   > ⚠️ **Correction du 19/09, même jour** : une première version de cette recommandation ajoutait à la liste `is_table_participant`, `is_table_moderator`, `is_own_session_member` et `can_join_realtime_topic`. **Il ne faut pas les révoquer** — elles sont appelées dans les expressions de policies RLS, évaluées avec les droits du rôle appelant : leur retirer `EXECUTE` risque de vider en silence les lectures de tables, files et tours de parole. Elles ne renvoient qu'un booléen sur l'appelant. Détail dans [`2026-09-19-plan-anti-interruption-seance.md`](./2026-09-19-plan-anti-interruption-seance.md), lot 1.
2. **Passer `leave_other_session_tables` et `sync_table_assignment` à `auth.uid()`** au lieu d'un paramètre `p_user_id`, pour que le point 1 ne dépende pas que du grant. `join_table` est leur seul appelant et leur passe déjà `auth.uid()`.
3. **C7** : restreindre `tables_update_moderator` aux colonnes d'animation (`current_speaker_id`, `current_turn_started_at`, `leaderless`) — en pratique, un grant de colonnes ou un passage par RPC. Ferme le chemin 2.
4. **Rétablir la restriction de colonne du chantier 51 sur `assertions`**, *dans une migration du dépôt*, et vérifier ensuite qu'elle tient.
5. **Durcir `reclaim_attempts`** : verrou plus long et croissant (1 min fixe après 10 échecs est faible sur 4 chiffres).
6. **Les sauvegardes (chantier 85)** restent devant tout le reste dès que Jules crée les deux secrets.

Rien de tout cela ne relève du chantier 100 lui-même, qui est un constat. Chacun de ces points mérite son propre chantier, et le 1 peut être fait seul, sans Jules, sans risque de verrouillage.

---

## 5. Limites de cet audit

- **Aucun test actif.** Rien n'a été exploité contre la production : tout ce qui précède est déduit des définitions de fonctions, des policies, des grants et du code. Les vecteurs du §2 sont **théoriquement** exploitables ; ils n'ont pas été joués. Voir `A_VERIFIER.md`.
- **Pas de navigateur.** La réserve du chantier 51 (`member_id` dans la charge utile Realtime `postgres_changes`) reste non testée — et devient moins pertinente puisque la colonne est de toute façon lisible en REST aujourd'hui.
- **Configuration Auth non inspectée** (débit de `signInAnonymously`) — conditionne l'ampleur de toute attaque en volume, y compris le brute-force du §2.
- **Journaux Postgres/PostgREST non consultés** : la question C6 (le mot de passe superadmin apparaît-il dans les logs ?) reste sans réponse, comme au 06/09.
- **Les ~40 RPC superadmin n'ont pas été relues une par une** — seules leur garde de mot de passe et leur `search_path` l'ont été.
- **`transcription-debat/` hors périmètre**, comme depuis le 03/08.
