# File d'attente des chantiers

> **Ce fichier dit ce qui reste à faire.** `docs/chantiers.md` dit ce qui a été fait. Les deux sont complémentaires, aucun ne remplace l'autre.
>
> **Pour une session à qui on demande « lance le chantier suivant »** : prends le **premier chantier de la section « À faire, dans l'ordre »** qui n'est pas marqué bloqué, exécute-le, et **mets ce fichier à jour** avant de finir — déplace l'entrée vers `docs/chantiers.md` avec son statut. Si tu n'y touches pas, la session suivante refera le même.

Dernière mise à jour : **2026-09-21**.

## Chantiers en cours

_(aucun actuellement)_

> **Le 2026-09-26, le chantier 133 est fait et vérifié au navigateur** — le nudge « Proposer une assertion » (toutes les 10 assertions votées) ne se déclenche plus, et ne peut plus rester affiché, quand `session.assertions_locked` est actif. Un seul fichier touché, `src/screens/VoteScreen.tsx`, aucune RPC/migration. Vérifié en conditions réelles sur dev (parcours complet au clic, deux séances de test) : absent quand verrouillé, toujours présent sinon (non-régression). Voir `docs/chantiers.md` et `A_VERIFIER.md`.

> **Le 2026-09-21, le chantier 116 est fait** — « Changer mon nom » devient « Changer mon nom / code », avec un bloc « Code de rappel oublié ? » dans `RenamePseudoModal.tsx`. **Changement de périmètre découvert en cours de route** : la consigne demandait de « faire réapparaître » le code, mais depuis le chantier 93 (20260918), `session_members.reclaim_code` (texte clair) a été remplacé par `reclaim_code_hash` (bcrypt) — vérifié directement en base (`information_schema.columns`), ce que ni CLAUDE.md ni `docs/reference-modele-donnees.md` ne reflétaient encore. Un code haché ne peut littéralement pas être relu. Solution retenue : une nouvelle RPC self-service, `regenerate_reclaim_code_self(session_id)` (migration `20260921_chantier116_regenerate_reclaim_code_self.sql`, calquée sur `regenerate_reclaim_code_admin`/`_moderator` déjà existantes, ciblée sur `auth.uid()`), qui **émet un nouveau code et invalide l'ancien** — le participant doit le renoter. Vérifié en base (l'ancien code cesse de matcher, le nouveau matche) et au navigateur réel (séance de test créée puis supprimée). Voir `docs/chantiers.md` et `A_VERIFIER.md`.

> **Purge du 2026-09-16** : les chantiers **79, 80, 86, 58, 89 et 88** ont été livrés et mergés entre le 07/09 et le 15/09 — ils étaient encore listés ici comme « à faire » parce que les sessions qui les ont exécutés n'ont pas mis ce fichier à jour. Leur détail est dans `docs/chantiers.md`. Le **75** a été absorbé par le **95**, le **55** par le **93**. Les chantiers **90 à 95** sont nouveaux, dictés par Jules le 2026-09-16.
>
> **Ajout du 2026-09-19** : cinq nouveaux chantiers dictés par Jules — **97** (vue modérateur : badge actif/passif + présence à table — **fait le 19/09**, voir `docs/chantiers.md`), **98** (allocation : interdire les tables sans modérateur — **fait et vérifié au navigateur le 19/09**, voir `docs/chantiers.md`), **99** (fiches pédagogiques, bloqué sur Jules), **100** et **101** (deux diagnostics/audits, cybersécurité et flow participant — le **101** chevauchait potentiellement le **87** — **tranché le 2026-09-20 : les deux ont été fusionnés en un seul audit**, voir leurs entrées).
>
> **Ajout du 2026-09-19, en fin de journée** : le chantier **100 est fait** (audit livré), et sa suite est découpée en cinq chantiers de sécurité — **102** (refermer les helpers SQL exposés, l'essentiel du gain, ne dépend de rien), **103** (`auth.uid()` au lieu du `user_id` en paramètre), **104** (colonnes de `tables`, C7), **105** (régression du chantier 51 sur `assertions`) et **105bis** (auto-désignation de modérateur, alors bloqué sur un arbitrage de Jules — **rendu le 20/09**, voir l'entrée). Tous renvoient au diagnostic et au plan du jour.
>
> **Le 2026-09-20, le chantier 83 est fait** — redéployé via le dashboard Supabase (pas de `supabase login` nécessaire, contrairement à ce que disait l'entrée initiale). Voir `docs/chantiers.md` (chantier 57 mis à jour) et `A_VERIFIER.md`.
>
> **Le 2026-09-20 (suite), chantier 83bis fait** : le test navigateur du 83 avait montré que le quota 429 ne se déclenchait jamais (compteur en mémoire, non partagé entre instances Edge Function). Remplacé par un compteur partagé en Postgres (table `gemini_rate_limit_calls` + RPC `check_gemini_rate_limit`), migration appliquée en base. **L'Edge Function reste à redéployer via le dashboard Supabase** (comme au 83) avant que le correctif ne soit effectif en ligne — voir `A_VERIFIER.md`.
>
> **Ajout du 2026-09-20, fin de journée** : l'audit 87/101 est livré et **ses cinq arbitrages ont été tranchés par Jules le jour même**. Sa suite est découpée en sept chantiers, **106 à 112**, en fin de fichier — avec leur ordre de dépendance, qui n'est pas indicatif. Le **112** est indépendant et trivial (trois lignes), le **106** est la fondation dont dépendent les autres. ⚠️ **Le 105bis a été tranché et livré le même jour par une autre session**, avec une option que cette session-ci n'avait pas envisagée (le bouton d'auto-désignation ne désigne plus personne et renvoie vers le superadmin) — il ne « rejoint » donc pas le 106, il est **fait**. Voir son entrée et `docs/chantiers.md`.

---

## Prompt type à coller pour lancer un chantier

> Lis `CLAUDE.md`, puis `docs/chantiers-a-faire.md` et `docs/registre-merges-en-attente.md`.
> Prends le premier chantier non bloqué de la file **et absent de la section « Chantiers en cours »**, et exécute-le en respectant son périmètre de fichiers et ses contraintes.
> **Avant de coder** : ajoute une entrée dans la section « Chantiers en cours » en tête de ce fichier (numéro, branche, fichiers touchés, date).
> Avant d'écrire une RPC, vérifie dans `docs/reference-fonctions-sql.md` qu'elle n'existe pas déjà. Avant de réécrire une fonction SQL existante, compare-la à sa **définition courante en base** (`pg_get_functiondef`), jamais aux fichiers de migration — et dis-moi ce que ta migration change par rapport à l'existant avant de l'appliquer.
> Ne lance aucun serveur de dev sans me le demander : une seule session à la fois en a le droit.
> Ajoute ta recette de vérification dans `A_VERIFIER.md` (append-only, ne supprime aucune entrée), commite, pousse ta branche, et mets à jour `docs/chantiers-a-faire.md` et `docs/chantiers.md`.
> **Au merge/push sur `main`** : retire ton entrée de « Chantiers en cours » dans le même geste.
> Si le périmètre te semble faux ou la demande ambiguë, dis-le au lieu de deviner.

---

## Règle SQL — révisée le 2026-09-07 par Jules

> « Pour le sql, une session peut appliquer ses migrations, et si elle supprime du travail précédent, ça devait être une exception. »

Une session de chantier **peut désormais appliquer sa propre migration**, ce qui annule la règle antérieure. Mais la garde qui avait motivé cette règle reste, parce qu'elle a servi deux fois en trois jours :

**Avant d'appliquer une migration qui réécrit une fonction existante, comparer son corps à la définition courante en base** (`pg_get_functiondef`), et non aux anciens fichiers de migration. Plusieurs fonctions ont été modifiées en base par des chantiers dont le code n'était pas encore sur `main` : repartir du fichier les efface silencieusement. Deux cas réels : le chantier 67 aurait effacé le 64, et le 70 aurait créé deux surcharges ambiguës au lieu de remplacer (`get_all_votes_for_analysis` avait déjà deux versions en base).

Et toujours : `DROP FUNCTION IF EXISTS <signature exacte>` avant tout changement de nombre d'arguments ou de type de retour ; `SET search_path = public, extensions` partout où `crypt()` peut être atteint.

---

## Chantiers en cours — à tenir à jour par toute session qui en démarre un

> **But** : qu'une nouvelle session sache, en lisant ce seul paragraphe, quelles branches sont vivantes en ce moment et sur quels fichiers — pour éviter de démarrer un chantier qui va entrer en conflit avec un autre déjà en cours ailleurs.
>
> **Règle d'usage** : dès que tu commences un chantier, ajoute une entrée ici (numéro, branche, fichiers touchés, date de début). Dès qu'il est mergé sur `main`, retire l'entrée (le statut définitif vit dans `docs/chantiers.md` et, le temps que la branche ne soit pas mergée, dans `docs/registre-merges-en-attente.md` — cette section-ci ne parle que de « en train de tourner maintenant », pas de « en attente de merge »). Une session qui referme la sienne sans y toucher laisse une fausse alerte à la suivante — aussi grave qu'oublier de la créer.
>
> Format d'entrée :
> ```
> ### <numéro> — <titre court>
> **Branche** : <nom> · **Depuis** : <date> · **Fichiers touchés** : <liste>
> ```


Le 126 (diagnostic et nettoyage du GitHub) a été livré sur `claude/chantier-126-a39daf` le 2026-09-25 — voir `docs/chantiers.md` ; entrée retirée à la livraison.

Le 125 (accordéon « J'ai déjà un code de rappel » sur les écrans d'entrée, demande directe de Jules hors file d'attente) a été mergé sur `main` le 2026-09-22 — voir `docs/chantiers.md` ; entrée retirée à la livraison.

Le 124 (verrouiller la proposition d'assertions, superadmin only) a été mergé sur `main` le 2026-09-22 — voir `docs/chantiers.md` ; entrée retirée à la livraison.

Chantiers livrés le 2026-09-21 : le 108 (harmoniser la déclaration modérateur sur tous les points d'entrée, voir `docs/chantiers.md`), le 106 (fondation) et le 107 (`claim_moderator_status` ne déplace plus personne déjà assis, vérifié en base et au navigateur réel avec le vrai Code Ecclesia) — voir `docs/chantiers.md`. (Les chantiers 87/101 ont tourné ce jour-là sur `claude/ecclesia-audit-participant-509f81` — audit, aucun fichier de `src/` touché, donc aucun risque de conflit ; entrée retirée à la livraison.) Le 83bis (compteur de quota `gemini-proxy` partagé), le 105 et les 87/101 ont aussi été livrés le jour même — voir `docs/chantiers.md`. Le 113 (fusion des deux boutons « modérateur » du panneau Outils) a été mergé sur `main` le jour même — voir `docs/chantiers.md` ; entrée retirée à la livraison. Le 117 (vue Groupes : afficher un modérateur « physique » sans ligne `session_members`) a aussi été mergé sur `main` le jour même — voir `docs/chantiers.md` ; entrée retirée à la livraison. Le 119 (angles morts du code de rappel) a aussi tourné sur `supabase/migrations` et modifié `claim_table_as_moderator`/`sync_table_assignment` — voir l'entrée 118 ci-dessous. Le 118 (modérateur physique retiré devient un session_member flagué, branche `claude/chantier-118-ff6067`) a été livré ce même jour — voir `docs/chantiers.md` ; entrée retirée à la livraison.

---

## À faire, dans l'ordre

### 121, 122, 123 — Retours de Jules du 2026-09-22 (7 points), en 3 chantiers

> **Consigne de Jules (2026-09-22)**, citée intégralement puis découpée avec lui en conversation. **121 et 122 peuvent tourner en parallèle** — pas de conflit de fichier bloquant identifié entre eux. Ils touchent tous les deux `VoteScreen` (121 sur le bug du popup d'assertion, 122 sur l'ajout des liens docs) mais sur des zones différentes du composant : conflit peu probable, mais celui qui merge en second devra sans doute rebaser sur l'autre.
>
> ⚠️ **123 recoupe potentiellement 121** sur l'onglet Groupes du superadmin (121 y ajoute un affichage du nombre d'actifs, 123 y change la logique de DnD du modérateur et ajoute un bouton « redevenir leaderless »). **Lancer 123 après le merge de 121 sur ce fichier**, ou au moins vérifier avant de coder que 121 a fini d'y toucher.
>
> ⚠️ **123 recoupe aussi thématiquement 122** sur le sujet binôme/allocation (122 rend le binôme visible en allocating, 123 diagnostique pourquoi deux binômes ne sont parfois pas assis à la même table) — fichiers différents (`AllocatingScreen` vs `lib/allocation.ts`/`apply_allocation`), donc pas de conflit de merge, mais **123 doit lire le résultat de 122 avant de conclure** : si le binôme n'était que mal *affiché*, ce n'est pas la même cause que « pas placé à la même table ».

#### 121 — Petites corrections UI (mot de passe visible, popup assertion, actifs par table) — ✅ fait, voir `docs/chantiers.md`

> **Fait le 2026-09-22.** Détail complet (composant `PasswordInput` partagé, fix du seuil de nudge dans `loadVoteData`, badge actifs par table) et recette de vérification restante dans `docs/chantiers.md` (chantier 121) et `A_VERIFIER.md` § Chantier 121. Seul le toggle œil a été rejoué au navigateur ; le nudge assertion et le badge actifs restent à vérifier à l'écran (séance de vote à 10+ votes, allocation calculée).

**Consigne de Jules** : « Il faut qu'on puisse cliquer sur un petit symbole d'œil pour voir le code qu'on tape [mot de passe Ecclesia modérateur en prevote]. C'est plus pratique. [...] De manière générale, quand il y a un mdp à mettre, il faut un œil pour pouvoir le voir éventuellement. [...] Tous les mdp de l'app (il y en a qui sont déjà faits). [...] A chaque fois qu'on reload en vote et prevote, et qu'on a dépassé 10 votes, le message de proposition d'assertion revient. Il faudrait éviter cela [après reload uniquement — ne pas réapparaître automatiquement, mais rester accessible via un bouton]. [...] Dans l'onglet groupe du superadmin, il est absolument nécessaire d'afficher pour chaque table le nombre précis d'actifs, car c'est ce qui va déterminer les choix du superadmin. »

**Trois sous-tâches indépendantes** :
1. **Œil pour afficher/masquer le mot de passe** sur **tous** les champs mot de passe de l'app (certains l'ont déjà — les recenser d'abord, ne modifier que ceux qui ne l'ont pas). Probablement un composant `PasswordInput` partagé à généraliser plutôt que dupliqué à chaque écran.
2. **Popup "proposer une assertion" après 10 votes** : actuellement réaffiché à chaque reload en `pre_voting`/`voting` une fois le seuil dépassé. Ne doit plus réapparaître **automatiquement** après reload, mais l'utilisateur doit garder un moyen manuel de la rouvrir (bouton). Vérifier où vit l'état actuel (localStorage ? re-calcul à chaque montage du composant ?) avant de choisir la persistance.
3. **Onglet Groupes du superadmin** : afficher le nombre précis de participants **actifs** par table (pas seulement le total). Utile car c'est ce qui guide les décisions du superadmin (cf. seuils d'actifs du chantier 91).

Périmètre de fichiers (à affiner en démarrant) : composant(s) mot de passe partagés, `VoteScreen.tsx` (popup assertion), vue Groupes du superadmin.

#### 122 — Liens docs par phase + binôme visible en allocating — ✅ fait, voir `docs/chantiers.md`

> **Fait le 2026-09-22.** Détail complet (composant `DocNudge` extrait et partagé, carte "Ton binôme" dans `AllocatingScreen.tsx`, précision sur le routage réel de cet écran) et recette de vérification dans `docs/chantiers.md` (chantier 122) et `A_VERIFIER.md` § Chantier 122. Vérifié au navigateur réel de bout en bout ; seuls deux cas annexes du composant d'affichage du binôme (non réciproque, absent) restent non rejoués à l'écran.

**Consigne de Jules** : « En dessous de "profite-en pour lire le docu", il faut aussi mettre le docu biais cogni, et les arguments fallacieux. Prevote, vote, et allocation je pense en terme de phase. [Les liens] sont désormais tout le temps disponibles quand on va dans outils [ils existent déjà, il s'agit juste de les faire apparaître aussi sous "profite-en pour lire le docu" sur ces trois écrans]. [...] En allocating, il faut toujours pouvoir voir avec qui on est appairé (pour les binômes). Il est en revanche effectivement impossible de changer son choix, comme actuellement [ce point-là reste inchangé]. »

**Deux sous-tâches indépendantes** :
1. **Liens biais cognitifs + arguments fallacieux** sous "profite-en pour lire le docu", sur les écrans des phases prevote, vote et allocating. Les liens/docs existent déjà (accessibles depuis Outils) — récupérer les mêmes URLs/références, ne pas en recréer.
2. **Binôme visible en allocating** : afficher lisiblement avec qui le participant est appairé, en lecture seule (aucune interaction de changement à ajouter).

Périmètre de fichiers (à affiner en démarrant) : écrans de `pre_voting`/`voting` (là où vit déjà "profite-en pour lire le docu"), `AllocatingScreen.tsx`.

#### 123 — Diagnostic commun : binôme pas à la même table + promotion modérateur par DnD — ✅ fait, voir `docs/chantiers.md`

> **Fait et mergé le 2026-09-22.** Trois causes racines, dont la principale n'est apparue qu'à la vérification navigateur : le `DndContext` de l'onglet Groupes n'avait aucun `collisionDetection`, donc la zone « désigner un modérateur » était **inatteignable au glisser-déposer** (`rectIntersection` fait toujours gagner la carte parente sur la boîte imbriquée). Les deux autres sont SQL (`COALESCE` qui ne remplaçait jamais un animateur périmé ; aucune RPC ne nettoyait la table quittée). Migration appliquée en base, vérifié au navigateur réel **et** en base. Détail complet dans `docs/chantiers.md` (chantier 123) et `A_VERIFIER.md` § Chantier 123 — où il reste **un** point ouvert : la non-régression de l'allocation sur une population réaliste.

**Consigne de Jules** : « Un participant n'est pas mis par l'algo à la même table que celui avec qui il est affilié par le système de binôme. C'est probablement dû au fait que l'un d'eux est un modérateur d'une table, ça peut poser problème je pense. Plus tard, après recalcul de l'algo, il y a été mis, mais quand même, il faut vérifier qu'il n'y a pas de gros bugs. [Cas observé dans] ma session séance test de bout en bout, mais elle a évolué [pas de session figée à rejouer telle quelle, repartir du code]. [...] Quand je mets quelqu'un en tant que modérateur, avec mon DnD, dans une table sans modérateur, cela le met en tant que "modérateur en surplus", et pas en modérateur... je n'ai pas forcément voulu ce statut mais pourquoi pas le garder, il faut juste qu'il puisse passer en principal, et quand il n'est pas en principal, qu'il soit comme un participant normal, et n'ait pas d'écran de modérateur. [Une fois promu principal] elle doit cesser d'être leaderless. Si on peut proposer un bouton pour la refaire devenir leaderless c'est l'idéal. [...] Pour les 2 derniers points, [faire] un diag pour les erreurs qui soient semblables, afin de ne pas les retrouver dans d'autres cas. »

**Deux bugs, un diagnostic commun demandé** — les deux touchent la frontière modérateur/binôme/table, Jules veut qu'on cherche une cause structurelle partagée plutôt que deux correctifs isolés qui laisseraient la même classe de bug ailleurs :

1. **Bug binôme/table** : un binôme peut se retrouver sur deux tables différentes après allocation, probablement parce qu'un des deux membres est déjà modérateur d'une table (donc traité hors du pool normal de placement — cf. `loadAllocationInputs` qui sépare modérateurs animants et participants ordinaires, voir CLAUDE.md § Ne jamais faire). Pas de session de test figée à rejouer (« elle a évolué ») — repartir de la logique d'appairage (`lib/allocation.ts`, chantier 92) et de son interaction avec le traitement des modérateurs (chantier 91).
2. **DnD superadmin → désignation modérateur** : aujourd'hui, glisser quelqu'un comme modérateur sur une table `leaderless` le met en « modérateur en surplus » plutôt qu'en modérateur principal de cette table précise. Comportement voulu : si la table n'a **aucun** modérateur, le DnD doit désigner un vrai principal et faire sortir la table de `leaderless` (comme les 3 chemins déjà décrits dans `docs/reference-tables-leaderless.md`, chantier 64 — celui-ci en devient un 4e). Le statut « en surplus » est conservé comme état possible (modérateur sans table à animer), mais doit rester **promouvable** en principal, et **tant qu'il n'est pas principal, la personne doit avoir l'écran participant normal, jamais l'écran modérateur.**
3. **Nouveau bouton** : proposer de faire redemander à une table modérée de redevenir `leaderless` (symétrique du chemin d'entrée).

**Diagnostic demandé avant tout correctif** : identifier si ces deux bugs partagent une racine commune (ex. un endroit du code qui traite modérateur et binôme comme des cas à part, de façon incohérente entre `lib/allocation.ts` et le DnD superadmin) — et si oui, documenter les autres endroits qui pourraient être touchés par la même classe d'erreur, pour éviter qu'elle ne réapparaisse ailleurs. Consigner ce diagnostic (même bref) dans l'entrée `docs/chantiers.md` du chantier avant de coder le correctif.

**Garde-fou** : lire `docs/reference-tables-leaderless.md` en entier avant de toucher à `tables.leaderless` (déjà source d'erreurs répétées), et relire le § « Ne jamais faire » de `CLAUDE.md` sur `is_table_moderator`/`created_by`/`table_assignments`.

Périmètre de fichiers (à affiner en démarrant) : `src/lib/allocation.ts`, RPC d'allocation (`apply_allocation`), DnD du superadmin (vue Tables/Groupes), `set_member_moderator`/`assign_moderator_to_table`, `tables.leaderless`.

---

### 126 à 135 — Retours de Jules du 2026-09-25 (10 points), en 10 chantiers

> **Consigne de Jules (2026-09-25)**, citée intégralement puis découpée avec lui en conversation. Demande explicite de rediviser en chantiers plus petits que la première proposition (initialement 4 chantiers plus gros) — d'où 10 entrées indépendantes plutôt que 4.
>
> **Croisements de fichiers signalés par Jules à surveiller** :
> - ⚠️ **128 et 130** touchent tous les deux la vue superadmin Groupes/Tables (`SuperadminScreen.tsx` et sous-composants) — zone déjà chargée par les chantiers 121/123. Se prévenir mutuellement des zones touchées avant de coder, ou séquencer.
> - ⚠️ **131 et 132** touchent tous les deux `ParticipantView`/`ModeratorView` et la couche Realtime par table — zones a priori différentes (file d'attente vs nouveau panneau de vote) mais même fichier racine ; prudence au merge, rebase probable pour le second.
> - ⚠️ **134** a un impact potentiel large sur le flux de phases Bloc C (création de séance, état des phases) — à lancer seul, pas en parallèle d'un autre chantier touchant ce flux.
> - **135 dépend de 134** — ne pas lancer avant que 134 soit tranché et si possible mergé, la conception de 134 conditionne directement le périmètre de 135.

#### 126 — Diagnostic et nettoyage du GitHub — ✅ fait, voir `docs/chantiers.md`

**Consigne de Jules** : « Mission prio : nettoyage du Github. Beaucoup de document sont apparemment en doubles, certains sont pt obsolète, etc., l'objectif de cette discussion est de faire un diagnostic de l'état du github. » Précisé en conversation : scope libre (pas limité à `docs/`, peut couvrir `src/`, migrations, branches non mergées) ; **droit de supprimer directement les doublons évidents**, pas besoin d'attendre une validation — « le rapport est plus pour que la discussion en elle-même nettoie ».

Périmètre : tout le dépôt. Croiser avec `docs/registre-merges-en-attente.md` (branches volontairement retenues, ne pas les traiter comme des oublis) avant de supprimer quoi que ce soit lié à une branche.

#### 127 — Bug : reset vers `allocating` laisse des participants bloqués sur leur ancienne table — ✅ fait, voir `docs/chantiers.md`

> **Fait le 2026-09-25, entièrement vérifié au navigateur réel par la session.** Cause réelle : `App.tsx` restaurait une table depuis `tableStore` sans revérifier la phase de la séance. Détail complet et recette de vérification dans `docs/chantiers.md` (chantier 127). Point resté ouvert (non demandé par la consigne) : pas de détection en direct pour un participant déjà affiché dans `TableView` au moment précis du reset, sans reload.

#### 128 — Bug : modérateur affiché en double sur une même table (vue superadmin) — ✅ fait, voir `docs/chantiers.md`

Périmètre de fichiers (à affiner en démarrant) : vue Groupes/Tables du superadmin (`SuperadminScreen.tsx` et sous-composants), `list_table_assignments_admin`.

#### 129 — Bug : identité inter-séances, questionnaire de l'ancienne séance au lieu de l'écran d'identification de la nouvelle — ✅ fait, voir `docs/chantiers.md`

> **Fait le 2026-09-25.** Cause réelle différente de la piste envisagée ci-dessous : `hasQuestionnaireResponse` et les clés localStorage de `VoteScreen.tsx`/`SessionRouterScreen.tsx` sont toutes déjà correctement scopées par `session_id` — pas le bug. Le vrai coupable est `tableStore` (`src/lib/storage.ts`), une clé globale à l'appareil (jamais scopée par séance), restaurée sans condition par `App.tsx.init()` avant même de regarder le hash de navigation — un lien `#session/<nouveau_code>` fraîchement scanné se faisait donc silencieusement écraser par l'ancienne table. Détail complet, correctif et recette de vérification (deux séances QA, navigateur réel) dans `docs/chantiers.md` (chantier 129) et `A_VERIFIER.md` § Chantier 129.

**Consigne de Jules** : « Des personnes ont participé à une séance précédente, et maintenant, quand je leur donne le QR code d'une nouvelle séance, ils reviennent sur le questionnaire de la séance précédente, alors qu'avec ce nouveau QR code, ils devaient arriver sur l'écran d'identification de la nouvelle séance. »

À investiguer : un état côté client (localStorage/sessionStorage) scopé par device plutôt que par `session_id`, qui fait que `hasQuestionnaireResponse`/le routage `SessionRouterScreen` retombe sur la mauvaise séance. Vérifier toutes les clés de stockage utilisées par le parcours participant (`AttendanceConfirmScreen`, `SessionRouterScreen`, `VoteScreen`) pour repérer celles qui ne sont pas préfixées/scopées par `session_id`.

**Garde-fou** : c'est exactement la classe de bug décrite dans `CLAUDE.md` § Ne jamais faire sur `JSON.parse(localStorage…) as T` — vérifier si une clé de stockage manque de scoping par séance plutôt que de valeur.

Périmètre de fichiers (à affiner en démarrant) : `SessionRouterScreen.tsx`, `VoteScreen.tsx`, `AttendanceConfirmScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`).

#### 130 — Historique des tables accessible au superadmin après clôture, sans rouvrir l'accès public — ✅ fait, voir `docs/chantiers.md`

> **Fait le 2026-09-25.** Aucune RPC nouvelle : `get_table_participants`/`get_table_speaking_turns_admin` couvraient déjà le besoin (déjà utilisées par l'export CSV « Historique », non documentées jusqu'ici). Nouvelle section « Historique des tables » dans l'onglet Tables du superadmin, visible en phase `closed`. Détail complet dans `docs/chantiers.md` (chantier 130) et `A_VERIFIER.md` § Chantier 130 — reste à vérifier au clic (mot de passe superadmin non disponible en session headless).

**Consigne de Jules** : « Lorsqu'une session est clôturée, j'aimerai toujours, en tant que superadmin, avoir accès à l'historique des tables. Notamment pour retrouver les problèmes qui ont pu avoir lieu, sans rendre publique à nouveau la séance. »

#### 131 — Bouton "sujet suivant" + tag de sujet à la prise de parole

**Consigne de Jules** : « Vue participant : proposer un bouton pour chaque participant qu'il peut activer, pour dire que le participant est d'accord pour passer au sujet suivant. Le modérateur voit le nombre de personnes qui appuient sur le bouton, et peut donc passer au sujet suivant. [...] Lorsque quelqu'un appuie sur le bouton "prendre la parole", il peut marquer le sujet ou thème dont il souhaite parler, qui peut s'inscrire à côté de son prénom. »

Deux sous-tâches regroupées (même zone d'écran, taille comparable) :
1. **Bouton "d'accord pour le sujet suivant"** par participant dans `ParticipantView`, avec compteur visible côté `ModeratorView`. À définir en démarrant : le compteur se réinitialise-t-il automatiquement quand le modérateur passe au sujet suivant, ou faut-il un reset manuel ?
2. **Tag de sujet optionnel** à la prise de parole, propagé dans la file d'attente et affiché à côté du prénom (probablement une colonne texte libre sur `queue_entries`, à broadcaster comme le reste de la file — cf. CLAUDE.md § Broadcast par action, `addToQueue` diffuse déjà `queue_entries`).

⚠️ Croise **132** sur le même fichier racine — voir avertissement en tête de section.

Périmètre de fichiers (à affiner en démarrant) : `ParticipantView.tsx`, `ModeratorView.tsx`, `queue_entries` (migration éventuelle pour le tag de sujet).

#### 132 — Outil "proposer un vote" côté modérateur

**Consigne de Jules** : « Donner la possibilité au modérateur de proposer un vote parmi plusieurs options. Il écrit les options, et chaque personne peut dire qu'il est d'accord sur chacune des options ou non. À la fin des votes, tout le monde peut avoir accès au résultat. » Précisé en conversation : « dans la vue modérateur, c'est un nouvel outil "proposer un vote", et cela s'affiche ensuite dans la vue participant avec une fenêtre qui pop. Totalement séparé du système d'assertion. Le modo ne doit pas voir qui a voté quoi, juste des décomptes. Une question, un résultat, terminé, mais le modo peut relancer d'autres votes derrière. Le modo doit accéder à l'historique de ces votes. »

Le plus gros des trois chantiers "fonctionnalités table de débat" — nouveau mécanisme complet, à ne pas confondre avec le système d'assertions/vote du Bloc C (Jules insiste : totalement séparé) :
- Nouvel outil dans `ModeratorView` : rédaction d'un vote à N options.
- Popup côté `ParticipantView` : chaque participant répond oui/non par option.
- Décompte agrégé **uniquement** (pas de vue nominative pour le modérateur — probablement une table dédiée avec des votes anonymisés côté lecture modérateur, ou simplement ne jamais exposer `user_id` dans la RPC de lecture des résultats).
- Cycle de vie : un vote actif → résultat → terminé ; le modérateur peut en relancer d'autres ensuite (donc plusieurs votes possibles par débat, historisés).
- Historique des votes accessible au modérateur (et sans doute au superadmin par la même occasion, à trancher en démarrant).
- Nouveau canal Realtime probable pour la diffusion du vote et de sa clôture — **ne pas oublier `can_join_realtime_topic`** si un nouveau topic est créé (fail-closed, cf. CLAUDE.md § Canaux Realtime privés).

⚠️ Croise **131** sur le même fichier racine — voir avertissement en tête de section.

Périmètre de fichiers (à affiner en démarrant) : nouvelles tables SQL (ex. `table_votes`/`table_vote_options`/`table_vote_responses`), nouvelle(s) RPC, `ModeratorView.tsx`, `ParticipantView.tsx`, `lib/realtime.ts` si nouveau topic.

#### 134 — "Nouvelle séance" : 3 modes (séance complète / débat simple / sondage) — usage interne — **Opus demandé par Jules**

**Consigne de Jules** : « Discussion opus (et probablement à scinder en deux) : Quand on fait "nouvelle séance" dans le menu superadmin, on propose 3 choses : séance complète, débat simple, et sondage. La séance complète est comme actuellement, le débat simple est juste la création d'une table, avec modérateur, et sans vote préalable, ou après, ou tout fonctionnement lié aux assertions. Au contraire, le sondage, c'est tout le fonctionnement lié aux assertions (votes distanciel uniquement, sans besoin de faire de présentiel derrière, et une vision des résultats et des camps qui peut s'actualiser) mais sans le débat avec la table de débat, et l'allocation. »

Arbitrage tranché avec Jules le 2026-09-25 sur la relation avec le point suivant (135) : **134 est le premier étage, usage interne à Ecclesia** — proposer ces 3 modes dans l'UI superadmin actuelle, sans notion de compte/organisation externe. 135 (ouverture à des tiers) est un second étage qui **dépend de 134** et ne doit pas être lancé avant.

À trancher en démarrant, probablement avec Jules avant de coder (chantier Opus, périmètre volontairement ouvert par la consigne) :
- Nouvelle colonne `sessions.session_type` (ou équivalent) pour distinguer les 3 modes, et son impact sur la state machine de phases actuelle (`draft → pre_voting → voting → allocating → debating → post_voting → closed`) — un "débat simple" n'a probablement besoin d'aucune des phases de vote, un "sondage" n'a probablement pas besoin de `allocating`/`debating`. Voir si c'est un sous-ensemble de phases existantes ou une state machine dédiée par mode.
- Impact sur tous les écrans qui supposent aujourd'hui qu'une séance traverse toutes les phases (superadmin, `PhaseIndicator`, tous les écrans participant).
- Le "sondage" reprend la description exacte du système d'assertions/vote Bloc C existant (distanciel, résultats/camps actualisables) — vérifier ce qui peut être réutilisé tel quel vs. ce qui suppose implicitement un débat en aval.

**Garde-fou** : chantier structurant touchant le cœur du flux de phases — ne pas le lancer en parallèle d'un autre chantier qui touche ce même flux (voir avertissement en tête de section).

Périmètre de fichiers : large et à définir en démarrant — au minimum `sessions` (schéma + RPC de création), `SuperadminScreen.tsx` (flux "nouvelle séance"), la state machine de phases.

#### 135 — Ouvrir le sondage et la table de modérateur seule à des associations externes — **Opus demandé par Jules**, dépend de 134

**Consigne de Jules** : « Discussion à faire avec Opus : le but est de rendre possible des fonctionnalités pour des associations externes à Ecclesia. Notamment, dans un premier temps, deux fonctionnalités : le sondage (faire une séance de vote, mais ne pas faire de débat derrière) et la création d'une table de modérateur (un modérateur, avec des participants pour gérer la séance, et la possibilité d'avoir une table de participant tout court, mais sans tout ce qui est lié au vote). »

Confirmé par Jules le 2026-09-25 : **134 d'abord**, 135 ensuite. Ce chantier reprend deux des trois modes du 134 (sondage, débat simple) mais change complètement d'échelle : ce n'est plus une option dans le menu du superadmin d'Ecclesia, c'est une ouverture à des **organisations tierces**, ce qui implique probablement :
- Un modèle de comptes/organisations distinct du superadmin unique actuel (`app_config.superadmin_code_hash`) — actuellement il n'existe qu'un seul superadmin pour tout le système.
- Une isolation des données entre organisations (RLS à revoir en profondeur — tout le modèle actuel de `session_members`/`table_assignments` self-only suppose une seule organisation).
- Potentiellement un système d'authentification différent de l'auth anonyme actuelle pour ces comptes externes.

**Ne pas lancer avant que 134 soit tranché** — son résultat conditionne directement ce qui est réutilisable ici (state machine par mode) vs. ce qu'il faut construire spécifiquement pour le multi-organisation.

Périmètre de fichiers : à définir entièrement une fois 134 tranché — chantier d'architecture, pas une simple extension de fichiers existants.

---

### 119 — Angles morts du code de rappel (inscriptions sans code) — ✅ fait, voir `docs/chantiers.md`

**Fait le 2026-09-21** (numéroté 117 puis 118 au fil de deux rebases, faute de synchronisation avec deux autres sessions ayant pris ces numéros le même jour — définitivement 119). Détail complet (constat, fix, vérifications en base et au navigateur, angle hors périmètre découvert en cours de route) : entrée « 119 » de [`docs/chantiers.md`](./chantiers.md) et section « Chantier 119 » de [`../A_VERIFIER.md`](../A_VERIFIER.md). ⚠️ **Recoupe le chantier 118 ci-dessous** — voir l'amendement en tête de son entrée.

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

### 56 — Durcissement SQL — ✅ fait le 2026-09-16, voir `docs/chantiers.md`
**Sécurité.** Fermer `app_config`, figer le `search_path` des fonctions à mot de passe. Fait en présence de Jules, comme l'exigeait la consigne ci-dessous — conservée pour mémoire.
⚠️ *(Consigne d'origine, respectée)* : peut verrouiller Jules hors de sa propre base — à ne faire que lorsqu'il est disponible et joignable, jamais à l'approche d'une utilisation en production, jamais pendant qu'il dort.

### 87 — Revue complète des parcours utilisateurs

> ✅ **Fait le 2026-09-20 — 87 et 101 fusionnés en un seul audit.** Jules a fourni le texte que le 87 attendait, et ce texte couvre exactement le terrain du 101 : le chevauchement signalé ci-dessous est donc tranché par la fusion, pas par un choix entre les deux. Audit livré : [`docs/2026-09-20-audit-chantier87-101-parcours-participant.md`](./2026-09-20-audit-chantier87-101-parcours-participant.md). Constat court : le parcours décrit est globalement couvert ; trois problèmes réels — plusieurs écrans modérateurs possibles sur une même table, `claim_moderator_status` qui déplace l'affectation de quelqu'un déjà assis (écran modérateur sans autorité), et une déclaration modérateur incohérente d'un point d'entrée à l'autre. Six correctifs candidats (P1-P6) et **trois arbitrages en attente de Jules** y sont listés — les chantiers correctifs ne sont pas ouverts ici.

**Parcours.** Sujet de fond réservé par Jules. Il veut **réexpliquer lui-même** comment l'application et son flux sont censés fonctionner à chaque instant, et préfère une conversation dédiée lancée en **un prompt unique** qui attend son texte. **Ne rien analyser avant d'avoir reçu ce texte.**

### 99 — Fiches pédagogiques : argument fallacieux et biais cognitifs

> ✅ **Fait et mergé le 2026-09-20** — Jules a débloqué le chantier autrement que prévu : au lieu de fournir les documents à intégrer dans l'app, il a donné deux liens vers des fiches déjà publiées sur `ecclesia-centralesupelec.vercel.app/ressources` (ancres `#biais-cognitifs` et `#arguments-fallacieux`). Deux liens statiques ajoutés dans les trois menus « Documentation » de l'app (`DocumentationButton.tsx`, `ParticipantToolsButton.tsx`, `VoteToolsPanel` dans `VoteScreen.tsx`), toujours visibles désormais (avant : masqués si la séance n'avait aucune URL de documentation propre). Détail dans `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 99. Vérifié au navigateur par Jules le jour même (séance de test jetable, purgée après validation).

### 100 — Diagnostic cybersécurité : peut-on interrompre une séance ou voler des données ?

> ✅ **Fait le 2026-09-19** — audit livré : [`docs/2026-09-19-audit-chantier100-interruption-exfiltration.md`](./2026-09-19-audit-chantier100-interruption-exfiltration.md). Réponse courte : vol de données non à grande échelle, **interruption de séance oui** (cinq helpers `SECURITY DEFINER` exposés à `anon` sans garde d'autorité, plus C7 et A4 déjà connus).
>
> **Suite**, à la demande de Jules le même jour : le [plan de fermeture](./2026-09-19-plan-anti-interruption-seance.md) est découpé en **chantiers 102, 103, 104, 105 et 105bis** ci-dessous. Le 102 porte l'essentiel du gain et ne dépend de rien.
**Sécurité, discussion/audit — pas nécessairement du code.** Nouveau, dicté par Jules le 2026-09-19.

> **Consigne de Jules (2026-09-19)** : « Cybersécu : faire une discussion check pour savoir si on est safe (personne ne peut interrompre la séance en cours) ou voler des données. »

**Précisions** : c'est un audit, dans l'esprit de `docs/2026-09-06-plan-securite-consolide.md` — relire l'état actuel du code et de la base (RLS, policies, canaux Realtime, RPC SECURITY DEFINER) contre ces deux questions précises (interruption de séance en cours, exfiltration de données), et produire un constat, pas nécessairement un correctif immédiat. Recouvre partiellement le plan consolidé existant (F6 Realtime, `session_members`/`table_assignments` self-only, etc.) mais avec un angle plus large : « interrompre la séance » n'est pas un point déjà couvert nommément dans le plan — à vérifier explicitement (ex. un participant peut-il changer la phase d'une séance, casser le broadcast d'une table, etc.).

### 101 — Diagnostic flow participant : toutes les situations d'arrivée sont-elles couvertes ?

> ✅ **Fait le 2026-09-20 — 87 et 101 fusionnés en un seul audit.** Jules a fourni le texte que le 87 attendait, et ce texte couvre exactement le terrain du 101 : le chevauchement signalé ci-dessous est donc tranché par la fusion, pas par un choix entre les deux. Audit livré : [`docs/2026-09-20-audit-chantier87-101-parcours-participant.md`](./2026-09-20-audit-chantier87-101-parcours-participant.md). Constat court : le parcours décrit est globalement couvert ; trois problèmes réels — plusieurs écrans modérateurs possibles sur une même table, `claim_moderator_status` qui déplace l'affectation de quelqu'un déjà assis (écran modérateur sans autorité), et une déclaration modérateur incohérente d'un point d'entrée à l'autre. Six correctifs candidats (P1-P6) et **trois arbitrages en attente de Jules** y sont listés — les chantiers correctifs ne sont pas ouverts ici.

**Parcours, discussion/audit.** Nouveau, dicté par Jules le 2026-09-19.

> **Consigne de Jules (2026-09-19)** : « Flow participant : faire une discussion check pour bien vérifier que toutes les situations possibles d'un participant qui arrive, ou un modérateur qui arrive, puissent rejoindre la séance, et participer comme il se doit, que tout est pris en compte. »

⚠️ **Chevauchement à signaler avec le chantier 87** (« Revue complète des parcours utilisateurs »), déjà réservé par Jules avec la consigne explicite de ne rien analyser avant qu'il fournisse son propre texte. Le 101 semble être une version plus étroite du même sujet (les points d'entrée en séance, pas le parcours complet) — **à confirmer avec Jules avant de lancer l'un ou l'autre** : soit ce chantier est absorbé par le 87 quand son texte arrivera, soit c'est un sous-ensemble volontairement détaché pour être traité plus vite. Ne pas lancer sans cette clarification, pour éviter que deux sessions produisent deux analyses concurrentes du même terrain.

> ✅ **102 fait et mergé le 2026-09-19** — détail dans `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 102.

> ✅ **103 fait et mergé le 2026-09-19** — détail dans `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 103.

> ✅ **104 fait et mergé sur `main` le 2026-09-19** — détail dans `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 104.

> ✅ **105 fait le 2026-09-20** — détail dans `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 105. **Correction importante à l'ouverture** : contrairement à ce que disait l'entrée ci-dessous (sourcée sur l'audit du 100), la restriction était **déjà en vigueur en base** au moment de lancer le chantier — `member_id` n'était pas accordé. La cause exacte du soupçon initial (« rétabli hors migration ») n'a pas pu être confirmée faute de logs remontant assez loin ; une piste plausible (privilèges par défaut du schéma réappliqués si la table est recréée, ex. via le Table Editor du dashboard) est documentée dans `A_VERIFIER.md`, à confirmer avec Jules. Le geste fait quand même : la restriction, qui n'existait qu'en base, est maintenant recodifiée dans une migration du dépôt (idempotente) pour ne plus dépendre uniquement d'un `GRANT` invisible du code source.

### 105 — Sécurité : rétablir la restriction de colonne du chantier 51 sur `assertions`

**Sécurité, SQL uniquement.** Trouvé en passant par le [diagnostic du chantier 100](./2026-09-19-audit-chantier100-interruption-exfiltration.md) — sujet exfiltration, pas interruption, d'où son traitement à part.

Le `REVOKE SELECT` + `GRANT SELECT (id, session_id, content, status, created_at)` posé par `20260902_chantier51_hide_assertion_author.sql` **n'est plus en vigueur en base** : `member_id` est de nouveau accordé à `anon` et `authenticated`. Aucune migration du dépôt ne le réaccorde — le grant a été rétabli hors migration. L'auteur d'une assertion redevient corrélable par identifiant pseudonyme (pas par nom : `session_members` reste self-only).

**À clarifier avec Jules avant d'agir** : savoir si ce `GRANT` a été rétabli à la main depuis le dashboard, ou par un autre chemin — la réponse change ce qu'il faut corriger, et surtout si ça peut se reproduire. Entrée ouverte dans `A_VERIFIER.md` § Chantier 100.

**Le geste, ensuite** : rétablir la restriction **dans une migration du dépôt**, et vérifier qu'elle tient. Leçon à retenir au passage : une correction de sécurité posée uniquement par `GRANT` peut se défaire sans laisser de trace — le chantier devrait se terminer par une vérification, pas par une application.

> ✅ **105bis fait le 2026-09-20** — arbitrage de Jules tranché (voir ci-dessous), détail dans `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 105bis.

### 105bis — Sécurité : l'auto-désignation de modérateur (A4)

**Produit avant d'être technique.** Lot 4 du [plan](./2026-09-19-plan-anti-interruption-seance.md).

`designate_moderator` ne demandait **aucun secret** : sur une table `leaderless`, n'importe quel participant se faisait modérateur, ce qui lui ouvrait d'un coup `kick_participant`, `grant_floor`, `correct_turn`, `add_offline_participant` — et, tant que le 104 n'est pas passé, la réécriture du `join_code`. Ce n'était pas un bug : c'était le mécanisme prévu pour qu'une table sans animateur puisse en désigner un sur place.

**Arbitrage de Jules (2026-09-20)** : ni « laisser ouvert », ni « demander le Code Ecclesia » — une quatrième option, plus proche du produit que des trois envisagées par la session précédente. Le bouton participant reste visible sur une table `leaderless`, mais ne désigne plus personne : il renvoie vers le superadmin, qui est seul habilité à accorder le rôle, **et seulement s'il est disponible** (pas de filet automatique si personne ne répond — la table reste sans animateur plutôt que de rouvrir la faille).

**Fait** : la RPC `designate_moderator` a son `EXECUTE` révoqué pour `anon`/`authenticated` en base (migration `20260920_chantier105bis_close_designate_moderator.sql`, appliquée). Côté participant (`ParticipantView.tsx`), le bouton "🎙️ Devenir modérateur" ouvre désormais une modale informative au lieu d'appeler la RPC ; `designateModerator` a été retiré de `TableContext.tsx` (plus aucun appelant). Côté admin, **rien à créer** : `AddModeratorControl` (onglet Tables du superadmin) couvrait déjà exactement ce cas depuis le chantier 72 — bouton d'assignation sur toute table sans modérateur, via `assign_moderator_to_table`/`set_member_moderator`, protégées par le mot de passe superadmin.


---

## Suite de l'audit 87/101 — chantiers 106 à 112 (arbitrages rendus par Jules le 2026-09-20)

> Ces sept chantiers sortent de l'[audit du parcours participant & modérateur](./2026-09-20-audit-chantier87-101-parcours-participant.md). **Les cinq arbitrages que cet audit laissait ouverts ont été tranchés par Jules le 2026-09-20** ; ses décisions sont citées mot pour mot dans chaque entrée sous « Décision de Jules ». Tout ce qui suit sous « Précisions » vient de l'analyse de la session : vérifications dans le code, conséquences déduites, et décisions de détail. **Les quatre points de mise en œuvre encore ouverts à la rédaction ont été tranchés par Jules le même jour** — reprise d'animation autorisée (110), table la moins remplie (111), récapitulatif de confirmation (109), recomptage au recalcul (107) : **aucun de ces sept chantiers n'attend plus de réponse de Jules pour démarrer.**
>
> **Ordre de dépendance** — il n'est pas indicatif, deux branches simultanées sur les mêmes fichiers se casseront :
> - **112** : indépendant, faisable tout de suite (trois lignes).
> - **106 → 110** : le 110 a besoin de la notion de « modérateur en exercice » posée par le 106.
> - **107 → 109** : même fonction SQL, et le 109 est la contrepartie du 107.
> - **107 → 108 → 111** : ouvrir la déclaration (108) avant que le 107 l'ait rendue inoffensive aggraverait le problème ; et 108 et 111 touchent tous les deux `TableAssignmentCard.tsx`.
>
> **À lire avant de commencer le 106** : le **105bis** (auto-désignation sur table `leaderless`) a été tranché et livré le 2026-09-20 par une autre session, **pendant** la rédaction de ce bloc. Jules y a choisi une quatrième option, non envisagée ici : le bouton participant reste visible mais ne désigne plus personne, il renvoie vers le superadmin, seul habilité à accorder le rôle. Ce n'est **pas** en contradiction avec l'arbitrage 4 du 106 (« le modérateur est le premier arrivé »), qui porte sur une autre question — lequel des modérateurs **déjà déclarés** tient l'écran d'une table. Mais les deux se rejoignent sur une règle que le 106 ne doit pas casser : **plus aucun chemin ne donne l'animation sans secret** (Code Ecclesia) ou sans le superadmin.

### 106 — Un seul écran modérateur par table (« déclaré » ≠ « en exercice ») — ✅ fait le 2026-09-21

**Fait** : voir `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 106 pour le détail complet et la recette de vérification.

**Modèle de données + SQL + front.** Problème A de l'audit — le plus structurant, et la fondation des autres.

> **Décision de Jules (2026-09-20), arbitrage 2** : « un modo qui n'anime aucune table est un participant : il garde son drapeau, mais perd l'écran. Cela permet au superadmin de voir, au cas où il y a un problème, qu'il y a certaines personnes qui sont modératrices en plus, au cas où. »
>
> **Décision de Jules (2026-09-20), arbitrage 4** : « le modérateur est le premier arrivé, et sinon, le superadmin peut changer les modos de place avec son interface de groupe. »

**Le problème** : `TableContext` calcule `isModerator = physicalModerator || sessionMemberIsModerator`, par utilisateur, sans arbitrage ; `is_table_moderator` accorde l'autorité SQL à *tout* membre `is_moderator` assis à cette table. L'allocation assoit sciemment les modérateurs en surplus comme participants ordinaires (chantier 25b) **sans retirer leur drapeau** : deux `ModeratorView` peuvent piloter la même file d'attente et le même chrono.

**Précisions / périmètre** :
- Nouvelle colonne `tables.active_moderator_member_id` (nullable, FK `session_members`), posée par le **premier** chemin qui attribue l'animation, et exigée par `is_table_moderator` **en plus** des conditions actuelles (les deux branches restent cumulatives — ne surtout pas relâcher le helper, cf. « Ne jamais faire » de `CLAUDE.md`).
- Le drapeau `session_members.is_moderator` **ne change pas de sémantique** et n'est jamais retiré : c'est la demande explicite de Jules (le superadmin doit continuer à voir qui est modérateur « en plus »).
- Les cinq chemins qui attribuent aujourd'hui l'animation doivent tous poser la colonne : `apply_allocation`, `claim_moderator_status`, `set_member_moderator`, `assign_moderator_to_table`, `claim_table_as_moderator`. **Un seul oublié fait réapparaître deux écrans** — c'est le risque principal du chantier, à vérifier chemin par chemin.
- Côté superadmin (onglet Groupes) : distinguer visuellement « modérateur en exercice » et « modérateur en surplus » sur la même table, sinon la décision de Jules de garder le drapeau visible n'a aucun effet à l'écran.
- **Règle SQL** : `is_table_moderator` est réécrite → comparer son corps à `pg_get_functiondef` **en base**, jamais au fichier de migration.
- **Fichiers** : `supabase/migrations/…`, `src/context/TableContext.tsx`, l'onglet Groupes de `src/screens/SuperadminScreen.tsx` (et/ou `src/components/ParticipantsTable.tsx`).

### 107 — `claim_moderator_status` ne doit jamais déplacer quelqu'un déjà assis

**SQL uniquement.** Problème B de l'audit, et condition préalable à l'arbitrage 1.

> **Décision de Jules (2026-09-20), arbitrage 1** : « tous les gens qui doivent être modérateurs puissent se déclarer (à l'entrée comme en séance) mais juste que l'algo n'en tienne pas compte et que le superadmin finisse de travailler sur les tables tranquillement. Cela ne doit donc pas faire bouger la répartition lorsqu'il la regarde. »

**Le problème** : si l'appelant est déjà assis sur une table **non** `leaderless`, la branche `ELSE` de `claim_moderator_status` cherche la première table animée sans modérateur et **réécrit son `table_assignments`**. Sa ligne `participants` (sa place physique) ne bouge pas : il obtient l'écran modérateur d'une table où il n'est pas, et **toutes ses actions d'animation échouent en silence RLS** sur la table où il est réellement. Et s'il n'existe aucune table libre, il reste sur place avec le drapeau → retour au problème A.

**Le geste** : la déclaration devient **le drapeau, et rien d'autre**, dans deux cas — (a) l'appelant a déjà une ligne `table_assignments`, quelle que soit la table ; (b) la séance est en phase `allocating`. Le placement d'office ne subsiste que pour quelqu'un sans aucune table, hors `allocating`. La conversion en place d'une table `leaderless` sur laquelle l'appelant est déjà assis (chantier 64) est **conservée** : elle ne déplace personne.

**Précisions** :
- Même question à examiner pour `set_member_moderator` (chantier 37 : « assied aussi le membre sur la première table animée sans modérateur ») — là c'est le superadmin qui agit sciemment, sur sa propre répartition : à laisser tel quel sauf surprise en ouvrant le code. Seule la déclaration **par le participant** est concernée par ce chantier.
- **Tranché par Jules le 2026-09-20** : un modérateur qui se déclare pendant `allocating` **est recompté** si le superadmin relance le calcul d'allocation (« Oui, j'aimerai qu'il soit recompté »). « L'algo n'en tient pas compte » veut donc dire « la répartition ne bouge pas toute seule », **pas** « ignoré pour toujours » : un recalcul explicite relit les entrées fraîches, et `get_allocation_inputs` n'a rien à changer pour ça. Conséquence à ne pas manquer à l'implémentation : **ne filtrer les déclarations tardives nulle part dans les entrées de l'algorithme** — la neutralité exigée par Jules s'obtient en empêchant la déclaration de *poser un siège* (c'est tout l'objet de ce chantier), jamais en la cachant au calcul.
- **Règle SQL** : réécriture d'une fonction existante → `pg_get_functiondef` en base d'abord.
- **Fichiers** : `supabase/migrations/…` uniquement.

### 108 — Harmoniser la déclaration modérateur sur tous les points d'entrée — ✅ fait le 2026-09-21

**Fait** : voir `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 108 pour le détail complet et la recette de vérification.

**Front.** Écarts C1, C2 et C3 de l'audit. **Après le 107** : tant que la déclaration peut déplacer quelqu'un, l'ouvrir davantage aggrave le problème.

> **Décision de Jules (2026-09-20), arbitrage 1** : « tous les gens qui doivent être modérateurs puissent se déclarer (à l'entrée comme en séance) ». Sur l'option « choisir sa table par son code dès l'allocation », proposée par la session : **rejetée**, motif de Jules — « L'option B me parait incohérente : en allocating, les codes de tables n'existent pas forcément encore. » (Exact : les tables sont créées par `apply_allocation`, il n'y a donc aucun code à donner tant que le superadmin n'a pas appliqué sa répartition.)

**Les trois écarts à refermer** :
- **C1** — la reconquête pré-vote (`PseudoForm`, nom déjà pris → nom + code) **ignore** la case « Je suis modérateur » cochée juste au-dessus, et la perd **sans aucun message**. Rejouer `tryClaimModeratorStatus` après un reclaim réussi, comme le fait déjà `VotingEntryForm`.
- **C2** — en `allocating`, la déclaration est fermée aux déjà-inscrits (message du chantier 95 sur `AllocatingScreen`) mais **ouverte** à quiconque s'inscrit au même moment. Une fois le 107 passé, la déclaration est inoffensive : **rouvrir** pour les déjà-inscrits et **remplacer** le message du chantier 95 par « tu seras placé à une table au démarrage du débat ».
- **C3** — le formulaire de secours de `TableAssignmentCard` (membre inscrit, aucune affectation, phase `debating`) ne propose que `switch_table`, **sans** case modérateur, alors que c'est le profil type du modérateur en retard. Y ajouter la case, câblée sur `claim_table_as_moderator` (qui refuse une table déjà animée) — le chemin existe déjà quelques lignes plus haut dans le même composant.
- **Fichiers** : `src/components/voting/PseudoForm.tsx`, `src/screens/AllocatingScreen.tsx`, `src/components/voting/TableAssignmentCard.tsx`, éventuellement `src/screens/VoteScreen.tsx`.

### 109 — Placement des modérateurs en attente au passage en `debating` — ✅ fait le 2026-09-21, voir `docs/chantiers.md`

**SQL + superadmin.** Contrepartie du 107 : si la déclaration ne place plus personne pendant l'allocation, il faut que quelqu'un place les modérateurs en attente au démarrage. **Après le 106 et le 107.**

> **Décision de Jules (2026-09-20), arbitrage 1** : « Lorsqu'il a fini de travailler sur les tables, et passent en débat, les modérateurs qui étaient en attente (et qui ont pu se déclarer entre temps) sont associés à leurs tables. »

**Le geste** : au passage `allocating → debating`, une RPC (`assign_pending_moderators(password, session_id)`, à créer — vérifier d'abord dans `docs/reference-fonctions-sql.md` qu'aucune fonction existante ne couvre déjà le besoin) place chaque membre `is_moderator = true` qui n'est en exercice sur aucune table, sur une table animée sans modérateur en exercice. Déterministe, par numéro de table croissant. Pose `active_moderator_member_id` (chantier 106) et déplace `table_assignments` si nécessaire.

**Précisions / garde-fous** :
- **Ce chantier déplace des gens dans la répartition que le superadmin vient de valider.** C'est voulu et explicitement demandé, mais c'est le seul moment du parcours où ça arrive — à ne pas généraliser.
- **Tranché par Jules le 2026-09-20** : **récapitulatif de confirmation obligatoire** avant d'appliquer — « 3 modérateurs en attente vont être placés aux tables 2, 5 et 7 — confirmer ? », avec le nom de chaque modérateur et le numéro de table visé. C'est le dernier geste avant le débat, il déplace des participants, et c'est le seul moment où le superadmin peut encore corriger avant que les gens ne soient installés. Le récapitulatif doit aussi dire ce qui **ne** sera **pas** fait : modérateurs en attente sans table libre, et tables animées restées sans modérateur.
- S'il y a **plus** de modérateurs en attente que de tables libres : le surplus reste participant avec son drapeau — conforme à l'arbitrage 2, aucun traitement particulier.
- S'il y a **moins** : des tables restent sans modérateur. L'option « interdire les tables sans modérateur » du chantier 98 existe déjà pour éviter d'en arriver là ; le signaler à l'écran suffit, ne rien corriger ici.
- **Fichiers** : `supabase/migrations/…`, `src/screens/SuperadminScreen.tsx` (`handlePhaseChange`).

### 110 — Bouton « Je suis le modérateur de cette table » dans les Outils + filet d'identité
> 🟡 **Livré le 2026-09-21, pas encore mergé** (`claude/chantier-110-c54053`) — voir `docs/chantiers.md` et `A_VERIFIER.md` § Chantier 110 pour le détail complet et la recette de vérification.

**Front + SQL léger.** Piège D1 de l'audit. **Après le 106.**

> **Décision de Jules (2026-09-20), arbitrage 5** : « oui, il faut un bouton "je suis le modérateur de cette table" dans outils, pour reprendre la main si on a perdu le compte, c'est une très bonne idée, option A. »

**Le problème** : si le jeton anonyme est renouvelé en séance (téléphone en veille longue, navigateur in-app de Messenger, purge type Safari ITP), `App.tsx` restaure la table depuis `localStorage` et repose `isModerator = r.created_by === userId` — **faux par construction** sur toute table issue de l'allocation, où `created_by` est l'uid du superadmin (anti-pattern nommément interdit par `CLAUDE.md`). La reprise par `session_members` échoue aussi, puisqu'elle est indexée sur le `user_id` justement renouvelé. Le modérateur revient en `ParticipantView` **sans aucun moyen de reprendre la main depuis cet écran**.

**Le geste** : entrée « Je suis le modérateur de cette table » dans `ParticipantToolsButton`, protégée par le Code Ecclesia, qui rejoue `claim_table_as_moderator` sur la table courante ; et suppression du `created_by === userId` de `App.tsx`.

**Précisions** :
- **Tranché par Jules le 2026-09-20 — c'est le cœur du chantier.** `claim_table_as_moderator` **refuse aujourd'hui une table qui a déjà un modérateur**. Or dans le cas qui motive ce chantier, le modérateur en place **c'est lui-même**, sous son ancienne identité : un refus bloquerait exactement le scénario à réparer. Sur ce chemin-là, la **reprise est autorisée** — transfert de `active_moderator_member_id` (chantier 106), libellé explicite « Reprendre l'animation de cette table », et notification au titulaire précédent, qui bascule en `ParticipantView` **sans perdre son drapeau**. Sûr, puisque le Code Ecclesia est exigé. **Bénéfice à assumer comme un objectif, pas comme un effet de bord** : c'est le premier chemin propre de **passation de main** en cours de débat — aujourd'hui il n'en existe aucun. Ne pas restreindre la reprise au seul cas « identité perdue », qui n'est de toute façon pas détectable côté serveur.
- **Attention à l'ordre** : la reprise transfère `active_moderator_member_id`, qui n'existe qu'après le 106. Lancer le 110 avant le 106 obligerait à écrire la reprise deux fois.
- **Fichiers** : `src/components/ParticipantToolsButton.tsx`, `src/App.tsx`, éventuellement `supabase/migrations/…` pour la reprise.

### 111 — ✅ Fait et mergé le 2026-09-21 — Le retardataire entré par code de table doit exister pour la séance

**Fait** : voir `docs/chantiers.md` (chantier 111) et `A_VERIFIER.md` § Chantier 111 pour le détail complet et la recette de vérification. Constat clé : l'inscription automatique en `session_members` (le cœur de l'écart C5) était **déjà** assurée depuis les chantiers 66/67 — seul le bouton « Assignez-moi une table » manquait réellement.

**Front + SQL.** Écart C5 de l'audit. **Après le 108** (les deux touchent `TableAssignmentCard.tsx`).

> **Décision de Jules (2026-09-20), arbitrage 3** : « Oui, un retardataire qui rentre par code de table doit exister pour la séance. […] on peut aussi tout à fait lui donner un bouton : "Assignez moi une table", et on le met à une table aléatoire par exemple. Et on lui propose questionnaire de fin, il voit les résultats (pas les siens, mais ceux de la séance) il peut voter en post vote (juste ce sont de nouveaux votes) etc. »

**Le problème** : quelqu'un qui rejoint une table par `JoinTableForm` sans jamais s'inscrire à la séance n'a pas de ligne `session_members`. Il débat 1 h 30 puis reçoit, en `post_voting`, « le débat vient de se terminer » — sans questionnaire, sans résultats, sans revote. Il est invisible pour la séance.

**Le geste** : l'inscrire à la séance au moment où il rejoint la table (nom + code de rappel, comme tout le monde), et lui offrir en plus un bouton **« Assignez-moi une table »** qui le place sans qu'il ait à quémander un code. Il hérite ensuite de tout le parcours de fin : questionnaire, résultats collectifs, revote.

**Précisions** :
- **Réponse à la question de Jules** — « un retardataire qui rentre par code de table, c'est un retardataire tout court non ? » : pas tout à fait, il y a **deux** populations distinctes, et c'est ce qui rend le sujet confus. (a) Celui qui a voté et a une affectation : il arrive en débat et clique « Accéder à la table », **il ne tape jamais de code**. (b) Celui qui n'a jamais voté, ou qui s'est inscrit pendant l'allocation après le calcul : il n'a aucune affectation, et **c'est seulement à lui** qu'on demande un code aujourd'hui. Le bouton « Assignez-moi une table » s'adresse exactement à cette seconde population — et il supprime le seul endroit du parcours où l'app demande à quelqu'un d'aller mendier une information à un voisin.
- **Tranché par Jules le 2026-09-20** : **la table la moins remplie**, et non une table aléatoire (sa proposition initiale, qu'il a lui-même abandonnée). Parmi les tables **animées** de la séance ; à égalité, le plus petit `table_number` — le résultat doit rester déterministe, comme tout le reste de l'allocation (§6 : deux clics successifs ne doivent pas donner deux réponses). Ça évite de gonfler une table déjà pleine le soir où trois retardataires arrivent ensemble. L'hétérogénéité d'opinion n'est de toute façon pas calculable pour quelqu'un qui n'a pas voté (il est neutre) : le remplissage est le seul critère disponible.
- Pas de point sur la carte des camps pour lui (aucun vote de la phase de vote) : c'est normal et déjà géré par `ResultsMapScreen` (chantier 34) — ne pas chercher à lui en fabriquer un.
- **Fichiers** : `src/components/JoinTableForm.tsx`, `src/screens/SessionRouterScreen.tsx`, `src/components/voting/TableAssignmentCard.tsx`, `supabase/migrations/…`.

### 112 — ✅ Fait et mergé le 2026-09-21

Détail complet dans `docs/chantiers.md` (chantier 112) et `A_VERIFIER.md` § Chantier 112.

### 114 — ✅ Fait le 2026-09-21 — Onboarding : clarifier que « passif » n'est pas un engagement définitif

Détail complet dans `docs/chantiers.md` (chantier 114) et `A_VERIFIER.md` § Chantier 114.

### 118 — ✅ Fait le 2026-09-21 — Un modérateur « physique » retiré devient un session_member normal, flagué modérateur

Le chantier 119 avait déjà posé la moitié du travail (`sync_table_assignment` dès `claim_table_as_moderator`, Option B de la spec d'origine) sans jamais flaguer `is_moderator = true`. Ce chantier ferme le reste : `claim_table_as_moderator` flague désormais la ligne `session_members`/pose `active_moderator_member_id` ; `release_table_moderation` ne retire plus le drapeau au retrait (change de philosophie sur demande de Jules — démet seulement l'exercice, « modérateur en surplus ») et rattrape à la volée les lignes orphelines créées avant le chantier 119 ; `table_has_moderator` gagne la même garde `active_moderator_member_id` que `is_table_moderator` (chantier 106), sans quoi un modérateur resté flagué aurait bloqué toute reprise de sa table. Détail complet, vérifications en base (trois transactions jetables) et recette navigateur restante dans `docs/chantiers.md` (chantier 118) et `A_VERIFIER.md` § Chantier 118.

### 120 — `App.tsx` : le renouvellement du jeton anonyme peut désynchroniser `session_members.user_id` — ✅ fait, voir `docs/chantiers.md`

> 🔍 Découvert en aparté au chantier 119 (pas un correctif — un signal détecté en relisant `sync_table_assignment` pendant l'audit du code de rappel), non confirmé à l'époque par un repro réel.
>
> ✅ **Confirmé le 2026-09-21** par repro en base (transaction jetable `BEGIN…ROLLBACK`, recette complète dans `A_VERIFIER.md` § Chantier 120) : `sync_table_assignment` appelée avec un nouvel `auth.uid()` mais le même pseudo échoue silencieusement (`UNIQUE(session_id, pseudo)`, avalée par le `EXCEPTION WHEN OTHERS` du chantier 111) — l'ancienne ligne `session_members` reste orpheline sous l'ancien `user_id`, la nouvelle identité n'a aucune ligne. Détail dans `docs/chantiers.md` (chantier 120).
>
> **Décision de Jules (2026-09-21, option B)** : « on redemande le code, car le modo peut lui redonner aussi son code au cas où, et le superadmin aussi, donc je ne vois pas trop le problème de cette option là. » — reconnexion explicite (pseudo + code) plutôt que réassignation silencieuse par pseudo, qui aurait rouvert l'usurpation par pseudo fermée au chantier 93.
>
> **Fait et vérifié le 2026-09-21** — en base (transaction jetable, tous les cas : jeton renouvelé / mauvais code / bon code) **et** au navigateur réel (séance QA créée/purgée en base, écran « Reconnexion nécessaire » affiché puis reconnexion réussie, `session_members.user_id`/`participants.user_id` alignés après coup). Détail complet dans `docs/chantiers.md` (chantier 120) et `A_VERIFIER.md` § Chantier 120.

**Le mécanisme suspecté** : `App.tsx` (init, ligne ~50-90) restaure une table depuis `localStorage` au démarrage. Si le `participant_id` stocké ne correspond plus à l'`auth.uid()` courant (jeton anonyme renouvelé — veille longue, navigateur in-app Messenger, purge Safari ITP — cas déjà documenté au chantier 110 pour l'autorité de modération), `App.tsx` rappelle `join_table(joinCode, pseudo)` pour relier le nouvel `auth.uid()`. Ce `join_table` appelle `sync_table_assignment(session_id, table_id, pseudo)`, qui cherche la ligne `session_members` par `WHERE session_id = ... AND user_id = auth.uid()` — avec le **nouvel** `auth.uid()`, elle ne trouve donc **pas** l'ancienne ligne (dont le `user_id` est resté l'ancien jeton). Elle tente alors un nouvel `INSERT`, qui devrait échouer sur `UNIQUE(session_id, pseudo)` — capturé par le bloc `EXCEPTION WHEN OTHERS` de `sync_table_assignment` (chantier 111), qui se contente d'un `RAISE WARNING` et continue silencieusement. Résultat suspecté : la ligne `session_members` de la personne reste rattachée à son **ancien** `user_id`, orpheline, pendant que son nouvel appareil/jeton n'a plus aucune ligne — perte d'accès au questionnaire post-débat, aux résultats, et au vote (`cast_vote`/`submit_entry_response` cherchent `session_members` par `user_id = auth.uid()`), indépendamment de tout code de rappel.

**Première étape, avant de coder** : confirmer avec un vrai repro (renouveler le jeton d'un appareil de test — vider `IndexedDB`/`localStorage` de Supabase Auth sans toucher au `localStorage` applicatif de `tableStore`, ou simuler en base : `UPDATE session_members SET user_id = gen_random_uuid() WHERE ...` sur une ligne de test, puis observer si `join_table` la retrouve). Si confirmé, deux pistes possibles (à ne pas trancher avant d'avoir confirmé le bug) : (a) `sync_table_assignment` pourrait chercher la ligne existante par `(session_id, pseudo)` en complément de `(session_id, user_id)`, et faire un `UPDATE user_id` plutôt qu'un `INSERT` quand elle la trouve par pseudo — mais cela ouvrirait un vecteur de prise d'identité par simple connaissance du pseudo, à contrebalancer avec le modèle de code de rappel du chantier 93 ; (b) traiter ce cas comme une reconnexion explicite (`confirm_attendance`, qui exige déjà pseudo + code) plutôt que de le laisser transiter silencieusement par `join_table`.

**Fichiers concernés si confirmé** : `supabase/migrations/…` (`sync_table_assignment`), potentiellement `src/App.tsx` (le point d'appel).

### 136 — `scripts/cleanup-worktrees.sh` ne connaît pas `dev` (script obsolète depuis l'introduction du workflow dev/main)

**Origine** : signalé par une autre conversation, confirmé et discuté avec Jules le 2026-09-25 — pas un bug qui casse quoi que ce soit (le script se trompe du côté prudent), mais une désynchronisation avec le workflow dev/main introduit ce jour-là (voir `CLAUDE.md` § Environnements — dev / prod).

Le script :
- refuse de tourner si la racine locale n'est pas sur `main` (`MAIN_BRANCH="main"` codé en dur, vérification stricte en tout début de script) ;
- décide qu'un worktree/branche est nettoyable via `git merge-base --is-ancestor <sha> "$MAIN_BRANCH"` — donc tout ce qui n'est mergé que dans `dev` (et pas encore promu vers `main`) est vu comme « pas mergé » et reste indéfiniment listé comme conservé, même une fois le chantier terminé côté `dev`.

**Effet concret** : les worktrees/branches de chantiers déjà mergés dans `dev` mais pas encore dans `main` s'accumulent sans que ce script les nettoie — il rattrape tout dès que `dev` est mergé vers `main`, mais pas avant. Aucune perte de données possible (le script ne supprime jamais une branche qui n'est pas un ancêtre de la branche de comparaison), juste un nettoyage moins fréquent que prévu.

**Corrections à envisager** (à trancher en démarrant, pas figées) :
1. Comparer à `dev` **et** `main` (un worktree/branche ancêtre de l'un ou l'autre est nettoyable), plutôt qu'à `main` seul.
2. Assouplir la vérification de branche courante en tête de script pour accepter `dev` en plus de `main` (actuellement `exit 1` si ni l'un ni l'autre).
3. Vérifier que `PROTECTED_BRANCHES` et le comportement des sections 2/3 (branches locales/distantes sans worktree) restent cohérents une fois `dev` introduit comme second point de comparaison — ne pas se contenter de rustiner la seule section 1 (worktrees).

Périmètre de fichiers : `scripts/cleanup-worktrees.sh` uniquement. Pas de garde-fou particulier au-delà de la prudence déjà intégrée au script (`set -uo pipefail`, mode simulation par défaut) — tester en dry-run avant tout `--go`.

---

## Bloqués — rien à faire côté code

**Au 2026-09-20 : aucun chantier bloqué.** Le 83 (redéploiement `gemini-proxy`) et le 85 (sauvegardes chiffrées) sont tous les deux faits — voir `docs/chantiers.md`.

---

## Dette permanente, pas un chantier

**La vérification navigateur.** `A_VERIFIER.md` reste le seul fichier qui dise ce qui a réellement été vu à l'écran, dont une douzaine d'entrées **validées avant la refonte des chantiers 73/74 du 06/09 et à revalider**. Presque tout ce qui est mergé et déployé n'a eu qu'une vérification `tsc` / tests / build. « Mergé » ne veut pas dire « vérifié ». Une seule session à la fois peut lancer le serveur de dev.

**L'ordre de traitement de la sécurité** est donné par `docs/2026-09-06-plan-securite-consolide.md`, qui a relu chaque constat des anciens audits contre le code et la base. Son ordre d'origine était : sauvegardes → réserves `results_public` → test Realtime du 51 → chantier 55 → 56 → 58 → 59. **Mis à jour au 2026-09-20 — tout cet ordre est fait**, y compris les sauvegardes : réserves `results_public` (chantier 80), test Realtime du 51 (chantier 86), chantier 58, **chantier 59 (clos, « Allow public access » désactivé)**, preuve d'identité (chantier 93, ex-55), **durcissement SQL (chantier 56)**, et **sauvegardes chiffrées quotidiennes (chantier 85, mergé sur `main` le 2026-09-20 — les deux secrets GitHub `SUPABASE_DB_URL`/`BACKUP_PASSPHRASE` ont été créés par Jules)**.

**Durcissements jamais élevés au rang de chantier**, listés au §5 du plan consolidé et toujours ouverts : A3 (pas de limitation de débit sur `check_superadmin_password`), C4 (aucune limite de longueur ni de débit sur les soumissions), C7 (`tables_update_moderator` ne restreint aucune colonne — un modérateur peut réécrire le `join_code` ou le `session_id` de sa propre table), et la suppression du second projet Supabase inactif (`fcdhbgsqzvxepzvjweod`).

**Nouveau, trouvé le 2026-09-20 en testant le chantier 83** : le quota de débit de `gemini-proxy` (chantier 57, 20 req/60s) ne se déclenche jamais en pratique — testé au navigateur avec 122 appels réels, zéro `429`. Le compteur est une `Map` en mémoire par instance Edge Function, et rien ne garantit qu'un appel retombe sur la même instance que le précédent. Seul le plafond de taille (413, 300 Ko) protège réellement. Correctif fiable : compteur partagé côté Postgres (déjà envisagé puis écarté au chantier 57 pour éviter une écriture par appel) — pas fait, hors périmètre du 83. Détail dans `A_VERIFIER.md` § Chantier 83.
