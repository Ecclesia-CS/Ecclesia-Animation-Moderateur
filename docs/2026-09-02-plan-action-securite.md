# Plan d'action sécurité — Ecclesia

**Date** : 2026-09-02
**Suite de** : [2026-09-02-audit-securite-revue.md](./2026-09-02-audit-securite-revue.md), lui-même revue de [audit-securite-2026-08-03.md](./audit-securite-2026-08-03.md) et [audit-securite-passation.md](./audit-securite-passation.md).
**Nature** : plan. **Session en lecture seule** — aucun code, aucune migration, aucun fichier de suivi modifié. Le SQL et les modifications de code cités sont des propositions à appliquer par les sessions de chantier.
**État de référence** : `main` au commit `88182bf`, sept branches mergées et déployées, les quatre migrations en attente (chantiers 44, 46, 48 + antérieures) **appliquées en base**.

---

## 0. Faits établis en entrée

Confirmés en base par Jules le 02/09 (je n'ai pas d'accès Supabase — tout le reste de ce plan repose sur la lecture du code et des migrations) :

- RLS actif sur les 18 tables. `app_config` et `assertion_merges` : RLS actif, zéro policy → refus total en accès direct.
- Policies SELECT permissives sans condition (`qual = true`, rôle `public`) sur : **`session_members`**, **`table_assignments`**, **`sessions`**, **`session_sources`**, **`collab_session_users`**.
- `session_members` expose `id, session_id, user_id, pseudo, created_at, joined_phase, attending_in_person, reclaim_code, is_moderator` — **`reclaim_code` en clair, lisible avec la clé anonyme du site**.
- `table_assignments` expose `id, session_id, member_id, table_number, table_id, created_at` — la composition des tables est publique.
- `sessions.results_public` existe, défaut `false`, les quatre séances closes sont redevenues privées.

Deux conséquences de la mise en production des chantiers 44 et 48 : `add_offline_participant` et `switch_table` sont **vivantes**, et avec elles le motif `ON CONFLICT … DO UPDATE SET user_id` qu'elles rejouent. Ce n'est plus une remarque sur du code en attente.

**Fenêtre exploitable** : Jules n'utilise pas l'application en production. Tout ce qui casse pendant cette fenêtre ne casse pour personne. C'est le moment de faire les changements risqués — pas ceux qui sont faciles.

---

## 1. L'inventaire qui conditionne tout le plan

*Tu as raison de dire qu'un plan qui ignore ça n'est pas exécutable. J'ai donc commencé par là, et le résultat réoriente l'ordre.*

### 1.1 Ce qui lit `session_members` en direct

| Site | Requête | Cassé par `USING (user_id = auth.uid())` ? |
|---|---|---|
| `TableContext.tsx:147` | `.select('is_moderator').eq('session_id', …).eq('user_id', userId)` | **Non** — déjà scopé à soi |
| `SessionRouterScreen.tsx:72` | `.select('id').eq('session_id', …).eq('user_id', userId)` | **Non** |
| `SessionRouterScreen.tsx:90` | `.select('id').eq('session_id', …).eq('user_id', userId)` | **Non** |
| `VoteScreen.tsx:178` | `.select('*').eq('session_id', …).eq('user_id', authSession.user.id)` | **Non** |

**Les quatre lectures sont déjà self-only.** Le front n'a jamais eu besoin de lire les autres membres en direct — tout le reste passe déjà par des RPC gardées par mot de passe (`list_session_members_admin`, `get_allocation_inputs`, `get_session_voting_stats`). C'est la bonne nouvelle du plan : **la policy la plus dangereuse est aussi celle dont le retrait casse le moins.**

### 1.2 Ce qui lit `table_assignments` en direct

| Site | Requête | Cassé ? |
|---|---|---|
| `SuperadminScreen.tsx:1381` | `.select('table_number, member_id, table_id, session_members!member_id(pseudo, is_moderator)')` | **OUI — c'est le seul vrai point de casse** |

C'est une jointure imbriquée PostgREST qui traverse **les deux** tables permissives à la fois. Elle alimente `loadGroups()`, donc l'onglet **Tables/Groupes** du superadmin : composition des tables, glisser-déposer, `TableDiagnosticsList`. Et il faut bien voir pourquoi elle marche aujourd'hui : **`SuperadminScreen` lit la base avec la clé anonyme comme tout le monde** — le mot de passe superadmin ne garde que les RPC, il ne confère aucun rôle PostgreSQL. Le superadmin n'a donc aucun privilège de lecture directe.

Sous une policy restrictive, PostgREST ne renvoie **pas d'erreur** : l'objet imbriqué devient `null` et la liste des membres se vide. Une régression silencieuse, la pire espèce. C'est ce qui impose de livrer la RPC de remplacement **dans le même chantier que la policy**, jamais après.

### 1.3 Les abonnements Realtime « session-wide » — faux positifs

| Site | Filtre serveur | Traitement |
|---|---|---|
| `TableContext.tsx:312` | `session_members`, `session_id=eq.…` | `if (r.user_id !== userId) return` |
| `AllocatingScreen.tsx:70,86` | `table_assignments`, `session_id=eq.…` | `if (row.member_id !== member.id) return` |

Les deux **jettent immédiatement tout ce qui n'est pas soi**. Une policy restrictive continue de délivrer exactement les lignes qu'ils utilisent et supprime le reste : pas de régression, et au passage la fin d'une diffusion excessive (aujourd'hui chaque participant reçoit les UPDATE de tous les membres de sa séance, `reclaim_code` compris, `REPLICA IDENTITY FULL` oblige). **Le point ouvert de la passation sur `REPLICA IDENTITY FULL` se referme donc tout seul** avec la policy — c'est le même correctif.

Un seul abonnement perd quelque chose : `SuperadminScreen.tsx:1502` (`table_assignments`, déclenche `loadGroups()`). Le superadmin n'étant membre de rien, il ne recevra plus d'événement → l'onglet Tables cesse de se rafraîchir tout seul. Compensation dans le même chantier (§3, chantier 50).

### 1.4 Ce qui lit `sessions` en direct — la vraie difficulté

**13 sites**, dont **8 en `select('*')`** : `TableContext:140`, `AllocatingScreen:155`, `PublicResultsScreen:145`, `SessionRouterScreen:44`, `SuperadminScreen:125`, `VoteScreen:154/467/586`.

Deux constats qui changent le cadrage de B6 :

1. **La lecture publique de `sessions` est en partie voulue.** `EntryScreen` liste les séances en cours **avec leur `join_code`** à tout visiteur anonyme de la page d'accueil (`:78`), et fait de même pour les listes déroulantes « créer une table » (`:92`) et « je suis modérateur » (`:105`). Ce n'est pas une fuite accidentelle, c'est le parcours d'entrée. Restreindre `sessions` par ligne casserait la page d'accueil.
2. **Ce qui fuit au-delà de ce parcours est une affaire de colonnes** : `description`, `doc_info_url`, `doc_summary_url`, `doc_collab_url`, `group_names`, plus les séances en `draft`. Or une restriction par colonne (`GRANT SELECT (…)`) fait **échouer tout `select('*')`** — les 8 sites ci-dessus, dont celui du superadmin.

Conclusion : le chantier `sessions` est le plus coûteux et le moins urgent des trois. Il est repoussé en fin de plan (chantier 58), et son préalable est mécanique : convertir les 8 `select('*')` en listes de colonnes explicites.

### 1.5 Les deux policies gratuites

- **`session_sources`** : **aucune lecture directe dans `src/`**. Tout passe par la RPC `list_session_sources` (`lib/sessions.ts:368`). La policy `USING (true)` est du poids mort — sauf pour l'abonnement Realtime `CollabDocScreen:140`, seule dépendance.
- **`collab_session_users`** : une seule lecture, `CollabDocScreen.tsx:83`, `.eq('user_id', uid)` → self-only. Une policy `user_id = auth.uid()` ne casse rien.

Ces deux-là se ferment presque sans risque et sont regroupées dans le chantier 52, avec la correction XSS qui touche déjà le même écran.

### 1.6 `assertions.member_id`

`VoteScreen` est déjà discipliné : `:307` et `:440` listent les colonnes et **excluent `member_id`** (commentaire « E2 — anonymat des auteurs »). Le masquage est donc voulu côté front — il est simplement contourné par l'API.

Un seul site filtre sur la colonne : `VoteScreen.tsx:316`, `.select('id').eq('member_id', m.id)` — « mes propres assertions ». En PostgreSQL, un `GRANT SELECT (colonnes)` interdit aussi la colonne en clause `WHERE` : ce site cassera et devra passer par une RPC. C'est le seul.

---

## 2. Ordre d'exécution, et pourquoi

Trois critères, dans cet ordre :

**(1) L'irréversible d'abord.** Ce qui est déjà sorti ne se rattrape pas. Les 29 `reclaim_code` et les noms sont lisibles *maintenant* ; chaque jour de plus est une copie possible de plus. La purge (chantier 49) précède tout parce qu'elle est la seule action qui réduit le préjudice déjà en cours, et qu'elle ne dépend de rien.

**(2) Le levier ensuite.** Fermer `session_members` (chantier 50) neutralise F1, coupe l'alimentation de F2 (plus de liste de pseudos à moissonner), retire la moitié des données de F6 (plus de cibles), et referme le point `REPLICA IDENTITY FULL`. Un chantier, quatre constats. Et l'inventaire du §1.1 montre qu'il ne casse qu'un seul écran, identifié, avec un remplacement connu. C'est le meilleur rapport effet/risque du dossier.

**(3) Le risque de casse en dernier, pendant la fenêtre.** `sessions` (58) et les canaux Realtime privés (59) sont les deux chantiers qui peuvent casser l'app en profondeur. Ils viennent après, mais **doivent rester dans la fenêtre sans production** : les faire plus tard, c'est les faire sous contrainte de séance.

Ce qui fait remonter ou descendre un chantier hors de sa gravité brute :

- **52 (XSS) remonte** malgré 0 ligne en base : il ne dépend de rien, coûte une heure, et le jour où une séance utilise le doc collaboratif il devient une chaîne complète vers `delete_session`. Le corriger maintenant coûte moins que se rappeler de le corriger plus tard.
- **53 (débounce broadcast) remonte** pour la même raison : trente minutes, un seul fichier, dégrade un DoS confirmé en nuisance. Il ne *résout* pas F6 (c'est 59 qui le fait) mais il tient jusque-là.
- **55 (preuve de possession) descend** malgré sa gravité : il change l'expérience des participants et exige un arbitrage de Jules (§5). Le mettre en tête, c'est bloquer le plan sur une décision produit.
- **56 (`search_path`) descend** : ma revue a établi que ce n'est pas exploitable en l'état. Il reste au plan parce qu'il est bon marché et qu'il protège d'un changement de configuration futur, pas parce qu'il presse.

---

## 3. Les chantiers

Format du projet : un chantier = une unité confiable à une session, périmètre non chevauchant.

---

### Chantier 49 — Purge et rétention des données personnelles

**Objectif** : réduire *maintenant* ce qui est exposé, avant même de changer une policy.
**Périmètre** : SQL seul. **Aucun fichier `src/`.**

**Correctif proposé**

```sql
-- 1. Les codes de rappel n'ont plus d'usage après la clôture d'une séance :
--    ils ne servent qu'à retrouver son inscription entre pre_voting et voting.
UPDATE session_members sm
SET reclaim_code = NULL
FROM sessions s
WHERE s.id = sm.session_id
  AND s.phase = 'closed'
  AND sm.reclaim_code IS NOT NULL;

-- 2. Purge automatique à la clôture — à ajouter dans close_session()
--    (et dans set_session_phase() quand la phase cible est 'closed').
--    Évite que le stock se reconstitue à chaque séance.
```

**Risque de régression** : **nul sur les séances closes.** `confirm_attendance` et `reclaim_prevoting_member` ne consultent `reclaim_code` que sur des séances actives ; `reclaim_prevoting_member` refuse déjà hors `pre_voting`. Le seul effet visible serait sur une séance close qu'on rouvrirait — cas qui n'existe pas dans les transitions de phase de l'app.
**Point de vigilance** : `close_session` et `set_session_phase` sont deux chemins distincts vers `closed`. Traiter les deux, sinon la purge est contournée une fois sur deux.

**Arbitrage Jules requis** : oui, sur la suite — faut-il aussi purger ou pseudonymiser `session_members.pseudo` (nom et prénom réels) au-delà d'un certain délai, une fois l'analyse produite ? Voir §5.

---

### Chantier 50 — Fermer la lecture directe de `session_members` et `table_assignments`

**Objectif** : F1 (fuite active), et couper l'alimentation de F2.
**Périmètre** : 1 migration SQL, `src/lib/voting.ts` (wrapper), `src/screens/SuperadminScreen.tsx` (`loadGroups` + fallback Realtime).
**C'est le chantier central du plan.**

**Correctif proposé**

```sql
-- Helper anti-récursion, sur le modèle existant is_table_participant()
CREATE OR REPLACE FUNCTION is_own_session_member(p_member_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM session_members WHERE id = p_member_id AND user_id = auth.uid()
  );
$$;

DROP POLICY session_members_select ON session_members;
CREATE POLICY session_members_select_own ON session_members
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY table_assignments_select ON table_assignments;
CREATE POLICY table_assignments_select_own ON table_assignments
  FOR SELECT USING (is_own_session_member(member_id));

-- Remplacement de la jointure imbriquée de loadGroups()
CREATE OR REPLACE FUNCTION list_table_assignments_admin(
  p_password text, p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM check_superadmin_password(p_password);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_number', ta.table_number,
    'member_id',    ta.member_id,
    'table_id',     ta.table_id,
    'pseudo',       sm.pseudo,
    'is_moderator', sm.is_moderator
  ) ORDER BY ta.table_number), '[]'::jsonb) INTO v_rows
  FROM table_assignments ta
  JOIN session_members sm ON sm.id = ta.member_id
  WHERE ta.session_id = p_session_id;
  RETURN v_rows;
END; $$;

GRANT EXECUTE ON FUNCTION list_table_assignments_admin(text, uuid) TO anon, authenticated;
```

Côté code : `loadGroups()` (`SuperadminScreen.tsx:1376-1400`) troque son `.from('table_assignments').select(… session_members!member_id …)` contre un appel au wrapper. La forme du résultat est volontairement identique (`table_number`, `member_id`, `table_id`, `pseudo`, `is_moderator`) pour que la construction de `GroupRow` en aval ne bouge pas.

**Risque de régression — le détail**

| Ce qui pourrait casser | Verdict |
|---|---|
| Les 4 lectures `session_members` du front (§1.1) | **Aucun risque** — toutes déjà `.eq('user_id', …)` |
| `TableContext:312` / `AllocatingScreen:70,86` (Realtime session-wide) | **Aucun risque** — filtrent côté client sur soi ; ils recevront moins et utiliseront autant |
| `VoteScreen:129` (Realtime `id=eq.<member.id>`) | **Aucun risque** — self |
| `SuperadminScreen.loadGroups` | **CASSE, silencieusement** — objet imbriqué à `null`, listes de membres vides sans erreur. Corrigé dans le même chantier. |
| `SuperadminScreen:1502` (Realtime `table_assignments` → `loadGroups`) | **Dégradé** : le superadmin ne recevra plus d'événement. Compenser par un `setInterval` de 10 s sur `loadGroups` tant que la phase est `allocating`/`debating`, sur le modèle des pollings de secours déjà présents dans `VoteScreen`/`AllocatingScreen`. |
| `get_my_table_assignment`, `get_allocation_inputs`, `list_session_members_admin`, `apply_allocation`, `get_session_voting_stats` | **Aucun risque** — `SECURITY DEFINER`, exécutées en tant que `postgres`, insensibles à la RLS |
| Le glisser-déposer de l'onglet Tables (`move_member_to_group`) | **Aucun risque** en écriture (RPC) ; l'affichage suit `loadGroups` |

**Recette obligatoire avant de clore** (l'app tourne, personne en prod) : ouvrir une séance en `allocating`, vérifier que l'onglet Tables affiche bien les membres par table, faire un glisser-déposer et vérifier la mise à jour ; côté participant, vérifier qu'`AllocatingScreen` reçoit toujours son affectation ; vérifier qu'un `GET /rest/v1/session_members` anonyme retourne désormais `[]`.

**Effet collatéral positif** : le point ouvert de la passation sur `REPLICA IDENTITY FULL` est résolu par ce chantier — le WAL continue de transporter toutes les colonnes, mais Realtime ne les livre plus qu'au propriétaire de la ligne. À vérifier explicitement dans la recette (un participant B ne doit plus recevoir d'événement pour le membre A).

---

### Chantier 51 — Anonymat réel des auteurs d'assertions

**Objectif** : F1, volet B5 — rendre effectif le masquage que `20260721_hide_assertion_author` visait.
**Périmètre** : 1 migration SQL, `src/screens/VoteScreen.tsx` (un seul site), `src/lib/voting.ts`.

**Correctif proposé**

```sql
-- La policy reste, on retire l'accès à la colonne d'auteur.
REVOKE SELECT ON assertions FROM anon, authenticated;
GRANT  SELECT (id, session_id, content, status, created_at)
  ON assertions TO anon, authenticated;

-- Remplacement de VoteScreen.tsx:316 (.eq('member_id', m.id) devient interdit)
CREATE OR REPLACE FUNCTION get_my_assertion_ids(p_session_id uuid)
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, extensions AS $$
  SELECT COALESCE(array_agg(a.id), '{}')
  FROM assertions a
  JOIN session_members sm ON sm.id = a.member_id
  WHERE a.session_id = p_session_id AND sm.user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION get_my_assertion_ids(uuid) TO anon, authenticated;
```

**Risque de régression**

| | |
|---|---|
| `VoteScreen:307` et `:440` | **Aucun** — listent déjà les colonnes, `member_id` exclu |
| `VoteScreen:316` | **CASSE** — un filtre `WHERE` sur une colonne non accordée est refusé. Remplacé par la RPC ci-dessus. |
| `submit_assertion`, `approve_assertion`, `apply_assertion_merge`, `listAssertionsAdmin`, `get_vote_results` | **Aucun** — `SECURITY DEFINER` |
| `VoteScreen:365` (Realtime sur `assertions`) | **À vérifier** — je ne peux pas confirmer sans base si Realtime applique les privilèges de colonne aux charges utiles `postgres_changes`. Si la charge utile continue de porter `member_id`, la fuite passe par le WebSocket et il faut alors restreindre le `SELECT` autrement (vue dédiée, ou RPC de polling). **Point de recette bloquant.** |

**Note de conception** : cette approche par privilèges de colonne est plus fine qu'une policy et n'existe nulle part ailleurs dans le projet. Si la vérification Realtime ci-dessus est négative, la solution de repli est une **vue** `assertions_public` sans `member_id`, avec sa propre policy, et le front lit la vue.

---

### Chantier 52 — Validation des URL de sources, et fermeture des deux policies collaboratives

**Objectif** : F5 (XSS stocké → mot de passe superadmin → `delete_session`), plus les deux policies gratuites du §1.5.
**Périmètre** : 1 migration SQL, `src/screens/CollabDocScreen.tsx`, `src/screens/SuperadminScreen.tsx` (rendu des liens, ~l.4249).

**Correctif proposé**

```sql
-- 1. Validation à l'écriture, dans add_collab_source et update_collab_source
IF p_url IS NOT NULL AND p_url !~* '^https?://' THEN
  RAISE EXCEPTION 'URL invalide : seuls http:// et https:// sont acceptés.';
END IF;

-- 2. Les pseudos collab n'ont pas à être publics — un seul lecteur, self-only
DROP POLICY "collab_session_users_select" ON collab_session_users;
CREATE POLICY collab_session_users_select_own ON collab_session_users
  FOR SELECT USING (user_id = auth.uid());
```

Côté code, un helper partagé — la validation à l'affichage protège les lignes déjà en base, celle à l'écriture protège les surfaces futures. Faire les deux :

```ts
// lib/utils.ts
export function safeUrl(u: string | null): string | undefined {
  if (!u) return undefined
  try {
    const p = new URL(u)
    return p.protocol === 'http:' || p.protocol === 'https:' ? u : undefined
  } catch { return undefined }
}
```
Puis `href={safeUrl(source.url)}` aux deux sites de rendu (`CollabDocScreen:593`, `SuperadminScreen:4249`), avec un rendu en texte simple quand `undefined`.

**Risque de régression** : **faible.**
- Validation d'URL : refuse des saisies aujourd'hui acceptées (`www.exemple.fr` sans schéma). Prévoir de préfixer `https://` automatiquement plutôt que de rejeter, sinon c'est une régression d'usage. `session_sources` contient 0 ligne — aucun existant à casser.
- `collab_session_users` : un seul lecteur, self-only (`CollabDocScreen:83`). Aucun risque.
- **`session_sources` n'est PAS touchée dans ce chantier**, volontairement : sa policy `USING (true)` est du poids mort côté REST mais elle **conditionne l'abonnement Realtime** `CollabDocScreen:140`. La fermer exige de remplacer le Realtime par un polling sur `list_session_sources`. C'est un travail distinct, sans urgence (0 ligne en base) — à traiter avec le chantier 58 ou à laisser.

**Ne couvre pas** : sortir le mot de passe de `sessionStorage`. C'est le durcissement de fond, nettement plus coûteux, et il ne doit pas retarder la validation d'URL qui suffit à couper la chaîne.

---

### Chantier 53 — Plafonner le refetch déclenché par broadcast

**Objectif** : dégrader F6 (DoS Realtime confirmé) en nuisance, en attendant 59.
**Périmètre** : `src/context/TableContext.tsx` **seul**.

**Correctif proposé** — au handler `ch.on('broadcast', { event: 'refresh' })` (`:269`) : un débounce d'environ 1 s et un compteur glissant qui ignore au-delà de ~5 messages/seconde. Le broadcast est un simple signal de rattrapage ; le polling 5 s et les mises à jour locales immédiates couvrent déjà le cas nominal, donc perdre des signaux excédentaires ne coûte rien.

**Risque de régression** : **faible mais réel.** Le broadcast est la couche 2 des quatre décrites dans `CLAUDE.md` ; un débounce trop agressif ajoute jusqu'à 1 s de latence perçue sur l'octroi de parole quand plusieurs actions s'enchaînent. Recette : enchaîner rapidement « donner la parole → fin de tour → suivant » sur deux appareils et vérifier que rien ne se fige. Ne pas descendre sous 500 ms.

**Ne résout pas F6** : un attaquant peut toujours saturer le canal côté serveur. Seul le chantier 59 ferme la porte.

---

### Chantier 54 — Retirer le droit de suppression directe aux modérateurs

**Objectif** : F4 — réduire ce que permet le mot de passe modérateur, **sans toucher au mot de passe** (contrainte produit posée par Jules).
**Périmètre** : 1 migration SQL, `src/context/TableContext.tsx` (`endTable`, `:498`).

**Correctif proposé**

```sql
DROP POLICY tables_delete_moderator ON tables;

CREATE OR REPLACE FUNCTION end_table(p_table_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  INSERT INTO table_events(table_id, actor, kind) VALUES (p_table_id, auth.uid(), 'end_table');
  DELETE FROM tables WHERE id = p_table_id;
END; $$;
```

Plus une table de journal minimale (`table_events` : `table_id`, `actor`, `kind`, `created_at`, RLS sans policy) alimentée aussi par `reclaim_moderator` et `designate_moderator` sur chaque changement de `created_by`. Cela ne bloque rien mais rend l'incident lisible après coup — ce qui manque totalement aujourd'hui.

**Risque de régression** : **faible et localisé.** `TableContext:498` (`.from('tables').delete().eq('id', tableId)`) est le seul appelant ; il devient `rpc('end_table', …)`. Attention à la gestion d'erreur : `endTable` remonte aujourd'hui une `PostgrestError`, à passer par `extractErr` (règle du projet). Recette : bouton « Terminer la table » côté modérateur, vérifier la cascade et l'overlay de fin côté participants.

**Variante à arbitrer** : remplacer le `DELETE` par un `closed_at` (soft-delete) plutôt que de le déplacer dans une RPC. Plus sûr — plus rien ne s'efface — mais cela touche toutes les requêtes qui listent des tables. Voir §5.

---

### Chantier 55 — Preuve de possession sur les reprises d'identité

**Objectif** : F2. **Le seul chantier bloqué par un arbitrage produit.**
**Périmètre** : 1 migration SQL (`confirm_attendance`, `reclaim_prevoting_member`, `join_table`, `switch_table`, `register_collab_pseudo`), `src/screens/VoteScreen.tsx`, `src/components/…/PseudoForm`, `VotingEntryForm`, `AttendanceConfirmScreen`.

**Correctif proposé** (sous réserve de l'arbitrage §5) :
1. `confirm_attendance` : supprimer le **cas 3 par pseudo seul**. Le code de rappel devient obligatoire pour reprendre une inscription existante ; le pseudo seul ne peut plus que **créer** un membre, jamais en transférer un.
2. Ajouter une garde de phase à `confirm_attendance` — elle n'en a aucune aujourd'hui et s'applique donc même à une séance `closed`. `reclaim_prevoting_member` en a une : c'est le modèle à recopier.
3. `join_table` / `switch_table` : ne transférer `user_id` que si le `user_id` existant est celui de l'appelant ; sinon, refuser avec un message explicite (« ce prénom est déjà pris à cette table »).
4. **Corriger le commentaire d'en-tête de `20260902_chantier44_add_offline_participant.sql`**, qui présente le motif comme un choix à préserver. Tant que cette ligne est là, le prochain chantier le recopiera.

**Risque de régression** : **le plus élevé du plan, et il est fonctionnel, pas technique.** Le cas « j'ai changé de téléphone / vidé mon navigateur et je retape mon nom » cesse de fonctionner. Sur une séance réelle, cela se traduit par des participants bloqués à l'entrée. Le chemin de secours doit exister **avant** le durcissement : soit le code de rappel (déjà affiché en `pre_voting`, mais pas généré pour les inscriptions en `voting`), soit une action superadmin « rattacher ce membre à cet appareil » depuis la liste des participants.

**À faire dans cet ordre** : d'abord le chemin de secours, ensuite le durcissement. Sinon on transforme une faille en panne d'accueil.

---

### Chantier 56 — Durcissement SQL ciblé

**Objectif** : §6.1 de la revue (`search_path`) et F7 (`app_config`).
**Périmètre** : 1 migration SQL. **Aucun fichier `src/`.**

**Correctif proposé**

```sql
-- Seconde barrière indépendante sur les tables à zéro policy
REVOKE ALL ON app_config       FROM anon, authenticated;
REVOKE ALL ON assertion_merges FROM anon, authenticated;

-- search_path figé sur les seules fonctions qui manipulent les secrets
ALTER FUNCTION check_superadmin_password(text)      SET search_path = public, extensions;
ALTER FUNCTION create_table(text, text, uuid, boolean) SET search_path = public, extensions;
ALTER FUNCTION reclaim_moderator(text, text)        SET search_path = public, extensions;
ALTER FUNCTION claim_moderator_status(uuid, text, text) SET search_path = public, extensions;
-- + get_public_results(uuid) et set_session_results_public(text, uuid, boolean)
```

**Risque de régression** : **faible, avec un piège précis.** Écrire `SET search_path = public` **sans `extensions`** casse toute fonction appelant `crypt()` — c'est exactement le bug corrigé par `20260527150000_fix_crypt_path.sql`, et il se manifeste par un « mot de passe incorrect », pas par une erreur SQL. Toujours `public, extensions`. Recette : se connecter au superadmin et créer une table avec le code Ecclesia — si les deux marchent, les quatre fonctions sont bonnes.

**Vérifier les signatures exactes avant d'écrire l'`ALTER`** : plusieurs de ces fonctions ont des variantes surchargées (`reclaim_moderator` à 2 et 3 arguments, `claim_moderator_status` à 2 et 3). Requête n°3 du §7 pour l'inventaire exact.

**Ne pas faire les 76 en bloc.** Rappel de la revue : non exploitable en l'état (`anon` sans `CREATE`, PostgREST sans `SET`). Les nouvelles migrations doivent porter la clause par défaut ; le stock existant ne justifie pas un chantier.

---

### Chantier 57 — Quota sur `gemini-proxy`

**Objectif** : F8.
**Périmètre** : `supabase/functions/gemini-proxy/index.ts` **seul**. Aucun fichier `src/`, aucune policy.

**Correctif proposé** : compteur par `user_id` en base (une table `gemini_usage`, RLS sans policy, écrite par la fonction avec la clé service) — N appels/heure, plus un plafond de taille de charge utile. Refus explicite au-delà.

**Risque de régression** : **réel sur l'auto-modération.** `LLMModerationPanel` et l'auto-analyse tournent en `setInterval` et peuvent produire des rafales légitimes. Calibrer le quota au-dessus du pire cas observé en séance (auto-modération toutes les minutes + auto-fusion + nommage des camps) et **journaliser les refus** — un quota qui coupe la modération pendant une séance est pire que le problème qu'il corrige.

---

### Chantier 58 — Restreindre les colonnes de `sessions`

**Objectif** : F1/B6, ce qui fuit au-delà du parcours d'entrée volontaire.
**Périmètre** : **large et transverse** — 1 migration + 8 sites `select('*')` + `SuperadminScreen`. À faire **seul**, en fin de fenêtre.

**Préalable mécanique** : convertir les 8 `select('*')` (§1.4) en listes de colonnes explicites, **et vérifier que l'app tourne encore**, *avant* de toucher aux privilèges. Cette étape seule peut constituer un chantier séparé si la session manque de marge.

**Correctif proposé**

```sql
REVOKE SELECT ON sessions FROM anon, authenticated;
GRANT  SELECT (id, title, phase, join_code, scheduled_at, results_public, phase_changed_at)
  ON sessions TO anon, authenticated;
-- description, doc_*_url, group_names, moderation_policy : hors de portée directe
```

Puis deux RPC de remplacement : `get_session_docs(p_session_id)` gardée par `is_table_participant` ou l'appartenance à la séance (pour `ModeratorView:121` et `ParticipantView:94`), et `list_sessions_admin(p_password)` pour `SuperadminScreen:125`.

**Risque de régression** : **le plus élevé du plan sur le plan technique.** Un `select('*')` oublié fait échouer la requête entière, pas seulement la colonne. Les écrans concernés sont ceux du parcours critique : `VoteScreen`, `AllocatingScreen`, `SessionRouterScreen`, `TableContext`, `SuperadminScreen`. Recette obligatoire : parcours complet `pre_voting → voting → allocating → debating → closed` de bout en bout.

**À noter** : la liste des séances en cours **avec leur `join_code`** reste publique après ce chantier — c'est le parcours d'entrée voulu (§1.4). Si Jules veut aussi fermer ça, c'est un arbitrage produit distinct (§5).

---

### Chantier 59 — Canaux Realtime privés

**Objectif** : F6 à la racine.
**Périmètre** : `src/context/TableContext.tsx`, `AllocatingScreen`, `VoteScreen`, `CollabDocScreen`, `SuperadminScreen` + policies sur `realtime.messages`. **Le plus gros du plan.**

**Correctif proposé** : `supabase.channel(name, { config: { private: true } })` sur tous les canaux, plus des policies `realtime.messages` autorisant l'abonnement au canal `table:<id>` aux seuls participants de la table.

**Risque de régression** : **élevé et diffus.** Le temps réel est le cœur de l'expérience en séance ; une policy trop stricte fige les écrans sans erreur visible. Les canaux privés exigent en outre une session authentifiée — à vérifier sur le parcours anonyme et sur les navigateurs in-app (Messenger), où le WebSocket est déjà capricieux et où les pollings de secours servent de filet.

**Recommandation** : ne pas l'engager avant que 49-56 soient livrés et vérifiés. Le chantier 53 tient l'intervalle. Si la fenêtre sans production se referme avant, **reporter** — c'est le seul chantier du plan qu'il vaut mieux ne pas faire que faire à moitié.

---

## 4. Parallélisation — ce qui ne peut pas tourner ensemble

| Fichier | Chantiers qui y touchent |
|---|---|
| `src/screens/SuperadminScreen.tsx` | **50** (`loadGroups`, Realtime), **52** (rendu des liens ~4249), **58** (`loadSessions`) |
| `src/context/TableContext.tsx` | **53** (broadcast), **54** (`endTable`), **58** (`select('*')` l.140), **59** (canaux) |
| `src/screens/VoteScreen.tsx` | **51** (l.316), **55** (formulaires d'identité), **58** (3 × `select('*')`) |
| `src/screens/CollabDocScreen.tsx` | **52** (URL + `collab_session_users`), **59** |

**Règles de séquencement** :
- **50, 52 et 58 sont mutuellement exclusifs** (`SuperadminScreen`, 4 000+ lignes — un conflit y est pénible à résoudre). Les enchaîner, jamais les paralléliser.
- **53 et 54 sont mutuellement exclusifs** (`TableContext`), mais tous deux petits : les faire dans une seule session est raisonnable si l'on veut économiser un aller-retour.
- **51 et 55 sont mutuellement exclusifs** (`VoteScreen`).
- **58 et 59 se font seuls**, sans rien en parallèle.

**Peuvent tourner en parallèle sans risque** : **49** (SQL pur), **56** (SQL pur), **57** (Edge Function seule). Ce sont les trois seuls chantiers du plan qui ne touchent aucun fichier `src/`.

**Séquence recommandée**

```
Vague 1  (parallèle)  : 49 · 56 · 57
Vague 2               : 50            ← seul, recette complète
Vague 3  (parallèle)  : 51 · 53+54
Vague 4               : 52
Vague 5               : 55            ← après arbitrage Jules
Vague 6               : 58            ← seul
Vague 7               : 59            ← seul, ou reporté
```

---

## 5. Avant la prochaine séance, ou après

**Doit être fait avant la prochaine séance réelle**

| Chantier | Pourquoi |
|---|---|
| **49** | La fuite est active et concerne des personnes nommées. Aucune raison d'attendre : c'est une requête. |
| **50** | Le seul chantier qui traite F1 à la racine, et **le préalable au toggle `results_public`** (voir ci-dessous). |
| **51** | Une nouvelle séance ajoute des assertions, donc des auteurs désanonymisables. Le coût de report croît. |
| **52** | Coupe la chaîne vers `delete_session` pour une heure de travail. Devient urgent dès qu'une séance utilise le doc collaboratif. |
| **53** | Trente minutes contre un DoS confirmé exploitable, à trois lignes d'un attaquant. |

**Peut attendre**

| Chantier | Pourquoi |
|---|---|
| **54** | Exige de détenir le code Ecclesia — l'attaquant est un initié, pas un anonyme. Réel, mais moins immédiat. |
| **55** | Bloqué par un arbitrage, et une correction bâclée bloque l'accueil des participants le jour J. |
| **56** | Non exploitable en l'état (revue §6.1). Bon marché, sans urgence. |
| **57** | Impact financier et opérationnel, pas de fuite ni de destruction. |
| **58** | Ce qui fuit au-delà du parcours voulu, ce sont des URL de documents de préparation. Gênant, pas grave. |
| **59** | Le chantier 53 tient l'intervalle. À ne pas engager sous contrainte de calendrier. |

**Règle qui traverse tout le plan** : ne basculer `results_public = true` sur aucune séance tant que **50 et 51** ne sont pas livrés et vérifiés. La migration du chantier 46 est correcte — elle anonymise réellement le nuage de points — mais publier des résultats attire du public vers des séances dont la liste nominative et l'auteur de chaque assertion restent lisibles par ailleurs. Le toggle est la dernière étape, pas la première.

---

## 6. Ce qui relève d'un arbitrage de Jules, pas d'une décision technique

Aucune de ces cinq questions n'a de bonne réponse technique. Elles conditionnent le contenu des chantiers concernés, pas leur ordre — sauf la n°1, qui bloque le chantier 55.

**1. Preuve de possession sur la reprise d'identité (chantier 55) — bloquant.**
Aujourd'hui, taper son nom suffit à récupérer son inscription depuis n'importe quel appareil. C'est fluide, et c'est la faille. Exiger le code de rappel ferme la faille et crée un cas d'échec le jour de la séance (« j'ai perdu mon code »). Trois options : (a) code obligatoire + action superadmin de rattachement comme filet ; (b) code obligatoire seulement en `voting` et après, pseudo toléré en `pre_voting` où l'enjeu est moindre ; (c) statu quo, en acceptant le risque documenté. **Mon avis** : (a), à condition de livrer le filet superadmin *avant* le durcissement.

**2. Rétention des pseudos nominatifs (chantier 49).**
L'app demande « nom prénom ». Ces noms restent en base indéfiniment. Faut-il les pseudonymiser après un délai (six mois ? un an ?) une fois l'analyse produite ? L'analyse PCA et les résultats n'en ont pas besoin — `analysis_members` référence des `member_id`, pas des noms. Réduire la durée de conservation est le seul correctif qui protège aussi contre un incident futur.

**3. Suppression de table : RPC journalisée ou soft-delete (chantier 54) ?**
La RPC est peu coûteuse et garde le comportement actuel. Le soft-delete (`closed_at`) est plus sûr — plus rien ne s'efface, tout est récupérable — mais touche toutes les requêtes qui listent des tables. Question adjacente : un modérateur a-t-il seulement besoin de *supprimer* une table, ou seulement de la clore ?

**4. La liste publique des séances en cours avec leur `join_code` (chantier 58).**
C'est aujourd'hui le parcours d'entrée : la page d'accueil affiche les séances en cours à tout visiteur. C'est aussi ce qui permet à un inconnu de s'inscrire à n'importe quelle séance (A5, inscription de masse). Faut-il conserver ce confort, ou exiger un lien/QR code pour entrer ? Le choix change la portée du chantier 58.

**5. Procédure de publication des résultats (chantier 46, déjà en base).**
Le contenu des assertions est du texte libre écrit par des participants ; il peut nommer des personnes. Le rendre public est irréversible en pratique. Faut-il inscrire une relecture humaine des assertions dans la procédure avant chaque bascule du toggle ?

---

## 7. Vérifications et recette

**Dépendance externe** : les sauvegardes (`db-backup.yml`, non commité, donc aucune sauvegarde aujourd'hui) font l'objet d'une conversation dédiée. Aucun chantier de ce plan n'en dépend pour s'exécuter — mais tant qu'elles n'existent pas, une erreur de manipulation pendant les chantiers 50, 54 ou 58 n'est pas rattrapable. À traiter en parallèle, idéalement avant la vague 2.

**Requêtes préalables** (SQL Editor, aucune n'écrit) :

```sql
-- 1. Signatures exactes des fonctions à durcir (chantier 56) — plusieurs surcharges existent.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('check_superadmin_password','create_table','reclaim_moderator',
                    'claim_moderator_status','get_public_results','set_session_results_public')
ORDER BY p.proname;

-- 2. Ampleur de la purge du chantier 49, avant/après.
SELECT s.phase, count(*) AS membres,
       count(*) FILTER (WHERE sm.reclaim_code IS NOT NULL) AS codes_en_clair
FROM session_members sm JOIN sessions s ON s.id = sm.session_id
GROUP BY s.phase ORDER BY s.phase;

-- 3. Confirmer qu'aucune vue ou fonction non repérée ne dépend des policies visées.
SELECT DISTINCT dependent_ns.nspname, dependent_view.relname
FROM pg_depend d
JOIN pg_rewrite r        ON r.oid = d.objid
JOIN pg_class dependent_view ON dependent_view.oid = r.ev_class
JOIN pg_class source_table   ON source_table.oid = d.refobjid
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
WHERE source_table.relname IN ('session_members','table_assignments','assertions','sessions');
```

**Recette minimale après chaque chantier touchant une policy** — à exécuter avec la clé anonyme publique, hors navigateur :

```
GET /rest/v1/session_members?select=pseudo,reclaim_code   → attendu [] après 50
GET /rest/v1/table_assignments?select=member_id           → attendu [] après 50
GET /rest/v1/assertions?select=member_id                  → attendu 42501/403 après 51
GET /rest/v1/sessions?select=doc_info_url                 → attendu 42501/403 après 58
```

Puis, dans l'application, le parcours complet `pre_voting → voting → allocating → debating → closed` sur deux appareils, plus l'onglet Tables du superadmin avec un glisser-déposer. C'est le seul test qui couvre les régressions silencieuses du §1.2 — celles qui ne lèvent aucune erreur et vident juste un écran.

---

## 8. Ce que ce plan ne couvre pas

- **Les sauvegardes** — conversation dédiée (§7).
- **Les angles morts de la passation**, tous encore ouverts et non traités ici : `npm audit`, configuration Auth Supabase (débit réel des `signInAnonymously`, qui conditionne A5), journalisation du mot de passe superadmin par Postgres, confirmation de B1 en navigateur, relecture une par une des ~40 RPC superadmin.
- **A5 (inscription de masse)** — pas de chantier dédié. Le correctif dépend de la configuration Auth (non inspectée) et de l'arbitrage n°4 du §6. À reprendre une fois ces deux points tranchés.
- **Le second projet Supabase** (`fcdhbgsqzvxepzvjweod`, en pause) — à supprimer s'il ne sert plus, réduction de surface à coût nul.
- **`transcription-debat/`** — hors périmètre, conformément à la décision du 03/08.
- **Rappel** : le dépôt est public. Ces correctifs seront lisibles avant d'être déployés. Corriger côté serveur, pas côté interface, et éviter de détailler publiquement les fenêtres encore ouvertes entre l'annonce d'un chantier et sa livraison.
