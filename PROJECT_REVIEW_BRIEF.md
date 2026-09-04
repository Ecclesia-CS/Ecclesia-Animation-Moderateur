# Brief d'état du projet — pour revue approfondie

> Document de préparation pour une future revue complète du projet (potentiellement menée par des agents spécialisés). Photographie de l'état au **17/07/2026**, commit `438fdd8`. Ne remplace pas une revue — sert de point de départ pour ne pas repartir de zéro.

## Ce que ce document N'EST PAS

- Une revue de sécurité exhaustive des 65 migrations SQL (RLS, SECURITY DEFINER) — non faite.
- Un audit de la base Supabase en conditions réelles (le projet était en pause au moment de cet audit, cf. plus bas).
- Une revue du sous-projet `transcription-debat/` (audité séparément, voir historique).

---

## 1. Portrait du projet

| | |
|---|---|
| Stack | React 18 + Vite + TypeScript strict + Tailwind v3 + Supabase (PG+Auth anon+Realtime) + dnd-kit |
| Taille | ~17 000 lignes (`src/`), 65 migrations SQL |
| Déploiement | GitHub Pages, workflow `deploy.yml` |
| Documentation | `CLAUDE.md` (racine) très détaillé et globalement à jour — voir §5 |
| Sous-projets | `transcription-debat/` (pipeline Python offline, indépendant) |

## 2. État de l'infrastructure Supabase

- **Project ID** : `ssnjutslbhvzcvlurbsh` (org `damqqnequdvkaxxusvub`), région `eu-central-1`, Postgres 17.
- **Statut au moment de la rédaction** : l'API Supabase (via MCP) renvoie `status: "INACTIVE"` et toute requête SQL (`list_tables`, `list_migrations`) échoue en timeout de connexion — malgré une tentative de réactivation manuelle signalée par l'utilisateur. **À revérifier** : soit délai de propagation après réveil (quelques minutes à prévoir), soit la réactivation n'a pas abouti. Premier réflexe de la prochaine session : relancer `list_migrations`/`list_tables` avant tout diagnostic plus poussé.
- **Point de vigilance** : le projet Supabase a été créé le **15/06/2026**, alors que les migrations du repo commencent au **20/05/2026**. Cet écart de ~1 mois doit être élucidé : soit le projet a été recréé/migré à un moment donné (repartir d'un dump), soit il existe un autre projet Supabase antérieur non référencé. **À vérifier en premier lors de la revue technique** — comparer `list_migrations` (état réel en base) aux 65 fichiers `supabase/migrations/*.sql` du repo pour détecter toute dérive.
- Advisors sécurité/performance renvoyés vides lors du premier passage — probablement non significatif tant que le projet était inactif, à relancer une fois le projet confirmé actif.

## 3. Qualité du code — mesures factuelles

```
Lignes de code (src/) : 16 977
Fichiers > 600 lignes  : SuperadminScreen.tsx (4260), VoteScreen.tsx (1634),
                         ModeratorView.tsx (900), LLMModerationPanel.tsx (715),
                         CollabDocScreen.tsx (654)
Usage de `any`         : 2 occurrences
console.log/warn/error : 1 occurrence
TODO/FIXME/HACK         : 0
extractErr() (pattern erreur Supabase) : 124 usages
localStorage/sessionStorage accès directs : 75, répartis sur 8 fichiers
Tests frontend          : 0
ESLint / Prettier       : absents
CI (GitHub Actions)     : absente (le workflow existant ne fait que build+deploy)
tsc --noEmit            : passe sans erreur
```

## 4. Code mort identifié

| Fichier / zone | Constat |
|---|---|
| `src/components/TestScreen.tsx` (219 lignes) | Non importé nulle part dans `App.tsx`/`main.tsx`. À confirmer avec l'utilisateur avant suppression (outil de dev volontaire ?). |
| `src/hooks/useTranscription.ts` + bouton dans `ModeratorView.tsx` (l.180-599) | Référence le mode transcription **live**, dont le backend a été supprimé le 2026-06-30 (`transcription-debat` est désormais 100% offline). Chemin mort tant qu'aucun serveur live ne tourne. |
| `OnboardingForm` importé dans `VoteScreen.tsx` | L'onboarding (entry_responses) est désactivé depuis le 2026-06-04 (voir `CLAUDE.md` §Changements temporaires) mais le composant reste importé — vérifier s'il est encore atteignable par un chemin de code. |

## 5. Fiabilité de la documentation existante

`CLAUDE.md` (racine) est détaillé et globalement fiable pour la partie app web (modèle de données, RPC, règles critiques, UX). Points à surveiller lors de la revue :
- Section « Changements temporaires » : onboarding désactivé (04/06) et `cancel-in-progress: false` (03/06) — décisions à re-confirmer ou à pérenniser explicitement.
- Le bug connu « nommage Gemini → Groupe N » (§Modération IA) reste non résolu à ce jour — 5 pistes déjà tentées et éliminées, 3 hypothèses non testées listées dans le doc.
- Le sous-projet `transcription-debat/` a sa propre doc à jour (`transcription-debat/CLAUDE.md`), non dupliquée ici.

## 6. Dette d'architecture à traiter en priorité

1. **`SuperadminScreen.tsx` (4260 lignes)** — composant unique gérant auth, liste séances, clustering, modération IA, nommage Gemini, exports CSV, stats. Découpage naturel selon les 4 onglets déjà existants (En direct / Tables / Préparation / Analyse).
2. **Couplage localStorage diffus** — 75 accès directs, clés dynamiques ad hoc (`ai_log_<id>`, `group_names_<id>`, `ai_rejected_ids_<id>`, etc., toutes documentées dans `CLAUDE.md` faute de code auto-documenté). Candidat à un module de store typé centralisé au-dessus de `storage.ts`.
3. **Autres fichiers volumineux** : `VoteScreen.tsx` (machine à états vote → onboarding → allocating, historique de bugs de régression), `LLMModerationPanel.tsx`, `CollabDocScreen.tsx`, `AnalysisPanel.tsx`.

## 7. Absence de filet de sécurité — le point le plus critique

- **0 test frontend** sur toute la base, y compris sur la logique la plus sensible aux régressions silencieuses : `src/lib/analysis.ts` (PCA/k-means/repness, 459 lignes), la machine à états de `VoteScreen`, le clustering.
- **Pas de linter** : rien n'attrape par exemple les dépendances manquantes de `useEffect`, source probable de bugs realtime déjà rencontrés (cf. patterns de garde `isGranting`/`pausedSpeakerId` documentés dans `CLAUDE.md`, qui suggèrent des races déjà vécues).
- **Pas de CI** : aucune vérification automatique avant déploiement Pages.

## 8. Pistes concrètes pour la revue à venir (proposées, non actées)

**Tests frontend — priorisation suggérée** :
1. `src/lib/analysis.ts` — logique pure, le plus critique, le plus facile à tester unitairement.
2. `src/lib/utils.ts`, wrappers `voting.ts`/`sessions.ts` (mock du client Supabase).
3. Machine à états de `VoteScreen.tsx` (transitions plutôt que rendu pixel).
4. `TableContext.tsx` — cœur temps réel, plus coûteux (mock Realtime), à traiter après.
Outillage envisagé : Vitest (cohérent avec Vite déjà en place) + React Testing Library.

**Outillage architecture — priorisation suggérée** :
1. ESLint (`typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`) + Prettier.
2. CI GitHub Actions : `typecheck → lint → test → build`, avant le workflow de déploiement existant.
3. Reporter les outils plus lourds (Storybook, etc.) après le découpage des gros composants — peu utile sur un `SuperadminScreen` de 4260 lignes en l'état.

**Chantier base de données** — à intégrer dans une revue dédiée, hors périmètre de ce brief :
- Confirmer l'état réel du projet Supabase (actif, migrations synchronisées).
- Relire les 65 migrations pour RLS/SECURITY DEFINER (revue sécurité non faite ici).
- Relancer les advisors sécurité/performance une fois le projet stable.

---

*Document généré pour préparer une revue ultérieure — ne constitue pas la revue elle-même. À réutiliser comme entrée de contexte (ex. pour des agents dédiés à l'architecture, aux tests, ou à la sécurité).*
