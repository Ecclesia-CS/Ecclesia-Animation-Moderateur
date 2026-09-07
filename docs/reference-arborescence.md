# Référence — Arborescence commentée de `src/`

> Où vit quoi, et pourquoi. Utile pour situer un fichier sans le chercher ; ne remplace pas la lecture du fichier lui-même, qui est la seule source à jour.

---

## Architecture TypeScript

```
src/
├── lib/
│   ├── supabase.ts       Client Supabase
│   ├── types.ts          Session, Table, Participant, QueueEntry, SpeakingTurn, QuestionnaireResponse
│   │                     + SessionMember, EntryResponse, Assertion, AssertionVote, VoteResult, TableAssignment
│   │                     + ModerationPolicy, ModerationResult, MergeResult, GroupNameResult (sprint IA)
│   ├── sessions.ts       Wrappers RPC séances (verifyPassword, createSession, closeSession, attach/detach, listSessionTables, listAvailableTables, updateSessionDocs)
│   │                     + chantier 50 : listTableAssignmentsAdmin (composition des tables pour la vue Groupes)
│   ├── voting.ts         Wrappers RPC Bloc C (registerSessionMember, confirmAttendance, submitEntryResponse, submitAssertion, castVote, getVoteResults, approve/rejectAssertion, setSessionPhase, updateSessionConfig, assignTableToGroup, listAssertionsAdmin)
│   │                     + chantier 19 : loadAllocationInputs, applyAllocation, createTablesBatch, setMemberModerator, claimModeratorStatus
│   ├── allocation.ts     **Chantier 19 (G1)** — algorithme d'allocation v2, 100 % pur (aucun React/Supabase), spec `docs/chantier-5-allocation-v2-spec.md`.
│   │                     `runAllocation(input)` : 5 règles en **ordre lexicographique strict** (actifs ≥ min(⌈2/5·taille⌉,4) · ≥1 table enregistrable · hétérogénéité ≤70 %/2e camp ≥2 · anciens ≥ ⌈2/5·taille⌉ · nouveaux aux tables animées). Contraintes dures : N≤10 → table unique ; sinon 5..10, dépassement ≤20 seulement s'il améliore strictement la règle 1.
│   │                     `diagnoseAllocation(tables, members, opinionsAvailable)` : recalcul des seuils après retouche manuelle (tableau de bord en direct).
│   │                     **Ne peut jamais échouer** : dégradation par l'ordre lexicographique (règle 5 sacrifiée d'abord, règle 1 en dernier). Recherche locale **déterministe** (graine fixe `DEFAULT_SEED`) et budget d'évaluations borné. Tests : `src/lib/allocation.test.ts` (`npm test`, 49 cas).
│   │                     **Chantier 25b (H17)** : un modérateur en surplus (plus de modérateurs que de tables animées) redevient un **participant ordinaire** et entre dans la population **avant** la recherche — il est donc optimisé par les règles 1 à 5 comme n'importe qui, jamais laissé sans affectation ni casé après coup. La circularité (asseoir quelqu'un change le nombre de tables, donc le surplus) est levée par **énumération** du nombre `k` de modérateurs qui animent : on part de `k = M` et on redescend `k` au nombre de tables produit tant que `k > T`. `k` décroît strictement, la boucle termine, `k = 0` est toujours cohérent. Entrée `moderatorProfiles` = attributs réels de ces modérateurs (toujours fournie par `loadAllocationInputs`). Sorties : `seatedModeratorIds`, `animatingModerators`, `recorderTarget`.
│   ├── gemini.ts         Client Edge Function Gemini (moderateAssertions, mergeAssertions, nameIdeologicalGroups, nameSingleGroup) — jamais d'appel direct à api.google.com
│   ├── analysis.ts       PCA + k-means côté navigateur (runOpinionAnalysis, loadVotesForAnalysis, loadLatestAnalysis, saveAnalysisResult, loadResultsMap). `ResultsMapData` inclut `repness`, `group_consensus`, `all_assertions` (depuis migration `20260621`). Score repness : `(mean_vote_in_group − mean_vote_out_group) × n_votes_réels_groupe`. `loadVotesForAnalysis` accepte `attendingOnly?: boolean`.
│   ├── groupNaming.ts    Orchestration du nommage des camps (Gemini + repli descriptif). `namingGroupsFromAnalysis(members)` — **seule** façon autorisée de construire la liste à nommer (invariant : `table_number` = `group_id + 1`, cf. « Ne jamais faire »). `discriminatingAssertions()` — top 3 des assertions où un camp s'écarte du reste, envoyées en `divisive_assertions` à Gemini (chantier 28 / H9). `groupsFingerprint()` — empreinte de composition, évite de rappeler Gemini. Tests : `src/lib/groupNaming.test.ts` (12 cas).
│   ├── storage.ts        tableStore.get/set/clear (localStorage) + lastNameStore.get/set (dernier nom prénom saisi, préremplit les formulaires d'identité — D7)
│   ├── phaseLabels.ts    **Chantier 39** — nomenclature des phases côté participant (`PARTICIPANT_PHASE_STEPS`, `participantPhaseStep()`), distincte des libellés superadmin. Voir « Nomenclature des phases côté participant ».
│   └── utils.ts          formatDuration, extractErr, generateTableCSV, generateQuestionnaireCSV
├── hooks/
│   ├── useLiveMs.ts      setInterval 500ms → Date.now()
│   └── useTranscription.ts  ⚠️ LEGACY — reliquat du mode transcription *live* (WebSocket → backend temps réel). Le backend live a été supprimé le 2026-06-30 (transcription 100% offline désormais). Le hook et son bouton dans ModeratorView.tsx (l.180-599) sont morts tant qu'aucun serveur live ne tourne — à retirer ou réactiver selon décision.
├── context/TableContext.tsx  État, Realtime, Broadcast, polling, toutes les actions
├── screens/
│   ├── EntryScreen.tsx         Section "Séances en cours" (polling 30s, phases pre_voting/voting/allocating/debating) + tabs Rejoindre/Reprendre/Créer + lien Administration
│   ├── SuperadminScreen.tsx    Auth sessionStorage, liste séances, clustering, ModerationPolicyEditor, LLMModerationPanel, nommage groupes Gemini. `SessionDetail` organisé en 4 onglets (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse). Persistance séance ouverte via `sessionStorage` (clé `ecclesia_superadmin_session`). Persistance onglet actif via `sessionStorage` (clé `ecclesia_admin_tab_<session.id>`, fallback `defaultTab(phase)`). Exports CSV + toggle questionnaire dans l'accordéon "Actions post-séance" (onglet Analyse). Stats présentiels/distance dans `VotingStatsPanel`.
│   ├── SessionRouterScreen.tsx Routeur intelligent #session/<join_code> — redirige selon phase (pre_voting/voting/allocating → #vote/, debating → check member → #vote/ ou message) ; phase=closed → membre sans réponse au questionnaire post-débat → `SessionQuestionnaireForm`, sinon ResultsMapScreen (membre) ou PublicResultsScreen (visiteur) — chantier 39
│   ├── VoteScreen.tsx          Flow vote participant. En `pre_voting` : pseudo → ReclaimCodeDisplay → vote (pas d'onboarding). En `voting` : VotingEntryForm (nom prénom OU code, reclaim auto si nom déjà pris) → **onboarding (entry_responses)** → vote → AllocatingScreen. Confirmation présentielle (known_user, même appareil) via AttendanceConfirmScreen, puis onboarding si pas déjà répondu. Champs identité (nom prénom) préremplis via `lastNameStore` (D7) — voir `lib/storage.ts`.
│   ├── AllocatingScreen.tsx    Post-vote : affectation groupe, code table, nom du camp (DB via session.group_names en priorité, localStorage fallback), bouton rejoindre. Affiche VoteResultsSummary + accordéon "Voir toutes les assertions"
│   ├── ResultsMapScreen.tsx    Écran résultats post-clôture (participant inscrit). Charge en parallèle : scatter PCA (`loadResultsMap`), affectation groupe (`getMyTableAssignment`), assertions (`getVoteResults`). Affiche : carte groupe (couleur du groupe, nom+description depuis session.group_names), section "Ce qui vous caractérise" (top repness du groupe), scatter avec légende nommée, "Les autres camps" (top repness par groupe), "Points de clivage" (spread repness inter-groupes), "Points de consensus". Fallback sans analyse PCA : dissensus via consensus_score. Couleur et nom du camp du participant basés sur `selfGroupId` (cluster k-means 0-indexé depuis `data.points`) — **NE PAS** utiliser `assignment.table_number` pour la recherche du nom Gemini car `table_number` est la table physique de débat, sans correspondance garantie avec le cluster k-means. Bouton "← Retour au menu" (hash='') en bas de page — permet de rejoindre une nouvelle séance depuis cet écran.
│   ├── CollabDocScreen.tsx     Document collaboratif de sources (#collab/<join_code>)
│   ├── TableView.tsx           Routage isModerator
│   ├── ModeratorView.tsx       Vue projetable (DndContext, auto-avancement, pause). Overlay "Séance terminée" + bouton "Voir les résultats →" (#session/<join_code>) + bouton "← Retour au menu" (hash='') quand session.phase=closed
│   └── ParticipantView.tsx     Vue mobile. Overlay "Séance terminée" + bouton "Voir vos résultats →" (#session/<join_code>) + bouton "← Retour au menu" (hash='') quand session.phase=closed
└── components/
    ├── voting/
    │   ├── LLMModerationPanel.tsx    Panneau IA superadmin : modération/fusion manuelle+auto, log tokens, fusions effectuées
    │   ├── AllocationPanel.tsx       **Chantier 19** — déclenchement manuel de l'allocation v2 en phase `allocating` (§7 : rien d'automatique à l'entrée en phase). Charge les entrées, calcule en local, affiche la proposition + avertissements, puis `applyAllocation` crée les tables. Saisies optionnelles : modérateurs à ajouter, enregistreurs disponibles.
    │   │                             **Chantier 25/25b/25c** : la proposition et les saisies sont persistées en `sessionStorage` (clé `ecclesia_alloc_preview_<sessionId>`, jamais en base) — elles survivent au changement d'onglet et au rechargement (H14). Liste à cocher des modérateurs présents (H16) : **décocher est une sélection purement locale**, aucun appel réseau ni recalcul automatique. Tout est différé au clic sur « Appliquer », qui recalcule avec la sélection, crée les tables, **puis seulement en cas de succès** retire `is_moderator` aux décochés — jamais de statut perdu sans tables créées. Horodatage « calculé à HH:MM:SS » (H13) et objectif d'enregistrement effectif affiché (H15).
    │   ├── TableDiagnosticsList.tsx  **Chantier 19** — tableau de bord d'une liste de tables : composition par camp (barre colorée), 4 badges de seuil, badge enregistrable. Purement présentationnel → le parent passe des diagnostics recalculés, d'où la « mise à jour en direct » après glisser-déposer.
    │   ├── TableAssignmentCard.tsx   Carte groupe + nom camp (prop groupName) + join_code + bouton rejoindre
    │   ├── VoteResultsSummary.tsx    Résumé des votes — top 3 consensus + 2 dissensus (assertions + consensus_score)
    │   └── VoteResultsList.tsx       Liste complète de toutes les assertions approuvées, triée par consensus_score décroissant
    ├── AnalysisPanel.tsx         Scatter PCA, assertions clivantes/consensuelles. Props: groupNames?: GroupNameResult[], totalMembers?: number, sessionPhase?: string. Section Automatisation : toggle auto-analyse + slider 1-15 min (actif si phase=voting ou pre_voting). Légende scatter : nom + description du groupe (depuis groupNames). En-têtes "Assertions clivantes" : nom + description en gris sous le nom coloré. Toggle "Tous les votants / Présentiels uniquement" : recharge les votes avec `attendingOnly=true`, recalcule repness/consensus localement sans sauvegarder.
    ├── SpeakerTimer.tsx          Chrono avec offsetMs
    ├── QueuePanel.tsx            File DnD (useDroppable + SortableContext + ghostId)
    ├── ReadOnlyQueuePanel.tsx    File lecture seule (participants)
    ├── ParticipantsTable.tsx     Temps cumulés + drag handles + Exclure
    ├── ParticipantsSidebar.tsx   Liste temps réel (dark/light)
    ├── CorrectTurnModal.tsx      Historique tours
    ├── ConfirmModal.tsx          Confirmation générique
    ├── QuestionnaireModal.tsx    6 questions, 26 thèmes aléatoires, upsert RPC
    ├── QuestionnaireFab.tsx      Bouton header → QuestionnaireModal
    ├── ParticipantToolsButton.tsx Panneau Outils (débat) : documentation, résultats du vote (modal VoteResultsList, lazy-loaded, visible si table.session_id non-null), notes, questionnaire
    ├── DocumentationButton.tsx   Dropdown 3 liens ; masqué si aucune URL
    └── PhaseIndicator.tsx        **Chantier 39** — pill "Étape N · Libellé" (voir `lib/phaseLabels.ts`). Prop `floating` : pill fixe façon `QuitLink` (coin opposé) pour les écrans sans en-tête propre ; sinon rendu inline (à intégrer dans l'en-tête existant de l'écran appelant).
```

---

## TableContext — état exposé
```typescript
table, participants, queueLong, queueInteractive, speakingTurns, myParticipant, isModerator
leaveTable
grantFloor, endTurn, endTurnAsSpeaker, endTurnAndAdvance, claimFloor
addToQueue, removeFromQueue, moveQueueEntry, reorderQueueEntry, changeQueueType
correctTurn, kickParticipant
```

Realtime : 1 channel `table:<id>`, 4 `postgres_changes` + 1 broadcast `refresh` + monitoring WebSocket.

---

---

*Annexe de [`CLAUDE.md`](../CLAUDE.md) — extraite au chantier 78 (2026-09-07) pour alléger le fichier réinjecté au démarrage de chaque session. **Contenu déplacé tel quel, rien n'a été supprimé ni résumé.** Si une information d'ici doit redevenir un réflexe permanent, la remonter dans `CLAUDE.md` plutôt que de la dupliquer.*
