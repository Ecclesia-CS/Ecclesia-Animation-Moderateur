# Référence — Sous-projet transcription des débats

> Pointeur vers le second projet du dépôt, indépendant de l'app web.

---

## Sous-projet : Transcription des débats

Dossier `transcription-debat/` — **outil offline autonome**, indépendant de l'app web. Transforme un enregistrement audio + le log CSV des tours de parole Ecclesia en un transcript horodaté, attribué par locuteur, anonymisé et corrigé.

> **Doc complète et à jour** : [transcription-debat/CLAUDE.md](./transcription-debat/CLAUDE.md). Ne pas dupliquer son contenu ici — cette section n'est qu'un pointeur.

- **Pipeline** : anonymisation (`anonymize_log.py`) → Whisper `large-v3` GPU (mots horodatés + probabilité) → identification des voix pyannote 3.1 rattachées aux participants par le log (`voice.py`) → recalage des frontières de tours (`boundaries.py`) → attribution au mot log × voix (`transcribe_offline.py`) → déduplication (`deduplicate.py`) → correction Gemini sous garde-fous de fidélité (`correct_transcript.py`) → rapport de fiabilité + mesure WER/WDER (`quality.py`, `evaluate.py`). Commande unique : `backend/run_transcription.ps1`.
- **Stack** : Python + venv (`backend/.venv/`), `faster-whisper`, `google-genai`, ffmpeg. Secrets dans `backend/.env` (`GEMINI_API_KEY`, `HF_TOKEN`). `Débats/` et `transcripts/` non versionnés (RGPD + audio volumineux).
- **Tests** : 204 tests pytest (`transcription-debat/backend/tests/`).
- **Historique récent** (voir git) : correction Gemini post-Whisper (juin), module `deduplicate` 3 passes (2026-06-21), organisation des transcripts par thème/table, **suppression du mode live → offline uniquement (2026-06-30)**, analyse/visualisation des prises de position (juillet), **identification des voix ancrée sur le log + garde-fous Gemini (2026-09-19, voir `transcription-debat/docs/superpowers/specs/2026-09-19-attribution-voix-design.md`)**.
- **Plans/specs archivés** : `transcription-debat/docs/superpowers/`. Les plans *live*/*intégration* qui vivaient à la racine `docs/superpowers/` (`2026-05-26-transcription-live*`, `2026-05-26-transcription-integration*`) ont été **supprimés au chantier 78** (2026-09-07) : le mode live a été abandonné le 30/06/2026 et son dernier reliquat de code (`useTranscription.ts`) retiré au chantier 43. Ils restent consultables dans l'historique git si besoin (`git log --diff-filter=D -- docs/superpowers/`).

---

---

*Annexe de [`CLAUDE.md`](../CLAUDE.md) — extraite au chantier 78 (2026-09-07) pour alléger le fichier réinjecté au démarrage de chaque session. **Contenu déplacé tel quel, rien n'a été supprimé ni résumé.** Si une information d'ici doit redevenir un réflexe permanent, la remonter dans `CLAUDE.md` plutôt que de la dupliquer.*
