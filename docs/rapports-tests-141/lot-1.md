# Chantier 141 — rapport du lot 1 (sans mot de passe) — 2026-09-28, dev

Environnement : serveur local sur la base **dev** (`mnjqrlrrzrycuconlfqb`) via `.env.local` non commité ; séance et table jetables `QA141-*`, purgées en fin de test (0 ligne restante vérifiée).
**Lot partiel** : arrêté faute de marge, la suite reste à faire (voir « Non joué »).

## Résultats

| Item `A_VERIFIER.md` | Résultat | Détail |
|---|---|---|
| Visiteur non inscrit sur `#session/<code>` en `post_voting` (l. 1013) | ✅ passe | Message « Le débat vient de se terminer », « Les résultats publics seront disponibles une fois la séance clôturée », aucun résumé public. |
| C5 — retardataire « table seulement » (audit 87/101) | ✅ **obsolète, comportement amélioré** | Depuis les chantiers 140/143, le retardataire qui rejoint par code de table est **inscrit** (code de rappel affiché), puis en `post_voting` il voit l'overlay « La séance est terminée » avec « Voir vos résultats → » (apparu en moins de 8 s, sans rechargement). Plus de cul-de-sac. |
| Ligne « J'ai déjà un code de rappel » sur la porte `#session` en débat (règle 140) | ✅ présente | |

## Observations (aucune n'est bloquante)

- **O1 — mineur** : deux appels `join_table` répondent **400** au chargement quand le navigateur garde en mémoire une table qui n'existe plus (`ecclesia_table` périmé) ; l'appli retombe ensuite sur l'écran d'accueil sans message. Probablement du bruit de test (stockage périmé de mon navigateur), à confirmer : si un vrai participant est dans ce cas, il ne voit aucune explication.
- **O2 — environnement** : `127.0.0.1:5173` n'est pas joignable dans le Browser pane (Vite n'écoute que `localhost`). Donc **une seule identité anonyme par session de test** ; pour simuler une seconde personne il faut vider `localStorage` (perd la première identité). À lever avant les tests à deux rôles, par exemple en lançant Vite avec `--host 127.0.0.1` en plus.
- **O3 — hors périmètre de ce test** : le questionnaire forcé ne s'est pas déclenché parce que la bascule de phase a été faite en SQL direct, pas par le bouton `PhaseBar` (qui appelle `force_session_questionnaire`). Ce n'est pas une anomalie ; à tester en lot superadmin.

## Suite (2026-09-29) — chantier 65, séance `draft`

| Item (l. 1474) | Résultat |
|---|---|
| Test 1 — `#session/<code>` sur une séance `draft` | ✅ passe : « 🔒 Séance pas encore ouverte », pas de redirection vers l'inscription. |
| Test 2 — `#vote/<code>` directement | ✅ passe : même écran de blocage. |
| Test 2, appel RPC direct (`register_session_member`) | ✅ passe : `400`, `La séance n'est pas en phase d'inscription (phase: draft)` — confirme le blocage **serveur**, pas seulement frontend, sur **dev**. |
| Test 3 — onglet « Créer » de l'accueil | ⚠️ **obsolète** : cet onglet n'existe plus sous cette forme depuis la refonte 73/74/140/143 — l'accueil ne montre plus qu'une liste « Séances en cours » (+ lien externe « Voir tous les débats »). Ma séance `QA141-draft` n'y figure pas (substance du test confirmée), mais le test tel qu'écrit ne peut plus être rejoué littéralement. À reformuler dans une prochaine passe de rédaction d'`A_VERIFIER.md` plutôt qu'à revérifier. |

Séance de test purgée après coup (0 ligne restante).

## Suite (2026-09-29) — chantiers 74, 114, 143, 65 (test 3) et une limite d'outillage

| Item | Résultat |
|---|---|
| Chantier 74, point 1 (modale PhaseIndicator) | ✅ passe (via une table dont `created_by` n'est pas l'appelant — pas de mot de passe). Piège rencontré : une modale de bienvenue plein écran (`debate_welcome_<table.id>`) intercepte le clic sur la pastille tant qu'elle n'est pas fermée — normal en usage réel, source de confusion pour un test automatisé seulement. |
| Chantier 74, point 3 (texte invisible) | ✅ passe (`ModeratorView` via une table dont `created_by` = l'appelant, cf. note méthode ci-dessous) — couleur lue par `getComputedStyle` : `rgb(17,24,39)` sur fond blanc. |
| Chantier 114 (onboarding, « pas définitif ») | ✅ passe — parcours réel d'inscription, texte et sous-libellés conformes. |
| Chantier 143, item « entrée par code de table sans modérateur » | ✅ passe — table `leaderless` de test, un seul champ « Prénom Nom », entrée acceptée sans cocher la case modérateur. |

**Méthode ajoutée pour ce lot — accès `ModeratorView` sans Code Ecclesia** : `TableContext.isModerator` inclut `physicalModerator = (table.created_by === userId)`. En créant une table de test avec `created_by` posé sur l'uid de la session anonyme courante (lu dans `localStorage`, clé `*auth-token*`), on obtient `ModeratorView` sans jamais toucher au Code Ecclesia — c'est le chemin légitime « créateur physique », pas un contournement de sécurité (la vraie création de table, elle, exige le Code Ecclesia ; ici on simule l'état qui en résulterait). **Attention** : l'identité change si `localStorage` est vidé entre deux étapes (nouveau `signInAnonymously`) — vérifier l'uid courant avant de raccrocher `created_by`/`participants.user_id`, sinon l'app retombe silencieusement sur l'accueil (`App.tsx.init()`, comparaison `pRow.user_id === userId`).

**Piste abandonnée (coût/bénéfice)** : tester la fenêtre de vote du chantier 132 en conditions live (modérateur + participant simultanés) demanderait deux identités actives en parallèle. Le Browser pane ne permet qu'une identité par navigateur (`127.0.0.1` injoignable, cf. lot-1 O2 ; changer d'identité sur `localhost` sacrifie la précédente puisque les jetons d'auth anonyme ne sont pas récupérables). Le test SQL déjà en place dans `A_VERIFIER.md` (transaction jetable) reste la seule couverture ; le parcours UI live reste à faire par 141d ou par Jules.

## Classification des lignes 1300-1900 d'`A_VERIFIER.md`

Fait (lecture des titres de section + contenu 1472-1698). Presque tout ce bloc exige le **Code Ecclesia** (chantiers 67, 47, 60, 54, 43/44, 35, section « Parcours Modérateur », « Questionnaire post-débat » points 1-2) ou le mot de passe **superadmin** (section « Parcours Superadmin », 1325-1471, chantiers 33, 38, 50, 54) → **hors 141a**, réparti dans `triage.md` sous 141b/c/d.
Seul le chantier 65 (ci-dessus) était jouable sans mot de passe ; fait.

## Non joué dans ce lot (transmis à 141a si repris, sinon aux sous-chantiers concernés)

- Portes d'entrée du 140 (l. 3095-3098) et idempotence modérateur (l. 3096) : demandent le Code Ecclesia → 141d.
- `add_offline_participant` avec nom déjà assis (l. 3113) : Code Ecclesia → 141d.
- Résultats publics et accueil (l. 1268-1301) : mélange de public et de superadmin (item « liste des séances, tous les champs d'édition » l. 1321 nécessite le mot de passe) → à répartir 141a (partie visiteur) / 141b (partie superadmin) en reprenant.
- Écart C4 (overlay modérateur) et piège D1 (l. 2868, 2870) : C4 demande une table animée avec modérateur (Code Ecclesia) → 141d ; D1 est une approximation faisable sans mot de passe (vidage de session) → 141a si repris.
- Scénarios du chantier 68 (l. 1224-1269, Code Ecclesia) → 141d.
- Lignes 1900-3100 (onboarding 71, entrée modérateur 73, phases hors ligne 74, synchro Realtime 35, nettoyage données de test, chantiers 87/101/108/113/114/117/120/132/138/139/135/140) : **non classées**, à faire en premier à la reprise de 141a ou en tri initial de 141b-d.
