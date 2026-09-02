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

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname IN ('claim_moderator_status','assign_moderator_to_table')` retourne bien les deux fonctions à jour, puis cocher cette entrée et dérouler le test manuel du chantier 33 ci-dessous (section Superadmin). **Tant qu'elle n'est pas appliquée** : le contrôle d'ajout/retrait de modérateur par table (`AddModeratorControl`) échoue silencieusement côté RPC, et l'auto-assise en phase `debating` reste bloquée par l'ancienne signature de `claim_moderator_status`.

## Parcours Superadmin

- [ ] **2026-09-01 — Chantier 38 (2ème passe) — scroll qui remonte en haut sur la fiche séance** — `src/screens/SuperadminScreen.tsx` (`SessionDetail`)

  **Retour de Jules** : « toutes les 10 secondes ou moins » l'écran superadmin « nous remmène en haut de la page » — constaté sans aucune session Claude Code active, sur tous les onglets superadmin (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse), sans clignotement visible. Ce retour infirme l'hypothèse Vite HMR retenue par la 1ère passe (voir "Historique / notes de session" plus bas) — diagnostic repris de zéro.

  **Cause trouvée** : `SessionDetail` a un seul état `loading` (posé par `load()`, la fonction qui charge "Tables rattachées"/"Tables disponibles" — polling 15 s depuis le chantier 35, + rappelée par le channel Realtime `tables` sur tout événement, + par tout changement de filtre de date). Ce `loading` gate **tout le contenu de la fiche séance** (ligne ~2064 : `{loading ? <Chargement…/> : <>…tous les onglets…</>}`), pas seulement la section des tables. À chaque déclenchement — donc au minimum toutes les 15 s, parfois plus souvent via Realtime — la totalité du contenu affiché (quel que soit l'onglet actif) est remplacée par un petit spinner le temps de l'appel réseau, ce qui effondre la hauteur du document ; le navigateur clampe alors `scrollY` à la nouvelle hauteur (beaucoup plus faible), et **ne restaure jamais** la position de scroll quand le contenu revient. D'où : ça touche tous les onglets (le gate est en dehors du switch d'onglet), ça n'a besoin d'aucune session Claude Code (bug 100 % applicatif, indépendant du HMR), et ça ne "clignote" pas franchement (le spinner est bref, ce qui se voit surtout c'est le saut de scroll).

  **Reproduit concrètement** (Browser pane, mock `fetch` sans mot de passe réel, même technique que les passes précédentes) : scroll à 893px sur une fiche mockée, clic sur un filtre de date (déclenche `load()` avec 900ms de latence simulée) → `scrollHeight` s'effondre de 993 à 563 **et `scrollY` est immédiatement clampé de 893 à 563** ; ~1.6s plus tard le contenu revient (`scrollHeight` remonte à 993) mais `scrollY` reste bloqué à 563 — jamais restauré. Instrumentation : `MutationObserver` + lecture de `window.scrollY`/`document.documentElement.scrollHeight` avant/après clic.

  **Correctif appliqué** : `load()` ne pose `setLoading(true)` (donc n'affiche le spinner plein écran) que lors du **tout premier** chargement (`hasLoadedTablesRef`, un `useRef`) — plus jamais sur un rafraîchissement de fond (polling 15s, Realtime, changement de filtre). Les données de "Tables rattachées"/"Tables disponibles" continuent de se mettre à jour en place, sans jamais vider le reste de la fiche séance ni changer la hauteur du document. Un seul changement de comportement assumé : changer le filtre de date ("Tout afficher"/"Depuis…") ne montre plus de spinner plein écran non plus — juste une mise à jour silencieuse de la liste, strictement mieux pour le même problème.

  **Déjà vérifié par moi** : `npx tsc -b` / `npm run build` / `npm test` (184/186, 2 skip préexistants) OK. Reproduction Browser pane confirmée **avant** correctif (voir ci-dessus) puis **absence totale** de collapse/clamp après correctif, sur le même scénario exact (`scrollY` et `scrollHeight` inchangés pendant tout le rafraîchissement, zéro mutation DOM observée). Zéro erreur console imputable au correctif (un warning `validateDOMNesting` pré-existant et sans rapport dans `AnalysisPanel` — bouton imbriqué dans un bouton — reste présent, non traité ici, voir entrée séparée ci-dessous si besoin).

  **Reste à vérifier par Jules en conditions réelles** : ouvrir une séance avec du contenu réel (plusieurs tables, participants, assertions), scroller loin dans la page, laisser tourner ≥ 30-40 s sans toucher au clavier/souris → la page ne doit plus jamais remonter toute seule, sur aucun des 4 onglets. Si le symptôme persiste malgré ce correctif, il reste un canal Realtime supplémentaire à investiguer (le channel `session-tables:<id>` ci-dessus a pu masquer une deuxième cause si Realtime déclenchait `load()` bien plus souvent que 15 s en usage réel — à confirmer avec le compteur d'appels réseau du vrai navigateur, impossible à observer sans données réelles).

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

  **Test minimal** (mot de passe superadmin requis, deux onglets/navigateurs) :
  1. **Point 1 (reclaim)** : superadmin sur "Tables rattachées" ouvert, 2ᵉ onglet fait un `reclaim_moderator` sur une table → `moderator_pseudo` doit se mettre à jour sans reload (~15s max).
  2. **Point 1 (auto-attachement, à re-tester en priorité — jamais reproduit en session)** : séance `allocating`/`debating`, table animée sans modérateur, superadmin sur l'onglet 🪑 Tables. 2ᵉ onglet : `#session/<code>` → "🎙️ Modérateur" → se déclarer modérateur → vérifier l'apparition à la table sans reload.
  3. **Point 2 (retrait en débat)** : participant modérateur physique d'une table en `debating` → superadmin retire son statut (onglet Tables ou case Membres) → vérifier bascule vers `ParticipantView` sans reload, puis réversibilité en recochant.
  4. **Point 3 (phase vote)** : participant avec badge "Vous êtes modérateur" visible → superadmin décoche depuis Membres → badge doit disparaître sans reload.
  5. **Régression** : un modérateur "classique" (table créée via `create_table`/`reclaim_moderator`, jamais inscrit au vote de cette séance, donc sans ligne `session_members`) doit garder son `ModeratorView` sans interruption.

- [ ] **2026-09-01 — Chantier 41 — nomination d'un modérateur déjà assis, invisible sans quitter/rejoindre** — `src/context/TableContext.tsx`, branche `chantier-41-reload-moderateur`

  **Retour de Jules** : « Quand je suis déjà en phase débat, et que je nomme quelqu'un en modérateur sur une table, lorsque celui-ci fait un reload, la vue modérateur n'apparaît pas. Il faut pour cela qu'il quitte, avec le bouton quitter, puis revienne dans le débat. »

  **Diagnostic — ce n'est PAS une régression de 35/36/37, c'est l'asymétrie que chantier 35 avait explicitement documentée et volontairement laissée de côté** (ligne "Volontairement pas traité" ci-dessus, maintenant retirée puisque couverte par ce correctif) : `isModerator` était calculé `physicalModerator && !moderatorRevoked` — un pur véto qui ne peut que *dégrader*. `moderatorRevoked` se recalcule bien à chaque `load()` (montage + polling 5s) et via un abonnement realtime sur `session_members`, mais dans les deux cas il ne fait que poser `true`/`false` sur le véto, jamais remonter `physicalModerator` de `false` à `true`. Un participant nommé modérateur *après* avoir déjà rejoint sa table reste donc bloqué, en direct **et** après un simple reload — `physicalModerator` ne vient que du prop `initialIsModerator`, lui-même figé au moment du join initial (`AllocatingScreen.handleJoin` / cache `tableStore` restauré tel quel par `App.tsx` au montage, sans re-vérification). Seul un `leaveTable()` + retour (qui repasse par `AllocatingScreen.handleJoin`, lequel relit `member.is_moderator` à neuf) recalculait correctement — exactement le contournement que Jules a trouvé.

  **Correctif** : `isModerator = physicalModerator || sessionMemberIsModerator` (OR, plus de véto). `sessionMemberIsModerator` reflète `session_members.is_moderator` en direct (realtime, déjà existant côté chantier 35) et à chaque `load()`/reload — dans les deux sens désormais. Ne réintroduit pas de régression sur le cas que chantier 35 ciblait (démodération d'un modérateur assigné côté Bloc C) : pour les tables issues de l'allocation, `tables.created_by` est l'uid du superadmin qui a appelé `apply_allocation`/`create_tables_batch`, jamais celui du participant assigné — `physicalModerator` y est donc déjà `false`, et `session_members.is_moderator = false` suffit seul à garder `isModerator` à `false`.

  **Constat annexe, confirmé en navigateur réel (voir "Déjà vérifié" ci-dessous)** : en creusant ce mécanisme, la même veto asymétrique de chantier 35 casse aussi l'auto-désignation "Désigner comme animateur" (`designate_moderator`, table `leaderless` rattachée à une séance) : cette RPC pose `tables.created_by` mais ne touche jamais `session_members.is_moderator` (qui reste `false` par défaut) — au prochain `load()` (5s ou reload), l'ancien véto retombait systématiquement à `false` pour *tout* auto-désigné sur une table leaderless rattachée à une séance, sans intervention du superadmin. Le passage à l'OR corrige ce cas (il ne dépend plus que de `physicalModerator`) — **reproduit et corrigé en conditions réelles**, pas seulement en théorie.

  **Déjà vérifié** : `tsc --noEmit` propre, `npm run build` réussi, `npm test` (204/206, 2 skips préexistants, aucune régression sur `allocation.ts`/`groupNaming.ts`).

  **Vérifié en navigateur réel (2026-09-01)**, sur la table `589D79` (leaderless, séance "Test manuel — Vote & bascule modérateur", participant "Test Chantier40" — voir note dans "Nettoyage des données de test" : cette table n'est plus leaderless suite à ce test) :
  - Join de la table → `ParticipantView` correcte ("Groupe auto-géré"), zéro erreur console.
  - Clic "🎙️ Devenir modérateur" → confirmation → `designate_moderator` → bascule immédiate vers `ModeratorView` ("Micro libre", panneau Participants). Ceci exerce exactement le mécanisme du "constat annexe" ci-dessus : `physicalModerator=true`, `session_members.is_moderator=false` (jamais posé par cette RPC).
  - **Sans le correctif, l'ancien code aurait dû redescendre en `ParticipantView` au bout de 5s** (véto `moderatorRevoked` recalculé par le polling `load()`, `is_moderator === false` trouvé). Attendu 7s : **toujours `ModeratorView`**, zéro nouvelle erreur console.
  - Reload complet de la page (scénario exact de Jules — recharger sans quitter/rejoindre) : **`ModeratorView` toujours affichée immédiatement**, zéro erreur console.
  - Les 2 erreurs console visibles (404, 401) proviennent de requêtes de diagnostic que j'ai faites moi-même dans la console du navigateur pour retrouver un `join_code` de test (pas de MCP Supabase, clé anon publique lue depuis `.env` — usage en lecture seule, cf. `CLAUDE.md`) ; confirmé sans rapport avec l'app via `read_network_requests` (uniquement des requêtes locales Vite dans la fenêtre capturée). Aucune erreur émise par le code applicatif lui-même à aucune étape.

  **Non testé en conditions réelles — bloqué par l'absence de mot de passe superadmin dans cette session headless** : le scénario exact décrit par Jules (promotion via `session_members.is_moderator`, posée par `set_member_moderator`/`assign_moderator_to_table`, pas par `designate_moderator`). Le code qui consomme ce flag (`setSessionMemberIsModerator`, dans `load()` et dans l'abonnement realtime) est strictement le même que celui exercé ci-dessus — seule la RPC qui écrit `session_members.is_moderator=true` diffère — mais la session de vérification devrait dérouler ce chemin exact avant merge, pas seulement l'analogue.

  **Test minimal restant** (mot de passe superadmin requis) :
  1. **Scénario exact de Jules** : séance `debating`, participant déjà assis à une table (`ParticipantView`). Superadmin → onglet Membres, cocher "modérateur" sur ce participant (assis à une table déjà pourvue **ou** sans modérateur, peu importe — cf. chantier 37 point 2 pour la logique de placement). Sans que le participant ne fasse quoi que ce soit : recharger sa page → vérifier l'apparition immédiate de `ModeratorView` (plus besoin de quitter/rejoindre).
  2. **Variante en direct** : même mise en place, mais sans reload — laisser tourner ~5s (polling `load()`) ou vérifier que le realtime `session_members` (déjà actif, chantier 35) bascule l'écran instantanément.
  3. **Non-régression démodération (chantier 35, point 2 déjà listé ci-dessus)** : toujours vérifier avec ce correctif en place.

## Nettoyage des données de test (séances partagées)

Données factices laissées par les sessions de vérification navigateur, à nettoyer une fois les points correspondants confirmés (pas de MCP Supabase pour le faire depuis une session de chantier — voir la règle SQL ci-dessus ; à faire par la session de vérification ou par Jules directement).

- [ ] **Table `589D79`** — participant **"Test Chantier40"**, créée *leaderless* dans la séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 40. **N'est plus leaderless** : utilisée le 2026-09-01 pour vérifier en navigateur réel le chantier 41 (clic "Devenir modérateur" → `designate_moderator`, table basculée `leaderless=false`, `created_by` = l'uid anonyme de la session de test, sans rapport avec un vrai compte). Table + participant toujours à purger, mais ne pas s'étonner de la retrouver en table animée plutôt que leaderless au moment du nettoyage.
- [ ] **Table `6ABDC9`** + pseudo **"TestQ45"** + une réponse `questionnaire_responses` (note=4) — créées dans la séance "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 45.
- [ ] **Table `6296A9`** (leaderless) + participant **"Test Notes QA"** — créée dans la séance **TEST33A** pour vérifier le chantier 42.

## Historique / notes de session (non actionnable)

Notes de contexte conservées pour mémoire (règle append-only) mais qui ne demandent aucune action de Jules.

- **2026-08-01 — Réconciliation `main` local / `origin/main`** (préalable au merge du chantier 34) : `main` local et `origin/main` avaient divergé depuis `17c30ff` — `main` local contenait le chantier 29 jamais poussé, `origin/main` contenait 7 commits (chantier 30, B3, docs chantier 18) poussés directement sans passer par `main` local. Réconcilié dans un worktree dédié (`reconcile-main-20260801`), un seul conflit textuel sur `A_VERIFIER.md` (deux sessions ayant chacune inséré leur entrée en tête de "En attente"), résolu sans perte de contenu. `tsc`/`npm test` (90/90) OK, vérification navigateur rapide sans erreur console. Poussé en fast-forward sur `origin/main`. Tag de rollback : `pre-reconcile-main-20260801`.

- [ ] **2026-09-01** — Chantier 38 (reload/remount écran superadmin) — `src/screens/SuperadminScreen.tsx` (1 ligne), diagnostic uniquement sinon

  **Demande de Jules** : « sur l'écran superadmin, il y a un reload successif qui est très désagréable, et qui, toutes les 10 secondes ou moins, nous remmène en haut de la page ». Hypothèse de départ du chantier : un polling ou un abonnement Realtime qui remonte tout le composant au lieu de mettre à jour les données en place.

  **Investigation menée** (aucun accès au mot de passe superadmin — règle de sécurité constante de ce projet, confirmée par des dizaines d'entrées précédentes dans ce fichier — donc aucune manipulation avec un vrai secret) : lecture exhaustive de `SuperadminScreen.tsx` (4748 lignes) — seuls 3 `setInterval` existent, tous dans `SessionDetail` : `loadAssertions` (10 s), `loadMembers` (15 s), `loadStats` (15 s). Aucun ne remonte de composant : les `setState` qu'ils déclenchent (`setAssertions`, `setMembers`, `setVotingStats`) sont de simples mises à jour de props/état, aucun `key` instable trouvé sur un ancêtre commun, `AllocationPanel` a bien un `key={currentSession.id}` mais `currentSession.id` ne change jamais (vérifié : les 3 seuls `setCurrentSession` préservent `id`). Aucun `scrollTo`/`scrollIntoView`/`autoFocus` dans ce fichier ni dans `AllocationPanel.tsx`/`LLMModerationPanel.tsx`/`AnalysisPanel.tsx`/`TableDiagnosticsList.tsx`. Le seul canal Realtime de ce fichier (`table_assignments:<id>`) ne se ré-abonne que sur changement de phase, jamais sur un timer.

  **Reproduction dynamique** (technique déjà validée par une session précédente — cf. entrée E9/H10 plus haut — interception de `window.fetch` pour simuler une authentification superadmin réussie et des réponses RPC, **sans jamais saisir ni faire circuler de vrai mot de passe** ; bascule du hash `#superadmin`→`#foo`→`#superadmin` pour forcer un remount propre de `SuperadminScreen` avec le mock actif) : session factice montée avec succès dans l'onglet 🟢 En direct, en phase `voting` **et** en phase `allocating` (donc avec `AllocationPanel` affiché). Un marqueur JS posé sur `document.querySelector('main')` et un suivi de `window.scrollY` toutes les 3 s, sur ~50-80 s de test à chaque fois (compteurs d'appels confirmant que les 3 `setInterval` tournaient bien en continu, `list_assertions` et `voting_stats`/`list_members` incrémentant à leur cadence attendue) : **aucun remount détecté** (`main` jamais recréé), **`scrollY` resté rigoureusement stable** (testé à 400 px). Test répété à l'identique sur un **build de production** (`npm run build` + `vite preview`, donc sans Vite/HMR) : même résultat, zéro remount, zéro reset de scroll.

  **Hypothèse retenue faute de reproduction côté app** : le symptôme observé par Jules est très probablement un **rechargement complet déclenché par Vite HMR en mode `npm run dev`**, causé par des **sessions Claude Code concurrentes qui sauvegardent des fichiers `src/lib/*.ts`** (modules non-composants comme `lib/allocation.ts`, `lib/voting.ts`) pendant que son onglet navigateur pointe sur le **même serveur dev partagé** (`ecclesia-dev`, port 5173, dossier racine). Un module utilitaire (non-composant React) édité invalide tout le graphe de modules qui l'importe → HMR ne peut pas faire de mise à jour ciblée → rechargement complet de la page → perte du scroll. Preuve indirecte concrète : au tout début de cette session, `git status` sur le dossier racine partagé montrait déjà `src/lib/allocation.ts`, `src/lib/allocation.test.ts` et `bench/strategy-sanity.test.ts` modifiés et non commités par une autre session — cohérent avec le pattern documenté ailleurs dans ce dépôt de « plusieurs chantiers tournent en parallèle sur ce repo ». Cette hypothèse n'explique **pas** un rechargement observé sur le site déployé (GitHub Pages, sans HMR) — si le symptôme se reproduit aussi là, l'hypothèse ci-dessus est fausse et il faut rouvrir l'investigation (tester d'autres onglets — 🪑 Tables / ⚙️ Préparation — ou une séance avec beaucoup plus de données réelles, ce que cette session n'a pas pu reproduire sans le mot de passe).

  **Bug réel trouvé au passage (corrigé)** : `AnalysisPanel` recevait `sessionPhase={session.phase}` (ligne 2057) — la prop `session` est la copie **figée** reçue à l'ouverture de la fiche séance, jamais mise à jour après un changement de phase (c'est `currentSession`, mis à jour par `setCurrentSession`, qui suit la phase réelle). Conséquence : le toggle « auto-analyse » de `AnalysisPanel` (actif seulement en phase `voting`/`pre_voting`) restait activable indéfiniment si la fiche avait été ouverte pendant `voting` puis la séance passée en `allocating`/`debating` sans recharger la page. Corrigé en `sessionPhase={currentSession.phase}`. Sans rapport avec le symptôme de reload — ne change rien au scroll/remount, ne provoque aucune re-fetch supplémentaire (la prop ne contrôle qu'un `if` dans un `useEffect` déjà existant).

  **Déjà vérifié par moi** : `npx tsc -b` (exit 0). `npm run build` (production, exit 0). Reproduction Browser pane décrite ci-dessus, sur serveur dev (`chantier-38-dev`, port 5204, config ajoutée à `.claude/launch.json`) **et** sur build de production (`vite preview`, port 5210, arrêté après test). Après la correction d'`AnalysisPanel`, re-vérifié que la fiche séance factice (phase `allocating`) se remonte toujours sans erreur console (hors erreurs 400 attendues, dues au faux mot de passe non mocké pour tous les endpoints).

  **Non vérifié / reste à faire par Jules ou une session avec le mot de passe superadmin** :
  1. **Confirmer où le symptôme a été observé** : `npm run dev` local (avec ou sans autre session Claude Code active en parallèle dans le même dossier) ou site déployé GitHub Pages ? C'est la donnée manquante la plus importante pour trancher entre l'hypothèse HMR ci-dessus et un vrai bug applicatif non reproduit.
  2. Si le symptôme se reproduit **aussi en production** (ou en dev sans aucune autre session active) : retester spécifiquement les onglets 🪑 Tables et ⚙️ Préparation (non couverts par cette reproduction, qui s'est limitée à 🟢 En direct), et avec un volume de données réaliste (beaucoup d'assertions/membres), ce qu'une session sans mot de passe ne peut pas mettre en place elle-même.
  3. Parcours de clic réel sur une séance de test, avec captures d'écran/vidéo si possible du moment exact du "reload", pour confirmer s'il s'agit d'un vrai remount React (perte de tout l'état local, ex. accordéons qui se referment) ou seulement d'un reset de `scrollY` sans perte d'état (ce qui pointerait vers une cause navigateur plutôt qu'React).

  **⚠️ Hypothèse HMR infirmée par Jules (2026-09-01, 2ème passe)** : « lorsque je constate cette erreur, aucune séance Claude Code ne tournait » + « j'ai l'impression que c'est sur tous les onglets superadmin » + « ça ne clignote pas particulièrement ». Ce retour a rouvert l'investigation — **vrai bug applicatif trouvé et corrigé**, voir la nouvelle entrée en tête de la section **"Parcours Superadmin"** ci-dessous. La reproduction de cette 1ère passe (point "Reproduction dynamique" ci-dessus) n'avait rien vu car son `scrollY` de test (400px) restait **au-dessus** de la hauteur du spinner de chargement plein écran — donc jamais assez profond pour déclencher le clamp de scroll observable en usage réel (beaucoup de contenu ouvert = scroll bien plus profond que 400px). Conservé ici pour mémoire (append-only), ne plus utiliser comme diagnostic de référence.

## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->
