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

1. **Migration SQL en attente** (ci-dessous) — à appliquer avant de tester les chantiers 33 et 39.
2. **Superadmin** — onglets Tables, Membres, phase voting.
3. **Participant** — vote/pré-vote, écran "Débat en cours", entrée en débat, résultats de fin de séance.
4. **Modérateur** (`ModeratorView`) — Code Ecclesia + vraie table animée requis.
5. **Questionnaire post-débat** — les trois points d'entrée (table, `#vote/`, `#session/`) et leur déclenchement automatique à la clôture (chantier 39).
6. **Synchronisation temps réel (chantier 35)** — nécessite deux onglets/navigateurs en parallèle, à faire à part.
7. **Nettoyage des données de test** — une fois tout vérifié, purger les tables de QA listées en bas de fichier.

## ⚠️ Migration SQL en attente d'application

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname IN ('claim_moderator_status','assign_moderator_to_table')` retourne bien les deux fonctions à jour, puis cocher cette entrée et dérouler le test manuel du chantier 33 ci-dessous (section Superadmin). **Tant qu'elle n'est pas appliquée** : le contrôle d'ajout/retrait de modérateur par table (`AddModeratorControl`) échoue silencieusement côté RPC, et l'auto-assise en phase `debating` reste bloquée par l'ancienne signature de `claim_moderator_status`.

- [ ] **Chantier 39 — `supabase/migrations/20260901_chantier39_remove_questionnaire_phase.sql`** (jamais appliquée)

  **Contenu du fichier** :
  1. `UPDATE sessions SET phase = 'closed', phase_changed_at = now() WHERE phase = 'questionnaire'` — au moment de l'écriture, aucune séance de la base de test n'était dans cet état (vérifié par requête REST anon `select id,title,phase,join_code`), mais la migration doit rester idempotente/défensive pour toute séance réelle qui y serait encore.
  2. Contrainte `sessions_phase_check` réécrite sans `'questionnaire'` (`draft`, `pre_voting`, `voting`, `allocating`, `debating`, `closed`).
  3. `set_session_phase(password, session_id, phase)` réécrite avec la même liste sans `'questionnaire'` — sinon la fonction acceptait toujours l'ancienne valeur alors que le frontend ne l'envoie plus jamais.

  **Pourquoi retirer la phase plutôt que la garder mais inutilisée** : Jules a demandé explicitement la suppression (« on va supprimer cette phase ») — le questionnaire post-débat se déclenche désormais automatiquement à la sortie de `debating` (voir entrée dédiée, section "Questionnaire post-débat" plus bas) au lieu de nécessiter une étape de phase manuelle.

  **À faire (session de vérification)** : exécuter le fichier via le SQL Editor (ou MCP), puis `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sessions_phase_check'` pour confirmer l'absence de `'questionnaire'` dans la définition, et `SELECT count(*) FROM sessions WHERE phase = 'questionnaire'` doit retourner 0. **Tant qu'elle n'est pas appliquée** : si une séance reste dans l'ancienne phase `questionnaire` (aucune trouvée dans la base de test au moment de l'écriture), `SuperadminScreen.tsx` ne la reconnaît plus dans `PHASE_SEQUENCE` (`indexOf` retourne -1) et affiche un `PhaseBar` incohérent (case courante non repérée, bouton suivant pointant vers `draft`) — appliquer la migration avant de rouvrir une telle séance dans le superadmin plutôt que de cliquer les boutons de phase pour la sortir de cet état.

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

## Parcours Participant

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

- [ ] **2026-09-01 — Chantier 39 — repère de phase participant (`PhaseIndicator`)** — `src/components/PhaseIndicator.tsx`, `src/lib/phaseLabels.ts`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `ParticipantView.tsx`, `ResultsMapScreen.tsx`, `SessionQuestionnaireForm.tsx`

  **Livré** : pastille "Étape N · Libellé" affichée tout au long du parcours participant — 1 Distanciel (`pre_voting`), 2 Vote en présentiel (`voting`), 3 Allocation (`allocating`), 4 Débat (`debating`), 5 Post-débat (`closed`). Absente en phase `draft` (jamais vue par un participant) et dans `PublicResultsScreen`/`ModeratorView` (hors périmètre). Rendu flottant façon `QuitLink` (coin opposé, en haut à droite) sur les écrans sans en-tête propre (pseudo, onboarding, attente, reconquête de code, confirmation de présence, questionnaire) ; rendu inline dans l'en-tête existant sur les écrans qui en ont un (`VoteScreen` étape vote, `AllocatingScreen`, `ParticipantView`, `ResultsMapScreen`).

  **Déjà vérifié en navigateur** (séance de test réelle "Esai 24/08", phase `draft`, inscription avec pseudo "Chantier39 Verif") : étapes pseudo → onboarding (Question 1/3) → aucune pastille affichée nulle part, conforme (phase `draft` = pas de numéro participant), zéro erreur console. **Non testé faute d'accès superadmin pour faire avancer une séance de test à travers les phases** : l'apparition réelle de la pastille elle-même (1 à 5) sur `pre_voting`/`voting`/`allocating`/`debating`/`closed`, ainsi que son intégration visuelle dans les en-têtes de `VoteScreen` (étape vote)/`AllocatingScreen`/`ParticipantView`/`ResultsMapScreen` (collision potentielle avec les boutons existants, notamment le header dense de `VoteScreen` en phase vote).

  **Test minimal** (mot de passe superadmin requis pour faire avancer une séance de test) : dérouler pre_voting → voting → allocating → debating → closed avec un même compte participant, vérifier à chaque étape le texte et le numéro corrects, l'absence de chevauchement avec les boutons de header (`Quitter`/`Outils`/`Proposer` en phase vote, `Devenir modérateur`/`Outils`/`Quitter` dans `ParticipantView`), et la disparition complète en phase `draft`. Vérifier aussi l'apparition dans `SessionQuestionnaireForm` (voir entrée dédiée ci-dessous, section "Questionnaire post-débat").

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

  **Test minimal** : dérouler le même parcours que "Déjà vérifié" ci-dessus, une fois depuis `ModeratorView` (table animée, Code Ecclesia) et une fois depuis `SessionQuestionnaireForm` — **note chantier 39 ci-dessous : ses points d'entrée ont changé, ce n'est plus `allocating`/`voting`**.

- [ ] **2026-09-01 — Chantier 39 — déclenchement de `SessionQuestionnaireForm` déplacé de la phase `questionnaire` (supprimée) vers `closed`** — `VoteScreen.tsx`, `AllocatingScreen.tsx`, `SessionRouterScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`) *(migration SQL requise, voir "Migration SQL en attente" — mais sans effet sur ce comportement frontend tant qu'aucune séance réelle n'est restée bloquée en phase `questionnaire`)*

  **Pourquoi** : la phase `questionnaire` disparaît de la machine à états (demande explicite de Jules). Le formulaire `SessionQuestionnaireForm` (déjà repositionné par le chantier 45 ci-dessus) doit donc se déclencher autrement : désormais, dès qu'une séance passe en `closed`, `SessionQuestionnaireForm` s'affiche à la place de l'écran de résultats **pour un membre inscrit qui n'a pas encore de ligne dans `questionnaire_responses` pour cette séance** (nouvelle fonction `hasQuestionnaireResponse(sessionId)`, RLS `user_id = auth.uid()` déjà en place — pas de filtre supplémentaire nécessaire). Une fois répondu (`onDone`), l'écran de résultats normal s'affiche. Un visiteur non inscrit (`PublicResultsScreen`) n'est **jamais** concerné par ce gate — volontaire, il n'a jamais voté.

  **Trois points d'entrée concernés, tous avec la même logique** :
  1. `VoteScreen` (`#vote/<join_code>`) — au chargement initial, sur les mises à jour Realtime (2 canaux distincts) et sur le polling 10s de secours.
  2. `AllocatingScreen` (rendu par `VoteScreen` en phase `debating`/`allocating` pour qui n'a pas encore rejoint de table) — sur Realtime et sur le polling 10s.
  3. `SessionRouterScreen` (`#session/<join_code>`) — anciennement un texte statique non fonctionnel ("Réponds au questionnaire", sans formulaire réel, cf. TODO `CLAUDE.md` désormais retiré) ; affiche maintenant le vrai `SessionQuestionnaireForm`. C'est probablement le point d'entrée le plus emprunté en pratique (lien QR code / WhatsApp stable tout au long de la séance).

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test`, tous OK) + navigateur, séances de test réelles : `#session/DEBAT8` (`closed`, visiteur non inscrit) → `PublicResultsScreen` normal, aucun questionnaire proposé (comportement attendu, visiteur jamais voté), zéro erreur console. **Non testé faute de compte membre dans une séance `closed` réelle** : l'apparition effective du formulaire pour un membre inscrit sans réponse, ni la disparition après soumission (`onDone` → écran de résultats).

  **Test minimal** (mot de passe superadmin requis pour clôturer une séance de test avec un membre inscrit n'ayant pas encore répondu) :
  1. Membre inscrit, séance passée en `closed`, jamais répondu au questionnaire → `#vote/<join_code>` **et** `#session/<join_code>` (les deux, séparément, avec des comptes/sessions différents si besoin) → vérifier l'apparition de `SessionQuestionnaireForm` dans les deux cas, pastille "Étape 5 · Post-débat" visible dans son en-tête (chantier 39, voir entrée `PhaseIndicator` ci-dessus).
  2. Répondre et envoyer → vérifier la transition vers l'écran de résultats normal (`ResultsMapScreen`) sans reload.
  3. Revenir sur le même lien après avoir déjà répondu → vérifier l'accès direct à l'écran de résultats, sans repasser par le questionnaire.
  4. Séance en `debating` avec un participant connecté à sa table (`ParticipantView`) → superadmin clique "Passer en Clôturée" → vérifier le déclenchement **automatique** du modal questionnaire chez ce participant (couvert aussi par l'entrée superadmin ci-dessus) — ce test-ci vérifie spécifiquement qu'aucune étape de phase intermédiaire n'est nécessaire.

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

## Historique / notes de session (non actionnable)

Notes de contexte conservées pour mémoire (règle append-only) mais qui ne demandent aucune action de Jules.

- **2026-08-01 — Réconciliation `main` local / `origin/main`** (préalable au merge du chantier 34) : `main` local et `origin/main` avaient divergé depuis `17c30ff` — `main` local contenait le chantier 29 jamais poussé, `origin/main` contenait 7 commits (chantier 30, B3, docs chantier 18) poussés directement sans passer par `main` local. Réconcilié dans un worktree dédié (`reconcile-main-20260801`), un seul conflit textuel sur `A_VERIFIER.md` (deux sessions ayant chacune inséré leur entrée en tête de "En attente"), résolu sans perte de contenu. `tsc`/`npm test` (90/90) OK, vérification navigateur rapide sans erreur console. Poussé en fast-forward sur `origin/main`. Tag de rollback : `pre-reconcile-main-20260801`.

## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->
