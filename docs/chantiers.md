# Liste des chantiers — Ecclesia (34 à 77)

> **À tenir à jour au fil des chantiers — sert de point de synchronisation entre contributeurs.** C'est le **seul** fichier de suivi de l'avancement du projet : `PROJECT_STATUS.md` a été supprimé au chantier 78 (2026-09-07) parce que deux fichiers de suivi en parallèle avaient produit exactement la dérive qu'on voulait éviter — il était périmé de quinze chantiers et se contredisait avec `git log`. Ne pas en recréer un second : toute mise à jour de statut vient ici.

> **Voir aussi** [`docs/registre-merges-en-attente.md`](./registre-merges-en-attente.md) — l'état détaillé des branches non mergées, des arbitrages en attente, du gel du parcours de vote (séance du 10/09) et de ce qui n'est pas commencé. Ce document-ci est l'index chronologique complet ; le registre est le tableau de bord opérationnel du moment.

> ⚠️ **Mergé ne veut pas dire vérifié.** Presque rien n'a été joué au navigateur sur ce projet — la quasi-totalité des chantiers listés ci-dessous, y compris ceux mergés sur `main` et déployés sur GitHub Pages, n'ont eu qu'une vérification `tsc`/tests/build en session headless, jamais un parcours réel à l'écran (contrainte structurelle : un seul jeton de serveur de dev partagé, une seule session à la fois a le droit de lancer `npm run dev`). Plusieurs commits le disent explicitement (« Aucune vérification navigateur », « pas de mot de passe superadmin en session headless ») ; l'absence de cette mention ne garantit pas non plus qu'un test réel ait eu lieu. `A_VERIFIER.md` reste la seule trace fiable de ce qui a été confirmé humainement.

**Méthode** : chaque ligne est établie à partir de `git log` sur `origin/main` (source de vérité pour ce qui est mergé), des branches distantes non mergées (`git branch -r`), de `docs/registre-merges-en-attente.md`, de `CLAUDE.md` et de `A_VERIFIER.md`/`A_VERIFIER.local-20260906.md`. Aucun numéro n'a été deviné : quand aucune trace fiable n'a été trouvée, c'est écrit tel quel plutôt qu'une supposition. `PROJECT_STATUS.md` n'a pas été utilisé — il s'arrête au chantier 54 (dernière mise à jour le 03/09/2026) et n'a servi à combler aucun trou ici.

**Numérotation lettrée antérieure** : avant le chantier 19 environ, les tâches étaient repérées par lettres (A1-H26, B3, C4, D16…), pas par numéro. Cette numérotation-là est hors du périmètre demandé (chantiers ≥ 34) et n'apparaît pas ci-dessous, y compris quand une branche porte encore un nom lettré (ex. `chantier-b3-reconnexion-prevoting`, `chantier-c4-vote-pass-neutre`) — ces branches sont antérieures au 34 et déjà mergées de longue date.

Légende de statut : ✅ mergé sur `main` et déployé · 🟡 livré mais pas mergé · 🟠 décidé mais pas commencé · ⚪ non commencé.

---

| # | Titre | Ce qui a été fait | Statut | Fichier / RPC principal |
|---|---|---|---|---|
| 34 | Camp sans vote sur les résultats | Un membre inscrit mais n'ayant jamais voté voyait « L'organisateur n'a pas encore nommé les groupes » au lieu de ne voir aucune carte de camp — la carte dépendait de l'allocation physique (`table_assignments`), pas de l'appartenance réelle à un camp d'opinion (`selfGroupId`, qui exige un vote pris en compte par l'analyse PCA). | ✅ Mergé (`5267448`, 2026-08-01) | `src/screens/ResultsMapScreen.tsx` |
| 35 | Synchronisation temps réel du statut modérateur | La section « Tables rattachées » du superadmin n'avait aucun rafraîchissement ; `session_members` n'avait jamais `REPLICA IDENTITY FULL`, empêchant Realtime d'appliquer la RLS sur ses `UPDATE`. `VoteScreen`/`TableContext` s'abonnent désormais à leur propre ligne. | ✅ Mergé (`e3a8aff`, 2026-08-03) | `src/context/TableContext.tsx`, `src/screens/VoteScreen.tsx` |
| 36 | Modérateur affiché deux fois + case modérateur sur "Débat en cours" | Dans l'onglet Tables du superadmin, un membre `is_moderator` apparaissait à la fois comme badge et comme puce ordinaire. `JoinTableForm` gagne la case « Je suis modérateur de cette table » (écrans « Débat en cours » et « Un ami t'invite »). | ✅ Mergé (`318d497`, 2026-08-03) | `src/screens/SuperadminScreen.tsx`, `src/components/JoinTableForm.tsx` |
| 37 | Retirer le clustering hérité + réassignation modérateur | Le bouton « Répartir en tables » court-circuitait l'allocation v2 (RPC `run_clustering_v1/v2`) sans passer par `AllocationPanel` — supprimé avec `ClusteringModal`. `set_member_moderator` pose désormais aussi le siège du membre sur une table sans modérateur, pas seulement le flag. | ✅ Mergé (`367d074`, 2026-08-03) | RPC `set_member_moderator` |
| 38 | Diagnostic puis correctif du reload superadmin | 1ère passe : hypothèse HMR (infirmée par Jules), correction en marge d'un `sessionPhase` figé dans `AnalysisPanel`. 2e passe : cause réelle trouvée — `SessionDetail` masquait tout son contenu derrière un spinner plein écran à chaque rafraîchissement de fond (polling 15s + Realtime), effondrant `scrollY`. Corrigé en ne montrant le spinner qu'au tout premier chargement. | ✅ Mergé (`6112c7e`, 2026-09-02) | `src/screens/SuperadminScreen.tsx` (`SessionDetail`), `AnalysisPanel.tsx` |
| 39 | Nomenclature des phases participant + suppression de la phase `questionnaire` | Nouveau `PhaseIndicator`/`phaseLabels.ts` (« Étape N · Libellé », 5 étapes) affiché sur 5 écrans participant. Phase `draft` renommée « Phase 0 » côté superadmin. Phase `questionnaire` retirée de l'énumération : `debating → closed` déclenche automatiquement `force_session_questionnaire`, gate désormais sur l'absence de réponse (`hasQuestionnaireResponse`) plutôt que sur la phase. | ✅ Mergé (`334c514`, 2026-09-02) | `src/lib/phaseLabels.ts`, `src/components/PhaseIndicator.tsx` |
| 40 | Ordre des modales d'entrée en débat + intitulés | Le panorama « Bienvenue dans le débat » s'affiche avant les règles (au lieu de l'inverse). Règles retitrées, bouton du panorama retitré pour annoncer la modale suivante. | ✅ Mergé (`44bb402`, 2026-09-01) | `src/screens/ParticipantView.tsx` |
| 41 | Modérateur nommé en débat invisible sans quitter/rejoindre | `isModerator` valait `physicalModerator && !moderatorRevoked` (un pur véto, jamais promoteur) : un participant nommé modérateur après avoir déjà rejoint sa table restait bloqué. Corrigé en `physicalModerator || sessionMemberIsModerator` (OR). | ✅ Mergé (`e851fa7`, 2026-09-02) | `src/context/TableContext.tsx` (calcul `isModerator`) |
| 42 | Debounce des notes participant non flush à la fermeture | Fermer la modale « Mes notes » déclenchait `onClose()` sans vider le debounce de 800ms de `saveNote` — rouvrir juste après une frappe pouvait donner l'impression que la note avait disparu. | ✅ Mergé (`f780954`, 2026-09-01) | `src/components/NotesModal.tsx` |
| 43 | Fusion de la barre d'outils modérateur dans "Outils Modo" | Regroupe Notes, Assertions votées et Questionnaire post-débat (boutons séparés du header) dans un seul menu à 3 sections (Camps & assertions, Table, Personnel). Retire le mode transcription live mort (`useTranscription.ts`). Développé et mergé sur la même branche que le chantier 44. | ✅ Mergé (`88182bf`, 2026-09-02) | `src/components/ModeratorToolsButton.tsx` |
| 44 | Bouton "Ajouter une personne sans téléphone" | Nouveau bouton dans la section Table de `ModeratorToolsButton` (à côté du QR code). RPC `add_offline_participant` : insère une ligne `participants` avec le même schéma de collision que `join_table`. Co-développé et mergé avec le chantier 43, sur la même branche (`chantier-43-outils-modo-transcription`) — **pas absorbé, les deux existent distinctement**, simplement livrés ensemble. | ✅ Mergé (`88182bf`, 2026-09-02) | RPC `add_offline_participant` |
| 45 | Questionnaire post-débat : retrait d'une question, note obligatoire en premier | Retrait de « à quel débat as-tu participé ? » (redondante avec `table_id`/`session_id`) ; la note globale 0-5 devient obligatoire et passe en première position. Vérifié en navigateur réel (worktree dédié). | ✅ Mergé (`8e9757e`, 2026-09-01) | `src/components/QuestionnaireModal.tsx`, `SessionQuestionnaireForm.tsx` |
| 46 | Résultats publics des séances closes (opt-in par séance) | `sessions.results_public` (défaut `false`). Bouton superadmin par séance close, modale « Anciennes séances », route `#results/<session_id>`. `get_public_results` durci (exige `closed` ET `results_public=true`) et enrichi (assertions + nuage PCA anonyme, sans `member_id`). | ✅ Mergé (`db939e7`, 2026-09-02) | RPC `get_public_results`, `src/screens/EntryScreen.tsx` |
| 47 | Entrée modérateur avant débat + créer une table depuis le vote | Ajoute le cas « à l'heure » (pré-vote/vote/allocation) de la déclaration modérateur, symétrique au chemin « en retard » déjà existant. Réutilise `claim_moderator_status`/`create_table` tels quels. **Remplacé depuis par le chantier 73** (bouton déplacé, création de table retirée côté participant). | ✅ Mergé (`da44d4e`, 2026-09-02) — superseded par 73 | `src/components/voting/ModeratorAccessPanel.tsx` *(supprimé par le chantier 73)* |
| 48 | "Je veux rejoindre une autre table" sur l'écran d'annonce | Nouveau lien discret sous « Accéder à la table » (`AllocatingScreen`), révèle un mini-formulaire de code à 6 caractères. Nouvelle RPC `switch_table` (pas de réutilisation de `join_table`, qui ne vérifie jamais l'appartenance à la séance ni ne nettoie les tables précédentes). | ✅ Mergé (`3c3edd9`, 2026-09-02) | RPC `switch_table`, `src/screens/AllocatingScreen.tsx` |
| 49 | Purge des codes de rappel des séances closes | `session_members.reclaim_code` (PIN en clair) n'a plus d'usage après clôture — combiné au pseudo, la donnée la plus sensible du schéma. Purge ponctuelle des séances déjà closes + `set_session_phase` purge désormais automatiquement à chaque clôture. Destructif et irréversible, autorisé par Jules sans sauvegarde. | ✅ Mergé (`a14e1ea`, 2026-09-03) — confirmé appliqué en base (vérifié chantier 76 : 0 code en clair sur 88 membres `closed`) | RPC `set_session_phase` |
| 50 | Fermer la lecture directe de `session_members`/`table_assignments` | Les deux tables avaient `SELECT USING (true)` : n'importe qui lisait noms réels + `reclaim_code` en clair de toutes les séances. Policies resserrées en self-only + nouvelle RPC `list_table_assignments_admin` pour le seul besoin croisé restant (vue Groupes superadmin). | ✅ Mergé (`769b1b4`, 2026-09-02) — confirmé appliqué en base (chantier 76) | RPC `list_table_assignments_admin`, policies `session_members_select_own`/`table_assignments_select_own` |
| 51 | Anonymat réel des auteurs d'assertions | `assertions_select_approved` laissait passer `member_id` (toutes colonnes) — croisé avec `session_members` (alors public), désanonymisait l'auteur de toute assertion approuvée. `GRANT SELECT` restreint aux colonnes sans `member_id` ; nouvelle RPC `get_my_assertion_ids` pour le seul site qui en avait besoin. | ✅ Mergé (`f99244f`, 2026-09-02) — confirmé appliqué en base (chantier 76). **Réserve non levée** : fuite possible de `member_id` par la charge utile Realtime `postgres_changes`, jamais testée en navigateur. | RPC `get_my_assertion_ids` |
| 52 | Valider les URL des sources collaboratives + fermer `collab_session_users` | `session_sources.url` n'était jamais validée (XSS `javascript:` possible, chaîne documentée vers le vol du mot de passe superadmin). Validation `http(s)` côté serveur (`add_collab_source`/`update_collab_source`) et côté client (`isSafeUrl`). `collab_session_users` restreinte au propriétaire de la ligne. | ✅ Mergé (`6a88f2b`, 2026-09-03) — confirmé appliqué en base, et complété par le chantier 72 (voir plus bas) | RPC `add_collab_source`, `src/lib/utils.ts` (`isSafeUrl`) |
| 53 | Plafonner le refetch déclenché par broadcast Realtime | Le canal `table:<id>` est ouvert en émission à quiconque a la clé anon publique — DoS confirmé exploitable. Debounce ~1s + plafond de fréquence (5 msg/s) sur la réception du broadcast `refresh`, sans toucher à l'émission ni aux 3 autres couches de rattrapage. | ✅ Mergé (`0a3b4e1`, 2026-09-02) — confirmé appliqué (chantier 76) | `src/context/TableContext.tsx` |
| 54 | Retirer au modérateur la possibilité de supprimer sa table | `TableContext.endTable()` (code mort côté écrans) et la policy `tables_delete_moderator` permettaient encore un `DELETE` direct via l'API REST. Jules a tranché : aucune capacité de suppression côté modérateur, par aucun chemin. `DROP POLICY` sans remplacement. | ✅ Mergé (`07c8c41`, 2026-09-03) — confirmé appliqué en base (chantier 76 : policy absente) | `DROP POLICY tables_delete_moderator` |
| 55 | Preuve de possession sur les reprises d'identité | Exiger le code de rappel (et non le seul pseudo) pour reprendre une identité (`confirm_attendance`, `reclaim_prevoting_member`, `register_collab_pseudo`…). | ⚪ Non commencé | Aucune branche. Bloqué sur un arbitrage produit de Jules (code obligatoire vs filet de rattrapage superadmin) — voir `docs/registre-merges-en-attente.md` §7. Cible : RPC `confirm_attendance` |
| 56 | Durcissement SQL : `search_path` + `app_config` | Figer `search_path = public, extensions` sur les fonctions à `crypt()` (`check_superadmin_password`, `create_table`, `reclaim_moderator`, `claim_moderator_status`) et `REVOKE ALL ON app_config, assertion_merges FROM anon, authenticated`. | ⚪ Non commencé | Aucune branche. **⚠️ Peut verrouiller Jules hors de sa propre base — à ne faire qu'en sa présence**, jamais à l'approche d'une utilisation en production. Cible : RPC `check_superadmin_password` |
| 57 | Quota et plafond de charge utile sur `gemini-proxy` | L'Edge Function ne vérifiait qu'un JWT valide — n'importe quel porteur de la clé anon pouvait l'appeler sans limite. Ajoute un quota de 20 appels/60s par `user_id` (429) et un plafond de 300 Ko de charge utile (413). | ✅ Mergé (`c905d20`, 2026-09-02) — confirmé dans le code (chantier 76). **Edge Function non redéployée** (bloqué sur `supabase login`, sur Jules). | `supabase/functions/gemini-proxy/index.ts` |
| 58 | Restreindre les colonnes de `sessions` lisibles publiquement | `description`, `doc_*_url`, `moderation_policy`, `group_names`, `results_public` etc. ne seraient plus lisibles par `select()` direct. 4 nouvelles RPC (`get_session_by_id`, `get_session_by_join_code`, `list_sessions_admin`, `list_public_closed_sessions`) pour les 8 `select('*')` et 3 lectures de colonnes retirées. | 🟡 Livré, pas mergé — les 4 RPC de lecture sont **déjà en base**, mais le `REVOKE SELECT ON sessions` + `GRANT` restreint n'est **pas** appliqué (casserait 8 écrans tant que le code n'est pas déployé). **Ne pas l'appliquer avant d'ajouter `onboarding_enabled` à la liste des colonnes accordées** (chantier 71, postérieur). Branche `chantier-58-colonnes-sessions`. | RPC `get_session_by_id`, `list_sessions_admin` |
| 59 | Canaux Realtime privés | Ferme le DoS de fond du chantier 53 (F6) : `privateChannel()` (nouveau helper, journalise les `CHANNEL_ERROR`), policies sur `realtime.messages` (lecture par topic, émission restreinte). 2 canaux superadmin déjà morts supprimés au passage. | 🟡 Livré, pas mergé — migration écrite, **non appliquée**. **Ordre non négociable** : migration → code → recette → **puis seulement** désactiver « Allow public access » dans le dashboard Supabase (réglage global, hors SQL — l'inverser casse toute la prod). Rien avant la séance du 10/09. Branche `chantier-59-realtime-prive`. | `src/lib/realtime.ts` (`privateChannel`) |
| 60 | Découpler l'autorité du modérateur de la propriété de la table | Un membre marqué `session_members.is_moderator` (allocation v2) voyait `ModeratorView` (chantier 41) mais aucune action n'aboutissait : les gardes testaient `created_by`, or `apply_allocation` y pose l'uid du superadmin. Nouveau helper `is_table_moderator`, repris sur 9 fonctions + 7 policies RLS. | ✅ Mergé (`3946bfc`, 2026-09-02) — confirmé appliqué en base (chantier 74 s'appuie dessus) | RPC/helper `is_table_moderator` |
| 61 | Inscription et vote pendant la phase `allocating` | `register_session_member` refusait toute phase hors `draft/pre_voting/voting` — un retardataire ne pouvait pas rejoindre pendant le calcul de répartition. `cast_vote`/`submit_assertion` n'avaient déjà aucune garde de phase. `allocating` ajouté aux phases d'inscription. | ✅ Mergé (`998ecd2`, 2026-09-02) | RPC `register_session_member` |
| 62 | Sortie de secours pour un participant sans affectation de table | Un membre inscrit après `apply_allocation` (via le chantier 61) n'avait pas de `table_assignments` et restait bloqué sur « Formation des groupes en cours… » indéfiniment. `TableAssignmentCard` distingue désormais loading / pas d'affectation en `debating` (formulaire de code, réutilise `switch_table`) / pas d'affectation en `closed`. | ✅ Mergé (`2a5da88`, 2026-09-02) | `src/components/voting/TableAssignmentCard.tsx` |
| 63 | Questionnaire de clôture masqué par l'overlay "Séance terminée" | Les deux surcouches plein écran étaient à z-index égal ; l'overlay (rendu après) l'emportait toujours. Corrigé en masquant l'overlay tant que le questionnaire forcé est ouvert. `onDone` du questionnaire menait à un cul-de-sac sur 2 des 3 écrans d'entrée — corrigé pour converger vers les résultats. | ✅ Mergé (`c6d89f4`, 2026-09-02) | `src/screens/ParticipantView.tsx` |
| 64 | Une table `leaderless` devient modérée quand un membre devient modérateur | `set_member_moderator`, `claim_moderator_status`, `assign_moderator_to_table` posent `leaderless = false` quand ils affectent un modérateur déjà assis sur une table sans animateur. Deux compléments le même jour : `leaderless_by_design` (distingue une table conçue modérée d'une table convertie) + bascule arrière au départ du modérateur (`switch_table`, puis `move_member_to_group` par symétrie). | ✅ Mergé (`1369101`, 2026-09-02) | `tables.leaderless_by_design`, RPC `set_member_moderator` |
| 65 | Verrouiller l'inscription aux séances en brouillon | `register_session_member` acceptait encore la phase `draft` (oubli du chantier 61). Retiré côté RPC et frontend ; même trou fermé dans `confirm_attendance`, qui ne testait aucune phase. | ✅ Mergé (`ed36859`, 2026-09-02) | RPC `register_session_member`, `confirm_attendance` |
| 66 | `join_table` nettoie les appartenances précédentes de la séance | `join_table` faisait un simple upsert : rejoindre une nouvelle table dans la même séance laissait l'ancienne ligne `participants` en place (identités fantômes constatées en base). Nouvelle fonction `leave_other_session_tables`, reprise par `join_table` et `switch_table`. | ✅ Mergé (`0d40109`, 2026-09-04) | RPC `leave_other_session_tables` |
| 67 | Quatre correctifs issus de la revue des parcours | (1) Pré-votant plus éjecté au passage en phase `voting`, option « continuer à distance » sans confirmer sa présence. (2) `claim_moderator_status` pose désormais `reclaim_code` en pré-vote, comme `register_session_member`. (3) `sync_table_assignment` ne masque plus ses erreurs en silence. (4) `AppIntroModal` aligné sur les 5 étapes du chantier 39. Correctif ultérieur le 09-03 : la migration ne devait pas écraser le bloc du chantier 64 dans `claim_moderator_status`. | ✅ Mergé (`72ec2fe`, 2026-09-03) | RPC `claim_moderator_status`, `sync_table_assignment` |
| 68 | `claim_table_as_moderator` : choisir sa table par code sans déposséder le modérateur en place | `JoinTableForm`/`EntryScreen` appelaient `reclaim_moderator`, qui écrase `created_by` sans aucune vérification. Nouvelle RPC dédiée + helper `table_has_moderator` : refuse Code Ecclesia invalide, code d'une autre séance, ou table déjà modérée. `reclaim_moderator` reste pour son usage légitime (le modérateur déjà en place). **Point laissé ouvert** : plus aucun écran n'expose de chemin pour la « vraie » reprise de main. | ✅ Mergé (`f00458a`, 2026-09-04) | RPC `claim_table_as_moderator`, `table_has_moderator` |
| 69 | Écran postvote (revoter après le débat) | Nouveau `PostVoteScreen`, accessible depuis `ResultsMapScreen` (« ↻ Revoter ») : revoter sur ses assertions, en proposer une nouvelle, voter sur celles jamais vues. Signale au passage que `cast_vote` écrase le vote initial sans historique — pas de comparaison avant/après débat possible avec le schéma d'alors (repris par le chantier 70). | ✅ Mergé (`8bdf3c5`, 2026-09-04) | `src/screens/PostVoteScreen.tsx` |
| 70 | Historiser les votes pour mesurer le déplacement des opinions | Nouvelle table `assertion_vote_history` alimentée par `cast_vote` avant chaque écrasement. `session_analysis.vote_scope` (`current`/`pre_closure`) permet de reconstituer les votes juste avant clôture. Deux nouvelles RPC de lecture (`list_session_analyses`, `get_analysis_by_id`) pour un futur écran de comparaison — **non construit ici, volontairement laissé à Jules**. | ✅ Mergé (`6123ef5`, 2026-09-04) | Table `assertion_vote_history`, RPC `cast_vote` |
| 71 | Désactiver l'onboarding par séance | Retour de Jules : « le vote ne doit pas servir de référence [...] je dois juste pouvoir créer une session sans onboarding. » Nouvelle colonne `sessions.onboarding_enabled` (défaut `true`), interrupteur superadmin, `VoteScreen` saute l'onboarding quand le flag est faux. Bloquant pour la séance de production du 10/09. | ✅ Mergé (`3e1e1d2`, 2026-09-04) | `sessions.onboarding_enabled`, RPC `set_session_onboarding_enabled` |
| 72 | Modération superadmin : reprise de table, ajout de modérateur, defaults | Corrige deux bugs indépendants derrière « Cette table a déjà un modérateur » (retrait incomplet de `created_by`, et refus du modérateur légitime revenant d'un autre appareil). Nouvelle RPC `release_table_moderation`, helper `table_moderator_is`. Ajoute l'accès manquant pour « ajouter un modérateur » à une table sans animateur, un défaut « actif » pour un membre sans `entry_responses`, `DROP` de la surcharge non validée d'`add_collab_source` (4 arguments, contournait le chantier 52), édition du titre/description d'une séance, réorganisation de l'onglet Tables. **Arbitrage en attente de validation par Jules** (voir registre §5). | ✅ Mergé (`00fd5ae`, 2026-09-06) — confirmé appliqué en base | RPC `release_table_moderation`, `table_moderator_is`, `update_session_meta` |
| 73 | Déclaration modérateur dès l'inscription | Case « Je suis modérateur » sur les 3 formulaires d'inscription (`PseudoForm`, `VotingEntryForm`, `AttendanceConfirmScreen`), dans les 4 phases pertinentes — inscription toujours réussie même si le mot de passe est faux. Bouton « Je suis modérateur »/« Créer une table » retiré du header (`ModeratorAccessPanel` supprimé), remplacé par « Me déclarer modérateur » dans le panneau Outils. Bouton des anciennes séances aligné visuellement ; ordre des modales d'accueil pré-vote inversé. **Les 3 onglets d'`EntryScreen` n'ont pas été retirés** (inventaire fait, conclusion inversée depuis par le chantier 75). | ✅ Mergé (`1c62418`, 2026-09-06) | `src/screens/VoteScreen.tsx`, `ModeratorDeclareField.tsx`, `ModeratorClaimModal.tsx` |
| 74 | Modale des phases + participant hors ligne | (1) La pill `PhaseIndicator` devient un bouton ouvrant une modale listant les 5 phases, l'étape en cours marquée. (2) Diagnostic du signalement « les participants sans téléphone n'existent pas en base » : la garde d'autorisation était déjà corrigée par le chantier 60 (fausse piste) — le vrai gap est que `add_offline_participant` n'écrivait jamais dans `session_members`, seulement `participants`. (3) Champ de saisie invisible corrigé (`text-gray-900 bg-white` — le texte héritait du `text-white` de la racine sombre de `ModeratorView`). | 🟡 Livré, pas mergé — **et pas même poussé sur `origin` sous ce nom** : les 2 commits existent uniquement dans le worktree local `Ecclesia-chantier-71` (branche locale `chantier-74-phases-et-hors-ligne`), le push a échoué (« refusing to update checked out branch ») et n'a jamais été refait. La **migration SQL, elle, a été appliquée directement en base par une autre session** le 06/09 (confirmé : `add_offline_participant` écrit désormais dans `session_members` aussi). | `src/components/PhaseIndicator.tsx`, RPC `add_offline_participant` |
| 75 | Retrait des 3 onglets de `EntryScreen` | Le chantier 73 avait conclu qu'il fallait garder « Rejoindre » et « Créer » faute d'équivalent. **Jules a tranché l'inverse le 06/09** : retirer les trois onglets (« Modérateur / Rejoindre / Créer »), la création de table étant du ressort du superadmin et personne ne rejoignant une séance par le seul numéro de table. À vérifier avant tout retrait : que le chemin « rejoindre une table par son seul code en pleine phase débat » existe réellement et est atteignable (`switch_table` depuis `AllocatingScreen`, `JoinTableForm` à l'étape `ended` de `VoteScreen` — qui ne reçoit pas de `sessionId`, contrairement à `SessionRouterScreen`) — le construire d'abord si besoin, retirer ensuite. | 🟠 Décidé, jamais lancé | Aucune branche. Cible : `src/screens/EntryScreen.tsx` |
| 76 | Plan de sécurité consolidé | Les 4 documents d'audit/revue/plan de sécurité (03/08 et 02/09) relus un par un contre le code et la base de production **d'aujourd'hui** (MCP Supabase, lecture seule), pas contre les fichiers de migration. Chaque constat classé corrigé / ouvert / sans objet, avec preuve et ordre de traitement. Fait nouveau trouvé en vérifiant : `results_public` déjà actif sur 2 séances réelles. | 🟡 Livré, pas mergé — purement documentaire, aucun risque à merger. Branche `chantier-76-plan-securite`. | `docs/2026-09-06-plan-securite-consolide.md` |
| 77 | Liste des chantiers (ce document) | Index chronologique et vérifié des chantiers 34 à 77, pour que chaque conversation puisse voir d'un coup d'œil ce qui a été fait et livré sans reconstituer l'historique à chaque fois. | 🔵 En cours (ce chantier) | Branche `chantier-77-liste-chantiers`. `docs/chantiers.md` |
| 79 | Écran de comparaison avant/après débat | Nouvel accordéon « Comparaison avant / après débat » dans l'onglet 📊 Analyse : apparie les camps de deux analyses (chantier 70 : `vote_scope` `pre_closure`/`current`) par **composition réelle de membres** (`pairGroups`, glouton par chevauchement), jamais par `group_id` — deux calculs k-means successifs ne numérotent pas les camps pareil. Affiche mouvement des membres entre camps, appariement avec effectifs, assertions dont le consensus a le plus bougé (comparaison directe, indépendante du numéro de groupe). Vérifié au navigateur par Jules (09/07) sur une séance de test générée en base (16 membres fictifs, votes avant/après débat, analyse `pre_closure` calculée avec le vrai pipeline PCA/k-means) — donnée de test supprimée après validation. **Point laissé ouvert** : aucun bouton superadmin ne déclenche encore le calcul d'une analyse `pre_closure` en conditions réelles — sans ça l'écran n'a un second terme à comparer que si quelqu'un revote via le postvote (chantier 69) sur une séance déjà close, voir `A_VERIFIER.md`. | ✅ Mergé (`f41a220`, 2026-09-07) — vérifié au navigateur par Jules | `src/components/AnalysisPanel.tsx` (`AnalysisComparisonPanel`), `src/lib/analysis.ts` (`pairGroups`) |
| 89 | Phase `post_voting` — le revote post-débat devient une fenêtre, pas un accès permanent | Jules : le passage `debating → closed` ouvrait le revote (chantier 69) sans jamais le refermer. Nouvelle phase `post_voting` insérée entre `debating` et `closed` : le questionnaire forcé et le revote (`PostVoteScreen`) se déclenchent à l'entrée en `post_voting` ; le passage en `closed` coupe le bouton « ↻ Revoter » sur `ResultsMapScreen`. Tous les points qui routaient sur `phase === 'closed'` pour détecter "débat fini" (`VoteScreen`, `AllocatingScreen`, `TableAssignmentCard`, `ParticipantView`, `ModeratorView`, `SessionRouterScreen`) traitent désormais `post_voting` de la même façon ; seuls la purge de `reclaim_code` et le résumé public (`get_public_results`) restent gated sur `closed` strictement. Nomenclature participant à 6 étapes (`PARTICIPANT_PHASE_STEPS`) au lieu de 5. | ✅ Mergé (2026-09-07), migration appliquée en base. **Vérifié au navigateur** le 07/09 (séance QA jetable, purgée après test) : `debating → post_voting → closed` en Realtime, questionnaire forcé, revote fonctionnel, bouton « ↻ Revoter » disparu en `closed`, zéro erreur console. **⚠️ Mergé pendant le gel du parcours de vote** (touche `VoteScreen.tsx`, `docs/registre-merges-en-attente.md` §1) — autorisé explicitement par Jules le 07/09, avant la fin de la séance du 10/09. Non couvert : le bouton `PhaseBar` superadmin lui-même (mot de passe non transmis — transitions faites par `UPDATE sessions.phase` direct) et le visiteur non inscrit en `post_voting`. Détail dans `A_VERIFIER.md` § Chantier 89. | `src/lib/types.ts`, `src/lib/phaseLabels.ts`, `src/screens/SuperadminScreen.tsx`, `src/screens/ResultsMapScreen.tsx`, `supabase/migrations/20260907_chantier89_post_voting_phase.sql` |
| 80 | Réserves sécurité sur `get_public_results` | Jules, 07/09 : ne pas pouvoir remonter aux participants depuis la page publique, ou le rendre dur. Vérification en base (`pg_get_functiondef`) : aucun identifiant/pseudo ne sortait déjà de la fonction. Deux trous corrigés : points du nuage renvoyés dans l'ordre d'inscription faute d'`ORDER BY` (ajout `ORDER BY random()`), `SET search_path` manquant sur cette fonction `SECURITY DEFINER`. Explicitement hors périmètre (refusé par Jules) : seuil de k-anonymat, compteurs par assertion, coupure d'une séance déjà publique. | ✅ Migration appliquée en base et vérifiée au navigateur le 2026-09-07 (deux séances publiques réelles) | `supabase/migrations/20260907_chantier80_reserves_public_results.sql`, RPC `get_public_results` |

---

## Notes de méthode et cas particuliers

- **Chantiers 43 et 44** : développés et mergés sur la même branche (`chantier-43-outils-modo-transcription`), avec des commits distincts. Ni l'un ni l'autre n'a « absorbé » l'autre — vérifié dans `git log` : deux commits séparés (`11bf27a` pour le 43, `5235948` pour le 44), un seul merge commit sur `main`.
- **Chantiers 55, 56, 75** : recherchés sur **toutes** les branches du dépôt (`git log --all --grep`), pas seulement `main`. Aucune trace de commit dédié pour aucun des trois — confirmé, pas juste absent de `main`.
- **Chantier 58** est un cas intermédiaire réel, pas une erreur de classement : une partie de son contenu (les 4 RPC de lecture) est en base de production alors que la branche qui les contient n'est pas mergée sur `main`, et l'autre partie (le `REVOKE`) n'est appliquée nulle part. Les trois états (mergé / en base seulement / nulle part) coexistent pour un même chantier — voir la ligne du tableau pour le détail exact.
- **Chantier 74** est le seul cas où le code n'existe même pas sur une branche `origin` portant son nom — seulement dans un worktree local. À récupérer directement depuis ce dossier (`git fetch <chemin du worktree> chantier-74-phases-et-hors-ligne`) plutôt que depuis `origin`, tant que personne n'aura réussi à le pousser.
- Les numéros **1 à 33** existent (`chantier-1-navigation` à `chantier-33-gestion-moderateurs-tables`, tous mergés) mais sont hors du périmètre demandé pour ce document.

---

## Annexe A — Chantiers 1 à 25 : tâches lettrées

> **Repris tel quel de `PROJECT_STATUS.md`, supprimé au chantier 78 (2026-09-07).** Contenu **déplacé, pas résumé**.
>
> Pourquoi le garder : le corps du tableau principal ci-dessus couvre les chantiers 34 à 77 et exclut délibérément la numérotation lettrée antérieure. Or `CLAUDE.md`, `A_VERIFIER.md` et de nombreux en-têtes de migration désignent encore des tâches par leur lettre (« chantier 18 / F24 », « D7 », « H26 », « chantier 19 / G3 »…). Ces tables sont la **seule** correspondance entre ces 83 identifiants et les chantiers numérotés 1 à 25. Sans elles, ces renvois deviennent illisibles.
>
> ⚠️ Les statuts ci-dessous datent de l'été 2026 et n'ont pas été revérifiés : les lire comme un historique, pas comme un état courant. L'état courant est le tableau principal de ce document et `docs/registre-merges-en-attente.md`.

## Chantier 1 — Navigation partout
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| C5 | Bouton « Quitter » dans toutes les phases | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D3 | Messages de reload en phase d'attente | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D5 | Message d'intro sur le fonctionnement de l'app | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D9 | Infos sur la phase « allocating » | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 2 — Questionnaire & identité avant allocation
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D18 | Question modérateur oui/non | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D4 | Renommer « pseudo » → « nom prénom » | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D7 | Préremplir le nom/pseudo | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 3 — Débat sans admin
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D1 | Lecture rapide des règles à l'entrée de table | Backlog | | Chantier 1 |
| D2 | Désignation d'un admin en cours de débat | Fait — migration `designate_moderator` appliquée en base (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | Chantier 1 |
| F11 | Lien table sans admin ↔ séance d'origine | Bug trouvé et corrigé (chantier 14) — voir section dédiée ci-dessous | Claude | Chantier 3 |

## Chantier 4 — Rejoindre en cours de séance
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| D14 | Rejoindre le débat en retard, quelle que soit la phase | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D8 | Rejoindre un ami via code distribué | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |

## Chantier 5 — Algo d'allocation & modérateurs
> ⚠️ **La livraison de juillet (B1/B2/E4) est remplacée par le chantier 19** (`docs/chantier-5-allocation-v2-spec.md`). `run_clustering_v3` et `get_moderator_responses` sont supprimées ; `run_clustering_v1`/`v2` sont conservées le temps de valider l'algo v2 en prod.

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B1 | Refonte algo d'allocation + questionnaire | **Remplacé par le chantier 19** (`run_clustering_v3` supprimée) | Claude | Chantier 2 |
| B2 | Assignation des modérateurs | **Remplacé par le chantier 19** (règle 5 + `session_members.is_moderator`) | Claude | Chantier 2 |
| E4 | Vue superadmin : retour des réponses modérateur | **Annulé** — `moderator_pref` supprimée, panneau retiré (remplacé par le tableau de bord d'allocation) | Claude | Chantier 2 |

## Chantier 19 — Algorithme d'allocation v2 (Vague 3)
> Spec normative : `docs/chantier-5-allocation-v2-spec.md` · amendements : `docs/VAGUE3-amendements-allocation.md`

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G1 | Algorithme v2 — 5 règles en ordre lexicographique | Fait — `src/lib/allocation.ts` + 41 tests vitest (`npm test`). **À vérifier sur données réelles** — voir A_VERIFIER.md | Claude | — |
| G2 | RPC `create_tables_batch` (N tables vides en lot) | Fait — migration `20260725_2` **appliquée et vérifiée en base** | Claude | — |
| G3 | Onboarding 6 → 3 questions | Fait — migration `20260725_1` **appliquée** (3 colonnes supprimées ; `ecclesia_experience` → booléen, conversion vérifiée : 18 true / 6 false sur 24 lignes) | Claude | — |
| G4 | Signal « modérateur pour cette séance » | Fait — `session_members.is_moderator` **en base** + `set_member_moderator` / `claim_moderator_status` vérifiées. UI minimale (onglet Participants). **Flow UI complet = chantier 21** | Claude | — |
| G5 | Dépréciation `run_clustering_v3` / `get_moderator_responses` / panneau E4 | Fait — migration `20260725_3` **appliquée** (absence des 2 fonctions confirmée via `pg_proc`) | Claude | G1 |

## Chantier 20 — Tableaux de bord allocation (Vague 3)
> Dépend du chantier 19. Amendements : `docs/VAGUE3-amendements-allocation.md` (section « Vue modérateur — conscience idéologique » / « Vue superadmin — représentation des tables »).

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G6 | Vue superadmin — composition par camp/actifs/enregistrable visibles directement sur chaque carte + état "à jour" (Realtime) | Fait — `npx tsc -b`/`npm run build` OK. **À vérifier fonctionnellement** — voir A_VERIFIER.md | Claude | Chantier 19 |
| G7 | Vue modérateur — composition idéologique de sa table + assertions représentatives/clivantes/consensuelles de sa table | Fait — migration `20260727_1_chantier20_table_opinion_summary.sql` **non appliquée** (MCP Supabase indisponible cette session). **À vérifier fonctionnellement** — voir A_VERIFIER.md | Claude | Chantier 19 |

## Chantier 21 — Flow d'entrée modérateur & refonte menu participant (Vague 3)
> Amendements : `docs/VAGUE3-amendements-allocation.md` § « Processus modérateurs » et § « Fusion rejoindre / reprendre »

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G8 | Onglet « Modérateur » (remplace « Voter ») | Fait — `EntryScreen.tsx`, appelle `claimModeratorStatus`. **À vérifier en conditions réelles** (mot de passe superadmin requis) — voir A_VERIFIER.md | Claude | G4 |
| G9 | Fallback superadmin marquage modérateur | Déjà fait au chantier 19 (`MembersPanel`, onglet Participants) — vérifié suffisant, non modifié | Claude | G4 |
| G10 | Fusion onglets Rejoindre/Reprendre + « Je suis modérateur » | Fait — `EntryScreen.tsx`, onglet unique avec révélation inline du mot de passe | Claude | — |
| G11 | Renommer l'onglet fusionné | Fait — « Rejoindre ou reprendre une table » | Claude | G10 |

⚠️ Correction associée (hors périmètre G8-G11 mais indispensable) : `AllocatingScreen.handleJoin` codait `isModerator` en dur à `false` — corrigé pour lire `member.is_moderator`, sans quoi un modérateur assigné par l'allocation v2 (chantier 19) rejoignait sa table comme participant ordinaire.

## Chantier 22 — Petits ajustements UX liés (Vague 3)
> Amendements : `docs/VAGUE3-amendements-allocation.md` § « Phase pre_voting — message d'annonce », § « Table leaderless — message de clarification », § « Suppression des notions de durée par phase »

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| G12 | Pop-up unique pre_voting (remplace la bannière inline) | Fait — `PreVotingAnnounceModal` dans `VoteScreen.tsx`, mémorisée en localStorage. **À vérifier fonctionnellement** (nécessite une séance en `pre_voting`) — voir A_VERIFIER.md | Claude | — |
| G13 | Message de clarification « devenir animateur » (table leaderless) | Fait — texte de confirmation enrichi dans `ParticipantView.tsx` | Claude | — |
| G14 | Suppression des timers de phase | Fait — `vote_timer_minutes`/`vote_threshold_percent` retirés du type `Session`, de `update_session_config`, et de toute l'UI superadmin (VotingStatsPanel, alertes timer/seuil, formulaire de création). Migration `20260727_2_chantier22_remove_vote_timers.sql` **non appliquée** (MCP Supabase indisponible) | Claude | — |

⚠️ Développé en worktree dédié (`chantier-22-ajustements-ux` → `C:\Users\jules\projet\Ecclesia-chantier-22`) après avoir détecté que le dossier de travail partagé contenait déjà le travail non commité de la session concurrente du chantier 11 (QR codes déplacés vers Outils/Outils Modo) — collision résolue par `git stash`/restauration sur `main` sans perte, puis isolation dans un worktree. Voir A_VERIFIER.md pour le détail.

## Chantier 24 — Flow d'entrée modérateur : entrée & repérage (suite du chantier 21)
> Retours de test de Jules sur le chantier 21.

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| H3 | Case à cocher « je suis modérateur » avant le bouton Rejoindre | Fait — `EntryScreen.tsx`, vérifié interactivement | Claude | Chantier 21 |
| H4 | `claim_moderator_status` crée le profil à la volée si absent | Fait — migration `20260727_4_chantier24_claim_moderator_create_profile.sql` **non appliquée** (MCP Supabase indisponible). Échec propre côté client confirmé tant que la migration n'est pas là (aucune donnée créée) | Claude | Chantier 19 (G4) |
| H5 | Texte de l'écran « Débat en cours » | Fait — `VoteScreen.tsx` + `SessionRouterScreen.tsx`. **À vérifier fonctionnellement** (nécessite une séance en `debating`) — voir A_VERIFIER.md | Claude | — |
| H6 | Mise en avant du message « Fais un screen » | Fait — `ReclaimCodeDisplay` (`VoteScreen.tsx`), bandeau dédié plus haut/plus grand. **À vérifier fonctionnellement** (nécessite une séance en `pre_voting`) — voir A_VERIFIER.md | Claude | — |
| H11 | Badge « Vous êtes modérateur » pendant vote/prévote | Fait — `VoteScreen.tsx`, badge + modale explicative. **À vérifier fonctionnellement** (nécessite un membre `is_moderator=true`, donc H4 appliquée) — voir A_VERIFIER.md | Claude | H4 |
| H23 | Modale d'accueil modérateur en phase debating | Fait — `ModeratorView.tsx`, une fois par table (localStorage). **À vérifier fonctionnellement** (nécessite une séance en `debating`) — voir A_VERIFIER.md | Claude | — |

⚠️ Développé en worktree dédié (`chantier-24-flow-moderateur-entree` → `C:\Users\jules\projet\Ecclesia-chantier-24`, port 5186 ajouté à `.claude/launch.json`), en parallèle des chantiers 25 (algo d'allocation) et 28 (nommage des camps) — zones de code disjointes, aucun chevauchement constaté. Voir A_VERIFIER.md pour le détail et le parcours manuel restant.

## Chantier 6 — Analyse des camps (Gemini)
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| A1 | Bug de nommage des camps | Fait & live — symptôme corrigé en prod (fallback frontend). Amélioration Edge (labels neutres) **redéployée** (`gemini-proxy` v9, rapporté 22/07 — à valider empiriquement en k=3+ camps, cf. A_VERIFIER.md) | Claude | — |
| E3 | Nommage Gemini systématique après analyse | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D10 | Assertions consensuelles inter-groupes | Fait — lisibilité (calcul inter-camps préexistant) ; à vérifier — voir A_VERIFIER.md | Claude | A1/E3 |
| C6 | Tracking impact énergétique des appels LLM | **Retiré au chantier 17 (F19)** — l'estimation d'énergie était indicative et sans base fiable ; remplacée par l'affichage du modèle Gemini réellement utilisé | Claude | — |

## Chantier 7 — Fusion des assertions
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| B4 | Fusion des assertions ne marche pas | Fait — migration `update_assertion_content` appliquée + Edge `gemini-proxy` redéployée avec prompt durci (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md). **Suite : chantier 18** | Claude | — |

## Chantier 18 — Fusion : prescription vs jugement + annulation
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F23 | Prescription ≠ jugement dans le prompt de fusion | Fait — règle de typage PRESCRIPTION/JUGEMENT/CONSTAT ajoutée à `buildMergePrompt`, Edge `gemini-proxy` redéployée (**v12**). Vérifié par 1 appel Gemini réel sur le jeu PUBFUS retrouvé en base — voir A_VERIFIER.md | Claude | Chantier 7 (B4) |
| F24 | Annuler une fusion déjà acceptée | Fait — migration `20260728_chantier18_merge_undo` **appliquée** (table `assertion_merges` + `apply_assertion_merge`/`revert_assertion_merge`/`list_assertion_merges`). Aller-retour vérifié en SQL ; rendu visuel du panneau à vérifier avec le mot de passe superadmin — voir A_VERIFIER.md | Claude | Chantier 7 (B4) |

> **Suite prévue (hors chantier)** : session de calibrage dédiée où Jules tranchera cas par cas quelles assertions doivent ou non fusionner, pour affiner le prompt à partir d'exemples réels validés.

## Chantier 8 — Bugs techniques divers
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| A2 | Bugs DND phase débat | Backlog | | — |
| A3 | Vérifier sauvegarde des notes | Backlog | | — |
| A4+D17 | Fin de séance / forçage questionnaire | Backlog | | — |
| C7 | Bug affichage prevote | Backlog | | — |
| B3 | Instabilité user ID / collisions pseudo | Fait (à vérifier — migration non appliquée, voir A_VERIFIER.md) | Claude | — |

## Chantier 9 — Superadmin : gestion des données
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| E1 | Suppression groupée assertions poubelle | Fait — migration `delete_assertions_admin` appliquée en base (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | — |
| E2 | Masquer qui a soumis quelle assertion | Fait — migration `hide_assertion_author` appliquée en base (rapporté 22/07, à vérifier fonctionnellement — voir A_VERIFIER.md) | Claude | — |

## Chantier 10 — Petites tâches transverses
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| C1 | Ping automatique Supabase | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| C2 | Identité visuelle / branding | Backlog | | Charte graphique (Jules) |
| C3 | Affichage documents + backend de stockage | **Remplacé par le chantier 13** — décision d'infra tranchée (site externe séparé) | Claude | — |
| C4 | Distinction vote pass/neutre + doc technique | Fait — à vérifier (voir A_VERIFIER.md) | Claude | Jules (doc pol.is) |
| D6 | Mention non-conservation des audios | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D11 | Assertions visibles pendant le débat | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D12 | Mention anonymat des votes | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D13 | Ordre aléatoire des assertions | ⚠️ Correction chantier 12 (F8) — le shuffle initial était bien là, mais les assertions approuvées après coup (cas normal en séance réelle) étaient ajoutées en fin de liste, dans le même ordre pour tout le monde | Claude | — |
| D15 | QR code lien table (modérateurs) | Fait (à vérifier — voir A_VERIFIER.md) | Claude | — |
| D16 | Pouvoir changer son vote | Fait — harmonisé chantier 12 (F9), voir A_VERIFIER.md | Claude | — |

## Chantier 11 — Petits fixes UX
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F1 | Placeholder générique "Alice Dupont" → confusion | Fait & vérifié en production | Claude | — |
| F2 | Afficher le nom des séances en cours | Déjà correct — vérifié par lecture de code, aucun changement | Claude | — |
| F3 | Tooltip vote affiché une seule fois | Fait — vérifier après un premier passage sur une séance de vote (voir A_VERIFIER.md) | Claude | — |
| F4 | Affordance case "tout sélectionner" superadmin | Fait — checkbox réelle avec état indeterminate (à vérifier — voir A_VERIFIER.md) | Claude | — |
| F5 | Bug : champ "mon nom" se vide sur l'écran de code de rappel | Fait & vérifié en production (bug reproduit puis fix confirmé) | Claude | — |
| F6 | Supprimer "inviter un ami", garder QR code via Outils | Fait — bundle déployé vérifié (à vérifier interactivement — voir A_VERIFIER.md) | Claude | — |
| F7 | Déplacer QR code modérateur dans "Outils Modo" | Fait — nouveau menu créé (à vérifier interactivement — voir A_VERIFIER.md) | Claude | — |

## Chantier 13 — Fiches d'info : 404 persistant
> Décision C3 (2026-07-23, Jules) : les fiches d'info sont hébergées sur un site externe séparé (en construction par l'équipe), pas dans Ecclesia. `doc_info_url`/`doc_summary_url` sont de simples liens externes, sans backend de stockage interne.

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F10 | 404 sur les fiches d'info d'une séance | Bug corrigé — voir détail ci-dessous et A_VERIFIER.md | Claude | C3 |

**Cause racine identifiée** : trois copies quasi-identiques d'une logique de réécriture d'URL (`normalizeUrl`/`normalizeDocUrl` dans `DocumentationButton.tsx`, `ParticipantToolsButton.tsx`, `VoteScreen.tsx`, `SuperadminScreen.tsx`) réécrivaient `doc_info_url`/`doc_summary_url` vers `https://ecclesia-cs.github.io<BASE_URL>docs/<fichier>` en supposant un stockage interne (`public/docs/*.html` commité dans ce repo). La copie de `VoteScreen.tsx` (panneau "Outils" en phase de vote) avait un `BASE_DOCS` codé en dur **sans** le segment `/Ecclesia-Animation-Moderateur/` (`https://ecclesia-cs.github.io/docs/` au lieu de `https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/docs/`) — un 404 systématique sur GitHub Pages dès qu'un participant cliquait "Fiche information"/"Résumé" pendant le vote. Confirmé avec les données réelles en base : la séance de test `🧪 Test général — parcours chantiers 1-4 / 8-10` (phase `voting`, live) a `doc_info_url = "http://localhost:5173/Ecclesia-Animation-Moderateur/docs/fiche-info-test-general.html"` — un artefact de test en local, jamais nettoyé, que seule cette logique de réécriture pouvait transformer en URL de prod (et le faisait mal dans `VoteScreen.tsx`).

**Correctif appliqué** (conforme à la décision C3 — plus de stockage interne) : suppression complète des 4 copies de réécriture d'URL. `doc_info_url`/`doc_summary_url` sont maintenant utilisés tels quels (passthrough), sans transformation. Le champ superadmin (`DocFileField`) est un simple `<input type="url">` en champ libre (au lieu du champ "docs/<fichier>" qui forçait la convention interne). `doc_collab_url` (document collaboratif, fonctionnalité distincte à base de `#collab/<code>`) n'est pas concerné et reste inchangé.

**Reste à faire par Jules** (hors portée code, nécessite le mot de passe superadmin) : mettre à jour `doc_info_url`/`doc_summary_url` de la séance de test `GENER1` (actuellement une URL localhost, cassée pour tout le monde) — soit vider le champ, soit y coller la vraie URL du site externe une fois disponible. Les fichiers `public/docs/*.html` (fiches de test committées à l'ancienne convention) sont maintenant orphelins — plus référencés par aucun code, à supprimer si Jules confirme qu'ils ne servent plus.

## Chantier 14 — Lien séance ↔ table sans admin (suite du chantier 3)
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F11 | Table créée sans administrateur non rattachée à sa séance d'origine | Bug trouvé et corrigé — voir détail ci-dessous et A_VERIFIER.md | Claude | Chantier 3 |

**Investigation (demandée explicitement avant toute correction)** : les deux seuls parcours de création de table accessibles depuis l'UI — `EntryScreen.tsx` (onglet "Créer", case "Table sans modérateur") et le bouton superadmin "+ Sans admin" (`SuperadminScreen.tsx`, dans le détail d'une séance) — passent tous les deux `session_id` à la RPC (`create_table`/`admin_create_table` respectivement) et **liaient déjà correctement la table à sa séance au niveau du code applicatif**. Vérifié empiriquement (pas seulement lu) : table créée via le vrai formulaire `EntryScreen` contre la séance de test réelle `GENER1` (phase `voting`), puis relue via l'API REST avec le token de la session anonyme du navigateur — `session_id` bien renseigné, table visible avec le bon badge "Sans animateur".

**Cause racine réelle trouvée** (pas un bug d'UI, un trou de sécurité RPC) : la RPC `create_table` avait un garde-fou `IF p_session_id IS NULL THEN RAISE EXCEPTION 'session_required'` ajouté le 2026-05-26 (migration `20260527000003_fix_tables_mandatory_session.sql`). Ce garde-fou a été **silencieusement perdu** le 2026-06-01 quand `20260618_leaderless_tables.sql` a refait un `DROP FUNCTION`/`CREATE OR REPLACE` de `create_table` pour ajouter le paramètre `p_leaderless`, sans reporter la vérification. Depuis, seul le frontend (`EntryScreen.tsx`, champ `<select required>` + `disabled` tant qu'aucune séance n'est choisie) empêche la création d'une table orpheline — en violation du principe déjà établi ailleurs dans ce projet (CLAUDE.md : « comparer les codes côté client — uniquement via `crypt()` en `SECURITY DEFINER` »), ici appliqué à l'intégrité référentielle plutôt qu'à un secret.

**Reproduction empirique** : appel RPC direct (hors UI, via `fetch` avec le token de la session anonyme active dans le navigateur — donc exactement le même chemin serveur que la fonctionnalité "table sans admin" en production) avec `p_pseudo`, `p_creation_code: ''`, `p_session_id: null`, `p_leaderless: true` → HTTP 200, table réellement créée avec `session_id: null`. Confirme que n'importe quel bug frontend futur, régression de l'UI, ou appel externe à la RPC (elle est `SECURITY DEFINER` et joignable par tout client authentifié anonyme) peut aujourd'hui produire l'exact symptôme F11 : une table "sans admin" orpheline, invisible dans `list_session_tables` d'une séance et visible uniquement dans "Tables disponibles à rattacher" du superadmin (rattachement manuel).

**Correctif appliqué** : migration `supabase/migrations/20260727_3_chantier14_create_table_session_required.sql` — restaure le garde-fou `session_required` dans `create_table`, sans autre changement de comportement (le check du code Ecclesia reste sauté pour `p_leaderless=true`, comme depuis `20260619_leaderless_no_code.sql`). **`admin_create_table` n'est volontairement pas touchée** : la création de tables sans séance y est une fonctionnalité intentionnelle et réellement utilisée (section superadmin "Tables disponibles à rattacher" → `attach_table_to_session` en différé) ; seule la voie participant (`create_table`, accessible sans mot de passe superadmin dès qu'une case "sans modérateur" existe) devait être verrouillée côté serveur.

**Migration appliquée et vérifiée par Jules** le 27/07/2026 (via son propre accès Supabase MCP) : appel direct à `create_table` avec `p_session_id: null` confirmé en échec avec l'erreur `session_required`. Aucun changement frontend nécessaire (le chemin UI testé était déjà correct) — `npx tsc -b` et `npm run build` passent sans erreur (aucune modification TypeScript dans ce chantier).

**Données de test** : une table de test a été créée via le vrai formulaire `EntryScreen` (leaderless, rattachée à `GENER1`) et une seconde directement via RPC (orpheline, pour la reproduction) — **toutes deux supprimées par moi-même** avant la fin de la session (`DELETE` REST avec le token du créateur, autorisé par la policy RLS existante sur `tables`). Aucune donnée résiduelle laissée en base.

## Chantier 12 — Ordre des assertions & changement de vote
| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F8 | Ordre aléatoire des assertions ne fonctionne pas en pratique | Bug réel trouvé et corrigé — `src/screens/VoteScreen.tsx`, insertion à position aléatoire des assertions nouvellement approuvées (Realtime + polling), au lieu d'un append en fin de liste identique pour tout le monde. **Reste à vérifier en conditions réelles multi-participants** — voir A_VERIFIER.md | Claude | D13 |
| F9 | Harmoniser les deux points d'entrée "changer son vote" | Fait — la modale "Voir toutes les assertions" affiche maintenant "icône + Changer" comme le bouton "Voter" et comme la liste "Tes votes". Aucune raison légitime trouvée pour l'ancienne asymétrie (reliquat du fragment WIP D16) | Claude | D16 |

## Chantier 16 — Résultats / clôture

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F14 | Bouton "voir les résultats" indisponible en phase `closed`, redevient accessible après avoir quitté | Bug réel trouvé et corrigé — voir détail ci-dessous et A_VERIFIER.md | Claude | — |

**Investigation** : l'hypothèse de départ (séance de test sans clustering/analyse faite → indisponibilité "normale") a été écartée après lecture de `ResultsMapScreen.tsx`/`PublicResultsScreen.tsx` : les deux gèrent déjà proprement l'absence d'analyse PCA avec un message "pas encore disponible, revenez plus tard" — ce n'est jamais le bouton lui-même qui aurait dû être affecté par ça.

**Cause racine identifiée** : le bouton "Voir les résultats"/"Voir vos résultats" (overlay "Séance terminée", affiché quand `session?.phase === 'closed'` dans `ParticipantView.tsx`/`ModeratorView.tsx`) était un simple `<a href="#session/${session.join_code}">`, rendu **depuis l'intérieur de `TableView`**, donc pendant que `App.tsx` a `phase.type === 'table'`. Or le guard de routage de `App.tsx` pour la route `#session/` est : `hash.startsWith('#session/') && phase.type !== 'table'` — il exclut explicitement ce cas (par construction, pour laisser la priorité à `TableView` quand on vient de rejoindre une table en retard, cf. commentaire "Guard: si l'utilisateur vient de rejoindre une table en retard"). Résultat : le clic sur le lien change bien `window.location.hash`, mais `App.tsx` ne réévalue jamais la route vers `SessionRouterScreen` puisque `phase.type` reste `'table'` — le bouton semble ne rien faire. En cliquant ensuite sur "← Retour au menu" (`leaveTable()`, qui déclenche `onTableEnd` → `phase: 'entry'`), le hash déjà positionné sur `#session/<code>` devient exploitable au re-render suivant, et la navigation aboutit enfin — d'où le symptôme exact rapporté : "indisponible... redevient accessible après avoir quitté puis retenté".

**Correctif appliqué** : dans `ParticipantView.tsx` et `ModeratorView.tsx`, le `<a href>` est remplacé par un `<button onClick>` qui positionne `window.location.hash` **et** appelle `leaveTable()` dans le même handler, au lieu de compter sur une navigation `<a>` pure que le guard de `App.tsx` bloque tant qu'on est encore rattaché à la table. Aucune autre occurrence du même motif (`href={\`#session/…`, `#vote/…`, `#table/…`\`}` depuis un écran rendu en `phase.type === 'table'`) trouvée ailleurs dans le code.

**Vérifié** : `npx tsc -b` et `npm run build` (worktree dédié) passent sans erreur. Mécanisme confirmé en direct dans le Browser pane (`chantier-16-dev`, port 5181, contre la vraie base Supabase) : création d'une table sans admin rattachée à la séance de test `GENER1` (phase `voting`) → `ParticipantView` s'affiche sans erreur console. Puis reproduction du bug exact du guard de routage : `window.location.hash = '#session/16E27A'` (séance de test déjà `closed`, "Retraite") pendant que la table est encore ouverte → aucune navigation (bug confirmé, page reste sur `TableView`) ; clic sur "Quitter" juste après → `PublicResultsScreen` de la séance "Retraite" s'affiche immédiatement (résolution confirmée, hash déjà positionné + `phase.type` qui change). Ce test valide le mécanisme exact utilisé par le correctif (positionner le hash + quitter la table), sans avoir eu besoin du mot de passe superadmin. **Non vérifié** : le clic réel sur le nouveau bouton "Voir les résultats"/"Voir vos résultats" affiché par l'overlay "Séance terminée" lui-même — nécessite une séance passée en phase `closed` *pendant* qu'un participant est sur `ParticipantView`/`ModeratorView` (mot de passe superadmin requis, non saisi) — voir A_VERIFIER.md.

**Effet de bord assumé** : une table sans admin réelle ("TestF14routing", code `5A3B51`) a été créée et rattachée à la séance de test `GENER1` (phase `voting`) pour ce test — table vide, sans impact sur le déroulé de la séance de test, à nettoyer par Jules si souhaité (superadmin → onglet Tables).

## Chantier 17 — Analyse des camps : E4 repensé + reporting tokens (suite du chantier 6)

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| F15 | Vue superadmin sur `staff_interest` (recrutement modérateurs futurs) | Fait — nouvelle section "🙋 Recrutement modérateurs", onglet Analyse | Claude | Chantier 6 |
| F18 | Renommer "Rapport" → "Rapport token" | Fait | Claude | — |
| F19 | Retirer l'estimation d'énergie, afficher le modèle Gemini utilisé | Fait — nécessite le redéploiement de l'Edge Function pour que le modèle s'affiche (sinon `—`) | Claude | — |
| F20 | Ajouter `thoughts_tokens` au rapport | Fait — nécessite aussi le redéploiement de l'Edge Function | Claude | — |
| F21 | Sous-comptage de tokens sur les tentatives de nommage rejetées | Bug réel trouvé et corrigé — voir détail ci-dessous | Claude | — |
| F22 | Détailler le rapport avec les 3 champs bruts Gemini | Fait | Claude | — |

**F15** : confirmé au préalable que `staff_interest` (table `questionnaire_responses`) est un champ texte libre (nom + contact si intéressé), rempli à la question "Est-ce que tu voudrais staffer chez Ecclesia ?" du questionnaire de fin de séance — **sans lien** avec `session_members.is_moderator` (modérateur pour la séance en cours, critère dur de l'algo d'allocation v2, chantier 19). Nouvelle section dans l'onglet Analyse du superadmin, réutilisant les réponses déjà chargées pour le reste de l'onglet (aucune requête supplémentaire), filtrées sur `staff_interest` non nul.

**F21 (bug corrigé)** : dans `nameSingleGroup` (`src/lib/gemini.ts`), le rejet d'un nom générique par la regex anti-"Groupe N" levait `throw new Error('generic_name')` avant que `tokens_used` ne soit retourné — ces tokens (réellement consommés côté API Gemini) n'étaient donc jamais comptabilisés dans le rapport. Corrigé avec une classe `GenericNameError` qui transporte l'objet `usage` complet de la tentative rejetée ; `groupNaming.ts` l'intercepte et additionne ces tokens à l'agrégat avant de retenter (jusqu'à 2 essais), puis de basculer sur le fallback descriptif si besoin. `recordAiUsage` se déclenche désormais dès que des tokens ont été consommés, même si les 2 tentatives échouent.

**Vérifié** : `npx tsc -b`, `npm run build`, `npm test` (41 tests allocation, non-régression) — worktree dédié `chantier-17-analyse-camps-tokens`, port 5182. Écran d'accueil et connexion superadmin vérifiés sans erreur console dans le Browser pane. Bundle de production grep'é pour confirmer la présence des nouvelles chaînes. **1 appel Gemini réel effectué** (authentification anonyme + appel direct de l'Edge Function déployée, données fictives) pour confirmer qu'un appel `name_single_group` consomme bien des tokens non nuls (720 au total sur cet essai) — valide la prémisse du bug F21 sans avoir pu forcer la reproduction exacte du rejet générique (aléatoire côté Gemini). **Edge Function `gemini-proxy` modifiée (F19/F20/F22 : `thoughtsTokenCount`, `model` dans la réponse) mais non redéployée** — aucun outil MCP Supabase disponible cette session. Aucune migration SQL nécessaire (`staff_interest` existe déjà). Voir A_VERIFIER.md pour le parcours manuel restant.

## Chantier 25 — Allocation : modérateurs en surplus/déficit, persistance, dimensionnement

Retours du test manuel de Jules sur l'algorithme d'allocation v2 (chantier 19), séance `VERIF7`.

| ID | Résumé | Statut | Contributeur | Dépend de |
|---|---|---|---|---|
| H12 | Trop de modérateurs : documenter le comportement | Fait — comportement décrit ci-dessous ; **pas de changement de spec** (à arbitrer avec Jules) | Claude | Chantier 19 |
| H13 | Relancer le calcul en changeant le nb de modérateurs ne change rien | Investigué — **conforme au §4**, pas un bug. Cause identifiée et désormais expliquée dans l'UI | Claude | Chantier 19 |
| H14 | La proposition de tables est perdue au changement d'onglet / reload | Bug réel corrigé — persistance `sessionStorage` | Claude | Chantier 19 |
| H15 | Dimensionnement des tables selon le nb d'enregistreurs | Investigué — **conforme au §5 (règle 2)**, pas un bug de l'algo ; l'objectif effectif est maintenant affiché | Claude | Chantier 19 |
| H16 | Sélection des modérateurs réellement présents | Fait — liste à cocher (inline, pas modale : écart assumé, voir A_VERIFIER.md) | Claude | H12 |
| H17 | Un modérateur en surplus n'est affecté à aucune table | **Bug réel corrigé** — placé comme participant ordinaire | Claude | Chantier 19 |
| H18 | Table fantôme apparaissant plus tard dans le cycle de séance | **Bug réel corrigé** — migration `20260727_4`, **non appliquée** | Claude | Chantier 19 |

**Méthode** : chaque symptôme a été reproduit en exécutant `runAllocation` sur des populations synthétiques *avant* toute correction. C'est ce qui a permis de séparer les trois bugs réels (H14/H17/H18) des deux comportements conformes à la spec mais non expliqués (H13/H15) — et d'éviter de « corriger » un arbitrage lexicographique voulu par la spec.

**H17 (bug réel)** : `runAllocation` ignorait purement les modérateurs d'indice ≥ `shape.moderatedCount`. Avec 4 modérateurs et 3 tables, le 4e n'apparaissait ni dans `moderator_member_ids`, ni dans `member_ids` — donc dans aucune ligne de `table_assignments`. Il est désormais assis dans la table la moins remplie, avec ses attributs réels d'onboarding (nouvelle entrée `moderatorProfiles`). **Le placement est fait après la recherche de forme, pas avant** : une première version qui réinjectait ces personnes dans la population en amont s'est révélée circulaire (asseoir quelqu'un change le nombre de tables, donc le surplus) et régressive — sur 30 participants / 4 modérateurs elle transformait `[10, 10, 10]` en 6 tables.

**H13 (pas un bug)** : `moderatedCount = min(tableCount, capacity)` sature dès que toutes les tables sont animées, et `shapePreference` préfère moins de tables à qualité égale — c'est exactement ce que demande le §4 (« préférer un nombre de tables ≤ nombre de modérateurs »). Contre-épreuve : avec 0 modérateur inscrit, faire varier « Modérateurs à ajouter » de 0 à 3 change bien le résultat à chaque incrément. Le mécanisme fonctionne, il était saturé.

**H15 (pas un bug de l'algo)** : sur 25 participants / 4 modérateurs, `recorderCount` ≤ 2 → `[10, 10, 5]` ; `= 3` → **`[10, 5, 5, 5]`**, la forme exacte décrite par Jules ; `≥ 4` → 5 tables de 5. La valeur en vigueur lors de son test était donc ≥ 3, pas 1 — avec 1 enregistreur l'algorithme produit bien la répartition qu'il dit préférer. La règle 2 étant prioritaire sur la politique de dimensionnement, c'est l'ordre lexicographique de la spec qui joue ; l'objectif effectif est désormais affiché sous le champ et expliqué par un avertissement.

**H18 (bug réel)** : `apply_allocation` réutilise les tables rattachées puis crée les manquantes, sans jamais traiter les excédentaires. Une allocation à 3 tables après un essai à 4 laissait la 4e avec son `session_id` — invisible dans l'onglet Groupes (construit depuis `table_assignments`) mais toujours retournée par `list_session_tables`. La migration détache les excédentaires **vides** (`session_id = NULL`, la table retourne dans le pool réutilisable) et signale celles où quelqu'un a déjà rejoint sans y toucher.

**Vérifié** : `npx tsc -b`, `npm run build`, `npm test` → **49/49** (les 41 tests d'allocation existants passent inchangés + 8 nouveaux). Worktree dédié `chantier-25-allocation-moderateurs`, port 5184 — app chargée, `#superadmin` rendu, **zéro erreur console**. Le module `allocation.ts` réellement servi par Vite a été exercé dans la page : sur 25 participants + 4 modérateurs, 29 personnes placées (contre 28 avant le correctif). **Non vérifié** : tout le parcours UI de `AllocationPanel` (mot de passe superadmin requis, non détenu) et la migration H18 (MCP Supabase indisponible). Voir A_VERIFIER.md.

---

## Annexe B — Reste à faire (éventuel)

> Repris de `PROJECT_STATUS.md` (items encore au statut `Backlog` à sa suppression) et de la section « Reste à faire (éventuel) » de `CLAUDE.md`, allégée au chantier 78. Aucun de ces points n'est engagé ; aucun n'est daté.

**Items encore ouverts dans `PROJECT_STATUS.md` au moment de sa suppression** (identifiants lettrés, cf. annexe A) :

| ID | Résumé | Rattaché à |
|---|---|---|
| D1 | Lecture rapide des règles à l'entrée de table | Chantier 3 |
| A2 | Bugs DND phase débat | Chantier 8 |
| A3 | Vérifier sauvegarde des notes | Chantier 8 |
| A4+D17 | Fin de séance / forçage questionnaire | Chantier 8 |
| C7 | Bug affichage prevote | Chantier 8 |
| C2 | Identité visuelle / branding | Chantier 10 — dépend d'une charte graphique (Jules) |

**Idées non rattachées à un chantier** (ex-section « Reste à faire » de `CLAUDE.md`) :

- Toast notifications
- Page 404 / table expirée élégante
- Persistance de la pause après rechargement (localStorage)
- Tests manuels complets sur mobile (iOS Safari, Android Chrome)
- Génération de QR code dans l'UI superadmin (actuellement : site externe)

Deux entrées de cette liste étaient déjà barrées comme faites, et sont conservées ici pour la trace de leur résolution — chacune ayant été traitée **autrement** que ce que l'entrée annonçait :

- ~~Phase `questionnaire` : connecter `SessionRouterScreen` + flow questionnaire participant~~ — **fait (chantier 39)**, autrement : la phase `questionnaire` a été supprimée plutôt que connectée ; `SessionRouterScreen` route désormais vers `SessionQuestionnaireForm` en phase `closed` tant que `questionnaire_responses` ne contient pas de réponse pour le membre.
- ~~Exposer les assertions clivantes (`repness`) depuis `AnalysisPanel` via callback pour les passer à `nameSingleGroup` comme `divisive_assertions`~~ — **fait (chantier 28 / H9)** autrement : `groupNaming.discriminatingAssertions()` recalcule côté client, par camp, les 3 assertions où il s'écarte le plus du reste (proxy de `repness`), sans dépendre d'un callback depuis `AnalysisPanel`.
