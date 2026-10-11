# Chantier 161 — Tables désolidarisées de la séance dès le débat : note de conception (2026-10-08)

> Proposition soumise à Jules **avant tout code**, comme aux chantiers 134 et 135. Rien n'est appliqué en base ni codé à ce stade. Les définitions SQL citées sont celles **en base dev** le 2026-10-08 (`pg_get_functiondef`), pas celles des anciens fichiers de migration.

## Consigne de Jules (2026-10-05)

> « Désolidariser les séances à partir des tables à partir de la phase débat. Par exemple, une table peut aller en postvote alors qu'une autre est en débat. […] On pourrait tout à fait attendre que le modérateur active le questionnaire, et envoie tout le monde (y compris lui) en postvote, ou sur la vue résultat (closed), indépendamment du superadmin. »

Arbitrages déjà rendus : **voie A** (bouton « Terminer le débat de ma table », la séance reste `debating` pour les autres) ; la voie B (phase propre à chaque table, phase de séance dérivée) seulement plus tard et si utile ; réouverture possible tant que la séance n'est pas close (mécanisme à proposer) ; superadmin **informé** quand toutes les tables ont fini, sans avancée automatique ; **analyse globale figée** ; séances complètes seulement par défaut.

## Arbitrages de Jules (2026-10-08) — **font foi sur le reste de la note**

| # | Question | Réponse | Conséquence |
|---|---|---|---|
| 1 | Modes de fin | **Un seul mode : post-vote** | Pas de colonne `debate_end_mode` : seule `tables.debate_ended_at`. En débat simple (pas de post-vote), la fin de table mène au questionnaire puis à l'écran de fin — phase effective `closed` |
| — | Débat simple | « en séance débat simple on peut faire ça aussi, pourquoi pas » | **Inclus** (séances `full` et `debate`). Associations : **exclues** (fail-closed, règle du 135 ; une seule table et pas de questionnaire) — la RPC refuse `organization_id IS NOT NULL` |
| — | Superadmin | « sur l'onglet Tables, même accordéon Groupes, on voit l'état d'avancement des tables » | **Pas de nouvel accordéon** : l'état de chaque table (en débat / terminée à HH:MM, bouton Rouvrir) s'affiche dans l'accordéon Groupes existant, avec le compteur « N / M tables ont terminé » en tête |
| 2 | Revotes d'une table terminée | Oui : écrits tout de suite, exclus de l'analyse « avant post-vote » | Comme proposé (§ Analyse) |
| 3 | Réouverture | Le modérateur peut revenir au débat **tant que la séance est en Débat** ; séance en Post-vote ou close → **aucun pouvoir** | Comme proposé : `reopen_table_debate` refuse si `sessions.phase <> 'debating'` |
| 4 | Carte des résultats | **Oui, aussi en post-vote de séance** | `get_results_map` ouvert en `post_voting` de séance **et** pour un membre dont la table est terminée |
| — | Limites du post-vote | « mêmes limitations que pour les votes présentiels et distanciels » (verrou des propositions, « voter d'abord », plafond) | **Déjà le cas**, vérifié le 2026-10-08 : `PostVoteScreen` appelle `canProposeAssertion` (chantier 153) et `submit_assertion` applique les trois règles côté serveur sans condition de phase. Rien à ajouter ; à rejouer au navigateur pour une table terminée |
| 5 | Droit `UPDATE` sur `tables` | « dev est introuvable » ; découpage laissé à mon choix | **Vérifié sur prod le 2026-10-08 : prod n'a pas le trou** — seul `questionnaire_forced_at` y est modifiable par `anon`/`authenticated`. C'est **dev qui a dérivé** (droits larges sur les 13 colonnes). Réalignement de dev sur prod inclus dans la migration 161a (sans effet sur prod) |
| 6 | Bug `pre_closure` | « il est vraiment important de séparer les votes avant et après » | Corrigé dans le 161a (il réécrit déjà `cast_vote`) |
| — | Garde de phase sur `cast_vote` | « d'accord » | Phases admises : `pre_voting`, `voting`, `allocating` (l'écran d'allocation dit « tu peux encore voter »), `post_voting` de séance, et `debating` **seulement** pour un membre dont la table est terminée. Refus en `draft`, en débat à une table qui débat, et en `closed` (« la clôture coupe le revote »). **Généralisation proposée à Jules** : même garde sur `submit_assertion` |

**Découpage retenu** : deux étapes, chacune commitée et vérifiée avant la suivante — **161a** (migration : colonne, RPC, gardes, correctif `pre_closure`, réalignement des droits de dev) puis **161b** (écrans participant, modérateur, superadmin). Le 161a seul ne change que deux choses visibles, toutes deux voulues : la carte des résultats s'affiche dès le post-vote de séance, et un vote envoyé hors des phases admises est refusé (aucun écran actuel n'en envoie). Il peut donc être mergé dans `dev` sans attendre le 161b.

## Verdict

**Pertinent et faisable sans nouvelle phase de séance**, en ~1 migration et une dizaine d'écrans touchés, à condition d'introduire **une seule notion** : la *phase effective* d'une table, calculée au même endroit côté SQL et côté front (comme `session_type_allows_phase` / `phaseSequenceFor`). Tout ce qui teste aujourd'hui `session.phase === 'post_voting'` pour un participant assis à une table doit tester cette phase effective à la place — c'est là qu'est le travail, pas dans le bouton.

Le risque principal n'est pas technique mais d'oubli : **une quinzaine de tests de phase** côté participant (liste en § 2). Un seul oublié et un participant d'une table terminée se fait renvoyer dans la table, ou l'inverse.

## 1. Ce qui existe déjà

- **`tables.questionnaire_forced_at`** + bouton « Forcer questionnaire » des Outils modérateur (`ModeratorToolsButton.tsx:250`, masqué pour une association). Déjà **par table**. Effet : ouvre le questionnaire chez les participants de la table (`ParticipantView.tsx:78`), avec expiration 1 h. **Il ne fait sortir personne de la table** : une fois le questionnaire rempli, le participant reste dans `TableView`.
- Ce bouton écrit **en direct dans `tables`** (`TableContext.tsx:582`, `.update({ questionnaire_forced_at })`), autorisé par la policy `tables_update_moderator` (`USING/WITH CHECK is_table_moderator(id)`).
  > ⚠️ **Constat hors périmètre, à traiter à part** : `authenticated` **et `anon`** ont le droit `UPDATE` sur **les 13 colonnes** de `tables` (`information_schema.column_privileges`, base dev). Un modérateur de table peut donc, par l'API REST, réécrire n'importe quelle colonne de sa table : `session_id`, `created_by`, `active_moderator_member_id`, `leaderless`, `join_code`… Seule la `WITH CHECK` (`is_table_moderator` réévalué sur la ligne modifiée) limite les dégâts. À vérifier sur prod, puis restreindre le `GRANT UPDATE` aux colonnes réellement écrites en direct par le front. **Conséquence pour ce chantier : le nouvel état de table ne doit jamais être écrit en direct, seulement par RPC.**
- `force_session_questionnaire` (superadmin) pose `questionnaire_forced_at` sur **toutes** les tables de la séance au passage `debating → post_voting/closed` (`SuperadminScreen.tsx:2028`).
- **L'analyse n'est jamais recalculée automatiquement** : seul le superadmin la lance (`AnalysisPanel` → `save_analysis`). `get_results_map` lit la dernière analyse `done`/`current`. L'analyse est donc *déjà* figée de fait pendant le débat — sauf si le superadmin clique « relancer ».
- **`cast_vote` n'a aucune garde de phase** : un membre peut voter à toute phase, y compris en `debating`. Le revote n'est fermé que par l'interface (bouton « ↻ Revoter » de `ResultsMapScreen` affiché seulement en `post_voting`). Chaque changement de vote est historisé (`assertion_vote_history.phase_at_change` = phase **de séance** au moment du changement).

## 2. Ce qui suit la phase de séance et devrait suivre la table

### La notion à introduire

Deux colonnes sur `tables` (noms indicatifs) :

| colonne | rôle |
|---|---|
| `debate_ended_at timestamptz NULL` | `NULL` = la table débat ; posé par le modérateur |
| `debate_end_mode text NULL` (`post_voting` \| `closed`) | ce que voit la table après : revote ouvert, ou résultats seuls |

**Phase effective d'une table** (`table_effective_phase(table_id)` en SQL, `effectiveTablePhase(session, table)` dans `lib/phaseLabels.ts`) :

```
si séance.phase = 'debating' et table.debate_ended_at non NULL → table.debate_end_mode
sinon                                                           → séance.phase
```

La séance garde toujours le dernier mot : dès que le superadmin passe en `post_voting` ou `closed`, toutes les tables suivent, terminées ou non. C'est ce qui évite la voie B : aucune phase de séance n'est dérivée, aucun écran superadmin ne change de logique.

**Phase effective d'un membre** = celle de sa table (`table_assignments.table_id`) ; un membre sans table suit la séance. Exposée par `get_my_table_assignment` (ajouter `debate_ended_at`, `debate_end_mode`, `effective_phase` au JSON) — la RPC est déjà appelée par `ResultsMapScreen`, `VoteScreen`, `AllocatingScreen`.

### Inventaire des endroits à basculer

| Endroit | Aujourd'hui | Avec le 161 |
|---|---|---|
| `App.tsx:163` (restauration au rechargement) | rentre dans la table si `sess.phase === 'debating'` | si phase effective de **la table** = `debating` ; sinon → `#session/<code>` (chemin déjà écrit pour `post_voting`, ligne 175) |
| `ParticipantView.tsx:486` / `ModeratorView.tsx:773` (overlay « La séance est terminée ») | `session.phase` ∈ {post_voting, closed} | phase effective de la table ; texte « Le débat de votre table est terminé » quand c'est la table (le texte modérateur actuel dit « clôturée par le superadmin », faux dans ce cas) |
| `TableContext` | lit `tables` en Realtime | rien à ajouter : les deux colonnes arrivent par l'UPDATE déjà écouté + broadcast `['tables']` après la RPC |
| `SessionRouterScreen.tsx` cas `debating` | membre inscrit → `#vote/` | si phase effective du membre ∈ {post_voting, closed} → même branche que `post_voting` (questionnaire si pas répondu, puis carte) |
| `VoteScreen.tsx:240, 328, 439, 550` | 4 tests `post_voting`/`closed` | phase effective du membre |
| `AllocatingScreen.tsx:129, 178`, `TableAssignmentCard.tsx:217` | idem | idem ; bouton « Rejoindre » masqué si sa table est terminée |
| `ResultsMapScreen.tsx:318` (« ↻ Revoter ») | `session.phase === 'post_voting'` | phase effective du membre = `post_voting` |
| `PhaseIndicator` (participant) | phase de séance | phase effective (affiche « 5 · Post-débat » à une table terminée) |
| `get_results_map` | carte ouverte si séance `closed` (ou sondage en vote) | **aussi** si phase effective du membre ∈ {post_voting, closed}. Corrige au passage, pour ces tables, le constat du 134 (carte vide en `post_voting`) — **question 4** : l'ouvrir aussi en `post_voting` de séance |
| `get_public_results` | séance `closed` + `results_public` | **inchangé** : le public n'est jamais membre d'une table, il attend la clôture de la séance |
| Purge des codes de rappel (`set_session_phase`, entrée en `closed`) | séance | **inchangé** : une table terminée en mode « résultats » ne purge rien. Ses membres peuvent encore devoir se reconnecter (autre appareil) tant que la séance vit ; et une purge partielle compliquerait la règle de rétention du chantier 49 pour un gain nul (les codes tombent à la clôture de séance, quelques minutes ou heures plus tard) |
| `PostVoteScreen` | atteint depuis `ResultsMapScreen` seulement | rien en propre ; suit le bouton |

## 3. Interaction avec `set_session_phase` et la remise en arrière (chantier 127)

- **`debating → post_voting/closed`** : rien à faire, la séance l'emporte. Ne pas re-forcer le questionnaire sur les tables déjà terminées (`force_session_questionnaire` : ajouter `AND debate_ended_at IS NULL`), sinon on relance l'expiration d'1 h pour des tables qui y ont déjà répondu (sans effet visible, leurs membres ne sont plus dans la table, mais inutile).
- **Toute entrée en `debating`** (depuis `allocating` à l'ouverture, ou retour arrière depuis `post_voting`) : remettre `debate_ended_at`/`debate_end_mode` à `NULL` sur toutes les tables de la séance. Sans ça, une table terminée avant un retour arrière en `allocating` serait encore « terminée » à la réouverture du débat. À poser **dans `set_session_phase`** (comparer à `pg_get_functiondef` avant réécriture : la version dev porte déjà 127/134/135/49).
- **Retour arrière `debating → allocating`** : rien de plus que ci-dessus ; les membres d'une table terminée sont sur `ResultsMapScreen`/`SessionRouterScreen`, qui suivent déjà `allocating` (polling 10 s).

## 4. Retardataires et « Assignez-moi une table »

- **`assign_least_filled_table`** choisit la table animée la moins remplie : exclure `debate_ended_at IS NOT NULL`. S'il ne reste aucune table qui débat → message « Toutes les tables ont terminé leur débat. » (et non « aucune table animée disponible »).
- **`join_table` par code** sur une table terminée : refuser (« Le débat de cette table est terminé »), **sauf** pour un membre déjà affecté à cette table (rejoindre après réouverture, ou modérateur qui revient). Sans ce refus, un retardataire entrerait dans une table qui affiche immédiatement l'overlay de fin.
- **Déplacement par le superadmin** (`move_member_to_group`, `move_participant`, glisser-déposer de l'onglet Groupes) : pas de garde. Déplacer quelqu'un *vers* une table terminée l'y envoie en post-vote, *depuis* une table terminée vers une table qui débat le renvoie au débat — cohérent avec la règle « on suit sa table ». L'onglet Groupes affiche l'état de chaque table (voir § superadmin), donc le superadmin sait ce qu'il fait.

## 5. Le seul écran modérateur par table (chantier 148)

- Le modérateur quitte la table avec les autres (« y compris lui »). Il **reste titulaire** (`active_moderator_member_id` inchangé) : c'est ce qui lui permet de rouvrir, et `is_table_moderator` continue de répondre vrai pour lui.
- Pas d'écran noir pour une table terminée : personne n'est plus dans `ModeratorView`. Si un second appareil du modérateur est resté ouvert, il reçoit l'overlay de fin comme les autres (même Realtime).
- Un modérateur en surplus (drapeau sans être titulaire) ne voit pas le bouton et la RPC le refuse.

## 6. Garde serveur

Deux RPC, **jamais** d'écriture directe (cf. constat du § 1) :

- `end_table_debate(p_table_id uuid, p_mode text)` — refuse si `NOT is_table_moderator(p_table_id)` ; si la séance n'est pas `full` ou pas en `debating` ; si la table est déjà terminée ; si `p_mode` ∉ {`post_voting`, `closed`}. Pose `debate_ended_at = now()`, `debate_end_mode`, et `questionnaire_forced_at = now()` (même effet que le bouton existant, dans la même transaction). Le front fait ensuite `broadcast(['tables'])`.
- `reopen_table_debate(p_table_id uuid)` — même garde `is_table_moderator`, séance en `debating`. Remet les deux colonnes à `NULL` et `questionnaire_forced_at` à `NULL`.
- Variantes superadmin `end_table_debate_admin` / `reopen_table_debate_admin(p_password, p_table_id, …)` via `check_table_admin` (pour un modérateur parti ou un téléphone mort). **Fermées aux associations** par défaut (voir § types de séance), donc `check_superadmin_password` — ou `check_table_admin` si on décide un jour de l'ouvrir.

`is_table_moderator` n'est **pas** modifié.

## Réouverture — le mécanisme proposé

Jules : « il peut rouvrir le débat tant que séance non close. Je ne sais pas encore comment. »

Proposition : sur l'écran de résultats du modérateur titulaire (`ResultsMapScreen` / écran de fin), un encadré **« Votre table a terminé son débat · Rouvrir le débat de ma table »**, visible seulement s'il est titulaire de la table et que la séance est en `debating`. Au clic : confirmation, `reopen_table_debate`, puis il rejoint la table (`join_table` avec son pseudo — il est déjà affecté, donc pas de refus, il retrouve `ModeratorView`).

Côté participants de la table : `ResultsMapScreen` interroge déjà `get_my_table_assignment` ; on y ajoute un polling 10 s **tant que la séance est en `debating`** (le même filet que `VoteScreen`/`AllocatingScreen`). Quand la phase effective redevient `debating`, un bandeau « Le débat de votre table a repris · Revenir à la table → » apparaît. **Pas de retour automatique** : quelqu'un en train de revoter ne doit pas être arraché de son écran.

Ce qui est conservé à la réouverture : les revotes faits entre-temps (ils sont historisés, cf. analyse ci-dessous), les réponses au questionnaire (déjà modifiables par `submit_questionnaire`). Si la séance est déjà en `post_voting`, pas de réouverture par table : c'est le superadmin qui revient en `debating` (§ 3), et tout le monde repart en débat — **question 3**.

## Analyse globale figée

**Quand** : elle l'est déjà de fait (aucun recalcul automatique). Le risque réel est double :

1. **Le superadmin relance l'analyse pendant le débat** : elle mélangerait les votes d'avant-débat des tables qui débattent et les revotes des tables terminées. → Pendant `debating`, si au moins une table est terminée, l'onglet Analyse avertit (« N tables ont terminé et leurs membres revotent : l'analyse courante mélangerait avant et après débat ») et propose par défaut une analyse **« avant débat »**.
2. **Les camps affichés à une table terminée bougent** : non, puisque `get_results_map` lit la dernière analyse enregistrée — celle d'avant le débat, qui a servi à l'allocation. Une table terminée voit donc **les camps d'avant débat**, avec son propre point d'alors ; c'est à écrire sur l'écran (« Camps calculés avant le débat — ils seront recalculés à la fin de la séance »). Les **décomptes par assertion** (`get_vote_results`) restent, eux, en direct : ils ne sont vus que par les tables terminées (les autres sont dans `TableView`), donc aucune table qui débat n'est influencée.

**Comment reconstituer « avant débat »** : c'est le rôle du `vote_scope = 'pre_closure'` du chantier 70, qui annule les changements historisés avec `phase_at_change = 'closed'`. Deux corrections nécessaires :

- `cast_vote` écrit dans `phase_at_change` / `first_cast_phase` la **phase effective du membre** (et non celle de la séance) : un revote d'une table terminée est alors tagué `post_voting` même si la séance est en `debating`.
- `get_all_votes_for_analysis` en `pre_closure` doit annuler les changements tagués `post_voting` **et** `closed` (et ignorer les premiers votes tagués de même). 
  > ⚠️ **Bug existant trouvé en instruisant**, indépendant du 161 : depuis le chantier 89, le revote a lieu en `post_voting`, mais `pre_closure` n'annule que `phase_at_change = 'closed'`. Toute analyse « avant/après débat » (chantier 79) calculée aujourd'hui sur une séance où l'on a revoté en `post_voting` compte ces revotes dans le terme « avant ». À corriger de toute façon ; le 161 en est l'occasion.
- Renommer le libellé `pre_closure` en « avant post-vote » dans l'interface (la valeur en base peut rester).

## Superadmin — « toutes les tables ont fini »

Information seule, comme demandé. Dans l'onglet **Tables/Groupes** (séance complète en `debating`) : un accordéon **« Avancement du débat »** — une ligne par table : ● en débat / ✓ terminée à HH:MM (post-vote ou résultats), + bouton « Rouvrir » (RPC admin). En tête : « 3 / 5 tables ont terminé ». Quand toutes ont fini : bandeau vert « Toutes les tables ont terminé — vous pouvez passer en Post-vote » à côté du bouton de phase, **sans rien déclencher**. Données : `list_table_assignments_admin` ou la lecture des tables déjà faite toutes les 10-15 s par l'onglet (le superadmin n'a pas de Realtime sur `tables`, chantier 59) — ajouter les deux colonnes à ce qu'elle renvoie.

## Types de séance et associations

- **Séance complète** : seule concernée (consigne).
- **Débat simple** (`draft → debating → closed`) : peut avoir plusieurs tables (le 134 permet d'en ajouter). Un « terminer ma table » y aurait un sens (questionnaire puis écran de fin), mais pas de post-vote ni de carte. **Conclusion : exclu de la réalisation**, la RPC refuse `session_type <> 'full'`. Extension possible plus tard avec un seul mode (`closed`), sans toucher au reste de la conception.
- **Sondage** : aucune table, sans objet.
- **Associations** : toujours `debate` ou `poll`, donc exclues de fait ; l'association n'a d'ailleurs qu'une table (chantier 135). Fail-closed : rien à ouvrir.

## Voie B — à ne pas faire maintenant

La phase effective couvre tout ce que demande la consigne. La voie B (phase par table, phase de séance dérivée) ne se justifierait que si l'on voulait qu'une table **reparte en vote ou en allocation** seule, ce que personne n'a demandé, et elle obligerait à réécrire `set_session_phase`, les quatre écrans de phase et le superadmin. À rouvrir seulement si un usage réel le montre.

## Découpage proposé de la réalisation

- **161a — socle serveur** (1 migration) : 2 colonnes (+ `GRANT SELECT` aux rôles qui lisent `tables` — même piège que les 154/160), `table_effective_phase`, `end_table_debate`/`reopen_table_debate` (+ variantes admin), remise à zéro dans `set_session_phase`, exclusion dans `assign_least_filled_table`/`join_table`, `get_my_table_assignment` enrichi, `get_results_map` ouvert par phase effective, `cast_vote` et `pre_closure` corrigés, `force_session_questionnaire` filtré. Chaque fonction réécrite comparée à `pg_get_functiondef` dev **et** prod avant écriture.
- **161b — parcours** : `effectiveTablePhase` + tests unitaires, bouton dans les Outils modérateur (choix post-vote / résultats seuls), les tests de phase du § 2, bandeau de réouverture côté modérateur et participants, onglet Analyse (avertissement + défaut « avant débat »), accordéon superadmin.
- Vérification au navigateur sur dev : une séance « QA Vérifs — Complète » à 2 tables, l'une terminée, l'autre en débat ; rechargement de chaque côté ; réouverture ; retardataire ; passage superadmin en post-vote puis retour arrière en débat.

## Questions à Jules

1. **Libellé du bouton et choix du mode** : « Terminer le débat de ma table », puis une modale à deux choix — « Questionnaire puis post-vote (revote ouvert) » / « Questionnaire puis résultats (sans revote) » ? Ou un seul mode (post-vote) pour commencer ?
2. **Le revote d'une table terminée avant la fin de la séance** : d'accord pour qu'il soit écrit en base immédiatement mais exclu de l'analyse « avant post-vote » (et que l'analyse affichée reste celle d'avant le débat jusqu'à ce que vous en relanciez une) ?
3. **Réouverture une fois la séance en Post-vote** : réservée au superadmin (retour de toute la séance en Débat), comme proposé, ou faut-il aussi qu'une table seule puisse rouvrir à ce moment-là (ce qui amène vers la voie B) ?
4. **Carte des résultats en Post-vote de séance** : aujourd'hui `get_results_map` ne l'ouvre qu'à la clôture (constat du 134). Comme on l'ouvre pour une table terminée, l'ouvrir aussi pour toute la séance en `post_voting` ? (Cohérence : sinon une table terminée tôt voit une carte que les autres ne voient plus une fois la séance en post-vote.)
5. **Le droit `UPDATE` sur toutes les colonnes de `tables`** (§ 1) : en faire un petit chantier de sécurité séparé, avant ou après le 161 ?
6. **Le bug `pre_closure` / post-vote** (§ analyse) : le corriger dans le 161a, ou tout de suite en chantier séparé (il fausse déjà la comparaison avant/après du chantier 79) ?
