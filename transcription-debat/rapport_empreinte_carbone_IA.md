# Empreinte carbone IA du pipeline `transcription-debat`

Application de [`empreinte_carbone_IA_methode-2.md`](./empreinte_carbone_IA_methode-2.md) au seul usage IA mesurable dans ce dossier : les appels **Gemini** de `correct_transcript.py` et `analyze_debate.py`. Estimation bottom-up depuis le **code réel** et un **débat réellement transcrit** (`71B505`, Multiculturalisme, 2h05, 170 segments finaux) — pas de compteurs `usage_metadata` retournés par l'API (non journalisés par le pipeline), donc reconstruction des volumes de tokens à partir du texte réellement envoyé/reçu, comme le prescrit la méthode pour le cas « compteurs non visibles » (§9).

---

## 1. Ce qui est mesurable ici, et ce qui ne l'est pas

Deux usages IA distincts vivent dans ce dossier :

| Usage | Mesurable ? | Pourquoi |
|---|---|---|
| **Appels Gemini du pipeline** (`correct_transcript.py`, `analyze_debate.py`) | ✅ Oui, par reconstruction | Le code est déterministe et lisible : on sait exactement ce qui est envoyé (prompt système + payload JSON) à chaque appel. Appliqué à un transcript réel, on obtient un volume de tokens fidèle au texte, pas une hypothèse en l'air. |
| **Sessions Claude Code ayant écrit ce pipeline** (« création ») | ❌ Non, faute de données | Aucun compteur de tokens n'a été conservé pour les sessions de développement passées (pas de `/cost` sauvegardé, pas de log `usage`). La méthode interdit d'inventer un chiffre — donc ce volet est explicitement **hors de portée** de ce rapport plutôt que deviné. Voir §6. |

Ce rapport ne couvre donc que le premier usage, qui est aussi celui qui se répète à chaque débat transcrit (contrairement au développement, ponctuel).

---

## 2. Cadre et hypothèses de la formule

- **Cadre marginal** (inférence seule) comme cadre principal, avec le multiplicateur attributionnel `M ≈ 1,8` donné en complément.
- **`I` (intensité carbone)** : Gemini tourne sur l'infrastructure **Google**, pas Anthropic — la méthode ne documente pas le routage Google. Par cohérence avec sa propre prudence méthodologique (ne pas utiliser le chiffre *market-based* optimiste de Google, §2/§4), on retient le même défaut prudent que pour Claude : **`I ≈ 390` gCO₂/kWh (réseau US)**, en notant que Google revendique une part d'Europe/Asie qui ferait plutôt baisser ce chiffre (`~250` si UE). Traité comme une limite en §5.
- **`P` (paramètres actifs)** : **inconnu et non documenté** pour Gemini 2.5/3.1 Flash-Lite — un modèle explicitement optimisé pour être petit et bon marché (quota gratuit large, latence faible). La méthode calibre `k` sur une hypothèse `P ≈ 100 Md` issue d'EpochAI pour des modèles taille GPT-4o — probablement **surestimée** pour un modèle « Lite ». Traité en sensibilité (§5), pas comme un chiffre unique.
- **Pas de cache** : aucun appel du pipeline ne réutilise de préfixe via l'API (`cache_creation`/`cache_read` de la méthode ne s'appliquent qu'à Claude Code) — tout l'input est traité comme `T_in` frais (poids 0,30).
- **Chemin nominal (succès du premier coup)** : les volumes ci-dessous supposent que chaque appel réussit sans retry. En pratique, le run réel du 24/06 a essuyé plusieurs `503 UNAVAILABLE` avant de réussir (voir `run_20260624_184013.log`) — le coût réel est donc **une borne basse**, pas un maximum (cf. §5).

---

## 3. Volumes réels par étape (débat 71B505, 06-24, 2h05, 170 segments)

Reconstruits en rejouant le code (`correct_transcript.py::_correct_batch`, `analyze_debate.py::build_frame_prompt/build_timeline_prompt/build_scoring_prompt/run_symmetry_audit`) sur les fichiers réels du débat, puis convertis en tokens via **1 token ≈ 0,75 mot** (méthode §9).

| Étape | Appels API | Mots entrée (T_in) | Mots sortie (T_out) | Tokens entrée | Tokens sortie |
|---|---:|---:|---:|---:|---:|
| Correction Gemini (`correct_transcript.py`, 7 lots de 25 segments + contexte ±3) | 7 | 30 199 | 21 359 | 40 265 | 28 479 |
| Passe 1 — cadre + voix (`build_frame_prompt`, transcript entier) | 1 | 20 566 | 356 | 27 421 | 475 |
| Passe 2 — events + tension (`build_timeline_prompt`, transcript entier) | 1 | 20 302 | 329 | 27 069 | 439 |
| Passe 3 — scoring par bloc (`build_scoring_prompt`, 6 lots de 25 blocs + contexte ±3, 130 blocs scorables) | 6 | 27 226 | 2 809 | 36 301 | 3 745 |
| Audit de symétrie (re-scoring d'un échantillon de 30 blocs, axes inversés) | 2 (estimé, proportionnel) | ≈ 6 284 | ≈ 958 | ≈ 8 379 | ≈ 1 277 |
| **Total (1 débat, correction + analyse complète)** | **17** | **104 577** | **25 811** | **139 436** | **34 415** |

*Sortie mesurée sur les fichiers réellement produits* (`*_corrected.json`, `viz/data.js` — 88 blocs effectivement scorés sur 130 soumis, 10 personas, 12 events). Le prompt système de `correct_transcript.py` inclut la liste des labels autorisés (dépend du nombre de locuteurs, ici 9+1).

---

## 4. Application de la formule

```
E(Wh) = k · P · [ T_out + w_in·T_in ]      k = 6×10⁻⁶, w_in = 0,30
```

Bracket (token-équivalent-sortie) = 34 415 + 0,30 × 139 436 = **76 246**

`P` étant inconnu pour un modèle « Lite », on donne la sensibilité plutôt qu'un chiffre unique :

| `P` (Md paramètres actifs) | E (Wh) — 1 débat, pipeline complet | C (gCO₂e) marginal, I=390 | C attributionnel (×1,8) |
|---:|---:|---:|---:|
| 20 (Lite, hypothèse basse) | 9,1 | 3,6 | 6,4 |
| 50 | 22,9 | 8,9 | 16,1 |
| **100 (défaut méthode si `P` inconnu)** | **45,7** | **17,8** | **32,1** |
| 200 (borne haute, si Lite ≈ modèle flagship allégé seulement) | 91,5 | 35,7 | 64,3 |

**Repère central** (P=100) : **~46 Wh**, **~18 g CO₂e** en marginal (**~32 g** en attributionnel) pour transcrire *et* analyser un débat de 2h05 — grosso modo **une charge de smartphone**, dans une fourchette réaliste de 9 à 92 Wh selon la taille réelle du modèle.

Répartition : correction (~53 % du bracket) et analyse en 3 passes + audit (~47 %) pèsent à peu près autant l'un que l'autre.

---

## 5. Incertitudes (par ordre d'impact, comme la méthode §11)

1. **`P` inconnu pour Gemini Flash-Lite** — incertitude dominante, facteur ×10 entre les bornes du tableau ci-dessus. Aucune source publique ne documente la taille active de ce modèle.
2. **Chemin nominal sans retry** — le run réel a subi des `503` avant de réussir (log `run_20260624_184013.log`, lignes 1-5) : au moins un appel de correction a été tenté 3 fois avant d'aboutir ou d'être abandonné. Le coût réel de cette exécution précise est donc **plus élevé** que le tableau ci-dessus, qui ne compte que les appels ayant réussi.
3. **`I` transposé depuis Claude/Anthropic** — la méthode documente le mix US d'Anthropic, pas le routage réel de l'API Gemini (Google, multi-région). `390` est un défaut prudent, pas une mesure.
4. **Word→token = 0,75** est une approximation générique (méthode §9, cas « compteurs non visibles »), pas le tokenizer réel de Gemini — les JSON structurés (clés, guillemets, accolades) tokenisent probablement un peu moins bien que du texte naturel, ce qui pourrait sous-estimer légèrement les tokens réels des payloads.
5. **Audit de symétrie estimé par proportion**, pas rejoué appel par appel comme les autres étapes (~5 % du total — impact marginal même si l'estimation était fausse de moitié).

L'estimation honnête est donc une fourchette **~4 à 65 g CO₂e par débat traité** (bornes basse marginale / haute attributionnelle), pas un chiffre unique.

---

## 6. Usage cumulé réel à ce jour, et ce qui reste hors de portée

**Gemini (mesurable) :** le débat `71B505` a été corrigé **4 fois** pendant le développement (06-19, 06-21, 06-22, 06-24 — itérations successives du pipeline, cf. `rapport_transcription.md`) mais analysé (`analyze_debate.py`) **une seule fois**, sur la version finale. Le débat `Retraite/0F6A9E` n'a **jamais** été corrigé ni analysé par Gemini (pas de `_corrected.json`, `GEMINI_API_KEY` probablement absent ou run interrompu ce jour-là). En prenant le run mesuré ci-dessus comme run représentatif (avec la réserve que le run du 06-19, antérieur au correctif d'attribution au mot, avait une segmentation différente donc un volume probablement différent) :

- Cumul ≈ 4 × (correction seule, ~24 Wh à P=100) + 1 × (analyse complète, ~21 Wh à P=100) ≈ **~119 Wh**, soit **~46 g CO₂e** marginal (**~83 g** attributionnel) au total, à ce jour, pour l'ensemble de l'usage Gemini de ce projet.

**Claude Code (non mesurable) :** l'écriture de `anonymize_log.py`, `transcribe_offline.py`, `correct_transcript.py`, `deduplicate.py`, `analyze_debate.py` et de leurs 131 tests a nécessité plusieurs sessions de développement assistées par IA — mais **aucun compteur de tokens n'a été conservé** pour ces sessions (pas de `/cost`, pas de log d'`usage` sauvegardé). Appliquer la formule sans données reviendrait à inventer un `T_out`/`T_in` — ce que la méthode interdit explicitement. Ce volet reste donc **non chiffré**.

**Recommandation pour rendre ce volet mesurable à l'avenir** : à la fin de chaque session Claude Code de travail sur ce dossier, noter les compteurs affichés par `/cost` (ou équivalent) dans un fichier de log dédié (ex. `transcription-debat/usage_dev.log`) — cela permettrait d'appliquer la formule §8 de la méthode directement, avec de vrais compteurs plutôt qu'une reconstruction.

---

## Sources

- [`empreinte_carbone_IA_methode-2.md`](./empreinte_carbone_IA_methode-2.md) — méthode et formule (ce document l'applique sans en modifier les paramètres calibrés : `k`, `w_in`, `w_cache`, `M`).
- Code réel : `backend/code python/correct_transcript.py`, `backend/code python/analyze_debate.py` (prompts rejoués tels quels).
- Données réelles : `backend/Débats/multiculturalisme/71B505/`, `backend/transcripts/Multiculturalisme/71B505/71B505_2026-06-24_corrected.json`, `.../viz/data.js`, `.../run_20260624_184013.log`, `.../AUDIT_71B505.md`.
