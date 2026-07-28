# Ecclesia — État du projet

> Descriptions complètes des tâches : voir `ecclesia_plan_chantiers.md`. Ce fichier ne recense que le statut courant — à mettre à jour au fil des PR. Statuts possibles : `Backlog` / `En cours` / `Bloqué` / `Terminé`.

Dernière mise à jour : 28/07/2026 — **Chantier 27 : fusion des menus "Outils Modo" (H22)** — il existait deux menus distincts portant ce nom dans `ModeratorView` : `ModeratorToolsButton` (chantier 21/F7, un seul item — QR code de la table) et un dropdown en ligne (transcription, historique, forçage questionnaire). Le bouton "Camps" séparé (chantier 20/G7) était un troisième point d'entrée. Les trois sont désormais fusionnés dans `ModeratorToolsButton`, seul menu "Outils Modo" du header : Camps, QR code, Historique, Forcer/Annuler questionnaire, Transcription. `TableOpinionButton.tsx` renommé `TableOpinionModal.tsx` (modale contrôlée `isOpen`/`onClose`, n'était utilisée qu'à cet endroit). Modale d'accueil modérateur (H23) mise à jour pour refléter la fusion. `npx tsc --noEmit`/`npm run build`/`npm test` (62/62) OK. Vérifié en Browser pane sans erreur console (table "sans modérateur" créée puis flag `isModerator` basculé en local pour atteindre `ModeratorView`, faute du code Ecclesia réel) — chaque item du menu testé individuellement. **Reste un test manuel avec une vraie table modérée** (code Ecclesia requis, non détenu) : voir A_VERIFIER.md.

Mise à jour précédente : 28/07/2026 — **Chantier 25c : flow de sélection des modérateurs en surplus** — précision de Jules après le 25b. Décocher un modérateur est désormais une **sélection purement locale** : aucun appel réseau, aucun recalcul automatique. Tout est différé et groupé au clic sur « Appliquer », qui (1) recalcule avec la sélection, (2) crée les tables, (3) **et seulement en cas de succès** retire `is_moderator` aux décochés — jamais quelqu'un qui perd son statut sans que les tables existent ; en cas d'échec, message explicite et sélection conservée. État constaté avant correctif : le flag partait bien dès le clic sur la case, mais l'algorithme, lui, ne se relançait pas (déjà conforme) ; troisième écart non identifié au départ, le décochage **désactivait « Appliquer »** jusqu'à un « Recalculer » manuel — supprimé. La liste s'ouvre et passe en ambre dès qu'un surplus est détecté, en précisant que sans décochage l'algorithme désigne d'office les derniers inscrits. `npm test` 62/62, zéro erreur console, sémantique exercée dans le bundle réel : décocher Mod0 fait bien animer les trois autres (le choix porte sur *qui*, pas seulement sur le nombre). **Migration `20260727_4` (H18) confirmée appliquée en base** via l'accès Supabase MCP, disponible cette session. **Reste le parcours UI** : aucune séance testable actuellement (`GENER1` est en `voting` avec 0 modérateur) — voir A_VERIFIER.md.

Mise à jour précédente : 28/07/2026 — **Chantier 23 : petits fixes UX & texte livrés (H1, H2, H7, H8, H24)** — vague 4, aucune dépendance, aucune migration nécessaire. H1 : placeholder générique "Prénom Nom" (au lieu de "Ex : Marie Dupont", jugé encore trop concret) dans les 4 formulaires concernés. H2 : titres de séance trop longs — `truncate` → `break-words` sur la carte "Séances en cours" du menu principal (`EntryScreen`), passage à la ligne au lieu du troncage. H7 : sens de "Passe" précisé à 2 endroits (modale d'intro du vote + astuce sous les boutons sur la 1ʳᵉ assertion) — "ni l'un ni l'autre, ou que la question n'est pas claire", pas une abstention passive. H8 (bug corrigé) : le bouton flottant "← Menu" (`QuitLink`, fixed top-3 left-3) chevauchait le compteur "Question X/3" de l'onboarding — marge haute de la barre de progression augmentée (`pt-5` → `pt-14`), chevauchement vérifié nul par mesure de positions DOM. H24 : texte explicatif ajouté sous le QR code de table (`QrCodeModal`, utilisé par les menus Outils participant et modérateur). Développé en worktree dédié (`chantier-23-petits-fixes-ux`, port 5188). `npx tsc -b` OK. **Vérification navigateur complète** (parcours entrée → onboarding → vote → table `leaderless` → QR code) sur la séance de test partagée, zéro erreur console. Voir A_VERIFIER.md pour le détail des vérifications et un effet de bord d'environnement sans rapport avec le code (clics `computer` inopérants dans cette session, contournés via `javascript_tool`).

Mise à jour précédente : 27/07/2026 — **Chantier 25b : arbitrages modérateurs en surplus (H12/H16/H17)** — deux décisions de Jules après le chantier 25. (1) **Décocher un modérateur retire réellement `is_moderator` en base** (`set_member_moderator`, RPC existante — aucune migration) : il redevient un membre ordinaire, la liste n'est plus un filtre local mais un interrupteur persistant, réversible en recochant. (2) **Un modérateur en surplus n'est plus « assis après coup »** dans la table la moins remplie : il entre dans la population **avant** la recherche et est optimisé par les règles 1 à 5 comme n'importe quel participant. La circularité (asseoir quelqu'un change le nombre de tables, donc le surplus) est levée par **énumération** du nombre `k` de modérateurs animants, avec le critère de cohérence `k ≤ T` — l'itération naïve vers un point fixe, elle, diverge (elle transformait `[10,10,10]` en 6 tables). Ajout d'un garde-fou : une signature des entrées est enregistrée au calcul, et « Appliquer » est désactivé tant que les réglages ont changé depuis. **Trouvé en passant, non corrigé** : le taux d'échec de la règle 4 (`-fail4/T`) fait fragmenter la salle dès que les anciens passent sous 40 % — reproduit sans aucun modérateur en jeu (31 personnes : 4 tables à 42 % d'anciens, **6 tables à 39 %**), alors que le §5 désigne ce cas comme normal. Le correctif testé (manque total au lieu du taux) casse l'exemple normatif du §4 ; à traiter comme un chantier à part. `npm test` 62/62, zéro erreur console, 4 scénarios vérifiés dans le bundle réel — aucun modérateur laissé sans affectation. **Reste le parcours UI superadmin** (mot de passe requis) : voir A_VERIFIER.md.

Mise à jour précédente :  27/07/2026 — **Chantier 24 : flow d'entrée modérateur — H3/H4/H5/H6/H11/H23** — suite du chantier 21, retours de test de Jules. H3 : case à cocher "Je suis modérateur" avant le bouton Rejoindre (remplace le lien texte après coup). **H4 (changement de comportement)** : `claim_moderator_status` n'exige plus d'être déjà inscrit sur cet appareil — sans profil existant, il en crée un à la volée (comme une inscription normale, `attending_in_person=true`) puis le marque modérateur ; avec profil existant, comportement inchangé (marquage seul). Migration `20260727_5_chantier24_claim_moderator_create_profile.sql` **non appliquée** (MCP Supabase indisponible ; renommée `_4` → `_5` pour éviter la collision d'ordinal avec la migration du chantier 25, mergée en parallèle). H5 : texte de l'écran "Débat en cours" (2 emplacements) mis à jour. H6 : message "Fais un screen" sorti en bandeau, plus grand et plus haut. H11 : badge "Vous êtes modérateur" + modale explicative pendant vote/prévote. H23 : modale d'accueil modérateur (glisser-déposer/files/bouton Camps/Outils Modo) à l'arrivée en phase `debating`. Développé en worktree dédié (`chantier-24-flow-moderateur-entree`, port 5186). `npx tsc -b`/`npm run build`/`npm test` OK. H3 vérifié interactivement ; H4 vérifié en confirmant l'échec propre côté client tant que la migration n'est pas appliquée (aucune donnée créée) ; H5/H6/H11/H23 non vérifiables en direct cette session (aucune séance de test en `pre_voting`/`debating`, mot de passe Ecclesia/superadmin non saisi) — voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 25 : allocation v2, modérateurs en surplus / persistance / dimensionnement (H12-H18)** — retours du test manuel de Jules sur `VERIF7`. **Investigation avant correction** (demandée explicitement) : chaque symptôme a été reproduit en exécutant `runAllocation` sur des populations synthétiques, ce qui a séparé les vrais bugs des comportements conformes à la spec. **Bugs réels** : (H17) un modérateur en surplus par rapport au nombre de tables était **silencieusement absent du résultat** — ni animateur, ni participant, donc aucune ligne dans `table_assignments` ; il est désormais placé comme participant ordinaire dans la table la moins remplie, avec ses attributs réels d'onboarding. (H18) `apply_allocation` ne faisait rien des tables excédentaires laissées par un calcul précédent plus large : elles gardaient leur `session_id` et ressurgissaient plus tard via `list_session_tables` — désormais détachées si elles sont vides, signalées sinon. (H14) la proposition de répartition était perdue à chaque changement d'onglet ou rechargement (`useState` d'un composant démonté) — persistée en `sessionStorage`, jamais en base. **Comportements conformes à la spec, mais muets, désormais expliqués** : (H13) ajouter des modérateurs ne change rien dès que toutes les tables sont déjà animées (`moderatedCount` sature et le §4 préfère moins de tables) — contre-épreuve faite avec 0 modérateur inscrit, où le même champ change bien le résultat à chaque incrément ; (H15) c'est le champ « Enregistreurs disponibles » qui pilotait le découpage en `[10, 5, 5, 5]` décrit par Jules — reproduit exactement à `recorderCount = 3`, alors qu'à 1 l'algorithme produit bien le `[10, 10, 5]` qu'il dit préférer ; la règle 2 est prioritaire sur la politique de dimensionnement (§4/§5), l'objectif effectif est maintenant affiché. **Ajouts** : (H16) liste à cocher des modérateurs réellement présents, les décochés étant réinjectés comme participants ; horodatage du calcul pour que « relancer » soit visible même à résultat identique. `npm test` 49/49 (41 tests existants inchangés). Migration `20260727_4_chantier25_allocation_surplus.sql` **non appliquée** (MCP Supabase indisponible cette session) — le correctif H18 est inactif tant qu'elle ne l'est pas. **Reste le parcours UI complet** (mot de passe superadmin requis, non détenu) : voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 17 : E4 repensé (F15) + reporting tokens (F18-F22)** — suite du chantier 6. F15 : nouvelle section "🙋 Recrutement modérateurs" dans l'onglet Analyse du superadmin, zoom sur `staff_interest` (champ texte libre du questionnaire de fin de séance, confirmé distinct de `session_members.is_moderator` utilisé par l'algo d'allocation). F18 : bouton "Rapport" → "Rapport token". F19 : bloc d'estimation d'énergie (C6) retiré, remplacé par le nom du modèle Gemini réellement utilisé (retourné par l'Edge Function). F20 : ajout de `thoughts_tokens` (tokens de réflexion) au rapport. F21 (bug corrigé) : dans `nameSingleGroup` (`lib/gemini.ts`), le rejet d'un nom générique ("Groupe 3") levait une erreur avant que les tokens de cette tentative ne soient retournés — perdus pour le rapport alors que réellement consommés côté API ; corrigé avec une classe d'erreur dédiée (`GenericNameError`) qui transporte l'usage de la tentative rejetée, comptée par l'appelant (`groupNaming.ts`). F22 : le rapport détaille désormais les 3 champs bruts Gemini (`prompt_tokens`/`completion_tokens`/`total_tokens`) plus `thoughts_tokens`, sans recalcul côté client. Développé en worktree dédié (`chantier-17-analyse-camps-tokens`) en parallèle du chantier 16 — aucun chevauchement de fichiers constaté. **1 appel Gemini réel effectué** (quota) pour valider empiriquement F21 (720 tokens consommés confirmés sur l'Edge Function déployée). **Edge Function `gemini-proxy` modifiée mais non redéployée** (MCP Supabase indisponible cette session) — à redéployer pour que `thoughts_tokens`/modèle apparaissent réellement dans le rapport. Voir A_VERIFIER.md pour le détail et le parcours manuel restant.

Mise à jour précédente : 27/07/2026 — **Chantier 16 : bug de routage post-clôture corrigé (F14)** — le bouton "Voir les résultats"/"Voir vos résultats" (overlay "Séance terminée" de `ParticipantView.tsx`/`ModeratorView.tsx`, phase `closed`) était un `<a href="#session/<code>">` rendu alors que `phase.type === 'table'` dans `App.tsx` — or le guard de routage (`hash.startsWith('#session/') && phase.type !== 'table'`) exclut explicitement ce cas, donc le clic changeait le hash du navigateur sans jamais monter `SessionRouterScreen` : le bouton semblait "ne rien faire". En cliquant ensuite "← Retour au menu" (`leaveTable()` → `phase: 'entry'`), le hash déjà positionné devenait exploitable au re-render suivant → la navigation aboutissait enfin, d'où le symptôme "indisponible puis accessible après avoir quitté". **Investigation d'abord** : confirmé qu'il ne s'agissait pas d'un artefact de séance de test sans analyse (`ResultsMapScreen`/`PublicResultsScreen` gèrent déjà proprement l'absence d'analyse avec un message "pas encore disponible", ce n'est pas ce qui était en cause). Corrigé en remplaçant les deux liens par des boutons dont le clic positionne le hash **et** appelle `leaveTable()` dans le même handler. Root cause + mécanisme du fix confirmés en direct dans le Browser pane (reproduction du blocage puis de la résolution en 2 temps, sans données de séance clôturée disponibles côté superadmin). Développé en worktree dédié (`chantier-16-resultats-cloture`) en parallèle du chantier 14 — voir A_VERIFIER.md pour le parcours de vérification complet restant (nécessite le mot de passe superadmin + une séance passée en phase `closed`).

Mise à jour précédente : 27/07/2026 — **Chantier 14 : lien table-sans-admin ↔ séance (F11)** — investigation approfondie avant correction (demandée explicitement) : les deux parcours de création réellement accessibles depuis l'UI (`EntryScreen` onglet "Créer" avec case "Table sans modérateur", et le bouton superadmin "+ Sans admin" dans une séance) passent déjà `session_id` à `create_table`/`admin_create_table` et **lient déjà correctement la table à sa séance** — vérifié à la fois par lecture de code et empiriquement (table de test créée via le vrai formulaire `EntryScreen` contre la séance réelle `GENER1`, lue ensuite via l'API REST : `session_id` bien renseigné). **Le vrai bug trouvé est un trou de sécurité RPC, pas un bug UI** : `create_table` avait un garde-fou `IF p_session_id IS NULL THEN RAISE EXCEPTION 'session_required'` ajouté le 26/05 (migration `20260527000003_fix_tables_mandatory_session.sql`), silencieusement perdu le 01/06 quand `20260618_leaderless_tables.sql` a refait un `DROP FUNCTION`/`CREATE OR REPLACE` pour ajouter `p_leaderless` sans reporter ce garde-fou. Reproduit empiriquement : un appel RPC direct (hors UI, avec le token de la session anonyme du navigateur) avec `p_session_id: null, p_leaderless: true` réussit et crée une table réellement orpheline. Seul le frontend protège aujourd'hui contre ce cas — violation du principe déjà établi dans CLAUDE.md ("comparer les codes côté client — uniquement via `crypt()` en `SECURITY DEFINER`", même logique pour l'intégrité des données : ne jamais compter sur le seul frontend). **Correctif** : migration `20260727_3_chantier14_create_table_session_required.sql`, restaure le garde-fou dans `create_table` (inchangé pour `admin_create_table`, dont l'usage sans séance est une fonctionnalité intentionnelle — "Tables disponibles à rattacher" côté superadmin). **Migration appliquée et vérifiée par Jules** (via son propre accès Supabase MCP) : un appel direct à `create_table` avec `p_session_id: null` lève désormais bien l'erreur `session_required` au lieu de créer une table orpheline. Aucun changement frontend nécessaire (le chemin UI était déjà correct). Table de test créée et nettoyée moi-même (delete via REST, `created_by = auth.uid()`) — aucune donnée résiduelle. Voir A_VERIFIER.md (section « Validé ») pour le détail.

Mise à jour précédente : 27/07/2026 — **Chantier 13 : 404 persistant sur les fiches d'info corrigé (F10)** — cause racine : 4 copies dupliquées d'une logique de réécriture d'URL supposant un stockage interne (`public/docs/*.html` commité), dont une (`VoteScreen.tsx`, panneau Outils en phase de vote) avait un `BASE_DOCS` codé en dur sans le segment `/Ecclesia-Animation-Moderateur/` → 404 systématique sur GitHub Pages. Conforme à la décision C3 (2026-07-23, Jules — fiches hébergées sur un site externe séparé) : toute la logique de réécriture est supprimée, `doc_info_url`/`doc_summary_url` sont utilisés tels quels (passthrough), champ superadmin passé en URL libre. Aucune migration nécessaire (schéma inchangé). Développé en worktree dédié (`chantier-13-fiches-info-404`) en parallèle du chantier 12 — aucun chevauchement de fichiers constaté (seul `VoteScreen.tsx` touché des deux côtés, sur des zones distinctes, fusion automatique propre). **Reste à faire par Jules** : nettoyer l'URL localhost restée dans `doc_info_url` de la séance de test `GENER1` (nécessite le mot de passe superadmin) — voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 12 : ordre des assertions & changement de vote livré (F8-F9)** — F8 : bug réel trouvé et corrigé — le shuffle initial fonctionnait, mais toute assertion approuvée après le premier chargement (cas normal en séance réelle) était toujours ajoutée en fin de liste dans le même ordre pour tout le monde (Realtime + polling 10s), ce qui annulait l'effet du hasard en pratique ; corrigé avec une insertion à position aléatoire par élément. F9 : la modale "Voir toutes les assertions" affichait juste une icône cliquable sans libellé pour changer un vote déjà posé (contrairement au bouton "Voter" texté et à la liste "Tes votes" qui a déjà "Changer") — harmonisé avec une pastille icône+"Changer" identique aux autres boutons. Développé en worktree dédié (`chantier-12-ordre-assertions-vote`) en parallèle du chantier 13 — aucun chevauchement de fichiers constaté. **Reste à vérifier** : comportement de l'insertion aléatoire sur une nouvelle assertion approuvée pendant qu'un participant est déjà sur l'écran de vote (bloqué par modération fermée sur la séance de test disponible, mot de passe superadmin requis) — voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 22 : petits ajustements UX livrés** (G12/G13/G14) — pop-up unique remplaçant la bannière `pre_voting` (mémorisée en localStorage), message de clarification sur la perte du statut de participant en devenant animateur d'une table sans admin, suppression complète des timers de phase (`vote_timer_minutes`/`vote_threshold_percent` retirés du schéma et du front). Migration `20260727_2_chantier22_remove_vote_timers.sql` **non appliquée** (MCP Supabase indisponible cette session) — fournie en clair à Jules pour application manuelle. Développé en worktree dédié (`chantier-22-ajustements-ux`) en parallèle du chantier 11, après avoir détecté et résolu une collision de dossier de travail partagé avec cette session concurrente (aucune perte de travail). **Reste le parcours fonctionnel navigateur complet** (données de test `pre_voting`/`leaderless` + mot de passe superadmin requis) : voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 11 : petits fixes UX livrés (F1-F7)** — placeholder générique corrigé (F1), modale vote intro affichée une seule fois par séance (F3), affordance checkbox pour "Tout sélectionner" superadmin (F4), bug corrigé : le champ nom se vidait en changeant d'onglet sur l'écran de code de rappel (F5), bouton "Inviter un ami" supprimé au profit du QR code seul, accessible via Outils côté participant (F6) et via un nouveau menu "Outils Modo" côté modérateur (F7). F2 (nom des séances affiché) était déjà correct, vérifié par lecture de code. Vérifié en production (GitHub Pages) contre la séance de test réelle : F1 et F5 confirmés interactivement, F6/F7/F4 confirmés par inspection du bundle déployé. **Reste le parcours superadmin/modérateur complet** (mot de passe requis) : voir A_VERIFIER.md.

Mise à jour précédente : 27/07/2026 — **Chantier 21 : flow d'entrée modérateur & refonte menu participant livré** (G8/G9/G10/G11) — onglet « Modérateur » (remplace « Voter ») auto-déclarant via `claim_moderator_status`, fusion des onglets Rejoindre/Reprendre avec bouton « Je suis modérateur », fallback superadmin (G9) déjà suffisant depuis le chantier 19. Bug corrigé en passant : `AllocatingScreen.handleJoin` codait `isModerator` en dur à `false`, empêchant tout modérateur assigné par l'allocation d'arriver en `ModeratorView` au passage en `debating`. Développé en worktree dédié (`chantier-21-flow-moderateur`) en parallèle du chantier 20 — aucun chevauchement de fichiers constaté. **Reste le parcours fonctionnel navigateur complet** (mot de passe superadmin requis) : voir A_VERIFIER.md.

Mise à jour précédente : 25/07/2026 — **Chantier 19 (Vague 3) : algorithme d'allocation v2 livré ET les 3 migrations sont APPLIQUÉES en base** (`chantier19_onboarding_3_questions`, `chantier19_allocation_v2`, `chantier19_deprecate_chantier5`, versions `20260725120352/120433/120442`). Appliquées et vérifiées directement par Claude via le MCP Supabase, devenu disponible en cours de session (projet `plpjiehqsxxakbuykmkm`). Remplace la livraison de juillet sur B1/B2/E4 du chantier 5. Vérifications en base : conversion `ecclesia_experience` exacte (18 anciens / 6 nouveaux), `is_moderator` présent sur les 61 membres, les 5 nouvelles RPC joignables en rôle `anon` et échouant au bon contrôle d'auth, `get_moderator_responses`/`run_clustering_v3` supprimées, v1/v2 conservées. **Reste le parcours fonctionnel navigateur** (mot de passe superadmin requis) : voir A_VERIFIER.md.

Mise à jour précédente : 22/07/2026 — **6 migrations SQL appliquées en base + Edge Function `gemini-proxy` redéployée (v9, ACTIVE)**, rapporté par Jules via son propre outillage Supabase (cette session Claude Code n'a toujours aucun outil MCP Supabase dans son inventaire — vérifié en tout début de conversation). Migrations concernées : `delete_assertions_admin`/`hide_assertion_author` (chantier 9), `designate_moderator` (chantier 3), `moderator_responses`/`clustering_v3` (chantier 5), `update_assertion_content` (chantier 7). **Non vérifié fonctionnellement par une session avec accès navigateur** — voir A_VERIFIER.md pour le détail par chantier et les parcours manuels restants.

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
| B3 | Instabilité user ID / collisions pseudo | Backlog | | — |

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

*Pour référencer ce fichier depuis `CLAUDE.md`, ajouter une ligne du type : `Voir PROJECT_STATUS.md pour l'état courant des chantiers et ecclesia_plan_chantiers.md pour le détail des tâches.`*
