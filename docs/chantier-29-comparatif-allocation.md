# Chantier 29 — comparatif des pistes de fiabilisation de la recherche d'allocation

> Généré par `ALLOC_BENCH=1 npx vitest run bench/` — **ne pas éditer à la main**.
> Source : `bench/allocation-bench.ts`. Spec de référence : `docs/chantier-5-allocation-v2-spec.md`.

## Ce qui est comparé

| Clé | Stratégie | Contenu |
|---|---|---|
| A | actuel (taux) | Code de `main`. Règles 1 et 4 scorées en **taux d'échec** `-échecs/T`. |
| B | formule absolue seule | Seul le score change : **manque total en personnes**. Recherche inchangée. |
| C | recherche fiabilisée seule | Score historique conservé ; budget **par forme**, 6 démarrages, amorce par quotas, voisinage dirigé à camp constant, élagage par borne. |
| D | absolue + recherche fiabilisée | B + C. |

**Comment lire une cellule** : `10M 10M 6M 5-` = quatre tables de 10, 10, 6 et 5 personnes ; `M` = animée par un modérateur, `-` = sans animateur.

**Le critère de fragmentation** : à population égale, une répartition qui produit beaucoup de petites tables *dont une majorité sans animateur* est le symptôme que le chantier vise à corriger. Comparer la colonne A aux autres sur les configurations à moins de 40 % d'anciens.


## Cas de référence (à ne casser sous aucun prétexte)


### NORMATIF §4 — 60 part. / 4 modé. (attendu : 8 tables, 4 animées de 10 + 4 de 5)

*Population : 60 participants, 24 anciens, 30 actifs, 0 non-consentants, 4 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **6 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 10- 10-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 6 · 111 ms |
| B · formule absolue seule | **6 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 10- 10-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 6 · 87 ms |
| C · recherche fiabilisée seule | **8 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 5- 5- 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/8 · enregistrables 8 · 201 ms |
| D · absolue + recherche fiabilisée | **8 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 5- 5- 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/8 · enregistrables 8 · 198 ms |

### RÉGRESSION 25b — 31 part. / 3 modé. / 12 anciens (39 %) — attendu : ne pas fragmenter

*Population : 31 participants, 12 anciens, 16 actifs, 0 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **5 t.** · 10 sièges non animés<br>`10M 6M 5M 5- 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/5 · enregistrables 5 · 7 ms |
| B · formule absolue seule | **5 t.** · 10 sièges non animés<br>`10M 6M 5M 5- 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/5 · enregistrables 5 · 8 ms |
| C · recherche fiabilisée seule | **6 t.** · 15 sièges non animés<br>`6M 5M 5M 5- 5- 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 6 · 20 ms |
| D · absolue + recherche fiabilisée | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 4 · 20 ms |

### TÉMOIN 25b — 31 part. / 3 modé. / 13 anciens (42 %) — déjà correct avant le chantier

*Population : 31 participants, 13 anciens, 16 actifs, 0 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **5 t.** · 10 sièges non animés<br>`10M 6M 5M 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/5 · enregistrables 5 · 6 ms |
| B · formule absolue seule | **5 t.** · 10 sièges non animés<br>`10M 6M 5M 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/5 · enregistrables 5 · 4 ms |
| C · recherche fiabilisée seule | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 4 · 18 ms |
| D · absolue + recherche fiabilisée | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 4 · 24 ms |


## Cas limites et populations dégradées


### Salle très passive — 30 part., 20 % actifs, 3 modé.

*Population : 30 participants, 12 anciens, 6 actifs, 3 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **3 t.**<br>`20M 5M 5M` | manque anciens **0** ✅ · manque actifs 2 · règle 3 KO 0/3 · enregistrables 1 · 17 ms |
| B · formule absolue seule | **2 t.**<br>`20M 11M` | manque anciens **0** ✅ · manque actifs 1 · règle 3 KO 0/2 · enregistrables 1 · 21 ms |
| C · recherche fiabilisée seule | **4 t.** · 5 sièges non animés<br>`15M 5M 5M 5-` | manque anciens **0** ✅ · manque actifs 4 · règle 3 KO 0/4 · enregistrables 2 · 23 ms |
| D · absolue + recherche fiabilisée | **2 t.**<br>`20M 11M` | manque anciens **0** ✅ · manque actifs 1 · règle 3 KO 0/2 · enregistrables 1 · 35 ms |

### Salle quasi neuve — 40 part., 10 % anciens, 4 modé.

*Population : 40 participants, 4 anciens, 20 actifs, 4 non-consentants, 4 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **8 t.** · 20 sièges non animés<br>`5M 5M 5M 5M 5- 5- 5- 5-` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/8 · enregistrables 4 · 18 ms |
| B · formule absolue seule | **4 t.**<br>`10M 10M 10M 10M` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 1 · 15 ms |
| C · recherche fiabilisée seule | **5 t.** · 5 sièges non animés<br>`10M 10M 10M 5M 5-` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/5 · enregistrables 2 · 71 ms |
| D · absolue + recherche fiabilisée | **4 t.**<br>`10M 10M 10M 10M` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 1 · 50 ms |

### Camp ultra-dominant — 35 part., camps 80/15/5, 3 modé.

*Population : 35 participants, 14 anciens, 18 actifs, 3 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **4 t.** · 5 sièges non animés<br>`10M 10M 10M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 2/4 · enregistrables 1 · 10 ms |
| B · formule absolue seule | **4 t.** · 5 sièges non animés<br>`10M 10M 10M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 2/4 · enregistrables 1 · 8 ms |
| C · recherche fiabilisée seule | **4 t.** · 5 sièges non animés<br>`10M 10M 10M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 2/4 · enregistrables 1 · 32 ms |
| D · absolue + recherche fiabilisée | **4 t.** · 5 sièges non animés<br>`10M 10M 10M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 2/4 · enregistrables 1 · 33 ms |

### Beaucoup de non-consentants — 33 part., 60 % consentants, 3 modé.

*Population : 33 participants, 13 anciens, 17 actifs, 13 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **6 t.** · 15 sièges non animés<br>`8M 5M 5M 5- 5- 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 1 · 9 ms |
| B · formule absolue seule | **4 t.** · 5 sièges non animés<br>`10M 10M 8M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 1 · 6 ms |
| C · recherche fiabilisée seule | **6 t.** · 15 sièges non animés<br>`8M 5M 5M 5- 5- 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 1 · 25 ms |
| D · absolue + recherche fiabilisée | **4 t.** · 5 sièges non animés<br>`10M 10M 8M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 1 · 21 ms |

### Analyse des camps indisponible — 34 part., 3 modé.

*Population : 34 participants, 14 anciens, 17 actifs, 3 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **4 t.** · 5 sièges non animés<br>`10M 10M 9M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 4/4 · enregistrables 2 · 4 ms |
| B · formule absolue seule | **4 t.** · 5 sièges non animés<br>`10M 10M 9M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 4/4 · enregistrables 2 · 5 ms |
| C · recherche fiabilisée seule | **4 t.** · 5 sièges non animés<br>`10M 10M 9M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 4/4 · enregistrables 2 · 17 ms |
| D · absolue + recherche fiabilisée | **4 t.** · 5 sièges non animés<br>`10M 10M 9M 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 4/4 · enregistrables 2 · 20 ms |

### 4 enregistreurs demandés — 45 part., 3 modé.

*Population : 45 participants, 18 anciens, 23 actifs, 7 non-consentants, 3 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **6 t.** · 15 sièges non animés<br>`10M 10M 10M 5- 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 4 · 29 ms |
| B · formule absolue seule | **6 t.** · 15 sièges non animés<br>`10M 10M 10M 5- 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 4 · 34 ms |
| C · recherche fiabilisée seule | **6 t.** · 15 sièges non animés<br>`10M 10M 10M 5- 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 4 · 93 ms |
| D · absolue + recherche fiabilisée | **6 t.** · 15 sièges non animés<br>`10M 10M 10M 5- 5- 5-` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/6 · enregistrables 4 · 84 ms |

### Aucun modérateur — 38 part.

*Population : 38 participants, 13 anciens, 19 actifs, 4 non-consentants, 0 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **4 t.** · 38 sièges non animés<br>`10- 10- 9- 9-` | manque anciens **3** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 1 · 12 ms |
| B · formule absolue seule | **4 t.** · 38 sièges non animés<br>`10- 10- 9- 9-` | manque anciens **3** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 1 · 12 ms |
| C · recherche fiabilisée seule | **4 t.** · 38 sièges non animés<br>`10- 10- 9- 9-` | manque anciens **3** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 2 · 36 ms |
| D · absolue + recherche fiabilisée | **4 t.** · 38 sièges non animés<br>`10- 10- 9- 9-` | manque anciens **3** ✅ · manque actifs 0 · règle 3 KO 0/4 · enregistrables 2 · 51 ms |

### Modérateurs en surplus — 22 part., 6 modé.

*Population : 22 participants, 9 anciens, 11 actifs, 2 non-consentants, 6 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **3 t.**<br>`10M 10M 5M` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/3 · enregistrables 2 · 7 ms |
| B · formule absolue seule | **3 t.**<br>`10M 10M 5M` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/3 · enregistrables 2 · 6 ms |
| C · recherche fiabilisée seule | **3 t.**<br>`10M 10M 5M` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/3 · enregistrables 2 · 19 ms |
| D · absolue + recherche fiabilisée | **3 t.**<br>`10M 10M 5M` | manque anciens **0** ✅ · manque actifs 0 · règle 3 KO 0/3 · enregistrables 2 · 15 ms |

### Grande salle — 120 part., 6 modé., 30 % anciens

*Population : 120 participants, 36 anciens, 60 actifs, 12 non-consentants, 6 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **24 t.** · 90 sièges non animés<br>`5M 5M 5M 5M 5M 5M 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5-` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/24 · enregistrables 14 · 1220 ms |
| B · formule absolue seule | **12 t.** · 60 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10- 10- 10- 10-` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/12 · enregistrables 4 · 1457 ms |
| C · recherche fiabilisée seule | **22 t.** · 80 sièges non animés<br>`10M 10M 5M 5M 5M 5M 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5- 5-` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/22 · enregistrables 18 · 1320 ms |
| D · absolue + recherche fiabilisée | **12 t.** · 60 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10- 10- 10- 10-` | manque anciens **12** ✅ · manque actifs 0 · règle 3 KO 0/12 · enregistrables 4 · 1775 ms |

### Juste au-dessus du seuil — 11 part., 1 modé.

*Population : 11 participants, 4 anciens, 6 actifs, 1 non-consentants, 1 modérateur(s).*

| Stratégie | Répartition | Détail |
|---|---|---|
| A · actuel (taux) | **2 t.** · 5 sièges non animés<br>`6M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/2 · enregistrables 1 · 0 ms |
| B · formule absolue seule | **2 t.** · 5 sièges non animés<br>`6M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/2 · enregistrables 1 · 0 ms |
| C · recherche fiabilisée seule | **2 t.** · 5 sièges non animés<br>`6M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/2 · enregistrables 1 · 0 ms |
| D · absolue + recherche fiabilisée | **2 t.** · 5 sièges non animés<br>`6M 5-` | manque anciens **1** ✅ · manque actifs 0 · règle 3 KO 0/2 · enregistrables 1 · 1 ms |


## Configurations où les stratégies divergent le plus

*54 configurations sur 147 produisent au moins un désaccord ; voici les 25 plus marquées. Ce sont les scénarios à trancher.*

| Configuration | A · actuel (taux) | B · formule absolue seule | C · recherche fiabilisée seule | D · absolue + recherche fiabilisée |
|---|---|---|---|---|
| 90 part. · 15 % anciens · 0 modé. | **16 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-`<br>manque anciens 28 | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-`<br>manque anciens 22 | **16 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-`<br>manque anciens 28 | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-`<br>manque anciens 22 |
| 90 part. · 15 % anciens · 3 modé. | **13 t.** · 60 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 6- 6- 6- 6- 6-`<br>manque anciens 28 | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-`<br>manque anciens 22 | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-`<br>manque anciens 22 | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-`<br>manque anciens 22 |
| 60 part. · 15 % anciens · 0 modé. | **8 t.** · 60 sièges non animés<br>`8- 8- 8- 8- 7- 7- 7- 7-`<br>manque anciens 19 | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-`<br>manque anciens 15 | **11 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-`<br>manque anciens 18 | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-`<br>manque anciens 15 |
| 75 part. · 15 % anciens · 0 modé. | **13 t.** · 75 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5-`<br>manque anciens 25 | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-`<br>manque anciens 21 | **12 t.** · 75 sièges non animés<br>`7- 7- 7- 6- 6- 6- 6- 6- 6- 6- 6- 6-`<br>manque anciens 25 | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-`<br>manque anciens 21 |
| 90 part. · 39 % anciens · 6 modé. | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-`<br>manque anciens 9 | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-`<br>manque anciens 1 | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-`<br>manque anciens 3 | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-`<br>manque anciens 1 |
| 36 part. · 15 % anciens · 6 modé. | **6 t.** · 10 sièges non animés<br>`10M 8M 5M 5M 5- 5-`<br>manque anciens 10 | **5 t.** · 5 sièges non animés<br>`10M 10M 8M 5M 5-`<br>manque anciens 9 | **5 t.**<br>`10M 10M 7M 5M 5M`<br>manque anciens 9 | **4 t.**<br>`10M 10M 10M 8M`<br>manque anciens 9 |
| 50 part. · 25 % anciens · 0 modé. | **5 t.** · 50 sièges non animés<br>`10- 10- 10- 10- 10-`<br>manque anciens 7 | **5 t.** · 50 sièges non animés<br>`10- 10- 10- 10- 10-`<br>manque anciens 7 | **9 t.** · 50 sièges non animés<br>`6- 6- 6- 6- 6- 5- 5- 5- 5-`<br>manque anciens 10 | **5 t.** · 50 sièges non animés<br>`10- 10- 10- 10- 10-`<br>manque anciens 7 |
| 60 part. · 15 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 10M 10M`<br>manque anciens 15 | **6 t.**<br>`10M 10M 10M 10M 10M 10M`<br>manque anciens 15 | **8 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5M 5M 5- 5-`<br>manque anciens 16 | **6 t.**<br>`10M 10M 10M 10M 10M 10M`<br>manque anciens 15 |
| 60 part. · 32 % anciens · 1 modé. | **6 t.** · 50 sièges non animés<br>`10M 10- 10- 10- 10- 10-`<br>manque anciens 5 | **6 t.** · 50 sièges non animés<br>`10M 10- 10- 10- 10- 10-`<br>manque anciens 5 | **10 t.** · 50 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5- 5- 5-`<br>manque anciens 8 | **6 t.** · 50 sièges non animés<br>`10M 10- 10- 10- 10- 10-`<br>manque anciens 5 |
| 75 part. · 32 % anciens · 1 modé. | **8 t.** · 65 sièges non animés<br>`10M 10- 10- 9- 9- 9- 9- 9-`<br>manque anciens 8 | **8 t.** · 65 sièges non animés<br>`10M 10- 10- 9- 9- 9- 9- 9-`<br>manque anciens 8 | **13 t.** · 65 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5- 5-`<br>manque anciens 9 | **8 t.** · 65 sièges non animés<br>`10M 10- 10- 9- 9- 9- 9- 9-`<br>manque anciens 8 |
| 50 part. · 15 % anciens · 1 modé. | **8 t.** · 40 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5-`<br>manque anciens 15 | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-`<br>manque anciens 12 | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-`<br>manque anciens 12 | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-`<br>manque anciens 12 |
| 60 part. · 25 % anciens · 2 modé. | **9 t.** · 40 sièges non animés<br>`10M 10M 6- 6- 6- 6- 6- 5- 5-`<br>manque anciens 12 | **6 t.** · 40 sièges non animés<br>`10M 10M 10- 10- 10- 10-`<br>manque anciens 9 | **9 t.** · 40 sièges non animés<br>`10M 10M 6- 6- 6- 6- 6- 5- 5-`<br>manque anciens 12 | **6 t.** · 40 sièges non animés<br>`10M 10M 10- 10- 10- 10-`<br>manque anciens 9 |
| 75 part. · 15 % anciens · 6 modé. | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-`<br>manque anciens 24 | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-`<br>manque anciens 20 | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-`<br>manque anciens 20 | **9 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 5- 5- 5-`<br>manque anciens 19 |
| 90 part. · 32 % anciens · 4 modé. | **10 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 9- 9- 8- 8- 8- 8-`<br>manque anciens 12 | **9 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 10- 10- 10- 10- 10-`<br>manque anciens 7 | **9 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 10- 10- 10- 10- 10-`<br>manque anciens 9 | **9 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 10- 10- 10- 10- 10-`<br>manque anciens 7 |
| 60 part. · 15 % anciens · 3 modé. | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-`<br>manque anciens 15 | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-`<br>manque anciens 15 | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-`<br>manque anciens 18 | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-`<br>manque anciens 15 |
| 36 part. · 15 % anciens · 3 modé. | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-`<br>manque anciens 12 | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-`<br>manque anciens 10 | **5 t.** · 10 sièges non animés<br>`10M 10M 6M 5- 5-`<br>manque anciens 11 | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-`<br>manque anciens 10 |
| 50 part. · 15 % anciens · 4 modé. | **5 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 10-`<br>manque anciens 12 | **5 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 10-`<br>manque anciens 12 | **7 t.** · 15 sièges non animés<br>`10M 10M 10M 5M 5- 5- 5-`<br>manque anciens 12 | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-`<br>manque anciens 12 |
| 75 part. · 15 % anciens · 3 modé. | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-`<br>manque anciens 21 | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-`<br>manque anciens 21 | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-`<br>manque anciens 22 | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-`<br>manque anciens 21 |
| 75 part. · 39 % anciens · 3 modé. | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-`<br>manque anciens 3 | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-`<br>manque anciens 3 | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-`<br>manque anciens 4 | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-`<br>manque anciens 3 |
| 90 part. · 25 % anciens · 2 modé. | **10 t.** · 70 sièges non animés<br>`10M 10M 9- 9- 9- 9- 9- 9- 8- 8-`<br>manque anciens 17 | **9 t.** · 70 sièges non animés<br>`10M 10M 10- 10- 10- 10- 10- 10- 10-`<br>manque anciens 13 | **9 t.** · 70 sièges non animés<br>`10M 10M 10- 10- 10- 10- 10- 10- 10-`<br>manque anciens 13 | **9 t.** · 70 sièges non animés<br>`10M 10M 10- 10- 10- 10- 10- 10- 10-`<br>manque anciens 13 |
| 42 part. · 15 % anciens · 6 modé. | **5 t.**<br>`10M 10M 10M 8M 5M`<br>manque anciens 11 | **5 t.**<br>`10M 10M 10M 8M 5M`<br>manque anciens 11 | **6 t.** · 5 sièges non animés<br>`10M 10M 8M 5M 5M 5-`<br>manque anciens 12 | **5 t.**<br>`10M 10M 10M 8M 5M`<br>manque anciens 11 |
| 50 part. · 25 % anciens · 3 modé. | **7 t.** · 20 sièges non animés<br>`10M 10M 10M 5- 5- 5- 5-`<br>manque anciens 9 | **5 t.** · 20 sièges non animés<br>`10M 10M 10M 10- 10-`<br>manque anciens 7 | **7 t.** · 20 sièges non animés<br>`10M 10M 10M 5- 5- 5- 5-`<br>manque anciens 8 | **5 t.** · 20 sièges non animés<br>`10M 10M 10M 10- 10-`<br>manque anciens 7 |
| 50 part. · 25 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 5M 5M`<br>manque anciens 7 | **6 t.** · 5 sièges non animés<br>`10M 10M 10M 10M 6M 5-`<br>manque anciens 7 | **7 t.** · 5 sièges non animés<br>`10M 10M 10M 5M 5M 5M 5-`<br>manque anciens 8 | **6 t.** · 5 sièges non animés<br>`10M 10M 10M 10M 6M 5-`<br>manque anciens 7 |
| 75 part. · 25 % anciens · 2 modé. | **8 t.** · 55 sièges non animés<br>`10M 10M 10- 9- 9- 9- 9- 9-`<br>manque anciens 13 | **8 t.** · 55 sièges non animés<br>`10M 10M 10- 9- 9- 9- 9- 9-`<br>manque anciens 13 | **9 t.** · 55 sièges non animés<br>`10M 10M 8- 8- 8- 8- 8- 8- 7-`<br>manque anciens 16 | **8 t.** · 55 sièges non animés<br>`10M 10M 10- 9- 9- 9- 9- 9-`<br>manque anciens 13 |
| 13 part. · 25 % anciens · 4 modé. | **3 t.** · 5 sièges non animés<br>`5M 5M 5-`<br>manque anciens 1 | **2 t.**<br>`10M 5M`<br>manque anciens 1 | **3 t.** · 5 sièges non animés<br>`5M 5M 5-`<br>manque anciens 1 | **2 t.**<br>`10M 5M`<br>manque anciens 1 |


## Synthèse quantitative (grille complète)

| Stratégie | Tables (moy.) | **Sièges non animés** (moy.) | Plus grande table non animée (moy.) | Manque actifs (moy.) | Manque anciens (moy.) | Forme retenue exploitée à fond | Temps médian | Temps max |
|---|---|---|---|---|---|---|---|---|
| A · actuel (taux) | 5.55 | **22.64** | 5.46 | 0.00 | 4.18 | 141/147 (96 %) | 15 ms | 577 ms |
| B · formule absolue seule | 5.25 | **22.44** | 5.65 | 0.00 | 3.76 | 147/147 (100 %) | 14 ms | 602 ms |
| C · recherche fiabilisée seule | 5.73 | **22.84** | 5.41 | 0.00 | 4.09 | 138/147 (94 %) | 51 ms | 1441 ms |
| D · absolue + recherche fiabilisée | 5.30 | **22.41** | 5.48 | 0.00 | 3.75 | 147/147 (100 %) | 49 ms | 1577 ms |

**Comment lire ces colonnes — et ce qu'elles ne disent pas :**

- **Sièges non animés** est la mesure de dégradation pertinente, pas le *nombre* de tables non animées : le §4 préfère explicitement découper la capacité non animée en tables de 5 (« deux tables de 5 valent mieux qu'une de 10 sans animateur »). Compter les tables pénaliserait donc un comportement voulu.
- **Manque actifs / anciens** = nombre de personnes manquantes cumulé sur toutes les tables pour atteindre les seuils des règles 1 et 4. Directement interprétable, quelle que soit la stratégie.
- ⚠️ **« Forme retenue exploitée à fond »** n'est *pas* une mesure loyale de la qualité de recherche entre métriques différentes. Elle vérifie que le manque réalisé égale le manque minimal théorique de la forme choisie. Les stratégies en métrique **absolue** optimisent ce manque par construction, donc atteignent 100 % mécaniquement ; les stratégies en **taux** y sont indifférentes (réduire le manque total sans réduire le nombre de tables en échec ne change pas leur score), donc un écart y signifie « objectif indifférent », pas « recherche défaillante ». À ne pas lire comme un classement.

**La comparaison qui tranche vraiment est scénario par scénario**, en particulier sur les cas de référence ci-dessus — pas sur ces moyennes.


## Grille synthétique complète

| Configuration | A · actuel (taux) | B · formule absolue seule | C · recherche fiabilisée seule | D · absolue + recherche fiabilisée |
|---|---|---|---|---|
| 13 part. · 15 % anciens · 2 modé. | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` |
| 13 part. · 25 % anciens · 1 modé. | **2 t.** · 5 sièges non animés<br>`8M 5-` | **2 t.** · 5 sièges non animés<br>`8M 5-` | **2 t.** · 5 sièges non animés<br>`8M 5-` | **2 t.** · 5 sièges non animés<br>`8M 5-` |
| 13 part. · 25 % anciens · 4 modé. | **3 t.** · 5 sièges non animés<br>`5M 5M 5-` | **2 t.**<br>`10M 5M` | **3 t.** · 5 sièges non animés<br>`5M 5M 5-` | **2 t.**<br>`10M 5M` |
| 13 part. · 32 % anciens · 0 modé. | **2 t.** · 13 sièges non animés<br>`7- 6-` | **2 t.** · 13 sièges non animés<br>`7- 6-` | **2 t.** · 13 sièges non animés<br>`7- 6-` | **2 t.** · 13 sièges non animés<br>`7- 6-` |
| 13 part. · 32 % anciens · 3 modé. | **2 t.**<br>`9M 5M` | **2 t.**<br>`9M 5M` | **2 t.**<br>`9M 5M` | **2 t.**<br>`9M 5M` |
| 13 part. · 32 % anciens · 6 modé. | **2 t.**<br>`10M 7M` | **2 t.**<br>`10M 7M` | **2 t.**<br>`10M 7M` | **2 t.**<br>`10M 7M` |
| 13 part. · 39 % anciens · 2 modé. | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` |
| 13 part. · 45 % anciens · 2 modé. | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` |
| 13 part. · 60 % anciens · 2 modé. | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` | **2 t.**<br>`8M 5M` |
| 18 part. · 15 % anciens · 0 modé. | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` |
| 18 part. · 15 % anciens · 3 modé. | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` |
| 18 part. · 15 % anciens · 6 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 18 part. · 25 % anciens · 2 modé. | **2 t.**<br>`10M 8M` | **2 t.**<br>`10M 8M` | **2 t.**<br>`10M 8M` | **2 t.**<br>`10M 8M` |
| 18 part. · 32 % anciens · 1 modé. | **2 t.** · 8 sièges non animés<br>`10M 8-` | **2 t.** · 8 sièges non animés<br>`10M 8-` | **2 t.** · 8 sièges non animés<br>`10M 8-` | **2 t.** · 8 sièges non animés<br>`10M 8-` |
| 18 part. · 32 % anciens · 4 modé. | **2 t.**<br>`10M 10M` | **2 t.**<br>`10M 10M` | **2 t.**<br>`10M 10M` | **2 t.**<br>`10M 10M` |
| 18 part. · 39 % anciens · 0 modé. | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` |
| 18 part. · 39 % anciens · 3 modé. | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` |
| 18 part. · 39 % anciens · 6 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 18 part. · 45 % anciens · 0 modé. | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` |
| 18 part. · 45 % anciens · 3 modé. | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` |
| 18 part. · 45 % anciens · 6 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 18 part. · 60 % anciens · 0 modé. | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` | **3 t.** · 18 sièges non animés<br>`6- 6- 6-` |
| 18 part. · 60 % anciens · 3 modé. | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` | **2 t.**<br>`10M 9M` |
| 18 part. · 60 % anciens · 6 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 22 part. · 15 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 22 part. · 25 % anciens · 1 modé. | **3 t.** · 12 sièges non animés<br>`10M 6- 6-` | **3 t.** · 12 sièges non animés<br>`10M 6- 6-` | **3 t.** · 12 sièges non animés<br>`10M 6- 6-` | **3 t.** · 12 sièges non animés<br>`10M 6- 6-` |
| 22 part. · 25 % anciens · 4 modé. | **4 t.** · 5 sièges non animés<br>`8M 5M 5M 5-` | **3 t.**<br>`10M 8M 5M` | **4 t.** · 5 sièges non animés<br>`8M 5M 5M 5-` | **3 t.**<br>`10M 8M 5M` |
| 22 part. · 32 % anciens · 0 modé. | **3 t.** · 22 sièges non animés<br>`8- 7- 7-` | **3 t.** · 22 sièges non animés<br>`8- 7- 7-` | **3 t.** · 22 sièges non animés<br>`8- 7- 7-` | **3 t.** · 22 sièges non animés<br>`8- 7- 7-` |
| 22 part. · 32 % anciens · 3 modé. | **3 t.**<br>`10M 7M 5M` | **3 t.**<br>`10M 7M 5M` | **3 t.**<br>`10M 7M 5M` | **3 t.**<br>`10M 7M 5M` |
| 22 part. · 32 % anciens · 6 modé. | **3 t.**<br>`10M 10M 5M` | **3 t.**<br>`10M 10M 5M` | **3 t.**<br>`10M 10M 5M` | **3 t.**<br>`10M 10M 5M` |
| 22 part. · 39 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 22 part. · 45 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 22 part. · 60 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` | **3 t.** · 5 sièges non animés<br>`10M 7M 5-` |
| 25 part. · 15 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` |
| 25 part. · 25 % anciens · 1 modé. | **3 t.** · 15 sièges non animés<br>`10M 8- 7-` | **3 t.** · 15 sièges non animés<br>`10M 8- 7-` | **3 t.** · 15 sièges non animés<br>`10M 8- 7-` | **3 t.** · 15 sièges non animés<br>`10M 8- 7-` |
| 25 part. · 25 % anciens · 4 modé. | **3 t.**<br>`10M 10M 6M` | **3 t.**<br>`10M 10M 6M` | **3 t.**<br>`10M 10M 6M` | **3 t.**<br>`10M 10M 6M` |
| 25 part. · 32 % anciens · 0 modé. | **3 t.** · 25 sièges non animés<br>`9- 8- 8-` | **3 t.** · 25 sièges non animés<br>`9- 8- 8-` | **3 t.** · 25 sièges non animés<br>`9- 8- 8-` | **3 t.** · 25 sièges non animés<br>`9- 8- 8-` |
| 25 part. · 32 % anciens · 3 modé. | **3 t.**<br>`10M 10M 5M` | **3 t.**<br>`10M 10M 5M` | **3 t.**<br>`10M 10M 5M` | **3 t.**<br>`10M 10M 5M` |
| 25 part. · 32 % anciens · 6 modé. | **4 t.** · 5 sièges non animés<br>`10M 8M 5M 5-` | **3 t.**<br>`10M 10M 8M` | **4 t.** · 5 sièges non animés<br>`10M 8M 5M 5-` | **3 t.**<br>`10M 10M 8M` |
| 25 part. · 39 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` |
| 25 part. · 45 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` |
| 25 part. · 60 % anciens · 2 modé. | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` | **3 t.** · 5 sièges non animés<br>`10M 10M 5-` |
| 28 part. · 15 % anciens · 2 modé. | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` |
| 28 part. · 25 % anciens · 1 modé. | **4 t.** · 18 sièges non animés<br>`10M 6- 6- 6-` | **4 t.** · 18 sièges non animés<br>`10M 6- 6- 6-` | **4 t.** · 18 sièges non animés<br>`10M 6- 6- 6-` | **4 t.** · 18 sièges non animés<br>`10M 6- 6- 6-` |
| 28 part. · 25 % anciens · 4 modé. | **3 t.**<br>`10M 10M 9M` | **3 t.**<br>`10M 10M 9M` | **3 t.**<br>`10M 10M 9M` | **3 t.**<br>`10M 10M 9M` |
| 28 part. · 32 % anciens · 0 modé. | **3 t.** · 28 sièges non animés<br>`10- 9- 9-` | **3 t.** · 28 sièges non animés<br>`10- 9- 9-` | **3 t.** · 28 sièges non animés<br>`10- 9- 9-` | **3 t.** · 28 sièges non animés<br>`10- 9- 9-` |
| 28 part. · 32 % anciens · 3 modé. | **3 t.**<br>`10M 10M 8M` | **3 t.**<br>`10M 10M 8M` | **3 t.**<br>`10M 10M 8M` | **3 t.**<br>`10M 10M 8M` |
| 28 part. · 32 % anciens · 6 modé. | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` |
| 28 part. · 39 % anciens · 2 modé. | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` |
| 28 part. · 45 % anciens · 2 modé. | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` |
| 28 part. · 60 % anciens · 2 modé. | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` | **3 t.** · 8 sièges non animés<br>`10M 10M 8-` |
| 31 part. · 15 % anciens · 2 modé. | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` |
| 31 part. · 25 % anciens · 1 modé. | **4 t.** · 21 sièges non animés<br>`10M 7- 7- 7-` | **4 t.** · 21 sièges non animés<br>`10M 7- 7- 7-` | **4 t.** · 21 sièges non animés<br>`10M 7- 7- 7-` | **4 t.** · 21 sièges non animés<br>`10M 7- 7- 7-` |
| 31 part. · 25 % anciens · 4 modé. | **4 t.**<br>`10M 10M 6M 5M` | **4 t.**<br>`10M 10M 6M 5M` | **4 t.**<br>`10M 10M 6M 5M` | **4 t.**<br>`10M 10M 6M 5M` |
| 31 part. · 32 % anciens · 0 modé. | **5 t.** · 31 sièges non animés<br>`7- 6- 6- 6- 6-` | **5 t.** · 31 sièges non animés<br>`7- 6- 6- 6- 6-` | **5 t.** · 31 sièges non animés<br>`7- 6- 6- 6- 6-` | **5 t.** · 31 sièges non animés<br>`7- 6- 6- 6- 6-` |
| 31 part. · 32 % anciens · 3 modé. | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` | **4 t.** · 5 sièges non animés<br>`10M 10M 6M 5-` |
| 31 part. · 32 % anciens · 6 modé. | **4 t.**<br>`10M 10M 8M 5M` | **4 t.**<br>`10M 10M 8M 5M` | **5 t.** · 5 sièges non animés<br>`10M 8M 5M 5M 5-` | **4 t.**<br>`10M 10M 8M 5M` |
| 31 part. · 39 % anciens · 2 modé. | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` |
| 31 part. · 45 % anciens · 2 modé. | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` |
| 31 part. · 60 % anciens · 2 modé. | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` | **4 t.** · 11 sièges non animés<br>`10M 10M 6- 5-` |
| 36 part. · 15 % anciens · 0 modé. | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` |
| 36 part. · 15 % anciens · 3 modé. | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **5 t.** · 10 sièges non animés<br>`10M 10M 6M 5- 5-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` |
| 36 part. · 15 % anciens · 6 modé. | **6 t.** · 10 sièges non animés<br>`10M 8M 5M 5M 5- 5-` | **5 t.** · 5 sièges non animés<br>`10M 10M 8M 5M 5-` | **5 t.**<br>`10M 10M 7M 5M 5M` | **4 t.**<br>`10M 10M 10M 8M` |
| 36 part. · 25 % anciens · 2 modé. | **4 t.** · 16 sièges non animés<br>`10M 10M 8- 8-` | **5 t.** · 16 sièges non animés<br>`10M 10M 6- 5- 5-` | **5 t.** · 16 sièges non animés<br>`10M 10M 6- 5- 5-` | **5 t.** · 16 sièges non animés<br>`10M 10M 6- 5- 5-` |
| 36 part. · 32 % anciens · 1 modé. | **4 t.** · 26 sièges non animés<br>`10M 9- 9- 8-` | **5 t.** · 26 sièges non animés<br>`10M 7- 7- 6- 6-` | **5 t.** · 26 sièges non animés<br>`10M 7- 7- 6- 6-` | **5 t.** · 26 sièges non animés<br>`10M 7- 7- 6- 6-` |
| 36 part. · 32 % anciens · 4 modé. | **5 t.** · 5 sièges non animés<br>`10M 10M 6M 5M 5-` | **4 t.**<br>`10M 10M 10M 6M` | **5 t.** · 5 sièges non animés<br>`10M 10M 6M 5M 5-` | **4 t.**<br>`10M 10M 10M 6M` |
| 36 part. · 39 % anciens · 0 modé. | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` |
| 36 part. · 39 % anciens · 3 modé. | **5 t.** · 10 sièges non animés<br>`10M 10M 6M 5- 5-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **5 t.** · 10 sièges non animés<br>`10M 10M 6M 5- 5-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` |
| 36 part. · 39 % anciens · 6 modé. | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` |
| 36 part. · 45 % anciens · 0 modé. | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` |
| 36 part. · 45 % anciens · 3 modé. | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` |
| 36 part. · 45 % anciens · 6 modé. | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` |
| 36 part. · 60 % anciens · 0 modé. | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` | **6 t.** · 36 sièges non animés<br>`6- 6- 6- 6- 6- 6-` |
| 36 part. · 60 % anciens · 3 modé. | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **4 t.** · 6 sièges non animés<br>`10M 10M 10M 6-` | **5 t.** · 10 sièges non animés<br>`10M 10M 6M 5- 5-` | **5 t.** · 10 sièges non animés<br>`10M 10M 6M 5- 5-` |
| 36 part. · 60 % anciens · 6 modé. | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` | **4 t.**<br>`10M 10M 10M 8M` |
| 42 part. · 15 % anciens · 0 modé. | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` |
| 42 part. · 15 % anciens · 3 modé. | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` |
| 42 part. · 15 % anciens · 6 modé. | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` | **6 t.** · 5 sièges non animés<br>`10M 10M 8M 5M 5M 5-` | **5 t.**<br>`10M 10M 10M 8M 5M` |
| 42 part. · 25 % anciens · 2 modé. | **6 t.** · 22 sièges non animés<br>`10M 10M 6- 6- 5- 5-` | **6 t.** · 22 sièges non animés<br>`10M 10M 6- 6- 5- 5-` | **6 t.** · 22 sièges non animés<br>`10M 10M 6- 6- 5- 5-` | **6 t.** · 22 sièges non animés<br>`10M 10M 6- 6- 5- 5-` |
| 42 part. · 32 % anciens · 1 modé. | **5 t.** · 32 sièges non animés<br>`10M 8- 8- 8- 8-` | **5 t.** · 32 sièges non animés<br>`10M 8- 8- 8- 8-` | **6 t.** · 32 sièges non animés<br>`10M 7- 7- 6- 6- 6-` | **6 t.** · 32 sièges non animés<br>`10M 7- 7- 6- 6- 6-` |
| 42 part. · 32 % anciens · 4 modé. | **5 t.** · 5 sièges non animés<br>`10M 10M 10M 7M 5-` | **5 t.** · 5 sièges non animés<br>`10M 10M 10M 7M 5-` | **5 t.** · 5 sièges non animés<br>`10M 10M 10M 7M 5-` | **5 t.** · 5 sièges non animés<br>`10M 10M 10M 7M 5-` |
| 42 part. · 39 % anciens · 0 modé. | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` |
| 42 part. · 39 % anciens · 3 modé. | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` |
| 42 part. · 39 % anciens · 6 modé. | **6 t.** · 5 sièges non animés<br>`10M 10M 8M 5M 5M 5-` | **5 t.**<br>`10M 10M 10M 8M 5M` | **6 t.** · 5 sièges non animés<br>`10M 10M 8M 5M 5M 5-` | **5 t.**<br>`10M 10M 10M 8M 5M` |
| 42 part. · 45 % anciens · 0 modé. | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **5 t.** · 42 sièges non animés<br>`9- 9- 8- 8- 8-` |
| 42 part. · 45 % anciens · 3 modé. | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` |
| 42 part. · 45 % anciens · 6 modé. | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` |
| 42 part. · 60 % anciens · 0 modé. | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` | **7 t.** · 42 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6-` |
| 42 part. · 60 % anciens · 3 modé. | **6 t.** · 15 sièges non animés<br>`10M 10M 7M 5- 5- 5-` | **6 t.** · 15 sièges non animés<br>`10M 10M 7M 5- 5- 5-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` | **5 t.** · 12 sièges non animés<br>`10M 10M 10M 6- 6-` |
| 42 part. · 60 % anciens · 6 modé. | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` | **5 t.**<br>`10M 10M 10M 8M 5M` |
| 50 part. · 15 % anciens · 1 modé. | **8 t.** · 40 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5-` | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` |
| 50 part. · 15 % anciens · 4 modé. | **5 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 10-` | **5 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 10-` | **7 t.** · 15 sièges non animés<br>`10M 10M 10M 5M 5- 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` |
| 50 part. · 25 % anciens · 0 modé. | **5 t.** · 50 sièges non animés<br>`10- 10- 10- 10- 10-` | **5 t.** · 50 sièges non animés<br>`10- 10- 10- 10- 10-` | **9 t.** · 50 sièges non animés<br>`6- 6- 6- 6- 6- 5- 5- 5- 5-` | **5 t.** · 50 sièges non animés<br>`10- 10- 10- 10- 10-` |
| 50 part. · 25 % anciens · 3 modé. | **7 t.** · 20 sièges non animés<br>`10M 10M 10M 5- 5- 5- 5-` | **5 t.** · 20 sièges non animés<br>`10M 10M 10M 10- 10-` | **7 t.** · 20 sièges non animés<br>`10M 10M 10M 5- 5- 5- 5-` | **5 t.** · 20 sièges non animés<br>`10M 10M 10M 10- 10-` |
| 50 part. · 25 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 5M 5M` | **6 t.** · 5 sièges non animés<br>`10M 10M 10M 10M 6M 5-` | **7 t.** · 5 sièges non animés<br>`10M 10M 10M 5M 5M 5M 5-` | **6 t.** · 5 sièges non animés<br>`10M 10M 10M 10M 6M 5-` |
| 50 part. · 32 % anciens · 2 modé. | **6 t.** · 30 sièges non animés<br>`10M 10M 8- 8- 7- 7-` | **5 t.** · 30 sièges non animés<br>`10M 10M 10- 10- 10-` | **5 t.** · 30 sièges non animés<br>`10M 10M 10- 10- 10-` | **5 t.** · 30 sièges non animés<br>`10M 10M 10- 10- 10-` |
| 50 part. · 39 % anciens · 1 modé. | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` | **5 t.** · 40 sièges non animés<br>`10M 10- 10- 10- 10-` |
| 50 part. · 39 % anciens · 4 modé. | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` |
| 50 part. · 45 % anciens · 1 modé. | **8 t.** · 40 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5-` | **8 t.** · 40 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5-` | **8 t.** · 40 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5-` | **8 t.** · 40 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5-` |
| 50 part. · 45 % anciens · 4 modé. | **5 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 10-` | **5 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 10-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` |
| 50 part. · 60 % anciens · 1 modé. | **7 t.** · 40 sièges non animés<br>`10M 7- 7- 7- 7- 6- 6-` | **7 t.** · 40 sièges non animés<br>`10M 7- 7- 7- 7- 6- 6-` | **7 t.** · 40 sièges non animés<br>`10M 7- 7- 7- 7- 6- 6-` | **7 t.** · 40 sièges non animés<br>`10M 7- 7- 7- 7- 6- 6-` |
| 50 part. · 60 % anciens · 4 modé. | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` | **6 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5- 5-` |
| 60 part. · 15 % anciens · 0 modé. | **8 t.** · 60 sièges non animés<br>`8- 8- 8- 8- 7- 7- 7- 7-` | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-` | **11 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-` | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-` |
| 60 part. · 15 % anciens · 3 modé. | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-` | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-` | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-` |
| 60 part. · 15 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **8 t.** · 10 sièges non animés<br>`10M 10M 10M 10M 5M 5M 5- 5-` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` |
| 60 part. · 25 % anciens · 2 modé. | **9 t.** · 40 sièges non animés<br>`10M 10M 6- 6- 6- 6- 6- 5- 5-` | **6 t.** · 40 sièges non animés<br>`10M 10M 10- 10- 10- 10-` | **9 t.** · 40 sièges non animés<br>`10M 10M 6- 6- 6- 6- 6- 5- 5-` | **6 t.** · 40 sièges non animés<br>`10M 10M 10- 10- 10- 10-` |
| 60 part. · 32 % anciens · 1 modé. | **6 t.** · 50 sièges non animés<br>`10M 10- 10- 10- 10- 10-` | **6 t.** · 50 sièges non animés<br>`10M 10- 10- 10- 10- 10-` | **10 t.** · 50 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5- 5- 5-` | **6 t.** · 50 sièges non animés<br>`10M 10- 10- 10- 10- 10-` |
| 60 part. · 32 % anciens · 4 modé. | **7 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 7- 7- 6-` | **6 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 10- 10-` | **6 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 10- 10-` | **6 t.** · 20 sièges non animés<br>`10M 10M 10M 10M 10- 10-` |
| 60 part. · 39 % anciens · 0 modé. | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-` | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-` | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-` | **6 t.** · 60 sièges non animés<br>`10- 10- 10- 10- 10- 10-` |
| 60 part. · 39 % anciens · 3 modé. | **7 t.** · 30 sièges non animés<br>`10M 10M 10M 8- 8- 7- 7-` | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-` | **7 t.** · 30 sièges non animés<br>`10M 10M 10M 8- 8- 7- 7-` | **6 t.** · 30 sièges non animés<br>`10M 10M 10M 10- 10- 10-` |
| 60 part. · 39 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **7 t.** · 5 sièges non animés<br>`10M 10M 10M 10M 10M 5M 5-` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` |
| 60 part. · 45 % anciens · 0 modé. | **9 t.** · 60 sièges non animés<br>`7- 7- 7- 7- 7- 7- 6- 6- 6-` | **9 t.** · 60 sièges non animés<br>`7- 7- 7- 7- 7- 7- 6- 6- 6-` | **11 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-` | **11 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-` |
| 60 part. · 45 % anciens · 3 modé. | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` |
| 60 part. · 45 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` |
| 60 part. · 60 % anciens · 0 modé. | **10 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **10 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **10 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **10 t.** · 60 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` |
| 60 part. · 60 % anciens · 3 modé. | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 5- 5- 5- 5- 5- 5-` | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 5- 5- 5- 5- 5- 5-` | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` | **8 t.** · 30 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6-` |
| 60 part. · 60 % anciens · 6 modé. | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` | **6 t.**<br>`10M 10M 10M 10M 10M 10M` |
| 75 part. · 15 % anciens · 0 modé. | **13 t.** · 75 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **12 t.** · 75 sièges non animés<br>`7- 7- 7- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` |
| 75 part. · 15 % anciens · 3 modé. | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-` | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-` | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-` | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-` |
| 75 part. · 15 % anciens · 6 modé. | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **9 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 5- 5- 5-` |
| 75 part. · 25 % anciens · 2 modé. | **8 t.** · 55 sièges non animés<br>`10M 10M 10- 9- 9- 9- 9- 9-` | **8 t.** · 55 sièges non animés<br>`10M 10M 10- 9- 9- 9- 9- 9-` | **9 t.** · 55 sièges non animés<br>`10M 10M 8- 8- 8- 8- 8- 8- 7-` | **8 t.** · 55 sièges non animés<br>`10M 10M 10- 9- 9- 9- 9- 9-` |
| 75 part. · 32 % anciens · 1 modé. | **8 t.** · 65 sièges non animés<br>`10M 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 65 sièges non animés<br>`10M 10- 10- 9- 9- 9- 9- 9-` | **13 t.** · 65 sièges non animés<br>`10M 6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5- 5-` | **8 t.** · 65 sièges non animés<br>`10M 10- 10- 9- 9- 9- 9- 9-` |
| 75 part. · 32 % anciens · 4 modé. | **8 t.** · 35 sièges non animés<br>`10M 10M 10M 10M 9- 9- 9- 8-` | **8 t.** · 35 sièges non animés<br>`10M 10M 10M 10M 9- 9- 9- 8-` | **8 t.** · 35 sièges non animés<br>`10M 10M 10M 10M 9- 9- 9- 8-` | **8 t.** · 35 sièges non animés<br>`10M 10M 10M 10M 9- 9- 9- 8-` |
| 75 part. · 39 % anciens · 0 modé. | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` |
| 75 part. · 39 % anciens · 3 modé. | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-` | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-` | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-` | **8 t.** · 45 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 9-` |
| 75 part. · 39 % anciens · 6 modé. | **9 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 5- 5- 5-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` |
| 75 part. · 45 % anciens · 0 modé. | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` | **8 t.** · 75 sièges non animés<br>`10- 10- 10- 9- 9- 9- 9- 9-` |
| 75 part. · 45 % anciens · 3 modé. | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-` | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-` | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-` | **11 t.** · 45 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 5- 5- 5-` |
| 75 part. · 45 % anciens · 6 modé. | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` |
| 75 part. · 60 % anciens · 0 modé. | **13 t.** · 75 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5-` | **13 t.** · 75 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5-` | **13 t.** · 75 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5-` | **13 t.** · 75 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5-` |
| 75 part. · 60 % anciens · 3 modé. | **10 t.** · 45 sièges non animés<br>`10M 10M 10M 7- 7- 7- 6- 6- 6- 6-` | **10 t.** · 45 sièges non animés<br>`10M 10M 10M 7- 7- 7- 6- 6- 6- 6-` | **10 t.** · 45 sièges non animés<br>`10M 10M 10M 7- 7- 7- 6- 6- 6- 6-` | **10 t.** · 45 sièges non animés<br>`10M 10M 10M 7- 7- 7- 6- 6- 6- 6-` |
| 75 part. · 60 % anciens · 6 modé. | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **8 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 7-` | **9 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 5- 5- 5-` | **9 t.** · 15 sièges non animés<br>`10M 10M 10M 10M 10M 10M 5- 5- 5-` |
| 90 part. · 15 % anciens · 0 modé. | **16 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **16 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 5- 5- 5- 5- 5- 5-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` |
| 90 part. · 15 % anciens · 3 modé. | **13 t.** · 60 sièges non animés<br>`10M 10M 10M 6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` |
| 90 part. · 15 % anciens · 6 modé. | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-` | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-` |
| 90 part. · 25 % anciens · 2 modé. | **10 t.** · 70 sièges non animés<br>`10M 10M 9- 9- 9- 9- 9- 9- 8- 8-` | **9 t.** · 70 sièges non animés<br>`10M 10M 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 70 sièges non animés<br>`10M 10M 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 70 sièges non animés<br>`10M 10M 10- 10- 10- 10- 10- 10- 10-` |
| 90 part. · 32 % anciens · 1 modé. | **9 t.** · 80 sièges non animés<br>`10M 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 80 sièges non animés<br>`10M 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 80 sièges non animés<br>`10M 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 80 sièges non animés<br>`10M 10- 10- 10- 10- 10- 10- 10- 10-` |
| 90 part. · 32 % anciens · 4 modé. | **10 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 9- 9- 8- 8- 8- 8-` | **9 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 10- 10- 10- 10- 10-` | **9 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 10- 10- 10- 10- 10-` | **9 t.** · 50 sièges non animés<br>`10M 10M 10M 10M 10- 10- 10- 10- 10-` |
| 90 part. · 39 % anciens · 0 modé. | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` |
| 90 part. · 39 % anciens · 3 modé. | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` | **9 t.** · 60 sièges non animés<br>`10M 10M 10M 10- 10- 10- 10- 10- 10-` |
| 90 part. · 39 % anciens · 6 modé. | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-` | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-` | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` | **9 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 10- 10- 10-` |
| 90 part. · 45 % anciens · 0 modé. | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` | **9 t.** · 90 sièges non animés<br>`10- 10- 10- 10- 10- 10- 10- 10- 10-` |
| 90 part. · 45 % anciens · 3 modé. | **10 t.** · 60 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 8- 8- 8-` | **10 t.** · 60 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 8- 8- 8-` | **10 t.** · 60 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 8- 8- 8-` | **10 t.** · 60 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 8- 8- 8-` |
| 90 part. · 45 % anciens · 6 modé. | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` | **11 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 6- 6- 6- 6- 6-` | **11 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 6- 6- 6- 6- 6-` |
| 90 part. · 60 % anciens · 0 modé. | **15 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **15 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **15 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` | **15 t.** · 90 sièges non animés<br>`6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6- 6-` |
| 90 part. · 60 % anciens · 3 modé. | **10 t.** · 60 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 8- 8- 8-` | **10 t.** · 60 sièges non animés<br>`10M 10M 10M 9- 9- 9- 9- 8- 8- 8-` | **12 t.** · 60 sièges non animés<br>`10M 10M 10M 7- 7- 7- 7- 7- 7- 6- 6- 6-` | **12 t.** · 60 sièges non animés<br>`10M 10M 10M 7- 7- 7- 7- 7- 7- 6- 6- 6-` |
| 90 part. · 60 % anciens · 6 modé. | **11 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 6- 6- 6- 6- 6-` | **11 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 6- 6- 6- 6- 6-` | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` | **10 t.** · 30 sièges non animés<br>`10M 10M 10M 10M 10M 10M 8- 8- 7- 7-` |
