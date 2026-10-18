# Attribution par la voix, frontières recalées, correction Gemini sous contrôle — 2026-09-19

Session autonome (nuit du 18 au 19/09). Point de départ : diagnostic du transcript
`71B505_2026-06-24_corrected` (débat Multiculturalisme, 2 h 05, 9 participants au log).

## 1. Diagnostic (71B505, run du 24/06)

| Constat | Mesure | Cause |
|---|---|---|
| 30 % de l'audio sans tour au log | 66 segments `[?]`, 2 278 s (5 min d'ouverture + 32 min de tour de table final) | le tour de table n'est pas passé par l'app |
| Gemini attribue **tous** les `[?]` à partir du texte seul | 0 `[?]` restant ; Interlocuteur 2 récupère 20 segments (~14 min) | prompt « si incertain, laisse [?] » non respecté ; aucune trace de provenance |
| Frontières de tours qui coupent une phrase | 27 changements d'orateur sur 35 | le log horodate le **clic** du modérateur, pas la fin de la parole |
| Relances / interruptions attribuées au détenteur du tour | ex. « mais qui organise tout ça ? c'est qui ? » dans le tour d'un autre | attribution par le log seul (diarisation non activée) |
| Artefacts de recollage | 1 750 « l 'état », 208 « est -ce » dans le brut | mots `strip()` puis recollés avec « » |
| Corrections Gemini sans preuve audio | 7 modifications de sens sur 170 segments (voir §5) | Gemini ne reçoit que le texte |
| Aucune mesure de qualité | — | pas de référence |

## 2. Identification des voix ancrée sur le log (`voice.py`)

**Principe.** La diarisation acoustique dit *qui parle quand* sous forme de voix anonymes ;
le log dit *qui a la parole officiellement*. Au cœur des tours (1 s retirée à chaque bord),
le détenteur est quasi certain : on y mesure quelle voix parle, et on rattache la voix au
participant sans jamais solliciter de LLM.

- Diarisation : pyannote 3.1 (segmentation *powerset* + empreintes WeSpeaker ResNet34 +
  clustering agglomératif) — Plaquet & Bredin, *Powerset multi-class cross entropy loss for
  neural speaker diarization*, Interspeech 2023 ; Bredin, *pyannote.audio 2.1 speaker
  diarization pipeline: principle, benchmark, and recipe*, Interspeech 2023 ; Wang et al.,
  *WeSpeaker*, ICASSP 2023.
- Rattachement (`map_clusters`) : une voix est attribuée à un participant si elle est la
  **voix majoritaire (≥ 50 %, ≥ 15 s)** de ses tours et d'aucun autre ; sinon, si **≥ 60 %**
  de sa parole au cœur des tours tombe dans les tours d'un même participant (voix secondaire
  d'une personne scindée par la diarisation). Majoritaire chez deux participants → voix
  *fusionnée*, inutilisable. Sinon → *faible* ou *distincte* : **aucune identité inventée**,
  la voix ne sert pas de preuve.
- Décalage horloge audio↔log affiné (`refine_offset`) en maximisant la pureté du
  croisement voix × participants (± 20 s, pas de 0,5 s).
- Fiabilité mesurée (`holdout_agreement`) par validation croisée à 2 plis : les tours de
  chaque participant sont alternés entre deux plis ; on rattache sur l'un, on mesure sur
  l'autre la part du temps de parole où la voix désigne le détenteur du tour. Le log
  n'étant pas une vérité parfaite (interruptions réelles), c'est une **borne basse**.

**Résultats 71B505.** Diarisation GPU : 394 s pour 2 h 05 (RTX 3070). 12 voix, dont 9
rattachées aux 9 participants (pureté 0,76 à 1,00) ; 3 voix non rattachées (151 s, 33 s,
32 s — la plus longue est incohérente : similarité intra-voix 0,12, typique d'un mélange
bruit/superpositions). Accord voix/log en validation croisée : **92,9 %** sur **96,3 %**
du temps de parole. Décalage affiné : +0,5 s — l'horloge était déjà bonne ; les phrases
coupées viennent bien du moment du clic.

**Le modérateur.** La voix qui ouvre la séance (« Bonjour à tous, merci d'être là… »)
est celle d'Interlocuteur 7 (131 s sur ~140 s de parole entre 0:56 et 3:20). Contrôle
par empreintes : en re-clusterisant les segments de cette voix, aucune séparation ne suit
le contexte (ouverture / ses tours / relances / tour de table) — seuls des segments isolés
de 2 s se détachent, comme pour une voix de référence non ambiguë. Interlocuteur 7 était
donc très probablement le modérateur, qui s'accordait aussi la parole dans l'app. Le
`Modérateur` du transcript du 24/06 était une invention de Gemini ; il n'apparaît plus
(à confirmer à l'écoute, cf. `A_VERIFIER.md`).

**Interlocuteur 9** parle davantage pendant les tours d'Interlocuteur 3 (ils dialoguent)
que pendant les siens : la règle de pureté seule le rattachait à 3. D'où la priorité
donnée à la voix majoritaire des tours d'un participant. Contrôle : ses segments dans ses
tours et dans ceux de 3 ont la même empreinte (similarité 0,40, contre 0,43 et 0,38 en
interne).

## 3. Attribution au mot, log × voix (`voice.fuse_word_speakers`)

| Situation | Orateur | `speaker_source` |
|---|---|---|
| log et voix concordent | détenteur | `log+voix` |
| pas de voix exploitable (silence, deux participants superposés) | détenteur | `log` |
| mots sans voix encadrés par la même voix identifiée (≤ 3 s) | cette voix | `voix-comblee` |
| autre participant identifié qui parle ≥ 1 s d'affilée pendant le tour | voix | `voix` |
| hors log, voix identifiée | voix | `voix` |
| ni log ni voix | `[?]` | `aucune` |

Seules les voix rattachées comptent : une voix non rattachée (bruit, mélange) superposée
à une voix identifiée ne l'annule pas. L'unité d'attribution est le mot écrit (« c » +
« 'est » recollés avant attribution). Sans ces deux règles et le comblement, le premier run
final comptait 676 segments dont ~416 micro-fragments `[?]` de 1,2 s en moyenne.

RGPD : un tour refusé reste masqué quoi que dise la voix ; la voix d'une personne qui a
refusé est masquée partout (y compris hors de ses tours — nouveau) ; aucun comblement
n'entre dans un tour refusé.

## 4. Recalage des frontières (`boundaries.py`)

Chaque frontière du log est déplacée dans une fenêtre −4/+6 s vers la coupure inter-mots
la plus crédible : changement de voix > fin de phrase (ponctuation Whisper) > pause
≥ 0,3 s > heure du log. Fondement : les changements de locuteur se font aux points de
transition (Sacks, Schegloff & Jefferson 1974, *Language* 50(4)) avec des écarts
inter-tours courts (Stivers et al. 2009, *PNAS* 106(26)). Un tour `[REFUS]` n'est jamais
réduit.

## 5. Correction Gemini sous garde-fous (`correct_transcript.py`)

Gemini corrige sans entendre l'audio. Rejoué sur les 170 corrections réelles du 24/06,
le garde-fou en rejette 12 : 9 « négation modifiée » (dont 7 vraies modifications de
sens, ex. « c'est pas qui se fait » → « c'est ce qui se fait », négations ajoutées),
2 « masque sans prénom » (« B5 » → « [Interlocuteur 5] »), 1 « réécriture trop
importante » (> max(4 mots, 20 %)). Un faux positif identifié : une reprise d'orateur
dédupliquée (« on ne trouve pas… on ne focus pas… »).

Correction rejetée → texte Whisper conservé, prénoms masqués par Gemini reportés
(RGPD), proposition gardée dans `texte_gemini`. Attribution d'un `[?]` par Gemini →
`speaker_suggestion` uniquement. Gemini reçoit en plus `mots_douteux` (probabilité
Whisper < 0,5) à corriger en priorité, et plus aucun champ interne ni prénom réel.

### Robustesse de la correction (constatée au run final)

- Un segment dont Gemini altère la structure (orateur, horodatage) ne fait plus rejeter
  son lot de 25 : il garde seul son texte brut.
- Quand Gemini fusionne ou omet un micro-segment (le lot 9 de 71B505 était perdu à chaque
  run), les segments rendus sont réalignés par horodatage.
- Masquage des prénoms **déterministe** pour les variantes orales d'un prénom de
  `name_map.json` (mot à majuscule en milieu de phrase, ≥ 5 lettres, une lettre d'écart
  sans accents ; sur 71B505 : 3 occurrences, variantes du pseudo d'Interlocuteur 3).
  Motivation : Gemini a masqué trois prénoms (dont cette variante) à certains runs et
  pas à d'autres. Les prénoms inconnus de `name_map.json` restent la limite : le
  rapport liste désormais les noms propres à relire (`noms_propres_a_verifier`).

## 6. Résultats du run final (71B505, 19/09)

| Indicateur | 24/06 brut | 24/06 corrigé | 19/09 brut | 19/09 corrigé |
|---|---|---|---|---|
| Non attribué `[?]` | 32,7 % | 0 % *(deviné par Gemini)* | 1,5 % | 1,5 % |
| Orateur prouvé (log et/ou voix) | 67 % | non traçable | 98,5 % | 98,5 % |
| Artefacts « l 'état » | 1 950 | 0 | 0 | 0 |
| Segments / changements d'orateur | 170 / 36 | 170 / 34 | 294 / 152 | 294 / 152 |
| Mots douteux signalés | — | — | 1 542 | 1 542 |

Provenance (s) : log+voix 4 458 · voix 2 284 · voix-comblée 15 · log 58 · aucune 106.
Correction : 280 acceptées, 11 rejetées (9 négation, 2 réécriture), 3 non corrigées
(segments fusionnés/altérés par Gemini) ; 48 `[?]` avec suggestion d'orateur non appliquée.

**Temps de parole** (s) — l'attribution change le fond de l'analyse :

| | 24/06 corrigé | 19/09 corrigé |
|---|---|---|
| Interlocuteur 7 | 699 + 558 « Modérateur » | 1 242 |
| Interlocuteur 3 | 1 074 | 1 201 |
| Interlocuteur 4 | 922 | 962 |
| Interlocuteur 6 | 892 | 946 |
| Interlocuteur 1 | 618 | 897 |
| Interlocuteur 2 | **1 433** | **667** |
| Interlocuteur 5 | 625 | 530 |
| Interlocuteur 8 | 115 | 188 |
| Interlocuteur 9 | 41 | 183 |

Environ 13 min attribuées à Interlocuteur 2 par les suppositions textuelles de Gemini
(tour de table) sont, selon la voix, d'autres participants. Le tableau de bord `viz/`
généré le 02/07 repose sur l'ancienne attribution.

**Phrases coupées** : le ratio reste élevé (112/152 brut, 101/152 corrigé) car la voix fait
apparaître de vrais changements d'orateur (dialogues, interruptions) que Whisper ne ponctue
pas. Validation indépendante du recalage des frontières (sans utiliser la voix pour
recaler, puis mesure contre les changements de voix) : distance médiane au changement de
voix 2,16 s → 1,69 s ; 14 frontières rapprochées, 7 éloignées ; à ≤ 1 s : 9/39 → 12/39.

## 7. Mesure (`quality.py`, `evaluate.py`)

- Sans référence : part `[?]`, provenance, phrases coupées, artefacts, mots douteux.
- Avec référence (extraits corrigés à l'écoute) : WER et WDER (*word diarization error
  rate*, Shafey, Soltau & Shafran, Interspeech 2019 : (S_IS + C_IS)/(S + C)).
  Les indicateurs sans référence ne sont que des indices ; seule une référence prouve un gain.

Kit prêt : `transcripts/Multiculturalisme/71B505/reference/extrait_{1,2,3}.{txt,mp3}`
(07:40-12:40 tour propre ; 30:40-35:40 échange chahuté avec les passages ambigus ;
1:46:00-1:51:00 tour de table hors log). Une fois corrigés à l'écoute :
`python "code python/evaluate.py" score reference/extrait_1.txt 71B505_2026-06-24_corrected.json 71B505_2026-09-19_corrected.json`
donne WER/WDER de l'ancienne et de la nouvelle version.

## 8. Limites connues

- Pas de référence humaine à ce jour : les gains de WER/WDER sont non mesurés.
- Changements de voix au mot près : Whisper (horodatage par attention) et pyannote
  (trames) se décalent de quelques centaines de ms, d'où des phrases coupées d'un mot
  (« Alors, tu | as fait un | conflit. »). Piste : alignement forcé phonétique (WhisperX,
  Bain et al., Interspeech 2023) — nécessite un modèle wav2vec2 français non installé.
- Passage ambigu Interlocuteur 7 / Interlocuteur 9 vers 31:07 : la voix alterne au milieu
  d'une question du modérateur ; à trancher à l'écoute (extrait 2).
- La parole superposée (344 s détectées) reste attribuée au log ou marquée sans voix.
- Les voix non rattachées ne sont jamais utilisées : une personne présente mais jamais
  inscrite au log et parlant peu resterait `[?]`.
- Seuils (15 s, 50 %, 60 %, 1 s, −4/+6 s, 20 %) choisis a priori, non optimisés — à
  recalibrer quand des extraits de référence existeront.
