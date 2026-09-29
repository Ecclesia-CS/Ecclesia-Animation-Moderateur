# À vérifier

> **Nettoyé le 2026-09-29 (fin du chantier 141).** Tout ce qui a été vérifié au navigateur (à la main par Jules ou automatiquement sur dev par le chantier 141) a été retiré, sur décision de Jules : plus de consigne de vérification humaine pour ces points. **Ne restent ici que les points que le navigateur ne sait pas jouer**, ou qui ne valent que sur prod. L'ancien contenu (recettes, historique, annotations 141) est dans l'historique git : `git show 8656608:A_VERIFIER.md`. Les rapports détaillés de la passe 141 sont dans [`docs/rapports-tests-141/`](./docs/rapports-tests-141/) (`rapport-consolide.md` d'abord).
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

Puis, sur une séance de test **de prod** :
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

