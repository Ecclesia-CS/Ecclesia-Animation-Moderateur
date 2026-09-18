# File d'attente des chantiers

> **Ce fichier dit ce qui reste à faire.** `docs/chantiers.md` dit ce qui a été fait. Les deux sont complémentaires, aucun ne remplace l'autre.
>
> **Pour une session à qui on demande « lance le chantier suivant »** : prends le **premier chantier de la section « À faire, dans l'ordre »** qui n'est pas marqué bloqué, exécute-le, et **mets ce fichier à jour** avant de finir — déplace l'entrée vers `docs/chantiers.md` avec son statut. Si tu n'y touches pas, la session suivante refera le même.

Dernière mise à jour : **2026-09-16**.

> **Purge du 2026-09-16** : les chantiers **79, 80, 86, 58, 89 et 88** ont été livrés et mergés entre le 07/09 et le 15/09 — ils étaient encore listés ici comme « à faire » parce que les sessions qui les ont exécutés n'ont pas mis ce fichier à jour. Leur détail est dans `docs/chantiers.md`. Le **75** a été absorbé par le **95**, le **55** par le **93**. Les chantiers **90 à 95** sont nouveaux, dictés par Jules le 2026-09-16.

---

## Prompt type à coller pour lancer un chantier

> Lis `CLAUDE.md`, puis `docs/chantiers-a-faire.md` et `docs/registre-merges-en-attente.md`.
> Prends le premier chantier non bloqué de la file, et exécute-le en respectant son périmètre de fichiers et ses contraintes.
> Avant d'écrire une RPC, vérifie dans `docs/reference-fonctions-sql.md` qu'elle n'existe pas déjà. Avant de réécrire une fonction SQL existante, compare-la à sa **définition courante en base** (`pg_get_functiondef`), jamais aux fichiers de migration — et dis-moi ce que ta migration change par rapport à l'existant avant de l'appliquer.
> Ne lance aucun serveur de dev sans me le demander : une seule session à la fois en a le droit.
> Ajoute ta recette de vérification dans `A_VERIFIER.md` (append-only, ne supprime aucune entrée), commite, pousse ta branche, et mets à jour `docs/chantiers-a-faire.md` et `docs/chantiers.md`.
> Si le périmètre te semble faux ou la demande ambiguë, dis-le au lieu de deviner.

---

## Règle SQL — révisée le 2026-09-07 par Jules

> « Pour le sql, une session peut appliquer ses migrations, et si elle supprime du travail précédent, ça devait être une exception. »

Une session de chantier **peut désormais appliquer sa propre migration**, ce qui annule la règle antérieure. Mais la garde qui avait motivé cette règle reste, parce qu'elle a servi deux fois en trois jours :

**Avant d'appliquer une migration qui réécrit une fonction existante, comparer son corps à la définition courante en base** (`pg_get_functiondef`), et non aux anciens fichiers de migration. Plusieurs fonctions ont été modifiées en base par des chantiers dont le code n'était pas encore sur `main` : repartir du fichier les efface silencieusement. Deux cas réels : le chantier 67 aurait effacé le 64, et le 70 aurait créé deux surcharges ambiguës au lieu de remplacer (`get_all_votes_for_analysis` avait déjà deux versions en base).

Et toujours : `DROP FUNCTION IF EXISTS <signature exacte>` avant tout changement de nombre d'arguments ou de type de retour ; `SET search_path = public, extensions` partout où `crypt()` peut être atteint.

---

## En cours dans une autre session — ne pas prendre

### 59 — Canaux Realtime privés (reste : la recette et le réglage dashboard)
**Sécurité.** Migration appliquée et code mergé/déployé le 2026-09-07. Ce qui reste : la recette n'a été jouée qu'avec **une seule identité sur deux onglets** (scénarios C à I non déroulés), et surtout **« Allow public access » n'a pas été désactivé** dans le dashboard Supabase (Realtime → Settings) — c'est ce réglage, et lui seul, qui ferme réellement F6.
⚠️ Ordre non négociable, rappelé ici parce que l'inverser casse toute la production d'un coup : recette complète à deux identités réelles **d'abord**, désactivation du réglage **ensuite**. Rollback d'urgence : le réactiver, effet immédiat sans redéploiement.

---

## À faire, dans l'ordre

> Les six premiers (90 à 95) ont été dictés par Jules le **2026-09-16**. Ses consignes sont citées **mot pour mot** dans chaque entrée, sous « Consigne de Jules » ; tout ce qui suit sous « Précisions » vient de l'analyse faite avec lui le même jour — vérifications faites dans le code, arbitrages qu'il a tranchés en conversation, et points qu'il a explicitement laissés ouverts. Ne pas confondre les deux registres : sa consigne fait foi, mes précisions sont un accompagnement.
>
> **Parallélisation** : 90, 93, 94 et 95 touchent des fichiers disjoints et peuvent tourner en même temps. **91 et 92 touchent tous les deux `src/lib/allocation.ts` et doivent être séquencés — 91 d'abord.**

### 91 — Allocation : seuils, plafond de table, et traitement des passifs
> ✅ **Livré et mergé sur `main` le 2026-09-16** (modèle final : passifs en public, voir [`docs/chantier-91-comparatif-allocation.md`](./chantier-91-comparatif-allocation.md)). Ne pas le reprendre ; **le 92 part de `main`**. Détail dans `docs/chantiers.md` et `A_VERIFIER.md`.

**Algorithme.** ⚠️ **À faire avant le 92** (même fichier). **Jules demande explicitement une session Opus** pour ce chantier.

> **Consigne de Jules (2026-09-16)** : « Pour l'algorithme d'allocation : Augmenter le nombre d'actifs nécessaires à une table (passer à 3/5, ce serait un meilleur chiffre par exemple). Pour les passifs, on ne va pas les prendre en compte dans les limites de personne par table. On peut également les ajouter aux tables avec modérateurs, et éviter les tables sans modérateurs. On pourrait même les mettre sur les grosses tables à modérateurs, pour qu'ils puissent observer tranquillement. Le nombre maximum de participant (actifs) à une table peut être de 14. »
>
> **Complément du même jour, en réponse à mes questions** : « oui, sur une table à 14, il faudrait au moins 8 personnes qui soient actives par exemple. Pour la 6e règle, c'est juste pour éviter de surcharger les tables sans modérateur avec des passifs, donc pourquoi pas acter cela oui. Ensuite, ce chantier peut aussi être l'ocasion de réfléchir à nouveau sur l'algo, et proposer de nouveaux éléments. Chantier à faire en Opus je pense. »

**Précisions** :
- **Le plafond à 4 de la formule actuelle doit sauter.** `activeThreshold` vaut aujourd'hui `min(⌈2/5·taille⌉, 4)` : ce `min(..., 4)` neutralise le ratio dès qu'une table dépasse 10 personnes. Passer le ratio à 3/5 sans retirer ce plafond n'aurait **aucun effet** sur les grandes tables — c'est le vrai verrou, pas le ratio.
- **Arrondi à trancher** : 3/5 de 14 = 8,4. Jules donne « au moins 8 » comme valeur de référence, ce qui correspond à un arrondi **vers le bas**. À confirmer sur les autres tailles (une table de 12 donnerait 7 en arrondi bas, 8 en arrondi haut).
- **`TABLE_MAX` passe de 12 à 14** — mais en comptant les actifs seulement (voir ci-dessous).
- **« Ne pas compter les passifs dans les limites de taille » est le gros morceau structurel**, pas un réglage. Toute la recherche de forme raisonne aujourd'hui sur une taille unique par table (`shape.sizes`), qui pilote les cinq règles. Dissocier « taille comptée = actifs » et « passifs en supplément » oblige à revoir la recherche de forme elle-même. C'est ce qui fait de ce chantier un chantier moyen et non une passe de constantes.
- **La 6e règle est actée par Jules**, avec sa finalité exacte : « éviter de surcharger les tables sans modérateur avec des passifs ». Lui donner une place explicite dans l'ordre lexicographique — sinon elle entre en concurrence silencieuse avec l'hétérogénéité (règle 3). Noter que Jules la formule comme une règle d'**évitement** (ne pas surcharger les tables sans modérateur), ce qui est plus faible que sa formulation initiale (« les mettre sur les grosses tables à modérateurs ») : la première est une contrainte négative, la seconde une optimisation positive. Trancher laquelle est implémentée.
- **Invariants du projet, non négociables** : l'algorithme ne doit **jamais** lever d'exception (une règle non satisfaisable se dégrade, elle ne bloque pas), et il doit rester **déterministe** — `Math.random()` est interdit dans ce fichier, PRNG `mulberry32` à graine fixe uniquement. Le superadmin doit pouvoir relancer le calcul et retomber sur la même répartition.
- **Jules ouvre explicitement le périmètre** : « ce chantier peut aussi être l'ocasion de réfléchir à nouveau sur l'algo, et proposer de nouveaux éléments ». Les propositions sont donc bienvenues — mais à lui soumettre avant implémentation, pas à intégrer d'office.

Périmètre : `src/lib/allocation.ts` et ses tests (49 aujourd'hui), `src/components/voting/AllocationPanel.tsx`.

### 92 — Allocation : appairage entre participants
> ✅ **Livré et mergé sur `main` le 2026-09-16** après validation de Jules : migration appliquée, parcours participant vérifié au navigateur, étapes superadmin restant à jouer (voir `A_VERIFIER.md`). Décisions par défaut retenues : réciprocité obligatoire, grappe déplacée entière au glisser-déposer, saisie libre sans autocomplétion. Ne pas le reprendre.

**Algorithme + parcours.** ⚠️ **Après le 91** (même fichier). Le plus gros des six : modèle de données + onboarding + Outils + algorithme + DnD superadmin.

> **Consigne de Jules (2026-09-16)** : « Lorsqu'on se connecte (à partir de la phase présentielle, donc également pour la phase allocation, et la phase débat), on propose une question (après ou pendant l'onboarding par exemple) de mettre un ou deux pseudos de personnes avec qui on aimerait être. Dans ce cas, l'algorithme d'allocation les considérera ensemble, soudés, et ne devra pas les séparer, et d'optimiser sachant ces apairements. Dans « outils », une des possibilité sera aussi de déclarer / changer les pseudos. Si la phase d'allocation a commencé, il faudra juste que la personne soit rattachée au pseudo. »
>
> **Complément du même jour, en réponse à mes questions** : « Oui, le fait qu'ils se citent en chaine est un problème. Personellement, je ne veux qu'imposer des groupes de 3 maximums à l'algorithme, il faut donc trouver un moyen (par exemple, obliger le fait qu'ils se citent réciproquement, ou alors avertir qu'il ne doit pas y avoir de groupes plus gros que 3 sinon pas respectés par l'algo, et trancher aléatoirement sur des grosses chaines quels sont les groupes qu'on respecte ?). Pour ce chantier, il faut aussi que le Dnd participant du superadmin, respecte ce verrouillage par groupe. Oui, on place cette règle vers le haut, au dessus de la règle de 3, et j'aurai même tendance à dire en règle 1 [...] Oui, tu comprends bien la phrase sur l'allocation. »

**Précisions** :
- **Grappes plafonnées à 3 personnes**, décision ferme de Jules. Le mécanisme est laissé ouvert par lui : réciprocité obligatoire, ou avertissement + arbitrage sur les grandes chaînes. ⚠️ S'il retient un **arbitrage aléatoire**, attention à l'invariant de déterminisme du 91 : il faut le tirer avec le PRNG à graine fixe, sinon deux clics sur « Calculer » ne donnent plus la même répartition. La réciprocité obligatoire est la seule option qui évite complètement le problème, puisqu'elle rend les chaînes impossibles par construction.
- **Placement : règle 1**, au-dessus de « assez d'actifs ». Jules penchait pour ce placement, je l'ai recommandé, il l'a retenu. Justification retenue : les grappes étant plafonnées à 3, elles mordent très peu sur les autres règles, et c'est la seule règle qui matérialise une **promesse faite explicitement au participant** — la violer se voit, alors qu'un seuil d'actifs se dégrade sans que personne ne le remarque. Les cinq règles actuelles descendent donc chacune d'un rang.
- **Interprétation de la phrase sur l'allocation commencée, confirmée par Jules** : un retardataire est simplement placé à la table de la personne qu'il a citée, sans relancer le calcul d'allocation.
- **Tension assumée avec l'hétérogénéité** : des gens qui souhaitent être ensemble sont probablement du même camp. L'appairage travaille donc mécaniquement contre la règle d'hétérogénéité, qui est la raison d'être de l'algorithme. C'est le coût accepté du placement en règle 1 — à surveiller sur des populations de test réalistes.
- **DnD superadmin** : Jules demande que le glisser-déposer de l'onglet Groupes respecte le verrouillage. Défaut proposé (non tranché, à confirmer en ouvrant la discussion) : **déplacer la grappe entière ensemble**, avec un avertissement si le déplacement casse un seuil — plutôt que de refuser le déplacement, ce qui rendrait la retouche manuelle impossible.
- **L'algorithme ne doit jamais échouer** : « ne devra pas les séparer » se traite comme les autres règles — la contrainte **dégrade** quand elle est insatisfaisable, elle ne lève pas d'exception.

Périmètre : migration (table ou colonne d'appairages), `src/components/voting/OnboardingForm.tsx`, `src/components/ParticipantToolsButton.tsx`, `src/lib/allocation.ts`, `src/lib/voting.ts`, onglet Groupes de `SuperadminScreen.tsx`.

### 93 — Identité du participant : pseudo modifiable, collisions, et preuve d'identité — ✅ FAIT le 2026-09-18 (absorbe 55, **81** et **82**)

Branche `claude/chantiers-93-81-82-analyse-6347b4`. Migration appliquée en base. Recette navigateur jouée — détail, et **ce qui reste à vérifier à la main** (régénération superadmin, purge à la clôture, bouton modérateur), dans [`A_VERIFIER.md`](../A_VERIFIER.md).

**Règle retenue, dictée par Jules le 18/09** : un code de rappel est remis à **toute** première inscription, quelle que soit la phase ; toute reconnexion exige **le pseudo ET le code** ; le code est **haché**, donc régénéré et jamais rappelé (superadmin, ou modérateur pour les participants de sa table) ; unicité du code dans la séance ; 10 échecs par couple (séance, pseudo) → 1 minute de blocage ; le pseudo est librement modifiable, et le renommage est propagé à `participants.pseudo` et `session_sources.pseudo` ; après la clôture, plus personne n'a besoin de se reconnecter — la purge du chantier 49 reste donc inchangée.

**Ce que cela règle au passage** : les sources collaboratives restent nominatives et modifiables par leur seul auteur (`user_id = auth.uid()`, déjà en place) — mais ce `user_id` ne s'obtenait jusqu'ici qu'avec un nom, connu de toute la séance. Il faut désormais le code.

**Piège à ne pas « corriger »** : les refus d'identification renvoient `{error}` au lieu de lever. Un `RAISE` annulerait la transaction, donc le compteur de tentatives avec.

### 94 — Vue modérateur : temps de parole par camp idéologique — ✅ fait, voir `docs/chantiers.md`

**Livré le 2026-09-16.** Détail complet, recette de vérification restante et seuil de 180s à valider : entrée « 94 » de [`docs/chantiers.md`](./chantiers.md) et section « Chantier 94 » de [`../A_VERIFIER.md`](../A_VERIFIER.md). Le texte d'origine du chantier est conservé ci-dessous pour mémoire.

**Parcours modérateur + confidentialité.**

> **Consigne de Jules (2026-09-16)** : « Dans la vue modérateur, mettre le temps de chacun des camps (idéologique fait par l'algo pol.is) en accessibilité pour le modérateur. Cela veut dire qu'il aura accès aux informations de qui est dans quel camps… Ce qui peut être problématique ! Pour contrer cette problématique, l'horloge des camps peut se mettre à jour toutes les 5 minutes, pour flouer l'identification. »
>
> **Complément du même jour, sur les garde-fous supplémentaires proposés** : « oui, bonne initiatives de ta part. »

**Précisions** :
- **Le rafraîchissement à 5 minutes est nécessaire mais pas suffisant** : si une seule personne a parlé pendant la fenêtre, le compteur qui bouge désigne son camp sans la moindre ambiguïté. Deux garde-fous complémentaires, **validés par Jules** : ne rien afficher tant qu'un camp n'a pas au moins **2 personnes** à la table, et n'afficher qu'après un **seuil de temps cumulé** (éviter le tout premier tour de parole, toujours identifiable quoi qu'il arrive).
- **Piège technique documenté, source d'erreur récurrente du projet** : `analysis_members.group_id` (camp d'opinion k-means, 0-indexé) n'a **aucune correspondance garantie** avec `table_assignments.table_number` (table physique, 1-indexé) — `run_clustering_v2` mélange intentionnellement les clusters. Le nom d'un camp se cherche via `group_id + 1`, **jamais** via le numéro de table.
- **Ne pas exposer la composition des camps au client.** Passer par une RPC qui renvoie des durées **déjà agrégées par camp**, jamais par une lecture qui laisserait le navigateur du modérateur reconstituer l'appartenance individuelle : sinon le floutage à 5 minutes ne protège que l'affichage, pas la donnée.
- **Contraintes de perf du projet** : dériver le compteur de `Date.now() - started_at`, jamais d'un `setInterval` qui incrémente ; `useLiveMs()` doit rester dans un composant **feuille** (pattern `SpeakerTimer`), sans quoi tout le sous-arbre se re-rend toutes les 500 ms.

Périmètre : `src/components/ModeratorView.tsx`, nouvelle RPC d'agrégation.

### 95 — Ménage des portes d'entrée : onglet « tables rattachées » + bloc du menu principal (remplace le 75)
> ✅ **Fait le 2026-09-18** (branche `claude/lancer-95-analyse-059233`, non mergée). Analyse menée puis suppression, plus la création de tables vides numérotées dans la vue Groupes et la fenêtre de changement de table côté participant. Détail dans `docs/chantiers.md` et recette dans `A_VERIFIER.md` § Chantier 95.

**Parcours + superadmin.** ⚠️ **Ce chantier remplace le chantier 75**, sur décision de Jules le 16/09 (« Oui, remplace le 75 »). Analyse d'abord, suppression ensuite — c'est explicitement ce qu'il demande.

> **Consigne de Jules (2026-09-16)** : « Dans la vue superadmin, L'onglet « table rattaché » n'a plus beaucoup d'utilité. Il conviendrait de le supprimer. Avant ça, liste les possibilité de son utilisation, et de sa vision, et s'il sert toujours au superadmin ou non. On fusionne ce chantier avec le fait d'avoir ou non le bloc dans le menu principal modérateur, créer, rejoindre, qui, selon moi, ne sert plus à rien. Faisons une analyse de cela. »
>
> **Complément du même jour, en réponse à mes questions** : « Oui, s'il y a des problèmes et des doutes quand j'ouvrira la discussion, on pourra discuter du manque de route retardataire, ou du besoin de créer une nouvelle table en séance. Les deux accordéons mentionnés sont à supprimer : les tables créés hors séance ne sont plus pertinentes aujourd'hui (à voir pourquoi le chantier 14 l'avait conservé). »

**Consigne d'origine de Jules pour le 75 (06/09), toujours valable et reprise ici intégralement** :

> « Pour la création de table, aucun pb, c'est le superadmin qui gère. Pour le fait de rejoindre une table avec uniquement le code, normalement, quand on clique sur la séance, on doit pouvoir mettre le numéro de la table en retard, donc joindre avec uniquement le numéro. Je ne vois pas de problème. Quant au fait de rejoindre la séance à partir uniquement du numéro, personne ne fait ça. »

**Précisions** :
- **Les deux accordéons sont à supprimer**, pas un seul : l'onglet Tables du superadmin en contient deux, « Tables rattachées » **et** « Tables disponibles à rattacher ». Jules a tranché pour les deux.
- **Pourquoi le chantier 14 avait conservé `admin_create_table`** (Jules demande à le savoir) : la création de tables hors séance y était décrite comme « une fonctionnalité intentionnelle et réellement utilisée », via précisément l'accordéon « Tables disponibles à rattacher » → `attach_table_to_session` en différé. La justification était donc l'**usage constaté en juillet 2026** — c'est exactement la prémisse que ce chantier réexamine. Le chantier 14 avait en revanche verrouillé côté serveur la voie *participant* (`create_table` exige une séance) : ce garde-fou-là ne doit pas sauter avec le reste.
- **Garde-fou du 75, maintenu** : vérifier **d'abord** que le chemin du retardataire existe et est atteignable en pleine phase débat (`switch_table` depuis `AllocatingScreen`, `JoinTableForm` à l'étape `ended` de `VoteScreen` — ce dernier ne reçoit pas de `sessionId`, contrairement à `SessionRouterScreen`). S'il n'existe pas, **le construire d'abord, retirer ensuite** — sinon on supprime la seule porte d'entrée d'un retardataire le jour où on en a besoin. Jules a explicitement ouvert la discussion sur ce point : « on pourra discuter du manque de route retardataire, ou du besoin de créer une nouvelle table en séance ».

Périmètre : `src/screens/SuperadminScreen.tsx` (onglet Tables, sous-accordéons `rattacheesOpen` et « Tables disponibles à rattacher »), `src/screens/EntryScreen.tsx` (onglets « Modérateur », « Rejoindre », « Créer »).

### 81 et 82 — absorbés par le 93 (2026-09-18)

**81** (se déclarer modérateur au moment de la récupération de compte) : **clos le 19/09 par décision de Jules, sans code écrit.** Le chantier 73 avait posé `ModeratorDeclareField` sur deux des trois écrans (`VotingEntryForm`, écran de confirmation de présence) ; il manque sur l'écran de reconquête de `PseudoForm` (phase distanciel). Jules : « ce n'est pas grave, il peut se déclarer pendant la séance » — la déclaration reste ouverte via les Outils (`ModeratorClaimModal`) pendant le vote et le débat. Ne pas rouvrir sans nouvelle demande.

**82** (reconnexion par pseudo après clôture) : **tranché par Jules le 18/09 — il n'y a rien à faire.** « Quand on passe la séance en closed, les gens n'ont plus besoin de se connecter. » La reconnexion couvre le distanciel jusqu'au post-débat inclus, et s'arrête à la clôture ; la purge du chantier 49 reste. Le constat d'origine de la fiche était d'ailleurs à moitié faux : `confirm_attendance` acceptait `closed` avec le **pseudo seul**, ce qui était une faille et non un manque — fermé par le 93.

### 56 — Durcissement SQL
**Sécurité.** Fermer `app_config`, figer le `search_path` des fonctions à mot de passe.
⚠️ **Peut verrouiller Jules hors de sa propre base.** À ne faire que lorsqu'il est disponible et joignable, jamais à l'approche d'une utilisation en production, jamais pendant qu'il dort.

### 87 — Revue complète des parcours utilisateurs
**Parcours.** Sujet de fond réservé par Jules. Il veut **réexpliquer lui-même** comment l'application et son flux sont censés fonctionner à chaque instant, et préfère une conversation dédiée lancée en **un prompt unique** qui attend son texte. **Ne rien analyser avant d'avoir reçu ce texte.**

---

## Bloqués — rien à faire côté code

### 85 — Sauvegardes chiffrées quotidiennes
Branche `chantier-secu-sauvegardes` prête. **Bloqué sur Jules** : créer les secrets `SUPABASE_DB_URL` et `BACKUP_PASSPHRASE` dans les réglages GitHub du dépôt. C'est le premier item de l'ordre de traitement du plan de sécurité consolidé — une base sans sauvegarde vérifiée est le risque le plus élevé du projet.

### 83 — Redéployer `gemini-proxy`
Le prompt de fusion d'assertions a été durci (typage prescription / jugement / constat) mais **n'a jamais été redéployé** : la version en ligne est l'ancienne. **Bloqué sur Jules** : demande un `supabase login`.

---

## Dette permanente, pas un chantier

**La vérification navigateur.** `A_VERIFIER.md` reste le seul fichier qui dise ce qui a réellement été vu à l'écran, dont une douzaine d'entrées **validées avant la refonte des chantiers 73/74 du 06/09 et à revalider**. Presque tout ce qui est mergé et déployé n'a eu qu'une vérification `tsc` / tests / build. « Mergé » ne veut pas dire « vérifié ». Une seule session à la fois peut lancer le serveur de dev.

**L'ordre de traitement de la sécurité** est donné par `docs/2026-09-06-plan-securite-consolide.md`, qui a relu chaque constat des anciens audits contre le code et la base. Son ordre d'origine était : sauvegardes → réserves `results_public` → test Realtime du 51 → chantier 55 → 56 → 58 → 59. **Mis à jour au 2026-09-16** — les réserves `results_public` (chantier 80), le test Realtime du 51 (chantier 86) et le chantier 58 sont **faits** ; il reste, dans l'ordre :

1. **85 — les sauvegardes**, bloqué sur Jules (deux secrets GitHub). Le plan le classe premier depuis le début : tant qu'elles n'existent pas, chaque chantier qui touche `session_members`, `tables` ou `assertions` s'exécute sans filet.
2. **59 — finir la recette et désactiver « Allow public access »** (en cours dans une autre session, voir en haut de fichier). Tant que ce réglage est actif, F6 n'est pas fermé, quel que soit le code déployé.
3. **93 — la preuve d'identité** (ex-chantier 55), qui reste l'ouverture la plus large : six fonctions distinctes transfèrent aujourd'hui un compte sur simple égalité de pseudo.
4. **56 — durcissement SQL**, uniquement en présence de Jules.

**Durcissements jamais élevés au rang de chantier**, listés au §5 du plan consolidé et toujours ouverts : A3 (pas de limitation de débit sur `check_superadmin_password`), C4 (aucune limite de longueur ni de débit sur les soumissions), C7 (`tables_update_moderator` ne restreint aucune colonne — un modérateur peut réécrire le `join_code` ou le `session_id` de sa propre table), et la suppression du second projet Supabase inactif (`fcdhbgsqzvxepzvjweod`).
