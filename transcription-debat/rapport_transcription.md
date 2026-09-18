# Transcription des débats — état du code

Résumé de ce qui a bougé sur `transcription-debat/` (pipeline offline : audio + log Ecclesia → transcript attribué, anonymisé, corrigé).

## Pipeline actuel

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

Commande unique : `backend/run_transcription.ps1` (anonymise → transcrit → corrige).
Doc complète et à jour : `transcription-debat/CLAUDE.md`.

## Changements récents (par ordre chronologique)

- **Correction Gemini post-Whisper** — nouveau module `correct_transcript.py`, appelé automatiquement en fin de `transcribe_offline.py` mais aussi utilisable en standalone (relance après panne/quota). Passage par lots de 25 segments + contexte ±3, garde-fou anti-invention de prénoms, whitelist des labels autorisés, validation stricte avec retry ×2 (sinon le brut est conservé — dégradation gracieuse).
- **Correction Gemini robustifiée** — retry par lot, validation float assouplie, fallback sur le texte brut si Gemini échoue, restauration du champ `refused` que Gemini avait supprimé par erreur.
- **Organisation des transcripts par thème/table** — nouvelle arborescence `Débats/<Thème>/<CODE>/` et `transcripts/<Thème>/<CODE>/` (au lieu d'un dossier plat).
- **Module `deduplicate.py`** — 3 passes anti-hallucinations Whisper (répétitions de mots/phrases que le modèle invente). Quelques itérations de fix sur les regex (`\s{2,}` vs `\s{{2,}}`, seuil de similarité de chaînes, seuil `INTER_THRESHOLD` restauré à 0.90).
- **`correct_transcript` enrichi** — contexte élargi (±3 segments), attribution des passages `[?]` (hors tour officiel), correction sémantique en plus de la correction orthographique.
- **Appel de `deduplicate()` dans `transcribe_offline`** — la déduplication est maintenant intégrée au pipeline principal après la fusion des segments, plus besoin de la lancer à part.
- **Suppression du mode live (30/06)** — tout le code temps réel (`main.py`, `transcriber.py`, `diarizer.py`, `speaker_tracker.py` + le frontend associé) a été supprimé. Le projet est désormais **100 % offline** : on transcrit après coup à partir d'un enregistrement, plus de streaming en direct pendant le débat.

## Point d'attention côté app web (pas transcription à proprement parler)

Le frontend principal (`src/hooks/useTranscription.ts` + bouton dans `ModeratorView.tsx`) référence encore le mode **live**, qui n'existe plus côté backend depuis le 30/06. C'est du code mort tant qu'aucun serveur live ne tourne. À traiter séparément si besoin (le supprimer, ou décider de réactiver un mode live plus tard).

## Tests

70 tests pytest dans `transcription-debat/backend/tests/` : `anonymize_log` (8), `transcribe_offline` (27), `correct_transcript` (14), `deduplicate` (21).

## Documentation

Le `CLAUDE.md` du sous-projet (`transcription-debat/CLAUDE.md`) est à jour et détaille : prérequis, RGPD/anonymisation (les deux niveaux : labels + rédaction des prénoms dans le texte), pipeline étape par étape, format des fichiers produits, et dépannage. C'est la seule doc de référence pour ce module — le `CLAUDE.md` racine du dépôt pointe maintenant vers elle sans dupliquer le contenu.
