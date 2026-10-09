# À vérifier

> **Nettoyé le 2026-09-29 (fin du chantier 141).** Tout ce qui a été vérifié au navigateur (à la main par Jules ou automatiquement sur dev par le chantier 141) a été retiré, sur décision de Jules : plus de consigne de vérification humaine pour ces points. **Ne restent ici que les points que le navigateur ne sait pas jouer**, ou qui ne valent que sur prod. L'ancien contenu (recettes, historique, annotations 141) est dans l'historique git : `git show 8656608:A_VERIFIER.md`. Les rapports détaillés de la passe 141 sont dans [`docs/rapports-tests-141/`](./docs/rapports-tests-141/) (`rapport-consolide.md` d'abord).
>
> **Règle de Jules (2026-10-02)** : « Désormais, toutes choses vérifiées par un navigateur ne doivent plus être vérifiées par Jules. » Une session ne consigne donc ici que ce que le navigateur ne peut pas jouer ; le reste est vérifié par elle-même et noté dans `docs/chantiers.md`.
>
> **Règle de Jules (2026-10-05)** : ce qu'une session a vérifié elle-même au navigateur (ou en SQL sur dev) **est retiré de ce fichier**, pas coché : Jules n'a pas à le revérifier. Le détail de ce qui a été joué va dans `docs/chantiers.md`. Une vérification faite sur dev ne vaut pas pour prod, sauf décision contraire de Jules (chantier 144 : « pas nécessaire sur prod »).

---

## 1. Glisser-déposer à la souris (dnd-kit ignore le pointeur synthétique du navigateur automatisé)

Sur une séance de test, avec la souris.


## 2. Deux identités ou deux appareils en même temps (le navigateur intégré n'en gère qu'une)

- [ ] **Chantier 35 — synchro Realtime du statut modérateur** (deux onglets/navigateurs, superadmin + participant) :
  1. superadmin sur « Tables rattachées » ; un 2ᵉ onglet fait `reclaim_moderator` → `moderator_pseudo` se met à jour sans rechargement (~15 s) ;
  2. auto-attachement : séance `allocating`/`debating`, table animée sans modérateur ; 2ᵉ onglet `#session/<code>` → « 🎙️ Modérateur » → se déclarer → la table apparaît côté superadmin sans rechargement ;
  3. retrait en débat : le superadmin retire le statut d'un modérateur physique → bascule vers `ParticipantView` sans rechargement, puis retour en le recochant ;
  4. phase vote : badge « Vous êtes modérateur » disparaît sans rechargement quand le superadmin décoche ;
  5. régression : un modérateur classique sans ligne `session_members` garde son `ModeratorView`.
- [ ] **Chantier 50 — Realtime ne livre que ses propres lignes** : deux navigateurs (participants A et B) ; le superadmin modifie A → **B ne reçoit aucun événement** (onglet Réseau, frames WebSocket) ; il modifie B → B réagit toujours (badge, bascule de vue, numéro de table).
- [ ] **Écran du modérateur supprimé ou remplacé** — vu côté superadmin seulement, pas côté modérateur : (137-D d) supprimer un modérateur en `debating` → son écran bascule en participant ; (118, 109, 139) « Libérer la modération » ou le placement à l'ouverture du débat → le modérateur placé voit son écran, l'ancien animateur repasse en participant. (« Retirer » a été joué le 2026-10-05 : l'écran modérateur bascule en participant en moins de 3 s, sans rechargement.)
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

> ✅ **Fait le 2026-10-05** (merge `dev` → `main`, fast-forward de 60 commits, chantiers 147 à 157) : **7 migrations appliquées sur prod, dans cet ordre** — `147`, `148`, `148b`, `150`, `151`, `153`, `154` (noms prod : `chantier147_…`, `chantier148_…`, etc.). Appliquées **avant** le push de `main`, pour que le `GRANT SELECT(visible_on_home)` du 154 soit en place quand le code qui lit cette colonne arrive (même piège que `organization_id` le 30/09) ; l'ancien code reste compatible avec le nouveau schéma (colonnes ajoutées, contrainte élargie).
> Vérifié avant d'appliquer, en lecture seule sur prod : contrainte `participation_style` identique à celle supposée par le 151 (valeurs en base : 23 `active`, 9 `listener`, toutes encore valides) ; `submit_assertion` et `get_allocation_inputs` identiques à l'état de départ attendu par les 153 et 151 ; aucun débat simple sur prod. **Rattrapages de données** de 147/148/148b : 1 + 3 + 4 tables touchées, **toutes de séances closes** (« Retraite », « Faut-il réformer l'héritage en France ? », « Énergie… », « Réunion apprentissage modération 21/09 », « Multiculturalisme ») ; la seule séance vivante (sondage « Thèmes pour le débat ImpactxEcclesia », `pre_voting`) n'est pas concernée.
> Après coup : `entry_responses_participation_style_check` à trois valeurs ; `anon`/`authenticated` ont `SELECT` sur `visible_on_home`, `assertions_vote_first`, `max_assertions_per_member`, `assertions_locked`, `organization_id` ; `table_owner_uid` et `clear_seated_physical_moderator` non exécutables par `anon` ; plus aucune table de séance avec un `created_by` non assis ; `get_advisors` sécurité : mêmes familles d'alertes qu'avant (fonctions `SECURITY DEFINER` appelables, `search_path` mutable sur des fonctions anciennes), aucune nouvelle.
> Neuf fonctions différaient entre prod et dev sans migration associée (`admin_submit_assertion`, `assign_table_to_group`, `check_gemini_rate_limit`, `create_session`, `enforce_org_session_rules`, `merge_assertion_votes`, `move_participant`, `org_consume_naming_quota`, `get_table_opinion_summary`) : relues, **uniquement des commentaires** (le clonage de dev les avait retirés), logique identique.
> **Retour arrière** : tag `pre-merge-dev-20261005` pour le code. **Pas d'instantané de schéma cette fois** (contrairement au 30/09) : pour défaire les migrations, rejouer les anciennes définitions de fonctions (celles de la 09-30) et le bloc `ROLLBACK` en pied des fichiers 153 et 154 ; la contrainte du 151 se rétablit en retirant `'intermediate'` **après** avoir vérifié qu'aucune ligne n'a cette valeur.
> **Suppression de `transcription-debat/`** (commit `d6d8a35` de dev, confirmée par Jules le 2026-10-05) : le sous-projet disparaît de `main`, récupérable dans l'historique git (tag `pre-merge-dev-20261005`).

> ✅ **Recette partielle sur prod, 2026-10-05** (session « merge dev to main », navigateur intégré, séances « QA recette » créées puis supprimées, vrai sondage intact) : **154** (masquer une séance : base `visible_on_home = false`, absente de l'accueil, vrai sondage toujours listé), **147**, **148**, **153**, **150** (réécriture du questionnaire refusée hors phase `voting`) et **151** (`intermediate` accepté et stocké) vérifiés — détail dans les cases ci-dessous. **Non jouable dans le navigateur intégré** : les WebSockets y échouent partout (dev, prod, serveur d'écho) ; seule la couche d'interrogation de secours a été exercée. **151 et 150 ensuite rejoués par l'écran** (séance complète de test, supprimée) : onboarding à 4 questions avec les trois boutons Passif / Intermédiaire / Actif, `intermediate` stocké ; Outils → « Modifier questionnaire d'entrée » pendant `voting` : `intermediate` → `active` enregistré. **Non couvert** : l'effet des intermédiaires dans l'allocation (`get_allocation_inputs`, qui demande le mot de passe et un vrai effectif), 135/139/140/140b/143, 106/109/117/118, 91/92, et les cas à deux identités.

> ⏳ **À appliquer sur prod au prochain merge `dev` → `main`, après la 160** : `20261008_chantier161a_tables_desolidarisees` (appliquée sur dev le 2026-10-08). Ajoute `tables.debate_ended_at`, les helpers internes `member_table_id`/`table_effective_phase`/`member_effective_phase`, les RPC `end_table_debate`/`reopen_table_debate` (+ `_admin`), le trigger `participants_guard_ended_table` ; réécrit `cast_vote` (garde de phase), `get_all_votes_for_analysis` (`pre_closure` annule aussi le post-vote), `set_session_phase`, `get_results_map`, `get_my_table_assignment`, `assign_least_filled_table`, `join_simple_debate`, `force_session_questionnaire`. Toutes identiques dev/prod au 2026-10-08 sauf `cast_vote` (160). Le `REVOKE UPDATE ON tables` / `GRANT UPDATE (questionnaire_forced_at)` est **sans effet sur prod** (prod l'avait déjà ; seul dev avait dérivé). Testée sur dev en SQL, identité simulée, transaction annulée : 15 cas (refus non-modérateur, vote refusé à une table qui débat, revote à une table terminée tagué `post_voting`, carte ouverte/fermée, trigger d'entrée, réouverture, retardataire, débat simple → `closed`, association refusée, droits). **Non testé en SQL** (mot de passe requis) : `set_session_phase` (remise à zéro à l'entrée en débat), `get_all_votes_for_analysis` en `pre_closure`, variantes `_admin` — à rejouer au navigateur dans le 161b.

> ⏳ **Puis, juste après la 161a** : `20261008_chantier161b_list_session_tables_fin_de_debat` (appliquée sur dev le 2026-10-08) — `list_session_tables` renvoie `debate_ended_at` (DROP + CREATE, ACL anon/authenticated refaite ; identique dev/prod avant réécriture).

> ⏳ **Puis** : `20261009_chantier161c_reentree_debat_efface_questionnaire_force` (appliquée sur dev le 2026-10-09) — `set_session_phase` efface aussi `questionnaire_forced_at` à toute entrée en Débat (corrige le questionnaire qui réapparaissait après un retour Post-vote → Débat).

Puis, sur une séance de test **de prod** :
- [x] **153** — sur une séance de test de prod, régler « voter d'abord » et un plafond depuis le superadmin, vérifier que le bouton « Proposer » suit en direct côté participant (comme vérifié sur dev). ✅ **Vérifié sur prod le 2026-10-05** (séance de test supprimée) : plafond à 1 → 2e proposition refusée côté serveur (« nombre maximal »), « voter d'abord » → refusée tant qu'une assertion approuvée n'est pas votée, acceptée après le vote ; réglages enregistrés depuis Préparation. Reste : le côté association (`#asso`) et le suivi en direct du bouton « Proposer » (Realtime coupé dans le navigateur intégré).
- [x] **147** — créer un débat simple depuis le navigateur d'administration, ouvrir **le même lien dans ce même navigateur** : on doit arriver en **participant** (écran noir modérateur absent), et un second appareil qui entre avec « Je suis le modérateur » + code doit être accepté (pas de « Toutes les tables ont déjà un modérateur ») et apparaître comme modérateur dans l'onglet Groupes. (Vérifié en base dev uniquement — le navigateur intégré a refusé `localhost` le 2026-10-02.) ✅ **Vérifié sur prod le 2026-10-05** : débat simple créé depuis le navigateur d'administration, lien ouvert dans ce même navigateur → vue participant, `session_members.is_moderator = false`, `created_by` = identifiant neutre. Reste : le second appareil qui entre avec « Je suis le modérateur » + code.
- [x] **148** — à une table de séance, un participant fait Outils → « Reprendre l'animation de cette table » avec le **vrai** code : écran noir chez lui, l'ancien animateur repasse participant, il apparaît modérateur dans l'onglet Groupes, et **recharger la page le laisse modérateur**. Puis le retirer (onglet Groupes) : retour immédiat en participant. (Vérifié sur dev le 2026-10-05 avec le **vrai** Code Ecclesia saisi par Jules : prise par Outils → « Reprendre l'animation » → écran modérateur, conservé après rechargement même avec le cache local à `isModerator:false`, visible avec « Retirer » dans Groupes, retrait → retour participant. Reste ici la recette sur prod.) ✅ **Vérifié sur prod le 2026-10-05** (une seule identité) : Outils → Modérateur → « Reprendre l'animation de cette table » avec le vrai code → modérateur de séance + titulaire unique de la table, `created_by` neutre, vue modérateur conservée après rechargement. Reste : l'ancien animateur qui repasse participant (demande deux identités).
- [ ] **135** — création d'un compte association, connexion `#asso`, prise de modération avec le mot de passe d'asso.
- [ ] **139** — rejouer l'encart « Remplacer le modérateur », la confirmation et le remplacement (points 1 à 3), et l'ancien animateur qui repasse en écran participant.
- [ ] **140** — porte code de table avec un nom déjà pris (message + accordéon ouvert, pas d'entrée).
- [ ] **140b** — contrôler le renommage du doublon de la séance du 03/06, et une inscription avec une autre casse.
- [ ] **143** — contrôle visuel de l'écran « Débat en cours » d'un retardataire (un seul champ nom).
- [ ] **106, 109, 117, 118** — onglet Groupes (badge « en surplus », modérateur physique, « Retirer », « Libérer la modération », modale « Ouvrir le débat »).
- [ ] **91, 92** — recette d'allocation sur une séance de test (déterminisme, actifs/public par table, grappes de binômes).

## Chantier 164 — allocation, modérateur laissé de côté (2026-10-09) — reste à jouer

**Vérifié hors navigateur** : `tsc` propre ; `allocation.test.ts` (93 tests, dont 17 nouveaux — 9 échouent sur l'ancien code) ; garde-fous du banc (`bench/strategy-sanity.test.ts`) ; comparaison ancien/nouvel algorithme sur 69 120 cas (voir `docs/chantiers.md`, ligne 164) : 0,89 % de sorties modifiées, toutes dans le défaut. **Non rejoué au navigateur** : fonction pure (`runAllocation`), aucun écran modifié, le calcul tourne dans le navigateur du superadmin sur les entrées de `get_allocation_inputs`.

- [ ] **À la prochaine vraie séance (ou sur une séance de test à 14 actifs et 2 modérateurs)** : dans `AllocationPanel`, « Calculer » doit proposer **2 tables animées de 7 actifs**, avec ou sans l'option « interdire les tables sans modérateur », et aucun modérateur assis. Si l'aperçu reste sur une table unique ou sur `10 + 5 sans modérateur`, c'est un signal (blob d'aperçu périmé dans le navigateur : relancer le calcul).
- [ ] **À savoir (limite connue, volontaire)** : si animer toutes les tables dégrade une règle 1 à 3 (par exemple des camps non viables), le résultat historique est conservé — la spec veut que les règles priment sur le dimensionnement. Un modérateur peut donc rester assis avec une table sans animateur dans ces cas (50 sur 64 défauts restants sur la grille synthétique ; les 14 autres sont des séances de 10 actifs ou moins, table unique prévue par la spec). Le modérateur assis reste un participant actif de sa table.
- [ ] **Débat simple / sondage / associations** : sans objet — l'allocation n'existe que pour la séance complète.

## Chantier 161 — tables désolidarisées (2026-10-08) — reste à jouer

**Joué au navigateur sur dev (Browser pane), puis données remises en état** : séance complète « QA Vérifs — Complète », table 2 — modérateur : Outils → « Terminer le débat de ma table » → confirmation → sortie immédiate (« Le débat de votre table est terminé ») ; rechargement → questionnaire « Étape 5 · Post-débat » alors que la séance débat → résultats avec carte, « ↻ Revoter » et « Rouvrir » ; revote accepté et tagué `post_voting` en base ; « Rouvrir » → « Accéder à la table » → écran modérateur. Participant : fin de table venue d'ailleurs → questionnaire forcé puis écran de fin « Étape 5 » ; résultats sans « Rouvrir » ; réouverture → bandeau « Le débat de votre table a repris » (et « Revoter » qui disparaît) → retour à la table ; un membre resté sur « Accéder à la table » est redirigé vers ses résultats. Débat simple « QA Vérifs — Débat » : texte de confirmation propre, questionnaire « Étape 2 · Terminé », écran de fin de table avec « Rouvrir », réouverture → écran modérateur (après correction du bug `userId` vide, voir `docs/chantiers.md`).

**Joué ensuite, le 2026-10-09, avec le mot de passe superadmin saisi par Jules** (onglet Tables, « QA Vérifs — Complète » puis « QA Vérifs — Débat ») : compteur « N / M tables ont terminé », badges « ● en débat » / « ✓ débat terminé à HH:MM », « 🏁 Terminer » et « ↺ Rouvrir » avec leurs confirmations (texte propre au débat simple), bandeau vert « Toutes les tables ont terminé — vous pouvez passer en Post-vote » / « … clôturer la séance » ; séance en Post-vote → réouverture par le modérateur refusée par le serveur ; retour en Débat → tables remises en débat (après correction 161c du questionnaire forcé qui restait posé). Séances remises en `debating`, aucune table terminée.

- [ ] **Association** : vérifier sur `#asso` (débat d'association) qu'aucun état/bouton de fin de table n'apparaît, ni côté administration ni côté modérateur (garde serveur testée en SQL : refus).
- [ ] **Deux appareils** (le navigateur intégré n'a qu'une identité) : modérateur et participant de la même table en même temps — le participant reçoit-il le questionnaire puis l'écran de fin **sans recharger**, dans un navigateur in-app (Messenger) ?
- [ ] **Analyse « avant post-vote »** (`pre_closure`) sur une séance où une table a revoté pendant le débat : les revotes de cette table ne doivent pas compter dans le terme « avant ». Aucun bouton superadmin ne lance encore ce calcul (constat du chantier 79) : à faire en SQL ou à décider.

## Chantier 167 — comparaison avant / après débat (2026-10-09) — écran joué, reste la prod

**Vérifié** : SQL — 11 scénarios dans `supabase/tests/chantier167_changements_de_vote.sql` sur dev, avec de vrais appels à `cast_vote` (changement avant le débat non compté ; revote en post-vote compté ; A→B→A inchangé ; reclic du même vote ignoré ; vote né en post-vote compté à part ; filtre « présents en personne » ; séance vide ; RPC interne non appelable depuis `anon`), tout annulé. `get_vote_changes_admin` appelable par `anon`, refuse un mauvais mot de passe. `tsc -b` propre, 3 tests unitaires du normaliseur.

- [x] **Écran superadmin — joué au navigateur sur dev le 2026-10-09** (mot de passe saisi par Jules), séance jetable « T166 QA comparaison » (6 membres, 3 assertions, 3 revotes en post-vote, 1 vote né en post-vote, 1 changement d'avant-débat, 2 analyses « courant ») puis supprimée : onglet Analyse → « Comparaison avant / après débat » → « 3 membres sur 6 ont changé d'avis (50 %), 3 votes modifiés sur 16 », transitions d'accord → pas d'accord : 2 et pas d'accord → d'accord : 1, mention du vote né en post-vote, détail avant/après par assertion — identique au résultat SQL. Un revote ajouté en base pendant que la page était ouverte apparaît après « Actualiser » (4 membres, 67 %). Sélection par défaut sans analyse `pre_closure` : Avant = l'avant-dernière analyse, Après = la dernière ; la comparaison par camps s'affiche. Console : aucune erreur due au chantier (le CORS de `gemini-proxy` sur dev est connu, l'avertissement `validateDOMNesting` vient d'`AnalysisPanel` hors comparaison). **Non rejoué** : le cas « personne n'a modifié un vote » (texte seulement, couvert par le test SQL séance vide).
- [ ] **Migration à appliquer sur prod au merge vers `main`**, **après la 161a** (sinon « avant » reste faux, la reconstitution ne cherchant que `'closed'`) : `20261009_chantier166_resume_changements_de_vote.sql` (nom conservé, voir `docs/chantiers.md` 167). Avant : `list_migrations` prod vs fichiers, `pg_get_functiondef` de `get_all_votes_for_analysis` sur prod (doit contenir `IN ('post_voting', 'closed')` une fois la 161a appliquée). Après : `get_advisors`. Ne pas rejouer le script de test sur prod (il crée une séance jetable, annulée, mais inutile).
- [ ] **Limite connue** : « avant » n'existe que pour les votes posés avant le post-vote ; un vote posé pour la première fois en post-vote est compté à part, jamais comme un changement. Et sur prod, un revote fait entre le chantier 69 et le chantier 70 n'a pas d'historique (fenêtre de contamination déjà documentée dans la migration du 70).

## Chantier 165 — binômes / trios (2026-10-09) — reste à jouer

**Joué au navigateur sur dev (Browser pane), puis données de test supprimées** (séance « T165 test binômes ») : onboarding question 4 (rappel « plus tard » + nom pas encore inscrit), saisie d'un nom inexistant → message « personne ne porte ce nom pour l'instant » et nom **gardé** (relu dans « Outils » → « Être avec un ami »), notification « On t'a choisi·e » (fenêtre, puis encadré, puis « Le/la choisir en retour » → « C'est fait »), arrivée d'un nom saisi avec casse/espaces différents → lien résolu et trio {Alice, Chloé, Bruno} formé, quatrième personne **refusée** avec le motif affiché. SQL : 12 scénarios dans `supabase/tests/chantier165_binomes.sql` (aucune trace laissée).

- [x] **Écran superadmin — joué au navigateur sur dev le 2026-10-09** (mot de passe saisi par Jules), séance de test « T165 superadmin » (2 tables, 2 modérateurs, 1 binôme modérateur↔participant) puis supprimée : le badge « 🔗 lié à T165 Paul » apparaît sur le modérateur et le participant est encadré « 🎙️ avec T165 Marc (mod) » ; glisser le participant sur la table 2 → fenêtre de confirmation (modérateur lié suit et anime, ancien animateur passe en surplus, table quittée sans modérateur) → en base, Marc anime la table 2 avec Paul ; « Ajouter » Marc comme modérateur de la table 1 → Marc anime la table 1 et Paul revient avec lui. **Non rejoué** : le bouton « Annuler » de la fenêtre et le cas d'un modérateur désigné sur une table déjà animée (même fenêtre, texte « Remplacer »).
- [ ] **Deux appareils** : la notification arrive-t-elle chez la personne citée en moins de ~10 s sans recharger, y compris dans le navigateur de Messenger ?
- [ ] **Migrations à appliquer sur prod au merge vers `main`** : `20261009_chantier165_binomes_noms_a_venir_trio_plein.sql` puis `20261009_chantier165b_normalisation_des_noms.sql`. Avant : `list_migrations` prod vs fichiers, `pg_get_functiondef` de `set_my_pairings`/`get_my_pairings` sur prod, `SELECT` de contrôle sur `member_pairings` (structure + nombre de lignes) — la 165 change la PK et rend `target_member_id` nullable. Après : `get_advisors` (sécurité + performance) — ne pas rejouer le script de scénarios sur prod (il passe une séance existante en `voting` le temps du test, même annulé).
- [ ] **À savoir (limite connue)** : le rapprochement ignore les espaces multiples et la casse, **pas les accents** (« Gaëlle » ≠ « Gaelle »). Un nom mal orthographié reste « à venir » indéfiniment. Si ça arrive en vrai, on pourra ajouter une vue « noms cités mais introuvables » côté superadmin.
- [ ] **Débat simple / sondage** : sans objet — les binômes ne se déclarent qu'en phase `voting`, que seule la séance complète traverse.

## Chantier 162a — fil de partage de la table (2026-10-09) — reste à jouer

**Joué au navigateur sur dev (Browser pane), puis données de test supprimées** : table de « QA Vérifs — Débat » côté participant (Outils › « Partager une source » : lien « www.… » complété en `https://`, onglet « Une de mes sources », « En attente du modérateur », carte reçue par le polling de 5 s après l'acceptation) et table de test hors séance côté modérateur (deux demandes en attente, « Montrer à la table », « Refuser », « Retirer », « Montrer une source » par le modérateur lui-même, refus d'un `javascript:` côté client) ; restitution « Montrées pendant les débats » dans `#collab/<code>` (séance mise temporairement en `post_voting`, puis remise en `debating`). Les décisions du modérateur ont été prises par la RPC avec une identité simulée (un seul navigateur, une seule identité).

- [ ] **Deux appareils** : un participant sur un téléphone, le modérateur sur un autre, sur une vraie table — la demande arrive-t-elle chez le modérateur en quelques secondes, et la carte chez la table, **sans recharger**, y compris dans le navigateur de Messenger ?
- [ ] **Association** (`#asso`) : un débat d'association — « Partager une source » présent, **sans** l'onglet « Une de mes sources » (garde serveur testée en SQL, écran non rejoué).
- [ ] **Après la fin de débat d'une table (161)** : le fil n'est plus affiché (la table voit l'écran de fin), puis **réapparaît à la réouverture** du débat — cette interaction n'a été vérifiée qu'en lecture du code et par la garde serveur.
- [ ] **Prod** : la migration `20261009_chantier162a_table_shares.sql` est à appliquer sur prod au merge, **après** la 161a/161b/161c (elle appelle `table_effective_phase`).

## Chantier 162b — captures d'écran partagées avec la table (2026-10-09) — reste à jouer

**Joué au navigateur sur dev (Browser pane), puis données de test supprimées** : second utilisateur anonyme créé dans la page, table de test hors séance ; demande d'image → aperçu chez le modérateur → acceptation → carte ; collage Ctrl+V (événement simulé) → onglet « Une image » s'ouvre, aperçu, titre obligatoire, envoi, carte + fil ; politiques de stockage en SQL (identités simulées) ; Edge Function `purge-share-images` (mauvais mot de passe, séance non close, séance close, idempotence) ; **clôture réelle depuis `#asso`** avec un jeton d'association de test → fichier supprimé.

- [ ] **Téléphone réel** : « Choisir une image » ouvre la galerie sur iPhone (Safari) et Android (Chrome) ; l'image part, le modérateur la voit. Le collage depuis le presse-papiers d'un téléphone n'a pas été joué (marche sur certains seulement).
- [ ] **Vraie capture d'écran d'ordinateur** : Ctrl+V (touche « Impr. écran » ou Win+Maj+S) dans « Partager une source › Une image », et glisser-déposer d'un fichier — seuls des événements simulés ont été joués.
- [ ] **Navigateur de Messenger** : l'envoi et l'affichage d'une image (URL signée) y fonctionnent-ils ?
- [ ] **Superadmin (mot de passe Ecclesia)** : clôturer une séance qui a des captures → fichiers supprimés (`SELECT count(*) FROM storage.objects WHERE bucket_id='table-shares'` → 0). Seule la voie association a été jouée (même code).
- [ ] **Deux appareils** : l'image acceptée par le modérateur apparaît chez la table en quelques secondes sans recharger.
- [ ] **Prod, au merge** : appliquer `20261009_chantier162b_table_share_images.sql` puis `20261009_chantier162b2_purge_authorized.sql` (après la 162a) **et déployer l'Edge Function `purge-share-images`** (`verify_jwt: true`) sur le projet prod ; vérifier `list_edge_functions` et le bucket `table-shares` (privé, 1 Mo). Les alertes de sécurité `can_*_share_image` exécutables par `authenticated` sont voulues (le moteur de stockage évalue les politiques en tant que l'appelant ; elles ne renvoient qu'un booléen).

## Chantier 166 — votes de la table pour le modérateur (2026-10-09) — reste à jouer

`tsc`, `vite build` verts. **Joué au navigateur sur dev le 2026-10-09, côté participant** (séance « QA Vérifs — Complète », table 2437F8, participant « Testeur Chantier166 » créé pour l'occasion) : onglets Toute la séance / Ma table, tri et badges corrects, décomptes recoupés en SQL. Le même composant sert côté modérateur (Outils Modo → Assertions votées) et la modale Camps (tri par dissensus) ; **côté modérateur, confirmé par Jules à l'écran le 2026-10-09** (Outils Modo → Assertions votées : les deux fenêtres Séance / Ma table sont là). Reste non joué : la modale Camps en tri par dissensus, la table hors allocation, le revote en post-débat.

- [ ] **Outils Modo → Assertions votées** : l'onglet « Toute la séance » s'ouvre par défaut et affiche la même liste qu'avant ; l'onglet « Ma table » ne compte que les votes des personnes de la table (comparer un total à celui de l'onglet Séance), les plus partagées en tête (badge « Clivant » en haut, « Aucun vote » en bas).
- [ ] **Revote en post-débat** : rouvrir la modale après un revote → les chiffres de « Ma table » ont bougé (relus à chaque ouverture).
- [ ] **Table hors allocation** (créée à la main) : onglet « Ma table » → message « n'est pas issue de l'allocation », pas de page blanche.
- [ ] **Confidentialité** : sur une table de 3-4 personnes, les décomptes par assertion permettent de deviner un vote individuel. Même exposition que la modale Camps (RPC ouverte à tout participant de la table) ; à confirmer que c'est voulu pour le modérateur.

## 6. Non joués par la passe 141 (faisables, à décider)

Pas impossibles à automatiser : ils ont été laissés de côté faute de marge dans les conversations, ou parce que le même code est déjà couvert par un cas joué. À rejouer avec les mots de passe de Jules si l'on veut fermer ces points.

- [ ] **108 — déclaration modérateur unifiée** : C1 (reprise d'un code de rappel en pré-vote) et C2 (réouverture en `allocating`) demandent des parcours sur plusieurs phases ; C3 (secours en `debating`) est couvert par équivalence (même RPC `claim_table_as_moderator`).
- [ ] **Chantier 140** — changement de table en allocation (`AllocatingScreen`, `switch_table`) et `TableChangeModal` ; porte du secours de `VoteScreen` (même composant `JoinTableForm`). (Joués le 2026-10-05 : `ChangeTableModal` en débat, lien `#table/<code>` sans séance.)
- [ ] **A1 (à tester)** — après la prise d'une table `leaderless` par la porte modérateur (Code Ecclesia), le preneur peut-il arriver sur la vue **participant** au lieu de `ModeratorView` (rechargement nécessaire) ? Vu 1 fois sur 3 ; non reproduit en 2 essais au 141f. Rejouer plusieurs fois, sans rechargement.
- [ ] **Ménage des tables de test partagées** — `589D79`, `6ABDC9` (séance « Test manuel — Vote & bascule modérateur ») et `6296A9` (séance TEST33A, participant « Test Notes QA ») : à purger, **accord explicite de Jules requis** avant suppression.

## 7. Décisions en attente (pas des vérifications)

- **Chantier 120** — `session_members.user_id` se désynchronise au renouvellement du jeton anonyme. **Bug confirmé, sans correctif codé**, en attente d'un arbitrage de sécurité de Jules. Détail complet ci-dessous.
- **Chantier 139, cas voisins non corrigés** : (a) déplacer l'animateur d'une table par glisser-déposer la laisse sans animateur ni « sans animateur » ; (b) le bouton « modérateur » de la liste des participants peut réaffecter silencieusement la personne à une autre table en plein débat ; (c) la fenêtre « Changement de table » reste masquée tant que les fenêtres d'accueil et de règles sont ouvertes.
- **Chantier 141 — bugs relevés**, voir le chantier de correctifs dans `docs/chantiers-a-faire.md`.
- **Observations du 2026-10-05, à trancher** (aucune n'est un bug avéré) :
  - **`ChangeTableModal` (Outils → « Changer de table »), 1 échec sur 3** : après la saisie du code, la base est correcte (participant déplacé, `table_assignments` à jour) mais l'écran retombe sur l'accueil et `ecclesia_table` est vide. Non reproduit en deux essais suivants. Hypothèse : course entre `tableStore.set` + `window.location.reload()` et l'ancienne table qui détecte la disparition du participant puis appelle `onTableEnd` → `tableStore.clear()` avant le rechargement. Conséquence : le participant doit se reconnecter avec son code de rappel.
  - **Table sans séance, nom déjà pris** : message « Ce nom est déjà pris à cette table. Choisis-en un autre. » mais l'accordéon « J'ai déjà un code de rappel » reste fermé (il n'y a pas de code de rappel hors séance). À confirmer : est-ce voulu (chantier 140 parlait d'accordéon ouvert) ?
  - **« Me déclarer modérateur de la séance » en débat simple** : le membre est marqué modérateur mais reste en vue participant, même après rechargement ; il faut « Reprendre l'animation de cette table » pour obtenir `ModeratorView`. Probablement normal (pas de placement de table sans allocation).

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

- [ ] Côté **`#asso`** : le champ « Fiche info et résumé » de l'écran Documentation (non joué : pas de compte d'association de test).

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

## Chantier 150 — modifier son questionnaire d'entrée (2026-10-02)

- [ ] **Au merge `dev` → `main`** : appliquer `supabase/migrations/20261002_chantier150_modifier_questionnaire_entree.sql` sur la base **prod** (comparer d'abord `pg_get_functiondef(submit_entry_response)` prod à celle de dev). Une vérification faite sur dev ne vaut pas pour prod.

## Chantier 151 — activité à trois niveaux (2026-10-02)

- **Migration** `supabase/migrations/20261002_chantier151_activite_trois_niveaux.sql` : appliquée sur **dev uniquement** (élargit le `CHECK` de `entry_responses.participation_style` à `listener|intermediate|active` et fait compter `intermediate` comme actif dans `get_allocation_inputs`). **À appliquer sur prod au merge vers `main`, après `20260906_chantier72_2_*`** (la fonction diffère entre dev et prod tant que 72_2 n'y est pas).

## Chantier 153 (2026-10-02) — Propositions : « voter d'abord » et plafond par personne

**Reste à vérifier**
- [ ] Même contrôle côté **association** (`#asso`, sondage) : les commandes y sont visibles et la RPC passe (`check_session_admin`) — non joué, pas de compte d'association de test sous la main.

**Point de comportement à connaître** : en « voter d'abord », les assertions du participant lui-même comptent parmi celles qu'il doit voter (l'app ne les exclut nulle part de sa file) ; avec la modération `open`, il doit donc voter sa propre proposition avant d'en faire une deuxième.

## Chantier 154 (2026-10-05) — Visibilité des séances sur l'accueil

**Reste à vérifier**
- [ ] **Prod, après merge** : appliquer `20261005_chantier154_visibilite_accueil.sql` AVANT de déployer le code (sinon l'accueil de prod devient vide : colonne inconnue) et vérifier que l'accueil liste toujours les séances.

## Chantier 156 (2026-10-05) — Réglages de séance rangés dans Préparation / En direct

**Vérifié au navigateur sur dev** (superadmin, copies de test remises dans leur état, chaque écriture relue en base) : verrou des propositions depuis Préparation et depuis En direct ; plafond de propositions saisi depuis En direct ; « Visible sur l'accueil » depuis Préparation ; « Résultats publics » (séance close, absent de la liste et de « Visible sur l'accueil » comme prévu) ; onboarding.

**Reste à vérifier**
- [x] **Côté association (`#asso`) — vérifié au navigateur sur dev le 2026-10-05** (association de test « QA Asso 156 » créée depuis le menu superadmin, connexion `#asso`, puis association et séances supprimées) : sondage d'association → section « Réglages » réduite au verrou et à ses deux règles (ni « Visible sur l'accueil », ni onboarding, ni résultats publics) ; verrou, « voter d'abord » et plafond écrits en base avec le jeton `org_…` ; les mêmes contrôles sont dans « En direct » ; carte de la liste sans pastille. Débat simple d'association → plus aucune section « Réglages ». Au passage, les textes parlaient de « superadmin » (visible par l'association) : remplacé par « l'administration de la séance ».
- [ ] Sur prod après merge : rien de particulier (front seul, aucune migration).


## Chantier 159 (2026-10-07) — Accordéon « Participants inscrits » en débat simple et en sondage

Vérifié au navigateur sur dev côté superadmin (voir `docs/chantiers.md`). Reste ce que le navigateur de session ne sait pas jouer sans mot de passe d'association :

- [ ] **Côté association (`#asso`), à rejouer** : connecté avec le mot de passe d'une association, ouvrir un **débat simple** (accordéon tout en haut de l'onglet Tables) et un **sondage** (tout en bas de « En direct ») ; la liste s'affiche, 🔑 et ✕ fonctionnent sur **ses** participants. Côté serveur, les quatre RPC passent par `check_session_admin` (relu sur dev et prod) : aucun accès aux séances d'une autre association.

## Chantier 158 (2026-10-07) — Code de connexion montré à chaque nouvelle inscription

**Vérifié au navigateur sur dev** (identité anonyme vierge à chaque parcours, détails dans `docs/chantiers.md`) : sondage, débat simple, débat simple d'association, séance complète en vote présentiel, retardataire en débat (« Assignez-moi une table », code de table, lien `#table/<code>`) → le code de rappel s'affiche à chaque nouvelle inscription. Cas « inscription supprimée puis appareil rouvert » (`App.tsx`) rejoué : l'écran « Note ton code de rappel » s'affiche avant l'entrée à la table.

**Reste à vérifier**
- [x] **Inscription avec « Je suis modérateur » en pré-vote (`PseudoForm`) — vérifié au navigateur sur dev le 2026-10-07**, Code Ecclesia saisi par Jules dans le navigateur : l'écran « Note ton code de rappel » s'affiche et le membre est bien `is_moderator` en base. Le même correctif sur le vote présentiel (`VotingEntryForm`, `VoteScreen.tsx`) n'est couvert que par le test unitaire (`src/lib/votingClaimCode.test.ts`) et la lecture du code, pas rejoué à l'écran.
- [x] **Sondage d'association — vérifié au navigateur sur dev le 2026-10-07** (association de test créée depuis le menu superadmin, connexion `#asso`, sondage créé, inscription d'un participant : le code s'affiche ; association et sondage supprimés ensuite).
- [ ] **Résiduel connu, non corrigé** : `release_table_moderation` (« Libérer la modération », superadmin) peut créer à la volée la ligne de membre d'un ancien modérateur physique (lignes antérieures au chantier 119 seulement) et renvoie un code que l'écran jette. Le 🔑 de l'onglet Tables en émet un nouveau. À corriger seulement si ce cas se présente sur prod (aucun cas connu).
- [ ] Sur prod après merge : rien de particulier (front seul, aucune migration).

## Chantier 160 (2026-10-07) — Sondage : mode « vote par consentement »

Migration `supabase/migrations/20261007_chantier160_sondage_consentement.sql` — **appliquée sur dev uniquement** (colonne `sessions.poll_mode`, `create_session` à 10 paramètres, garde de `cast_vote`, `get_public_results`). Détail et vérifications au navigateur : `docs/chantiers.md`, chantier 160.

- [x] **Création côté superadmin — vérifié au navigateur sur dev le 2026-10-07** (mot de passe saisi par Jules dans le navigateur) : « Nouvelle séance » → Sondage → le sélecteur « Mode du sondage » (Camps d'opinion / Consentement) apparaît ; choisir Consentement → badge « Sondage · consentement » sur la ligne de la séance. (Joué côté **association** seulement : même composant, mais le mot de passe superadmin n'était pas disponible à la session.)
- [x] **Résultats publics d'un sondage Ecclesia en consentement — vérifié au navigateur sur dev le 2026-10-07**, parcours complet au clic (création superadmin, phase Vote, onglets En direct et Analyse sans panneau de camps ni score, clôture, `#session/<code>` en visiteur : décomptes seuls) : séance en consentement avec « Résultats publics » activé, clôturée → `#session/<code>` en visiteur non inscrit : décomptes seuls, aucun camp. (Joué sur dev avec une séance posée directement en base ; le parcours « le superadmin active le réglage puis clôture » n'a pas été rejoué.)
- [ ] **Sur prod, au merge `dev` → `main`** — dans cet ordre : (1) migrations 134/135 d'abord (la `create_session` de prod n'a pas encore `p_session_type`/`admin_org_scope`) ; (2) `20261007_chantier160_sondage_consentement.sql`. Avant : `pg_get_functiondef` de `create_session` sur prod (elle diffère de dev). `cast_vote` et `get_public_results` étaient **identiques** sur dev et prod le 2026-10-07 (même `md5`) — à revérifier si un hotfix est passé entre-temps. Après : `SELECT column_name FROM information_schema.column_privileges WHERE table_name='sessions' AND column_name='poll_mode' AND grantee='anon'` doit retourner une ligne (sinon accueil vide, cas du 30/09).
- [ ] **Deux appareils** : voter à deux sur la même option en consentement et vérifier que les décomptes s'additionnent (joué avec une seule identité réelle, le reste posé en base).
- [x] **Vocabulaire — fait le 2026-10-07 (demande de Jules) et vérifié au navigateur sur dev** : en consentement, « option » remplace « assertion » partout où l'interface le dit (fenêtre de proposition, nudge, écran vide, accordéon et panneau admin, statistiques, réglages, mise en garde de suppression d'un membre, création de la séance). Aide : `itemNoun(session)` (`lib/phaseLabels.ts`). Les sondages à camps et les séances complètes gardent « assertion ».
