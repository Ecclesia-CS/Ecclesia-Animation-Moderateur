# Transcription offline — Spec

## Contexte

L'outil de transcription live (WebSocket + Whisper medium CPU) produit des résultats de qualité limitée. Ce module ajoute un pipeline de transcription à posteriori, à partir d'un fichier audio complet (1–2h), avec une qualité maximale et sans contrainte de temps réel.

Le pipeline exploite les logs de prises de parole Ecclesia (export CSV) pour l'attribution des locuteurs, en remplacement de la diarisation automatique (pyannote). Cela élimine la principale source d'erreurs du mode live.

---

## Usage

```bash
# Étape 1 — anonymisation du log
python anonymize_log.py ecclesia_0F6A9E_2026-05-28.csv --refuse "Faustin" --output log_anon.csv

# Étape 2 — transcription
python transcribe_offline.py audio.mp3 log_anon.csv [--audio-start 2026-05-28T11:29:15+00:00] [--group 0F6A9E]
```

---

## Script 1 — `anonymize_log.py`

### Rôle
Transforme un export CSV Ecclesia en log anonymisé prêt pour `transcribe_offline.py`. Remplace les noms réels par des labels neutres. Marque les participants ayant refusé l'enregistrement.

### Format d'entrée
CSV Ecclesia multi-sections tel qu'exporté par `generateTableCSV` :
- Lignes 1–2 : métadonnées (ignorées)
- Section `PARTICIPANTS` : résumé par participant (ignorée)
- Section `HISTORIQUE DES TOURS` : colonnes `Tour`, `Participant`, `File`, `Démarré à`, `Terminé à`, `Durée (s)`

### Paramètres
| Paramètre | Obligatoire | Description |
|---|---|---|
| `csv` | oui | Chemin vers le fichier CSV Ecclesia |
| `--refuse` | non, répétable | Nom(s) exact(s) des participants refusant l'enregistrement |
| `--output` | non | Chemin de sortie (défaut : `log_anon.csv` dans le même dossier) |

### Logique d'anonymisation
- Les labels `Interlocuteur N` sont assignés dans l'ordre de première apparition dans l'historique des tours.
- Le modérateur et les participants sans aucun tour sont ignorés.
- Les participants listés en `--refuse` reçoivent le label `[REFUS]` et `refuse=true` dans la sortie.
- La correspondance nom → label est affichée dans le terminal (pour que l'opérateur puisse la conserver) mais n'est pas écrite dans le fichier de sortie.

### Format de sortie (`log_anon.csv`)
```
interlocuteur,debut_iso,fin_iso,refuse
Interlocuteur 1,2026-05-28T11:29:15+00:00,2026-05-28T11:29:25+00:00,false
Interlocuteur 2,2026-05-28T11:52:55+00:00,2026-05-28T11:54:00+00:00,false
[REFUS],2026-05-28T12:09:58+00:00,2026-05-28T12:16:30+00:00,true
```

---

## Script 2 — `transcribe_offline.py`

### Rôle
Transcrit un fichier audio complet en s'appuyant sur le log anonymisé pour l'attribution des locuteurs. Produit un `.txt` lisible et un `.json` structuré.

### Paramètres
| Paramètre | Obligatoire | Description |
|---|---|---|
| `audio` | oui | Chemin vers le fichier audio (mp3, wav, m4a, webm…) |
| `log` | oui | Chemin vers `log_anon.csv` produit par `anonymize_log.py` |
| `--audio-start` | non | Timestamp ISO du début de l'enregistrement audio. Défaut : timestamp `debut_iso` du premier tour du log |
| `--group` | non | Nom du groupe pour nommer les fichiers de sortie. Défaut : `debat` |

### Modèle Whisper
- Modèle : `large-v3`
- Device : `cuda` (GPU), compute_type : `float16`
- `condition_on_previous_text=True` (pas de contrainte temps réel)
- `word_timestamps=True` (alignement précis pour le matching avec le log)
- `language="fr"`
- `vad_filter=True`

### Pipeline

**1. Chargement du log**
Lecture de `log_anon.csv`. Conversion des timestamps ISO (`debut_iso`, `fin_iso`) en secondes depuis le début de l'audio :
```
debut_sec = (debut_iso - audio_start).total_seconds()
```
Si `--audio-start` absent : `audio_start = min(debut_iso)` sur tous les tours du log.

**2. Transcription**
Whisper transcrit l'intégralité du fichier audio en une seule passe. Chaque segment retourné a `start`, `end`, `text`.

**3. Attribution des locuteurs**
Pour chaque segment Whisper :
- Calculer le recouvrement temporel avec chaque tour du log.
- Attribuer le tour dont le recouvrement est maximal.
- Si recouvrement maximal = 0 (segment dans un gap entre tours) : locuteur = `[?]`.
- Si le tour attribué a `refuse=true` : le texte est remplacé par `[N'a pas souhaité être enregistré(e)]`.

**4. Fusion**
Les segments consécutifs attribués au même locuteur sont fusionnés en une seule ligne (même logique que `merge_same_speaker` dans `main.py`).

**5. Écriture**
Deux fichiers dans `transcripts/` :
- `<group>_<date>.txt` — format identique au mode live
- `<group>_<date>.json` — tableau JSON structuré

### Format `.txt`
```
[00:00:00] Interlocuteur 1: Donc en 1960, le ratio actifs sur retraités était de 4...
[00:23:44] [REFUS]: [N'a pas souhaité être enregistré(e)]
[00:25:00] [?]: texte capté hors tour officiel
[00:25:35] Interlocuteur 2: Mais justement sur ce point...
```

### Format `.json`
```json
[
  {
    "start": 0.0,
    "end": 45.3,
    "speaker": "Interlocuteur 1",
    "text": "Donc en 1960, le ratio actifs sur retraités était de 4...",
    "refused": false
  },
  {
    "start": 1424.0,
    "end": 1590.5,
    "speaker": "[REFUS]",
    "text": "[N'a pas souhaité être enregistré(e)]",
    "refused": true
  }
]
```

---

## Fichiers créés

```
transcription-debat/backend/
├── anonymize_log.py        nouveau
├── transcribe_offline.py   nouveau
└── logs_prise_paroles/     dossier existant (logs source)
```

Aucun fichier existant n'est modifié.

---

## Ce qui change vs le mode live

| | Live (WebSocket) | Offline (script) |
|---|---|---|
| Modèle Whisper | `medium` int8 CPU | `large-v3` float16 GPU |
| Attribution locuteur | pyannote + SpeakerTracker | Log CSV Ecclesia |
| Hallucinations | filtre Jaccard | inutile (1 passe globale) |
| Gaps entre tours | n/a | `[?]` |
| Refus enregistrement | n/a | `[N'a pas souhaité être enregistré(e)]` |
| Durée pour 2h audio | temps réel | ~15–20 min |
| Interface | frontend React | CLI uniquement |
