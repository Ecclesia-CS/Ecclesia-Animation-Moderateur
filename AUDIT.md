# Audit de l'application Ecclesia — app web de modération

> Réalisé le 17/07/2026, avant reprise du développement. Périmètre : `src/` (app web React). Le sous-projet `transcription-debat/` n'est pas couvert ici (audité séparément).

## Verdict global

**Base globalement saine, bien documentée, mais fragile faute de filet de sécurité.** Le code est propre et typé rigoureusement, mais il n'y a **aucun test frontend**, **aucun linter**, et un composant de 4260 lignes. Avant de reprendre, l'effort le plus rentable est de poser les garde-fous (tests + lint + CI), pas de refactorer tout de suite.

Note de santé par axe (indicatif) :

| Axe | État | Commentaire |
|---|---|---|
| Type-safety | 🟢 Très bon | `strict` complet, 2 `any` sur ~17 000 lignes, compile sans erreur |
| Sécurité | 🟢 Bon | RLS + SECURITY DEFINER, aucun secret commité, `.gitignore` correct |
| Documentation | 🟢 Excellent | `CLAUDE.md` très détaillé et à jour |
| Cohérence code | 🟡 Correct | `extractErr` utilisé 124×, 1 seul `console`, 0 TODO |
| Architecture | 🟠 À surveiller | Composants géants, couplage localStorage fort |
| Tests | 🔴 Critique | 0 test frontend sur ~17 000 lignes |
| Outillage | 🔴 Manquant | Pas d'ESLint, Prettier, ni CI |
| Infra / BDD | 🟠 À vérifier | Projet Supabase en pause, dérive de migrations possible |

---

## Points forts (à préserver)

- **TypeScript strict intégral** : `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Le projet compile sans erreur (`tsc --noEmit` OK).
- **Discipline de typage remarquable** : 2 occurrences de `any` sur ~17 000 lignes.
- **Gestion d'erreur centralisée** : helper `extractErr` (utils.ts) utilisé 124 fois — gère correctement les `PostgrestError` Supabase.
- **Modèle de sécurité propre** : aucune clé `service_role` dans le front, aucun secret commité, comparaison de codes uniquement via `crypt()` en SECURITY DEFINER, auth anonyme. `.env` bien ignoré, `.env.example` sans valeur réelle.
- **Documentation exceptionnelle** : `CLAUDE.md` sert de vraie référence d'architecture (rare et précieux).

---

## Problèmes classés par priorité

### 🔴 P0 — Bloquants / à traiter avant de recoder

**1. Aucun test frontend.** ~17 000 lignes, dont de la logique critique non triviale : PCA/k-means (`analysis.ts`), clustering, calcul de repness/consensus, machine à états du vote, realtime, DnD. Zéro test = chaque modification est un pari. **C'est le point n°1 pour « repartir sur de bonnes bases ».**

**2. Projet Supabase en pause + dérive de migrations possible.** Le projet (`ssnjutslbhvzcvlurbsh`) est `INACTIVE` (suspendu). De plus il a été créé le **15/06/2026** alors que les migrations remontent au **20/05/2026** : il faut confirmer que les **65 migrations** sont réellement appliquées sur *ce* projet (via `list_migrations`), sinon le schéma en base peut diverger des fichiers du repo.

**3. Aucun outillage qualité.** Pas d'ESLint, pas de Prettier, pas de CI. Rien n'empêche une régression de partir en production (le workflow GitHub Pages ne fait que builder + déployer).

### 🟠 P1 — Dette d'architecture (à planifier)

**4. `SuperadminScreen.tsx` = 4260 lignes.** Composant « dieu » qui concentre auth, liste des séances, clustering, modération IA, nommage Gemini, exports, stats… Très difficile à maintenir et à tester. Il a déjà 4 onglets logiques (En direct / Tables / Préparation / Analyse) → découpage naturel en 4+ sous-composants.

**5. Autres fichiers surdimensionnés** : `VoteScreen.tsx` (1634), `ModeratorView.tsx` (900), `LLMModerationPanel.tsx` (715), `CollabDocScreen.tsx` (654), `AnalysisPanel.tsx` (600). Candidats à extraction de sous-composants / hooks.

**6. Couplage localStorage diffus.** 75 accès directs à `localStorage`/`sessionStorage` répartis sur 8 fichiers, avec des clés dynamiques ad hoc (`ai_log_<id>`, `group_names_<id>`, `ai_rejected_ids_<id>`…). Le fait que `CLAUDE.md` doive documenter un tableau entier de clés est le symptôme : pas de store typé centralisé au-delà de `storage.ts`. Risque de fautes de frappe sur les clés, pas de migration possible, état dispersé. → Étendre `storage.ts` en un module typé unique.

### 🟡 P2 — Nettoyage / hygiène

**7. Code mort à supprimer** :
- `src/components/TestScreen.tsx` (219 lignes) — importé nulle part.
- `src/hooks/useTranscription.ts` + le bouton « Transcription » dans `ModeratorView.tsx` (l.180-599) — le backend live a été supprimé le 30/06, ce chemin est mort.

**8. Chemins partiellement morts** : `OnboardingForm` est toujours importé dans `VoteScreen.tsx` alors que l'onboarding est désactivé depuis le 04/06.

**9. Changements temporaires à trancher** (documentés dans `CLAUDE.md` §Changements temporaires) :
- Onboarding désactivé depuis le 04/06 — le remettre ou l'assumer définitivement.
- `cancel-in-progress: false` dans le workflow de déploiement — décision consciente à garder.

**10. Divers** : quelques `String(e)` dans `AnalysisPanel`/`LLMModerationPanel` pourraient être des erreurs Supabase → préférer `extractErr`. Nommage de migrations hétérogène (`20260528_clustering.sql` vs `20260528000000_*.sql`).

---

## Plan de reprise recommandé

### Phase 0 — Remise en état (1/2 journée)
1. Réactiver le projet Supabase et **vérifier l'état des migrations** vs les 65 fichiers du repo.
2. Trancher le sort des changements temporaires (onboarding, workflow deploy).

### Phase 1 — Poser les garde-fous (le plus rentable, ~2-3 jours)
3. Ajouter **ESLint + Prettier** (config + format du repo en une passe).
4. Ajouter **Vitest + React Testing Library**. Premiers tests sur la **logique pure**, à fort ROI et sans UI : `analysis.ts` (PCA, k-means, repness), `utils.ts`, wrappers `voting.ts`/`sessions.ts`.
5. **Supprimer le code mort** (TestScreen, useTranscription + bouton live).
6. Ajouter un **CI GitHub Actions** : `lint → typecheck → test → build` en amont du déploiement.

### Phase 2 — Refactoring ciblé (au fil de l'eau)
7. Découper `SuperadminScreen` par onglet.
8. Extraire un **module localStorage typé** centralisant toutes les clés `ai_*` / `group_names_*`.
9. Alléger `VoteScreen` (extraction de sous-composants / hooks d'étape).

### Phase 3 — Tests d'intégration
10. Couvrir les flux critiques (vote → clustering → allocation → débat) une fois les composants découpés.

---

## Outils / plugins mobilisables

- **`/code-review`** (et `/code-review ultra` pour une passe cloud approfondie) — revue de diff à chaque changement.
- **`/security-review`** — revue de sécurité ciblée sur les changements (utile vu la surface RLS/RPC).
- **`/simplify`** — nettoyage réutilisation/simplification lors des refactors.
- **`/verify`** — vérifier qu'un changement marche de bout en bout avant commit.
- L'accès **MCP Supabase** (déjà configuré) pour appliquer migrations, lire logs et advisors directement.
