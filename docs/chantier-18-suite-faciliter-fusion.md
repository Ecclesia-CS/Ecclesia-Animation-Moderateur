# Chantier 18 — suite : comment faciliter la fusion des assertions

> Brief de reprise pour une **nouvelle conversation**. La conversation d'origine (F23 prompt
> prescription/jugement, F24 annulation, calibrage des 24 verdicts) est close et mergée : tout
> ce qui suit se suffit à lui-même.
>
> Le sujet n'est **pas** « corriger un bug de prompt ». C'est une réflexion ouverte : à quoi
> devrait ressembler la fusion des assertions pour qu'elle marche à l'échelle d'une vraie
> séance — architecture d'appel, UX de validation, ou tout autre angle.

---

## 1. Où on en est

Tout est mergé sur `main` (`eabd871`). Tag de rollback : `pre-merge-chantier-18-2026-07-28`
(→ `2143dce`). Edge Function `gemini-proxy` déployée en **v13**.

### À quoi sert la fusion, et pourquoi la qualité compte

Pendant la phase de vote, les participants soumettent des assertions ; beaucoup disent des
choses voisines. La fusion élimine les quasi-doublons pour qu'on ne vote pas trois fois sur la
même idée.

**L'enjeu n'est pas cosmétique** : ces votes alimentent l'analyse en camps (PCA + k-means,
`src/lib/analysis.ts`) qui détermine la répartition en tables. Une fusion abusive **efface un
clivage réel** de la carte d'opinion. Une assertion en double, elle, coûte quelques secondes.
D'où un biais très net vers la non-fusion.

### Architecture d'appel actuelle

```
LLMModerationPanel / SuperadminScreen
        │  mergeAssertions(payload)
        ▼
src/lib/gemini.ts                        ← garde-fous déterministes ICI
        │  supabase.functions.invoke('gemini-proxy', { action:'merge', payload })
        ▼
supabase/functions/gemini-proxy/index.ts (Edge Function Deno)
        │  buildMergePrompt() → UN SEUL prompt texte contenant TOUTES les assertions
        ▼
Gemini 2.5 Flash Lite → tableau JSON [{ keep_id, reject_ids[], merged_content?, reason }]
```

**Trois déclencheurs**, tous envoyant l'intégralité des assertions `approved` en un seul appel :

| Déclencheur | Emplacement | Quand |
|---|---|---|
| Bouton « Analyser les doublons » | `LLMModerationPanel.handleAnalyzeMerges` | manuel |
| Auto-fusion périodique | `LLMModerationPanel`, `setInterval` 1-30 min | si `ai_auto_merge_periodic_<id>` |
| Auto-fusion pré-clustering | `SuperadminScreen`, avant `run_clustering_*` | si `ai_auto_merge_<id>` |

**Le prompt** (`buildMergePrompt`) : rôle → thème → **liste des N assertions** → règle
fondamentale (« test du désaccord ») → typage PRESCRIPTION / JUGEMENT / CONSTAT avec
interdiction absolue de fusionner deux types différents → **7 motifs de blocage** (objet, degré,
motif, modalité, agent, inclusion partielle, portée d'un constat) → 3 familles de fusion
autorisée → format JSON. Instructions fixes : 6 823 caractères (~2 000 tokens).

### Flux aval — acquis, ne pas casser

1. Gemini **propose**, rien n'est écrit en base. Les propositions vivent dans `localStorage`
   (`merge_proposals_<id>`), en snapshot autonome.
2. Le modérateur valide au cas par cas : « garder telle quelle » ou « ✨ fusionner en
   formulation combinée » (texte proposé par Gemini, éditable).
3. L'application passe par `apply_assertion_merge` — RPC **atomique** qui réécrit le contenu,
   transfère les votes, rejette l'assertion absorbée, et enregistre de quoi tout défaire.

### F24 — l'annulation d'une fusion (fait)

Table `assertion_merges` + trois RPC : `apply_assertion_merge`, `revert_assertion_merge`,
`list_assertion_merges` (migration `20260728_chantier18_merge_undo.sql`, appliquée).

Pourquoi une table d'historique était nécessaire : `merge_assertion_votes` **n'est pas
réversible par calcul** — il bascule des votes existants en `agree` sans mémoriser leur valeur
d'avant et insère des lignes indiscernables d'un vote légitime. On enregistre donc le **delta**
(votes basculés avec leur valeur précédente, votes créés par le transfert) au moment de la
fusion. Conséquence voulue : les votes exprimés **après** la fusion ne sont pas écrasés par
l'annulation. L'historique est en base et non plus en `localStorage` → une fusion faite sur un
poste est annulable depuis n'importe quel autre.

**Ce point compte pour la réflexion à venir** : la fusion est désormais un geste **réversible**.
Ça change l'économie de la validation humaine (cf. §4).

### Le fichier de calibrage — c'est la spécification

`docs/calibrage-fusion-assertions.md` contient les **24 verdicts de Jules** (19 non-fusion /
5 fusion), chacun avec son motif. Toute refonte doit continuer à les satisfaire.

Règle de tête, dont dérivent les 24 arbitrages :

> **Peut-on imaginer une personne de bonne foi qui approuve l'une et refuse l'autre ?**
> Si oui, même de justesse, ne pas fusionner.

Les 5 seules fusions autorisées : reformulation pure (cas 3, 12, 13), équivalence logique
stricte y compris double négation (15), cadrage personnel vs général (22).

**En attente d'arbitrage** : les **4 échelles B2** (gradient d'intensité) sont dans ce même
fichier, prêtes à être tranchées. Reportées volontairement — aucune erreur d'intensité n'a été
observée en test, et calibrer sur des échelles fabriquées reproduirait l'erreur du chantier 7
(un contre-exemple inventé à l'avance, renversé dès le premier arbitrage réel).

### Garde-fous déterministes en place

Dans `src/lib/gemini.ts`, après réponse :

1. **Anti-regroupement** — toute entrée à plus d'un `reject_id` est jetée.
2. **Anti-inclusion partielle** — `src/lib/mergeGuards.ts` (`isPartialInclusion`, 14 tests).
   Bloque en dur quand la plus longue coordonne deux propositions (« et », « ainsi que ») et que
   la courte n'en reprend qu'une. Nécessaire parce que le modèle enfreignait ce verdict **même
   cité mot pour mot** dans le prompt.

Le nombre de propositions écartées est **affiché** dans le panneau, pas masqué — Jules veut
pouvoir observer le comportement du modèle.

### Documents à lire en premier

- `docs/calibrage-fusion-assertions.md` — les 24 verdicts + les 4 échelles B2 en attente.
- `docs/fusion-assertions-etat-des-lieux.md` — mesures de coût, chiffrage des pistes, données
  de séparabilité lexicale. **Contient les chiffres à ne pas refaire** (quota).

---

## 2. La vraie limite connue : décrochage au-delà d'une trentaine d'assertions

C'est le sujet de fond.

| N | Comportement observé | Résultat |
|---|---|---|
| 10 | Détection de doublons par paires | 3 entrées, toutes des paires, 2 fusions attendues sur 2 correctes |
| 41 | **Regroupement thématique** | 10 entrées absorbant jusqu'à **9 assertions**, **28 faux positifs** |

À N=41, une seule et même « fusion » proposée réunissait :

> « Il faut réduire la publicité » · « Le marketing c'est mal » · « L'État doit réglementer la
> publicité » · « Les marques doivent s'autoréguler »

Deux de ces assertions sont **opposées**. La consigne « ne fusionne jamais plus de 2 assertions
ensemble », présente depuis le chantier 7, est purement ignorée.

**Le contrôle est net** : le *même* prompt v13 sur 10 assertions ne renvoie que des paires. La
bascule tient au **volume**, pas aux règles — le calibrage n'est pas en cause. Et le problème
**préexistait** : rien dans les versions antérieures ne l'empêchait, il n'avait jamais été testé
à l'échelle d'une vraie séance. Une séance réelle produit facilement 40 assertions ou plus : le
décrochage est le régime **nominal**, pas un cas limite.

### Pourquoi, concrètement — hypothèses, avec ce qui les soutient ou les affaiblit

Aucune n'est démontrée. Elles sont classées par coût de test croissant.

**H1 — La liste est placée AVANT les règles dans le prompt.** `buildMergePrompt` produit :
rôle → thème → *liste des N assertions* → règles. À N=10 les règles restent proches du début ;
à N=41 elles sont repoussées loin derrière une longue énumération, et le modèle a déjà « cadré »
la tâche en lisant la liste. *Test le moins cher de tous* : inverser l'ordre (règles d'abord,
liste en dernier), un seul appel pour comparer. **C'est l'hypothèse que je testerais en premier.**

**H2 — La tâche est combinatoirement ouverte.** On demande « trouve les doublons » dans un sac
de N éléments, soit N(N−1)/2 comparaisons implicites : 45 paires à N=10, **820 paires à N=41**.
Un modèle ne fait pas 820 comparaisons en une passe ; il se rabat sur une stratégie moins
coûteuse — le regroupement par thème, qui est exactement ce qu'on observe. Cette hypothèse
prédit que **reformuler la tâche en classification binaire par paire** supprimerait le
décrochage. Elle est cohérente avec tout ce qui a été mesuré.

**H3 — Capacité du modèle.** `gemini-2.5-flash-lite` est le plus petit de la famille. Jamais
comparé à `gemini-2.5-flash` sur cette tâche. Un appel suffirait à trancher.

**Ce qui est peu probable — la longueur de contexte.** À N=41 le prompt fait ~3 800 tokens
d'entrée, très loin des limites du modèle. « Contexte trop long » n'explique pas le décrochage ;
c'est la **nature de la tâche** à ce volume, pas sa taille en tokens.

**Signal annexe** : à N=41 la **sortie** a atteint 3 805 tokens, davantage que l'entrée. Le
modèle produit énormément (une entrée JSON par groupe, avec un `reason` verbeux). Toute solution
doit regarder l'entrée *et* la sortie.

---

## 3. Ce que Jules attend de la prochaine session

Une **réflexion ouverte**, pas une implémentation immédiate : explorer les pistes avec lui,
arbitrer ensemble, puis seulement construire.

Il a lui-même cité deux directions (découpage en lots ; enfouissement sémantique pour
pré-grouper) et demandé qu'on en cherche d'autres. Il a explicitement choisi, à la clôture du
chantier 18, de **garder l'architecture d'appel actuelle pour l'instant**, parce qu'observer la
capacité de fusion en conditions réelles a de la valeur en soi. Ce choix est réversible et fait
justement partie de ce qui est à rediscuter.

---

## 4. Pistes de réflexion — à explorer, aucune n'est tranchée

### A — Découper en lots et fusionner par vagues

Le surcoût en tokens est **borné à ~×2,2** (on repaie ~1 800 tokens fixes par lot, la partie
variable ne bouge pas) : ce n'est pas là qu'est le problème.

Le problème est le **rappel**. Avec un découpage **aléatoire**, deux doublons ne sont comparés
que s'ils tombent dans le même lot — probabilité ≈ `29/(N−1)` :

| N | Chance de détecter un vrai doublon |
|---|---|
| 60 | ~49 % |
| 90 | ~33 % |
| 120 | ~24 % |

On perdrait la majorité des fusions légitimes. **Le découpage n'a de sens que si les lots sont
constitués par proximité** — ce qui renvoie à la piste B. A et B ne sont donc pas des
alternatives : B est ce qui rend A viable.

### B — Enfouissement sémantique pour pré-grouper

Vecteur par assertion, distances deux à deux en local (gratuit). Deux usages :
**B1** ne garder que les K paires les plus proches et demander un oui/non **par paire** (coût
`~1 800 + 49 × 2K`, **constant en N**) ; **B2** former des lots de 30 par voisinage plutôt qu'au
hasard.

**Vigilance majeure** : l'enfouissement mesure une proximité **thématique**, or le mode d'échec
actuel *est* une sur-fusion thématique. Il ne doit servir qu'au **rappel** (ratisser large),
jamais à la décision. Prendre K généreusement.

**Travail technique** : l'Edge Function ne connaît que `generateContent` ; il faudrait une
action `embed`.

### C — Pré-filtrage purement lexical : **écarté, mesures à l'appui**

Tentant car gratuit et à moitié écrit (`normalize` / `significantWords` dans `mergeGuards.ts`).
Indice de Jaccard sur les mots porteurs de sens, calculé sur les cas arbitrés :

- **Doivent fusionner** : cas 3 → 0,25 · cas 12 → 0,33 · **cas 13 → 0,00** · cas 15 → 0,25 ·
  cas 22 → 0,67
- **Ne doivent pas** : cas 21 → 0,67 · cas 8 → 0,67 · cas 18 → 0,50 · cas 1 → 0,40 · cas 5 → 0,33

Le cas 13 (« la pub, faut arrêter ça » / « il faut mettre fin à la publicité ») partage **zéro
mot** avec son doublon validé, tandis que du bruit monte à 0,67. **Les distributions se
recouvrent complètement : aucun seuil lexical ne sépare.** C'est l'argument le plus fort en
faveur du sémantique — et il repose sur les propres verdicts de Jules.

### D — Reformuler la tâche : classification binaire par paire

Découle de H2. Au lieu de « voici N assertions, trouve les doublons », envoyer des **paires
explicites** et demander pour chacune : fusion oui/non + justification. Le prompt peut alors
être bien plus court (les 7 motifs de blocage suffisent, les exemples deviennent moins
nécessaires). Se combine naturellement avec B1.

### E — Prévenir plutôt que guérir : dédoublonner à la **soumission**

Piste produit, la plus en amont — et peut-être la plus rentable. Au moment où un participant
soumet une assertion, lui montrer les 2-3 assertions existantes les plus proches : « des
propositions voisines existent déjà, veux-tu plutôt voter dessus ? ». Effets : réduit N à la
source, améliore l'expérience participant (il découvre ce qui a déjà été dit), et déplace le
jugement vers l'auteur lui-même — qui est mieux placé que quiconque pour dire si c'est la même
idée. Ne supprime pas le besoin de fusion a posteriori, mais en réduit la charge.

### F — Améliorer l'UX de validation humaine

État actuel : les propositions s'affichent dans `LLMModerationPanel`, validées une par une
(« garder telle quelle » / « fusionner en formulation combinée » / « ignorer »).

Leviers identifiés en lisant le code :

- **La fusion est désormais réversible** (F24). L'UI peut donc assumer une validation rapide,
  quasi optimiste, avec une annulation à un clic — l'économie de la revue n'est plus la même que
  quand chaque fusion était définitive.
- **Afficher le nombre de votes** de chaque assertion sur la proposition. Fusionner deux
  assertions déjà très votées est bien plus risqué que deux assertions à zéro vote ; aujourd'hui
  l'information n'est pas sous les yeux du modérateur.
- **Choisir automatiquement le `keep_id`** le plus voté (ou le mieux formulé) plutôt que de
  laisser l'ordre renvoyé par Gemini décider — `swapKeep` existe déjà mais est manuel.
- **Trier les propositions** par confiance ou par risque (nombre de votes en jeu) plutôt que par
  ordre d'arrivée.
- **Le moment de la fusion est un levier** : fusionner tôt dans la phase de vote est presque
  sans risque (peu de votes posés), fusionner tard l'est beaucoup plus. L'auto-fusion périodique
  existe déjà (`ai_auto_merge_periodic_<id>`) mais n'est pas pensée sous cet angle.

### G — Supprimer le surcoût des UUID (orthogonale, peu coûteuse)

Les assertions sont sérialisées `N. [uuid] contenu`. Des index `1..N` remappés côté client
allégeraient chaque assertion **et** supprimeraient toute une classe de bugs : Gemini hallucine
parfois des UUID légèrement altérés, ce qui impose aujourd'hui une sanitisation par expression
régulière dans l'Edge Function **plus** un garde-fou côté client. Compatible avec toutes les
autres pistes.

### Les trois mesures à faire en premier

1. **Inverser l'ordre du prompt** (règles avant la liste) — 1 appel, teste H1, c'est le moins
   cher.
2. **L'enfouissement rattrape-t-il le cas 13 ?** Test décisif de la piste B : si la distance
   sémantique classe « la pub, faut arrêter ça » près de « il faut mettre fin à la publicité »,
   B tient ; sinon elle a le même angle mort que C.
3. **Où est exactement le seuil de décrochage ?** On sait que 10 va bien et 41 non. Tester 20,
   25, 30, 35 bornerait la zone et dirait si un lot de 30 est déjà trop grand.

---

## 5. Contraintes projet à ne pas oublier

- **Quota Gemini gratuit, partagé et limité.** Privilégier les tests simulés pour toute la
  plomberie ; ne consommer de vrais appels que pour les vérifications de bout en bout. Le
  chantier 18 entier a coûté **3 appels réels** — c'est l'ordre de grandeur à viser.
  **Rapporter le nombre exact d'appels consommés** dans le résumé final.
  ⚠️ `gemini-2.5-flash-lite` renvoie régulièrement des **503** (surcharge côté Google) : prévoir
  une relance avec temporisation, ces échecs ne consomment aucun token.
- **Aucun appel direct à `api.google.com`** depuis le frontend : tout via `gemini-proxy`. Toute
  modification du prompt exige un **redéploiement** de l'Edge Function pour prendre effet
  (`mcp__<supabase>__deploy_edge_function`).
- **Les 24 verdicts du calibrage sont la spécification.** Toute refonte doit continuer à les
  satisfaire ; les 14 tests de `mergeGuards.test.ts` en figent déjà une partie. Ne pas modifier
  un verdict sans validation explicite de Jules.
- **Ne jamais casser le flux aval** : proposition → validation humaine → RPC atomique
  annulable. La fusion ne doit jamais écrire en base sans validation.
- **Ne jamais utiliser `AskUserQuestion`** dans ce projet (indisponible côté dispatch) —
  décider raisonnablement, et documenter dans `A_VERIFIER.md`.
- **Worktree obligatoire** avant tout `git checkout` : `git worktree add ../Ecclesia-chantier-XX
  -b <branche> origin/main`. Copier `.env` depuis la racine (gitignoré → sinon page blanche sans
  erreur console, piège silencieux), puis `npm install` dans le worktree.
- **`preview_start` lit le `.claude/launch.json` du dossier racine**, pas celui du worktree.
  ⚠️ `chantier-18-dev` et `chantier-29-dev` sont **tous deux sur le port 5191** — conflit connu.
  Ports occupés : 5173 à 5195. Prendre **5196 ou au-delà**.
- **MCP Supabase** : vérifier sa présence via `ToolSearch` en début de session. Il a été absent
  au démarrage puis **apparu en cours** de la session chantier 18 — ne pas conclure à son absence
  après une seule vérification. Quand il est là, `apply_migration`, `execute_sql`,
  `deploy_edge_function` et `get_advisors` fonctionnent.
- **`A_VERIFIER.md`** : ne jamais supprimer une entrée sans validation explicite de Jules ; la
  déplacer en section « Validé ».
- **Le mot de passe superadmin n'est pas détenu par l'agent** et ne doit pas être demandé. Tout
  le panneau IA est derrière ce mot de passe → la vérification visuelle est faite par Jules ;
  l'agent vérifie la logique par SQL, par tests, et par appels REST directs (un JWT anonyme
  s'obtient par `POST /auth/v1/signup` avec un corps vide, ce qui permet d'appeler
  `gemini-proxy` sans passer par l'UI).

---

## 6. État de la vérification à la clôture du chantier 18

- `npx tsc -b` ✅ · `npm run build` ✅ · `npm test` → **77 tests verts** (dont 14 figeant les
  verdicts de calibrage).
- Migration `20260728_chantier18_merge_undo` **appliquée en base**. Aller-retour
  fusion → annulation vérifié en SQL sur un jeu jetable (supprimé, cascade contrôlée) :
  contenu restauré, vote basculé rendu à sa valeur, vote transféré retiré, assertion
  ré-approuvée, **vote postérieur à la fusion préservé**, double annulation refusée.
- Exposition PostgREST des 3 RPC vérifiée (mot de passe exigé) ; helpers internes verrouillés
  (`permission denied`).
- Production GitHub Pages : bundle déployé et vérifié, **zéro erreur console** sur l'accueil et
  sur l'écran de connexion superadmin.
- Advisors Supabase : les 7 entrées concernant les nouveaux objets sont attendues (mêmes que les
  178 existantes sur toutes les RPC superadmin, plus le `rls_enabled_no_policy` volontaire,
  modèle `app_config`).
- **Non vérifié — nécessite le mot de passe superadmin** : le rendu visuel de la section
  « Fusions effectuées », le parcours de clic « Annuler → Confirmer », et l'affichage du message
  de propositions écartées. La logique serveur et les garde-fous sont couverts par les tests.
- **Non validé empiriquement** : les 22 autres cas du calibrage. Le jeu de validation des 41
  assertions a été saboté par le regroupement thématique — il est reconstructible à partir des
  24 paires du fichier de calibrage (dédupliquer les phrases répétées ; fusions attendues :
  cas 3, 12, 13, 15, 22 ; tout le reste est un faux positif). Il redeviendra exploitable une
  fois le décrochage traité.
