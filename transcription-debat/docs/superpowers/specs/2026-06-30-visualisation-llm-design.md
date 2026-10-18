# Spec — Génération LLM des visualisations de débat

**Date** : 2026-06-30
**Statut** : design validé, prêt pour plan d'implémentation
**Contexte** : sous-projet `transcription-debat`

---

## 1. Problème

Le pipeline de transcription produit désormais des transcripts **corrigés et propres**
(`transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.json`, segments
`{start, end, speaker, text, refused}`).

Un dashboard de visualisation existe déjà (`Visualisation prises de positions/index.html`
+ `data.js`), mais ses données sont **écrites à la main** pour un seul débat (Retraite) :
chaque coordonnée, axe, event et valeur de tension est un jugement interprétatif posé
après lecture du transcript.

**Objectif** : une nouvelle étape de pipeline qui transforme **automatiquement** un
transcript corrigé en un `data.js` structuré, consommé par les visualisations — sans
ré-écriture manuelle par débat.

## 2. Décisions de cadrage (issues du brainstorming)

| Décision | Choix retenu |
|---|---|
| Production des données | **Génération automatique par LLM** (Gemini) |
| Cadre d'analyse (axes, écoles, concepts) | **Dérivé par le LLM pour chaque débat** (pas de cadre fixe commun) |
| Visualisations ciblées | **V1** carte statique, **V2** trajectoires animées, **V3** frise de tension, **V4** réseau conceptuel. V5 (Sankey) hors périmètre. |
| Forme du livrable | **Dashboard autonome par débat** dans `transcripts/<Thème>/<CODE>/viz/` (`index.html` + `data.js`) |
| Architecture LLM | **Étagée** (passes ciblées, validation + retry + dégradation gracieuse par passe) |
| Modèle | `gemini-3.1-flash-lite` par défaut, **paramétrable** via `GEMINI_ANALYSIS_MODEL` |

> **Conséquence du modèle faible** : la décomposition étagée et les garde-fous sont
> d'autant plus critiques. Des tâches petites et focalisées limitent la dérive de
> flash-lite (cf. bug de nommage connu du projet).

## 3. Architecture

Nouveau module **`backend/code python/analyze_debate.py`** — standalone *et* appelable
(même pattern que `correct_transcript.py`).

- **Entrée** : `<CODE>_<DATE>_corrected.json`
- **Sortie** : `transcripts/<Thème>/<CODE>/viz/` = `data.js` (dataset généré) + `index.html`
  (template généralisé, copié)

```
<CODE>_corrected.json
        │
        ├─ calcul direct (PAS de LLM) ──▶ weight, entry, refus, durée totale, liste des voix
        │
        └─ analyse LLM étagée (gemini-3.1-flash-lite par défaut) :
             Passe 1 · Cadre + voix      → axes, personas (pos. finale), schools      [V1]
             Passe 2 · Events + tension  → events, tension                            [V3]
             Passe 3 · Trajectoires      → kf par voix (ancrées aux events)           [V2]
             Passe 4 · Réseau conceptuel → concepts, fauxConsensus, gordian, …        [V4]
                          │
                  validation + retry ×2 + dégradation gracieuse par passe
                          │
             data.js  +  index.html (template)  ──▶  viz/
```

### Deux principes structurants

1. **Ce qui est mesurable n'est jamais demandé au LLM.** `weight` (temps de parole
   normalisé), `entry` (1re prise de parole), `refus` (segments `refused:true` fusionnés
   en intervalles), durée totale et liste des Interlocuteurs sont calculés directement
   depuis le JSON. Le LLM ne fait que de l'interprétation. Réduit la surface
   d'hallucination, garde les chiffres honnêtes.

2. **Ordre des passes choisi pour la cohérence.** Les events (passe 2) précèdent les
   trajectoires (passe 3) : une trajectoire crédible doit s'ancrer sur des bascules
   réelles. Chaque passe reçoit les sorties des passes précédentes comme contexte.

### Dégradation gracieuse

Si une passe échoue (quota / timeout / JSON invalide après 2 retries), `data.js` est tout
de même écrit avec les passes réussies, et l'onglet de la viz correspondante se masque
côté template. Cohérent avec « le pipeline garde le brut et finit ».

## 4. Schéma de données (`data.js`)

Le schéma actuel est **conservé tel quel** (pour réutiliser la viz sans la réécrire), plus
un bloc `meta`. Découpage source LLM vs calculé :

| Champ | Source | Détail |
|---|---|---|
| `meta` | calculé | `{ topic, code, date, totalDurationMinutes, totalRedactedMinutes }` → titre/header/légende |
| `axes` | LLM passe 1 | `{x, y}` labels + `quadrants` — cœur interprétatif, 2 axes propres au débat |
| `personas[].id` / `label` | calculé | une voix par locuteur (`Interlocuteur N`, `Modérateur`) |
| `personas[].weight` | calculé | temps de parole normalisé 0–1 |
| `personas[].entry` | calculé | minute de 1re prise de parole |
| `personas[].camp` / `note` / position finale | LLM passe 1 | — |
| `personas[].color` | **calculé** | tiré d'une palette fixe imposée (cohérence inter-vues) |
| `schools[]` | LLM passe 1 | ellipses dérivées des positions des membres |
| `events[]`, `tension[]` | LLM passe 2 | bascules horodatées + courbe 0–100 |
| `personas[].kf` | LLM passe 3 | keyframes `[min, x, y]` ; commence à `entry`, finit à la pos. finale de la passe 1 |
| `refus[]` | calculé | intervalles `refused:true` fusionnés |
| `concepts` / `fauxConsensus` / `gordian` / `consensus` / `concessions` | LLM passe 4 | réseau conceptuel |

## 5. Garde-fous de validation

Appliqués **par passe**, retry ×2, sinon dégradation gracieuse de la section concernée.

- **Anti-invention de noms (RGPD)** — le LLM ne peut référencer **que** les labels
  `Interlocuteur N` / `Modérateur` calculés. Tout prénom réel ou voix inexistante →
  rejet → retry. Même esprit que le garde-fou de `correct_transcript.py`, **à ne jamais
  lever**.
- **Bornes & types** — `x, y ∈ [-10, 10]`, `tension ∈ [0, 100]`, `magnitude ∈ {1,2,3}`,
  `t ∈ [0, durée]`. Hors bornes → rejet.
- **Cohérence référentielle** — tout `id` cité dans `schools.members`, `kf`,
  `concessions.by` doit exister dans `personas` / `schools`. Sinon rejet.
- **Trajectoires bornées (anti-grand-mouvement)** — `kf` strictement croissante en temps ;
  bornes `entry` → pos. finale **imposées par le code** (pas par le LLM) ; consigne stricte
  « petits glissements » + plafond d'amplitude vérifié (saut > N points entre 2 keyframes
  proches → rejet). C'est le risque d'hallucination n°1 pour un débat de cristallisation.
- **Palette imposée** — couleurs assignées par le code, pas par le LLM (évite collisions,
  garde la cohérence V1↔V4).
- **JSON strict** — `responseMimeType: 'application/json'` ; vérifier `error` **ET**
  `data?.error` (réflexe Gemini du projet).

### Note d'honnêteté

Les caveats interprétatifs restent affichés en pied de chaque vue (coordonnées
reconstruites, diarisation imparfaite, ~19 % du débat non enregistré) — d'autant plus
nécessaires que les données sont maintenant LLM-générées.

## 6. Template généralisé

Le rendu actuel est déjà piloté à ~90 % par les données (`DEBATE_DATA.axes.x.leftLabel`,
quadrants, personas…). À généraliser :

- `<title>`, `<h1>` et les 2 labels de légende en dur lus depuis `meta` / `axes`.
- chaque onglet (V1–V4) se masque si ses données sont absentes (dégradation gracieuse UI).
- Source versionnée : **`code python/viz_template/index.html`** ; `analyze_debate.py` le
  copie dans `viz/`.
- **Le dashboard Retraite existant (`Visualisation prises de positions/`) reste tel quel**
  comme maquette de référence — on ne le casse pas.

## 7. Intégration

**Commande standalone** (comme `correct_transcript.py`) :
```powershell
.venv\Scripts\python "code python\analyze_debate.py" "transcripts\Multiculturalisme\71B505\71B505_2026-06-24_corrected.json"
```
→ écrit `transcripts\Multiculturalisme\71B505\viz\{index.html, data.js}`. Ré-exécutable
seul si une passe a échoué (quota), comme la relance de correction.

**Wiring dans `run_transcription.ps1`** : nouveau switch `-Visualize` qui, après la
correction, appelle `analyze_debate.py`. Par défaut **off** (étape LLM coûteuse) ;
activé explicitement. Cohérent avec `-Diarize`, `-EditNameMap`.

**Modèle** : `GEMINI_ANALYSIS_MODEL` (défaut `gemini-3.1-flash-lite`), distinct de
`GEMINI_MODEL` (correction). Surchargeable.

## 8. Tests

`backend/tests/test_analyze_debate.py` (Python système, comme les 70 autres ; Gemini
mocké). On teste le **déterministe** :

- calcul `weight` / `entry` / `refus` / durée depuis un JSON fixture (cas chevauchements,
  segments `refused`).
- chaque validateur : bornes, cohérence référentielle, anti-invention de noms, `kf`
  croissante + bornée, amplitude plafonnée.
- dégradation gracieuse : passe qui échoue 3× → section omise, `data.js` quand même écrit
  et valide.
- assemblage `data.js` : JSON sérialisable, schéma attendu.

## 9. Documentation

Mettre à jour `transcription-debat/CLAUDE.md` : nouvelle étape, nouveau module
`analyze_debate.py`, switch `-Visualize`, variable `GEMINI_ANALYSIS_MODEL`, table de tests
(70 → ~90).

## 10. Hors périmètre (non maintenant)

- V5 Sankey (flux de fractionnement).
- Tableau de bord unifié multi-débats / galerie centrale.
- Intégration dans l'app React Ecclesia.
- Mode semi-auto avec relecture manuelle du dataset (on assume le full-auto + garde-fous).
- Axe commun comparable entre débats (axes restent propres à chaque débat).
