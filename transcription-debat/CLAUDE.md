# CLAUDE.md — Outil de transcription Ecclesia

Deux modes : **live** (temps réel, Whisper medium) et **offline** (haute qualité, Whisper large-v3 + correction Gemini).

---

## Architecture

```
transcription-debat/
├── backend/
│   ├── main.py                  Serveur WebSocket live
│   ├── transcriber.py / diarizer.py / speaker_tracker.py   Live uniquement
│   ├── anonymize_log.py         CLI — anonymise le CSV Ecclesia
│   ├── transcribe_offline.py    CLI — transcription offline (appelle correct_transcript)
│   ├── correct_transcript.py    CLI — correction Gemini post-Whisper (aussi standalone)
│   ├── .env                     HF_TOKEN + GEMINI_API_KEY
│   ├── transcripts/<Thème>/<CODE>/   Fichiers produits
│   └── Débats/<Thème>/<CODE>/
│       ├── audio.mp3
│       ├── ecclesia_<CODE>_<DATE>.csv
│       └── log_anon.csv
└── frontend/src/hooks/useWebSocket.ts   URL : ws://localhost:8000/ws
```

---

## Mode live

**Backend** (depuis `backend/`) :
```
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
**Frontend** (depuis `frontend/`) : `npm run dev` → `http://localhost:5173`

Pour accès réseau local : `npm run dev -- --host` + modifier l'IP dans `useWebSocket.ts` ligne 19.
Pour Internet : `ngrok http 8000` + remplacer l'URL dans `useWebSocket.ts`.

Limites : modèle `medium`, diarisation pyannote approximative, latence 15-30s.

---

## Mode offline (recommandé)

Whisper `large-v3` GPU + log Ecclesia pour l'attribution. ~15-20 min pour 2h d'audio.

### Étape 1 — Anonymiser le log

Depuis `backend/` :
```
.venv\Scripts\python anonymize_log.py "Débats\<Thème>\<CODE>\ecclesia_<CODE>_<DATE>.csv" --refuse "Prénom" --output "Débats\<Thème>\<CODE>\log_anon.csv"
```
Plusieurs refus : `--refuse "Prénom1" --refuse "Prénom2"`. Affiche la correspondance nom → label à noter.

### Étape 2 — Transcrire

Depuis `backend/` :
```
.venv\Scripts\python transcribe_offline.py "Débats\<Thème>\<CODE>\audio.mp3" "Débats\<Thème>\<CODE>\log_anon.csv" --group <CODE> --topic "<Thème>" --participants "Interlocuteur 1,Interlocuteur 2,..."
```

- `--topic` : thème du débat — améliore Whisper et Gemini, sert de dossier de sortie
- `--participants` : labels anonymisés séparés par virgule — améliore la reconnaissance des noms
- `--audio-start <ISO>` : optionnel — si absent, l'offset est détecté automatiquement

### Fichiers produits

```
transcripts/<Thème>/<CODE>/<CODE>_<DATE>.txt              Whisper brut
transcripts/<Thème>/<CODE>/<CODE>_<DATE>.json             Whisper brut (structuré)
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.txt    Corrigé par Gemini
transcripts/<Thème>/<CODE>/<CODE>_<DATE>_corrected.json   Corrigé par Gemini
```

La correction Gemini (`gemini-2.5-flash`) est automatique. Si elle échoue sur un batch, les segments bruts sont conservés (dégradation gracieuse). Pour relancer uniquement la correction :
```
.venv\Scripts\python correct_transcript.py "transcripts\<Thème>\<CODE>\<CODE>_<DATE>.json"
```

Format `.txt` :
```
[00:00:00] Interlocuteur 1: Donc en 1960, le ratio actifs sur retraités...
[00:23:44] [REFUS]: [N'a pas souhaité être enregistré(e)]
[00:25:00] [?]: texte capté hors tour officiel
```

---

## Environnement

Toujours préfixer par `.venv\Scripts\python`. Fichier `.env` (backend/) :
```
HF_TOKEN=hf_xxxxx       # pyannote (live uniquement)
GEMINI_API_KEY=AIza...  # correction offline (optionnelle)
```
Premier lancement offline : téléchargement Whisper large-v3 (~3.1 Go).

---

## Tests

Depuis `backend/` avec Python système (pas le venv) :
```
python -m pytest tests/ -v
```
27 tests : 7 anonymize_log + 12 transcribe_offline + 8 correct_transcript.
