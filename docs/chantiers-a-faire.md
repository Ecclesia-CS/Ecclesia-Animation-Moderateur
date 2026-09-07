# File d'attente des chantiers

> **Ce fichier dit ce qui reste à faire.** `docs/chantiers.md` dit ce qui a été fait. Les deux sont complémentaires, aucun ne remplace l'autre.
>
> **Pour une session à qui on demande « lance le chantier suivant »** : prends le **premier chantier de la section « À faire, dans l'ordre »** qui n'est pas marqué bloqué, exécute-le, et **mets ce fichier à jour** avant de finir — déplace l'entrée vers `docs/chantiers.md` avec son statut. Si tu n'y touches pas, la session suivante refera le même.

Dernière mise à jour : **2026-09-07**.

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

## À faire, dans l'ordre

### 79 — Écran de comparaison avant / après débat
**Parcours superadmin.** Le chantier 70 a construit toute l'infrastructure (`assertion_vote_history`, `vote_scope`, `get_all_votes_for_analysis(..., p_vote_scope)`, `list_session_analyses`, `get_analysis_by_id`) et s'est arrêté avant l'écran. Jules : « on pourra relancer l'analyse, et voir comment les positions idéologiques ont bougé après le débat », puis « oui je veux bien que tu construises l'écran de comparaison ».
Périmètre : `AnalysisPanel.tsx`, `lib/analysis.ts`, onglet Analyse de `SuperadminScreen.tsx`.
⚠️ Piège central : deux analyses successives ne numérotent pas les camps pareil (`group_id` k-means, k peut différer). Apparier sur la composition réelle, jamais sur le numéro — sinon le résultat est faux et convaincant.
Branche `chantier-79-comparaison-avant-apres` déjà créée.

### 80 — Résultats publics : ne pas pouvoir remonter aux participants
**Sécurité.** Jules, 07/09 : « pour la page publique, il ne faut pas qu'on puisse remonter aux participants, ou alors, il faut le rendre dur (et l'anonymat et changement de l'ordre des points comme tu l'as écrit est largement suffisant) ».
Trois choses, et rien d'autre : vérifier qu'aucun identifiant ni pseudo ne sort de `get_public_results` ; **désordonner les points côté serveur** (leur ordre d'insertion trahit l'ordre d'inscription) ; poser le `SET search_path` manquant.
**Explicitement refusé par Jules** : pas de seuil de k-anonymat (« pour identifier des points isolés, ne travaillons pas dessus, ce n'est pas grave »), ne pas toucher aux compteurs par assertion, **ne couper aucune séance déjà en ligne** (« ne coupe pas l'affichage de séance en ligne OJD svp »), et **ne pas appliquer la règle à l'écran participant** (« c'est bien qu'un participant puisse se situer »).
Périmètre : `PublicResultsScreen.tsx`, `get_public_results`. ⚠️ Cette fonction a été réécrite le 06/09 pour filtrer `vote_scope = 'current'` — ne pas repartir d'une version antérieure.
Branche `chantier-80-reserves-results-public` déjà créée.

### 75 — Retirer les trois onglets de l'écran principal
**Parcours.** Jules, 06/09 : « Pour la création de table, aucun pb, c'est le superadmin qui gère. Pour le fait de rejoindre une table avec uniquement le code, normalement, quand on clique sur la séance, on doit pouvoir mettre le numéro de la table en retard, donc joindre avec uniquement le numéro. Je ne vois pas de problème. Quant au fait de rejoindre la séance à partir uniquement du numéro, personne ne fait ça. »
Retirer « Modérateur », « Rejoindre » et « Créer » de `EntryScreen.tsx`.
⚠️ Il dit « on **doit pouvoir** » : c'est peut-être une attente, pas le code réel. **Vérifier d'abord** que le chemin du retardataire existe et est atteignable en pleine phase débat (`switch_table` depuis `AllocatingScreen`, `JoinTableForm` à l'étape `ended` de `VoteScreen` — ce dernier ne reçoit pas de `sessionId`). S'il n'existe pas, le construire d'abord, retirer ensuite.

### 55 — Le code de rappel devient la preuve d'identité
**Sécurité + parcours.** Aujourd'hui `reclaim_code` n'est généré qu'en `pre_voting` : ceux qui arrivent pour le vote présentiel n'en ont pas, donc **le nom seul suffit à reprendre une inscription**. Jules veut le générer sur plus de phases pour pouvoir exiger le code, et qu'on **explique au participant** que ce code sert à éviter l'usurpation d'identité.
⚠️ **Question à lui poser avant de lancer** : il a écrit « on l'utilisera aussi pour les sources collaboratives », dont le sens n'a jamais été clarifié.
Touche l'inscription — donc gelé pendant les fenêtres de production.

### 86 — Vérifier au navigateur l'anonymat des auteurs d'assertions (chantier 51)
**Sécurité.** Le chantier 51 a fermé l'exposition des auteurs d'assertions, mais le volet **Realtime** n'a jamais été testé : une charge utile Realtime peut transporter des colonnes que la requête REST ne renvoie plus. Vérification navigateur, avec le jeton de serveur de dev.

### 58 — Restreindre les colonnes publiques de `sessions`
**Sécurité.** Branche `chantier-58-colonnes-sessions` déjà écrite. Ses 4 RPC de lecture sont **déjà en base** ; le `REVOKE SELECT ON sessions` + `GRANT` restreint ne l'est pas.
Ordre : merger et déployer la branche **d'abord**, appliquer le `REVOKE` **ensuite**. ⚠️ **Avant d'appliquer, ajouter `onboarding_enabled` à la liste des colonnes accordées** — colonne créée par le chantier 71, postérieure à cette branche ; sans ça l'interrupteur d'onboarding cesse de marcher côté participant.

### 59 — Canaux Realtime privés
**Sécurité.** Branche `chantier-59-realtime-prive` livrée, migration écrite **non appliquée**. Le seul trou réel est l'**émission de broadcast** ; le `postgres_changes` est déjà protégé par les policies depuis le chantier 50.
⚠️ Ordre non négociable : appliquer la migration (sans effet observable) → déployer le code → dérouler la recette → **et seulement ensuite** désactiver « Allow public access » dans le dashboard Supabase (Realtime → Settings). Ce réglage est global et hors SQL ; sans lui le chantier ne ferme rien, et l'appliquer trop tôt casse toute la production. Rollback d'urgence : le réactiver, effet immédiat.

### 81 — Se déclarer modérateur au moment de la récupération de compte
**Parcours.** Complète le chantier 73, qui a mis la déclaration modérateur sur les formulaires d'inscription mais pas sur les écrans de reconquête d'identité (« c'est bien moi » / code de rappel).

### 82 — Reconnexion par pseudo après clôture
**Parcours.** Un participant qui revient après la clôture, sur un autre appareil, ne peut pas se reconnecter : `reclaim_prevoting_member` est phase-safe et refuse, `reclaim_code` est purgé à la clôture (chantier 49). Il ne voit donc jamais ses résultats personnels.

### 56 — Durcissement SQL
**Sécurité.** Fermer `app_config`, figer le `search_path` des fonctions à mot de passe.
⚠️ **Peut verrouiller Jules hors de sa propre base.** À ne faire que lorsqu'il est disponible et joignable, jamais à l'approche d'une utilisation en production, jamais pendant qu'il dort.

### 87 — Revue complète des parcours utilisateurs
**Parcours.** Sujet de fond réservé par Jules. Il veut **réexpliquer lui-même** comment l'application et son flux sont censés fonctionner à chaque instant, et préfère une conversation dédiée lancée en **un prompt unique** qui attend son texte. **Ne rien analyser avant d'avoir reçu ce texte.**

### 88 — Dette héritée (annexe B de `docs/chantiers.md`)
Les six items encore au statut `Backlog` repris de l'ancien `PROJECT_STATUS.md` (D1, A2, A3, A4+D17, C7, C2), plus le reste-à-faire historique : notifications toast, page 404 / table expirée élégante, persistance de la pause après rechargement, tests manuels sur mobile (iOS Safari, Android Chrome), génération du QR code dans l'interface superadmin.

---

## Bloqués — rien à faire côté code

### 85 — Sauvegardes chiffrées quotidiennes
Branche `chantier-secu-sauvegardes` prête. **Bloqué sur Jules** : créer les secrets `SUPABASE_DB_URL` et `BACKUP_PASSPHRASE` dans les réglages GitHub du dépôt. C'est le premier item de l'ordre de traitement du plan de sécurité consolidé — une base sans sauvegarde vérifiée est le risque le plus élevé du projet.

### 83 — Redéployer `gemini-proxy`
Le prompt de fusion d'assertions a été durci (typage prescription / jugement / constat) mais **n'a jamais été redéployé** : la version en ligne est l'ancienne. **Bloqué sur Jules** : demande un `supabase login`.

---

## Dette permanente, pas un chantier

**La vérification navigateur.** `A_VERIFIER.md` compte **52 entrées ouvertes**, dont **12 validées avant la refonte des chantiers 73/74 du 06/09 et à revalider**. Presque tout ce qui est mergé et déployé n'a eu qu'une vérification `tsc` / tests / build. « Mergé » ne veut pas dire « vérifié ». Une seule session à la fois peut lancer le serveur de dev.

**L'ordre de traitement de la sécurité** est donné par `docs/2026-09-06-plan-securite-consolide.md`, qui a relu chaque constat des anciens audits contre le code et la base d'aujourd'hui : sauvegardes → réserves `results_public` → test Realtime du 51 → chantier 55 → 56 → 58 → 59.
