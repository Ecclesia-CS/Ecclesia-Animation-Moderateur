# Référence — Modération IA (Gemini Flash)

> Clés `localStorage`, règles de l'orchestration IA, Edge Function `gemini-proxy`, et le bug connu du nommage des camps.

---

## Edge Function `gemini-proxy`

```
supabase/functions/
└── gemini-proxy/index.ts   Proxy Gemini Flash (gemini-2.5-flash-lite)
                             Actions : moderate | merge | name_groups
                             Auth : JWT Supabase via getUser()
                             Clé : GEMINI_API_KEY (secret Supabase)
                             Chantier 57 : quota 20 appels/60s par user_id (compteur en
                             mémoire, pas de table Postgres — voir commentaire en tête du
                             fichier) → 429 ; plafond de charge utile 300 Ko → 413. Messages
                             extraits côté client par `extractGeminiError()` (src/lib/gemini.ts)
                             car `FunctionsHttpError` masque le corps JSON derrière un message
                             générique pour toute réponse non-2xx.
```

---

## Modération IA (sprint Gemini Flash)

### Architecture
Toutes les fonctions IA passent **exclusivement** par l'Edge Function `gemini-proxy` — jamais d'appel direct à `api.google.com` depuis le frontend.

`src/lib/gemini.ts` → `supabase.functions.invoke('gemini-proxy')` → Gemini API

### Clés localStorage IA (par session.id)
| Clé | Contenu |
|---|---|
| `ai_log_<id>` | `LogEntry[]` max 50 FIFO — historique appels Gemini |
| `ai_tokens_day_<YYYY-MM-DD>` | `{ total_tokens, request_count }` — compteurs journaliers |
| `merge_log_<id>` | `MergeLogEntry[]` max 100 FIFO — **legacy chantier 18** : plus alimenté. L'historique des fusions est en base (`assertion_merges`). Encore affiché en lecture seule sous « Fusions antérieures (journal local) », avec une annulation *partielle* (ré-approbation seule, sans restauration du contenu ni des votes). Se vide naturellement. |
| `merge_proposals_<id>` | `ProposedMerge[]` — **chantier 7 / B4** — fusions PROPOSÉES par Gemini, en attente de validation humaine (self-contained : snapshot du contenu + `merged_content` optionnel). Aucune écriture en base tant que non validées. |
| `ai_rejected_ids_<id>` | `string[]` — UUIDs rejetés par l'IA (distinct des rejets manuels) |
| `ai_approved_ids_<id>` | `string[]` — UUIDs approuvés par l'IA (modération manuelle + auto). Badge "acceptée par IA" dans la vue Approuvées |
| `ai_auto_moderate_<id>` | `'true'/'false'` — toggle auto-modération |
| `ai_auto_interval_<id>` | nombre (minutes) — intervalle auto-modération (1-10) |
| `ai_auto_merge_<id>` | `'true'/'false'` — fusion automatique avant clustering |
| `ai_auto_merge_periodic_<id>` | `'true'/'false'` — toggle fusion périodique (setInterval) |
| `ai_auto_merge_interval_<id>` | nombre (minutes) — intervalle auto-fusion (1-30) |
| `analysis_auto_<id>` | `'true'/'false'` — toggle auto-analyse des camps |
| `analysis_auto_interval_<id>` | nombre (minutes) — intervalle auto-analyse (1-15) |
| `group_names_<id>` | `GroupNameResult[]` — noms Gemini des groupes |
| `group_names_fp_<id>` | string JSON — empreinte groupes pour éviter re-appel Gemini |

### Règles critiques IA
- **`group_names_fp_<id>`** : ne rappeler Gemini pour le nommage que si l'empreinte des groupes a changé (nouveau clustering) ou si aucun nom n'est stocké
- **Fallback nommage** : si Gemini retourne moins d'entrées que de groupes, compléter côté frontend avec `{ name: "Groupe N", description: "..." }` avant de stocker
- **Cache incomplet** : si l'empreinte correspond mais des noms manquent, appliquer le fallback localement sans rappeler Gemini (cas du retour sur une session existante avec cache stale)
- **Nommage par appels séquentiels** : `nameSingleGroup` est appelé une fois par groupe, séquentiellement (boucle `for...of` avec retry ×2). Chaque appel utilise l'action `name_single_group` de la Edge Function, qui retourne un **objet unique** `{ name, description }` via `responseSchema` — pas un tableau. Le fallback générique reste si les 2 tentatives échouent. La validation côté client rejette les noms du type `"Groupe N"` (regex `/^groupe\s*\d+$/i`) et déclenche le retry.
- **`responseMimeType: 'application/json'`** : passé dans `generationConfig` de l'appel Gemini pour forcer la sortie JSON native (évite les enrobages markdown)
- **`ai_rejected_ids_<id>`** : seules les assertions dans ce set s'affichent dans "Assertions rejetées par l'IA" — les rejets manuels n'y apparaissent pas
- **`ai_approved_ids_<id>`** : symétrique à `ai_rejected_ids`. Populé lors de `handleModerate` et de l'auto-modération (`addAiApprovedIds`). Utilisé par `AssertionsPanel` (via `aiLabelMap`) pour afficher le badge "acceptée par IA"
- **`LLMModerationPanel` — accordéon auto-ouvert** : `open` s'initialise à `true` si `readLog(session.id).length > 0` — l'historique est donc visible immédiatement au retour sur la page sans avoir à déplier manuellement
- **`PhaseBar` — navigation directe** : chaque cercle d'étape non-courant est un `<button>` qui appelle `onPhaseSelect(phase)`. La modal de confirmation existante gère l'affichage (titre "← Revenir" si `isBack`, "Passer en phase X" sinon). Les badges "fusionnée" / "modérée par IA" / "acceptée par IA" dans `AssertionRow` sont calculés par `aiLabelMap` (useMemo dans `AssertionsPanel`, lecture directe de localStorage)
- **Ne pas appeler `supabase.functions.invoke` sans vérifier `error` ET `data?.error`**
- **Sanitisation UUID merge** : `gemini-proxy` filtre les résultats `merge` avant retour — Gemini peut halluciner un UUID légèrement altéré (ex : premier tiret manquant). La validation côté Edge Function (regex UUID + présence dans les IDs d'entrée) est la première ligne de défense ; `LLMModerationPanel` ajoute un guard avant `rejectAssertion`. Ne pas supprimer ces validations.
- **Prescription vs jugement (chantier 18 / F23)** : `buildMergePrompt` impose une **étape de typage** avant toute comparaison — chaque assertion est PRESCRIPTION (propose une action), JUGEMENT (porte une appréciation) ou CONSTAT (affirme un fait) — et une règle absolue : **deux types différents ne fusionnent jamais**, même sujet identique et même orientation. Cause racine du bug : le durcissement du chantier 7 était bien déployé (v11) et n'a pas suffi ; empiler des contre-exemples ne remplace pas une règle catégorielle. Le `reason` renvoyé annonce le type commun → chaque proposition est auditable d'un coup d'œil. **Redéployer l'Edge Function après toute modification du prompt** (version courante : v12).
- **Fusion annulable (chantier 18 / F24)** : ne plus appeler `merge_assertion_votes` + `reject_assertion` à la main depuis le frontend — utiliser `apply_assertion_merge`, sinon la fusion est **définitive** (rien n'est enregistré pour la défaire). Voir la table `assertion_merges`.
- **Fusion en deux temps (chantier 7 / B4)** : la fusion n'écrit **plus jamais** en base sans validation humaine. « Analyser les doublons » empile des `ProposedMerge` dans `merge_proposals_<id>` (snapshot self-contained). Le modérateur valide chaque proposition : soit « garder ✅ telle quelle » (transfert de votes + `reject_assertion`), soit « ✨ fusionner en formulation combinée » (`update_assertion_content` réécrit l'assertion conservée avec `merged_content`, puis transfert + reject). L'auto-fusion **périodique** alimente ces propositions au lieu d'appliquer ; l'auto-fusion **en fin de vote** (`SuperadminScreen`, toggle « Fusionner auto en fin de vote », clé `ai_auto_merge_<id>`) reste auto et transfère les votes avant de rejeter (correction d'une perte de votes). **Chantier 37** : son déclenchement a migré de la modale héritée « Répartir en tables » (supprimée) vers `handlePhaseChange`, au moment où le superadmin fait passer la séance de `voting` à `allocating` — cf. section Phase de vote. Le prompt `buildMergePrompt` a été durci (biais « ne pas fusionner » + contre-exemples réels sur le thème publicité) — **il faut redéployer l'Edge Function `gemini-proxy` pour que ce prompt prenne effet**.

### ⚠️ Bug connu — nommage Gemini : groupe N toujours nommé "Groupe N"

Avec k=3+ groupes, Gemini 2.5 Flash Lite retourne systématiquement `"Groupe 3"` (ou `"Groupe N"`) comme nom pour le dernier groupe, même avec :
- L'action `name_single_group` (objet unique, pas tableau)
- `responseSchema: { type: 'object', required: ['name','description'] }`
- L'instruction explicite INTERDIT dans le prompt
- La validation client qui rejette `"Groupe N"` et déclenche un retry
- Le retry (2ème appel) produit le même résultat

**Ce qui a été tenté et éliminé** :
1. Batch `name_groups` (array) → Gemini retourne moins d'entrées que demandé
2. Solo retry via `name_groups` (array d'1 élément) → Gemini retourne `[]`
3. Transport : 3 appels parallèles → le 3ème n'atteignait pas le serveur (bug client Supabase)
4. Transport : 3 appels séquentiels → tous atteignent Gemini, mais le 3ème retourne `"Groupe 3"`
5. Prompt avec règle INTERDIT + validation/retry côté client → Gemini retourne quand même `"Groupe 3"`

**Hypothèses non testées** :
- Utiliser `gemini-2.5-flash` (non lite) ou `gemini-2.5-pro`
- Remplacer les labels "Groupe 1/2/3" dans le contexte par des lettres neutres "A/B/C" pour que le modèle ne puisse pas les recopier
- Passer les données groupe par groupe sans contexte des autres groupes (prompt encore plus court)

### Mapping group_id ↔ table_number
`AnalysisPanel` et `ResultsMapScreen` utilisent `group_id` 0-indexé. Les `table_number` de `table_assignments` et de Gemini sont 1-indexés. Mapping : `table_number = group_id + 1`. **Ne pas utiliser `ring-1` Tailwind sans `ring-[color]`** pour les highlights de groupe — Tailwind applique son bleu par défaut. Toujours utiliser `outline` inline : `style={{ outline: \`1px solid ${color}60\` }}`.

---

---

*Annexe de [`CLAUDE.md`](../CLAUDE.md) — extraite au chantier 78 (2026-09-07) pour alléger le fichier réinjecté au démarrage de chaque session. **Contenu déplacé tel quel, rien n'a été supprimé ni résumé.** Si une information d'ici doit redevenir un réflexe permanent, la remonter dans `CLAUDE.md` plutôt que de la dupliquer.*
