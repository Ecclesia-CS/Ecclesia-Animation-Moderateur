# Spec — Intégration transcription dans Ecclesia

Date : 2026-05-26

## Contexte

Un backend Python local (faster-whisper + pyannote) transcrit l'audio en temps réel avec diarisation. L'objectif est d'intégrer la capture audio dans l'app Ecclesia existante (GitHub Pages) afin que chaque modérateur de groupe puisse démarrer/arrêter l'enregistrement depuis la vue modérateur, sans outil supplémentaire. L'admin (1 seul PC avec GPU) reçoit tous les flux, transcrit, et stocke un fichier `.txt` par groupe sur son disque local.

## Architecture

```
[Navigateur modérateur A] ──WebSocket──┐
[Navigateur modérateur B] ──WebSocket──┤── Backend Python (PC admin, GPU)
[Navigateur modérateur C] ──WebSocket──┘         │
                                             Fichiers .txt
                                         sur disque local admin
```

Accès réseau : le backend est exposé via ngrok (`ngrok http 8000`). L'URL ngrok est saisie une fois par séance dans l'UI Ecclesia et persiste en localStorage.

## Backend (`transcription-debat/backend/main.py`)

**Modifications uniquement :**

- Lire le paramètre query `?group=<joinCode>` à l'ouverture du WebSocket
- À chaque segment reçu, écrire dans `<OUTPUT_DIR>/<joinCode>_<YYYY-MM-DD>.txt`
  - Format : `[HH:MM:SS] SPEAKER_1: texte transcrit`
  - Création du fichier et du dossier si inexistants
- `OUTPUT_DIR` configurable via `.env` (défaut : `./transcripts`)
- La réponse JSON WebSocket existante est conservée (non utilisée par le client Ecclesia, mais inoffensive)

Aucune autre modification au pipeline transcription/diarisation.

## Frontend Ecclesia

### Nouveau hook `src/hooks/useTranscription.ts`

Responsabilités isolées :
- Ouvrir/fermer la connexion WebSocket vers `ws://<backendUrl>/ws?group=<joinCode>`
- Gérer `MediaRecorder` (chunks toutes les 12s, format WebM)
- Envoyer chaque chunk via WebSocket
- Exposer : `{ start, stop, isRecording, connected }`

Le hook ne stocke pas de transcript (pas d'affichage prévu).

### Modifications `src/screens/ModeratorView.tsx`

Dans le header modérateur, ajouter :

1. **Champ URL backend** — input text affiché si `backendUrl` non défini en localStorage, sinon icône d'édition. Valeur persistée en localStorage sous la clé `ecclesia_transcription_url`.

2. **Bouton "🎙 Transcription"** — utilise `useTranscription(backendUrl, session.join_code)`.
   - État idle : bouton gris "🎙 Transcription"
   - État recording : bouton rouge pulsant "⏹ Arrêter"
   - Backend déconnecté : badge "● Déconnecté" en rouge

Aucun affichage du transcript dans l'UI.

## Fichiers touchés

| Fichier | Action |
|---|---|
| `transcription-debat/backend/main.py` | Ajout paramètre `?group`, écriture disque |
| `src/hooks/useTranscription.ts` | Nouveau hook |
| `src/screens/ModeratorView.tsx` | Champ URL + bouton transcription |

## Fichiers non touchés

SessionContext, Supabase, toutes les autres vues, le reste du backend.

## Flux utilisateur

1. Admin lance `uvicorn main:app --host 0.0.0.0 --port 8000` + `ngrok http 8000`
2. Dans Ecclesia, l'admin saisit l'URL ngrok dans le champ → sauvegardé en localStorage
3. Chaque modérateur clique "🎙 Transcription" → micro demandé → enregistrement démarre
4. Chunks audio envoyés toutes les 12s au backend
5. Le backend écrit les segments en temps réel dans `transcripts/<joinCode>_<date>.txt`
6. En fin de séance, l'admin a N fichiers `.txt` sur son disque

## Contraintes

- L'URL ngrok change à chaque lancement → saisie manuelle obligatoire par séance
- Le backend doit être lancé avant que les modérateurs démarrent l'enregistrement
- Pas de persistance du transcript en cas de crash backend (segments non reçus = perdus)
- La transcription est indépendante de la modération Ecclesia (pas de lien Supabase)
