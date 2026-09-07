# Référence — Parcours participant, détails d'écran

> Comportements fins des écrans participant : navigation post-vote, reconquête de pseudo, modales, notes, nudges. Le cœur de `CLAUDE.md` ne garde que l'ordre des phases, la nomenclature affichée et les pollings de secours.

> ⚠️ **Ces sections décrivent l'état d'avant les chantiers 73 et 74 (06/09/2026)**, qui ont remanié en profondeur `VoteScreen.tsx`, `EntryScreen.tsx`, `ParticipantToolsButton.tsx`, `PseudoForm.tsx` et `PhaseIndicator.tsx`. Rien n'a été retiré ni réécrit ici lors du déplacement (chantier 78, purement documentaire) : **vérifier dans le code avant de s'appuyer sur un détail de cette page.**

---

### Navigation post-vote (AllocatingScreen)

- `join_table(join_code, pseudo)` → `TableResult`
- `tableStore.set({ tableId, participantId, joinCode, isModerator: false, pseudo })`
- Appel du callback `onTableJoined(tableId, participantId, false)` → `App.handleTableJoined` → `setPhase({ type:'table', ... })` + `history.replaceState` (nettoyage URL sans hashchange)
- Guard dans App.tsx : `hash.startsWith('#vote/') && phase.type !== 'table'` — dès que `phase` passe à `table`, le routing hash n'a plus priorité → TableView s'affiche sans reload
- **Compatibilité Messenger** : plus de `window.location.href` / `window.location.reload()`. Le fallback `href` reste si `onTableJoined` n'est pas fourni (usage standalone).
- **Pas d'étape intermédiaire "J'arrive"** : `TableAssignmentCard` ne prend plus de props `joined`/`onArrived` — le join et la navigation sont fusionnés en une seule action.

### Reconquête d'un pseudo pré-vote déjà pris (`PseudoForm` — chantier B3)

En phase `pre_voting`, si le pseudo saisi est déjà inscrit (perte d'identité locale — User ID instable selon navigateur), `PseudoForm` ne bloque plus avec une simple erreur : il bascule vers un écran de reconquête (onglets "C'est bien moi" / code de rappel) qui appelle `reclaim_prevoting_member` — jamais `confirm_attendance`, qui marquerait à tort `attending_in_person=true` pour un vote resté à distance. Symétrique à la reconquête déjà existante pour la phase `voting` (`VotingEntryForm`/`AttendanceConfirmScreen` + `confirm_attendance`), mais phase-safe et sans effet de bord sur la présence. Un succès saute l'écran d'affichage du code (`step === 'reclaim_code'` dans `VoteScreen`) — le code généré côté client pour la tentative en cours n'a jamais été persisté — et va directement au vote via `handlePseudoReclaimSuccess`.

---

### Nom du camp dans AllocatingScreen — **supprimé (chantier 28 / H26)**

`AllocatingScreen` cherchait dans `group_names` l'entrée dont `table_number === assignment.table_number` et la passait à `TableAssignmentCard` via une prop `groupName`. **Retiré** : `group_names` est indexé par camp d'opinion (`group_id + 1`), pas par table physique — l'affichage montrait donc le nom d'un camp arbitraire. Et sous l'allocation v2 la table mélange plusieurs camps par construction, donc aucun nom de camp ne la décrit. `TableAssignmentCard` affiche à la place une phrase expliquant que la table réunit volontairement des avis différents ; le participant découvre son propre camp sur `ResultsMapScreen` en fin de séance.

Pour afficher « ton camp » dès la phase `allocating`, il faudrait une RPC dédiée : `analysis_members` est en RLS *no-select*, le participant ne peut pas lire son `group_id`.

---

---

## UX Participant — règles importantes

### Modal d'accueil débat (`ParticipantView`)
Affiché une seule fois par table via `localStorage` (clé `debate_welcome_<tableId>`). Explique les deux files, les outils, le modérateur. Ne pas utiliser `useEffect` pour l'initialisation — lire `localStorage` directement dans `useState(() => ...)`.

### Modal intro vote (`VoteScreen`)
`showVoteIntro` mis à `true` dans `loadVoteData()` juste avant `setStep('vote')`, seulement si `localStorage['ecclesia_vote_intro_<session.id>']` est absent (chantier 11 / F3 — auparavant affiché à chaque rechargement, changement volontaire). Posé par `closeVoteIntro()` à la fermeture (croix ou bouton "Commencer →").

### Voir toutes les assertions (`VoteScreen`)
Bouton "📋 Voir toutes" visible dès qu'il y a des assertions, que le participant ait tout voté ou non. Charge `getVoteResults` à la demande. Sur l'écran "Tu as tout voté", les barres de votes collectifs sont aussi affichées inline dans la liste "Tes votes" (depuis `voteResults` déjà chargé).

### Modal Outils en phase vote (`VoteScreen`)
Bouton "Outils" dans le header (à côté de "Proposer"). Ouvre `VoteToolsPanel` : documentation (fiche info, résumé, sources collaboratives), notes (`NotesModal` avec `sessionId`). Sans dépendance à `TableContext`. Quand tout est voté, `DocNudge` apparaît entre "Proposer" et `VoteResultsSummary`. Toutes les 10 assertions votées, un nudge propose de soumettre une assertion (`showProposalNudge` + `nextNudgeAt`).

**Piège `VoteToolsPanel` + `NotesModal`** : `showNotesModal` doit être dans le parent (`step === 'vote'`), pas dans `VoteToolsPanel`. Si `NotesModal` est rendu à l'intérieur de `VoteToolsPanel`, appeler `onClose()` démonte le panneau avant que `notesOpen=true` prenne effet → modal jamais affiché. Pattern correct : `VoteToolsPanel` reçoit `onOpenNotes: () => void` en prop et l'appelle après `onClose()` ; le parent rend `{showNotesModal && <NotesModal .../>}` indépendamment.

### Notes `NotesModal` — props flexibles
`NotesModal` accepte `tableId?: string` OU `sessionId?: string` (au moins un requis). Si `sessionId` fourni → requête `eq('session_id', sessionId)` ; sinon → `eq('table_id', tableId)`. Insert : champ correspondant + l'autre à `null`. `ParticipantToolsButton` (débat) passe `sessionId={table.session_id}` quand la table est rattachée à une séance — les notes sont ainsi partagées entre vote et débat.

### Retour depuis `CollabDocScreen`
Avant de naviguer vers `#collab/<join_code>`, l'écran appelant stocke `sessionStorage.setItem('ecclesia_collab_return', '#vote/<join_code>')` (ou tout autre hash). `CollabDocScreen` lit et supprime cette clé au démarrage ; le bouton ← utilise ce hash au lieu de `''`. Générique : n'importe quel écran peut définir ce retour.

### Polling assertions + Realtime (`VoteScreen`)
Réception des nouvelles assertions via deux mécanismes :
- **Realtime** : channel `vote:<session.id>`, écoute `postgres_changes` sur `assertions` filtré par `session_id`. Nécessite `REPLICA IDENTITY FULL` sur `assertions` (migration `assertions_replica_identity_full`) — sans ça, les UPDATE (`pending → approved`) ne transmettent pas `session_id` dans le WAL et le filtre Realtime ne matche pas.
- **Polling REST 10s** : fallback via `setInterval` quand `step === 'vote'`, append des nouvelles assertions uniquement.

### Forçage questionnaire — expiration 1h (`ParticipantView`)
`forcedTimerRef` (useRef) stocke l'ID du `setTimeout`. **Ne jamais mettre le setTimeout dans un `.then()` en espérant que le `return () => clearTimeout()` remonte au useEffect** — il est ignoré. Le timer doit être posé dans le `.then()` mais stocké dans le ref, et nettoyé dans le useEffect d'annulation. Durée : `questionnaire_forced_at + 3 600 000 ms`. Quand expiré, `forced={false}` → la croix réapparaît.

### Synthèse des votes admin — enrichissement content (`SuperadminScreen`)
`get_vote_counts_admin` RPC ne retourne pas le champ `content`. Dans `loadAssertions`, après `Promise.allSettled`, construire une `Map<id, content>` depuis `assertions` et l'appliquer sur `voteResults` avant `setVoteResults`.

---

---

*Annexe de [`CLAUDE.md`](../CLAUDE.md) — extraite au chantier 78 (2026-09-07) pour alléger le fichier réinjecté au démarrage de chaque session. **Contenu déplacé tel quel, rien n'a été supprimé ni résumé.** Si une information d'ici doit redevenir un réflexe permanent, la remonter dans `CLAUDE.md` plutôt que de la dupliquer.*
