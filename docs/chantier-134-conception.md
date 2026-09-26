# Chantier 134 — Trois modes de séance : note de conception (2026-09-26)

> Proposition soumise à Jules **avant tout code**, comme le demande l'entrée du chantier dans `docs/chantiers-a-faire.md`. Rien n'est appliqué en base ni codé à ce stade.

## Ce que j'ai vérifié dans le code et en base (dev)

- **La machine à états n'existe qu'à trois endroits** : `set_session_phase` (SQL, accepte n'importe quelle phase de la liste, aucune transition contrôlée), `PHASE_SEQUENCE` dans `SuperadminScreen.tsx` (barre de phases, bouton suivant/précédent) et `PARTICIPANT_PHASE_STEPS` (`lib/phaseLabels.ts`, pour `PhaseIndicator`). Tous les écrans participant routent sur la **valeur** de `sessions.phase` (`SessionRouterScreen`, `VoteScreen`, `AllocatingScreen`…), pas sur l'enchaînement. Un mode qui **saute des phases** ne casse donc aucun écran, tant qu'il ne réutilise que des phases existantes.
- **Débat simple — presque tout existe déjà** :
  - créer une table rattachée à une séance : `admin_create_session_table` (chantier 95) ;
  - un participant qui scanne le QR en phase `debating` sans être inscrit tombe sur `debating_no_member` → bouton « Assignez-moi une table » (`assign_least_filled_table`, chantier 111, qui l'inscrit aussi en `session_members`) ou code de table ;
  - un modérateur prend la table avec le Code Ecclesia (`claim_table_as_moderator`), ou le superadmin l'assigne (`AddModeratorControl`).
- **Sondage — presque tout existe aussi** : `pre_voting` = vote à distance sans onboarding ; `post_voting` = carte des résultats/camps (`ResultsMapScreen`) + revote/nouvelles assertions (`PostVoteScreen`). L'analyse se relance depuis l'onglet Analyse, et `get_all_votes_for_analysis` prend `p_attending_only` en paramètre : **un sondage 100 % distanciel n'est pas exclu du clustering** (vérifié en base).
- **Deux verrous à lever pour le sondage** : (1) le questionnaire post-**débat** est imposé avant les résultats (`hasQuestionnaireResponse` dans `SessionRouterScreen`/`VoteScreen`) — sans objet sans débat ; (2) `VoteScreen` refuse toute nouvelle inscription hors `pre_voting`/`voting`/`allocating`.

## Proposition

### Modèle

`sessions.session_type text NOT NULL DEFAULT 'full' CHECK (session_type IN ('full','debate','poll'))`, posé à la création et **non modifiable ensuite** (changer de mode en cours de route n'a pas de sens et ouvrirait des états incohérents). Les séances existantes deviennent `full` sans rien toucher.

**Pas de nouvelle machine à états** : chaque mode est un **sous-ensemble ordonné** des phases actuelles.

| Mode | Phases | Côté participant |
|---|---|---|
| Séance complète (`full`) | inchangé | inchangé |
| Débat simple (`debate`) | `draft → debating → closed` | QR → « Assignez-moi une table » / code de table → `TableView` |
| Sondage (`poll`) | `draft → pre_voting → post_voting → closed` | vote à distance → carte des camps + revote → fin |

Une seule fonction `phaseSequenceFor(session_type)` dans `lib/phaseLabels.ts`, lue par le superadmin (barre de phases) et `PhaseIndicator` (numérotation propre à chaque mode : « 1 Vote · 2 Résultats » pour un sondage, par ex.). Côté SQL, `set_session_phase` refuse une phase hors de la séquence du mode — garde serveur, pas seulement un bouton caché.

### Superadmin

- « + Nouvelle séance » : trois cartes en tête de la modale (Séance complète / Débat simple / Sondage), et le reste du formulaire s'adapte (le débat simple masque modération des assertions et onboarding).
- `create_session` gagne `p_session_type` (DEFAULT `'full'` → l'ancien front continue de marcher). En mode débat, **la table est créée dans la même transaction** et la séance démarre directement en `debating`… ou en `draft` si tu préfères la préparer avant (question 1).
- Onglets masqués selon le mode : pas d'Analyse ni de Préparation-vote pour un débat simple, pas de Tables pour un sondage. Badge de mode dans la liste des séances.

### Découpage proposé (la consigne suggérait de scinder)

- **134a — socle + débat simple** : colonne, `create_session`, garde `set_session_phase`, séquences par mode, modale de création, onglets. Le débat simple ne touche quasiment aucun écran participant (chemin du chantier 111 déjà vérifié au navigateur).
- **134b — sondage** : levée des deux verrous ci-dessus dans `VoteScreen`/`SessionRouterScreen`, libellés `PhaseIndicator`, écran de fin.

## Questions pour Jules (mes recommandations en gras)

1. **Débat simple — démarrage** : la séance est-elle directement ouverte (`debating`) à la création, ou passe-t-elle par `draft` pour la préparer avant d'ouvrir ? → **passer par `draft`**, comme les autres modes : ça laisse le temps d'afficher le QR sans que des gens entrent trop tôt.
2. **Débat simple — nombre de tables** : une table créée d'office, et le bouton existant « créer une table vide » pour en ajouter si besoin ? → **oui**.
3. **Débat simple — fin** : questionnaire de fin de débat proposé ou non ? → **non par défaut** (il parle de camps et de résultats qui n'existent pas ici) ; simple écran « débat terminé ».
4. **Sondage — quand voir les résultats** : après bascule manuelle en phase « Résultats » (réutilise `post_voting`, écrans existants), ou déjà pendant le vote ? → **bascule manuelle** ; l'actualisation vient du revote et des nouvelles assertions, et de chaque relance d'analyse par le superadmin.
5. **Sondage — retardataires** : quelqu'un qui arrive pendant la phase Résultats peut-il encore s'inscrire et voter ? → **oui** (sinon « qui peut s'actualiser » ne vaut que pour les premiers inscrits).
6. **Sondage — `closed`** : garde-t-on la clôture qui coupe le revote et rend les résultats publics (`get_public_results`), comme aujourd'hui ? → **oui, inchangé**.

---

## Arbitrages de Jules (2026-09-26) et ce qui en découle

1. **Débat simple, démarrage** : Jules hésitait (« il n'y a pas beaucoup de choses à régler en phase 0, seule la question du modérateur »). Retenu : **la séance passe par `draft`** comme les autres — le superadmin la crée à l'avance et affiche le QR quand il veut ouvrir. Désigner le modérateur en `draft` n'a pas de sens (personne n'est encore entré) : la modération s'attribue **pendant le débat**, par trois chemins qui existaient déjà ou presque :
   - le superadmin l'assigne ou la déplace depuis l'onglet Tables (`AddModeratorControl`, glisser-déposer du chantier 123) ;
   - quelqu'un se déclare modérateur **en rejoignant** (case « Je suis le modérateur » + Code Ecclesia sur l'écran d'entrée — nouveau, `join_simple_debate`) ;
   - un participant déjà assis la prend depuis Outils → « Je suis le modérateur de cette table » (chantier 110, Code Ecclesia), ce qui permet aussi de la **déplacer** d'une personne à l'autre.
2. **Une seule table par défaut**, créée avec la séance. Le superadmin peut en ajouter et déplacer les participants avec les outils existants de l'onglet Tables.
3. **Questionnaire de fin** : oui, proposé à la clôture (forcé à la table, puis à l'entrée par le QR si pas encore répondu), puis écran « Séance terminée ».
4. **Sondage, résultats** : visibles **déjà pendant le vote** (pas de risque de polarisation ici).
5. **Sondage, retardataires** : on peut voter tant que la séance n'est pas close. À la clôture, résultats affichés et sondage **ajouté aux séances consultables** par tous.
6. **Sondage, pas de post-vote** : tout se fait dans une seule phase de vote, distancielle uniquement. Le code de rappel sert seulement à retrouver son identité en changeant d'appareil. → séquence `draft → pre_voting → closed`.

**Règle transverse** demandée par Jules : la plupart des évolutions des séances complètes doivent se transférer aux séances partielles, et chaque session doit se poser la question. Consignée dans `CLAUDE.md` § « Types de séance ».
