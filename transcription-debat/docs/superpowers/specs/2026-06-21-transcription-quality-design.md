# Design — Amélioration qualité transcription

**Date :** 2026-06-21  
**Contexte :** Audit du transcript Multiculturalisme 71B505 révèle 4 problèmes majeurs.

---

## Problèmes identifiés

1. **Répétitions hallucinées Whisper** — phrases identiques répétées 3-6× consécutivement (intra-segment et inter-segments). Ex : "Est-ce que c'est contraire à la laïcité ou pas ?" × 4.
2. **Attribution `[?]` massive** — ~20 % des segments sans locuteur identifié (hors log Ecclesia, crosstalk).
3. **Erreur sémantique hallucinée** — phrase copiée-collée avec sujet changé ("Au Canada, on est assimilationniste" copié depuis la phrase sur la France).
4. **Patterns bruit** — "ta ta ta ta ta", "Non. Non. Non. Non. Non." sur silences.

---

## Architecture cible

```
Whisper → assign_speakers → merge_same_speaker
                                    ↓
                            deduplicate()          ← nouveau module
                                    ↓
                            write raw .json/.txt
                                    ↓
                            correct_transcript.py
                            ├── fenêtre de contexte (±3 segments)
                            ├── prompt enrichi
                            └── validation assouplie ([?] → speaker modifiable)
```

`correct_transcript.py` standalone applique aussi `deduplicate()` en entrée.

---

## Composant 1 — `deduplicate.py`

Trois passes déterministes, dans l'ordre :

### Passe A — Déduplication intra-segment
- Découpe le texte en phrases sur `.?!`
- Supprime les phrases consécutives avec similarité ≥ 85 % (`difflib.SequenceMatcher`)
- Réassemble avec espaces

### Passe B — Nettoyage patterns bruit
- Regex : `\b(\w{1,5})\s+(\1\s+){2,}` → supprime tokens courts répétés ≥ 3 fois
- Trim des espaces résiduels

### Passe C — Déduplication inter-segments
- Compare chaque segment avec le précédent (même locuteur ou non)
- Similarité ≥ 90 % → fusion (texte le plus long conservé, `end` étendu)
- Les segments `refused: true` sont passés sans modification dans les 3 passes

### Interface publique

```python
def deduplicate(segments: list[dict]) -> list[dict]:
    """Applique A + B + C. Retourne une nouvelle liste (non-mutant)."""
```

### Intégration

- `transcribe_offline.py` : appel après `merge_same_speaker`, avant `write_txt/write_json`
- `correct_transcript.py` (standalone) : appel au début de `correct()` avant batching

---

## Composant 2 — `correct_transcript.py` enrichi

### 2a — Fenêtre de contexte par batch

Chaque batch de 25 segments est envoyé avec un payload structuré :

```json
{
  "context_before": [...],  // ≤3 segments précédents, read-only
  "segments": [...],        // 25 segments à corriger
  "context_after": [...]    // ≤3 segments suivants, read-only
}
```

Gemini ne retourne que `segments`. Le prompt précise que `context_before`/`context_after` sont fournis pour comprendre le fil mais ne doivent pas être modifiés ni retournés.

### 2b — Prompt additionnel

Ajouté à `BASE_SYSTEM_PROMPT` :

```
Attribution [?] : si les segments de contexte permettent d'identifier le locuteur
avec confiance (référence directe, continuité de phrase, interpellation nominative),
remplace "[?]" par le label correspondant. Si incertain, laisse "[?]".

Correction sémantique : si un énoncé dans un segment contredit directement
une assertion du même segment (même phrase avec sujet substitué), corrige
la version erronée en t'appuyant sur le fil logique.

Répétitions résiduelles : si des phrases quasi-identiques subsistent après
déduplication algorithmique, n'en garde qu'une seule.
```

### 2c — Validation assouplie

`_validate()` modifiée :
- **Avant** : `corr["speaker"] != orig["speaker"]` → rejet
- **Après** : rejet uniquement si `orig["speaker"] != "[?]"` et speakers diffèrent
- Les attributions `[?]` → label sont donc acceptées

### Comptage de segments

Le nombre de segments reste contraint à l'identique (Gemini ne supprime pas de segments — c'est le rôle de `deduplicate`). Si Gemini retourne un compte différent, le batch est rejeté comme avant.

---

## Tests

Fichiers à créer dans `tests/` :

| Fichier | Cas couverts |
|---|---|
| `test_deduplicate.py` | Passe A (répétitions intra), Passe B (bruit), Passe C (inter-segments), segments refused intacts, liste vide, segment sans répétition (no-op) |

Les tests existants (`test_correct_transcript.py`, `test_transcribe_offline.py`) ne doivent pas régresser.

---

## Limites acceptées

- Les `[?]` sans contexte suffisant (crosstalk pur, locuteur absent du fil) resteront `[?]`
- La correction sémantique Gemini est limitée aux contradictions intra-segment évidentes — pas de vérification de faits externe
- `deduplicate` peut supprimer de vraies répétitions intentionnelles d'un orateur (ex : "Non ! Non !") si elles dépassent le seuil — acceptable car rare et moins grave que les hallucinations
