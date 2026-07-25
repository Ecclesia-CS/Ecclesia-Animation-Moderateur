# Chantier 5 — Algorithme d'allocation v2 (spec validée)

> Spec arrêtée avec Jules le 2026-07-25. **Remplace** `docs/chantier-5-allocation-design.md`
> (design de la première itération, dont les décisions 1 à 5 sont désormais tranchées ou caduques).
> Aucun code n'a été écrit à ce stade — ce document est destiné à amender le plan de travail général.

---

## 1. Principe directeur

**L'algorithme d'allocation prime.** Il décide seul du nombre de tables à créer, de leur
composition, et de quelles tables sont modérées. Le superadmin ne fournit plus de taille cible et
ne pré-crée plus aucune table : il déclenche l'allocation, consulte le résultat, fait ses retouches
de dernière minute, puis ouvre le débat.

**Une seule mécanique pour toutes les règles.** Chaque règle s'exprime comme un objectif à deux
niveaux :

> maximiser le nombre de tables qui atteignent le seuil de la règle, puis, à égalité,
> maximiser la marge minimale (maximin).

Les cinq règles sont arbitrées en **ordre lexicographique strict 1 → 5** : on n'améliore jamais une
règle au détriment d'une règle plus prioritaire.

**Conséquence importante : l'algorithme ne peut jamais échouer.** Les seules contraintes dures sont
les bornes de taille des tables. Tout le reste dégrade progressivement, dans l'ordre croissant
d'importance (on sacrifie la règle 5 en premier, la règle 1 en dernier). Aucune exception ne doit
pouvoir bloquer le passage en phase de débat le jour de la séance.

---

## 2. Population traitée

| Catégorie | Alloué par l'algo ? | Compte dans les camps d'opinion ? |
|---|---|---|
| Membre présentiel ayant voté | Oui | Oui |
| Membre présentiel n'ayant pas voté | Oui | **Non** — neutre pour la règle 3 |
| Membre présentiel sans onboarding | Oui, compté **non-actif** | Selon ses votes |
| **Modérateur** | **Non** — affecté à une table comme animateur | **Oui** — ses votes alimentent l'analyse |
| Inscrit à distance (`attending_in_person = false`) | Non | Selon la config d'analyse existante |
| Retardataire (arrivé après l'allocation) | Non — rejoint via l'onglet « Rejoindre » | Non |

**Statut du modérateur** : il n'occupe pas de siège, ne compte ni comme actif ni comme passif, et
son opinion n'entre pas dans le mix d'hétérogénéité de sa table. Il encadre le débat, il n'y
participe pas. En revanche ses votes alimentent l'analyse globale des camps — le nombre de
modérateurs est négligeable devant le nombre de participants, le biais introduit est acceptable.

**Retardataires** : considérés comme actifs, consentants et anciens. Ils se greffent eux-mêmes sur
une table via un code, l'algorithme ne les connaît pas. S'ils refusent l'enregistrement, ils
rejoignent une table non enregistrée — l'information leur est donnée en salle (dispositif visible,
modérateur), pas par l'application.

---

## 3. Entrées

**Automatiques :**
- les membres présentiels et leurs attributs (consentement enregistrement, style de participation
  actif/passif, ancien/nouveau) ;
- les camps d'opinion (`analysis_members.group_id`, issus de l'analyse PCA + k-means) —
  **optionnels**, voir règle 3 ;
- le nombre de modérateurs déjà identifiés dans l'application.

**Saisies superadmin, toutes optionnelles :**
- *modérateurs supplémentaires attendus* — l'application affiche « il y a actuellement N modérateurs
  dans l'application, combien en ajoutes-tu ? » pour couvrir ceux qui arriveront sous peu ;
- *nombre d'enregistreurs disponibles* — si renseigné, la règle 2 vise ce nombre de tables
  enregistrables ; sinon elle se limite à sa garantie minimale.

---

## 4. Contraintes dures : taille et nombre de tables

- **N ≤ 10 participants → une table unique, pas d'allocation.** Toutes les règles ci-dessous sont
  sans objet.
- **N > 10** → tables de **5 minimum, 10 maximum**.
- **Dépassement toléré jusqu'à 20** dans le seul cas où la règle 1 ne peut pas être satisfaite
  autrement : agrandir les tables réduit le nombre total d'actifs requis. Le surplus absorbé étant
  constitué de participants passifs, la dégradation de qualité reste limitée.
**Politique de dimensionnement** (départages appliqués **après** les règles 1 à 4, jamais contre
elles) :

- **Tables modérées : les remplir jusqu'à 10.** À qualité égale sur les règles 1 à 4, préférer un
  nombre de tables ≤ nombre de modérateurs — quitte à faire des tables plus grosses, mais toutes
  animées.
- **Tables non modérées : les dimensionner vers le minimum de 5.** Une fois la capacité de
  modération saturée, découper le reliquat en petites tables plutôt qu'en grandes : deux tables de 5
  sont préférables à une table de 10 sans animateur.

*Exemple* : 60 participants, 4 modérateurs → 4 tables modérées de 10, puis 4 tables non modérées de
5 (8 tables au total), plutôt que 6 tables de 10 dont 2 sans animateur.

*Justification du second point* : les tables sans animateur fonctionnent avec une file d'attente
auto-gérée (`claim_floor` — le premier en file prend la parole). L'auto-régulation est réaliste à 5,
beaucoup moins à 10.

*Notes d'interaction* :
- Le premier point va dans le même sens que le repli de la règle 1 (moins de tables = moins
  d'actifs requis), mais **contre** la règle 2 (une table plus grosse a plus de chances de contenir
  un non-consentant).
- Le second point est **neutre pour les règles 1 et 4** — le seuil en 2/5 est invariant au découpage
  sous 10 personnes (deux tables de 5 exigent 2 actifs chacune, soit autant qu'une table de 10 qui
  en exige 4) — **favorable à la règle 2** (une petite table a moins de chances de contenir un
  non-consentant), mais **défavorable à la règle 3** : une table de 10 exige 3 personnes d'un autre
  camp (plafond de 70 %), deux tables de 5 en exigent 2 chacune, soit 4 au total. Découper consomme
  donc davantage de participants minoritaires. Si le découpage fait tomber une table sous le seuil
  d'hétérogénéité, la grande table est conservée.
- Si la règle 1 impose d'agrandir une table jusqu'à 20 pour absorber des passifs, elle l'emporte, y
  compris sur une table non modérée.

L'ordre lexicographique arbitre dans tous les cas.

---

## 5. Les cinq règles

### Règle 1 — Assez de gens qui parlent

**Seuil par table** : `actifs ≥ min(⌈2/5 × taille⌉, 4)`

Soit 2 actifs pour une table de 5, 3 pour une table de 6, 4 dès 10 personnes et au-delà.

*Intention* : éviter une table entièrement passive, où personne ne prend la parole. Quatre personnes
qui parlent suffisent à lancer une dynamique et à entraîner les autres.

*Repli* : agrandir les tables (donc en réduire le nombre), jusqu'au plafond de 20.

*Angle mort assumé* : il faut au moins 4 actifs dans toute la séance pour que la règle soit
satisfaisable où que ce soit. En dessous, l'algo maximise simplement le nombre de tables conformes.
Le style de participation étant auto-déclaré, une salle qui se déclare massivement passive est
possible — le superadmin le verra sur son tableau de bord.

### Règle 2 — Au moins une table enregistrable

**Seuil** : au moins **une** table ne contenant **aucun** non-consentant, et **non homogène** en
opinion (au moins une personne d'un autre camp que le camp majoritaire de cette table).

*Intention* : une personne refusant l'enregistrement suffit à rendre toute sa table
non-enregistrable. On veut garantir au moins une trace exploitable par débat — mais pas une trace
sans intérêt : une table enregistrée où tout le monde est d'accord n'apporte rien.

*Extension* : si le nombre d'enregistreurs est renseigné, viser ce nombre de tables propres. Des
tables propres supplémentaires au-delà de ce nombre sont un bonus, sans priorité.

*Angle mort assumé* : la table propre doit aussi satisfaire la règle 1 (plus prioritaire), donc
contenir assez d'actifs consentants. Si les consentants sont peu nombreux, tous passifs, ou tous du
même camp, la garantie tombe.

### Règle 3 — Hétérogénéité des opinions

**Seuil de viabilité par table** : camp majoritaire ≤ **70 %** de la table, **et** au moins
**2 personnes** d'un autre camp (en nombre absolu, pas en pourcentage).

**Puis maximin** sur le degré d'hétérogénéité, parmi les solutions à égalité sur le nombre de tables
viables.

*Intention* : il faut de la contradiction à chaque table, mais surtout il faut qu'elle soit
**exprimable**. Une seule personne dissidente face à neuf autres ne parlera pas — le minimum absolu
de deux personnes est ce qui rend le désaccord tenable.

*Pourquoi seuil puis maximin, et pas maximin seul* : le maximin égalise. Quand les dissidents sont
rares, il les étale à raison d'un par table et produit dix tables où personne n'ose contredire —
exactement le résultat qu'on veut éviter. Le seuil concentre au contraire les dissidents là où ils
peuvent peser, quitte à assumer des tables franchement homogènes. Une fois toutes les tables
viables, le maximin redevient le bon départage : il évite qu'une table soit parfaitement mixte
pendant qu'une autre est tout juste au seuil.

*Vocabulaire* : « dissident » n'est pas binaire. Le k-means produit k camps (souvent 3) ; le seuil
se lit donc par table en termes de camp majoritaire et de second camp.

*Si l'analyse des camps n'est pas disponible* (non lancée, échouée, trop peu de votes) :
**la règle 3 est simplement désactivée**, l'algorithme tourne sans elle et le signale au superadmin.
Il ne doit jamais bloquer pour cette raison — contrairement à `run_clustering_v2`/`v3` aujourd'hui,
qui lèvent une exception.

### Règle 4 — Assez d'anciens

**Seuil par table** : `anciens ≥ 2/5 × taille`

Un « ancien » est quelqu'un ayant déjà participé à un débat Ecclesia. Question reformulée en
binaire : **« As-tu déjà fait un débat Ecclesia ? »** — oui = ancien, non = nouveau. Déclaratif
assumé.

*Intention* : garantir qu'il y a, à chaque table, assez de gens qui savent comment se déroule un
débat pour en assurer le bon déroulé. Ce n'est **pas** une exigence de répartition égale des
nouveaux, mais un plancher d'expérience — cette formulation est ce qui laisse de la marge à la
règle 5.

*Angle mort assumé* : la somme des planchers vaut 2/5 × N, donc la règle n'est intégralement
satisfaisable que si **les anciens représentent au moins 40 % de la séance**. Une séance à forte
proportion de nouveaux — cas normal pour une association qui grandit — dégradera cette règle. C'est
précisément pourquoi elle est un objectif et non une contrainte dure.

### Règle 5 — Les nouveaux avec un modérateur

**Objectif** : parmi les placements encore libres après les règles 1 à 4, orienter les nouveaux vers
les tables modérées.

*À lire avec la politique de dimensionnement de la section 4* : les tables non modérées étant
dimensionnées vers le minimum de 5, un nouveau qui y atterrit se trouve au moins dans un petit
groupe, plus facile à auto-réguler. Le nombre total de places non encadrées est inchangé par ce
découpage — seule leur répartition change.

*Intention* : un nouveau apprend le déroulé d'une séance en le voyant bien fait — écouter sans
interrompre, les signes de demande de parole, le rythme. C'est le rôle du modérateur.

*Note* : les règles 4 et 5 sont en tension par nature (l'une veut de l'expérience partout, l'autre
veut concentrer les nouveaux sur les tables animées). C'est la formulation de la règle 4 en plancher
— et non en répartition égale — qui laisse à la règle 5 une marge d'action réelle.

---

## 6. Dégradation et cas limites

L'ordre d'abandon est **croissant en importance** : règle 5, puis 4, puis 3, puis 2, puis 1. C'est
le comportement naturel de l'ordre lexicographique, il n'y a pas de mécanisme spécifique à coder.

| Situation | Comportement |
|---|---|
| N ≤ 10 | Table unique, aucune allocation |
| Analyse des camps indisponible | Règle 3 désactivée, allocation quand même, message au superadmin |
| Moins de 4 actifs dans la séance | Règle 1 maximisée au mieux, jamais d'échec |
| Moins de 40 % d'anciens | Règle 4 maximisée au mieux |
| Aucun consentant en nombre suffisant | Règle 2 abandonnée |
| Présents n'ayant pas voté | Alloués normalement, neutres pour la règle 3 |
| Membres sans onboarding | Comptés non-actifs (conservateur) |

**Reproductibilité** : la recherche locale doit être déterministe (graine fixe) ou le fait qu'un
relancement produise une répartition différente doit être explicite dans l'interface — sinon le
superadmin s'inquiétera à juste titre de voir le résultat changer entre deux clics.

---

## 7. Flow superadmin

1. La séance passe en phase `allocating`.
2. Le superadmin **déclenche** l'allocation (bouton). *Amendement à F13 : la création automatique des
   tables est bien acquise, mais le déclenchement reste manuel, pas automatique à l'entrée en phase.*
3. L'algorithme crée les tables et affiche le résultat.
4. Le superadmin consulte, fait ses retouches de dernière minute (déplacement de personnes entre
   tables), ajoute des modérateurs retardataires.
5. Il **déclenche lui-même** la phase `debating` — les votants sont alors redirigés par l'application
   vers leur table.

**Tableau de bord de l'étape 4** : chaque table affiche sa composition par camp d'opinion, son nombre
d'actifs, son caractère enregistrable, et le **statut de chaque seuil** (actifs / anciens /
hétérogénéité / enregistrement). Mise à jour en direct lorsqu'une personne est déplacée, pour que le
superadmin voie immédiatement si une retouche manuelle casse une règle. Le drag & drop de membres
entre groupes existe déjà dans `SuperadminScreen.tsx` (`loadGroups`).

---

## 8. Questionnaire d'onboarding : 6 → 3 questions

| Question | Sort |
|---|---|
| Consentement transcription (`consent_transcript`) | **Conservée** — règle 2 |
| Style de participation (`participation_style`) | **Conservée** — règle 1 |
| Expérience Ecclesia (`ecclesia_experience`) | **Conservée, reformulée en binaire** — règles 4 et 5 |
| Préférence modérateur (`moderator_pref`) | **Supprimée** — remplacée par la règle 5 |
| Préférence taille de groupe (`group_size_pref`) | **Supprimée** — inutilisée |
| Ouverture aux avis différents (`openness_to_diff`) | **Supprimée** — inutilisée |

Nouveau signal, collecté **en dehors de l'onboarding** : le statut de modérateur, obtenu à l'entrée
dans la séance (mot de passe Ecclesia) ou posé par le superadmin. Il doit être disponible sur le
membre de séance **avant** le lancement de l'allocation.

---

## 9. Implications techniques

**Calcul côté client (TypeScript).** Contraintes, recherche locale et nombre de tables variable sont
ingérables proprement en `plpgsql`. Le calcul tourne dans le navigateur du superadmin — même pattern
que `src/lib/analysis.ts` (PCA + k-means déjà côté client) — puis une RPC persiste le résultat dans
`table_assignments`.

**Nouvelle RPC de création de tables en lot.** `create_table` exige aujourd'hui un pseudo et crée
systématiquement un participant : inutilisable pour générer N tables vides. Il faut une fonction
superadmin dédiée créant N tables (join codes générés, `session_id` renseigné, `leaderless` selon la
disponibilité d'un modérateur).

**Migrations questionnaire** : suppression de trois colonnes d'`entry_responses`, passage de
`ecclesia_experience` en booléen, ajout du marquage modérateur (probablement sur `session_members`,
puisqu'il est posé en phase de vote et non à l'onboarding).

**Suppression de l'existant chantier 5** : `get_moderator_responses`, le panneau « Réponses
modérateur » du superadmin et l'option « Allocation avancée » (`run_clustering_v3`) deviennent
caducs. `run_clustering_v1`/`v2` peuvent être conservées le temps de valider le nouvel algorithme,
puis retirées.

**Items du plan de travail affectés** :
- **F13** — acquis sur le fond (plus de pré-création manuelle de tables), amendé sur la forme
  (déclenchement manuel de l'allocation dans la phase `allocating`).
- **F16** — **annulé**. Le signal « préférence modérateur » est supprimé ; le besoin d'encadrement
  est traité par la règle 5 (nouveaux vers les tables modérées).
- **F15** — inchangé, indépendant de l'allocation. `staff_interest` (questionnaire de fin de séance)
  reste un signal de recrutement pour les séances ultérieures, sans lien avec l'algorithme.
- **B1 / B2 / E4** — la livraison de juillet est remplacée par la présente spec.
