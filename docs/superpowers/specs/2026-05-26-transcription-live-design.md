# Transcription Live avec Détection d'Interlocuteur

Date : 2026-05-26  
Statut : Approuvé

---

## Contexte

Application web standalone permettant la retranscription en temps réel de débats réels (assemblées, clubs de discussion) depuis un unique microphone partagé. Sortie : fichier texte annoté par locuteur. Aucun fichier audio conservé. Tout gratuit et auto-hébergeable.

---

## Contraintes

- Langue : français uniquement
- Micro : un seul micro partagé par tous les interlocuteurs
- Gratuit : modèles open-source uniquement (HuggingFace, no API payante)
- Auto-hébergeable : backend Python local + frontend dans le navigateur
- Pas de fichier audio persisté sur disque
- Durée illimitée (débats > 1h supportés)

---

## Architecture

```
Navigateur (React + Vite)             Backend Python (FastAPI)
─────────────────────────             ────────────────────────
MediaRecorder (micro)
  │ chunk audio toutes les 12s
  │ + 1s overlap
  ▼
WebSocket client  ──────────────────► WebSocket server
                                           │
                                      faster-whisper (transcription FR)
                                      pyannote.audio (diarisation)
                                      speaker_tracker (IDs cohérents)
                                           │
                  ◄──────────────────  JSON {speaker, text, timestamp}
  │
TranscriptView (affichage live)
+ accumulation en mémoire
  │
ExportButton → télécharge .txt
```

---

## Composants Frontend

| Composant | Rôle |
|---|---|
| `App.tsx` | État global : `idle \| recording \| stopped` |
| `AudioCapture` | `MediaRecorder`, chunks 12s + 1s overlap, envoi WebSocket |
| `TranscriptView` | Affichage lignes en temps réel, auto-scroll |
| `ExportButton` | Génère et télécharge le `.txt` depuis le transcript accumulé |

**Stack :** React 18 + Vite + TypeScript + Tailwind CSS

---

## Composants Backend

| Module | Rôle |
|---|---|
| `main.py` | Serveur FastAPI, endpoint WebSocket `/ws` |
| `transcriber.py` | Wrapper faster-whisper (`medium`, `fr`) |
| `diarizer.py` | Wrapper pyannote.audio (`speaker-diarization-3.1`) |
| `speaker_tracker.py` | Réidentification inter-chunks par similarité d'embeddings vocaux — maintient des IDs cohérents (`Locuteur 1`, `Locuteur 2`…) à travers les chunks |

**Stack :** Python 3.10+, FastAPI, faster-whisper, pyannote.audio, websockets

---

## Flux de données (par chunk)

1. `MediaRecorder` produit un blob audio (webm/opus) toutes les 12s
2. Le blob est envoyé en binaire via WebSocket
3. Backend écrit le chunk dans un fichier temporaire en RAM (`/tmp`)
4. `faster-whisper` → segments `[start, end, text]`
5. `pyannote` → segments `[start, end, speaker_id]`
6. `speaker_tracker` aligne les IDs avec les chunks précédents
7. Segments fusionnés → renvoyés en JSON au frontend
8. Fichier temporaire supprimé immédiatement

---

## Format de sortie

**Affichage UI :**
```
[00:00:08] Locuteur 1 : Bienvenue à cette assemblée générale.
[00:00:15] Locuteur 2 : Merci. Je souhaite aborder le point budgétaire.
```

**Fichier .txt exporté :**
```
Transcription — 2026-05-26 14:32
Durée totale : 1h 12min
Locuteurs détectés : 4
─────────────────────────────────
[00:00:08] Locuteur 1 : Bienvenue à cette assemblée générale.
[00:00:15] Locuteur 2 : Merci. Je souhaite aborder le point budgétaire.
```

---

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| Micro coupé | Message d'erreur UI, reprise possible |
| Backend injoignable | Retry WebSocket automatique x3 |
| Chunk < 2s (silence) | Ignoré silencieusement |
| pyannote échoue | Transcription affichée sans label (`[?]`) |

---

## Dépendances

**Frontend (`package.json`) :**
- react, react-dom
- vite, typescript, tailwindcss

**Backend (`requirements.txt`) :**
- fastapi
- uvicorn
- faster-whisper
- pyannote.audio
- python-dotenv
- websockets

**Config :**
- `.env` — `HF_TOKEN=<token HuggingFace gratuit>` (requis une seule fois pour télécharger pyannote)

---

## Performances attendues

| Matériel | Latence par chunk |
|---|---|
| CPU standard | 15–25s |
| GPU (CUDA) | 5–8s |

Acceptable pour un compte-rendu de débat (non critique temps réel).

---

## Hors scope

- Identification par prénom (auto-numérotation uniquement)
- Support multilingue
- Sauvegarde cloud
- Interface d'administration des locuteurs
