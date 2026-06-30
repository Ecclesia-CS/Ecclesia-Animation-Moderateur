# CLAUDE.md — Transcription des débats Ecclesia

Outil **offline** de transcription des débats : transforme un **enregistrement audio** + le **log des tours de parole Ecclesia** en un **transcript horodaté, attribué à chaque locuteur et anonymisé**.

> Idée centrale : **l'audio dit *ce qui* est dit, le log Ecclesia dit *qui* parle et *quand*.** On croise les deux sur l'axe du temps, puis on anonymise et on corrige avec Gemini.

```
ecclesia.csv ──anonymisation──▶ log_anon.csv + name_map.json
                                        │
audio.mp3 ──Whisper large-v3──▶ texte + horodatage au mot
                                        │
                  synchronisation des horloges (offset auto)
                                        │
                  [option: diarisation acoustique pyannote]
                                        │
            attribution mot×tour ▶ regroupement en segments lisibles
                                        │
           couverture · rédaction des prénoms · déduplication
                                        │
                  correction Gemini (lots + garde-fous)
                                        │
              <CODE>_<DATE>_corrected.txt / .json   ✅ final
```

Sortie type :
```
[00:00:38] Interlocuteur 1: C'est moi, [prénom]. Enchanté.
[00:03:29] Modérateur: [HORS-DÉBAT] Les gars, mettez vos prénoms.
[00:06:32] Interlocuteur 1: Sur le port du voile à l'école, je pense que...
[00:23:44] [REFUS]: [N'a pas souhaité être enregistré(e)]
[00:25:00] [?]: texte capté hors tour officiel
```

---

## Structure

```
transcription-debat/
├── CLAUDE.md                       ← ce document (la seule doc)
└── backend/
    ├── code python/                ← TOUT le code du pipeline
    │   ├── anonymize_log.py        anonymise le CSV Ecclesia → log_anon.csv + name_map.json
    │   ├── transcribe_offline.py   Whisper large-v3 + alignement + attribution (appelle correct_transcript)
    │   ├── correct_transcript.py   correction Gemini post-Whisper (aussi standalone)
    │   ├── deduplicate.py          supprime répétitions / hallucinations Whisper (3 passes)
    │   ├── analyze_debate.py        génère viz/ (data.js + index.html) par analyse Gemini étagée
    │   └── viz_template/index.html  template HTML généralisé (header/onglets pilotés par data.js)
    ├── tests/                      104 tests (anonymize 8 + transcribe_offline 27 + correct 14 + deduplicate 21 + analyze_debate 34)
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

- **GPU NVIDIA** (Whisper `large-v3` tourne sur GPU). ~15-20 min pour 2 h d'audio.
- Python + le venv backend (`backend/.venv/`).
- **ffmpeg** dans le PATH (décodage audio).
- Fichier `backend/.env` :
  ```
  GEMINI_API_KEY=AIza...     # correction Gemini (optionnelle, dégradation gracieuse si absente)
  HF_TOKEN=hf_...            # diarisation pyannote (option --diarize uniquement)
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
| `-Participants` | | Prénoms entendus, séparés par virgule — aide Whisper à les reconnaître |
| `-Refuse` | | Participant(s) ayant refusé l'enregistrement (répétable) → `[REFUS]` |
| `-RedactNames` | | Prénoms à masquer **en plus** de `name_map.json` (→ `[prénom]`) |
| `-AudioStart` | | Offset ISO si l'auto-détection se trompe |
| `-GeminiModel` | | Override du modèle (défaut `gemini-3.1-flash-lite`) |
| `-Diarize` | | Active la diarisation pyannote (nécessite `HF_TOKEN`) |
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
Options : `--audio-start "<ISO>"`, `--diarize`.

### Relancer **seulement** la correction Gemini (panne/quota)
```powershell
.venv\Scripts\python "code python\correct_transcript.py" "transcripts\<Thème>\<CODE>\<CODE>_<DATE>.json"
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

Deux niveaux :

1. **Les labels** : `anonymize_log.py` remplace chaque pseudo par `Interlocuteur N` (ou `[REFUS]`), et écrit `name_map.json` (table `prénom réel → label`).
2. **Le texte parlé** : les gens se nomment à l'oral (« Merci Sarah »). `redact_names` remplace ces prénoms **dans le texte** par leur label / `[prénom]` / `[nom]`, à partir de `name_map.json` (casse-insensible, frontières de mot, ≥ 3 caractères).

**Pourquoi enrichir `name_map.json` à la main** : Whisper entend souvent une **variante** du pseudo (pseudo `SASA` mais on entend « Sarah » ; `chacha` mais « Chahima »). Le mapping auto ne couvre que les pseudos exacts. Ajoute les variantes orales et les **noms de famille** :

```json
{
  "SASA": "Interlocuteur 4", "Sasa": "Interlocuteur 4", "Sarah": "Interlocuteur 4",
  "chacha": "Interlocuteur 3", "Chahima": "Interlocuteur 3", "Chayma": "Interlocuteur 3",
  "Claude": "[prénom]", "Becquemont": "[nom]", "Reinaudo": "[nom]"
}
```
- Mappe vers un **label** quand tu sais qui c'est (cohérence), sinon vers `[prénom]`/`[nom]`.
- Garde-fou complémentaire : Gemini a interdiction d'**inventer** un prénom et n'utilise que les labels autorisés (le meneur devient `Modérateur`).

---

## Pipeline d'attribution (détail)

| Étape | Fichier | Ce qui se passe |
|---|---|---|
| Anonymisation | `anonymize_log.py` | Parse `HISTORIQUE DES TOURS`, attribue `Interlocuteur N`, écrit `log_anon.csv` + `name_map.json`. |
| Transcription | `transcribe_offline.py` | Whisper `large-v3` (GPU), `word_timestamps=True`, `condition_on_previous_text=False` + seuils anti-hallucination (`compression_ratio`/`log_prob`/`no_speech`). |
| Synchronisation | `detect_audio_start` | Teste les offsets 0–600 s, garde celui qui **maximise le recouvrement** segments↔tours (ou `--audio-start`). |
| Diarisation (option) | `run_diarization` + `split_turns_by_diarization` | pyannote détecte « qui parle vraiment » ; marque `[?]` les sous-intervalles où le locuteur acoustique ≠ détenteur officiel de la parole. Best-effort : dégrade gracieusement sans `HF_TOKEN`. |
| Attribution | `assign_speakers_words` | Chaque **mot** est attribué au tour qui contient son milieu, puis regroupé par locuteur — plus précis que par segment (frontières VAD ≠ frontières de tours). Fallback segment (`assign_speakers`) si pas de mots horodatés. |
| Seuil de confiance | `MIN_OVERLAP_RATIO` (0.30) | Un segment recouvrant un tour à < 30 % → `[?]` plutôt qu'une attribution arbitraire. |
| Plafond de fusion | `MERGE_MAX_DURATION=120s`, `MERGE_MAX_CHARS=1400`, `MERGE_MAX_GAP=3s` | Un monologue long est découpé en blocs lisibles, plus de mur de texte. |
| Couverture | `coverage_report` | ⚠ si > 15 % de l'audio en `[?]` (log incomplet / offset douteux). |
| Rédaction | `redact_names` | Masque les prénoms réels dans le texte via `name_map.json`. |
| Déduplication | `deduplicate.py` | Supprime répétitions / hallucinations Whisper (3 passes). |
| Correction | `correct_transcript.py` | Gemini par lots de 25 (+contexte ±3) : corrige mots/ponctuation, attribue les `[?]` (whitelist), marque `[HORS-DÉBAT]`, masque les noms. `_validate` rejette toute triche → retry ×2, sinon brut conservé. |
| Visualisation (option) | `analyze_debate.py` | Analyse Gemini étagée (4 passes : cadre+voix, events+tension, trajectoires, réseau conceptuel) → `viz/data.js` + dashboard. Champs mesurables (poids, entrée, refus) calculés sans LLM. Dégradation gracieuse par passe. |

### Labels du transcript
- `Interlocuteur N` — participant anonymisé · `Modérateur` — meneur de séance.
- `[REFUS]` — a refusé l'enregistrement (audio non transcrit).
- `[?]` — audio capté hors d'un tour officiel (couloir, chevauchement).
- `[HORS-DÉBAT]` — préfixe d'un passage logistique/chahut.
- `[prénom]` / `[nom]` — identité réelle masquée dans le texte.

### Fichiers produits
```
transcripts/<Thème>/<CODE>/<CODE>_<DATE>.txt              Whisper brut (aligné)
transcripts/<Thème>/<CODE>/<CODE>_<DATE>.json             idem (structuré)
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.txt    final (corrigé + anonymisé) ✅
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.json   idem (structuré) ✅
```
Format `.json` : `[{ "start": 38.4, "end": 55.0, "speaker": "Interlocuteur 1", "text": "...", "refused": false }]`

La correction Gemini (`gemini-3.1-flash-lite` par défaut, quota free tier plus large que `2.5-flash` ; surchargeable via `GEMINI_MODEL`) est automatique. Si elle échoue sur un lot (503/429), les segments bruts sont conservés (**dégradation gracieuse**).

---

## Tests

Depuis `backend/`, avec le **Python système** (pas le venv) :
```
python -m pytest tests/ -v
```
104 tests : `anonymize_log` (8) + `transcribe_offline` (27) + `correct_transcript` (14) + `deduplicate` (21) + `analyze_debate` (34). `conftest.py` (racine backend) ajoute `transcription/` au `sys.path`.

---

## Règles critiques (agent)

- **Tout le code vit dans `backend/code python/`** (nom avec espace → toujours le quoter dans les commandes). Les imports entre modules sont à plat (`from deduplicate import ...`) : ça marche car Python ajoute le dossier du script au `sys.path` à l'exécution, et `conftest.py` fait de même pour pytest. Ne pas réintroduire d'imports relatifs/package.
- **Toujours préfixer `.venv\Scripts\python`** et lancer **depuis `backend/`** (chemins relatifs `"code python\xxx.py"`, `Débats\...`).
- **`correct_transcript.py` est standalone** ET appelé par `transcribe_offline.py` — garder les deux chemins fonctionnels.
- **`MIN_OVERLAP_RATIO` / plafonds de fusion** : constantes de `transcribe_offline.py` ; les modifier change la lisibilité ET la proportion de `[?]`.
- **Gemini** : vérifier `error` ET `data?.error`. Ne jamais lever le garde-fou anti-invention de prénoms dans le prompt de `correct_transcript.py`.
- **Pas de mode live.** `main.py`/`transcriber.py`/`diarizer.py`/`speaker_tracker.py` et le frontend ont été supprimés : tout est offline.
- **`analyze_debate.py`** : le LLM ne fait que de l'interprétation ; `weight`/`entry`/`refus`/durée sont calculés depuis le JSON, jamais demandés au LLM. Ne jamais lever le garde-fou anti-invention (le LLM ne référence que les `id` de voix calculés). `GEMINI_ANALYSIS_MODEL` distinct de `GEMINI_MODEL`. Le template `viz_template/index.html` doit rester piloté par `data.js` (header + masquage d'onglets).

---

## Dépannage

| Symptôme | Cause / solution |
|---|---|
| `faster-whisper n'est pas installé` | Utiliser `.venv\Scripts\python`, pas `python`. |
| `Unable to allocate … MiB` (numpy) | Manque de RAM (extraction des features). Fermer des applis, relancer — échec immédiat, pas coûteux. |
| Gemini `503` / `429` | Surcharge / quota. Le pipeline garde le **brut** et finit. Relancer la correction plus tard, ou `-GeminiModel`/`$env:GEMINI_MODEL`. |
| `HF_TOKEN absent — diarisation ignorée` | Renseigner `HF_TOKEN` dans `backend/.env` (uniquement pour `--diarize`). |
| Diarisation : crash `cudnnGetLibConfig` | cuDNN GPU incompatible. pyannote tourne sur **CPU par défaut**. Forcer le GPU : `$env:PYANNOTE_DEVICE = "cuda"`. |
| pyannote : import `speechbrain k2_fsa` échoue | `.venv\Scripts\python -m pip install "speechbrain==1.0.0"`. |
| `> 15 % non attribué [?]` | Le log ne couvre pas tout l'audio (ouverture/fin hors log) — souvent normal. Vérifier l'offset. |
| Téléchargement Whisper coupé | Relancer la même commande (reprise auto). |
| Date du fichier ≠ date du débat | Le nom utilise la date de **lancement**. Renommer si besoin. |
