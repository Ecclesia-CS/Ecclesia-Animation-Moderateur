# Design — Correction Gemini de la transcription à posteriori

**Date :** 2026-06-17  
**Périmètre :** `transcription-debat/backend/` — mode offline uniquement  
**Statut :** Approuvé

---

## Contexte et objectif

La transcription offline produite par `transcribe_offline.py` (Whisper large-v3 + attribution par log Ecclesia) est utilisée pour :
- être partagée aux participants du débat
- être archivée / publiée
- alimenter des traitements IA downstream (résumé, analyse de positions)

Whisper large-v3 produit une transcription robuste mais imparfaite : mots mal reconnus, noms propres déformés, ponctuation absente. L'objectif est d'y ajouter une étape de correction lexicale légère via l'API Gemini, sans reformuler ni modifier le fond.

---

## Décisions de design

- **Post-traitement uniquement** — Whisper transcrit d'abord, Gemini corrige après. Le transcript brut reste toujours intact.
- **Appel unique** — le transcript complet est envoyé à Gemini en un seul appel (Gemini 2.0 Flash, contexte 1M tokens). Un appel par segment serait plus lent, plus cher, et perdrait le contexte global (noms propres, cohérence).
- **Module séparé + appelé automatiquement** — `correct_transcript.py` contient la logique de correction et est appelé à la fin de `transcribe_offline.py`. L'utilisateur lance une seule commande. `correct_transcript.py` peut aussi être utilisé en standalone pour relancer la correction sans retranscrire.
- **Correction minimale** — corriger uniquement les erreurs évidentes (mots mal reconnus, ponctuation, noms propres). Ne pas reformuler, ne pas supprimer les hésitations, ne pas modifier le style.

---

## Architecture

```
transcribe_offline.py          (existant, modifié)
    └── à la fin, importe et appelle correct_transcript.correct()

correct_transcript.py          (nouveau)
    ├── fonction correct(segments, output_path_stem) → bool
    └── CLI standalone : python correct_transcript.py <json_path>
```

### Commande utilisateur (inchangée)

```
.venv\Scripts\python transcribe_offline.py "Débats\Retraite\0F6A9E\Thursday.mp3" "Débats\Retraite\0F6A9E\log_anon.csv" --group 0F6A9E
```

### Fichiers produits

```
transcripts/0F6A9E_2026-05-28.txt             Whisper brut (toujours produit)
transcripts/0F6A9E_2026-05-28.json            Whisper brut (toujours produit)
transcripts/0F6A9E_2026-05-28_corrected.txt   Version Gemini (si succès)
transcripts/0F6A9E_2026-05-28_corrected.json  Version Gemini (si succès)
```

---

## Prompt Gemini

**Modèle :** `gemini-2.0-flash`  
**Clé API :** `GEMINI_API_KEY` dans `backend/.env`

```
Tu es un correcteur de transcription de débat oral.
Corrige uniquement les erreurs évidentes de transcription Whisper :
- mots mal reconnus (homophonie, confusion lexicale)
- ponctuation manquante ou absurde
- noms propres déformés

Ne reformule PAS. Ne supprime PAS les "euh", hésitations, répétitions.
Ne modifie PAS le sens ni le style de chaque interlocuteur.
Les segments avec "refused": true : ne pas toucher, laisser tels quels.
Les segments avec speaker "[?]" : corriger le texte normalement.

Réponds UNIQUEMENT avec le JSON corrigé, même structure exacte, aucun commentaire.
```

Le JSON envoyé est la liste de segments produite par `transcribe_offline.py` :
```json
[
  { "start": 0.0, "end": 45.3, "speaker": "Interlocuteur 1", "text": "...", "refused": false },
  ...
]
```

---

## Validation du retour Gemini

Avant d'écrire les fichiers `_corrected.*`, vérifier :
1. Le retour est du JSON valide (parseable)
2. Le nombre de segments est identique à l'entrée
3. Les champs `start`, `end`, `speaker`, `refused` sont inchangés (seul `text` peut changer)

Si une validation échoue → warning affiché, fichiers `_corrected.*` non créés, pipeline ne crashe pas.

---

## Gestion d'erreurs

| Cas | Comportement |
|---|---|
| `GEMINI_API_KEY` absent du `.env` | Warning, étape correction skippée, fichiers bruts produits normalement |
| Erreur réseau / quota Gemini | Warning, étape correction skippée |
| JSON retourné invalide | Warning, fichiers `_corrected.*` non créés |
| Nombre de segments différent | Warning, fichiers `_corrected.*` non créés |
| Champs structurels modifiés | Warning, fichiers `_corrected.*` non créés |

**Invariant de sécurité :** les fichiers bruts Whisper ne sont jamais remplacés ni modifiés par cette étape. La correction est toujours additive.

---

## Configuration

Ajouter dans `backend/.env` :
```
GEMINI_API_KEY=AIza...
```

Dépendance à ajouter dans `requirements.txt` :
```
google-generativeai
```

---

## Tests

Ajouter dans `backend/tests/` :
- `test_correct_transcript.py` — tests unitaires avec mock de l'API Gemini
  - correction appliquée correctement
  - validation JSON invalide → pas de fichier produit
  - validation nombre segments différent → pas de fichier produit
  - `GEMINI_API_KEY` absent → skip sans crash
