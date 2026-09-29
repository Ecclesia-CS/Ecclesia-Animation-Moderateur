# Lot 141d — portes Code Ecclesia + superadmin (2026-09-29) — PARTIEL

Environnement : **dev** (`mnjqrlrrzrycuconlfqb`), Vite local, `.env.local` pointé sur dev (non commité). Séances `QA141D-A/B` créées puis purgées (0 ligne restante). Le Code Ecclesia a été saisi **par Jules** dans le Browser pane ; je ne l'ai jamais vu.
Fixtures : séance A avec `QAD001` (animée, sans modérateur), `QAD002` (`leaderless`), `QAD003` (modérateur physique assis) ; séance B avec `QAD004`.

## Résultats

| Item `A_VERIFIER.md` | Résultat |
|---|---|
| Chantier 68 — cas nominal, table animée sans modérateur (`#session/<code>`) | ✅ code accepté, écran du code de rappel, `table_has_moderator` passe à `true`, `ModeratorView` s'ouvre (« Donner la parole »). |
| Chantier 68 — refus, table déjà modérée (modérateur physique) | ✅ « Cette table a déjà un modérateur — choisis-en une autre ou contacte le superadmin » ; aucun membre ni participant créé. |
| Chantier 68 — refus, code d'une autre séance | ✅ « Ce code de table n'appartient pas à cette séance » ; rien écrit. |
| Chantier 68 — table `leaderless` prise volontairement | ✅ `leaderless` passe à `false`, `has_mod=true`. ⚠️ voir **A1**. |
| Chantier 140 — porte modérateur par code de table avec le nom d'un autre (autre casse) | ✅ accordéon « code de rappel » ouvert, rien écrit à la table visée. |
| Chantier 143 — prise effective de modération d'une table libre | ✅ (même test que la ligne `leaderless`). |
| Chantier 142/140b — `add_offline_participant` avec le nom d'une personne déjà assise | ✅ refusé (« Une personne est déjà assise à cette table sous ce nom. ») pour une autre personne, **casse ignorée**. ⚠️ mais voir **A2**. |

## Anomalies

- **A1 — ⚠️ à confirmer, mineur/grave selon reproductibilité · front** : après la prise d'une table **`leaderless`** par la porte modérateur, le clic sur « Rejoindre la table → » ouvre la vue **participant** (« Demander la parole », « Outils » sans « Donner la parole ») pour le preneur, alors qu'en base il est bien modérateur (`leaderless=false`, `active_moderator_member_id` posé, `created_by` = son uid). Un **rechargement** de la page affiche correctement `ModeratorView`. Avec une table animée non `leaderless` (`QAD001`), le passage est direct, sans rechargement. Observé une seule fois ; l'entrée d'`A_VERIFIER.md` (l. 1258-1262) attend justement un basculement vers la vue modérateur. Piste : `physicalModerator` n'est pas remis à jour quand la table passe de `leaderless=true` à `false` après l'entrée (listener Realtime de `TableContext`).
- **A2 — mineur, pas de garde sur le nom du modérateur lui-même · SQL** : `add_offline_participant` porte `AND user_id IS DISTINCT FROM auth.uid()` dans son test de doublon. Le modérateur étant lui-même assis sous son `auth.uid()`, **ajouter une personne sans téléphone qui porte son propre nom (autre casse : « QA MODO TROIS » vs « QA Modo Trois ») a créé un second participant** au lieu d'un refus. Le même nom à la casse exacte tomberait dans `ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id` (reprise silencieuse, non testée).
- **A3 — cosmétique · front** (`JoinTableForm.tsx:244`) : après un conflit de nom, l'accordéon « code de rappel » reste ouvert et vide ; corriger le nom ne le referme pas, et « Rejoindre » reste grisé sans explication (`disabled` si `reclaimOpen && !reclaimCode`).

## Volet superadmin (mot de passe saisi par Jules dans le Browser pane)

Séance `QA141D-S` en `debating` (3 tables, 8 membres dont 2 marqués modérateurs), `QA141D-C` (clôturée), `QA141D-V` (vote), `QA141D-Draft` (créée par l'interface). Tout purgé (0 ligne restante : séances, tables, membres, participants, affectations).

| Item `A_VERIFIER.md` | Résultat |
|---|---|
| Chantier 50 — onglet 🪑 Tables sous policies self-only (l. 1342) | ✅ compositions et pseudos complets, aucun `?`, **aucun** message `[chantier 50] … repli …` en console. |
| Chantier 50 — polling 10 s | ✅ une affectation déplacée en base apparaît à l'écran sans action ; horodatage « à jour à » avancé toutes les 10 s, sans spinner. |
| Chantier 38 — scroll qui remonte | ✅ `scrollY` stable à 1053 px pendant ~45 s sur l'onglet Tables (polling actif). |
| Chantier 33 — désigner un modérateur par nom (autocomplete), nom inexistant, « Retirer » | ✅ badge « 🎙️ Modérateur : … », message « Aucun participant inscrit avec ce nom — vérifie l'orthographe. », « Retirer » → simple participant de la même table, retour de « ⏳ En attente de modérateur ». Glisser-déposer non joué. |
| Chantier 36 — pas de doublon du modérateur | ✅ le modérateur n'apparaît qu'une fois (badge, pas en puce). |
| Chantier 37 point 2 — cocher « modérateur » sur quelqu'un de la table déjà pourvue | ✅ Nadia (table 1, déjà animée) déplacée sur la table 2 sans modérateur ; table 3 laissée. |
| Chantier 37 point 1 — pas de « Répartir en tables » en phase `voting` | ✅ (fusion IA auto au passage en `allocating` : non jouée, Gemini absent de dev). |
| Chantier 54 — suppression d'une table vide par le superadmin | ✅ table créée par « + Sans modérateur » puis supprimée avec confirmation ; les 3 autres intactes. |
| Chantier 46 — bascule « Résultats privés/publics » (l. 1298) | ✅ `results_public` passe à `true` en base. |
| Chantier 65 — superadmin sur brouillon (l. 1469) | ✅ création avec titre, description, URL de documentation (sauvegardée), passage `draft → pre_voting` après confirmation. Non joué : rattacher/détacher une table. |
| Chantier 39 | déjà couvert par 141b (`lot-b.md`). |

Observation supplémentaire — **cosmétique** : la bannière « Table créée ! Code : … » reste affichée après la suppression de cette même table.

## Non joué à ce stade

Chantier 35 (Realtime multi-onglets, deux identités), chantier 57 (quota `gemini-proxy`, non déployé sur dev), 108, 113, 107/110 par code, idempotence modérateur, 134 point 4, glisser-déposer réel, rattacher/détacher une table (65), accueil « Anciennes séances » côté visiteur (46), point 3 du chantier 74 (`session_members` d'une personne ajoutée sans téléphone — l'ajout a bien créé un participant, `session_members` non relu).

## Non joué du volet Code Ecclesia

- Refus « table déjà modérée via Bloc C » (`set_member_moderator`), et `JoinTableScreen` (`#table/<code>`) / `EntryScreen` : même RPC `claim_table_as_moderator`, non rejoués à l'écran.
- Idempotence du modérateur repassant par sa propre table (règle 4, 140), chantiers 107/110 par code, 134 point 4.
- Anciens jalons 33-39, 50, 54, 65 (côté superadmin), 72, 74 : demandent le mot de passe **superadmin**.
- Chantier 132 (proposer un vote, deux identités simultanées) : hors de portée du Browser pane.
