# Chantier 141 — tri des cases ouvertes d'`A_VERIFIER.md` (2026-09-28)

**Règle de Jules** : ne pas rejouer ce qui a déjà été vérifié au navigateur, ni ce qui est obsolète ou modifié par un chantier ultérieur. Tout se passe sur **dev** (`mnjqrlrrzrycuconlfqb`), jamais sur prod sans décision explicite. Aucun changement de `src/` : tout bug devient une entrée de rapport, pas un correctif.

État de ce tri : **partiel** (fait au début de la conversation 1, arrêté faute de marge). Les numéros de ligne sont ceux d'`A_VERIFIER.md` au commit `7f8b98e`.

## Famille A — migrations « jamais appliquées » : PÉRIMÉES (fait)

Constat par `list_migrations` sur prod (`plpjiehqsxxakbuykmkm`) : appliquées les migrations des chantiers 33, 39, 44, 46, 48, 50, 51, 52, 54, 58, 60, 61, 64, 64b, 64c, 65, 66, 67 (×2), 68, 72 (×4), 74.
Entrées d'`A_VERIFIER.md` à annoter « appliquée sur prod, constaté le 2026-09-28 » (sans les supprimer) : lignes 1020, 1055, 1062, 1143, 1165, 1181, 1765, 1897.
Non présentes sur prod, normal (dev seulement, à appliquer au merge `dev` → `main`) : 131, 132, 134a/b, 135/b/c, 137, 139, 140/140b, 142.

## À ne pas rejouer (déjà vu au navigateur, ou hors automatisation)

- Hors automatisation : ligne 997 (restauration de sauvegarde), 3080 (glisser-déposer à la souris réelle), 3052-3053 (nommage Gemini réel, `gemini-proxy` non déployé sur dev), 3049 (expiration réelle d'un compte d'association), et tous les points « Sur prod, après merge » (3050, 3081, 3100, 3114).
- Doublons ou anciens jalons du même chantier (35, 36, 37, 50, 54, 60, 65…) répétés dans plusieurs sections : ne tester qu'une fois par comportement, sur le dernier code.

## Conversation 1 — sans mot de passe (à faire ensuite)

Créer les séances sur dev via MCP Supabase (préfixe `QA141-`), les purger à la fin. Serveur : `.env.local` temporaire pointé sur dev (le `.env` du worktree pointe sur prod), jamais commité.
Deux identités : `localhost` et `127.0.0.1` ont des `localStorage` distincts.

Priorité aux items non déjà validés à l'écran :
1. Visiteur non inscrit pendant `post_voting` (l. 1013) — nécessite la seconde identité.
2. Prise de table par code, tous les refus (l. 1205-1252, chantier 68) et ses écrans `JoinTableScreen`/`EntryScreen`.
3. Résultats publics et accueil (l. 1268-1301, chantiers 46/58/65 côté visiteur).
4. Écarts C4, C5 et piège D1 de l'audit 87/101 (l. 2868-2870).
5. Portes d'entrée du 140 non rejouées (l. 3095-3098), idempotence modérateur (l. 3096).
6. `add_offline_participant` avec un nom déjà assis (l. 3113).
7. Ménage des données de test (l. 1729-1733), **avec l'accord de Jules avant toute suppression**.

## Conversations 2 à 4 — superadmin (mot de passe saisi par Jules)

- **Lot 1** : `PhaseBar` et phases (l. 1007-1012), 128, 130/138, 134 points 1-3, 137-D (les points d et g restent ouverts), 135.
- **Lot 2** : désignation de modérateur et onglet Groupes (139, 106, 109, 117, 118), allocation.
- **Lot 3** : anciens chantiers 33-39, 50, 54, 65 côté superadmin, 72, 74 ; portes modérateur par Code Ecclesia (107, 110, 140, 134 point 4).

## Format de rapport (un fichier par lot : `lot-N.md`)

Par anomalie : identifiant · chantier d'origine · environnement · étapes · attendu · observé · preuve · gravité proposée (bloquant / grave / mineur / cosmétique) · type de correctif (front / SQL / environnement).
Les items qui passent reçoivent dans `A_VERIFIER.md` « vérifié automatiquement sur dev le … », **sans passer en « Validé »** (décision de Jules).

---

# Sous-chantiers 141a à 141e — à lancer chacun dans sa conversation

**Amorce à coller au début de chaque conversation** (remplacer la lettre) :

> Chantier 141, sous-chantier 141X. Lis `docs/rapports-tests-141/triage.md` (section « Sous-chantiers ») et `docs/rapports-tests-141/lot-*.md` existants, puis exécute uniquement 141X. Branche `claude/chantier-141-automated-tests-a071a2` (ou la branche de chantier la plus récente de `dev`). Tout se passe sur **dev**. Ne corrige rien dans `src/`.

**Préparation commune (chaque conversation)** : `git fetch` puis remettre la branche à jour sur `origin/dev` ; créer `.env.local` (ignoré par git) avec l'URL et la clé publique de dev (`get_publishable_keys` sur `mnjqrlrrzrycuconlfqb`) — **jamais** le `.env` de prod ; `preview_start ecclesia-dev` ; séances de test préfixées `QA141-`, purgées à la fin (vérifier 0 ligne restante) ; relire l'état en boucle bornée après tout changement de phase ; un rapport `docs/rapports-tests-141/lot-<lettre>.md` par sous-chantier, au format ci-dessus ; annotations « vérifié automatiquement sur dev le … » dans `A_VERIFIER.md`, sans jamais passer en « Validé ». Commit à la fin, sans pousser.

| Sous-chantier | Contenu | Mot de passe |
|---|---|---|
| **141a** — participant et modérateur, sans mot de passe | Reste du lot 1 (`lot-1.md`, « Non joué ») : tri final des lignes 1300-1900 ; résultats publics et accueil (l. 1268-1301) ; C4 et D1 (l. 2868-2870) ; `add_offline_participant` (l. 3113) ; ménage des tables de test (l. 1729-1733, **accord de Jules avant toute suppression**). Lever d'abord la limite d'identité (Vite avec `--host 127.0.0.1`). | Aucun |
| **141b** — superadmin, phases et séances | `PhaseBar` et phases (l. 1007-1012), chantiers 128, 130/138, 134 (points 1-3), 137-D (points d et g), 135. | Superadmin, saisi par Jules |
| **141c** — superadmin, modérateurs et groupes | Désignation de modérateur et onglet Groupes (139, 106, 109, 117, 118), allocation. | Superadmin |
| **141d** — anciens chantiers + portes Code Ecclesia | Anciens jalons 33-39, 50, 54, 65 (côté superadmin), 72, 74 ; scénarios du 68 (l. 1224-1269) ; portes modérateur (107, 110, 140, l. 3095-3098) ; 134 point 4. | Superadmin **et** Code Ecclesia |
| **141e** — consolidation | Fusionner les rapports `lot-*.md` en un rapport unique trié par gravité pour l'autre conversation ; nettoyer `A_VERIFIER.md` ; lister ce qui reste à faire par un humain (glisser-déposer, Gemini réel, expiration, points « Sur prod après merge ») ; retirer l'entrée de `docs/chantiers-a-faire.md` et consigner dans `docs/chantiers.md`. | Aucun |

Ordre conseillé : 141a → 141b → 141c → 141d → 141e (141a n'a besoin de personne ; 141e vient en dernier). 141b, c et d peuvent tourner dans n'importe quel ordre entre elles.
