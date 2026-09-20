# Audit du parcours participant & modérateur — chantiers 87 / 101

**Date** : 2026-09-20 · **Branche** : `claude/ecclesia-audit-participant-509f81`
**Source de référence** : le texte de fonctionnement normal dicté par Jules le 2026-09-20 (résumé en annexe A).

> **Fusion 87 / 101 assumée.** Le chantier 87 attendait « le texte de Jules » ; ce texte est arrivé, et il couvre exactement le terrain du 101 (toutes les situations d'arrivée d'un participant ou d'un modérateur). Les deux chantiers sont donc traités **en un seul audit**, ce qui lève le chevauchement signalé dans `chantiers-a-faire.md`. Le 101 n'est pas un sous-ensemble détaché : c'est le même sujet.
>
> **Nature du document** : constat, pas correctif. Aucune ligne de code applicative n'est modifiée par ce chantier. Les corrections proposées sont listées en §4 sous forme de chantiers candidats, à arbitrer par Jules.

---

## 1. Verdict d'ensemble

La description de Jules est **globalement couverte par le code**. Sur la vingtaine de situations d'arrivée décrites ou déductibles, la grande majorité a un chemin fonctionnel, souvent construit explicitement pour ce cas (chantiers 61, 62, 67, 68, 73, 92, 93, 95). Les problèmes ne sont pas des trous béants mais des **incohérences de couverture** : la même situation est traitée sur un écran et pas sur l'écran voisin.

Trois familles de problèmes ressortent, par gravité décroissante :

| # | Problème | Gravité | Quand ça pète |
|---|---|---|---|
| **A** | **Rien ne garantit un seul écran modérateur par table.** Deux membres `is_moderator` assis à la même table voient **tous les deux** `ModeratorView`, et ont **tous les deux** l'autorité SQL. | 🔴 Élevée | Dès qu'il y a un modérateur en surplus, ou deux personnes qui se déclarent |
| **B** | **`claim_moderator_status` peut déplacer silencieusement l'affectation** de celui qui se déclare, vers une autre table que celle où il est physiquement assis → écran modérateur **sans autorité** sur sa vraie table. | 🔴 Élevée | Modérateur en retard qui se déclare depuis les Outils pendant le débat |
| **C** | Déclaration modérateur **incohérente selon l'écran** : ouverte à l'inscription en `allocating`, fermée aux déjà-inscrits sur le même écran ; absente du formulaire de secours en `debating` ; perdue dans la reconquête pré-vote. | 🟠 Moyenne | Modérateur qui arrive au mauvais moment par la mauvaise porte |

---

## 2. Relecture phase par phase

### Phase 0 — `draft` (brouillon)
✅ **Conforme.** `#session/<code>` → « Séance pas encore ouverte » (`SessionRouterScreen`, statut `not_open`), `#vote/<code>` idem (`VoteScreen`, step `not_open`), et `register_session_member` refuse côté serveur (chantier 65). Triple garde, cohérente. `EntryScreen` ne liste pas les séances `draft` : rien n'est découvrable.

### Phase 1 — `pre_voting` (vote à distance, lien WhatsApp)
✅ Inscription à distance, `attending_in_person = false`, pas d'onboarding, code de rappel affiché une seule fois (`ReclaimCodeDisplay`, chantier 93).
✅ **Déclaration modérateur possible dès le pré-vote** — demandée par Jules, présente : `ModeratorDeclareField` sur `PseudoForm`, protégée par le Code Ecclesia. L'inscription réussit même si le mot de passe est faux (l'échec est affiché sans bloquer) — bon choix.
- ⚠️ **Écart C1** : le chemin de **reconquête** du pré-vote (`PseudoForm`, nom déjà pris → nom + code) **ignore la case « Je suis modérateur »** cochée juste au-dessus. Le membre est reconnecté, mais sa déclaration est perdue **sans aucun message**. Il faut ressortir par les Outils pour la refaire.

### Phase 2 — `voting` (présentiel, 20 min avant)
✅ Nouvel arrivant : `VotingEntryForm` (nom, code vide) → code de rappel → onboarding → vote.
✅ Collision de nom : `PSEUDO_TAKEN_MESSAGE`, le code devient obligatoire (chantier 93). Conforme à « les codes privés sont distribués à chaque inscription, pour les collisions de nom et les changements d'appareil ».
✅ Changement d'appareil : nom + code sur le même formulaire.
✅ Pré-votant sur le même appareil : `AttendanceConfirmScreen` mode `known_user`, avec l'option honnête « Non, je continue à voter à distance » (chantier 67) — `attending_in_person` reste faux, donc hors allocation.
✅ **« Signaler qu'ils sont modérateurs au moment de récupérer leur compte »** — demandé par Jules, présent sur **les deux** modes de `AttendanceConfirmScreen` et sur `VotingEntryForm`, protégé par le Code Ecclesia. ✔️

### Phase 3 — `allocating` (5 min avant)
✅ **Un participant peut encore rejoindre et voter** (chantier 61) : `VotingEntryForm` est servi en `allocating`, `attending_in_person = true`, et le step `vote` n'est jamais coupé par cette phase.
✅ **Neutralité idéologique des retardataires** : un membre sans `entry_responses` ni `group_id` d'analyse arrive avec `group_id = null` dans `get_allocation_inputs` — il n'appartient à aucun camp et ne pèse pas sur la règle d'hétérogénéité. Conforme à ce que décrit Jules.
- ⚠️ **Écart C2 — le plus net de l'audit.** `AllocatingScreen` affiche, pour un membre **déjà inscrit**, un message explicite : « les groupes sont en cours de constitution et ne peuvent plus être modifiés depuis cet écran » — la déclaration modérateur y est **volontairement fermée** (chantier 95, pour ne pas remanier la répartition pendant que l'organisateur l'examine). **Mais** un modérateur qui arrive à ce moment-là et **s'inscrit** passe par `VotingEntryForm`, qui porte la case « Je suis modérateur » — et `claim_moderator_status` l'assoit immédiatement à la première table animée sans modérateur. **La même action est interdite à l'un et autorisée à l'autre, dans la même phase.**

**Réponse à la question explicite de Jules — « quels scénarios et fonctions gèrent les modérateurs qui arrivent en allocating ? »** Trois chemins coexistent aujourd'hui :

1. **`extraModerators`** (champ de `AllocationPanel`) — le superadmin annonce *n* modérateurs à venir. L'algorithme crée *n* tables animées de plus, laissées `leaderless = true` (siège d'animation vide). C'est le chemin **prévu** pour les modérateurs en retard, et il correspond exactement à ce que décrit Jules.
2. **`claim_moderator_status`** (case à cocher à l'inscription) — auto-déclaration ; assoit l'auteur à la **première** table animée sans modérateur, par numéro croissant. Aucun choix de table.
3. **`claim_table_as_moderator`** (chantiers 68 & 95, code de table + Code Ecclesia) — reprise d'une **table précise**, refusée si elle a déjà un modérateur ou si elle appartient à une autre séance. **Offerte seulement en phase `debating`**, pas en `allocating`.

### Phase 4 — `debating`
✅ Participant déjà inscrit → `AllocatingScreen` → « Accéder à la table ».
✅ **Changer de table pour rejoindre des amis** — présent, `switch_table` (chantier 48), sur la carte d'affectation, exactement là où Jules l'attend. ✔️
✅ Modérateur flaggé avant → `handleJoin` lit `member.is_moderator` → `ModeratorView`.
✅ **Modérateur en retard qui choisit sa table par son code, refusée si elle a déjà un modérateur** — demandé par Jules, présent : `claim_table_as_moderator`, via `JoinTableForm` (visiteur jamais inscrit) et via la carte d'affectation (membre déjà assigné).
- ⚠️ **Écart C3** : un membre **inscrit mais sans affectation** (inscrit pendant `allocating`, après le calcul) voit en `debating` le formulaire de secours de `TableAssignmentCard` — qui propose **uniquement** `switch_table`, **sans** la case modérateur. C'est précisément le profil du modérateur arrivé en retard : il ne peut rejoindre une table que comme simple participant, puis doit passer par les Outils (→ voir B).
- 🔴 **Problème A — plusieurs écrans modérateurs sur une même table.** `TableContext` calcule `isModerator = physicalModerator || sessionMemberIsModerator`, **par utilisateur, sans arbitrage**, et `is_table_moderator` accorde l'autorité SQL à *tout* membre `is_moderator` assis à cette table. Or l'allocation **assoit sciemment les modérateurs en surplus comme participants ordinaires** (chantier 25b) **sans retirer leur flag** : si le surplus tombe sur une table animée, **deux `ModeratorView`** pilotent la même file d'attente et le même chrono. Rien, nulle part, ne dit « un seul ». Jules pose exactement la bonne distinction : *déclaré modérateur* ≠ *fait le rôle de modérateur*. Cette distinction **n'existe pas dans le modèle de données** — il n'y a que le booléen `session_members.is_moderator`.
- 🔴 **Problème B — se déclarer modérateur depuis sa table peut vous déplacer ailleurs.** Dans `claim_moderator_status`, si l'appelant est déjà assis sur une table **non** `leaderless`, la branche `ELSE` cherche la première table animée **sans modérateur** et **réécrit son `table_assignments`** (`ON CONFLICT DO UPDATE`). Sa ligne `participants` (sa présence physique) ne bouge pas. Pour un modérateur en retard qui se déclare depuis « Outils → Me déclarer modérateur » à la table où il vient de s'asseoir : la modale affiche ✅, `ModeratorView` s'ouvre (le flag suffit à l'UI), mais `is_table_moderator` répond **faux** pour la table où il est réellement — **toutes les actions d'animation échouent, en silence RLS**. Et s'il n'existe aucune table animée sans modérateur, il reste sur place **avec** le flag → retour au cas A.

### Phase 5 — `post_voting` (fin de débat)
✅ Enchaînement conforme à la demande : questionnaire forcé → résultats → `PostVoteScreen`, dont les trois blocs sont **dans l'ordre exact dicté** (revoter ses assertions, en proposer une nouvelle, voter sur celles jamais vues — chantier 69).
✅ Plus de rejoint possible : un non-membre en `post_voting` est arrêté avec un message dédié (pas de résumé public tant que les votes peuvent bouger).
✅ Reconnexion d'un déconnecté : il repasse par `#session/<code>`, est reconnu par `user_id`, et retombe sur son questionnaire ou ses résultats.
- ⚠️ **Écart C4** : côté **modérateur**, l'overlay « La séance est terminée » de `ModeratorView` n'a **pas** la garde `!forcedQOpen` que `ParticipantView` a reçue au chantier 63. Le questionnaire forcé et l'overlay s'ouvrent au même instant, tous deux en `z-50` → le modérateur ne voit pas le questionnaire à sa table. Il le retrouve ensuite via « Voir les résultats » (donc pas de perte définitive), mais l'ordre décrit par Jules n'est pas respecté pour lui.
- ⚠️ **Écart C5** : quelqu'un qui a rejoint **uniquement** une table (`JoinTableForm`, jamais inscrit à la séance) n'a pas de ligne `session_members` → en `post_voting` il tombe sur « le débat vient de se terminer », **sans questionnaire, ni résultats, ni revote**. C'est exactement le retardataire de la phase 4 : il a débattu 1h30 et ressort sans rien.

### Phase 6 — `closed`
✅ Revote coupé (le bouton « ↻ Revoter » disparaît), `reclaim_code` purgé, résumé public ouvert aux visiteurs. « Quitter » ramène au menu principal depuis tous les écrans (`QuitLink`, boutons « Retour au menu »).

---

## 3. Deux pièges transverses, hors phase

### D1 — Perte de l'identité anonyme = perte du statut modérateur, sans recours à l'écran
Si l'`auth.uid()` anonyme est renouvelé (token expiré, navigateur in-app agressif, purge type Safari ITP), `App.tsx` restaure la table depuis `localStorage` en rappelant `join_table`, puis pose `isModerator = r.created_by === userId`. Sur toute table issue de l'allocation, `created_by` est **l'uid du superadmin** — c'est l'anti-pattern nommément interdit par `CLAUDE.md`, ici sans conséquence de sécurité mais toujours faux. La reprise par `session_members` échoue elle aussi, puisqu'elle est indexée par `user_id`, lui aussi renouvelé. **Le modérateur revient en `ParticipantView`, et rien sur cet écran ne permet de reprendre la main** (l'auto-désignation n'existe que sur table `leaderless`). Seule issue : « Quitter » → `#session/<code>` → reconquête nom + code → re-déclaration. Personne ne devinera ça un soir de débat.

### D2 — Le flag modérateur est binaire et global à la séance
Il n'existe qu'un `session_members.is_moderator` booléen, plus une ligne `table_assignments`. Il n'y a **aucune notion de « modérateur en exercice sur cette table »**. Tant que ce sera le cas, A et B sont structurels : chaque nouveau chemin (auto-déclaration, assignation superadmin, reprise par code, déplacement en glisser-déposer) devra re-vérifier l'unicité à la main, et un seul chemin oublié fera réapparaître deux écrans modérateurs.

---

## 4. Propositions — chantiers candidats

Rangés par rapport valeur/risque. Aucun n'est lancé par ce chantier.

**P1 — Un seul écran modérateur par table (répond à A, D2).** Introduire la distinction que Jules formule lui-même : *déclaré* vs *en exercice*. Option minimale, sans migration lourde : une colonne `tables.active_moderator_member_id`, posée par le premier chemin qui attribue l'animation, et exigée par `is_table_moderator` **en plus** des conditions actuelles. Les autres modérateurs assis à la table gardent leur flag (donc leurs droits ailleurs) mais voient `ParticipantView`, avec un bouton « Prendre l'animation » qui bascule explicitement. Effet de bord bienvenu : la passation de main en cours de débat devient un geste prévu au lieu d'un accident.

**P2 — `claim_moderator_status` ne doit jamais déplacer quelqu'un qui est déjà assis (répond à B).** Si l'appelant a déjà une ligne `table_assignments` sur une table **animée**, poser le flag et **s'arrêter là** (ne pas réécrire l'affectation). Le déplacement d'office n'a de sens que pour quelqu'un qui n'a aucune table. Modification SQL courte — à faire en comparant d'abord à `pg_get_functiondef` en base, comme l'exige la règle du 07/09.

**P3 — Harmoniser la déclaration modérateur sur tous les points d'entrée (répond à C1, C2, C3).** Trancher d'abord la question de principe (§5.1), puis appliquer la même réponse partout : inscription, reconquête pré-vote, confirmation de présence, écran d'allocation, formulaire de secours en débat. Aujourd'hui ces cinq écrans divergent.

**P4 — Offrir le choix de la table au modérateur en retard, dès l'allocation (répond à C2/C3, et à la question explicite de Jules).** `claim_table_as_moderator` fait déjà exactement ce que Jules décrit — « on lui demande le code de la table qu'il veut modérer, il faut qu'elle n'ait pas encore de modérateur ». Il suffit de l'exposer aussi (a) en phase `allocating` et (b) dans le formulaire de secours « pas encore de table ». Le risque de remaniement qui a motivé la fermeture du chantier 95 ne s'applique pas à ce chemin-là : il vise une table **précise et vacante**, il ne redistribue personne.

**P5 — Deux gardes de fin de séance (répond à C4, C5).** Ajouter `!forcedQOpen` à l'overlay de `ModeratorView` ; et proposer au participant « table seulement » de s'inscrire a posteriori à la séance (ou au minimum de répondre au questionnaire) plutôt que de l'arrêter net.

**P6 — Filet de secours identité (répond à D1).** Deux gestes indépendants, l'un ou l'autre suffit : supprimer le `created_by === userId` de `App.tsx` (faux par construction, il ne restaure rien), et ajouter dans les Outils participant une entrée « Je suis le modérateur de cette table » qui rejoue `claim_table_as_moderator` sur la table courante — chemin de reprise universel, utile bien au-delà de ce cas.

---

## 5. Questions qui appellent un arbitrage de Jules

1. **Modérateur arrivant en `allocating` : déclaration libre, ou passage obligé par le superadmin ?** Le texte laisse les deux ouvertes (« Ou alors, ils peuvent se déclarer dès qu'ils sont rentrés […] à trancher »). Le code fait **les deux à la fois** selon qu'on est déjà inscrit ou non — c'est la seule réponse à exclure. Recommandation : **autoriser**, mais uniquement via `claim_table_as_moderator` (table précise et vacante, aucun remaniement), et laisser `extraModerators` couvrir ceux qui ne sont pas encore arrivés.
2. **Que devient un modérateur déclaré qui n'anime pas ?** Reste-t-il compté comme modérateur (donc hors des sièges, opinion hors du mix d'hétérogénéité) ou redevient-il participant ordinaire ? Le chantier 25b répond « participant ordinaire », mais son flag reste `true`, d'où le cas A. P1 suppose une réponse ferme.
3. **Un participant arrivé pendant le débat par le seul code de table doit-il pouvoir s'inscrire à la séance a posteriori** (pour avoir questionnaire, résultats et revote) ? Aujourd'hui non — cul-de-sac assumé ou oubli, à confirmer.

---

## Annexe A — texte de référence (Jules, 2026-09-20), points vérifiables

Séance créée en brouillon, inaccessible · veille : pré-vote à distance par lien WhatsApp, codes de rappel distribués, déclaration modérateur possible dès ce moment · J-20 min : vote présentiel, onboarding, récupération de compte avec possibilité de se signaler modérateur, protégée par le mot de passe Ecclesia · J-5 min : allocation, les arrivants peuvent toujours rejoindre et voter et sont traités comme neutres idéologiquement, les modérateurs doivent toujours pouvoir entrer, le superadmin annonce un nombre de modérateurs à venir · débat : redirection vers sa table, changement de table possible pour rejoindre des amis, modérateurs flaggés en vue modérateur, modérateurs en retard assignés ou choisissant leur table par son code si elle n'a pas encore de modérateur, **un seul écran modérateur par table**, distinction entre « déclaré modérateur » et « fait le rôle » · post-vote : questionnaire de fin, puis résultats, puis revote dans l'ordre (ses assertions, nouvelle proposition, assertions jamais vues) · plus de rejoint possible une fois le débat commencé, mais la reconnexion d'un déconnecté par son pseudo doit marcher · sortie vers le menu principal.
