# Empreinte carbone de l'usage d'IA générative — méthode et formule d'estimation

## Objet du document

Ce document synthétise une investigation sur l'empreinte carbone de l'usage individuel d'un LLM. Il aboutit sur une **formule d'estimation calibrée**, conçue d'abord pour exploiter les **compteurs de tokens de Claude Code / de l'API Anthropic**, avec les adaptations pour les autres cas (app de chat, inférence locale, contexte long). Chaque composant est justifié et sourcé. Il est destiné à être réutilisé comme contexte dans une autre conversation.

**Cadre retenu : émissions marginales d'inférence directe** (« un prompt de plus »), avec une option pour basculer en cadre attributionnel (part de l'impact total, entraînement inclus).

---

## 1. Ordre de grandeur de l'énergie par requête

Pour une requête texte usuelle *actuelle*, le centre de gravité est **~0,3 Wh d'inférence**, avec une enveloppe d'incertitude d'environ ×10.

| Source | Énergie / requête | CO₂ / requête | Périmètre |
|---|---|---|---|
| Google (Gemini, août 2025) | 0,24 Wh | 0,03 g CO₂e | inférence seule, médiane, intensité *market-based* |
| EpochAI (ChatGPT, fév. 2025) | ~0,3 Wh | — | inférence, bottom-up |
| Sam Altman (ChatGPT) | 0,34 Wh | — | inférence, sans méthodo |
| MIT Tech Review (Llama, moyen) | ~0,93 Wh | — | inférence |
| Mistral (ACV) | — | ~1 g CO₂e / page | entraînement + inférence |
| de Vries (2023) | ~3 Wh | — | inférence, hypothèses anciennes |
| Luccioni / BLOOM (2022) | ~4 Wh | — | déploiement recherche, **sans batching** |

**Point clé : le spread (0,3 → 4 Wh) est en grande partie *temporel*, pas seulement méthodologique.** Le bas (Google, EpochAI) est récent, batché, matériel efficient ; le haut est ancien ou non batché. Google revendique un facteur ~33 d'efficience énergétique gagné en 12 mois. Pour aujourd'hui, ~0,3 Wh est le repère ; ~3-4 Wh correspond à « il y a deux ans / non optimisé ».

*Sources : Hannah Ritchie (Our World in Data), « The AI footprint », août 2025 ; EpochAI, « How much energy does ChatGPT use? », fév. 2025.*

---

## 2. Fiabilité des sources : où se loge le biais

Les estimations basses viennent surtout d'acteurs proches de l'industrie ; les hautes, de chercheurs indépendants/critiques (de Vries, Luccioni). Ce n'est pas une raison de rejeter les basses, mais de savoir où regarder.

- **Google a un conflit d'intérêt démontré par ses propres chiffres** : émissions totales +48 % depuis 2019, +13 % sur un an en 2023, Scope 2 *market-based* +37 %, hausse attribuée à l'énergie de ses datacenters. L'entreprise qui publie « 0,03 g/requête » est celle dont l'empreinte agrégée explose. Ses choix méthodologiques tirent tous le chiffre vers le bas : inférence seule, intensité *market-based* (PPA) au lieu du réseau réel, **médiane** (distribution très asymétrique) plutôt que moyenne, exclusion du réseau externe et des appareils.
- **EpochAI** n'est pas non plus désintéressé (financement écosystème, orientation techno-optimiste, controverse de transparence sur le financement OpenAI de FrontierMath). Mais la *structure* de son biais diffère : estimation **bottom-up reproductible** (n'importe qui peut refaire le calcul FLOP), fourchette publiée, hypothèses revendiquées « pessimistes », recoupement via les prix d'API de modèles ouverts.
- **Ce qui rend le chiffre par requête robuste** : la convergence d'acteurs aux intérêts opposés (~0,3 Wh) et la reproductibilité du calcul, pas la confiance dans un acteur.
- **Le vrai biais est dans le cadrage, pas dans le nombre** : « par requête, c'est une goutte d'eau » peut être vrai *en même temps* que l'agrégat est préoccupant (Google +48 %, ~10 % de l'électricité US d'ici 2030). L'industrie a intérêt à fixer l'attention sur le marginal.
- **Indice de sous-estimation** : Ritchie note que les approches *top-down* sortent souvent plus hautes que les *bottom-up*, suggérant que ces dernières (favorisées par l'industrie) oublient des postes.

*Sources : Ritchie (OWID, 2025) ; rapport environnemental Google 2024 ; EpochAI (2025).*

---

## 3. Périmètre : ce que la formule mesure (et ce qu'elle exclut)

Les ~0,3 Wh couvrent **l'électricité d'inférence directe** uniquement. Sont exclus :

- **L'entraînement** — mais attention, il **ne disparaît pas en ordre de grandeur**. EpochAI : entraînement d'un modèle type GPT-4o ≈ 22 MW × 3 mois ≈ 4,9×10⁷ kWh ; amorti sur ~1 milliard de messages/jour × ~300 jours (3×10¹¹ requêtes) ≈ **~0,16 Wh/requête**, soit ~la moitié de l'inférence. EpochAI conclut que les coûts amont sont « comparables ou inférieurs » au coût direct.
- **L'empreinte embarquée** (fabrication GPU/datacenters) : selon EpochAI, probablement inférieure encore au coût de fonctionnement direct.
- Le réseau externe et l'appareil de l'utilisateur.

**Conséquence — deux cadres légitimes pour la même activité :**
- **Marginal** (« un prompt de plus ») : inférence seule. L'entraînement est un coût fixe déjà payé → exclusion correcte.
- **Attributionnel** (« ma juste part de l'impact total ») : réintégrer l'amont via un multiplicateur **M ≈ 1,8** (entraînement amorti + embarqué ; incertitude réelle 1,3-2,5).

*Source : EpochAI (2025).*

---

## 4. Où l'émission a lieu : le réseau du datacenter (pas le tien)

**L'énergie est consommée là où tourne le modèle, pas là où l'utilisateur tape.** C'est une erreur fréquente de prendre l'intensité carbone du pays de l'utilisateur. L'estimation par tokens mesure l'énergie *datacenter* ; le réseau de l'utilisateur n'intervient que pour son propre appareil (négligeable) ou pour de l'inférence locale.

Infrastructure d'Anthropic (Claude) : multi-cloud — TPU Google, Trainium AWS, GPU Nvidia, chaque plateforme pour des charges spécialisées. AWS est le partenaire d'entraînement principal (Project Rainier). **La grande majorité de la nouvelle capacité de calcul est implantée aux États-Unis** ; l'inférence s'étend à l'Europe et l'Asie pour la demande internationale. Gemini tourne sur les datacenters Google (forte part d'énergie sans carbone *revendiquée*, mais en *market-based*).

Intensités carbone *location-based* à utiliser pour **I** (gCO₂/kWh) :

| Réseau | I (gCO₂/kWh) | Usage |
|---|---|---|
| France | ~55 | seulement si inférence **locale** sur machine FR |
| Moyenne UE | ~250 | si une part de l'inférence est servie en Europe |
| **Moyenne US** | **~390** | **cas par défaut pour Claude (datacenters majoritairement US)** |
| US charbon (MISO/Indiana) | ~500 | régions de DC IA fossiles |
| Google PPA (*market-based*) | ~125 | chiffre optimiste affiché, non physique |

**Nuance qui augmente le chiffre réel** : les émissions *marginales* du réseau (nouvelle charge couverte par des centrales fossiles d'appoint) peuvent dépasser la moyenne. Le chiffre *location-based* est déjà plus honnête que le *market-based* des fournisseurs.

*Sources : annonces d'infrastructure Anthropic (2025-2026) ; Ritchie (2025) sur le market-based/PPA.*

---

## 5. Cas de l'inférence locale (Llama, etc.)

À **taille de modèle égale**, le local consomme en général **plus** d'énergie que le cloud, à cause de l'absence de **batching** (le datacenter sert plein de requêtes en parallèle et amortit le rechargement des poids ; en local on est un « batch de un ») — pénalité ~10× (cf. Luccioni ~4 Wh sans batching vs ~0,3 Wh batché) — plus un matériel grand public moins efficient. L'avantage du réseau français (~7-9×) ne suffit généralement pas à compenser. Le seul vrai gain du local vient de faire tourner un **modèle plus petit** (moins de paramètres actifs P). Pour estimer le local, il faut donc majorer k (~×10 pour l'absence de batching) et utiliser le réseau local.

---

## 6. Comptabilité des tokens (Claude Code / API)

Claude Code expose quatre compteurs (objet `usage` de l'API) :

- **`input_tokens`** — tout ce qui est envoyé et traité à neuf : message, système, historique, définitions d'outils, fichiers lus.
- **`output_tokens`** — tout ce que le modèle génère. **Inclut les tokens de raisonnement** : la réflexion étendue est facturée comme tokens de sortie, une seule fois, au tour où elle est produite ; `output_tokens` est le total inclusif faisant autorité. (Les blocs de réflexion des tours précédents sont retirés du contexte, donc non recomptés en entrée ensuite.)
- **`cache_creation_input_tokens`** — tokens traités *et écrits* dans le cache la 1ʳᵉ fois (ou quand le préfixe change). C'est un **prefill complet** (vrai calcul).
- **`cache_read_input_tokens`** — tokens déjà en cache, **réutilisés** sans recalcul.

**Prompt caching, en bref** : avant de générer, le modèle fait le *prefill* — il lit l'input et calcule les tenseurs d'attention (KV) de chaque token. En conversation, le même préfixe (système + CLAUDE.md + historique) reviendrait à chaque tour ; le caching stocke le KV pour le réutiliser. D'où des `cache_read` énormes en codage (un CLAUDE.md de 15k tokens = 15k cache reads **par message**).

*Sources : documentation Anthropic (API token counting, extended thinking, prompt caching).*

---

## 7. Pondération énergétique des tokens

Tous les tokens ne coûtent pas la même énergie. On les exprime en **équivalent-token-de-sortie** (sortie = 1,0) :

| Type | Poids | Justification |
|---|---|---|
| Sortie (raisonnement inclus) | **1,00** | *Decode* : un token à la fois, rechargement des poids à chaque fois, limité par la bande passante mémoire, GPU sous-utilisé → le plus cher. Référence. |
| Entrée fraîche + cache creation | **0,30** | *Prefill* : tokens traités en parallèle → GPU bien utilisé → meilleur rendement. Calé sur EpochAI : 10k tokens d'entrée ajoutent +2,1 Wh vs 0,3 Wh pour 500 tokens de sortie ⇒ token d'entrée ≈ 0,35× token de sortie. La cache creation est un prefill complet → même poids. |
| Cache read | **0,05** | KV déjà calculé ; relecture = déplacement mémoire, pas de recalcul. Poids le **plus mal étayé** : ancré sur le prix (cache read ≈ 0,02× sortie en \$), remonté un peu par prudence ⇒ fourchette 0,02-0,05. Approximation : physiquement, le coût d'un long contexte se paie surtout au decode (attention sur tout le contexte). |

*Source du calibrage : EpochAI (2025), chiffres longue-entrée.*

---

## 8. La formule

**Énergie d'inférence directe (Wh), pour un tour ou un cumul :**

```
E(Wh) = k · P · [ (T_out + T_raison) + w_in·(T_in + T_cc) + w_cache·T_cr ]
```

| Symbole | Valeur / définition | Justification & source |
|---|---|---|
| `k` | **6×10⁻⁶** Wh par (Md de paramètre actif × token-équivalent-sortie) | Dérivé de la chaîne FLOP d'EpochAI (voir ci-dessous). |
| `P` | paramètres **actifs** du modèle, en milliards | Détermine le coût par token (~2 FLOP/paramètre/token). **Inconnu pour les modèles propriétaires** → principale incertitude (cf. §11). |
| `T_out` | tokens de sortie | `output_tokens` (inclut déjà le raisonnement en Claude Code). |
| `T_raison` | tokens de raisonnement | = **0** si déjà dans `T_out` (cas Claude Code). À renseigner seulement si comptés à part. |
| `T_in` | entrée fraîche | `input_tokens`. |
| `T_cc` | cache creation | `cache_creation_input_tokens`. |
| `T_cr` | cache read | `cache_read_input_tokens`. |
| `w_in` | **0,30** | Prefill ~0,35× decode (EpochAI). |
| `w_cache` | **0,05** | KV réutilisé ; ancré sur le prix (§7). |

**Origine de k (chaîne FLOP, EpochAI) :** générer un token ≈ 2P FLOP. Pour 500 tokens de sortie à P = 100 Md : 500 × 2 × 100×10⁹ = 1×10¹⁴ FLOP. Sur H100 (9,89×10¹⁴ FLOP/s) à ~10 % d'utilisation, ~1 s de GPU ; à ~1500 W (overhead inclus) et ~70 % de puissance moyenne → **0,3 Wh**. Donc 0,3 Wh / 500 tokens = 6×10⁻⁴ Wh par token-équivalent à P = 100, soit par Md de paramètre : **6×10⁻⁶**.

**Carbone (gCO₂) :**

```
C(gCO₂) = (E / 1000) · I  [ · M  si cadre attributionnel ]
```

| Symbole | Valeur / définition | Justification & source |
|---|---|---|
| `I` | intensité carbone du **réseau du datacenter** (gCO₂/kWh) | ≈ **390 (US)** par défaut pour Claude ; ~250 si part Europe ; **jamais** le réseau de l'utilisateur sauf inférence locale (§4). |
| `M` | **≈ 1,8** (1,3-2,5) | Entraînement amorti (~0,16 Wh/requête, ~½ de l'inférence) + embarqué. À n'appliquer qu'en cadre attributionnel (§3). |

---

## 9. Application selon le cas

- **Claude Code / API (cas nominal de cette formule)** : les quatre compteurs sont disponibles ; `T_raison = 0` (déjà dans `output_tokens`). Application directe. `I ≈ 390`.
- **App de chat (claude.ai)** : les compteurs ne sont **pas** visibles. Estimer `T_out` depuis le nombre de mots (1 token ≈ 0,75 mot), `T_in` depuis l'historique, ignorer/approcher le cache. Le **raisonnement est caché** → à estimer (peut multiplier l'énergie par 5-20× en effort max).
- **Inférence locale** : utiliser le réseau **local** (FR ~55), mais **majorer k** (~×10 pour l'absence de batching) et baisser P (petit modèle). Ajouter l'embarqué du matériel si dédié.
- **Requête à très long contexte** : le modèle linéaire **sous-estime**. Le prefill de l'attention croît avec le **carré** de la longueur d'entrée (EpochAI : 10k tokens → 2,4 Wh ; 100k → 40 Wh). Au-delà de ~10k tokens d'entrée, ajouter une correction quadratique.

---

## 10. Exemple chiffré (usage Claude Code réel, Sonnet, effort moyen)

Cumul : `input` 311 225 ; `output` 8 472 640 ; `cache_read` 910 063 831 ; `cache_creation` 46 138 441 (~965 M tokens, dont 94 % de cache reads).

Crochet (à P = 100, w_cache = 0,05) :
- sortie : 8 472 640 → 12 %
- entrée + cache creation : 0,30 × 46 449 666 = 13 934 900 → 21 %
- cache read : 0,05 × 910 063 831 = 45 503 192 → **67 %** (premier poste malgré le poids 0,05, à cause du volume)
- total ≈ 67,9 M équivalent-sortie

E = 6×10⁻⁶ × 100 × 67,9×10⁶ ≈ **40,7 kWh**.
C = 40,7 × 390 ≈ **~16 kg CO₂** (inférence directe, réseau US) ; **~29 kg** avec amont (×1,8).

Repère : ~3 jours d'électricité d'un foyer français (~13 kWh/jour). Sur réseau français (cas faux ici, donné pour mémoire) : ~2,2 kg — d'où l'importance d'utiliser le réseau du datacenter.

---

## 11. Limites et incertitudes (par ordre d'impact)

1. **P (taille active du modèle)** : inconnu pour les modèles propriétaires (Sonnet, Opus). Pris 100-200 Md par analogie GPT-4o (EpochAI). **Incertitude dominante, facile ×2-3.**
2. **w_cache** : le moins bien fondé ; dans un usage Claude Code dominé par les cache reads, c'est l'hypothèse qui pèse le plus sur le résultat.
3. **I** : routage réel des datacenters non public (US vs EU) ; émissions marginales du réseau possiblement > moyenne.
4. **Modèle linéaire** : valable pour des contextes courts/moyens ; sous-estime les très longs (prefill quadratique).
5. **Cadre** : marginal (sans M) vs attributionnel (avec M) — toujours préciser lequel.

L'estimation honnête est une **fourchette**, pas un chiffre unique (ici ~1,3 à 4,5 kg sur réseau FR, ~9,5 à 32 kg sur réseau US selon P et w_cache).

---

## Sources principales

- **Hannah Ritchie (Our World in Data)**, « The AI footprint », Substack, août 2025 — agrégation des estimations, mises en garde (PPA, médiane, top-down vs bottom-up).
- **EpochAI**, « How much energy does ChatGPT use? » (Gradient Updates), fév. 2025 — calcul bottom-up, chaîne FLOP, longue-entrée, raisonnement, entraînement, comparaison de Vries/Luccioni.
- **Documentation Anthropic** — comptage de tokens, réflexion étendue facturée en sortie, prompt caching (cache creation / cache read).
- **Rapport environnemental Google 2024** — émissions totales +48 % depuis 2019, hausse liée aux datacenters.
- **Annonces d'infrastructure Anthropic (2025-2026)** — multi-cloud TPU/Trainium/Nvidia, majorité de la capacité aux États-Unis, extension de l'inférence à l'international.
