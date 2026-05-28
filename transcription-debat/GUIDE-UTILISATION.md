# Guide d'utilisation — Transcription des débats Ecclesia

Ce guide explique comment transcrire un débat Ecclesia, en live pendant le débat ou à posteriori depuis un fichier audio.

---

## Prérequis

- Python installé avec le venv backend (`backend/.venv/`)
- Node.js installé (pour le frontend live)
- Un token Hugging Face dans `backend/.env` (obligatoire uniquement pour le mode live) :
  ```
  HF_TOKEN=hf_xxxxx
  ```
- Toutes les commandes Python s'exécutent avec `.venv\Scripts\python` depuis le dossier `backend/`

---

## Mode 1 — Transcription live en local

Le modérateur ouvre l'interface dans son navigateur. Le micro de son PC capture le débat et envoie l'audio au backend toutes les 11 secondes. La transcription s'affiche en temps réel.

**Quand l'utiliser** : pendant le débat, si tu veux une transcription immédiate à l'écran.

**Limites** : qualité moindre (modèle rapide), locuteurs parfois mal identifiés.

### Lancement

Ouvrir deux terminaux dans le dossier `transcription-debat/`.

**Terminal 1 — Backend :**
```
cd backend
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend :**
```
cd frontend
npm run dev
```

Ouvrir `http://localhost:5173` dans le navigateur.

1. Dans le champ **Groupe**, saisir le code de la table Ecclesia (ex : `0F6A9E`)
2. Cliquer **Démarrer**
3. Le transcript s'affiche en temps réel
4. Cliquer **Arrêter** pour stopper l'enregistrement
5. Utiliser le bouton **Exporter** pour télécharger le transcript

Le fichier texte est aussi sauvegardé automatiquement dans :
```
backend/transcripts/<CODE>_<DATE>.txt
```

---

## Mode 2 — Transcription à posteriori (haute qualité)

On transcrit un fichier audio complet après le débat. Ce mode utilise le meilleur modèle Whisper (large-v3) et s'appuie sur les logs Ecclesia pour savoir exactement qui parle à chaque instant — bien plus fiable que le mode live.

**Quand l'utiliser** : après le débat, dès que tu as l'enregistrement audio. Durée : environ 15-20 minutes pour 2h d'audio.

**Résultat** : deux fichiers dans `backend/transcripts/` — un `.txt` lisible et un `.json` pour exploiter les données.

---

### Étape 0 — Préparer les fichiers

Créer un dossier pour le débat :
```
backend/Débats/<Thème>/<CODE>/
```

Y placer :
- Le fichier audio (`.mp3`, `.m4a`, `.wav`...)
- L'export CSV Ecclesia de la table (bouton **Export CSV** dans les Outils Modo)

Exemple pour le débat Retraite du 28 mai :
```
backend/Débats/Retraite/0F6A9E/
    Thursday.mp3
    ecclesia_0F6A9E_2026-05-28.csv
```

---

### Étape 1 — Anonymiser le log

Cette étape remplace les vrais noms par des labels neutres (`Interlocuteur 1`, `Interlocuteur 2`...) et marque les participants ayant refusé l'enregistrement audio.

Depuis `backend/` :
```
.venv\Scripts\python anonymize_log.py "Débats\<Thème>\<CODE>\ecclesia_<CODE>_<DATE>.csv" --refuse "Prénom" --output "Débats\<Thème>\<CODE>\log_anon.csv"
```

Exemple :
```
.venv\Scripts\python anonymize_log.py "Débats\Retraite\0F6A9E\ecclesia_0F6A9E_2026-05-28.csv" --refuse "Faustin" --output "Débats\Retraite\0F6A9E\log_anon.csv"
```

Si plusieurs personnes ont refusé :
```
--refuse "Prénom1" --refuse "Prénom2"
```

Le terminal affiche la correspondance nom → label. **Note-la** : elle n'est pas sauvegardée dans les fichiers.

```
Jules            -> Interlocuteur 1
Ilyès            -> Interlocuteur 2
Emilien          -> Interlocuteur 3
Faustin          -> [REFUS]
Maxence Reinaudo -> Interlocuteur 4
Mathis L         -> Interlocuteur 5
```

---

### Étape 2 — Lancer la transcription

Depuis `backend/` :
```
.venv\Scripts\python transcribe_offline.py "Débats\<Thème>\<CODE>\audio.mp3" "Débats\<Thème>\<CODE>\log_anon.csv" --group <CODE>
```

Exemple :
```
.venv\Scripts\python transcribe_offline.py "Débats\Retraite\0F6A9E\Thursday.mp3" "Débats\Retraite\0F6A9E\log_anon.csv" --group 0F6A9E
```

Le script affiche sa progression. À la fin :
```
1896 segments Whisper produits.
Transcript écrit :
  backend/transcripts/0F6A9E_2026-05-29.txt
  backend/transcripts/0F6A9E_2026-05-29.json
```

**Premier lancement uniquement** : le modèle Whisper large-v3 (3.1 Go) se télécharge automatiquement. Compter environ 1h selon la connexion. En cas de coupure réseau, relancer la même commande — le téléchargement reprend automatiquement là où il s'était arrêté.

---

### Lire les résultats

**Fichier `.txt`** — lecture humaine :
```
[00:00:00] Interlocuteur 1: Donc en 1960, le ratio actifs sur retraités était de 4...
[00:23:44] [REFUS]: [N'a pas souhaité être enregistré(e)]
[00:25:00] [?]: texte capté hors tour officiel
[00:25:35] Interlocuteur 2: Mais justement sur ce point...
```

- `Interlocuteur N` : participant anonymisé (voir la correspondance notée à l'Étape 1)
- `[REFUS]` : participant ayant refusé l'enregistrement — son audio n'est pas transcrit
- `[?]` : audio capté entre deux tours officiels (couloirs, chevauchements)

**Fichier `.json`** — exploitation des données (visualisation, statistiques...) :
```json
[
  {
    "start": 0.0,
    "end": 45.3,
    "speaker": "Interlocuteur 1",
    "text": "Donc en 1960...",
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

## Organisation recommandée des fichiers

```
backend/
├── Débats/
│   └── Retraite/
│       └── 0F6A9E/
│           ├── Thursday.mp3               Audio source
│           ├── ecclesia_0F6A9E_2026-05-28.csv   Export Ecclesia
│           └── log_anon.csv               Log anonymisé (généré)
└── transcripts/
    ├── 0F6A9E_2026-05-29.txt             Transcript lisible
    └── 0F6A9E_2026-05-29.json            Transcript structuré
```

Les dossiers `Débats/` et `transcripts/` ne sont pas versionnés (données personnelles et fichiers audio volumineux).

---

## Problèmes fréquents

**"faster-whisper n'est pas installé"**
Utiliser `.venv\Scripts\python` et non `python`.

**Téléchargement bloqué ou coupé**
Relancer la même commande — la reprise est automatique.

**Le transcript date d'aujourd'hui mais le débat était hier**
Normal : le nom du fichier utilise la date de lancement du script. Renommer manuellement si besoin.

**L'audio démarre avant le premier tour officiel**
Ajouter `--audio-start "2026-05-28T11:28:50+00:00"` avec le timestamp exact du début de l'enregistrement.
