# Parcours de vérification — synthèse chantiers 1 à 10

> Créé le 2026-07-22, sur `main` (`a895dc3`). Les 6 migrations (chantiers 3/5/7/9) sont appliquées et l'Edge Function `gemini-proxy` est en v9 ACTIVE — confirmé directement via MCP Supabase dans cette session. **3 séances de test ont été créées en base** (voir tableau ci-dessous) pour que tu puisses suivre ce fil sans rien avoir à créer manuellement. Organisé par écran, pas par chantier, pour que tu puisses le suivre page après page.

## Séances de test créées

| Séance | `join_code` | Phase actuelle | Contenu |
|---|---|---|---|
| 🧪 Test général | **`GENER1`** | `voting` | 7 membres (6 présentiels + 1 pré-votant à distance), 3 assertions approuvées + 2 en attente + 5 rejetées, 13 votes. + 1 table `leaderless` autonome `D1D2AB` (2 participants) |
| 🧪 Test analyse des camps | **`CAMPS01`** | `voting` | 9 membres présentiels en 3 blocs de vote nettement séparés (gauche/droite/modéré), 6 assertions approuvées, 54 votes, `moderator_pref`/`participation_style` mixtes |
| 🧪 Test fusion assertions (pub) | **`PUBFUS`** | `voting` | 5 membres, 10 assertions approuvées (les 8 exemples "publicité" de sur-fusion + 1 vraie paire de doublons stricts), 8 votes ciblés |

URL locale : `http://localhost:5173/Ecclesia-Animation-Moderateur/#vote/<join_code>` (participant) ou `#superadmin` (admin).
URL prod : `https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/#vote/<join_code>`.

**Mot de passe superadmin** : je ne le connais pas et ne peux pas le saisir (règle de sécurité) — connecte-toi toi-même sur `#superadmin`.

**⚠️ Chantier 8 (A2 — bug DnD)** : le fix existe uniquement sur la branche `chantier-8-bugs-techniques` (commit `ade30f1`), **pas encore mergé sur `main`**. Si tu testes sur `main` (localhost ou Pages), tu ne verras pas ce correctif — il faudra soit merger la branche, soit lancer un dev server dessus séparément. Les autres items du chantier 8 (A3, A4+D17, C7, B3) n'ont aucun fix — ce sont des bugs encore ouverts, pas des régressions à chercher.

---

## 1. Accueil / connexion / pseudo (`EntryScreen`)

- Ouvre l'accueil (`/` sans hash) → l'onglet "Séances en cours" doit lister les 3 séances de test ci-dessus (phase `voting`, polling 30s).
- **D4/D7 (chantier 2)** : ouvre les onglets Rejoindre/Reprendre/Créer → vérifie le label **"Nom Prénom"** (pas "pseudo") avec le texte d'aide "Retiens bien ce que tu inscris ici". Crée une table classique (avec un vrai code Ecclesia si tu l'as) → puis reviens sur un des formulaires → le nom doit être **prérempli** (D7, mémorisation locale `lastNameStore` — testable seulement en refaisant le parcours toi-même, ça ne peut pas être pré-seedé en base).
- **D15 (chantier 10)** : pas testable depuis l'accueil — voir section Débat plus bas (bouton QR dans le header modérateur).

## 2. Rejoindre `#vote/GENER1` — inscription + intro + questionnaire

- **D5 (chantier 1)** : à l'arrivée sur `#vote/GENER1`, avant même de saisir un nom, la modale "Comment se déroule la séance ?" doit apparaître, avec mention de la durée de vote (12 minutes, configuré sur cette séance). Ferme-la, recharge → elle ne doit **pas** réapparaître.
- **QuitLink (C5)** : bouton flottant "← Menu" en haut à gauche sur l'écran d'inscription → clique → retour accueil.
- Inscris-toi avec un nouveau nom (tu deviens un 8ème membre de `GENER1`).
- **D18 (chantier 2)** : le questionnaire d'entrée (onboarding, 6 questions) doit apparaître avant le vote. Vérifie la question modérateur : boutons **"Oui" / "Non"** (pas "Pas nécessaire"). Vérifie aussi la phrase **D6** sous la question 1 (consentement transcription) : "Seul le texte transcrit et anonymisé est conservé...".
- **Reclaim / pré-votant (D7, confirm_attendance)** : ouvre `#vote/GENER1` dans un **autre** navigateur/onglet privé, choisis "Reprendre mes votes" (ou équivalent confirmation présentielle), entre le nom **"Gabriel Roche"** ou son code de rappel **`4821`** → doit reclaim ce membre pré-inscrit à distance (`attending_in_person=false` → passera à `true`), puis proposer l'onboarding (il ne l'a pas encore fait).
- **D12** : modale "Comment fonctionne le vote ?" (première assertion) → vérifie le 4ème point "🔒 Ton vote est anonyme".
- **D13** : ouvre la même séance depuis 2 navigateurs différents → l'ordre des 3 assertions approuvées doit différer.

## 3. Vote (`VoteScreen`, step `vote`) — sur `GENER1`

- Header : boutons **Quitter / Outils / ✏️ Proposer** (C5). "Outils" → doc, notes, résultats.
- Vote sur les 3 assertions approuvées. Les membres **Amelie Rousseau** et **David Nguyen** ont déjà voté sur les 3 — connecte-toi (si tu peux usurper leur session côté test, sinon vote toi-même jusqu'au bout) pour atteindre l'écran "Tu as tout voté !".
- **D16 (chantier 10, revote)** : sur "Tu as tout voté !", clique une carte de "Tes votes" → modale "Changer mon vote" doit s'ouvrir avec le badge du vote actuel → change de vote → vérifie la mise à jour de la barre collective.
- **📋 Voir toutes les assertions** : doit lister les 3 approuvées avec les répartitions (Amelie/David ont voté, d'autres partiellement) — clique l'icône de vote d'une assertion déjà votée → même modale de changement doit s'ouvrir.
- **DocNudge / ProposalNudge** : après avoir tout voté, vérifie l'apparition du nudge de proposition d'assertion.
- **Bannière `allocating` / D9** : passe la séance `GENER1` en phase `allocating` depuis le superadmin **sans lancer le clustering** → recharge `#vote/GENER1` en tant que participant déjà voté → bannière ambre expliquant la formation des groupes, avec lien "Recharge la page".

## 4. Attente / allocation (`AllocatingScreen`) — sur `GENER1`

- Lance le clustering (superadmin, `run_clustering_v1`/`v2`/`v3` selon dispo — voir section 9) → passe en phase `debating` **sans** rattacher de table physique → `AllocatingScreen` doit afficher "Formation des groupes en cours…" ou "Ta table n'est pas encore créée", avec lien "Recharge la page" (D3/D9) et `QuitLink` dans le header.
- Rattache une table physique au groupe (superadmin, onglet Tables) → le code de table doit apparaître (Realtime ou reload).
- Vérifie **TableAssignmentCard** : nom du camp (si Gemini a nommé les groupes — plutôt à tester sur `CAMPS01`, voir section 9), code de table, bouton rejoindre.

## 5. Débat sans admin (`ParticipantView`) — sur la table autonome `D1D2AB` (chantiers 3)

- Rejoins `D1D2AB` (via `#table/D1D2AB` ou onglet "Rejoindre" avec le code) comme 3ème participant, aux côtés de **Hugo Simon** et **Ines Faucher** déjà présents.
- **D1** : dès l'entrée, modale "Règles du débat" (texte **placeholder**, à remplacer plus tard par le texte définitif de Jules) doit apparaître **avant** la modale "Bienvenue", un seul bouton "J'ai lu →". Recharge → aucune des deux ne doit réapparaître.
- **D2 — "Devenir animateur"** : bouton **"🎙️ Devenir animateur"** dans le header (visible seulement car la table est `leaderless`). Clique → confirmation → tu bascules instantanément en `ModeratorView`. Ouvre un 2ème onglet (Hugo ou Ines) → il doit voir le bouton disparaître dans les ~5-10s et rester en vue participant classique.
- Recharge ta page → tu dois rester modérateur (persistance `tableStore`).
- Cas d'erreur (optionnel) : 2 onglets cliquent "Devenir animateur" presque simultanément → un seul doit réussir, l'autre voit "Cette table a déjà un animateur".

## 6. Débat en phase séance — DnD, invite, rejoindre en retard (chantiers 4, 8, 10)

Une fois `GENER1` en phase `debating` avec une table rattachée à un animateur (pas leaderless) :

- **D11 (chantier 10)** : côté modérateur, bouton "Assertions" dans le header (à côté de Notes/Questionnaire) → liste des assertions votées avec résultats.
- **D15 (QR code)** : bouton "QR" dans le header modérateur, à côté du code de table → scan ou copie du lien → doit ouvrir `#table/<code>` avec le code verrouillé.
- **D8 (invite ami)** : bouton "Inviter un ami" dans le header (participant ou modérateur) → "Copié !" pendant 2s → colle ailleurs pour vérifier `.../#table/<code>`. Ouvre ce lien dans un nouvel onglet → `JoinTableScreen`, code verrouillé + nom → rejoint direct la table.
- **D14 (rejoindre en retard)** : avec un navigateur/compte qui n'a **jamais** rejoint `GENER1`, ouvre `#session/GENER1` (ou `#vote/GENER1`) pendant la phase `debating` → au lieu de l'impasse, un formulaire "Débat en cours" (code de table + nom) doit apparaître.
- **DnD des files (A2, chantier 8)** : ⚠️ **non testable sur `main`** tant que la branche `chantier-8-bugs-techniques` n'est pas mergée — le bug "l'entrée déposée arrive en dernier" existe encore sur `main`. Comportement des autres opérations DnD (drag participant→file, réordonnancement intra-file) : à tester en l'état, sans garantie de stabilité totale (B3 - collisions pseudo/instabilité user ID - reste un bug ouvert, non lié au DnD mais pouvant perturber les tests multi-onglets si tu réutilises le même navigateur pour plusieurs participants).
- **A3 (sauvegarde des notes)** : backlog, pas de fix — si tu testes les notes (`NotesModal`), c'est pour vérifier l'ampleur du bug existant, pas une régression attendue.

## 7. Fin de séance / résultats (`ResultsMapScreen`, `ModeratorView`/`ParticipantView` overlay)

- Passe `GENER1` en `closed` → en tant que membre inscrit, ouvre `#session/GENER1` → `ResultsMapScreen` : carte de groupe, "Ce qui vous caractérise", scatter, "Les autres camps", "Points de clivage/consensus" (D10 — vérifie le texte explicatif inter-camps).
- **A4+D17 (chantier 8, backlog)** : forçage du questionnaire en fin de séance / expiration 1h — bug/backlog connu, pas de fix à valider ici, juste à observer si tu veux documenter l'état actuel.
- Bouton "← Retour au menu" en bas de `ResultsMapScreen`.

## 8. Analyse des camps — sur `CAMPS01` (chantier 6, dépend du superadmin)

- Superadmin → séance `CAMPS01` → onglet Analyse → **"Analyser les camps"**. Les 9 membres sont répartis en 3 blocs de vote nettement contrastés (gauche/droite/modéré sur une thématique fiscale) → le k-means devrait dégager **3 groupes distincts** (condition historique du bug A1).
- **A1 (fallback frontend)** : après nommage, aucun camp ne doit afficher "Groupe N" — au pire un nom descriptif "Plutôt pour/contre : …".
- **A1 (Edge, gemini-proxy v9)** : vérifie si Gemini lui-même produit désormais de bons noms pour les 3 camps (labels neutres A/B/C dans le prompt) — c'est le point à valider empiriquement resté ouvert dans `A_VERIFIER.md`.
- **E3** : le nommage doit se déclencher automatiquement après "Analyser les camps" (pas besoin de passer par `allocating`).
- **C6** : bloc "🌱 Énergie estimée" dans le rapport `LLMModerationPanel` après les appels Gemini.
- **D10** : bloc "Assertions consensuelles" → l'assertion "Il est possible de concilier justice sociale et compétitivité économique." a été votée pour être largement consensuelle entre les 3 groupes — vérifie qu'elle ressort bien.
- **B1 (clustering v3)** : dans la modale de clustering, coche "Allocation avancée" (visible seulement si l'analyse est `status='done'`, donc après l'étape précédente) → lance → vérifie que les tables mélangent aussi `participation_style` (les 9 membres ont un mix egal listener/active).
- **B2/E4 (réponses modérateur)** : onglet "Réponses modérateur" → compteurs `moderator_pref` (5 oui / 4 non sur `CAMPS01`). Rattache une table sans animateur à un groupe où plusieurs veulent un modérateur → badge ambre attendu.

## 9. Fusion des assertions — sur `PUBFUS` (chantier 7, B4)

- Superadmin → séance `PUBFUS` → 🤖 Modération IA → **"Analyser les doublons"**.
- **Le point central du test** : vérifie que Gemini **ne propose plus** de fusionner les 4 paires que Jules a identifiées comme des erreurs de sur-fusion : "propagande" vs "c'est mal"/"plus grand mal du 21e siècle"/"pas bien" ; "interdite" vs "remplacer par une autre manière de s'informer" ; "générer des revenus/investissements" vs "financer des projets". Si une de ces paires ressort quand même comme proposition, le prompt (`buildMergePrompt`) doit être recalibré.
- **Contrôle positif** : la paire "La publicité devrait être davantage réglementée par la loi" / "Il faudrait que la loi encadre plus strictement la publicité" (vraie reformulation stricte) **doit** ressortir comme proposition, avec une `merged_content` éditable.
- Sur cette proposition : teste **"✨ Fusionner (formulation combinée)"** (nécessite la migration `update_assertion_content`, déjà appliquée) → le texte de l'assertion conservée doit changer. Vérifie le transfert des votes (2 votes sur chaque assertion du duo → l'assertion conservée doit finir avec les 4, sans doublon par membre).
- Sur "La publicité est de la propagande." (4 votes déjà présents) si une fusion la concerne : vérifie que le compteur de votes de l'assertion conservée reflète bien le transfert.
- **Auto-fusion périodique vs pré-clustering** : rappel de la distinction — la périodique alimente des propositions (jamais d'écriture auto), la pré-clustering reste auto-applicative mais transfère désormais les votes avant de rejeter.

---

## Points ouverts / non couverts par ce parcours (à ne pas chercher comme des régressions)

- **Chantier 8** : A2 non mergé sur `main` (branche seule) ; A3, A4+D17, C7, B3 sans fix (backlog).
- **Chantier 10** : C2 (branding), C3 (stockage docs), C4 (vote pass/neutre) — en attente d'arbitrages de Jules, volontairement hors périmètre.
- **A1 Edge** : le redéploiement gemini-proxy v9 est fait, mais l'efficacité réelle des labels neutres sur k=3+ camps n'a encore jamais été observée en conditions réelles (cette session ne peut pas piloter le superadmin authentifié) — c'est justement l'objet de la section 8 ci-dessus.
- **D1 (texte des règles)** : contenu **placeholder**, pas le texte définitif — à remplacer par Jules dans `src/lib/debateRules.ts` quand il sera prêt.
- **D2 (interprétation)** : "devenir animateur" à la demande d'un participant, comme documenté dans `A_VERIFIER.md` — si Jules avait en tête un mécanisme différent (vote collectif, désignation par le superadmin), ce chantier est à refaire.

## Note sur les données de test

Ces 3 séances ont été créées directement en base via MCP Supabase (accès confirmé disponible dans cette session). Aucune n'a de mot de passe superadmin associé — les actions superadmin (clustering, modération, nommage, phases) sont à faire toi-même depuis `#superadmin`. Si tu veux ajuster les données (plus de votants, une 4ème séance, remettre une séance à zéro), dis-le et je les modifie directement.
