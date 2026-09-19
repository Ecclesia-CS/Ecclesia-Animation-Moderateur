# CLAUDE.md — Transcription des débats Ecclesia

Outil **offline** de transcription des débats : transforme un **enregistrement audio** + le **log des tours de parole Ecclesia** en un **transcript horodaté, attribué à chaque locuteur et anonymisé**.

> Idée centrale : **l'audio dit *ce qui* est dit, le log Ecclesia dit *qui a la parole*, la voix dit *qui parle vraiment*.** On croise les trois sur l'axe du temps, puis on anonymise et on corrige avec Gemini — sans jamais laisser un LLM deviner qui parle.

```
ecclesia.csv ──anonymisation──▶ log_anon.csv + name_map.json
                                        │
audio.mp3 ──Whisper large-v3──▶ mots horodatés (+ probabilité)   [cache <CODE>_whisper.json]
          ──pyannote 3.1──────▶ voix anonymes S0, S1…              [cache <CODE>_diarization.json]
                                        │
      synchronisation des horloges (offset auto, affiné par les voix)
                                        │
      rattachement voix → participant au cœur des tours du log (+ validation croisée)
                                        │
      recalage des frontières de tours (changement de voix / fin de phrase / pause)
                                        │
      attribution au MOT : log × voix ▶ regroupement en segments (provenance, mots douteux)
                                        │
           couverture · rédaction des prénoms · déduplication
                                        │
      correction Gemini (lots + garde-fous de fidélité ; [?] → suggestion seulement)
                                        │
   <CODE>_<DATE>_corrected.txt / .json ✅ final   ·   <CODE>_<DATE>_rapport.json (fiabilité)
```

Sortie type :
```
[00:00:38] Interlocuteur 1: C'est moi, [prénom]. Enchanté.
[00:03:29] Interlocuteur 7: [HORS-DÉBAT] Les gars, mettez vos prénoms.
[00:06:32] Interlocuteur 1: Sur le port du voile à l'école, je pense que...
[00:23:44] [REFUS]: [N'a pas souhaité être enregistré(e)]
[00:25:00] [?] (suggestion IA : Interlocuteur 2 ?): texte sans log ni voix identifiée
```

Conception, résultats chiffrés et références : [docs/superpowers/specs/2026-09-19-attribution-voix-design.md](docs/superpowers/specs/2026-09-19-attribution-voix-design.md).

---

## Structure

```
transcription-debat/
├── CLAUDE.md                       ← ce document (la seule doc)
└── backend/
    ├── code python/                ← TOUT le code du pipeline
    │   ├── anonymize_log.py        anonymise le CSV Ecclesia → log_anon.csv + name_map.json
    │   ├── transcribe_offline.py   orchestration : Whisper, caches, attribution, rapport (appelle correct_transcript)
    │   ├── voice.py                identification des voix : rattachement voix→participant, décalage, validation croisée, fusion log×voix au mot
    │   ├── boundaries.py           recalage des frontières de tours sur la parole réelle
    │   ├── correct_transcript.py   correction Gemini post-Whisper, garde-fous de fidélité (aussi standalone)
    │   ├── deduplicate.py          supprime répétitions / hallucinations Whisper (3 passes)
    │   ├── quality.py              indicateurs qualité sans référence + WER/WDER
    │   ├── evaluate.py             CLI : metrics · kit (extraits de référence à corriger à l'écoute) · score
    │   ├── analyze_debate.py        génère viz/ (data.js + index.html) par analyse Gemini étagée
    │   └── viz_template/index.html  template page unique piloté par data.js (sections conditionnelles)
    ├── tests/                      204 tests (anonymize, transcribe_offline, voice, boundaries, correct, deduplicate, quality, evaluate, analyze_debate)
    ├── conftest.py                 ajoute "code python/" au sys.path pour les tests
    ├── run_transcription.ps1       ← LA commande unique (anonymise → transcrit → corrige)
    ├── requirements.txt
    ├── .env                        HF_TOKEN + GEMINI_API_KEY
    ├── Débats/<Thème>/<CODE>/      entrées (audio.mp3, ecclesia_*.csv) — non versionné
    └── transcripts/<Thème>/<CODE>/ sorties — non versionné (viz/ = dashboard autonome)
```

`Débats/` et `transcripts/` ne sont **pas versionnés** (données personnelles + audio volumineux).

---

## Prérequis

- **GPU NVIDIA** (Whisper `large-v3` et pyannote tournent sur GPU). ~15-20 min de Whisper + ~7 min de pyannote pour 2 h d'audio (RTX 3070). Les deux résultats sont mis en cache : rejouer l'attribution est ensuite quasi instantané.
- Python + le venv backend (`backend/.venv/`).
- **ffmpeg** dans le PATH (décodage audio).
- Fichier `backend/.env` :
  ```
  GEMINI_API_KEY=AIza...     # correction Gemini (optionnelle, dégradation gracieuse si absente)
  HF_TOKEN=hf_...            # identification des voix pyannote (active par défaut ; sans token → attribution par le log seul)
  GEMINI_ANALYSIS_MODEL=...  # modèle de l'étape visualisation (défaut gemini-3.1-flash-lite)
  ```
- **1er lancement** : Whisper large-v3 (~3,1 Go) se télécharge automatiquement (reprise auto si coupure).

> Toutes les commandes Python s'exécutent avec `.venv\Scripts\python` **depuis `backend/`**.

---

## Lancer tout en une commande (recommandé)

`backend/run_transcription.ps1` enchaîne **anonymisation → transcription → correction**.

```powershell
cd backend
.\run_transcription.ps1 `
  -Csv   "Débats\Multiculturalisme\71B505\ecclesia_table_71B505_2026-06-17.csv" `
  -Audio "Débats\Multiculturalisme\71B505\audio.mp3" `
  -Code  71B505 `
  -Topic "Multiculturalisme" `
  -Participants "Emilien,Lysandre,Chahima,Sarah,Maxence,Loulou,Jules,Mimi,Ilyès" `
  -RedactNames "Antoine,Justine,Faustin" `
  -EditNameMap
```

| Paramètre | Obligatoire | Rôle |
|---|---|---|
| `-Csv` | ✅ | Export Ecclesia (.csv) |
| `-Audio` | ✅ | Enregistrement (.mp3/.wav/.m4a…) |
| `-Code` | ✅ | Code de la table (ex. `71B505`) — nom des fichiers de sortie |
| `-Topic` | ✅ | Thème — aide Whisper/Gemini + dossier de sortie |
| `-Participants` | | Prénoms entendus, séparés par virgule — aide Whisper à les reconnaître (usage local uniquement : **jamais envoyés à Gemini**) |
| `-Refuse` | | Participant(s) ayant refusé l'enregistrement (répétable) → `[REFUS]` |
| `-RedactNames` | | Prénoms à masquer **en plus** de `name_map.json` (→ `[prénom]`) |
| `-AudioStart` | | Offset ISO si l'auto-détection se trompe |
| `-GeminiModel` | | Override du modèle (défaut `gemini-3.1-flash-lite`) |
| `-NoDiarize` | | Désactive l'identification des voix (active par défaut si `HF_TOKEN`) — attribution par le log seul |
| `-WhisperCache` | | Réutilise `<CODE>_whisper.json` (évite ~20 min de GPU) |
| `-DiarizationCache` | | Réutilise `<CODE>_diarization.json` (évite ~7 min de GPU) |
| `-EditNameMap` | | Pause après anonymisation pour éditer `name_map.json` (ouvre le Bloc-notes) — **fortement recommandé** (voir RGPD) |
| `-SkipAnonymize` | | Réutilise un `log_anon.csv` existant |
| `-DryRun` | | Affiche les commandes sans rien exécuter |

---

## Lancer étape par étape (manuel)

### 1 — Anonymiser le log
```powershell
.venv\Scripts\python "code python\anonymize_log.py" "Débats\<Thème>\<CODE>\ecclesia_<CODE>_<DATE>.csv" --refuse "Prénom" --output "Débats\<Thème>\<CODE>\log_anon.csv"
```
Produit `log_anon.csv` + `name_map.json`, et **affiche la table `nom → Interlocuteur N`**. `--refuse` répétable.

### 2 — (recommandé) Enrichir `name_map.json` — voir § RGPD.

### 3 — Transcrire + corriger (automatique)
```powershell
.venv\Scripts\python "code python\transcribe_offline.py" "Débats\<Thème>\<CODE>\audio.mp3" "Débats\<Thème>\<CODE>\log_anon.csv" --group <CODE> --topic "<Thème>" --participants "P1,P2,P3" --redact-names "P4,P5"
```
Options : `--audio-start "<ISO>"`, `--no-diarize`, `--whisper-cache <CODE>_whisper.json`, `--diarization-cache <CODE>_diarization.json`, `--output-dir`.

### Rejouer l'attribution sans GPU (après une modification du pipeline)
```powershell
.venv\Scripts\python "code python\transcribe_offline.py" "Débats\<Thème>\<CODE>\audio.mp3" "Débats\<Thème>\<CODE>\log_anon.csv" --group <CODE> --topic "<Thème>" `
  --whisper-cache "transcripts\<Thème>\<CODE>\<CODE>_whisper.json" --diarization-cache "transcripts\<Thème>\<CODE>\<CODE>_diarization.json"
```

### Mesurer la qualité
```powershell
# indicateurs sans référence (comparer deux versions)
python "code python\evaluate.py" metrics transcripts\<Thème>\<CODE>\A.json transcripts\<Thème>\<CODE>\B.json
# extraits de référence à corriger à l'écoute (texte pré-rempli + audio découpé)
python "code python\evaluate.py" kit transcripts\...\<CODE>_<DATE>_corrected.json --audio "Débats\...\audio.mp3" --windows 460-760,4300-4600 --out transcripts\<Thème>\<CODE>\reference --code <CODE>
# une fois corrigés : WER (texte) + WDER (attribution)
python "code python\evaluate.py" score transcripts\<Thème>\<CODE>\reference\extrait_1.txt A_corrected.json B_corrected.json
```

### Relancer **seulement** la correction Gemini (panne/quota)
```powershell
.venv\Scripts\python "code python\correct_transcript.py" "transcripts\<Thème>\<CODE>\<CODE>_<DATE>.json" --topic "<Thème>"
# changer de modèle ponctuellement :
$env:GEMINI_MODEL = "gemini-2.5-flash"
```

### Générer la visualisation (option)
Via le pipeline complet :
```powershell
.\run_transcription.ps1 -Csv ... -Audio ... -Code <CODE> -Topic "<Thème>" -Visualize
```
Ou seule, sur un transcript déjà corrigé :
```powershell
.venv\Scripts\python "code python\analyze_debate.py" "transcripts\<Thème>\<CODE>\<CODE>_<DATE>_corrected.json"
# modèle ponctuel : $env:GEMINI_ANALYSIS_MODEL = "gemini-flash"
```
Produit `transcripts\<Thème>\<CODE>\viz\{index.html, data.js}`. Ré-exécutable seul si une passe a échoué (quota).

---

## Anonymisation (RGPD) — important

Trois niveaux :

1. **Les labels** : `anonymize_log.py` remplace chaque pseudo par `Interlocuteur N` (ou `[REFUS]`), et écrit `name_map.json` (table `prénom réel → label`).
2. **Le texte parlé** : les gens se nomment à l'oral (« Merci Sarah »). `redact_names` remplace ces prénoms **dans le texte** par leur label / `[prénom]` / `[nom]`, à partir de `name_map.json` (casse-insensible, frontières de mot, ≥ 3 caractères). Il masque aussi, **de façon déterministe**, les variantes orales proches (mot à majuscule en milieu de phrase, ≥ 5 lettres, une lettre d'écart sans accents, ex. « Solanje »/« Sölange » pour « Solange ») avec le même label.
3. **La relecture** : un prénom totalement absent de `name_map.json` n'est masqué que si Gemini y pense — ce qui n'est **pas reproductible** d'un run à l'autre (constaté sur 71B505). Le rapport (`correction.noms_propres_a_verifier`) liste les noms propres restés visibles : les relire et ajouter les prénoms privés à `name_map.json`, puis relancer.

**Pourquoi enrichir `name_map.json` à la main** : Whisper entend souvent une **variante** du pseudo (pseudo `SASA` mais on entend « Sarah » ; `chacha` mais « Chahima »). Le mapping auto ne couvre que les pseudos exacts. Ajoute les variantes orales et les **noms de famille** :

```json
{
  "SASA": "Interlocuteur 4", "Sasa": "Interlocuteur 4", "Sarah": "Interlocuteur 4",
  "chacha": "Interlocuteur 3", "Chahima": "Interlocuteur 3", "Chayma": "Interlocuteur 3",
  "Claude": "[prénom]", "Becquemont": "[nom]", "Reinaudo": "[nom]"
}
```
- Mappe vers un **label** quand tu sais qui c'est (cohérence), sinon vers `[prénom]`/`[nom]`.
- Garde-fou complémentaire : Gemini a interdiction d'**inventer** un prénom et n'utilise que les labels autorisés. Une correction Gemini rejetée par les garde-fous garde quand même les prénoms qu'il a masqués.
- Refus : un tour `[REFUS]` n'est jamais réduit par le recalage des frontières, et **la voix** d'une personne qui a refusé est masquée partout (y compris hors de ses tours). Le cache `<CODE>_whisper.json` conservé est assaini (mots des refus vidés, prénoms masqués).

---

## Pipeline d'attribution (détail)

| Étape | Fichier | Ce qui se passe |
|---|---|---|
| Anonymisation | `anonymize_log.py` | Parse `HISTORIQUE DES TOURS`, attribue `Interlocuteur N`, écrit `log_anon.csv` + `name_map.json`. |
| Transcription | `transcribe_offline.py` | Whisper `large-v3` (GPU), `word_timestamps=True`, `condition_on_previous_text=False` + seuils anti-hallucination (`compression_ratio`/`log_prob`/`no_speech`). |
| Synchronisation | `detect_audio_start` | Teste les offsets 0–600 s, garde celui qui **maximise le recouvrement** segments↔tours (ou `--audio-start`). |
| Diarisation | `run_diarization` | pyannote 3.1 (GPU si dispo) → voix anonymes. Best-effort : sans `HF_TOKEN` ou en cas d'erreur, attribution par le log seul. |
| Décalage fin | `voice.refine_offset` | Affine l'horloge (± 20 s, pas 0,5 s) en maximisant la pureté voix × participants. |
| Rattachement des voix | `voice.map_clusters` | Au cœur des tours : voix majoritaire (≥ 50 %, ≥ 15 s) des tours d'un seul participant → ce participant ; ou ≥ 60 % de sa parole chez un même participant. Sinon faible / fusionnée / distincte → **jamais utilisée comme preuve**. `holdout_agreement` mesure la fiabilité (validation croisée 2 plis). |
| Frontières | `boundaries.snap_turn_boundaries` | Le log horodate le clic, pas la parole : chaque frontière (fenêtre −4/+6 s) va au changement de voix, sinon à la fin de phrase, sinon à la pause ≥ 0,3 s. `[REFUS]` jamais réduit. |
| Attribution | `voice.fuse_word_speakers` → `group_words` | Chaque **mot** : `log+voix` (concordants), `log` (pas de voix exploitable), `voix` (hors log, ou autre participant ≥ 1 s pendant le tour), `aucune` → `[?]`. Sans diarisation : `assign_speakers_words` (log seul). Fallback segment (`assign_speakers`) si pas de mots horodatés. |
| Seuil de confiance | `MIN_OVERLAP_RATIO` (0.30) | Un segment recouvrant un tour à < 30 % → `[?]` plutôt qu'une attribution arbitraire. |
| Plafond de fusion | `MERGE_MAX_DURATION=120s`, `MERGE_MAX_CHARS=1400`, `MERGE_MAX_GAP=3s` | Un monologue long est découpé en blocs lisibles, plus de mur de texte. |
| Couverture | `coverage_report` | ⚠ si > 15 % de l'audio en `[?]` (log incomplet / offset douteux). |
| Rédaction | `redact_names` | Masque les prénoms réels dans le texte via `name_map.json`. |
| Déduplication | `deduplicate.py` | Supprime répétitions / hallucinations Whisper (3 passes). |
| Correction | `correct_transcript.py` | Gemini par lots de 25 (+contexte ±3), reçoit seulement start/end/speaker/text/refused + `mots_douteux` : corrige mots/ponctuation, marque `[HORS-DÉBAT]`, masque les noms. Validation **par segment** (`_segment_ok`) : un segment dont Gemini change l'orateur ou l'horodatage garde seul son brut ; si Gemini fusionne/omet des segments, les autres sont réalignés par horodatage ; JSON inexploitable → retry ×2, sinon brut conservé (`correction: aucune`). **Garde-fous de fidélité** par segment : négation ajoutée/retirée, masque posé sur un mot qui n'a pas l'air d'un prénom, ou > max(4 mots, 20 %) modifiés → texte Whisper conservé (`correction: rejetee`, `texte_gemini` gardé). Un `[?]` attribué par Gemini devient `speaker_suggestion` — jamais `speaker`. |
| Visualisation (option) | `analyze_debate.py` | Analyse Gemini étagée (3 passes : cadre+ancres d'axes, events+tension, scoring par bloc de parole sur **échelle ordinale -2..+2** remappée ×5, ancres injectées dans le prompt, T=0+seed) → trajectoires **calculées** (EWMA pondérée saillance plancher 0,3, position **figée pendant les silences > 3 min**) → `viz/data.js` + dashboard **page unique** (carte animée + frise synchronisées, polarisation Esteban-Ray par axe, preuve de trajectoire par voix). **Audit de symétrie** automatique (re-scoring d'un échantillon avec axes inversés → `meta.reliability`). Champs mesurables (poids, entrée, refus, `speech`, polarisation) calculés sans LLM. Dégradation gracieuse par passe et par lot. |

### Labels du transcript
- `Interlocuteur N` — participant anonymisé. Le modérateur est un participant comme un autre s'il s'accorde la parole dans l'app : sa voix le retrouve partout (ouverture, relances, tour de table) sous son `Interlocuteur N`. `Modérateur` n'apparaît plus que comme suggestion de Gemini.
- `[REFUS]` — a refusé l'enregistrement (audio non transcrit).
- `[?]` — ni tour du log ni voix identifiée ; `[?] (suggestion IA : X ?)` si Gemini propose un orateur à partir du texte (non vérifié).
- `[HORS-DÉBAT]` — préfixe d'un passage logistique/chahut.
- `[prénom]` / `[nom]` — identité réelle masquée dans le texte.

### Fichiers produits
```
transcripts/<Thème>/<CODE>/<CODE>_<DATE>.txt              Whisper brut (aligné)
transcripts/<Thème>/<CODE>/<CODE>_<DATE>.json             idem (structuré)
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.txt    final (corrigé + anonymisé) ✅
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.json   idem (structuré) ✅
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_rapport.json     fiabilité : décalage, rattachement des voix, validation croisée, frontières, métriques
transcripts/<Thème>/<CODE>/<CODE>_whisper.json            cache Whisper assaini (mots + probabilités)
transcripts/<Thème>/<CODE>/<CODE>_diarization.json        cache pyannote (voix anonymes)
```
Format `.json` : `[{ "start": 38.4, "end": 55.0, "speaker": "Interlocuteur 1", "text": "...", "refused": false, "speaker_source": "log+voix", "low_conf_words": ["..."] }]`
Champs ajoutés par la correction : `correction` (`gemini` | `rejetee` | `aucune`), `correction_motif` + `texte_gemini` si rejetée, `speaker_suggestion` pour un `[?]`.

La correction Gemini (`gemini-3.1-flash-lite` par défaut, quota free tier plus large que `2.5-flash` ; surchargeable via `GEMINI_MODEL`) est automatique. Si elle échoue sur un lot (503/429), les segments bruts sont conservés (**dégradation gracieuse**).

---

## Tests

Depuis `backend/`, avec le **Python système** (pas le venv) :
```
python -m pytest tests/ -v
```
204 tests : `anonymize_log`, `transcribe_offline`, `voice`, `boundaries`, `correct_transcript`, `deduplicate`, `quality`, `evaluate`, `analyze_debate`. `conftest.py` (racine backend) ajoute `code python/` au `sys.path` ; `tests/conftest.py` neutralise `run_diarization` (les tests ne lancent jamais pyannote : ils passent par `--diarization-cache`).

---

## Règles critiques (agent)

- **Tout le code vit dans `backend/code python/`** (nom avec espace → toujours le quoter dans les commandes). Les imports entre modules sont à plat (`from deduplicate import ...`) : ça marche car Python ajoute le dossier du script au `sys.path` à l'exécution, et `conftest.py` fait de même pour pytest. Ne pas réintroduire d'imports relatifs/package.
- **Toujours préfixer `.venv\Scripts\python`** et lancer **depuis `backend/`** (chemins relatifs `"code python\xxx.py"`, `Débats\...`).
- **`correct_transcript.py` est standalone** ET appelé par `transcribe_offline.py` — garder les deux chemins fonctionnels.
- **`MIN_OVERLAP_RATIO` / plafonds de fusion** : constantes de `transcribe_offline.py` ; les modifier change la lisibilité ET la proportion de `[?]`.
- **Gemini** : vérifier `error` ET `data?.error`. Ne jamais lever le garde-fou anti-invention de prénoms dans le prompt de `correct_transcript.py`.
- **Qui parle = preuves seulement** (log, voix). Gemini ne fait jamais une attribution (`speaker_suggestion` seulement) ; une voix non rattachée (`faible`/`fusionnee`/`distincte`) n'est jamais utilisée. Ne pas réintroduire d'attribution par LLM dans `speaker`.
- **Garde-fous de fidélité** (`_correction_risk`, `_transfer_masks`) : ne pas les lever ; les seuils (`MAX_EDIT_RATIO`, `MIN_EDITS_FLOOR`, `NEGATORS`) sont à recalibrer sur des extraits de référence (`evaluate.py score`), pas à l'intuition.
- **RGPD** : ne jamais réduire un tour `[REFUS]` (`boundaries.py`), toujours masquer la voix rattachée à `[REFUS]` (`fuse_word_speakers`), et n'écrire le cache Whisper qu'assaini (`sanitize_cache_words`). Les prénoms réels (`--participants`) restent locaux : ne pas les passer à `correct()`.
- **Toute évolution de l'attribution se mesure** : rejouer avec `--whisper-cache` + `--diarization-cache` et comparer `evaluate.py metrics` (et `score` quand des références existent) avant/après.
- **Pas de mode live.** `main.py`/`transcriber.py`/`diarizer.py`/`speaker_tracker.py` et le frontend ont été supprimés : tout est offline.
- **`analyze_debate.py`** : le LLM ne fait que de l'interprétation ; `weight`/`entry`/`refus`/`speech`/durée, les trajectoires (`kf`, lissage EWMA des scores par bloc) ET la polarisation (Esteban-Ray) sont calculés depuis le JSON, jamais demandés au LLM. Les `stance`/ancres sont des REFORMULATIONS — `validate_scores` rejette les guillemets ; ne jamais lever ce garde-fou ni l'anti-invention de prénoms. `GEMINI_ANALYSIS_MODEL` distinct de `GEMINI_MODEL`. Le template `viz_template/index.html` est une page unique pilotée par `data.js` (sections conditionnelles, durée via `meta.totalDurationMinutes` — jamais en dur).
- **Fondations scientifiques de l'analyse** (voir `Visualisation prises de positions/recherche_classification_opinions_2026-07.md`) — ne pas défaire sans lire le doc : appels Gemini d'analyse en `GEN_CONFIG` (temperature 0 + seed, §5.2) ; scoring sur échelle **ordinale** -2..+2 (`ORD_MIN/ORD_MAX`), remappée `×ORD_SCALE` à l'ingestion (§8.3.1) ; ancres des pôles injectées dans le prompt de scoring (`_anchor_lines`, §5.3) ; salience bornée par `SALIENCE_FLOOR=0.3` (§8.3.4) ; keyframes de maintien `TRAJ_HOLD_GAP=3 min`/`TRAJ_TRANSITION=1 min` — une voix silencieuse ne glisse pas sur la carte (§8.3.3) ; audit de symétrie `run_symmetry_audit` (inversion d'axes, ≥ 8 blocs, → `meta.reliability`, §8.4.3) désactivable via `analyze(..., audit=False)`.

---

## Dépannage

| Symptôme | Cause / solution |
|---|---|
| `faster-whisper n'est pas installé` | Utiliser `.venv\Scripts\python`, pas `python`. |
| `Unable to allocate … MiB` (numpy) | Manque de RAM (extraction des features). Fermer des applis, relancer — échec immédiat, pas coûteux. |
| Gemini `503` / `429` | Surcharge / quota. Le pipeline garde le **brut** et finit. Relancer la correction plus tard, ou `-GeminiModel`/`$env:GEMINI_MODEL`. |
| `HF_TOKEN absent — identification des voix ignorée` | Renseigner `HF_TOKEN` dans `backend/.env` (accès aux modèles pyannote). Sans lui, attribution par le log seul. |
| Diarisation : crash `cudnnGetLibConfig` | cuDNN GPU incompatible (constaté en juin ; le GPU fonctionne depuis, 394 s pour 2 h le 19/09). Forcer le CPU : `$env:PYANNOTE_DEVICE = "cpu"` (bien plus lent). |
| Accord voix/log < 85 % dans le rapport | Diarisation peu fiable (salle bruyante, voix proches) ou décalage d'horloge faux : vérifier `voix.rattachement` dans `<CODE>_<DATE>_rapport.json`, sinon `-NoDiarize`. |
| pyannote : import `speechbrain k2_fsa` échoue | `.venv\Scripts\python -m pip install "speechbrain==1.0.0"`. |
| `> 15 % non attribué [?]` | Le log ne couvre pas tout l'audio (ouverture/fin hors log) — souvent normal. Vérifier l'offset. |
| Téléchargement Whisper coupé | Relancer la même commande (reprise auto). |
| Date du fichier ≠ date du débat | Le nom utilise la date de **lancement**. Renommer si besoin. |
