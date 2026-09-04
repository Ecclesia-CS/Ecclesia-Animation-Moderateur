# Ecclesia — état des lieux et amorce pour nouvelle conversation Dispatch
*Rédigé le 2026-08-03, à coller en premier message d'une conversation Dispatch fraîche (mémoire vidée).*

## Le projet

Ecclesia est une app web de débat structuré (vote d'opinions → répartition en tables de discussion, avec ou sans modérateur → débat → résultats). Équipe de 3, Jules product owner.

- **Repo** : `C:\Users\jules\projet\Ecclesia-Animation-Modérateur` (nom du workspace Claude Code : "Ecclesia-Animation-Moderateur").
- **Déployé** : GitHub Pages `https://ecclesia-cs.github.io/Ecclesia-Animation-Moderateur/`. Dev local : `npm run dev` (Vite, port 5173).
- **Backend** : Supabase, projet `plpjiehqsxxakbuykmkm` (nom "Ecclesia-Animation-Moderateur", org `ngzmyxuxnsevjmktahiv`). MCP server id côté Dispatch : `bc4cebec-26f6-4a73-88c1-600037f18184`.

## État au 2026-08-03 : tout est mergé et vérifié en base

`origin/main` est à jour (dernier commit confirmé : `48bf89a`). **Chantiers 1 à 37 sont tous mergés, déployés, et toutes leurs migrations sont appliquées et vérifiées côté Supabase.** Détail :

- Chantiers 1-32 (les 10 chantiers originaux + vagues 2/3/4/5) : mergés, déployés, **et vérifiés manuellement par Jules** lors de plusieurs vagues de tests guidés (VERIF7, VAGUE4, etc.).
- Chantier C4 (pass vs neutre) : fait, mergé, vérifié.
- Chantier B3 (reconnexion pre_voting pseudo déjà pris) : fait, mergé, migration appliquée — **jamais testé en conditions réelles** (pas de séance pre_voting active au moment du fix). À inclure dans une prochaine vérif si l'occasion se présente.
- Chantiers 33 et 34 : fait, mergé, migrations appliquées — **vérification manuelle lancée mais jamais faite par Jules** (partons du principe qu'il faudra les re-tester).
- Chantiers 35, 36, 37 + un vieux fix retrouvé (A2, ancien chantier 8, bug drag-and-drop oublié 12 jours sur une branche jamais mergée) : fait, mergé, migrations appliquées — **jamais vérifiés par Jules**.

**→ Ce qui reste réellement à vérifier manuellement** est documenté de façon concise dans `A_VERIFIER.md` à la racine du repo (volontairement allégé le 03/08 : 1279 → ~90 lignes, ne garde que les points encore ouverts — l'historique complet reste dans `git log -p -- A_VERIFIER.md`). En résumé, ce qui y figure aujourd'hui :
- Fix A2 (drag-and-drop file d'attente modérateur)
- Chantier 37 (bouton "Répartir en tables" retiré + fix réassignation modérateur via liste participants)
- Chantier 36 (modérateur affiché en double + case "Je suis modérateur" sur écran "Débat en cours")
- Chantier 35 (synchronisation temps réel superadmin ↔ participant sur le statut modérateur — nécessite deux onglets/navigateurs en parallèle pour tester)

Chantiers 33/34 ne sont pas listés dans `A_VERIFIER.md` (ils étaient marqués comme couverts par une vague de vérif antérieure) mais **Jules n'a en réalité pas encore vérifié ces deux-là non plus** — à garder en tête pour la prochaine vague de vérification, quitte à les rajouter au fichier.

## Deux sujets pilotés directement par Jules (hors gestion Dispatch)

- **Chantier 18 (fusion d'assertions)** : fonctionnellement clos (F23/F24 faits, Edge Function `gemini-proxy` en v13, calibrage sur 24 vrais arbitrages de Jules dans `docs/calibrage-fusion-assertions.md`). Une "série B2" (4 arbitrages d'intensité) a été délibérément laissée de côté par la session elle-même, avec l'accord de Jules — pas un bug, une décision produit assumée. Une conversation de réflexion ouverte existe en parallèle sur "comment faciliter la fusion à plus grande échelle" (limite connue : au-delà de ~30 assertions, Gemini dérive vers un regroupement thématique au lieu d'un appariement strict).
- **Chantier 29 (fiabilité de l'algorithme d'allocation)** : la stratégie D (`STRATEGY_ABSOLUTE_STRONG`, corrige à la fois la formule de score et la fiabilité de la recherche) est mergée et active en prod par défaut. Deux arbitrages restent ouverts, discutés par Jules directement avec une session dédiée : (1) le vrai dilemme produit — petites tables autonomes non modérées vs. moins de tables plus grandes quand les modérateurs/anciens manquent ; (2) garder/renommer/retirer le champ `strategy` de benchmark. Un item supplémentaire a été évoqué (ajouter un input "nombre de tables disponibles" avec dégradation progressive des règles) — Jules gère ce point directement dans cette conversation-là, ne pas le dupliquer ailleurs.

## Parqué, bloqué sur Jules

- **C2** (charte graphique) — attend les assets visuels de Jules, non fourni à ce jour.

## Connaissances opérationnelles à ne pas perdre

- **Accès Supabase hybride** : les sessions Claude Code n'ont généralement PAS d'accès MCP Supabase (quelques sessions ont rapporté en avoir un — ne jamais supposer que ça se généralise, revérifier à chaque fois). Le pattern standard : la session lit et colle le SQL exact en toutes lettres dans le chat, Dispatch l'applique lui-même via son propre accès MCP (`apply_migration`/`execute_sql`).
- **Deux pièges de migration récurrents**, à vérifier systématiquement avant tout `CREATE OR REPLACE FUNCTION` :
  1. **Changement du nombre d'arguments** → Postgres crée un overload ambigu au lieu de remplacer. Il faut un `DROP FUNCTION IF EXISTS <ancienne signature>` explicite avant.
  2. **Signature d'arguments inchangée mais type de retour modifié** (ex. `RETURNS TABLE` avec une colonne en plus) → Postgres refuse aussi. Même fix : `DROP FUNCTION IF EXISTS` avant.
  Toujours vérifier la signature actuelle via `pg_get_function_identity_arguments`/`pg_get_function_result` avant d'appliquer une migration qui redéfinit une fonction existante.
- **Protocole de merge standard** pour chaque chantier : branche/worktree dédiée, tag de rollback avant merge (`pre-merge-chantier-<N>-<date>`), vérification navigateur réelle avec confirmation explicite "zéro erreur console", puis push. Convention `A_VERIFIER.md` : append-only pendant le développement, ne jamais supprimer une entrée sans validation explicite de Jules (allègement du 03/08 = exception ponctuelle demandée par Jules, pas la norme).
- **Sessions Claude Code non joignables d'une conversation Dispatch à l'autre** : les `session_id` d'une conversation précédente ne sont plus accessibles une fois cette conversation fermée (`list_sessions`/`read_transcript` renvoient "not found"). Pour reprendre un travail, relancer une session fraîche pointée sur le même repo, lui dire de checkout la branche existante et de relire l'état git — les branches/commits persistent très bien, seul le handle de session live est perdu.
- **Ne jamais utiliser AskUserQuestion dans une session headless** — si un point métier reste ambigu après investigation, documenter l'hypothèse plutôt que bloquer.
- **Concurrence** : viser ~2-3 sessions Code simultanées, max 2 en tier Opus.
- **Ne jamais toucher `src/lib/allocation.ts`** (algorithme d'allocation) sans validation explicite de Jules — c'est le fichier que la conversation chantier 29 pilote en direct.

## Prochaine vague de chantiers — proposition de nommage

Jules a proposé de nommer la nouvelle vague "B" (chantiers B1, B2, ...). **À éviter** : "B" et les codes "B1-B4"/"B3" existent déjà dans l'historique du projet (chantier 8 original, chantier "B3" = reconnexion pre_voting) — réutiliser "B" créerait une collision de nommage confuse avec des chantiers déjà clos.

**Proposition à la place** : continuer la numérotation simple des chantiers (38, 39, 40...), déjà en usage depuis le chantier 33 (plus de lettres de vague pour les items individuels depuis ce point). Si un label de vague est utile pour regrouper un lot de retours donné en une fois, utiliser un label daté (ex. "Vague 03/08/26", comme Jules l'a fait lui-même la dernière fois) plutôt qu'une lettre — sans risque de collision avec l'historique.

## Pour démarrer la nouvelle conversation

Coller ce document en premier message, puis donner les nouveaux retours de test. Chaque nouveau chantier doit recevoir le texte brut complet des retours de Jules (jamais juste un code/résumé — leçon apprise début du projet), avec repérage explicite des zones de fichiers à risque de collision entre chantiers lancés en parallèle.
