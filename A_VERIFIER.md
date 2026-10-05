# À vérifier

> **Nettoyé le 2026-09-29 (fin du chantier 141).** Tout ce qui a été vérifié au navigateur (à la main par Jules ou automatiquement sur dev par le chantier 141) a été retiré, sur décision de Jules : plus de consigne de vérification humaine pour ces points. **Ne restent ici que les points que le navigateur ne sait pas jouer**, ou qui ne valent que sur prod. L'ancien contenu (recettes, historique, annotations 141) est dans l'historique git : `git show 8656608:A_VERIFIER.md`. Les rapports détaillés de la passe 141 sont dans [`docs/rapports-tests-141/`](./docs/rapports-tests-141/) (`rapport-consolide.md` d'abord).
>
> **Règle de Jules (2026-10-02)** : « Désormais, toutes choses vérifiées par un navigateur ne doivent plus être vérifiées par Jules. » Une session ne consigne donc ici que ce que le navigateur ne peut pas jouer ; le reste est vérifié par elle-même et noté dans `docs/chantiers.md`.
>
> Règle inchangée : ne jamais supprimer une entrée sans l'accord de Jules — la cocher ou la déplacer en fin de fichier une fois vérifiée. Une vérification faite sur dev ne vaut pas pour prod.

---

## 1. Glisser-déposer à la souris (dnd-kit ignore le pointeur synthétique du navigateur automatisé)

Sur une séance de test, avec la souris.

- [ ] **Chantier 139** — glisser un participant d'une table déjà modérée sur l'encart « 🔁 Remplacer le modérateur » : la fenêtre « Remplacer le modérateur de la table N°X ? » doit s'ouvrir (nommant les deux personnes), « Annuler » ne change rien, « Remplacer » fait du participant l'animateur (l'ancien devient « Modérateur en surplus » et repasse en écran participant).
- [ ] **Chantier 33** — glisser un participant sur une table sans modérateur dans l'onglet 🪑 Tables/Groupes : il devient le modérateur.
- [ ] **Chantier 92, étape 4** — badges 🔗 sur un binôme ; glisser A vers une autre table doit déplacer A **et** B, le compteur de grappes reste à jour.
- [ ] **Chantier 91, étape 4** — glisser un passif vers une table sans modérateur : l'alerte « en public sans modérateur » apparaît et « Santé des tables » baisse.
- [ ] **Chantier 53** — glisser-déposer une entrée dans la file côté modérateur : la vue participant reflète le nouvel ordre en moins de 2 s.

## 2. Deux identités ou deux appareils en même temps (le navigateur intégré n'en gère qu'une)

- [ ] **Chantier 35 — synchro Realtime du statut modérateur** (deux onglets/navigateurs, superadmin + participant) :
  1. superadmin sur « Tables rattachées » ; un 2ᵉ onglet fait `reclaim_moderator` → `moderator_pseudo` se met à jour sans rechargement (~15 s) ;
  2. auto-attachement : séance `allocating`/`debating`, table animée sans modérateur ; 2ᵉ onglet `#session/<code>` → « 🎙️ Modérateur » → se déclarer → la table apparaît côté superadmin sans rechargement ;
  3. retrait en débat : le superadmin retire le statut d'un modérateur physique → bascule vers `ParticipantView` sans rechargement, puis retour en le recochant ;
  4. phase vote : badge « Vous êtes modérateur » disparaît sans rechargement quand le superadmin décoche ;
  5. régression : un modérateur classique sans ligne `session_members` garde son `ModeratorView`.
- [ ] **Chantier 50 — Realtime ne livre que ses propres lignes** : deux navigateurs (participants A et B) ; le superadmin modifie A → **B ne reçoit aucun événement** (onglet Réseau, frames WebSocket) ; il modifie B → B réagit toujours (badge, bascule de vue, numéro de table).
- [ ] **Chantier 53 — plafonnement du refetch** : enchaîner vite « donner la parole à A → fin de tour → auto-avance → donner à C » : aucun écran ne se fige côté participant, orateur cohérent des deux côtés (≤ ~1 s de retard) ; exclure un participant → il disparaît côté participant ; couper puis rétablir le réseau d'un client → resynchronisation.
- [ ] **Chantier 132 — « proposer un vote », en direct** (modérateur + participant) : (1) Outils Modo → « Proposer un vote » → question + 2 options → « Lancer » ; (2) le popup s'ouvre côté participant sans rechargement, pour/contre indépendants ; (3) le décompte du modérateur se met à jour en direct sans révéler qui a voté quoi ; (4) « Clôturer » → le popup bascule sur les résultats en ~4 s ; (5) un second vote remplace le premier ; (6) « Voir l'historique des votes » les liste avec leurs décomptes ; (7) fermer la croix sans répondre puis rouvrir via « 🗳️ Voir le vote en cours » ; un nouveau vote rouvre le popup. *(La partie SQL a été vérifiée en transaction jetable sur dev.)*
- [ ] **Écran du modérateur supprimé ou remplacé** — vu côté superadmin seulement, pas côté modérateur : (137-D d) supprimer un modérateur en `debating` → son écran bascule en participant ; (118, 109, 139) « Retirer », « Libérer la modération » ou le placement à l'ouverture du débat → le modérateur placé voit son écran, l'ancien animateur repasse en participant.
- [ ] **Chantier 139, cas 6** — une personne désignée pour une **autre** table que la sienne doit rejoindre cette table (fenêtre « Changement de table ») ; vérifier qu'elle devient bien modératrice à l'arrivée.

## 3. Gemini réel (`gemini-proxy` n'est pas déployé sur dev)

- [ ] **Nommage réel des camps** sur une séance complète et pour une association (dev retombe sur les noms de secours « Plutôt pour : … »). Un nommage est décompté même si Gemini échoue ensuite (choix assumé, 5/jour/asso).
- [ ] **Chantier 57 — quota et plafond de charge utile de `gemini-proxy`** (voir aussi le chantier 83bis, compteur partagé).
- [ ] **Chantier 37 — fusion IA automatique** au passage `voting → allocating` (toggle « Fusionner auto en fin de vote »).

## 4. Temps et infrastructure

- [ ] **Expiration réelle d'un compte d'association** (chantier 135) : un compte dont la date est dépassée ne peut plus se connecter (aujourd'hui vérifié seulement par la logique SQL).
- [ ] **Restauration de sauvegarde grandeur nature** (une fois) : projet Supabase gratuit temporaire, y restaurer un dump téléchargé et déchiffré en suivant la procédure de `.github/workflows/db-backup.yml`, comparer dans le Table Editor, supprimer le projet. À refaire si la structure de la base change beaucoup.

## 5. Sur prod, après merge `dev` → `main`

**Migrations à appliquer sur prod dans cet ordre** (toutes déjà appliquées sur dev) : `134a`, `134b`, puis `135`, `135b`, `135c` (créent `check_session_admin`), puis `131`, `132`, `137`, `139`, `140`, `140b`, `142` (la 139 dépend de la 135 ; la 140b renomme 1 doublon dans une séance close du 2026-06-03 — le second inscrit y apparaîtra avec « (2) »). Le détail de chaque fichier est dans `supabase/migrations/` et `docs/chantiers.md`. Rappel de la règle : appliquer sur prod est un geste manuel, jamais automatique.

> ✅ **Fait le 2026-09-30** (merge `dev` → `main`, session « merge dev to main ») : **14 migrations appliquées sur prod**, dans l'ordre de leur application sur dev — `131`, `134a`, `134b`, `132`, `135`, `135b`, `135c`, `137`, `140`, `139`, `140b`, `142`, `144`, `144b` — plus le correctif de parité `20260930_chantier142_fix_prod_claim_collab_identity_revoke_anon` (`claim_collab_identity` ouverte à `anon` sur prod par les droits par défaut du chantier 103). Non appliquées, car propres à dev : `fix_dev_grants_tables_sequences`, `fix_dev_realtime_messages_policies`. Le chantier 130 n'a pas de migration (annulée).
> Schéma prod comparé à dev après coup : colonnes (199) et policies (33) identiques, 167 fonctions identiques (hors commentaires), droits d'exécution identiques sauf `pseudo_key`/`session_type_allows_phase` (ouvertes à `anon`/`authenticated` sur prod, fonctions pures sans effet). Seule donnée modifiée : `LOULOU` → `LOULOU (2)` (140b).
> **Retour arrière** : tag `pre-merge-dev-20260930`, instantané dans le schéma `rollback_20260930` de la base prod, procédure et script testé à blanc dans [`docs/rollback-merge-dev-main-20260930.md`](./docs/rollback-merge-dev-main-20260930.md). Supprimer ce schéma (`DROP SCHEMA rollback_20260930 CASCADE`) une fois le merge jugé stable — il contient des noms réels.
> Les cases ci-dessous (recette sur séance de test **de prod**) restent à cocher : rien n'a été testé à l'écran sur prod.
> 🐛 **Bug trouvé par Jules juste après le merge (2026-09-30) et corrigé** : la liste des séances de l'accueil était vide sur GitHub Pages. `EntryScreen` filtre sur `organization_id` (chantier 135), colonne absente du `GRANT SELECT` d'`anon` sur `sessions` de prod (chantier 58) → erreur 42501 ignorée par le front. Dev ne le montrait pas (droits larges). Correctif : `20260930_fix_prod_grant_sessions_organization_id.sql`, appliqué sur prod, requête de l'accueil rejouée en rôle `anon` : la séance « Réunion apprentissage modération 21/09 » ressort. **Règle** : toute colonne de `sessions` lue directement par le front doit figurer dans ce GRANT sur prod. À refaire une fois : recharger l'accueil GitHub Pages **et** Vercel et confirmer que la séance y apparaît.

> ⏳ **À appliquer sur prod au prochain merge `dev` → `main`** : `20261002_chantier147_debat_table_sans_proprietaire_admin` (appliquée sur dev le 2026-10-02). Ajoute `table_owner_uid` et réécrit `create_session_table_internal`, `release_table_moderation`, `set_member_moderator` — définitions prod = dev (md5 identiques le 2026-10-02) ; **re-comparer au moment d'appliquer**. Aucune donnée prod concernée (aucun débat simple sur prod).

> ⏳ **À appliquer sur prod au prochain merge `dev` → `main`, après la 147** : `20261002_chantier148_un_seul_moderateur_par_table` (appliquée sur dev le 2026-10-02). Ajoute `clear_seated_physical_moderator` et réécrit `is_table_moderator`, `table_has_moderator`, `reclaim_table_as_moderator`, `claim_table_as_moderator`, `join_simple_debate`, `claim_moderator_status`, `set_member_moderator` (définitions de départ : `pg_get_functiondef` dev, post-147) — **re-comparer à prod au moment d'appliquer**. Contient une **réparation de données** (tables de séance à modérateur physique assis) : sur dev, 3 tables corrigées dont une à deux titulaires en `debating` ; faire un `SELECT` de contrôle sur prod avant.

> ⏳ **Puis, juste après** : `20261002_chantier148b_tables_seance_sans_proprietaire_admin` (appliquée sur dev le 2026-10-02) — toute table de séance a `created_by` = sentinelle ; réécrit `table_owner_uid` (créée par la 147), `admin_create_table`, `create_tables_batch`, `apply_allocation`, `set_table_leaderless`, `delete_session_member_admin` (md5 dev = prod le 2026-10-02). Réparation : 4 tables sur prod, toutes en séance close (contrôle en lecture seule fait le 2026-10-02).

> ⏳ **Puis, avec le 153** : `20261002_chantier153_regles_propositions` (appliquée sur dev le 2026-10-02). Ajoute `sessions.assertions_vote_first` / `max_assertions_per_member`, la RPC `set_session_assertion_rules` (via `check_session_admin`, donc ouverte aux associations) et réécrit `submit_assertion` (définition vivante comparée avant réécriture : identique au chantier 124 + deux refus). Contient aussi `GRANT SELECT (assertions_locked, assertions_vote_first, max_assertions_per_member) ON sessions TO anon, authenticated` : sur **prod**, `assertions_locked` n'avait **pas** de SELECT colonne pour `anon`/`authenticated` (droits colonne par colonne depuis le chantier 58) — le chargement initial passe par `get_session_by_join_code` (SECURITY DEFINER) et n'en souffre pas, mais les mises à jour Realtime de `sessions` pouvaient ne pas porter le verrou ; le GRANT est sans effet sur dev (droit table entière).

Puis, sur une séance de test **de prod** :
- [ ] **153** — sur une séance de test de prod, régler « voter d'abord » et un plafond depuis le superadmin, vérifier que le bouton « Proposer » suit en direct côté participant (comme vérifié sur dev).
- [ ] **147** — créer un débat simple depuis le navigateur d'administration, ouvrir **le même lien dans ce même navigateur** : on doit arriver en **participant** (écran noir modérateur absent), et un second appareil qui entre avec « Je suis le modérateur » + code doit être accepté (pas de « Toutes les tables ont déjà un modérateur ») et apparaître comme modérateur dans l'onglet Groupes. (Vérifié en base dev uniquement — le navigateur intégré a refusé `localhost` le 2026-10-02.)
- [ ] **148** — à une table de séance, un participant fait Outils → « Reprendre l'animation de cette table » avec le **vrai** code : écran noir chez lui, l'ancien animateur repasse participant, il apparaît modérateur dans l'onglet Groupes, et **recharger la page le laisse modérateur**. Puis le retirer (onglet Groupes) : retour immédiat en participant. (Vérifié sur dev en base, RPC appelées avec le contrôle de code neutralisé dans une transaction annulée, et au navigateur en posant l'état résultant en base — le mot de passe réel n'était pas disponible à la session.)
- [ ] **135** — création d'un compte association, connexion `#asso`, prise de modération avec le mot de passe d'asso.
- [ ] **139** — rejouer l'encart « Remplacer le modérateur », la confirmation et le remplacement (points 1 à 3), et l'ancien animateur qui repasse en écran participant.
- [ ] **140** — porte code de table avec un nom déjà pris (message + accordéon ouvert, pas d'entrée).
- [ ] **140b** — contrôler le renommage du doublon de la séance du 03/06, et une inscription avec une autre casse.
- [ ] **143** — contrôle visuel de l'écran « Débat en cours » d'un retardataire (un seul champ nom).
- [ ] **106, 109, 117, 118** — onglet Groupes (badge « en surplus », modérateur physique, « Retirer », « Libérer la modération », modale « Ouvrir le débat »).
- [ ] **91, 92** — recette d'allocation sur une séance de test (déterminisme, actifs/public par table, grappes de binômes).

## 6. Non joués par la passe 141 (faisables, à décider)

Pas impossibles à automatiser : ils ont été laissés de côté faute de marge dans les conversations, ou parce que le même code est déjà couvert par un cas joué. À rejouer avec les mots de passe de Jules si l'on veut fermer ces points.

- [ ] **108 — déclaration modérateur unifiée** : C1 (reprise d'un code de rappel en pré-vote) et C2 (réouverture en `allocating`) demandent des parcours sur plusieurs phases ; C3 (secours en `debating`) est couvert par équivalence (même RPC `claim_table_as_moderator`).
- [ ] **134 point 5** — prise de modération par Outils sur un débat simple (même RPC `reclaim_table_as_moderator` que le 110, joué ailleurs).
- [ ] **91, étape 5** — cas limite : moins de 5 actifs dans la séance → une seule table, avertissement, pas d'erreur.
- [ ] **Chantier 140** — changement de table en cours de débat (`TableChangeModal`, `ChangeTableModal`) et en allocation (`AllocatingScreen`, `switch_table`) ; lien `#table/<code>` sans séance avec accordéon ouvert et nom libre ; porte du secours de `VoteScreen` (même composant `JoinTableForm`).
- [ ] **A1 (à tester)** — après la prise d'une table `leaderless` par la porte modérateur (Code Ecclesia), le preneur peut-il arriver sur la vue **participant** au lieu de `ModeratorView` (rechargement nécessaire) ? Vu 1 fois sur 3 ; non reproduit en 2 essais au 141f. Rejouer plusieurs fois, sans rechargement.
- [ ] **Ménage des tables de test partagées** — `589D79`, `6ABDC9` (séance « Test manuel — Vote & bascule modérateur ») et `6296A9` (séance TEST33A, participant « Test Notes QA ») : à purger, **accord explicite de Jules requis** avant suppression.

## 7. Décisions en attente (pas des vérifications)

- **Chantier 120** — `session_members.user_id` se désynchronise au renouvellement du jeton anonyme. **Bug confirmé, sans correctif codé**, en attente d'un arbitrage de sécurité de Jules. Détail complet ci-dessous.
- **Chantier 139, cas voisins non corrigés** : (a) déplacer l'animateur d'une table par glisser-déposer la laisse sans animateur ni « sans animateur » ; (b) le bouton « modérateur » de la liste des participants peut réaffecter silencieusement la personne à une autre table en plein débat ; (c) la fenêtre « Changement de table » reste masquée tant que les fenêtres d'accueil et de règles sont ouvertes.
- **Chantier 141 — bugs relevés**, voir le chantier de correctifs dans `docs/chantiers-a-faire.md`.

---

## Chantier 120 (2026-09-21) — Désynchronisation de `session_members.user_id` au renouvellement du jeton anonyme — ⚠️ BUG CONFIRMÉ, correctif non codé (décision de sécurité à trancher avec Jules)

Suspicion documentée dans `docs/chantiers-a-faire.md` § 120 (trouvée en aparté au chantier 119). Confirmée par repro en base le 2026-09-21, transaction jetable `BEGIN … ROLLBACK` sur le projet `plpjiehqsxxakbuykmkm` (rien de permanent) :

**Recette de vérification (rejouable telle quelle, tout est annulé par le `ROLLBACK` final)** :
```sql
begin;

insert into sessions (id, title, phase, moderation_policy) values
  ('00000000-0000-0000-0000-000000000120', 'QA chantier 120', 'debating', 'open');

insert into tables (id, session_id, join_code, created_by, table_number) values
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-000000000120', 'QA120XX', gen_random_uuid(), 1);

-- membre existant, ancien jeton (simule un participant déjà inscrit)
insert into session_members (id, session_id, user_id, pseudo, joined_phase, attending_in_person, reclaim_code_hash)
values ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-000000000120',
        '11111111-1111-1111-1111-111111111111', 'Jean QA', 'debating', true, crypt('1234', gen_salt('bf')));

insert into table_assignments (session_id, member_id, table_number, table_id)
values ('00000000-0000-0000-0000-000000000120', '00000000-0000-0000-0000-0000000002a1', 1, '00000000-0000-0000-0000-0000000001a1');

-- simule le jeton anonyme renouvelé : nouvel auth.uid(), même pseudo, comme App.tsx le ferait via join_table
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select sync_table_assignment('00000000-0000-0000-0000-000000000120'::uuid, '00000000-0000-0000-0000-0000000001a1'::uuid, 'Jean QA') as rpc_result;
select id, user_id, pseudo from session_members where session_id = '00000000-0000-0000-0000-000000000120';
select member_id, table_id from table_assignments where session_id = '00000000-0000-0000-0000-000000000120';

rollback;
```

**Résultat observé** : `rpc_result` = `null` (aucun `new_reclaim_code`, échec totalement silencieux — le `EXCEPTION WHEN OTHERS … RAISE WARNING` du chantier 111 avale l'erreur `UNIQUE(session_id, pseudo)`). `session_members` ne contient **toujours qu'une ligne**, avec l'**ancien** `user_id` (`1111…1`). Le nouvel `auth.uid()` (`2222…2`) — celui du jeton renouvelé, donc de l'appareil réel du participant à partir de maintenant — n'a **aucune** ligne `session_members` ni `table_assignments`. Le mécanisme suspecté est donc exactement confirmé : après renouvellement du jeton (veille longue, navigateur in-app Messenger, purge Safari ITP), `App.tsx` rappelle silencieusement `join_table`, qui échoue à relier la nouvelle identité sans jamais le signaler à l'écran — la personne perd l'accès au questionnaire post-débat, aux résultats et au vote (`cast_vote`/`submit_entry_response` cherchent `session_members` par `user_id = auth.uid()`), indépendamment de tout code de rappel qu'elle pourrait avoir noté.

**Pourquoi le correctif n'est pas codé dans ce chantier** : en creusant `join_table` (`pg_get_functiondef`), la table `participants` (identité *de table*, sans code) résout déjà exactement ce cas par un `ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = excluded.user_id` — une réassignation silencieuse par simple connaissance du pseudo. Copier ce même geste sur `session_members` (identité *de séance*, protégée par `reclaim_code_hash` depuis le chantier 93) rouvrirait exactement le vecteur de prise d'identité que le chantier 93 a fermé : n'importe qui connaissant le pseudo d'un participant (visible dans la file d'attente, à table) pourrait, par un `join_table` ordinaire, se faire réattribuer sa ligne `session_members` — ses votes, son droit de revote, son questionnaire — sans jamais connaître son code. L'autre option de la spec (traiter ce cas comme une reconnexion explicite, pseudo + code, via `confirm_attendance`) préserve la protection du chantier 93 mais casse la continuité silencieuse actuelle : l'utilisateur devrait ressaisir un code qu'il n'a peut-être jamais noté ou qu'il a perdu, en plein milieu d'un débat, sans écran dédié à ce moment (`App.tsx` s'exécute avant tout affichage). **Décision de sécurité/produit à trancher avec Jules avant de coder** — voir la question posée dans le message de fin de chantier.

**Fichiers concernés une fois la décision prise** : `supabase/migrations/…` (`sync_table_assignment`), `src/App.tsx` (point d'appel), potentiellement un nouvel écran de reconnexion si l'option « confirm_attendance » est retenue.

### Suite du 2026-09-21 — Jules a tranché (option B), correctif codé et vérifié en base ET au navigateur réel

**Décision de Jules** : « Option B, on redemande le code, car le modo peut lui redonner aussi son code au cas où, et le superadmin aussi, donc je ne vois pas trop le problème de cette option là. »

**Correctif** (`supabase/migrations/20260921_chantier120_reconnexion_explicite_token_renouvele.sql`, `CREATE OR REPLACE` sans `DROP` — ACL vérifiée identique après coup, `pg_proc.proacl` comparé avant/après, aucune régression) :
- `sync_table_assignment` : quand `user_id` ne trouve aucun membre mais qu'une ligne `session_members` existe déjà pour ce `(session_id, pseudo)`, ne crée ni ne modifie plus rien — renvoie `{"reconnect_required": true}` au lieu de tenter l'`INSERT` qui échouait en silence.
- `join_table` : renvoie désormais `session_id` dans son résultat (nécessaire côté client pour lancer `confirm_attendance`).
- `src/App.tsx` : nouvelle fonction `joinAndHandleReconnect` — si `reconnect_required` est présent, bascule vers un nouvel écran (`src/components/ReconnectPrompt.tsx`) demandant le code de rappel (pseudo déjà connu, préaffiché) plutôt que d'entrer directement dans `TableView`. À la confirmation réussie (`confirmAttendance`, RPC déjà existante du chantier 93), rappelle `join_table` — qui réussit cette fois normalement puisque `session_members.user_id` est désormais aligné.

**Vérifié en base** (transaction jetable `BEGIN…ROLLBACK`, mêmes identités fictives que la recette ci-dessus, table temporaire pour capturer chaque étape) :
- Jeton renouvelé, même pseudo → `sync_table_assignment` renvoie `{"reconnect_required": true}` ; `session_members` reste inchangée (toujours l'ancien `user_id`), aucune ligne créée pour le nouveau.
- `confirm_attendance` avec un **mauvais** code → `{"error": "Code de rappel invalide."}`, rien ne bouge.
- `confirm_attendance` avec le **bon** code → `session_members.user_id` réassigné au nouvel `auth.uid()`.
- `sync_table_assignment` rejoué après ce `confirm_attendance` → trouve le membre normalement, `table_assignments` à jour, une seule ligne (pas de doublon).

**Vérifié au navigateur réel** (dev server sur ce worktree, `.env` copié depuis la racine, séance/table/membre QA créés et purgés en base pour ce test — ids `…12001` à `…12004`, supprimés après coup) :
1. Séance de départ : `ecclesia_table` posé en `localStorage`, identité auth de départ = A → rechargement → restauration directe dans `TableView` (comportement inchangé, cas nominal).
2. Simulation du renouvellement de jeton : suppression de la seule clé `sb-…-auth-token` (le `localStorage` applicatif `ecclesia_table` reste intact, comme un vrai renouvellement) → rechargement → nouvelle identité auth B générée automatiquement → **écran « Reconnexion nécessaire » affiché**, pseudo préaffiché, champ code vide.
3. Code erroné (`0000`) saisi → message « Code de rappel invalide. » affiché, écran reste sur place (pas de blocage, pas de perte de l'écran).
4. Bon code (`7777`) saisi → reconnexion réussie, retour direct dans `TableView` (« Étape 4 · Débat », participant bien affiché).
5. Vérifié en base après coup : `session_members.user_id` **et** `participants.user_id` portent tous les deux la nouvelle identité B, une seule ligne `table_assignments`, aucun doublon.

`tsc --noEmit` et `npm run build` propres. `npx vitest run` : 107 tests passent ; le seul échec (`src/lib/groupNaming.test.ts`, `supabaseUrl is required`) est un défaut d'environnement préexistant du worktree (pas de `.env` copié avant ce test), sans rapport avec ce chantier — non-régression confirmée séparément par le test navigateur réel une fois `.env` copié.



## Chantier 155 — liens de documentation (2026-10-05)
Vérifié au navigateur sur dev (sondage et séance complète, Outils du vote). Restent à rejouer, même logique de code :
- [ ] 1. `DocNudge` (« Profites-en pour lire la documentation », séance avec au moins une assertion à voter) : « Fiche info et résumé » ; dans un **sondage**, ni Biais cognitifs ni Arguments fallacieux ; dans une séance complète, les deux sont là.
- [ ] 2. Vue table (débat simple en `debating`) : **Outils** du participant et bouton **Documentation** du modérateur affichent « Fiche info et résumé » et gardent les fiches pédagogiques.
- [x] 3. Superadmin → séance → Documentation : champ « Fiche info et résumé » ; le champ « Résumé » n'apparaît en édition que si la séance en avait déjà un (et sa valeur survit à l'enregistrement). *(Vérifié au navigateur le 2026-10-05, superadmin connecté par Jules : séance à deux liens → les deux affichés, modification de la fiche enregistrée et résumé conservé en base ; séance à un lien → ni ligne ni champ « Résumé » ; formulaire de création → un seul champ. Reste le côté `#asso`.)*

## Chantier 144 — correctifs de la passe 141 (2026-09-29)
Vérifié au navigateur le 2026-10-02 sur le déploiement Vercel dev (séances « QA Vérifs — Débat/Sondage/Complète »), sauf le point 5. Décision de Jules : pas de revérification sur prod, le comportement doit être identique.
- [x] 1. Onglet Groupes : les liens « Libérer la modération de cette table » et « Refaire une table sans animateur » sont espacés.
- [x] 2. Créer une table (bannière « Table créée ! Code … »), puis la supprimer : la bannière disparaît.
- [x] 3. `JoinTableForm` : entrer un nom déjà pris → accordéon code ouvert ; corriger le nom → accordéon refermé, « Rejoindre » actif. Ouvrir l'accordéon à la main puis changer le nom → il reste ouvert.
- [x] 4. Modérateur inscrit à la séance : « ajouter une personne sans téléphone » avec **son propre nom** (autre casse) → refus « déjà assise ». Deux personnes sans téléphone de noms différents → toujours acceptées.
- [x] 5. Table créée via « Créer une table » (Code Ecclesia) + un modérateur en attente : `assign_pending_moderators` ne place plus personne sur cette table. *(Vérifié en SQL sur dev le 2026-10-02, pas au navigateur : transaction annulée par rollback — table 1 avec créateur assis comme modérateur physique, table 2 libre, un modérateur en attente → placé sur la table 2, `tables_without_moderator` vide. Rollback contrôlé : aucune séance/table de test restante, `check_superadmin_password` intacte.)*
Migrations appliquées sur **dev** (`20260929_chantier144_*`, `20260929_chantier144b_*`) ; appliquées sur prod le 2026-09-30 (voir section 5).
- [x] 6. Sondage : onglet Analyse sans « Comparaison avant/après », « Thèmes », « Réponses au questionnaire », « Recrutement modérateurs » ; séance complète et débat simple : ces sections restent visibles.

*Observation du 2026-10-02 (pas un bug avéré)* : sur un débat simple, « Me déclarer modérateur de la séance » (Outils) marque le membre modérateur mais le laisse en vue participant, même après rechargement ; il faut « Reprendre l'animation de cette table » pour obtenir `ModeratorView`. Probablement normal (pas de placement de table sans allocation) — à confirmer avec Jules.

---

## Visualisation Énergie AA0D29 refaite à la main, sans Gemini (2026-09-28) — ⚠️ à relire par quelqu'un qui était au débat

Fichiers : `transcription-debat/backend/code python/build_manual_viz.py` (nouveau), `viz_template/index.html` (axe non déterminable, textes de méthode), `tests/test_build_manual_viz.py`. Analyse (non versionnée) : `transcripts/Energie/AA0D29/AA0D29_analyse_manuelle.json` → `viz/`. Ancienne version Gemini conservée dans `viz_gemini/`.

**Ce qui a été corrigé par rapport à Gemini** : positions fixes (Gemini déplaçait les voix de 10 à 15 unités quand le sujet passait de la taxe carbone à l'Europe, sans changement d'avis) ; axes redéfinis sur les deux clivages réels du débat (marché/incitation ↔ État/contrainte ; nation ↔ Europe) ; quatre voix qui ne se sont pas prononcées sur l'Europe signalées au lieu d'être posées au centre ; faux « consensus » sur les barrages supprimé (une seule personne en a parlé).

**Déjà vérifié** : transcript lu en entier ; 71 reformulations confrontées une à une au texte de leur segment, toutes ancrées sur la bonne voix (contrôle automatique ±3 s) ; aucun prénom réel dans la sortie ; rendu navigateur (positions stables de 0 à 85 min, étiquettes sans chevauchement, info-bulles des axes non déterminables) ; 223 tests pytest.

**Ajout 2026-09-29 — interactions** : 52 échanges relevés (40 désaccords, 10 accords, 2 concessions), affichés comme flèches entre les points ; seules les 2 concessions explicites (Interlocuteur 8 → 5 à 28:16, Interlocuteur 2 → 1 à 33:45) font pencher un point, temporairement. Chaque échange est ancré sur une prise de parole de celui qui parle (contrôle automatique) ; les « tu » dont la cible est ambiguë ont été écartés. Vérifié au navigateur (apparition, effacement, aller-retour de la concession, cumul) ; 228 tests pytest. **À relire** : la cible de quelques répliques déduite du contexte (ex. 5:16 Interlocuteur 5 → 1, 17:43 Interlocuteur 1 → 9).

**Ajout 2026-09-29 — synthèse en haut de page + bouton « Tous les déplacements jusqu'ici »** : résumé, 3 groupes d'opinion (2 voix non rattachées), dérive thématique (10 thèmes, découpage continu de 0 à 85,7 min ; cœur du sujet 4 % du temps, sujets annexes 54 %), 10 affirmations avec 51 positions pour/contre/nuancé toutes ancrées sur une prise de parole (contrôle automatique). Vérifié au navigateur par mesures (pas de défilement horizontal en 375 et 1280 px, pastilles sans chevauchement, clic sur une pastille → bon instant, 2 flèches de déplacement) ; capture d'écran impossible, panneau masqué ; 233 tests pytest. **À relire** : le classement des thèmes en cœur / leviers / annexes (le prix du carburant est compté comme levier, pas comme cœur du sujet) et les positions nuancées sur les affirmations.

**Ajout 2026-09-29 — charte Ecclesia, changements d'avis, retrait du détail par personne** : couleurs, polices (Playfair Display servie localement, licence OFL jointe), logo et en-tête de la charte ; fond crème par défaut (`?theme=dark` ou `?theme=auto` pour le sombre) ; clic sur un point = plus aucune liste des prises de position de la personne ; un vrai changement d'avis peut désormais être déclaré (`shifts`) et déplace durablement le point — aucun dans AA0D29. Vérifié au navigateur par mesures (police chargée, couleurs, logo, pas de défilement horizontal en mobile, mode sombre) et sur une variante de test avec un changement d'avis fictif (point déplacé durablement, flèche, compteur) ; 235 tests pytest. **À vérifier à l'œil** : le rendu visuel global face à la charte (capture impossible, panneau masqué) ; Calibri n'existe pas hors Windows/Office, repli sur Carlito/Segoe UI/Arial ailleurs.

**Reste à vérifier humainement** :
1. **Positions** : relire la carte avec quelqu'un qui était au débat, en priorité les placements les plus interprétatifs (Interlocuteur 8 à −2,5/−2,5 ; Interlocuteur 10 à +5 sur l'axe horizontal malgré son soutien à la hausse du prix ; Interlocuteur 1 non déterminable sur l'axe vertical).
2. **Courbe de tension** : niveaux ordinaux attribués à la lecture (pic à 75 sur l'échange capitalisme de 29 à 37 min) ; un participant peut confirmer que c'était bien le moment le plus vif.
3. **Transcript** : plusieurs prénoms réels restent visibles dans `AA0D29_2026-09-28_corrected.txt` (non masqués par la correction) — les ajouter à `name_map.json` avant tout partage du transcript. Quelques phrases d'animation y sont attribuées à des participants (frontières de voix) ; elles ont été écartées de l'analyse, mais comptent dans les temps de parole mesurés.

## Visualisation des prises de position — publiable sur un site (2026-09-28) — ✅ vérifié au navigateur · ⚠️ reste l'intégration sur le vrai site

Fichiers : `transcription-debat/backend/code python/viz_template/index.html`, `viz_template/d3.v7.min.js` (nouveau), `analyze_debate.py` (`write_viz`, `data_json_name`). Mode d'emploi : `transcription-debat/CLAUDE.md`, § « Publier la visualisation sur un site ».

Ce qui change : `viz/` contient désormais aussi `<CODE>.json` et `d3.v7.min.js` ; `index.html?debat=<CODE>` charge le JSON (une seule page pour tous les débats) ; `?theme=light|dark` force le thème ; en iframe, la page annonce sa hauteur au site hôte (`postMessage` `ecclesia-viz:height`). Sans `?debat`, repli sur `data.js` comme avant.

**Déjà vérifié** (Browser pane, faux site hôte servi en http avec deux iframes 71B505 + AA0D29) : chargement par JSON sans `data.js` ni CDN ; thèmes clair/sombre forcés ; hauteur ajustée au chargement, à l'ouverture (1705 → 2196 px) et à la fermeture du détail d'une voix ; mobile 375 px sans défilement horizontal ; messages d'erreur pour `?debat=../x`, un code inexistant et l'absence de données ; repli `data.js` servi en http. 217 tests pytest.

**Reste à vérifier humainement** :
1. **Ouverture par double-clic** (`file://`) de `viz/index.html` : non testable dans le Browser pane (il transforme les fichiers locaux en instantané). Le repli `data.js` passe par un `<script>` injecté, qui fonctionne en `file://` dans les navigateurs courants. Ouvrir `transcripts/Energie/AA0D29/viz/index.html` et vérifier que la carte s'affiche.
2. **Sur le vrai site** : iframe + extrait `postMessage` collés dans l'éditeur du site (certains éditeurs, dont Wix, isolent le HTML personnalisé dans une iframe à eux : l'ajustement de hauteur ne passerait alors pas, prévoir une hauteur fixe).
3. **Relire le JSON avant publication** (paraphrases, `note`, `camp`) : aucun prénom réel ne doit y apparaître. Le `viz/` de 71B505 date du 02/07 et repose sur l'ancienne attribution (point 7 ci-dessous) : le régénérer avant de le publier.

## Transcription 71B505 — identification des voix, frontières, garde-fous Gemini (2026-09-19) — ⚠️ à vérifier à l'écoute

Session autonome de nuit (branche `transcription/ameliorations-attribution`, non mergée). Détail et chiffres : [`transcription-debat/docs/superpowers/specs/2026-09-19-attribution-voix-design.md`](./transcription-debat/docs/superpowers/specs/2026-09-19-attribution-voix-design.md). Fichiers produits (non versionnés) : `transcription-debat/backend/transcripts/Multiculturalisme/71B505/` — `71B505_2026-09-19_corrected.txt`, `71B505_2026-09-19_rapport.json`, `reference/`.

**Déjà vérifié** : 204 tests pytest ; accord voix/log en validation croisée 92,9 % (couverture 96 %) ; `[?]` 32,7 % → 1,5 % ; garde-fous Gemini rejoués sur les 170 corrections du 24/06 (7 vraies modifications de sens interceptées) ; aucun prénom privé resté visible dans le corrigé (liste de relecture du rapport).

**Reste à vérifier humainement (écoute de l'audio)** :
1. **Modérateur = Interlocuteur 7 ?** La voix de l'ouverture (0:56–3:20, « Bonjour à tous, merci d'être là… ») est celle des tours d'Interlocuteur 7 (contrôle par empreintes vocales concluant mais indirect). Écouter l'ouverture puis un tour d'Interlocuteur 7.
2. **31:07–31:17** : alternance Interlocuteur 7 / Interlocuteur 9 / `[?]` au milieu d'une même question — probable confusion entre deux voix.
3. **35:10** : « Alors, tu / as fait un / conflit. » réparti Interlocuteur 6 / Interlocuteur 7 — décalage d'un mot entre Whisper et la diarisation, ou vraie relance ?
4. **Tour de table 1:33:27–2:05 (hors log)** : attribution par la voix seule. Interlocuteur 2 y passe de ~13 min (suppositions de Gemini au 24/06) à presque rien — vérifier 2–3 prises de parole.
5. **Prénoms** : pour ce run, 12 prénoms privés absents de `name_map.json` ont été masqués via `--redact-names` (liste et entrées JSON prêtes à copier dans `transcripts/Multiculturalisme/71B505/prenoms_a_ajouter_name_map.md`, non versionné). Les ajouter à `name_map.json` pour les prochains runs ; relire `correction.noms_propres_a_verifier` du rapport (un mot ambigu : « Val » à 1:33:47, probablement « de base »).
6. **Mesure** : corriger `reference/extrait_{1,2,3}.txt` à l'écoute (≈ 45 min), puis `python "code python/evaluate.py" score reference/extrait_1.txt 71B505_2026-06-24_corrected.json 71B505_2026-09-19_corrected.json` → WER/WDER avant/après.
7. **`viz/`** (tableau de bord du 02/07) repose sur l'ancienne attribution (temps de parole faux) : à régénérer avec `analyze_debate.py` sur le nouveau `_corrected.json` si on s'en sert.

---

## Transcription — diarisation pyannote toujours sur GPU (2026-10-01) — ⚠️ à confirmer sur un débat complet

Fichier : `transcription-debat/backend/code python/transcribe_offline.py` (`import torch` en tête, `require_gpu_for_diarization`). Cause du plantage `cudnnGetLibConfig` : `faster_whisper` importé avant `torch` (reproduit dans les deux ordres). Vérifié sur un extrait de 3 min (`cuda`, 45 segments) et Whisper GPU sur 1 min ; **pas rejoué sur un débat de 2 h**.

- [ ] Lancer `run_transcription.ps1` sur un débat : la console doit afficher `Diarisation pyannote (cuda)...` et `nvidia-smi` montrer le GPU occupé (~7 min attendues pour 2 h, mesure du 19/09).

## Chantier 149 — cadres autour des noms liés (2026-10-02)

- [ ] **Capture validée par Jules le 2026-10-02.** Reste à voir sur l'écran superadmin réel (rendu vérifié sur harnais jetable, mot de passe superadmin non saisi par la session) : onglet Groupes (puces glissables) et vue « Tables (consultation) ».

## Chantier 150 — modifier son questionnaire d'entrée (2026-10-02)

Tout ce qui se vérifie au navigateur l'a été, sur **dev** (bouton dans Outils, pré-remplissage, enregistrement, bandeaux « Facultatif » en première ligne, refus de la modification en `allocating`, première saisie toujours permise). Aucune vérification manuelle demandée à Jules.

- [ ] **Au merge `dev` → `main`** : appliquer `supabase/migrations/20261002_chantier150_modifier_questionnaire_entree.sql` sur la base **prod** (comparer d'abord `pg_get_functiondef(submit_entry_response)` prod à celle de dev). Une vérification faite sur dev ne vaut pas pour prod.

## Chantier 151 — activité à trois niveaux (2026-10-02)

- **Migration** `supabase/migrations/20261002_chantier151_activite_trois_niveaux.sql` : appliquée sur **dev uniquement** (élargit le `CHECK` de `entry_responses.participation_style` à `listener|intermediate|active` et fait compter `intermediate` comme actif dans `get_allocation_inputs`). **À appliquer sur prod au merge vers `main`, après `20260906_chantier72_2_*`** (la fonction diffère entre dev et prod tant que 72_2 n'y est pas).
- ✅ **Vérifié au navigateur par la session (dev, séance de test supprimée)** : les trois boutons s'affichent, « Intermédiaire » s'enregistre (`intermediate` en base), la réouverture via Outils → « Modifier questionnaire d'entrée » est pré-remplie sur Intermédiaire, le passage à « Actif » s'enregistre.
- ✅ **Allocation vérifiée côté superadmin au navigateur (dev, 2026-10-02, avec Jules)** : séance de test à 9 présentiels (3 passifs, 3 intermédiaires, 3 actifs) → le panneau d'allocation annonce « 6 actifs · 3 en public » : les intermédiaires comptent comme actifs, les passifs restent en public. Calcul seul (aucun « Appliquer »).
- ⏳ Visuel du badge **Intermédiaire** (ambre) dans la barre latérale du modérateur : non vérifié à l'écran (il faut une table en débat avec un participant « Intermédiaire »).

## Chantier 153 (2026-10-02) — Propositions : « voter d'abord » et plafond par personne

**Vérifié au navigateur sur dev** (séance de test, supprimée ensuite) : participant côté `#vote/<code>`, réglages posés en base. « Voter d'abord » → bouton « Proposer » absent (en-tête) et ligne « Proposer une assertion » absente de la modale d'intro tant qu'il reste une assertion non votée ; tout voté → les deux boutons reviennent ; proposition soumise normalement ; plafond 3 avec 3 propositions et tout voté → aucun bouton, aucune mention ; plafond relevé à 4 → le bouton revient en ~4 s sans recharger. Refus serveur vérifié pour les deux règles (`submit_assertion` appelée avec l'identité du participant). Mauvais mot de passe refusé sur `set_session_assertion_rules`.

**Écran superadmin — vérifié ensuite au navigateur sur dev (Jules a saisi le mot de passe lui-même)** : la case « Voter sur toutes les options avant de proposer » et le champ « Max. de propositions par personne » s'affichent sous « Propositions ouvertes » sur toutes les séances sauf le débat simple ; cocher la case enregistre (vérifié en base) ; saisir 2 + Entrée enregistre 2 sans toucher à la case ; saisir 0 est refusé et le champ revient à 2 ; vider le champ remet NULL (illimité) ; après rechargement de la page, case cochée et plafond 3 conservés.

**Reste à vérifier**
- [ ] Même contrôle côté **association** (`#asso`, sondage) : les commandes y sont visibles et la RPC passe (`check_session_admin`) — non joué, pas de compte d'association de test sous la main.
- [ ] Un participant qui avait déjà dépassé un plafond abaissé garde ses assertions (rien ne disparaît) mais ne voit plus « Proposer » (la partie « ne voit plus » est vérifiée ; la conservation des assertions est garantie par le code, qui ne supprime rien).

**Point de comportement à connaître** : en « voter d'abord », les assertions du participant lui-même comptent parmi celles qu'il doit voter (l'app ne les exclut nulle part de sa file) ; avec la modération `open`, il doit donc voter sa propre proposition avant d'en faire une deuxième.

## Chantier 154 (2026-10-05) — Visibilité des séances sur l'accueil

**Vérifié au navigateur sur dev** : « QA Vérifs — Débat » masquée en base (`visible_on_home = false`) → absente de « Séances en cours » ; les autres séances et le filtre asso inchangés ; remise visible ensuite.

**Écran superadmin — vérifié au navigateur sur dev le 2026-10-05** (Jules a saisi le mot de passe) : pastille sur les séances en cours (absente sur les séances closes et d'association), bascule « Visible » → « Masquée » écrite en base, conservée après rechargement, puis remise ; case « Visible sur l'accueil de l'application » à la création, décochée → séance créée avec `visible_on_home = false` (séance de test supprimée). Les séances `QA 155 …` sont masquées volontairement par le chantier 155.

**Reste à vérifier**
- [ ] Une séance masquée reste joignable par `#session/<code>` (non rejoué).
- [ ] **Prod, après merge** : appliquer `20261005_chantier154_visibilite_accueil.sql` AVANT de déployer le code (sinon l'accueil de prod devient vide : colonne inconnue) et vérifier que l'accueil liste toujours les séances.

## Chantier 156 (2026-10-05) — Réglages de séance rangés dans Préparation / En direct

**Vérifié au navigateur sur dev** (superadmin, copies de test remises dans leur état, chaque écriture relue en base) : verrou des propositions depuis Préparation et depuis En direct ; plafond de propositions saisi depuis En direct ; « Visible sur l'accueil » depuis Préparation ; « Résultats publics » (séance close, absent de la liste et de « Visible sur l'accueil » comme prévu) ; onboarding.

**Reste à vérifier**
- [ ] **Côté association (`#asso`)** — non rejoué, mot de passe d'association inconnu de la session : dans une séance d'association (sondage ou débat simple), la section « Réglages » de Préparation ne doit montrer ni « Visible sur l'accueil », ni onboarding, ni résultats publics ; le verrou et ses deux règles doivent y être (sondage) et fonctionner (le jeton `org_…` passe dans `p_password`). Un débat simple d'association n'a plus de section « Réglages ».
- [ ] Sur prod après merge : rien de particulier (front seul, aucune migration).

