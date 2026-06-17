# CLAUDE.md — Outil de transcription Ecclesia

Outil de transcription des débats Ecclesia. Deux modes distincts : **live** (transcription en temps réel pendant le débat) et **à posteriori** (transcription haute qualité depuis un fichier audio complet après le débat).

---

## Architecture

```
transcription-debat/
├── backend/                     Serveur Python FastAPI
│   ├── main.py                  Serveur WebSocket live (Whisper medium CPU)
│   ├── transcriber.py           Wrapper Whisper
│   ├── diarizer.py              Wrapper pyannote (live uniquement)
│   ├── speaker_tracker.py       Suivi locuteurs cross-chunks (live uniquement)
│   ├── anonymize_log.py         Script CLI — anonymise le CSV Ecclesia
│   ├── transcribe_offline.py    Script CLI — transcription à posteriori (appelle correct_transcript en fin)
│   ├── correct_transcript.py    Script CLI — correction Gemini post-Whisper (aussi standalone)
│   ├── requirements.txt
│   ├── .env                     HF_TOKEN (pyannote live) + GEMINI_API_KEY (correction offline)
│   ├── transcripts/             Fichiers .txt et .json produits
│   └── Débats/                  Dossier des débats archivés
│       └── <Thème>/<CODE>/
│           ├── audio.mp3
│           ├── ecclesia_<CODE>_<DATE>.csv   Export Ecclesia brut
│           └── log_anon.csv                 Log anonymisé (généré)
└── frontend/                    Interface React (Vite + Tailwind)
    └── src/
        └── hooks/useWebSocket.ts  URL backend : ws://localhost:8000/ws
```

---

## Mode 1 — Live en local (backend et frontend sur le même PC)

Le frontend capture le micro du navigateur, envoie des chunks audio au backend toutes les 11s via WebSocket. Whisper medium transcrit en temps réel.

### Lancement

**Terminal 1 — Backend** (depuis `backend/`) :
```
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend** (depuis `frontend/`) :
```
npm run dev
```

Ouvrir le navigateur sur `http://localhost:5173`.

Dans le champ "Groupe :", saisir le `join_code` Ecclesia de la table (ex: `0F6A9E`) avant de cliquer Démarrer.

### Transcript produit

Fichier texte incrémental pendant le débat :
```
backend/transcripts/0F6A9E_2026-05-28.txt
```

### Limites du mode live

- Modèle `medium` (moins précis que large-v3)
- Diarisation automatique par pyannote (peut créer des locuteurs en doublon)
- Chunks de 12s avec 1s de recouvrement — latence ~15-30s

---

## Mode 2 — Live à distance (backend sur ce PC, frontend sur un autre appareil)

Le backend tourne sur ce PC (avec le GPU). Le frontend tourne dans un navigateur sur n'importe quel appareil du réseau local. Nécessite d'exposer le backend.

### Option A — Réseau local direct (même WiFi)

**Trouver l'IP de ce PC** :
```
ipconfig
```
Repérer l'adresse IPv4 locale (ex: `192.168.1.42`).

**Lancer le backend** (depuis `backend/`) :
```
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**Modifier l'URL WebSocket** dans `frontend/src/hooks/useWebSocket.ts`, ligne 19 :
```typescript
const ws = new WebSocket(`ws://192.168.1.42:8000/ws?group=${encodedGroup}`)
```
Remplacer `192.168.1.42` par l'IP réelle.

**Lancer le frontend** (depuis `frontend/`) :
```
npm run dev -- --host
```
L'autre appareil accède via `http://192.168.1.42:5173`.

**Important** : remettre `localhost` dans `useWebSocket.ts` après usage pour ne pas casser le mode local.

### Option B — Exposition Internet via ngrok

```
ngrok http 8000
```
Remplacer `localhost:8000` dans `useWebSocket.ts` par l'URL ngrok (`wss://xxxx.ngrok.io`).

---

## Mode 3 — À posteriori (transcription haute qualité depuis un audio complet)

Pipeline offline en deux étapes. Utilise Whisper `large-v3` sur GPU (RTX 3070) + le log des tours de parole Ecclesia pour l'attribution des locuteurs (remplace pyannote). Nettement plus précis que le mode live.

**Durée** : ~15-20 min pour 2h d'audio (premier lancement : +1h de téléchargement du modèle large-v3).

### Prérequis

- Le fichier audio du débat (`.mp3`, `.wav`, `.m4a`, `.webm`)
- L'export CSV Ecclesia de la table (`ecclesia_<CODE>_<DATE>.csv`)
- Connaître le(s) participant(s) ayant refusé l'enregistrement audio

Placer les fichiers dans `backend/Débats/<Thème>/<CODE>/`.

### Étape 1 — Anonymiser le log

Depuis `backend/` :
```
.venv\Scripts\python anonymize_log.py "Débats\<Thème>\<CODE>\ecclesia_<CODE>_<DATE>.csv" --refuse "Prénom" --output "Débats\<Thème>\<CODE>\log_anon.csv"
```

Exemple réel (débat Retraite 0F6A9E, Faustin a refusé) :
```
.venv\Scripts\python anonymize_log.py "Débats\Retraite\0F6A9E\ecclesia_0F6A9E_2026-05-28.csv" --refuse "Faustin" --output "Débats\Retraite\0F6A9E\log_anon.csv"
```

Le terminal affiche la correspondance nom → label (à conserver dans tes notes) :
```
Jules            -> Interlocuteur 1
Ilyès            -> Interlocuteur 2
Emilien          -> Interlocuteur 3
Faustin          -> [REFUS]
Maxence Reinaudo -> Interlocuteur 4
Mathis L         -> Interlocuteur 5
```

Plusieurs refus possibles : `--refuse "Prénom1" --refuse "Prénom2"`.

### Étape 2 — Transcrire

Depuis `backend/` :
```
.venv\Scripts\python transcribe_offline.py "Débats\<Thème>\<CODE>\audio.mp3" "Débats\<Thème>\<CODE>\log_anon.csv" --group <CODE>
```

Exemple réel :
```
.venv\Scripts\python transcribe_offline.py "Débats\Retraite\0F6A9E\Thursday.mp3" "Débats\Retraite\0F6A9E\log_anon.csv" --group 0F6A9E
```

Paramètre optionnel `--audio-start` : si l'enregistrement audio a démarré avant le premier tour officiel, préciser le timestamp ISO de début :
```
--audio-start "2026-05-28T11:28:50+00:00"
```
Sans ce paramètre, le script suppose que l'audio commence au moment du premier tour Ecclesia.

### Fichiers produits

```
backend/transcripts/<CODE>_<DATE>.txt              Whisper brut — lecture humaine
backend/transcripts/<CODE>_<DATE>.json             Whisper brut — données structurées
backend/transcripts/<CODE>_<DATE>_corrected.txt    Corrigé par Gemini (si GEMINI_API_KEY présente)
backend/transcripts/<CODE>_<DATE>_corrected.json   Corrigé par Gemini (si GEMINI_API_KEY présente)
```

La correction Gemini est automatique à la fin de `transcribe_offline.py`. Si `GEMINI_API_KEY` est absente ou si Gemini échoue, les fichiers bruts sont produits normalement sans erreur.

Pour relancer uniquement la correction sans retranscrire (ex : après avoir renseigné la clé API) :
```
.venv\Scripts\python correct_transcript.py "transcripts\<CODE>_<DATE>.json"
```

Format `.txt` (brut et corrigé) :
```
[00:00:00] Interlocuteur 1: Donc en 1960, le ratio actifs sur retraités...
[00:23:44] [REFUS]: [N'a pas souhaité être enregistré(e)]
[00:25:00] [?]: texte capté hors tour officiel
```

Format `.json` :
```json
[
  { "start": 0.0, "end": 45.3, "speaker": "Interlocuteur 1", "text": "...", "refused": false },
  { "start": 1424.0, "end": 1590.5, "speaker": "[REFUS]", "text": "[N'a pas souhaité être enregistré(e)]", "refused": true }
]
```

---

## Format du CSV Ecclesia

L'export CSV produit par Ecclesia (`Outils Modo > Export CSV`) a deux sections :

```
"Ecclesia — Export débat"
"Session","CODE","Créé le","..."

"PARTICIPANTS"
"Pseudo","Tours","Temps total (s)"
...

"HISTORIQUE DES TOURS"
"Tour","Participant","File","Démarré à","Terminé à","Durée (s)"
1,"Jules","File longue","2026-05-28T11:29:15+00:00","2026-05-28T11:29:25+00:00",10
...
```

`anonymize_log.py` parse automatiquement ce format — ne pas modifier la structure du CSV.

---

## Dépendances et environnement

Tout tourne dans le venv `.venv` du dossier `backend/`. Toujours préfixer les commandes Python par `.venv\Scripts\python`.

Fichier `.env` (backend/) :
```
HF_TOKEN=hf_xxxxx       # Token Hugging Face pour pyannote (diarisation live)
GEMINI_API_KEY=AIza...  # Clé API Gemini pour la correction offline (optionnelle)
```

Premier lancement offline : téléchargement automatique de Whisper large-v3 (~3.1 Go) dans le cache Hugging Face. Les fois suivantes : démarrage immédiat.

---

## Tests

Depuis `backend/` :
```
python -m pytest tests/ -v
```
27 tests (7 anonymize_log + 12 transcribe_offline + 8 correct_transcript). Le pytest tourne avec le Python système (pas le venv) car le venv n'a pas pytest installé.
