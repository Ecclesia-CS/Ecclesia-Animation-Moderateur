# Audit transcription — 71B505_2026-06-21_corrected

Débat « Multiculturalisme », ~2 h 05 d'audio (span 7517 s), 9 locuteurs au log + 1 modérateur.
Pipeline audité : `transcribe_offline.py` → `deduplicate.py` → `correct_transcript.py` (Gemini 2.5 Flash).

---

## Constats chiffrés

| Mesure | Valeur | Problème |
|---|---|---|
| Segments produits | 66 | Très peu pour 2 h → segments énormes |
| Segment le plus long | **1915 s (32 min)** | Mur de texte illisible, mono-locuteur `[?]` |
| Top 4 durées | 1915 / 412 / 378 / 349 s | 4 segments = ~50 min d'un seul bloc |
| Couverture du log | log s'arrête à 13:26, audio jusqu'à 13:55 | **~30 min finales non couvertes → tout en `[?]`** |
| Début du débat | 6 min (seg 1, 349 s) en `[?]`→`Claude` | modérateur absent du log |
| Segments `[?]` | 12 / 66 (≈ 18 %) | non attribués |
| Réécritures de locuteur par Gemini | 8 (`[?]`→prénom/label) | dont 2 `[?]`→**`Claude`** |

---

## Diagnostic des causes racines

### 1. L'attribution repose sur le log de tours SEUL, sans diarisation acoustique
`assign_speakers()` attribue chaque segment Whisper au tour Ecclesia qui le recouvre le plus.
Or, en débat réel, **le détenteur de la parole (log) ≠ qui parle réellement** (brouhaha, interruptions, apartés). Résultat : le segment 1 (349 s) attribue 6 minutes de chahut d'installation (« mettez vos prénoms ! », « le terroriste islamiste », plusieurs voix) à un seul locuteur. C'est la faiblesse structurelle n°1.

### 2. `merge_same_speaker` crée des méga-segments qui amplifient chaque erreur
La fusion des segments consécutifs de même locuteur colle jusqu'à **32 minutes** ensemble. Une seule frontière mal attribuée fusionne une demi-heure en un bloc. Illisible, et impossible d'isoler les vrais tours.

### 3. `word_timestamps=True` est calculé mais JAMAIS exploité (gros gain gratuit)
`transcribe_offline.py:202` active les timestamps par mot, mais `assign_speakers()` n'attribue qu'au niveau du **segment entier**. D'où les décalages de frontière visibles : le seg 2 commence par « Enfin, qui cherche ses origines… » qui est en réalité la **fin de la question du modérateur**. On pourrait attribuer chaque *mot* au tour qui le recouvre puis re-segmenter aux changements de locuteur — bien plus précis, données déjà disponibles.

### 4. L'anonymisation est cassée dans le corps du texte (enjeu RGPD)
La pseudonymisation ne porte que sur les *labels* de locuteur. Le texte transcrit regorge de **vrais prénoms non masqués** : Sarah, Lysandre, Chahima/Chayma, Jules, Antoine, Justine, Faustin… Pire, Gemini **réinjecte** un prénom réel en réécrivant `[?]`→`Claude` (2 fois). Le livrable « anonymisé » expose donc l'identité des participants.

### 5. Couverture du log partielle, non signalée
Le log ne couvre ni les 6 min d'ouverture (modérateur hors log) ni les ~30 min finales (le log s'arrête à 13:26). Ces zones tombent toutes en `[?]` (dont le bloc de 1915 s). Le pipeline ne **quantifie ni n'avertit** de ce taux de non-couverture.

### 6. Pas de seuil de confiance d'attribution
`assign_speakers()` attribue dès que `best_overlap > 0`, même si le segment ne chevauche un tour qu'à 5 %. Un segment à cheval sur deux tours est attribué arbitrairement au plus long, sans repli vers `[?]`.

### 7. Bruit / hors-sujet capté et attribué comme du débat
L'interlude « vente de légumes » (seg 32), les apartés techniques (« tu peux mettre un pseudo où »), le chahut, sont transcrits et attribués à un participant. Aucun marquage « hors-débat ».

### 8. Répétitions/hallucinations Whisper résiduelles
« B5, B5… B5, B5 », « c'est ça, c'est ça », « Vont être utiles. Vont être utiles ». `condition_on_previous_text=True` (ligne 200) favorise les boucles de répétition. `deduplicate` en attrape une partie, pas tout.

### 9. Gemini peut inventer/réattribuer sans garde-fou
Le prompt autorise Gemini à remplacer `[?]` « parmi les participants connus », mais rien ne l'empêche d'inventer un prénom réel hors liste (cas `Claude`). Aucune validation que le label produit ∈ liste anonymisée.

---

## Axes d'amélioration (par impact / effort)

### 🔴 Impact fort

1. **Attribution au mot, pas au segment.** Exploiter les `word_timestamps` déjà calculés : attribuer chaque mot au tour qui recouvre son milieu, puis découper le segment à chaque changement de locuteur. Corrige les frontières (§3) et casse les méga-segments (§2) sans coût supplémentaire.

2. **Réintroduire la diarisation acoustique** (pyannote, déjà présent en mode live) et **croiser** diarisation × log de tours : le log donne *qui a la parole officiellement*, la diarisation *qui parle vraiment*. Désambiguïse le brouhaha (§1). À défaut de pyannote, au minimum un VAD multi-locuteur léger.

3. **Anonymiser le corps du texte.** Étendre `anonymize_log.py` (ou une passe post-Whisper) pour remplacer dans le texte toute occurrence des prénoms réels par leur label, à partir de la table de correspondance déjà construite. **Interdire à Gemini de produire un prénom** : forcer le label ∈ liste fournie, sinon `[?]` (§4, §9).

4. **Plafonner la fusion** dans `merge_same_speaker` : ne pas fusionner au-delà de ~120 s, ~1500 caractères, ou par-dessus un silence > 2 s entre segments. Rend le livrable lisible (§2).

### 🟠 Impact moyen

5. **Seuil de confiance d'attribution** : si `best_overlap < 50 %` de la durée du segment → `[?]`. Évite les attributions arbitraires aux frontières (§6).

6. **Gérer / signaler la non-couverture du log** : reporter en fin de run le % d'audio sans tour correspondant, et traiter explicitement l'ouverture (intégrer le modérateur comme locuteur connu, ex. `Modérateur`) et la queue post-log (§5). Afficher le score de recouvrement de `detect_audio_start` en %.

7. **Tester `condition_on_previous_text=False`** et/ou `no_repeat`, exploiter `compression_ratio_threshold` / `log_prob_threshold` / `no_speech_threshold` de faster-whisper pour réduire boucles et hallucinations (§8).

### 🟡 Impact ciblé / finition

8. **Marquage « hors-débat »** : laisser Gemini (ou une heuristique) taguer les passages logistiques/chahut (`[HORS-DÉBAT]`) au lieu de les attribuer, pour un transcript exploitable analytiquement (§7).

9. **Cohérence des labels** : un seul registre. Soit tout anonymisé (`Interlocuteur N` / `Modérateur`), soit tout nominatif — jamais un mélange `Claude` + `Interlocuteur 3` (§4).

10. **Renforcer `deduplicate`** sur les répétitions courtes en début/fin de segment (chevauchement de frontière), là où subsistent « c'est ça, c'est ça ».

11. **Score de confiance par segment dans le JSON** (`confidence`, `overlap_ratio`) pour permettre une relecture humaine ciblée des segments douteux.

---

## ✅ Statut d'implémentation (2026-06-22)

Tous les axes ont été implémentés et couverts par tests (70 tests offline verts) :

| Axe | Statut | Où |
|---|---|---|
| §1 Attribution au mot | ✅ | `assign_speakers_words` + `_speaker_at` |
| §2 Diarisation croisée | ✅ (opt. `--diarize`) | `split_turns_by_diarization`, `run_diarization` |
| §3 Frontières au mot | ✅ | idem §1 (exploite `word_timestamps`) |
| §4 Anonymisation du texte | ✅ | `name_map.json` (`anonymize_log`) + `redact_names` + garde-fou Gemini |
| §5 Seuil de confiance | ✅ | `MIN_OVERLAP_RATIO` dans `assign_speakers` |
| §6 Couverture / non-couverture | ✅ | `coverage_report` + avertissement |
| §7 Anti-hallucination Whisper | ✅ | `condition_on_previous_text=False` + seuils |
| §8 Marquage hors-débat | ✅ | prompt Gemini `[HORS-DÉBAT]` |
| §9 Whitelist labels Gemini | ✅ | `_validate(allowed_labels)` |
| §4/§9 Cohérence labels (Modérateur) | ✅ | prompt + whitelist |
| Plafond de fusion | ✅ | `merge_same_speaker(max_duration/chars/gap)` |

Note : pour bénéficier de l'attribution au mot, il faut **relancer** `transcribe_offline` (les `.json` antérieurs ne contiennent pas les timestamps par mot). Régénéré pour 71B505 sous `71B505_2026-06-22*`.

## Quick wins (faible effort, gain immédiat)
- Plafond de fusion (§4) — quelques lignes dans `merge_same_speaker`.
- Seuil d'overlap → `[?]` (§5) — une condition dans `assign_speakers`.
- Liste blanche de labels pour Gemini (§9) — contrainte dans `_validate` / prompt.
- Substitution des prénoms dans le texte (§4) — réutilise la table d'`anonymize_log`.
- Attribution au mot (§1) — refonte de `assign_speakers`, le plus rentable car les données (`word_timestamps`) existent déjà.
