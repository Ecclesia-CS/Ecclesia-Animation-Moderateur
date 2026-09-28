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

## Non joué dans ce lot

- Portes d'entrée du 140 (l. 3095-3098) et idempotence modérateur (l. 3096) : demandent le Code Ecclesia → lot 3.
- `add_offline_participant` avec nom déjà assis (l. 3113), résultats publics et accueil (l. 1268-1301), écart C4 (overlay modérateur) et piège D1 (l. 2868, 2870), scénarios du chantier 68 (Code Ecclesia, remaniés par 107/108/110/140).
- Tri des lignes 1300 à 1900 d'`A_VERIFIER.md` (chantiers 33 à 74, anciens jalons) : toujours à faire.
