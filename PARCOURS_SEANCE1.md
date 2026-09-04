# Séance 1 — `GENER1` — pas à pas détaillé

> Complète `PARCOURS_VERIFICATION.md` (vue d'ensemble par écran). Ici : la séquence exacte à suivre pour la séance **`GENER1`** + la table autonome **`D1D2AB`**, avec libellés exacts des boutons/champs tels qu'ils sont dans le code, pour ne rien louper.

**Ce qu'il te faut sous la main** :
- 2-3 fenêtres/onglets de navigation privée différents (pour jouer plusieurs participants sans que l'app confonde les identités — chaque onglet privé a son propre `auth.uid()` anonyme).
- Ton mot de passe superadmin.
- Compter ~30-40 min pour tout dérouler sans te presser.

Coche au fur et à mesure. Si un point ne correspond pas à ce qui est décrit, note-le — c'est exactement ce que ce parcours sert à détecter.

---

## Partie 0 — Accueil, avant de rejoindre (chantier 2 / D4)

- [ ] Ouvre l'accueil (`/` sans hash). L'onglet **"Séances en cours"** doit lister "🧪 Test général — parcours chantiers 1-4 / 8-10" (et les 2 autres séances de test).
- [ ] Onglet **"Rejoindre"** → champ **"Nom Prénom"**, placeholder *"Alice Dupont"*.
- [ ] Onglet **"Créer"** → champ **"Nom Prénom (modérateur)"** ; coche "Table sans animateur" → le label passe à **"Votre nom Prénom"**.
- [ ] Onglet **"Reprendre"** → champ **"Votre nom Prénom"**.
- [ ] Ne crée aucune vraie table ici — juste vérifier les libellés. Le préremplissage (D7) se testera naturellement plus tard : dès que tu auras tapé un nom une première fois dans un onglet, reviens sur un formulaire similaire dans **le même onglet** pour voir s'il est prérempli (modifiable).

## Partie 1 — Rejoindre `GENER1` comme nouveau participant (chantiers 1, 2)

Dans un **premier onglet privé** :

- [ ] Ouvre `#vote/GENER1`.
- [ ] **Avant même de voir un champ de saisie** : la modale **"Comment se déroule la séance ?"** doit apparaître, avec la phrase *"Les 12 premières minutes sont dédiées au vote."* (D5 — le timer de 12 min est configuré sur cette séance). Ferme-la.
- [ ] Recharge la page → la modale **ne doit pas réapparaître** (mémorisée par séance en localStorage).
- [ ] Sur l'écran d'inscription : bouton flottant **"← Menu"** en haut à gauche → clique → retour à l'accueil sans erreur (C5).
- [ ] Reviens sur `#vote/GENER1`.
- [ ] Onglet **"Mon nom"** actif par défaut → vérifie le label **"Nom Prénom"**, placeholder *"Ex : Marie Dupont"*, texte d'aide *"Retiens bien ce que tu inscris ici. Tu avais voté à distance ? Entre le même nom et prénom pour récupérer tes votes."* (D4).
- [ ] Tape un nom nouveau, ex. **"Test Jules"** → **"Continuer →"**.
- [ ] → Le questionnaire d'entrée (6 questions) doit s'ouvrir automatiquement (D18).
- [ ] Question **"Consentement"** (*"Acceptes-tu que les conversations à ta table soient transcrites de manière anonyme pour produire un résumé ?"*) → vérifie la phrase juste en dessous : *"Seul le texte transcrit et anonymisé est conservé. L'enregistrement audio n'est utilisé qu'en direct pour produire cette transcription et n'est jamais sauvegardé."* (D6). Réponds Oui ou Non.
- [ ] Question **"Modération"** (*"Tiens-tu à être avec un modérateur ?"*) → vérifie qu'il n'y a que **2 boutons : "Oui" / "Non"** (pas "Pas nécessaire") (D18). Réponds.
- [ ] Termine les 4 questions restantes (taille de groupe, ouverture aux avis différents, style de participation, expérience Ecclesia).
- [ ] → Modale **"Comment fonctionne le vote ?"** doit s'afficher → vérifie le point **"🔒 Ton vote est anonyme"** (D12). Ferme-la.

## Partie 2 — Voter, tout voter, changer d'avis (chantiers 1, 10)

- [ ] Header de l'écran de vote : 3 boutons **"Quitter" / "Outils" / "✏️ Proposer"** (C5).
- [ ] Vote sur les 3 assertions approuvées (n'importe quel sens de vote).
- [ ] *(Optionnel, D13)* Dans un **2ème onglet privé**, rejoins `GENER1` avec un autre nom → compare l'ordre d'affichage des 3 assertions avec le premier onglet → doit différer.
- [ ] Une fois les 3 votées → écran **"Tu as tout voté !"** → clique une carte de la liste "Tes votes" → modale **"Changer mon vote"** doit s'ouvrir avec le badge du vote actuel affiché → choisis un vote différent → la modale se ferme, l'icône et la barre de répartition collective se mettent à jour (D16).
- [ ] Ouvre **"📋 Voir toutes les assertions"** → clique l'icône de vote d'une assertion déjà votée → la **même** modale de changement doit s'ouvrir, et "Voir toutes" se referme.
- [ ] Clique **"Outils"** → vérifie que doc / notes / résultats du vote s'affichent sans erreur.

## Partie 3 — Reclaim d'un pré-votant à distance (chantier 2 / D7, D4)

Dans un **onglet privé neuf** (jamais utilisé pour `GENER1` avant) :

- [ ] Ouvre `#vote/GENER1`.
- [ ] Onglet **"Mon nom"** → tape exactement **"Gabriel Roche"** → **"Continuer →"**.
- [ ] → Doit afficher **"Bienvenue Gabriel Roche !"** / *"Tes votes ont bien été récupérés."* (reclaim automatique : ce membre existait déjà en base comme pré-votant à distance, `attending_in_person=false`).
- [ ] *(Alternative à tester à part, dans un autre onglet neuf)* : onglet **"Mon code de rappel"** → tape **`4821`** → même résultat.
- [ ] Clique **"Continuer →"** → comme Gabriel n'a pas encore répondu au questionnaire, l'onboarding doit s'ouvrir (D18) → réponds aux 6 questions → modale vote (D12) → écran de vote.

## Partie 4 — Débat sans admin, table `D1D2AB` (chantier 3)

Cette table est **indépendante** de `GENER1` (autonome, pas rattachée à une séance) — teste-la à part.

- [ ] Rejoins `#table/D1D2AB` (ou onglet "Rejoindre" avec le code **D1D2AB**) → tape un nom, ex. **"Test Jules 2"**.
- [ ] **Avant** la modale "Bienvenue" → la modale **"Règles du débat"** doit apparaître (texte court, actuellement un **placeholder** — pas le texte définitif), un seul bouton **"J'ai lu →"** (D1). Ferme-la.
- [ ] → Modale "Bienvenue dans le débat" doit s'afficher ensuite. Ferme-la.
- [ ] Recharge la page → aucune des deux modales ne doit réapparaître.
- [ ] Vérifie le bouton **"🎙️ Devenir animateur"** dans le header (visible parce que la table est `leaderless` — deux autres participants synthétiques, "Hugo Simon" et "Ines Faucher", y sont déjà mais n'ont pas de navigateur associé, tu ne peux pas te connecter "en tant qu'eux").
- [ ] *(Optionnel)* Ouvre un **2ème onglet** sur `#table/D1D2AB`, rejoins avec un nom neuf (ex. "Test Jules 3") pour observer la table à 2 "vrais" participants en direct.
- [ ] Sur ton premier onglet ("Test Jules 2"), clique **"Devenir animateur"** → confirmation → tu dois basculer **instantanément** en vue Modérateur (D2), sans rechargement.
- [ ] Recharge ta page → tu dois **rester** modérateur (persistance localStorage).
- [ ] Si tu as ouvert le 2ème onglet avant cette étape : dans les 5-10s, le bouton "Devenir animateur" doit y **disparaître**, il reste en vue Participant classique.

## Partie 5 — Modération des assertions, superadmin (chantier 9)

- [ ] Connecte-toi sur `#superadmin`.
- [ ] Ouvre la séance **"🧪 Test général — parcours chantiers 1-4 / 8-10"**.
- [ ] Onglet Assertions → 3 sous-onglets **En attente / Approuvées / Rejetées** (`moderation_policy = closed`).
- [ ] **"En attente"** (2 assertions : *"Le numérique doit être enseigné dès la maternelle."* et *"Les écoles devraient bannir tous les smartphones, même en dehors des cours."*) → aucun pseudo visible (E2). Approuve ou rejette l'une des deux si tu veux voir l'effet côté participant.
- [ ] **"Rejetées"** (5 assertions) → aucun pseudo/auteur visible nulle part (E2).
- [ ] Coche 2-3 assertions rejetées → bouton **"🗑 Supprimer la sélection (N)"** doit apparaître → clique → confirmation → elles disparaissent (E1).
- [ ] Sur une assertion rejetée isolée restante, bouton **"🗑 Supprimer"** (ligne) → confirmation → suppression individuelle.
- [ ] Clique **"Tout sélectionner"** puis **"Tout désélectionner"** → le libellé du bouton change, la sélection se vide.
- [ ] *(Optionnel)* "+ Ajouter des assertions (animateur)" → importe un petit CSV (2-3 lignes) → bouton **"↩ Annuler l'import (N)"** apparaît → clique → confirmation → les assertions importées disparaissent. Recharge (F5) → le bouton doit avoir disparu (état non persistant, normal).

## Partie 6 — Passage en `allocating` → `debating` (chantiers 1 / D9, 5)

- [ ] Superadmin → passe `GENER1` en phase **`allocating`**, **sans** lancer le clustering pour l'instant.
- [ ] Sur l'onglet "Test Jules" (déjà voté) → recharge `#vote/GENER1` → **bannière ambre** doit expliquer que les groupes sont en formation, avec lien **"Recharge la page"** (D9).
- [ ] Superadmin → lance le clustering (**`v1` ou `v2`** — `v3`/"Allocation avancée" ne sera pas proposée ici, car l'analyse des camps n'a volontairement pas été lancée sur `GENER1` ; c'est normal, ce test-là se fait sur `CAMPS01`).
- [ ] Superadmin → onglet Tables → crée/rattache une **table physique avec animateur** (pas leaderless) au groupe où se trouve "Test Jules".
- [ ] Superadmin → passe `GENER1` en phase **`debating`**.
- [ ] Onglet "Test Jules" → `AllocatingScreen` doit maintenant afficher le code de la table (Realtime ou après reload) → clique **"Rejoindre"** → doit arriver sur la vue Participant de cette table.

## Partie 7 — En débat : assertions, QR, invite, rejoindre en retard (chantiers 4, 8, 10)

- [ ] Vue Participant/Modérateur : vérifie le bouton **"Assertions"** dans le header (D11) → affiche les 3 assertions votées et leurs résultats.
- [ ] Vérifie le bouton **"QR"** à côté du code de table (D15) → clique → QR code + lien en clair affichés.
- [ ] Vérifie **"Inviter un ami"** (D8) → clique → passe à **"Copié !"** pendant 2s → colle le presse-papier ailleurs → doit contenir `.../#table/<code_de_cette_table>`.
- [ ] Ouvre ce lien copié dans un nouvel onglet → `JoinTableScreen`, code verrouillé + champ nom → entre un nom → rejoins directement la table (sans repasser par le vote).
- [ ] **D14** : dans un onglet qui n'a **jamais** rejoint `GENER1`, ouvre `#session/GENER1` (ou `#vote/GENER1`) pendant que la séance est en `debating` → au lieu d'une impasse, un formulaire **"Débat en cours"** (code de table + nom) doit apparaître → entre le code de la table physique + un nom → doit rejoindre directement.
- [ ] ⚠️ **DnD des files d'attente (A2, chantier 8)** : le fix n'est **pas** mergé sur `main` — si tu es sur `main`, tu verras encore le bug "l'entrée déposée arrive en dernier". Ce n'est pas une régression, c'est attendu tant que la branche `chantier-8-bugs-techniques` n'est pas mergée.

## Partie 8 — Clôture et résultats

- [ ] Superadmin → passe `GENER1` en phase **`closed`**.
- [ ] Sur un onglet membre inscrit (ex. "Test Jules") → ouvre `#session/GENER1` → `ResultsMapScreen` doit s'afficher (carte, points de clivage/consensus — le rendu sera plus limité que sur `CAMPS01` car l'analyse des camps n'a pas été lancée ici, c'est volontaire).
- [ ] Bouton **"← Retour au menu"** en bas de page → retour accueil.

---

## Si tu veux recommencer

Dis-le-moi et je remets `GENER1` en phase `voting` (et je peux nettoyer les tables/table_assignments créées pendant le test), sans que tu aies à toucher au superadmin pour ça.
