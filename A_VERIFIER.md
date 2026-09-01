# À vérifier

Liste des points nécessitant une validation humaine, générés lors des sessions Claude Code.
Ne pas supprimer une entrée sans validation explicite de Jules — se contenter de la déplacer en section "Validé" une fois confirmée. Si un point semble obsolète, le marquer comme tel plutôt que l'effacer.

> **2026-08-03** — Fichier allégé à la demande de Jules avant une remise à zéro de la mémoire Dispatch : toutes les entrées déjà vérifiées/confirmées (chantiers 1 à 32 et vagues de vérification antérieures) ont été retirées — leur historique complet reste dans l'historique git de ce fichier (`git log -p -- A_VERIFIER.md`).
>
> **Correction 2026-09-01** : les chantiers **33 et 34** avaient été retirés par cet allégement alors qu'ils n'ont **jamais été vérifiés humainement** (33 : uniquement `tsc`/tests/mock réseau ; 34 : uniquement mock réseau via route de debug) — réintégrés ci-dessous, section Superadmin (33) et Participant (34).

## Règle — plus de migration SQL appliquée par une session de chantier (2026-09-01)

Décision de Jules : une session de chantier **n'applique plus jamais de migration SQL elle-même**, qu'elle ait ou non un accès MCP Supabase disponible. Elle **documente ici** le chemin du fichier de migration et ce qu'il change. C'est la **session de vérification dédiée** qui applique le SQL (SQL Editor du dashboard Supabase ou MCP) et qui met à jour l'entrée correspondante (statut "appliquée", résultat du test). Le paragraphe "Accès MCP Supabase" de `CLAUDE.md` qui affirmait un accès direct pour toute session est corrigé en conséquence — voir ce fichier.

## Comment vérifier "tout d'un coup"

Les points sont groupés **par écran/parcours**, pas par chantier, pour permettre une seule passe par écran plutôt que d'aller-retour entre chantiers. Dans l'ordre suggéré :

1. **Migration SQL en attente** (ci-dessous) — à appliquer avant de tester le chantier 33.
2. **Superadmin** — onglets Tables, Membres, phase voting.
3. **Participant** — vote/pré-vote, écran "Débat en cours", entrée en débat, résultats de fin de séance.
4. **Modérateur** (`ModeratorView`) — Code Ecclesia + vraie table animée requis.
5. **Questionnaire post-débat** — les deux points d'entrée (table et séance sans table).
6. **Synchronisation temps réel (chantier 35)** — nécessite deux onglets/navigateurs en parallèle, à faire à part.
7. **Nettoyage des données de test** — une fois tout vérifié, purger les tables de QA listées en bas de fichier.

## ⚠️ Migration SQL en attente d'application

- [ ] **Chantier 48 — `supabase/migrations/20260902_chantier48_switch_table.sql`**

  **Contenu du fichier** : crée `switch_table(p_session_id uuid, p_join_code text, p_pseudo text) returns jsonb` — permet à un participant de rejoindre une autre table que celle qui lui a été assignée, depuis `AllocatingScreen`. Vérifie que le code correspond à une table de **cette** séance (sinon exception explicite), que le participant n'est pas déjà à cette table, puis **retire proprement** toute ligne `participants` de l'utilisateur dans les autres tables de la séance (libère le micro/clôt le tour en cours si besoin, même traitement que `kick_participant`) avant d'insérer la nouvelle ligne et de déplacer `table_assignments` via `sync_table_assignment` (déjà existante, chantier 26). Voir l'en-tête du fichier de migration pour le détail du raisonnement (pourquoi une RPC dédiée plutôt que réutiliser `join_table`).

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'switch_table'` retourne la fonction, puis dérouler le test manuel ci-dessous (section Participant). **Avant d'appliquer**, nettoyer si possible les 2 lignes `participants` orphelines laissées dans la table `589D79` par la vérification navigateur de ce chantier (voir section Nettoyage plus bas) — pas strictement nécessaire pour tester, mais ça fausse le compte de présents affiché en `ParticipantView`.

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname IN ('claim_moderator_status','assign_moderator_to_table')` retourne bien les deux fonctions à jour, puis cocher cette entrée et dérouler le test manuel du chantier 33 ci-dessous (section Superadmin). **Tant qu'elle n'est pas appliquée** : le contrôle d'ajout/retrait de modérateur par table (`AddModeratorControl`) échoue silencieusement côté RPC, et l'auto-assise en phase `debating` reste bloquée par l'ancienne signature de `claim_moderator_status`.

## Parcours Superadmin

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

## Parcours Participant

- [ ] **2026-09-02 — Chantier 48 — « Je veux rejoindre une autre table »** — `src/components/voting/TableAssignmentCard.tsx`, `src/screens/AllocatingScreen.tsx`, migration `switch_table` *(voir « Migration SQL en attente » ci-dessus — le test complet de bascule réelle n'est possible qu'une fois appliquée)*

  **Retour de Jules** : « Dans l'écran qui nous annonce notre table, il faut un bouton : je veux rejoindre une autre table. […] Il faut un message pour lui dire de demander à son ami dans la nouvelle table, ou au modérateur de la nouvelle table, de lui donner le code de la table. »

  **Livré** : sur `AllocatingScreen` (l'écran "Vote terminé ! / Tu es à la Table N"), en phase `debating`, un lien "Je veux rejoindre une autre table" sous le bouton "Accéder à la table →". Au clic : petit formulaire avec le message d'aide demandé par Jules ("Demande le code à 6 caractères de la table visée à un ami déjà installé là-bas, ou à son modérateur") et un champ de code à 6 caractères, réutilisant le même mécanisme que les join codes existants — aucun second système créé.

  **Gestion des cas limites** (répond aux points soulevés dans le dispatch de ce chantier) :
  - **Code identique à la table déjà assignée** : bloqué **côté client**, sans appel réseau (`Tu es déjà à cette table.`) — vérifié en navigateur, `read_network_requests` confirme zéro requête.
  - **Code invalide** : `switch_table` lève `Aucune table ne correspond à ce code.` — non vérifié en conditions réelles (migration non appliquée), mais message écrit et testé par lecture de code.
  - **Code d'une table d'une autre séance** : `switch_table` compare `tables.session_id` à la séance courante et lève `Ce code correspond à une table d'une autre séance.` avant tout effet de bord — idem, à vérifier une fois la migration appliquée.
  - **Appartenance à l'ancienne table** : `switch_table` retire la/les ligne(s) `participants` de l'utilisateur dans les autres tables de la séance avant d'insérer la nouvelle (jamais dans les deux à la fois). Nécessaire car `leaveTable()` (bouton "Quitter" côté participant) **ne supprime jamais** la ligne `participants` en base — seulement le cache local (`tableStore.clear()`) — un fait **confirmé en conditions réelles** pendant la vérification de ce chantier (voir "Déjà vérifié" ci-dessous et la section Nettoyage).

  **Arbitrage produit laissé ouvert par Jules, tranché par défaut faute de réponse** : le déplacement est **libre** — aucune limite de place, aucune restriction aux tables non modérées. Recherché dans le code : rien dans `src/lib/allocation.ts` (non modifié, hors périmètre de ce chantier) ni ailleurs ne contraint la composition d'une table après l'allocation initiale — la seule contrainte existante est calculée **une fois**, au moment de `apply_allocation`. Conséquence assumée : un participant qui change de table de son propre chef peut défaire l'équilibre idéologique/répartition des anciens/taille de table calculé par l'algorithme, sans aucun garde-fou. À trancher avec Jules si ça pose problème en pratique (ex : limite de place par table, ou blocage des tables déjà équilibrées) — pas anticipé ici pour ne pas complexifier une fonctionnalité qu'il a demandée simple.

  **Déjà vérifié en navigateur réel** (séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)", table `589D79`, deux identités de test "TestChantier48A" et "TestChantier48B") : bouton absent tant qu'on n'est pas en phase `debating` (code inchangé par rapport à l'existant, non re-testé isolément) ; visible et fonctionnel une fois sur `AllocatingScreen` avec une vraie affectation (`table_assignments` réelle, join_code réel `589D79`) ; formulaire s'ouvre/se ferme (bouton "Annuler") sans effet de bord ; garde côté client sur le code déjà assigné confirmée (voir ci-dessus) ; soumission d'un code différent mais réel de la même séance (`6ABDC9`) déclenche bien `switch_table(p_join_code, p_pseudo, p_session_id)` avec les bons paramètres — Postgrest répond proprement `Could not find the function public.switch_table(...)` puisque la migration n'est pas appliquée, affiché en rouge dans le formulaire sans crash, bouton réactivé ensuite. Zéro erreur console au-delà de ce 404 attendu (confirmé par `read_console_messages`). En reproduisant le parcours de Jules (rejoindre → Quitter → revenir sur `AllocatingScreen`), le problème de ligne `participants` orpheline visé par ce chantier a été **observé réellement**, pas seulement supposé : "TestChantier48A" reste listé comme présent de la table `589D79` après être passé par "Quitter", sans avoir jamais rejoint aucune autre table entre-temps.

  **Non testable cette session** (migration non appliquée, voir ci-dessus) : le succès réel d'une bascule (nouvelle ligne `participants` créée, ancienne(s) supprimée(s), `table_assignments` déplacé, arrivée directe en `ParticipantView`/`ModeratorView` de la nouvelle table) et les deux messages d'erreur serveur (code invalide, autre séance).

  **Test minimal restant** (après application de la migration) :
  1. Un membre avec une table assignée réelle, en phase `debating`, sur `AllocatingScreen` → cliquer "Je veux rejoindre une autre table" → code d'une **vraie** table de la même séance → vérifier l'arrivée directe dans la nouvelle table (`ParticipantView`/`ModeratorView` selon le cas), et que l'ancienne table ne le liste plus dans ses présents.
  2. Même parcours avec un code inexistant → vérifier le message "Aucune table ne correspond à ce code." sans navigation.
  3. Même parcours avec le code d'une table réelle mais d'une **autre** séance → vérifier "Ce code correspond à une table d'une autre séance."
  4. Vérifier dans l'onglet 🪑 Tables du superadmin que `table_assignments` reflète bien la nouvelle table après la bascule (pas les deux).

- [ ] **2026-08-01 — Chantier 34 — carte "Votre groupe" affichée à tort pour les non-votants** — `src/screens/ResultsMapScreen.tsx`

  **Bug** : sur l'écran de résultats de fin de séance (`ResultsMapScreen`, `#session/<join_code>` en phase `closed`, membre inscrit), la carte "Votre groupe" s'affichait dès que `assignment != null` — or `table_assignments` inclut tous les présents, votants ou non. Un membre inscrit mais n'ayant jamais voté a un `assignment` mais aucun point dans l'analyse PCA → `selfGroupId` reste `null` → il tombait sur "L'organisateur n'a pas encore nommé les groupes.", un texte qui n'a de sens que pour un vrai camp pas encore nommé.

  **Correctif** : condition d'affichage passée de `assignment != null` à `assignment != null && selfGroupId !== null`. Trois cas attendus :
  - Jamais voté → `selfGroupId === null` → carte "Votre groupe" totalement absente.
  - Voté, camp pas encore nommé → carte affichée avec "Camp pas encore nommé" (titre porté par le chantier 30/J6, fusionné sans conflit avec ce correctif).
  - Voté, camp nommé → nom/description du camp affichés normalement.

  **Déjà vérifié** : uniquement via une route de debug temporaire (`#debug-results-map`) + mock de `window.fetch` sur les 3 RPC consommées (`get_my_table_assignment`, `get_results_map`, `get_vote_results`), retirée avant commit. Les 3 rendus correspondent à la spec, zéro erreur console. **Jamais testé contre une vraie séance Supabase.**

  **Test minimal** (nécessite une séance `closed` avec un mix membre votant / membre non-votant — mot de passe superadmin pour créer/clôturer la séance de test, ou une vraie séance passée qui a ce mix) : membre n'ayant jamais voté → `#session/<join_code>` → vérifier l'absence totale de la carte "Votre groupe" (reste de la page — scatter, autres camps, consensus/clivage — inchangé). Membre ayant voté, camp pas encore nommé par Gemini → carte présente avec "Camp pas encore nommé". Membre ayant voté, camp nommé → nom/description corrects.

- [ ] **Chantier 36 — Point 2 : case "Je suis modérateur" sur l'écran "Débat en cours"**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : écran "Débat en cours" (accessible via "Séances en cours" → "Rejoindre →" sur une séance `debating`) : cocher "Je suis modérateur de cette table" révèle un champ "Code Ecclesia" ; la soumission doit amener en `ModeratorView` (pas `ParticipantView`) sur la table dont le code a été saisi.

  **Hypothèse non tranchée avec Jules** : ce point réutilise `reclaim_moderator` (rejoint *la table dont le code a été saisi*) plutôt que `claim_moderator_status` (auto-assise sur la première table animée en attente, chantier 33). Si le comportement attendu était plutôt ce second mécanisme, c'est un choix différent à trancher.

  **Test minimal** : "Séances en cours" → "Rejoindre →" sur une séance `debating`, compte n'ayant jamais rejoint cette séance → cocher la case, code de table réel + Code Ecclesia réel → vérifier l'arrivée en `ModeratorView`.

- [ ] **2026-09-01 — Chantier 40 — ordre des modales d'entrée en débat** — `src/screens/ParticipantView.tsx`, `src/components/DebateRulesModal.tsx`

  Retour de Jules : à l'entrée en débat, les deux modales successives ("Bienvenue dans le débat" puis les règles) n'étaient pas clairement présentées comme une séquence voulue. Trois changements purement front, aucune logique de phase touchée :
  1. Ordre inversé : "Bienvenue dans le débat" s'affiche désormais **avant** les règles.
  2. Titre de la 2ᵉ modale changé de "Règles du débat" à "Règles d'Ecclesia lors des débats".
  3. Bouton bleu de la 1ʳᵉ modale changé de "C'est parti ! →" à "Lire les règles de débat Ecclesia →".

  **Déjà vérifié en navigateur** (table `leaderless` de test, séance partagée "Test manuel — Vote & bascule modérateur") : parcours complet accueil → "Bienvenue dans le débat" (nouveau texte de bouton) → clic → modale règles (nouveau titre) → "J'ai lu" → retour vue débat normale, aucune 3ᵉ modale. Rechargement de page : les deux `localStorage` (`debate_welcome_<id>`, `debate_rules_read_<id>`) empêchent bien toute réapparition. Zéro erreur console.

  **Non testé** : rendu sur une table non-`leaderless` (avec modérateur) — risque de régression jugé nul, la logique ne dépend pas de `leaderless` ; parcours mobile réel (uniquement viewport desktop testé).

  **Test minimal** : reproduire le parcours ci-dessus sur une table **avec modérateur** (pas seulement leaderless), et sur mobile (`resize_window` ou vrai appareil) pour couvrir les deux angles non testés.

- [ ] **2026-09-01 — Chantier 42 — notes participant perdues (retour de test Jules)** — `src/components/NotesModal.tsx`

  **Cause identifiée** : les 3 chemins de fermeture de la modale (croix, clic hors modale, Échap) appelaient `onClose()` sans vider le debounce de 800ms qui déclenche l'écriture en base (`saveNote`). Fermer puis rouvrir juste après une frappe pouvait recharger la base *avant* que l'écriture différée n'ait abouti → la note paraissait perdue (course, pas une perte réelle). Risque aggravant identifié en même temps : au premier enregistrement, deux écritures concurrentes pouvaient se percuter sur la contrainte unique partielle `(session_id, user_id)` / `(table_id, user_id)` de `private_notes`.

  **Correctif appliqué** : `handleClose()` vide et exécute immédiatement le debounce en attente (`await saveNote(...)`) avant d'appeler `onClose()`, sur les 3 chemins de fermeture.

  **Déjà vérifié en navigateur** : frappe dans l'éditeur → fermeture ~200ms après la frappe → réouverture ~150ms après la fermeture → contenu bien présent au rechargement. Zéro erreur console, zéro message "Erreur :" affiché dans la modale.

  **Point non couvert par ce correctif — à vérifier humainement** : la fermeture *dure* du navigateur/onglet (pas la modale) pendant l'écriture différée — le flush est déclenché par `onClose()` React, qui ne s'exécute pas si l'onglet/la page est fermé(e) avant. Reste une perte possible dans ce cas précis (`beforeunload`/`pagehide` non gérés) — scénario différent de celui rapporté par Jules ("écrit, fermé, rouvert" la modale, pas l'onglet), donc hors scope du fix. À évaluer si ça revient.

  **Test minimal** : reproduire le scénario original de Jules (écrire une note, fermer, rouvrir rapidement) sur `NotesModal` en phase vote et en phase débat (table rattachée à une séance, notes partagées vote→débat). Optionnel : tester le cas non couvert (fermeture d'onglet pendant l'écriture) pour évaluer si ça vaut la peine de gérer `beforeunload`.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet participant)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

## Parcours Modérateur (`ModeratorView`)

*Nécessite un Code Ecclesia et une vraie table animée (avec modérateur) pour la plupart des points ci-dessous — pas testable avec une table `leaderless` seule.*

- [ ] **Chantier 8 (rattrapage) — Fix DnD : l'entrée déposée n'arrive plus en dernier (A2)**
  Mergé sur `main` (`e1fb31a`), aucune migration.

  **Comportement attendu** : dans `ModeratorView` (files d'attente longue/interactive), glisser une entrée sur une ligne précise doit la déposer à cette position exacte — pas systématiquement en dernier.

  **Test minimal** (table animée réelle, Code Ecclesia requis) : avec plusieurs entrées dans une file, glisser une entrée (depuis le panneau participants ou une autre position) directement sur une ligne précise → vérifier qu'elle atterrit à la position visée.

- [ ] **Branche non mergée — Chantier 43 — fusion "Outils Modo" + suppression transcription (vue modérateur)** — branche `chantier-43-outils-modo-transcription`, **pas mergée sur `main`** (en attente de la vérification manuelle ci-dessous avant merge)

  **Ce qui a été fait** : `NotesButton`, `AssertionsButton` et `QuestionnaireFab` (header de `ModeratorView`) retirés — leur contenu intégré comme entrées du menu `ModeratorToolsButton` ("Outils Modo"), organisé en 3 sections séparées par des lignes : **Camps & assertions** (Camps, Assertions votées — en premier, visible seulement si `table.session_id`), **Table** (QR code, Historique, Forçage questionnaire), **Personnel** (Mes notes, Questionnaire post-débat). Seul le bouton Documentation reste séparé dans le header. Le bouton et le code de transcription *live* (`useTranscription.ts`, backend WebSocket, déjà signalé mort dans `CLAUDE.md` depuis le 2026-06-30) sont supprimés — le sous-projet `transcription-debat/` (pipeline offline) n'est pas touché.

  **Déjà vérifié** : `tsc --noEmit` propre, tests verts sans régression, `npm run build` réussi, app chargée sans erreur console (EntryScreen, navigation vers une séance `debating` existante). **Aucun test en conditions réelles** — session headless sans Code Ecclesia ni mot de passe superadmin.

  **Test minimal** (Code Ecclesia + vraie table modérateur requis) :
  1. Rejoindre une table de débat en tant que modérateur → ouvrir "Outils Modo" → confirmer les 3 sections dans l'ordre (Camps & assertions en premier), tous les items s'ouvrent (Camps, Assertions votées, QR code, Historique, Forcer/Annuler questionnaire, Mes notes, Questionnaire post-débat) sans erreur console.
  2. Confirmer qu'aucun bouton/mention "Transcription" ne subsiste dans la vue modérateur.
  3. Cas sans séance rattachée (table créée hors séance) : confirmer que la section "Camps & assertions" est bien absente (conditionnée à `table.session_id`) et qu'il n'y a pas de ligne de séparation orpheline.

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

  **Test minimal** : dérouler le même parcours que "Déjà vérifié" ci-dessus, une fois depuis `ModeratorView` (table animée, Code Ecclesia) et une fois depuis `SessionQuestionnaireForm` (accessible en phase `allocating`/`voting` via `AllocatingScreen`/`VoteScreen`).

## Synchronisation temps réel (chantier 35)

*Nécessite deux onglets ou deux navigateurs en parallèle sur la même séance/table — ne peut pas se tester avec un seul client.*

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur**
  Mergé sur `main` (`42ccae2`). Migration `supabase/migrations/20260803_chantier35_session_members_replica_identity.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`REPLICA IDENTITY FULL` confirmé sur `session_members`) — les deux abonnements realtime `session_members` sont donc actifs, seul le test manuel ci-dessous reste à faire.

  **Comportement attendu** (3 points) :
  1. Superadmin voit en direct (sans reload) un changement de modérateur initié côté participant (auto-attachement chantier 33, `reclaim_moderator`) — section "Tables rattachées" ET onglet Tables/Groupes.
  2. Participant bascule en direct vers `ParticipantView` (sans reload) si le superadmin lui retire son statut de modérateur pendant le débat — et redevient `ModeratorView` si le statut est rendu (réversible, tant que personne d'autre n'a repris le contrôle physique de la table).
  3. Le badge "Vous êtes modérateur" (phase vote) se met à jour en direct si le superadmin décoche le statut depuis l'onglet Membres.

  **Volontairement pas traité** : le sens inverse du point 2 (superadmin *ajoute* le statut modérateur à quelqu'un déjà physiquement assis à une table) ne fait pas basculer son écran vers `ModeratorView` — asymétrie connue, pas demandée par Jules.

  **Test minimal** (mot de passe superadmin requis, deux onglets/navigateurs) :
  1. **Point 1 (reclaim)** : superadmin sur "Tables rattachées" ouvert, 2ᵉ onglet fait un `reclaim_moderator` sur une table → `moderator_pseudo` doit se mettre à jour sans reload (~15s max).
  2. **Point 1 (auto-attachement, à re-tester en priorité — jamais reproduit en session)** : séance `allocating`/`debating`, table animée sans modérateur, superadmin sur l'onglet 🪑 Tables. 2ᵉ onglet : `#session/<code>` → "🎙️ Modérateur" → se déclarer modérateur → vérifier l'apparition à la table sans reload.
  3. **Point 2 (retrait en débat)** : participant modérateur physique d'une table en `debating` → superadmin retire son statut (onglet Tables ou case Membres) → vérifier bascule vers `ParticipantView` sans reload, puis réversibilité en recochant.
  4. **Point 3 (phase vote)** : participant avec badge "Vous êtes modérateur" visible → superadmin décoche depuis Membres → badge doit disparaître sans reload.
  5. **Régression** : un modérateur "classique" (table créée via `create_table`/`reclaim_moderator`, jamais inscrit au vote de cette séance, donc sans ligne `session_members`) doit garder son `ModeratorView` sans interruption.

## Nettoyage des données de test (séances partagées)

Données factices laissées par les sessions de vérification navigateur, à nettoyer une fois les points correspondants confirmés (pas de MCP Supabase pour le faire depuis une session de chantier — voir la règle SQL ci-dessus ; à faire par la session de vérification ou par Jules directement).

- [ ] **Table `589D79`** (leaderless) + participant **"Test Chantier40"** — créée dans la séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 40.
- [ ] **Table `6ABDC9`** + pseudo **"TestQ45"** + une réponse `questionnaire_responses` (note=4) — créées dans la séance "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 45.
- [ ] **Table `6296A9`** (leaderless) + participant **"Test Notes QA"** — créée dans la séance **TEST33A** pour vérifier le chantier 42.
- [ ] **Table `589D79`, participants "TestChantier48A" et "TestChantier48B"** — créés dans la séance "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 48. Les deux illustrent volontairement le bug visé par ce chantier : parties via "Quitter" sans jamais rejoindre une autre table, leurs lignes `participants` sont restées dans `589D79` (`leaveTable()` ne supprime jamais la ligne en base) — à garder tel quel jusqu'à ce que la migration `switch_table` soit appliquée et testée, ça sert de donnée de repro pour le test manuel restant. Les deux ont aussi une ligne `session_members`/`table_assignments` dans la séance (auto-créées par `sync_table_assignment` lors du join en retard).

## Historique / notes de session (non actionnable)

Notes de contexte conservées pour mémoire (règle append-only) mais qui ne demandent aucune action de Jules.

- **2026-08-01 — Réconciliation `main` local / `origin/main`** (préalable au merge du chantier 34) : `main` local et `origin/main` avaient divergé depuis `17c30ff` — `main` local contenait le chantier 29 jamais poussé, `origin/main` contenait 7 commits (chantier 30, B3, docs chantier 18) poussés directement sans passer par `main` local. Réconcilié dans un worktree dédié (`reconcile-main-20260801`), un seul conflit textuel sur `A_VERIFIER.md` (deux sessions ayant chacune inséré leur entrée en tête de "En attente"), résolu sans perte de contenu. `tsc`/`npm test` (90/90) OK, vérification navigateur rapide sans erreur console. Poussé en fast-forward sur `origin/main`. Tag de rollback : `pre-reconcile-main-20260801`.

## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->
