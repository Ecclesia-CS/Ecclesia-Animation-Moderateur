# À vérifier

Liste des points nécessitant une validation humaine, générés lors des sessions Claude Code.
Ne pas supprimer une entrée sans validation explicite de Jules — se contenter de la déplacer en section "Validé" une fois confirmée. Si un point semble obsolète, le marquer comme tel plutôt que l'effacer.

> **2026-08-03** — Fichier allégé à la demande de Jules avant une remise à zéro de la mémoire Dispatch : toutes les entrées déjà vérifiées/confirmées (chantiers 1 à 32 et vagues de vérification antérieures) ont été retirées — leur historique complet reste dans l'historique git de ce fichier (`git log -p -- A_VERIFIER.md`).
>
> **Correction 2026-09-01** : les chantiers **33 et 34** avaient été retirés par cet allégement alors qu'ils n'ont **jamais été vérifiés humainement** (33 : uniquement `tsc`/tests/mock réseau ; 34 : uniquement mock réseau via route de debug) — réintégrés ci-dessous, section Superadmin (33) et Participant (34).

## Règle — plus de migration SQL appliquée par une session de chantier (2026-09-01)

Décision de Jules : une session de chantier **n'applique plus jamais de migration SQL elle-même**, qu'elle ait ou non un accès MCP Supabase disponible. Elle **documente ici** le chemin du fichier de migration et ce qu'il change. C'est la **session de vérification dédiée** qui applique le SQL (SQL Editor du dashboard Supabase ou MCP) et qui met à jour l'entrée correspondante (statut "appliquée", résultat du test). Le paragraphe "Accès MCP Supabase" de `CLAUDE.md` qui affirmait un accès direct pour toute session est corrigé en conséquence — voir ce fichier.

## Comment vérifier "tout d'un coup"

Les points sont groupés **par écran/parcours**, pas par chantier, pour permettre une seule passe par écran plutôt que d'aller-retour entre chantiers. Dans l'ordre suggéré :

1. **Migration SQL en attente** (ci-dessous) — à appliquer avant de tester les chantiers 33, 39, 44, 46 et 48.
2. **Résultats publics (chantier 46)** — accueil (bouton + modale), superadmin (pastille par séance), page publique `#results/<id>`.
3. **Superadmin** — onglets Tables, Membres, phase voting.
4. **Participant** — vote/pré-vote, écran "Débat en cours", entrée en débat, résultats de fin de séance.
5. **Modérateur** (`ModeratorView`) — Code Ecclesia + vraie table animée requis. Couvre aussi le chantier 44 ("Ajouter une personne sans téléphone") et la refonte "Outils Modo" (chantier 43).
6. **Questionnaire post-débat** — les trois points d'entrée (table, `#vote/`, `#session/`) et leur déclenchement automatique à la clôture (chantier 39).
7. **Synchronisation temps réel (chantier 35)** — nécessite deux onglets/navigateurs en parallèle, à faire à part.
8. **Nettoyage des données de test** — une fois tout vérifié, purger les tables de QA listées en bas de fichier.

## ⚠️ Migration SQL en attente d'application

- [ ] **Chantier 48 — `supabase/migrations/20260902_chantier48_switch_table.sql`**

  **Contenu du fichier** : crée `switch_table(p_session_id uuid, p_join_code text, p_pseudo text) returns jsonb` — permet à un participant de rejoindre une autre table que celle qui lui a été assignée, depuis `AllocatingScreen`. Vérifie que le code correspond à une table de **cette** séance (sinon exception explicite), que le participant n'est pas déjà à cette table, puis **retire proprement** toute ligne `participants` de l'utilisateur dans les autres tables de la séance (libère le micro/clôt le tour en cours si besoin, même traitement que `kick_participant`) avant d'insérer la nouvelle ligne et de déplacer `table_assignments` via `sync_table_assignment` (déjà existante, chantier 26). Voir l'en-tête du fichier de migration pour le détail du raisonnement (pourquoi une RPC dédiée plutôt que réutiliser `join_table`).

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'switch_table'` retourne la fonction, puis dérouler le test manuel ci-dessous (section Participant). **Avant d'appliquer**, nettoyer si possible les 2 lignes `participants` orphelines laissées dans la table `589D79` par la vérification navigateur de ce chantier (voir section Nettoyage plus bas) — pas strictement nécessaire pour tester, mais ça fausse le compte de présents affiché en `ParticipantView`.

- [ ] **Chantier 46 — `supabase/migrations/20260901_chantier46_public_results_visibility.sql`**

  **Contenu du fichier** :
  1. `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS results_public boolean NOT NULL DEFAULT false` — opt-in explicite par séance, aucune séance existante ne devient publique automatiquement.
  2. `set_session_results_public(password, session_id, results_public)` — RPC superadmin (mot de passe requis) qui bascule la colonne. Utilisée par le nouveau bouton "Résultats publics" / "Résultats privés" sur chaque séance close du superadmin (`SessionCard`, écran de liste).
  3. `get_public_results(session_id)` **remplacé** — durci pour exiger `phase='closed' AND results_public=true` (avant : `phase='closed'` seul, donc *toute* séance close était déjà publique — comportement qui n'avait jamais été demandé). Charge utile changée : au lieu d'un résumé filtré (top-3 assertions par camp + consensus > seuil), retourne désormais la liste complète des assertions approuvées avec leurs compteurs `agree_count`/`disagree_count`/`pass_count`, et le nuage de points PCA (`pca_x`, `pca_y`, `group_id` — **sans** `member_id` ni aucun identifiant, contrairement à `get_results_map` qui est réservée aux membres inscrits). Le fichier de migration contient en pied de page les requêtes SQL de vérification (colonne, séance non-publique → NULL, séance publique → payload sans identifiant, appel anonyme, mauvais mot de passe).

  **Pourquoi cette migration change le comportement de l'existant** : la fonction `get_public_results` existait déjà (chantier antérieur, migration `20260613_public_results.sql`) et rendait **toute** séance close consultable publiquement dès sa clôture — sans bascule de visibilité. Le retour de test de Jules du 2026-09-01 demande explicitement à restreindre l'accès aux séances *explicitement marquées visibles*, pas à tout l'historique clos. Tant que cette migration n'est pas appliquée, l'ancien comportement (tout closed = public) reste actif en base, et l'ancienne forme de payload (`groups`/`consensus`) ne correspond plus à ce qu'attend le frontend (`points`/`assertions`) — voir le point "Résultats publics" ci-dessous pour l'impact exact sur les tests.

  **À faire (session de vérification)** : appliquer le fichier, dérouler les 5 requêtes de vérification en pied de fichier (colonne + défaut, séance non-publique → NULL, séance publique → payload strictement `k_chosen`/`points`/`assertions` sans `member_id`/`user_id`/`pseudo`, appel anonyme fonctionnel, mauvais mot de passe rejeté), puis dérouler le test manuel de la section "Résultats publics (chantier 46)" plus bas.

- [ ] **Chantier 33 — `supabase/migrations/20260801_chantier33_moderator_table_assignment.sql`** (statut d'application non confirmé — aucune trace de vérification post-application dans l'historique, contrairement aux migrations chantier-35 et chantier-37 ci-dessous)

  **Contenu du fichier** : redéfinit `claim_moderator_status(session_id, creation_code, pseudo?)` pour (a) accepter la phase `debating` en plus de `pre_voting`/`voting`/`allocating`, et (b) asseoir automatiquement le nouveau modérateur sur la première table animée encore sans modérateur (ordre des numéros de table) via une nouvelle ligne `table_assignments`. Crée aussi `assign_moderator_to_table(password, session_id, table_number, member_id)` — assignation manuelle superadmin, pose `is_moderator=true` + `table_assignments`.

  **À faire (session de vérification)** : exécuter le contenu du fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname IN ('claim_moderator_status','assign_moderator_to_table')` retourne bien les deux fonctions à jour, puis cocher cette entrée et dérouler le test manuel du chantier 33 ci-dessous (section Superadmin). **Tant qu'elle n'est pas appliquée** : le contrôle d'ajout/retrait de modérateur par table (`AddModeratorControl`) échoue silencieusement côté RPC, et l'auto-assise en phase `debating` reste bloquée par l'ancienne signature de `claim_moderator_status`.

- [ ] **Chantier 39 — `supabase/migrations/20260901_chantier39_remove_questionnaire_phase.sql`** (jamais appliquée)

  **Contenu du fichier** :
  1. `UPDATE sessions SET phase = 'closed', phase_changed_at = now() WHERE phase = 'questionnaire'` — au moment de l'écriture, aucune séance de la base de test n'était dans cet état (vérifié par requête REST anon `select id,title,phase,join_code`), mais la migration doit rester idempotente/défensive pour toute séance réelle qui y serait encore.
  2. Contrainte `sessions_phase_check` réécrite sans `'questionnaire'` (`draft`, `pre_voting`, `voting`, `allocating`, `debating`, `closed`).
  3. `set_session_phase(password, session_id, phase)` réécrite avec la même liste sans `'questionnaire'` — sinon la fonction acceptait toujours l'ancienne valeur alors que le frontend ne l'envoie plus jamais.

  **Pourquoi retirer la phase plutôt que la garder mais inutilisée** : Jules a demandé explicitement la suppression (« on va supprimer cette phase ») — le questionnaire post-débat se déclenche désormais automatiquement à la sortie de `debating` (voir entrée dédiée, section "Questionnaire post-débat" plus bas) au lieu de nécessiter une étape de phase manuelle.

  **À faire (session de vérification)** : exécuter le fichier via le SQL Editor (ou MCP), puis `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sessions_phase_check'` pour confirmer l'absence de `'questionnaire'` dans la définition, et `SELECT count(*) FROM sessions WHERE phase = 'questionnaire'` doit retourner 0. **Tant qu'elle n'est pas appliquée** : si une séance reste dans l'ancienne phase `questionnaire` (aucune trouvée dans la base de test au moment de l'écriture), `SuperadminScreen.tsx` ne la reconnaît plus dans `PHASE_SEQUENCE` (`indexOf` retourne -1) et affiche un `PhaseBar` incohérent (case courante non repérée, bouton suivant pointant vers `draft`) — appliquer la migration avant de rouvrir une telle séance dans le superadmin plutôt que de cliquer les boutons de phase pour la sortir de cet état.

- [ ] **Chantier 44 — `supabase/migrations/20260902_chantier44_add_offline_participant.sql`** (nouvelle fonction, jamais appliquée)

  **Contenu du fichier** : crée `add_offline_participant(p_table_id uuid, p_pseudo text) RETURNS jsonb`, `SECURITY DEFINER`. Garde d'autorisation identique à `kick_participant`/`grant_floor` (`tables.created_by = auth.uid()`). Reprend uniquement le cœur de `join_table` — `INSERT INTO participants (table_id, user_id, pseudo) VALUES (p_table_id, auth.uid(), btrim(p_pseudo)) ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id` — sans jamais appeler `sync_table_assignment` (voir justification détaillée dans l'entrée "Chantier 43/44" du parcours Modérateur ci-dessous : appelé sous l'identité du modérateur, ce mécanisme pollue par erreur `session_members` avec une ligne fantôme). SQL exact :

    ```sql
    CREATE OR REPLACE FUNCTION add_offline_participant(
      p_table_id uuid,
      p_pseudo   text
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_participant_id uuid;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid()
      ) THEN
        RAISE EXCEPTION 'Non autorisé';
      END IF;

      IF p_pseudo IS NULL OR btrim(p_pseudo) = '' THEN
        RAISE EXCEPTION 'Pseudo requis';
      END IF;

      INSERT INTO participants (table_id, user_id, pseudo)
      VALUES (p_table_id, auth.uid(), btrim(p_pseudo))
      ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id INTO v_participant_id;

      RETURN jsonb_build_object('participant_id', v_participant_id);
    END;
    $$;
    ```

  **À faire (session de vérification)** : exécuter ce SQL (fichier ou copié ci-dessus) via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'add_offline_participant'` retourne la fonction, puis cocher cette entrée et dérouler le test du chantier 44 (section Parcours Modérateur, entrée "Chantier 43/44"). **Tant qu'elle n'est pas appliquée** : le bouton "Ajouter une personne sans téléphone" échoue à l'appel RPC (fonction PostgreSQL inexistante — erreur affichée dans le formulaire, rien de silencieux côté UI).

- [ ] **Chantier 51 — `supabase/migrations/20260902_chantier51_hide_assertion_author.sql`** (jamais appliquée) — anonymat réel des auteurs d'assertions

  **⚠️ Point bloquant non tranchable sans accès DB, à vérifier EN PREMIER (avant de considérer ce chantier clos)** : ce correctif retire `member_id` de la lecture REST directe de `assertions`, mais on ne sait pas si Supabase Realtime applique les mêmes privilèges de colonne aux charges utiles `postgres_changes` — si le WebSocket continue de pousser `member_id` dans ses payloads, la fuite subsiste par ce canal et ce correctif est insuffisant à lui seul.
  **Manipulation exacte** : une fois la migration appliquée, dans `src/screens/VoteScreen.tsx` l.365 (`payload => { const a = payload.new as Assertion`), ajouter temporairement `console.log('[chantier51] payload.new', payload.new)` juste après. Recharger `#vote/<join_code>` sur une séance en phase `voting` avec des assertions `pending`, ouvrir la console DevTools du participant, puis côté superadmin approuver une assertion (`approve_assertion`) pour déclencher l'événement UPDATE. Lire l'objet loggé : présence ou non de la clé `member_id`.
  - Si **absent** : le correctif est complet, rien à faire de plus. Retirer le `console.log` et cocher cette entrée.
  - Si **présent** : la fuite passe par le WebSocket — ne pas improviser de correctif côté client. Solution de repli connue : une vue `assertions_public` (sans `member_id`) avec sa propre policy, lue à la place de la table par `VoteScreen.tsx` — chantier distinct à ouvrir. Documenter le résultat ici avant de considérer le chantier 51 clos.

  **Contexte (audit sécurité 2026-08-03, constat B5)** : `assertions_select_approved` (`FOR SELECT USING (status = 'approved')`) filtre les LIGNES mais laisse passer toutes les colonnes, dont `member_id`. Comme `session_members` est lisible publiquement (nom/prénom réels), une simple requête REST anonyme (`GET /rest/v1/assertions?select=member_id,...`) suivie d'une jointure sur `session_members` désanonymise l'auteur de n'importe quelle assertion approuvée — sur des sujets clivants, dans une école où les gens se croisent. Le front est déjà discipliné (`VoteScreen.tsx` liste ses colonnes et exclut `member_id` depuis la migration `20260721_hide_assertion_author.sql`, commentaire "E2 — anonymat des auteurs") mais ce masquage front ne protège pas un appel REST direct.

  **Contenu du fichier** :
  1. `REVOKE SELECT ON assertions FROM anon, authenticated` puis `GRANT SELECT (id, session_id, content, status, created_at) ON assertions TO anon, authenticated` — retire l'accès à la colonne `member_id` en lecture directe, sans toucher la policy de ligne existante. Colonnes de `assertions` vérifiées exhaustivement dans `supabase/migrations/` (créées par `20260528_voting_app.sql`, jamais modifiées depuis) : `id, session_id, member_id, content, status, created_at` — seule `member_id` est retirée, c'est le seul identifiant reliant une assertion à son auteur.
  2. `get_my_assertion_ids(p_session_id uuid) RETURNS uuid[]`, `SECURITY DEFINER` — remplace la requête `VoteScreen.tsx` qui lisait `member_id` dans une clause `WHERE` pour compter "mes propositions" (`proposedCount`) ; un `GRANT SELECT` restreint à certaines colonnes interdit aussi d'utiliser les colonnes non accordées dans `WHERE`, d'où le passage par une RPC (comme tous les autres accès à `assertions` qui touchent `member_id` : `submit_assertion`, `approve_assertion`, etc., déjà `SECURITY DEFINER`, non modifiées ici).

  **Code frontend déjà livré (ne dépend pas de la migration pour compiler/charger)** : `getMyAssertionIds(sessionId)` ajouté dans `src/lib/voting.ts`, appelé depuis `loadVoteData` (`src/screens/VoteScreen.tsx` l.~305-320) à la place de l'ancienne requête `.from('assertions').select('id').eq('member_id', m.id)`, avec un `.catch(() => [])` (même garde que `SuperadminScreen.loadGroups`) pour qu'un échec RPC ne fasse pas rejeter tout le `Promise.all` et bloquer aussi le chargement des assertions/votes. `npx tsc -b` OK. **Tant que la migration n'est pas appliquée**, cet appel RPC échoue silencieusement (`PGRST202` — fonction inexistante, absorbée par le `.catch`) : le compteur "mes propositions" (`proposedCount`) reste à 0 en permanence, mais le reste du flux (liste des assertions, vote, polling) continue de fonctionner normalement — pas de blocage total, juste ce compteur faux tant que la migration n'est pas en place.

  **À faire (session de vérification)** :
  1. Exécuter le fichier via le SQL Editor du dashboard Supabase (ou MCP), confirmer `SELECT proname FROM pg_proc WHERE proname = 'get_my_assertion_ids'` retourne la fonction.
  2. Vérification négative REST (clé anon publique, hors navigateur) :
     - `GET /rest/v1/assertions?select=member_id` → attendu `42501`/403.
     - `GET /rest/v1/assertions?select=id,session_id,content,status,created_at` → doit continuer à fonctionner normalement.
  3. Dérouler le parcours de vote complet (`#vote/<join_code>`, séance `pre_voting` ou `voting`) : liste des assertions, compteur "X / Y votées" cohérent, proposer une assertion et vérifier qu'elle compte bien comme "la mienne" (`proposedCount` — cassé silencieusement avant l'application de la migration, cf. ci-dessus), polling de secours (approuver une assertion côté superadmin → apparition côté participant en moins de 15s), écran "Tu as tout voté", bouton "Voir toutes".
  4. Le point bloquant Realtime en tête de cette section — à faire avant de clore le chantier.

## Résultats publics (chantier 46)

*Nécessite la migration SQL ci-dessus appliquée pour tester le flux de bout en bout (nouvelle colonne `results_public` + nouvelle forme du payload `get_public_results`). Sans elle : le bouton "Résultats publics" du superadmin échoue avec l'erreur Postgres "column sessions.results_public does not exist" (vérifié en navigateur ci-dessous, échec propre — pas de crash) et `get_public_results` renvoie encore l'ancienne forme (`groups`/`consensus`) que le frontend ne lit plus, donc `points`/`assertions` restent vides même pour une séance déjà close.*

- [ ] **2026-09-01 — Bouton "Voir tous les débats" (accueil)** — `src/screens/EntryScreen.tsx`

  Lien externe vers `https://ecclesia-centralesupelec.vercel.app/#debats` (site public Ecclesia, hébergé à part sur Vercel), `target="_blank" rel="noopener noreferrer"`. Placé en pied de carte d'accueil, au-dessus du lien "Administration".

  **Déjà vérifié en navigateur** : présent sur l'écran d'accueil, `href`/`target`/`rel` corrects (lu via le DOM), zéro erreur console au chargement de l'écran.

  **Non vérifiable en session headless** : l'ouverture réelle d'un nouvel onglet vers un domaine externe (Vercel) n'a pas été cliquée pour de vrai — seuls les attributs du lien ont été inspectés.

- [ ] **2026-09-01 — Modale "Anciennes séances" (accueil)** — `src/screens/EntryScreen.tsx` (`PastSessionsModal`)

  Bouton "Voir les votes des anciennes séances" en pied de carte d'accueil → modale listant les séances `phase='closed' AND results_public=true` (titre, date, description), triées par date décroissante. Clic sur une séance → `#results/<id>` (nouvelle route directe par id, pas de join_code — un `join_code` de séance close peut être réutilisé par une séance non-close plus récente, donc le routage par id évite toute ambiguïté).

  **Déjà vérifié en navigateur (avant migration)** : la modale s'ouvre, affiche "Anciennes séances" avec bouton de fermeture, la requête échoue proprement avec le message Postgres explicite affiché à l'écran ("column sessions.results_public does not exist") — pas de page blanche, pas d'exception React non gérée. Fermeture de la modale (✕) fonctionne.

  **Test minimal (après migration)** : au moins une séance `closed` avec `results_public=true` créée par la session de vérification (via le nouveau bouton superadmin ci-dessous) → vérifier son apparition dans la liste, triée correctement si plusieurs. Cliquer dessus → arrivée sur `#results/<id>` (voir section dédiée ci-dessous). Vérifier aussi le cas vide ("Aucune séance aux résultats publics pour l'instant.") si aucune séance n'est encore marquée visible.

- [ ] **2026-09-01 — Bouton "Résultats publics" par séance (superadmin)** — `src/screens/SuperadminScreen.tsx` (`SessionCard`)

  Sur chaque séance `closed` de la liste superadmin (écran de liste, avant d'ouvrir le détail) : pastille bascule "Résultats privés" (gris) / "Résultats publics" (vert) à côté de la description. Appelle `set_session_results_public` (mot de passe déjà en session), mise à jour optimiste de la liste avec rollback si l'appel échoue (message d'erreur affiché sous la pastille). Nommage tranché sans consulter Jules davantage : "Résultats publics" plutôt que sa proposition "Visible post débat" — le libellé décrit l'effet (qui peut voir quoi) plutôt que le moment (déjà capturé par le badge de phase "Clôturée" juste au-dessus), cohérent avec le style des autres badges d'état de la carte.

  **Non testable en session headless** : aucun mot de passe superadmin disponible. Uniquement vérifié : `tsc -b`, `npm test` (94 passants), `npm run build`, chargement de l'écran d'accueil sans erreur console. Le comportement d'échec pré-migration (colonne absente) a été vérifié indirectement via la modale "Anciennes séances" ci-dessus, qui tape la même colonne.

  **Test minimal (mot de passe superadmin requis, migration appliquée au préalable)** : ouvrir une séance close depuis la liste, cliquer la pastille → passe à "Résultats publics" sans reload ; recharger la page → l'état persiste (relu depuis `sessions.results_public`) ; cliquer à nouveau → repasse à "Résultats privés". Vérifier qu'aucune pastille n'apparaît sur les séances non closes.

- [ ] **2026-09-01 — Page de résultats publics** — `src/screens/PublicResultsScreen.tsx`, routes `#results/<session_id>` et `#session/<join_code>` (phase closed, visiteur non inscrit)

  Page unique : nuage de points PCA anonyme (aucun `member_id`, mêmes couleurs/légende que l'onglet Analyse du superadmin) si une analyse existe, puis liste complète des assertions approuvées avec barre agree/disagree/pass et compteurs. Accessible sans connexion (auth anonyme uniquement). Aucune table, aucun pseudo, aucun découpage par table de débat — vérifié en lisant le payload exact retourné par `get_public_results` (voir requêtes de vérification dans le fichier de migration) : seulement `k_chosen`, `points[].{pca_x,pca_y,group_id}`, `assertions[].{content,agree_count,disagree_count,pass_count}`.

  **Déjà vérifié en navigateur (avant migration)** : `#results/<uuid inexistant>` → "Séance introuvable." affiché proprement (pas de crash), zéro exception React. `#results/<id>` sans `session` prop résout bien la séance par id avant de charger les résultats (chemin de code distinct de l'usage existant via `SessionRouterScreen`, qui passe toujours `session` directement).

  **Non testable avant migration** : le rendu réel avec des données (nuage de points + assertions) — la fonction `get_public_results` encore déployée renvoie l'ancienne forme (`groups`/`consensus`), donc `data.points`/`data.assertions` restent vides même pour une séance close existante avec `results_public` inexistant en base.

  **Test minimal (après migration, mot de passe superadmin pour préparer une séance de test)** : séance close avec au moins une analyse d'opinion lancée et quelques assertions votées → marquer `results_public=true` (bouton superadmin ci-dessus) → ouvrir `#results/<id>` (via la modale accueil) et `#session/<join_code>` (si le join_code est encore d'actualité) en visiteur non connecté (nouvel onglet privé / navigateur non inscrit à la séance) → vérifier l'affichage du nuage de points, des assertions avec compteurs, l'absence totale de nom/pseudo/table à l'écran, zéro erreur console. Démarquer `results_public=false` → revérifier que la page affiche "non disponibles publiquement" (le RPC renvoie NULL).

## Parcours Superadmin

- [ ] **2026-09-01 — Chantier 38 (2ème passe) — scroll qui remonte en haut sur la fiche séance** — `src/screens/SuperadminScreen.tsx` (`SessionDetail`)

  **Retour de Jules** : « toutes les 10 secondes ou moins » l'écran superadmin « nous remmène en haut de la page » — constaté sans aucune session Claude Code active, sur tous les onglets superadmin (🟢 En direct / 🪑 Tables / ⚙️ Préparation / 📊 Analyse), sans clignotement visible. Ce retour infirme l'hypothèse Vite HMR retenue par la 1ère passe (voir "Historique / notes de session" plus bas) — diagnostic repris de zéro.

  **Cause trouvée** : `SessionDetail` a un seul état `loading` (posé par `load()`, la fonction qui charge "Tables rattachées"/"Tables disponibles" — polling 15 s depuis le chantier 35, + rappelée par le channel Realtime `tables` sur tout événement, + par tout changement de filtre de date). Ce `loading` gate **tout le contenu de la fiche séance** (ligne ~2064 : `{loading ? <Chargement…/> : <>…tous les onglets…</>}`), pas seulement la section des tables. À chaque déclenchement — donc au minimum toutes les 15 s, parfois plus souvent via Realtime — la totalité du contenu affiché (quel que soit l'onglet actif) est remplacée par un petit spinner le temps de l'appel réseau, ce qui effondre la hauteur du document ; le navigateur clampe alors `scrollY` à la nouvelle hauteur (beaucoup plus faible), et **ne restaure jamais** la position de scroll quand le contenu revient. D'où : ça touche tous les onglets (le gate est en dehors du switch d'onglet), ça n'a besoin d'aucune session Claude Code (bug 100 % applicatif, indépendant du HMR), et ça ne "clignote" pas franchement (le spinner est bref, ce qui se voit surtout c'est le saut de scroll).

  **Reproduit concrètement** (Browser pane, mock `fetch` sans mot de passe réel, même technique que les passes précédentes) : scroll à 893px sur une fiche mockée, clic sur un filtre de date (déclenche `load()` avec 900ms de latence simulée) → `scrollHeight` s'effondre de 993 à 563 **et `scrollY` est immédiatement clampé de 893 à 563** ; ~1.6s plus tard le contenu revient (`scrollHeight` remonte à 993) mais `scrollY` reste bloqué à 563 — jamais restauré. Instrumentation : `MutationObserver` + lecture de `window.scrollY`/`document.documentElement.scrollHeight` avant/après clic.

  **Correctif appliqué** : `load()` ne pose `setLoading(true)` (donc n'affiche le spinner plein écran) que lors du **tout premier** chargement (`hasLoadedTablesRef`, un `useRef`) — plus jamais sur un rafraîchissement de fond (polling 15s, Realtime, changement de filtre). Les données de "Tables rattachées"/"Tables disponibles" continuent de se mettre à jour en place, sans jamais vider le reste de la fiche séance ni changer la hauteur du document. Un seul changement de comportement assumé : changer le filtre de date ("Tout afficher"/"Depuis…") ne montre plus de spinner plein écran non plus — juste une mise à jour silencieuse de la liste, strictement mieux pour le même problème.

  **Déjà vérifié par moi** : `npx tsc -b` / `npm run build` / `npm test` (184/186, 2 skip préexistants) OK. Reproduction Browser pane confirmée **avant** correctif (voir ci-dessus) puis **absence totale** de collapse/clamp après correctif, sur le même scénario exact (`scrollY` et `scrollHeight` inchangés pendant tout le rafraîchissement, zéro mutation DOM observée). Zéro erreur console imputable au correctif (un warning `validateDOMNesting` pré-existant et sans rapport dans `AnalysisPanel` — bouton imbriqué dans un bouton — reste présent, non traité ici, voir entrée séparée ci-dessous si besoin).

  **Reste à vérifier par Jules en conditions réelles** : ouvrir une séance avec du contenu réel (plusieurs tables, participants, assertions), scroller loin dans la page, laisser tourner ≥ 30-40 s sans toucher au clavier/souris → la page ne doit plus jamais remonter toute seule, sur aucun des 4 onglets. Si le symptôme persiste malgré ce correctif, il reste un canal Realtime supplémentaire à investiguer (le channel `session-tables:<id>` ci-dessus a pu masquer une deuxième cause si Realtime déclenchait `load()` bien plus souvent que 15 s en usage réel — à confirmer avec le compteur d'appels réseau du vrai navigateur, impossible à observer sans données réelles).

- [ ] **2026-08-01 — Chantier 33 — gestion des modérateurs par table** — `SuperadminScreen.tsx`, `AddModeratorControl`, onglet 🪑 Tables *(migration SQL requise, voir ci-dessus)*

  **Livré (4 points)** :
  1. Accordéon "Allocation des tables" déplacé de l'onglet 🟢 En direct vers l'onglet 🪑 Tables.
  2. Sur chaque table animée en attente de modérateur (⏳) : nouveau contrôle `AddModeratorControl` — glisser-déposer d'un `DraggableMemberChip` existant sur la zone droppable, **et** un champ avec autocomplete sur les pseudos inscrits à la séance. Les deux appellent `assign_moderator_to_table`. Bouton "Retirer" symétrique (réutilise `set_member_moderator(..., false)`).
  3. `claim_moderator_status` (self-déclaration, onglet 🎙️ Modérateur de l'accueil) auto-assied désormais sur la première table animée encore sans modérateur.
  4. `claim_moderator_status` accepte la phase `debating` en plus de `pre_voting`/`voting`/`allocating`.

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test`, tous OK) : le filtre de phase `EntryScreen` (`phase=in.(pre_voting,voting,allocating,debating)`) confirmé par interception réseau + rendu mocké. **Rien d'autre n'a pu être testé en conditions réelles** (mot de passe superadmin non détenu par la session d'origine).

  **Test minimal** (mot de passe superadmin requis, migration SQL appliquée au préalable) :
  1. Onglet ⚙️ Préparation → vérifier que "Allocation des tables" n'y est plus ; onglet 🪑 Tables → vérifier qu'il apparaît en haut, au-dessus de "Groupes".
  2. Séance en `allocating` avec ≥ 1 table animée sans modérateur assis : vérifier l'apparition du contrôle ⏳ (zone de drop + champ de recherche). Glisser un `DraggableMemberChip` dessus → badge "🎙️ Modérateur : <pseudo>" apparaît, la personne disparaît de son ancienne table si elle était ailleurs. Taper un nom existant → "➕ Ajouter" → même vérification. Taper un nom inexistant → message d'erreur, aucun appel réseau raté silencieusement.
  3. Cliquer "Retirer" à côté d'un modérateur assis → il redevient participant ordinaire de la même table (le contrôle ⏳ réapparaît).
  4. Nouveau participant, onglet 🎙️ Modérateur de l'accueil, séance `allocating` avec ≥ 1 table en attente → vérifier l'assise directe sans intervention superadmin (Realtime ou polling 5s dans `AllocatingScreen`).
  5. Même test que 4 mais séance en `debating` → vérifier aussi que le join direct par numéro de table (`JoinTableForm`/`SessionRouterScreen`, statut `debating_no_member`) fonctionne toujours.

  **Hypothèse non tranchée avec Jules** : quand plusieurs tables attendent un modérateur, l'auto-attachement choisit toujours la première dans l'ordre des numéros — comportement arbitraire assumé, à confirmer si un autre ordre était attendu.

- [ ] **Chantier 37 — Point 1 : bouton "Répartir en tables" retiré (phase voting)**
  Mergé sur `main` (`cf7083d`), aucune migration.

  **Test minimal** : séance en phase `voting`, superadmin → vérifier l'absence du bouton "Répartir en tables". Avec le toggle "Fusionner auto en fin de vote" (`ai_auto_merge_<id>`) activé, faire passer la séance en `allocating` → vérifier que la fusion IA s'est bien déclenchée (log `LLMModerationPanel`), puisque c'est désormais ce passage de phase qui la déclenche (au lieu du bouton supprimé).

- [ ] **Chantier 37 — Point 2 : bug de réassignation modérateur (onglet Membres)**
  Mergé sur `main` (`cf7083d`). Migration `supabase/migrations/20260803_chantier37_set_member_moderator_seat.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`set_member_moderator` confirmée contenir la logique de placement) — seul le test manuel ci-dessous reste à faire.

  **Test minimal** : séance avec ≥ 2 tables animées, une avec modérateur déjà assis, une sans. Onglet Membres → cocher "modérateur" sur quelqu'un assis à la table déjà pourvue → vérifier dans l'onglet Tables qu'il apparaît maintenant assis (déplacé) sur la table sans modérateur.

- [ ] **Chantier 36 — Point 1 : modérateur affiché en double (onglet 🪑 Tables)**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Test minimal** (mot de passe superadmin requis) : séance `allocating`/`debating` avec une table animée dont le modérateur est déjà assis → vérifier l'absence de doublon (badge "🎙️ Modérateur : X" seul, plus jamais aussi en puce glissable ordinaire dans la liste des membres en dessous). Cas modérateur en surplus (assis ailleurs comme participant ordinaire, chantier 25b) → vérifier qu'il n'apparaît que dans son propre badge, jamais en puce.

  → Bon moment pour vérifier **en même temps** le chantier 33 ci-dessus (même onglet Tables).

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet superadmin)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas — nécessite deux onglets/navigateurs en parallèle, regroupée à part pour ne pas la faire deux fois.

- [ ] **2026-09-01 — Chantier 39 — renommage "Phase 0" + suppression de la phase `questionnaire`** — `SuperadminScreen.tsx` (`PHASE_LABEL`, `PHASE_SEQUENCE_LABELS`, `PhaseBar`, `handlePhaseChange`) *(migration SQL requise, voir ci-dessus — mais le comportement décrit ici ne dépend pas de son application, seule la définition de `sessions_phase_check`/`set_session_phase` en base en dépend)*

  **Livré (3 points)** :
  1. Le badge de phase et le `PhaseBar` de la fiche séance affichent **"Phase 0"** au lieu de "Brouillon" pour la phase `draft`.
  2. Numérotation des cercles du `PhaseBar` alignée sur la nomenclature participant (voir section dédiée CLAUDE.md « Nomenclature des phases côté participant ») : `draft`=0, `pre_voting`=1, `voting`=2, `allocating`=3, `debating`=4, `closed`=5 — au lieu de 1..6 précédemment (`{i}` au lieu de `{i + 1}`).
  3. La phase `questionnaire` a disparu du `PhaseBar` (6 cercles au lieu de 7) et de `PHASE_SEQUENCE`. Le passage manuel `debating → closed` déclenche désormais automatiquement `force_session_questionnaire` (avant : nécessitait de cliquer "Passer en Questionnaire" comme étape intermédiaire). Le bouton "Forcer questionnaire" manuel de l'accordéon "Actions post-séance" reste inchangé et disponible à tout moment (chantier 45), indépendamment de ce déclenchement automatique.

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test` — 94 tests, tous OK ; aucune régression sur `allocation.ts`, non modifié). Session sans mot de passe superadmin — **le rendu réel du `PhaseBar` et le déclenchement de `handlePhaseChange` n'ont pas pu être exercés en navigateur.**

  **Test minimal** (mot de passe superadmin requis) :
  1. Ouvrir une séance en `draft` → vérifier le badge "Phase 0" (liste des séances ET fiche séance) et le cercle "0" (pas "1") dans le `PhaseBar`.
  2. Dérouler les phases une par une → vérifier la numérotation 0,1,2,3,4,5 sur les 6 cercles (pas de 7ᵉ cercle "Questionnaire").
  3. Séance en `debating` avec ≥ 1 participant connecté à une table de la séance → cliquer "Passer en Clôturée" → vérifier dans les secondes qui suivent que le modal questionnaire s'ouvre chez ce participant (`ParticipantView`, `table.questionnaire_forced_at` mis à jour) **sans** être passé par une phase intermédiaire — et que le bouton manuel "Forcer questionnaire"/"Annuler forçage" de l'accordéon "Actions post-séance" reflète bien l'état forcé (`isQForced=true`).
  4. Vérifier qu'aucun bouton "Passer en Questionnaire" n'apparaît plus nulle part dans le `PhaseBar`.

## Parcours Participant

- [ ] **2026-09-02 — Chantier 48 — « Je veux rejoindre une autre table »** — `src/components/voting/TableAssignmentCard.tsx`, `src/screens/AllocatingScreen.tsx`, migration `switch_table` *(voir « Migration SQL en attente » ci-dessus — le test complet de bascule réelle n'est possible qu'une fois appliquée)*

  **Retour de Jules** : « Dans l'écran qui nous annonce notre table, il faut un bouton : je veux rejoindre une autre table. […] Il faut un message pour lui dire de demander à son ami dans la nouvelle table, ou au modérateur de la nouvelle table, de lui donner le code de la table. »

  **Livré** : sur `AllocatingScreen` (l'écran "Vote terminé ! / Tu es à la Table N"), en phase `debating`, un lien "Je veux rejoindre une autre table" sous le bouton "Accéder à la table →". Au clic : petit formulaire avec le message d'aide demandé par Jules ("Demande le code à 6 caractères de la table visée à un ami déjà installé là-bas, ou à son modérateur") et un champ de code à 6 caractères, réutilisant le même mécanisme que les join codes existants — aucun second système créé.

  **Gestion des cas limites** (répond aux points soulevés dans le dispatch de ce chantier) :
  - **Code identique à la table déjà assignée** : bloqué **côté client**, sans appel réseau (`Tu es déjà à cette table.`) — vérifié en navigateur, `read_network_requests` confirme zéro requête.
  - **Code invalide** : `switch_table` lève `Aucune table ne correspond à ce code.` — non vérifié en conditions réelles (migration non appliquée), mais message écrit et testé par lecture de code.
  - **Code d'une table d'une autre séance** : `switch_table` compare `tables.session_id` à la séance courante et lève `Ce code correspond à une table d'une autre séance.` avant tout effet de bord — idem, à vérifier une fois la migration appliquée.
  - **Appartenance à l'ancienne table** : `switch_table` retire la/les ligne(s) `participants` de l'utilisateur dans les autres tables de la séance avant d'insérer la nouvelle (jamais dans les deux à la fois). Nécessaire car `leaveTable()` (bouton "Quitter" côté participant) **ne supprime jamais** la ligne `participants` en base — seulement le cache local (`tableStore.clear()`) — un fait **confirmé en conditions réelles** pendant la vérification de ce chantier (voir "Déjà vérifié" ci-dessous et la section Nettoyage).

  **Arbitrage produit laissé ouvert par Jules, tranché par défaut faute de réponse** : le déplacement est **libre** — aucune limite de place, aucune restriction aux tables non modérées. Recherché dans le code : rien dans `src/lib/allocation.ts` (non modifié, hors périmètre de ce chantier) ni ailleurs ne contraint la composition d'une table après l'allocation initiale — la seule contrainte existante est calculée **une fois**, au moment de `apply_allocation`. Conséquence assumée : un participant qui change de table de son propre chef peut défaire l'équilibre idéologique/répartition des anciens/taille de table calculé par l'algorithme, sans aucun garde-fou. À trancher avec Jules si ça pose problème en pratique (ex : limite de place par table, ou blocage des tables déjà équilibrées) — pas anticipé ici pour ne pas complexifier une fonctionnalité qu'il a demandée simple.

  **Déjà vérifié en navigateur réel** (séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)", table `589D79`, deux identités de test "TestChantier48A" et "TestChantier48B") : bouton absent tant qu'on n'est pas en phase `debating` (code inchangé par rapport à l'existant, non re-testé isolément) ; visible et fonctionnel une fois sur `AllocatingScreen` avec une vraie affectation (`table_assignments` réelle, join_code réel `589D79`) ; formulaire s'ouvre/se ferme (bouton "Annuler") sans effet de bord ; garde côté client sur le code déjà assigné confirmée (voir ci-dessus) ; soumission d'un code différent mais réel de la même séance (`6ABDC9`) déclenche bien `switch_table(p_join_code, p_pseudo, p_session_id)` avec les bons paramètres — Postgrest répond proprement `Could not find the function public.switch_table(...)` puisque la migration n'est pas appliquée, affiché en rouge dans le formulaire sans crash, bouton réactivé ensuite. Zéro erreur console au-delà de ce 404 attendu (confirmé par `read_console_messages`). En reproduisant le parcours de Jules (rejoindre → Quitter → revenir sur `AllocatingScreen`), le problème de ligne `participants` orpheline visé par ce chantier a été **observé réellement**, pas seulement supposé : "TestChantier48A" reste listé comme présent de la table `589D79` après être passé par "Quitter", sans avoir jamais rejoint aucune autre table entre-temps.

  **Non testable cette session** (migration non appliquée, voir ci-dessus) : le succès réel d'une bascule (nouvelle ligne `participants` créée, ancienne(s) supprimée(s), `table_assignments` déplacé, arrivée directe en `ParticipantView`/`ModeratorView` de la nouvelle table) et les deux messages d'erreur serveur (code invalide, autre séance).

  **Test minimal restant** (après application de la migration) :
  1. Un membre avec une table assignée réelle, en phase `debating`, sur `AllocatingScreen` → cliquer "Je veux rejoindre une autre table" → code d'une **vraie** table de la même séance → vérifier l'arrivée directe dans la nouvelle table (`ParticipantView`/`ModeratorView` selon le cas), et que l'ancienne table ne le liste plus dans ses présents.
  2. Même parcours avec un code inexistant → vérifier le message "Aucune table ne correspond à ce code." sans navigation.
  3. Même parcours avec le code d'une table réelle mais d'une **autre** séance → vérifier "Ce code correspond à une table d'une autre séance."
  4. Vérifier dans l'onglet 🪑 Tables du superadmin que `table_assignments` reflète bien la nouvelle table après la bascule (pas les deux).

- [ ] **2026-08-01 — Chantier 34 — carte "Votre groupe" affichée à tort pour les non-votants** — `src/screens/ResultsMapScreen.tsx`

  **Bug** : sur l'écran de résultats de fin de séance (`ResultsMapScreen`, `#session/<join_code>` en phase `closed`, membre inscrit), la carte "Votre groupe" s'affichait dès que `assignment != null` — or `table_assignments` inclut tous les présents, votants ou non. Un membre inscrit mais n'ayant jamais voté a un `assignment` mais aucun point dans l'analyse PCA → `selfGroupId` reste `null` → il tombait sur "L'organisateur n'a pas encore nommé les groupes.", un texte qui n'a de sens que pour un vrai camp pas encore nommé.

  **Correctif** : condition d'affichage passée de `assignment != null` à `assignment != null && selfGroupId !== null`. Trois cas attendus :
  - Jamais voté → `selfGroupId === null` → carte "Votre groupe" totalement absente.
  - Voté, camp pas encore nommé → carte affichée avec "Camp pas encore nommé" (titre porté par le chantier 30/J6, fusionné sans conflit avec ce correctif).
  - Voté, camp nommé → nom/description du camp affichés normalement.

  **Déjà vérifié** : uniquement via une route de debug temporaire (`#debug-results-map`) + mock de `window.fetch` sur les 3 RPC consommées (`get_my_table_assignment`, `get_results_map`, `get_vote_results`), retirée avant commit. Les 3 rendus correspondent à la spec, zéro erreur console. **Jamais testé contre une vraie séance Supabase.**

  **Test minimal** (nécessite une séance `closed` avec un mix membre votant / membre non-votant — mot de passe superadmin pour créer/clôturer la séance de test, ou une vraie séance passée qui a ce mix) : membre n'ayant jamais voté → `#session/<join_code>` → vérifier l'absence totale de la carte "Votre groupe" (reste de la page — scatter, autres camps, consensus/clivage — inchangé). Membre ayant voté, camp pas encore nommé par Gemini → carte présente avec "Camp pas encore nommé". Membre ayant voté, camp nommé → nom/description corrects.

- [ ] **Chantier 36 — Point 2 : case "Je suis modérateur" sur l'écran "Débat en cours"**
  Mergé sur `main` (`0c98775`), aucune migration.

  **Comportement attendu** : écran "Débat en cours" (accessible via "Séances en cours" → "Rejoindre →" sur une séance `debating`) : cocher "Je suis modérateur de cette table" révèle un champ "Code Ecclesia" ; la soumission doit amener en `ModeratorView` (pas `ParticipantView`) sur la table dont le code a été saisi.

  **Hypothèse non tranchée avec Jules** : ce point réutilise `reclaim_moderator` (rejoint *la table dont le code a été saisi*) plutôt que `claim_moderator_status` (auto-assise sur la première table animée en attente, chantier 33). Si le comportement attendu était plutôt ce second mécanisme, c'est un choix différent à trancher.

  **Test minimal** : "Séances en cours" → "Rejoindre →" sur une séance `debating`, compte n'ayant jamais rejoint cette séance → cocher la case, code de table réel + Code Ecclesia réel → vérifier l'arrivée en `ModeratorView`.

- [ ] **2026-09-01 — Chantier 40 — ordre des modales d'entrée en débat** — `src/screens/ParticipantView.tsx`, `src/components/DebateRulesModal.tsx`

  Retour de Jules : à l'entrée en débat, les deux modales successives ("Bienvenue dans le débat" puis les règles) n'étaient pas clairement présentées comme une séquence voulue. Trois changements purement front, aucune logique de phase touchée :
  1. Ordre inversé : "Bienvenue dans le débat" s'affiche désormais **avant** les règles.
  2. Titre de la 2ᵉ modale changé de "Règles du débat" à "Règles d'Ecclesia lors des débats".
  3. Bouton bleu de la 1ʳᵉ modale changé de "C'est parti ! →" à "Lire les règles de débat Ecclesia →".

  **Déjà vérifié en navigateur** (table `leaderless` de test, séance partagée "Test manuel — Vote & bascule modérateur") : parcours complet accueil → "Bienvenue dans le débat" (nouveau texte de bouton) → clic → modale règles (nouveau titre) → "J'ai lu" → retour vue débat normale, aucune 3ᵉ modale. Rechargement de page : les deux `localStorage` (`debate_welcome_<id>`, `debate_rules_read_<id>`) empêchent bien toute réapparition. Zéro erreur console.

  **Non testé** : rendu sur une table non-`leaderless` (avec modérateur) — risque de régression jugé nul, la logique ne dépend pas de `leaderless` ; parcours mobile réel (uniquement viewport desktop testé).

  **Test minimal** : reproduire le parcours ci-dessus sur une table **avec modérateur** (pas seulement leaderless), et sur mobile (`resize_window` ou vrai appareil) pour couvrir les deux angles non testés.

- [ ] **2026-09-01 — Chantier 42 — notes participant perdues (retour de test Jules)** — `src/components/NotesModal.tsx`

  **Cause identifiée** : les 3 chemins de fermeture de la modale (croix, clic hors modale, Échap) appelaient `onClose()` sans vider le debounce de 800ms qui déclenche l'écriture en base (`saveNote`). Fermer puis rouvrir juste après une frappe pouvait recharger la base *avant* que l'écriture différée n'ait abouti → la note paraissait perdue (course, pas une perte réelle). Risque aggravant identifié en même temps : au premier enregistrement, deux écritures concurrentes pouvaient se percuter sur la contrainte unique partielle `(session_id, user_id)` / `(table_id, user_id)` de `private_notes`.

  **Correctif appliqué** : `handleClose()` vide et exécute immédiatement le debounce en attente (`await saveNote(...)`) avant d'appeler `onClose()`, sur les 3 chemins de fermeture.

  **Déjà vérifié en navigateur** : frappe dans l'éditeur → fermeture ~200ms après la frappe → réouverture ~150ms après la fermeture → contenu bien présent au rechargement. Zéro erreur console, zéro message "Erreur :" affiché dans la modale.

  **Point non couvert par ce correctif — à vérifier humainement** : la fermeture *dure* du navigateur/onglet (pas la modale) pendant l'écriture différée — le flush est déclenché par `onClose()` React, qui ne s'exécute pas si l'onglet/la page est fermé(e) avant. Reste une perte possible dans ce cas précis (`beforeunload`/`pagehide` non gérés) — scénario différent de celui rapporté par Jules ("écrit, fermé, rouvert" la modale, pas l'onglet), donc hors scope du fix. À évaluer si ça revient.

  **Test minimal** : reproduire le scénario original de Jules (écrire une note, fermer, rouvrir rapidement) sur `NotesModal` en phase vote et en phase débat (table rattachée à une séance, notes partagées vote→débat). Optionnel : tester le cas non couvert (fermeture d'onglet pendant l'écriture) pour évaluer si ça vaut la peine de gérer `beforeunload`.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet participant)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

- [ ] **2026-09-01 — Chantier 39 — repère de phase participant (`PhaseIndicator`)** — `src/components/PhaseIndicator.tsx`, `src/lib/phaseLabels.ts`, `VoteScreen.tsx`, `AllocatingScreen.tsx`, `ParticipantView.tsx`, `ResultsMapScreen.tsx`, `SessionQuestionnaireForm.tsx`

  **Livré** : pastille "Étape N · Libellé" affichée tout au long du parcours participant — 1 Distanciel (`pre_voting`), 2 Vote en présentiel (`voting`), 3 Allocation (`allocating`), 4 Débat (`debating`), 5 Post-débat (`closed`). Absente en phase `draft` (jamais vue par un participant) et dans `PublicResultsScreen`/`ModeratorView` (hors périmètre). Rendu flottant façon `QuitLink` (coin opposé, en haut à droite) sur les écrans sans en-tête propre (pseudo, onboarding, attente, reconquête de code, confirmation de présence, questionnaire) ; rendu inline dans l'en-tête existant sur les écrans qui en ont un (`VoteScreen` étape vote, `AllocatingScreen`, `ParticipantView`, `ResultsMapScreen`).

  **Déjà vérifié en navigateur** (séance de test réelle "Esai 24/08", phase `draft`, inscription avec pseudo "Chantier39 Verif") : étapes pseudo → onboarding (Question 1/3) → aucune pastille affichée nulle part, conforme (phase `draft` = pas de numéro participant), zéro erreur console. **Non testé faute d'accès superadmin pour faire avancer une séance de test à travers les phases** : l'apparition réelle de la pastille elle-même (1 à 5) sur `pre_voting`/`voting`/`allocating`/`debating`/`closed`, ainsi que son intégration visuelle dans les en-têtes de `VoteScreen` (étape vote)/`AllocatingScreen`/`ParticipantView`/`ResultsMapScreen` (collision potentielle avec les boutons existants, notamment le header dense de `VoteScreen` en phase vote).

  **Test minimal** (mot de passe superadmin requis pour faire avancer une séance de test) : dérouler pre_voting → voting → allocating → debating → closed avec un même compte participant, vérifier à chaque étape le texte et le numéro corrects, l'absence de chevauchement avec les boutons de header (`Quitter`/`Outils`/`Proposer` en phase vote, `Devenir modérateur`/`Outils`/`Quitter` dans `ParticipantView`), et la disparition complète en phase `draft`. Vérifier aussi l'apparition dans `SessionQuestionnaireForm` (voir entrée dédiée ci-dessous, section "Questionnaire post-débat").
- [ ] **2026-09-02 — Chantier 47 — déclaration modérateur "à l'heure" + créer une table depuis le vote** — nouveau `src/components/voting/ModeratorAccessPanel.tsx`, branché dans `src/screens/VoteScreen.tsx` (header, étape `vote`)

  **Contexte / retour de Jules** : depuis "Séances en cours" → clic sur une séance, on arrive dans `VoteScreen`. Le bouton pour se déclarer modérateur "en retard" (séance déjà en `debating`, via `JoinTableForm`/`reclaim_moderator`, écran "Débat en cours") existait déjà. Manquait le cas "à l'heure" : se déclarer modérateur pendant `pre_voting`, `voting` ou `allocating` — ces trois phases correspondent toutes à l'étape `vote` de `VoteScreen` (seule `debating` bascule vers un autre écran). Une fois modérateur, accès à un bouton "Créer une table" dans la séance.

  **Ce qui a été fait** (2 volets, aucune nouvelle RPC — réutilise l'existant à l'identique) :
  1. **Se déclarer modérateur** : bouton "🎙️ Je suis modérateur" à côté du pseudo, visible tant que `member.is_moderator` est faux. Ouvre une modale avec un seul champ "Code Ecclesia" → appelle `claimModeratorStatus(session.id, password, member.pseudo)` (`lib/voting.ts`, déjà utilisée par l'onglet 🎙️ Modérateur de l'accueil pour le même mot de passe et la même RPC `claim_moderator_status`). Succès → `member` mis à jour localement (`setMember`), le badge existant "🎙️ Vous êtes modérateur" apparaît.
  2. **Créer une table** : une fois `member.is_moderator` vrai, le bouton devient "➕ Créer une table". Ouvre une modale (pseudo préempli + Code Ecclesia) → appelle directement `supabase.rpc('create_table', { p_pseudo, p_creation_code, p_session_id: session.id, p_leaderless: false })` (même RPC que l'onglet "Créer" de l'accueil, sans repasser par un écran de sélection de séance puisqu'elle est déjà connue). Succès → `tableStore.set(...)` + `onTableJoined(tableId, participantId, true)`, navigation directe vers `ModeratorView` sur la nouvelle table (même pattern que `JoinTableForm` plus bas dans ce fichier).

  **Mot de passe** : un seul, le Code Ecclesia (`app_config.creation_code_hash`) — le même que partout ailleurs dans l'app (création de table, reprise de modération, onglet Modérateur de l'accueil). Aucun mot de passe en dur, aucun second mécanisme introduit.

  **Aucune migration SQL** : `claim_moderator_status(p_session_id, p_creation_code, p_pseudo)` et `create_table(p_pseudo, p_creation_code, p_session_id, p_leaderless)` existent déjà en base avec exactement cette signature — confirmé par appel direct des deux RPC via `fetch` (mot de passe volontairement faux, aucune donnée modifiée) : les deux renvoient l'erreur serveur attendue (`"Code Ecclesia invalide"` / `"Code de création invalide"`) plutôt qu'une erreur de paramètre inconnu, ce qui valide que les noms de paramètres utilisés côté client correspondent au déployé.

  **Déjà vérifié** : `tsc -b` et `npm run build` propres (aucune erreur TS). Aucune régression constatée sur le chemin "en retard" existant (`JoinTableForm` sur une séance `debating` réelle, zéro erreur console). Sondage réseau direct des deux RPC avec mauvais mot de passe (ci-dessus) confirmant la forme des appels.

  **Non testé — session headless sans mot de passe modérateur, volontairement** (voir consigne de Jules) : le flux complet avec le vrai Code Ecclesia n'a pas pu être exercé. Aucune séance de test disponible en ce moment en phase `pre_voting`/`voting`/`allocating` (toutes les séances existantes sont en `draft`, `debating` ou `closed`) — impossible même de voir le nouveau bouton apparaître en conditions réelles depuis cette session.

  **Test minimal** (Code Ecclesia requis, séance en `pre_voting`, `voting` ou `allocating` avec au moins un membre inscrit) :
  1. Depuis "Séances en cours" → clic sur la séance → arrivée sur l'étape vote → vérifier la présence du bouton "🎙️ Je suis modérateur" à côté du pseudo (les 3 phases pré-vote/vote/allocation).
  2. Cliquer → saisir un mauvais mot de passe → vérifier le message d'erreur "Code Ecclesia invalide" sans planter. Saisir le vrai Code Ecclesia → la modale se ferme, le badge "🎙️ Vous êtes modérateur" apparaît, le bouton devient "➕ Créer une table".
  3. Recharger la page → vérifier que `member.is_moderator` a bien persisté (le bouton "➕ Créer une table" doit réapparaître directement, sans repasser par l'étape 2).
  4. Cliquer "➕ Créer une table" → pseudo préempli avec le sien (modifiable) + Code Ecclesia → soumettre → vérifier l'arrivée directe en `ModeratorView` sur une table neuve rattachée à la séance (visible ensuite côté superadmin, onglet Tables).
  5. Répéter le point 4 en phase `allocating` spécifiquement (voir hypothèse non tranchée ci-dessous).

  **Hypothèses non tranchées avec Jules** :
  - **Table créée toujours "avec animateur"** (`p_leaderless: false`) — pas de case à cocher "table sans modérateur" dans cette modale, contrairement à l'onglet "Créer" de l'accueil. Choix délibéré : le but exprimé était que le modérateur anime lui-même la nouvelle table ; à corriger si une option leaderless était aussi souhaitée ici.
  - **"Créer une table" reste accessible en phase `allocating`** — l'onglet "Créer" de l'accueil (`EntryScreen`) exclut délibérément cette phase de sa liste de séances proposées (probablement pour ne pas interférer avec le calcul d'allocation en cours dans `AllocationPanel`). Cette nouvelle modale ne réplique pas cette restriction : le bouton reste actif en `allocating`. Si une table créée manuellement pendant que le superadmin lance l'allocation pose problème (collision avec `apply_allocation`), il faudra masquer/désactiver le bouton pour cette phase spécifiquement.
  - **Pas de restriction de phase côté serveur** sur `claim_moderator_status` pour un membre déjà inscrit (seul le cas "créer un nouveau profil" vérifie la phase) — cohérent avec le fait que ce nouveau bouton fonctionne dans les 3 phases demandées sans qu'aucun changement SQL n'ait été nécessaire.

## Parcours Modérateur (`ModeratorView`)

*Nécessite un Code Ecclesia et une vraie table animée (avec modérateur) pour la plupart des points ci-dessous — pas testable avec une table `leaderless` seule.*

- [ ] ~~**Chantier 43 — Fusion "Outils Modo" + suppression transcription (vue modérateur)**~~ **(doublon — voir "Branche non mergée — Chantier 43/44" plus bas)**
  Entrée initiale écrite avant la consolidation du 2026-09-01 puis avant l'élargissement au chantier 44 (2026-09-02). Conservée telle quelle par respect de la règle append-only, mais périmée — le contenu à jour (incluant le bouton "Ajouter une personne sans téléphone") est dans l'entrée consolidée ci-dessous. Ne pas la dérouler.

- [ ] **Chantier 8 (rattrapage) — Fix DnD : l'entrée déposée n'arrive plus en dernier (A2)**
  Mergé sur `main` (`e1fb31a`), aucune migration.

  **Comportement attendu** : dans `ModeratorView` (files d'attente longue/interactive), glisser une entrée sur une ligne précise doit la déposer à cette position exacte — pas systématiquement en dernier.

  **Test minimal** (table animée réelle, Code Ecclesia requis) : avec plusieurs entrées dans une file, glisser une entrée (depuis le panneau participants ou une autre position) directement sur une ligne précise → vérifier qu'elle atterrit à la position visée.

- [ ] **Branche non mergée — Chantier 43/44 — fusion "Outils Modo" + suppression transcription + "Ajouter une personne sans téléphone" (vue modérateur)** — branche `chantier-43-outils-modo-transcription`, **pas mergée sur `main`** (en attente de la vérification manuelle ci-dessous avant merge). Rebasée sur `origin/main` le 2026-09-02 (chantiers 40/42/45 inclus). **Ne contient pas** le fix `isModerator` du chantier 41 (`22078ff`, branche `chantier-41-reload-moderateur`) — pas encore mergé sur `main` au moment du rebase ; `TableContext.tsx` n'a pas été touché par ce chantier, rien à réconcilier pour l'instant, mais le prochain rebase avant merge devra le prendre en compte si chantier 41 est mergé entre-temps.

  **Chantier 43 — ce qui a été fait** : `NotesButton`, `AssertionsButton` et `QuestionnaireFab` (header de `ModeratorView`) retirés — leur contenu intégré comme entrées du menu `ModeratorToolsButton` ("Outils Modo"), organisé en 3 sections séparées par des lignes : **Camps & assertions** (Camps, Assertions votées — en premier, visible seulement si `table.session_id`), **Table** (QR code, Historique, **Ajouter une personne sans téléphone** — chantier 44, voir ci-dessous, Forçage questionnaire), **Personnel** (Mes notes, Questionnaire post-débat). Seul le bouton Documentation reste séparé dans le header. Le bouton et le code de transcription *live* (`useTranscription.ts`, backend WebSocket, déjà signalé mort dans `CLAUDE.md` depuis le 2026-06-30) sont supprimés — le sous-projet `transcription-debat/` (pipeline offline) n'est pas touché.

  **Chantier 44 — ce qui a été fait** : nouveau bouton **"Ajouter une personne sans téléphone"** dans la section **Table** (placé juste après "QR code de la table") — ouvre un formulaire "Prénom Nom", appelle la nouvelle RPC `add_offline_participant(p_table_id, p_pseudo)` *(migration SQL non appliquée, voir section dédiée plus bas)*. La personne créée apparaît dans `participants` comme n'importe qui (Realtime déjà abonné, aucun changement côté `TableContext`) — le modérateur lui donne/retire la parole avec les outils existants (glisser-déposer, "Exclure" dans `ParticipantsTable`), rien de nouveau à ce niveau.

  **Pourquoi une nouvelle RPC plutôt que réutiliser `join_table`** : `join_table` appelle aussi `sync_table_assignment(session_id, table_id, auth.uid(), pseudo)`, qui opère par **user_id**, pas par pseudo. Appelé sous l'identité du modérateur (c'est son appareil qui insère la ligne), ce mécanisme chercherait/créerait la ligne `session_members` du **modérateur lui-même** — pour un modérateur "classique" jamais inscrit au vote de cette séance (cas déjà documenté dans ce fichier, section chantier 35), ça insère une ligne `session_members` fantôme portant le user_id du modérateur mais le pseudo de la personne ajoutée, avec `attending_in_person=true` en trop (fausse les stats `get_session_voting_stats`). `add_offline_participant` reprend uniquement le cœur de `join_table` (`INSERT INTO participants ... ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id`, donc **exactement le même mécanisme de collision** — si quelqu'un rejoint plus tard avec le même nom, il reprend la main sur cette ligne, comme une reconnexion depuis un autre appareil) sans jamais toucher `session_members`/`table_assignments`/`entry_responses`.

  **Deux hypothèses posées, non tranchées explicitement par Jules** :
  1. **Comptage votes/allocation** : cette personne ne compte **jamais** dans les votes ni dans l'allocation. Ce n'est pas un choix arbitraire — `ModeratorToolsButton` n'existe que dans `ModeratorView`, qui n'existe qu'en phase `debating`, c'est-à-dire **après** que vote et allocation aient déjà eu lieu. Il n'y a structurellement rien à recompter. C'est aussi cohérent avec le fait que `add_offline_participant` n'écrit que dans `participants` — pas de ligne `session_members`/`entry_responses` créée, donc rien qui pourrait entrer dans une analyse ou un futur clustering.
  2. **Persistance** : la ligne créée persiste en base normalement, exactement comme n'importe quel participant (même table `participants`, même CASCADE si la table de débat est supprimée, exclusion via `kick_participant` comme tout le monde). Pas de statut "éphémère"/session-only : ce concept n'existe nulle part ailleurs dans le schéma (`speaking_turns`, `queue_entries` persistent aussi), l'inventer pour ce seul cas aurait été une incohérence, pas une simplification.

  Si l'une de ces deux hypothèses ne convient pas à Jules, la RPC `add_offline_participant` est le seul endroit à modifier (elle est volontairement isolée, ne réutilise pas `join_table`).

  **Déjà vérifié** : `tsc --noEmit` propre (94 tests passés, 1 skip pré-existant, aucune régression), `npm run build` réussi, app rechargée dans le Browser pane sans erreur console après le rebase et l'ajout du bouton (EntryScreen, listing des séances). **Aucun test en conditions réelles sur `ModeratorView`/`ModeratorToolsButton`** — session headless sans Code Ecclesia ni mot de passe superadmin (volontaire, cf. consigne de Jules).

  **Test minimal** (Code Ecclesia + vraie table animée avec modérateur requis — couvre les deux chantiers en une passe) :
  1. **Migration SQL appliquée au préalable** (voir section dédiée ci-dessous) — sinon le bouton "Ajouter une personne sans téléphone" échoue à l'appel RPC (fonction inexistante).
  2. Rejoindre une table de débat en tant que modérateur → ouvrir "Outils Modo" → confirmer les 3 sections dans l'ordre (Camps & assertions en premier, Table, Personnel), séparées par des lignes.
  3. Section Table : cliquer "Ajouter une personne sans téléphone" → saisir "Prénom Nom" → "Ajouter" → modal se ferme, la personne apparaît dans la liste des participants (`ParticipantsTable`/sidebar) sans reload. Lui donner la parole (glisser dans une file, ou clic direct) → vérifier que ça fonctionne comme pour un participant normal. La retirer via "Exclure".
  4. **Collision** : ajouter à nouveau une personne avec le **même** "Prénom Nom" qu'un participant déjà présent (ajouté par ce bouton ou ayant rejoint normalement) → vérifier qu'aucune erreur ne bloque, et que ça se comporte comme une reconnexion (même ligne participant, pas de doublon dans la liste).
  5. Confirmer que tous les autres items s'ouvrent sans erreur console (Camps, Assertions votées, QR code, Historique, Forcer/Annuler questionnaire, Mes notes, Questionnaire post-débat) et qu'aucun bouton/mention "Transcription" ne subsiste.
  6. Cas sans séance rattachée (table créée hors séance) : confirmer que la section "Camps & assertions" est bien absente (conditionnée à `table.session_id`) et qu'il n'y a pas de ligne de séparation orpheline. Le bouton "Ajouter une personne sans téléphone" doit lui rester visible (section Table, indépendante de `session_id`).
  7. Si un avis tranche différemment les deux hypothèses ci-dessus (comptage votes/allocation, persistance) : le signaler, `add_offline_participant` est isolée pour être facile à ajuster.

  **Reste identifié mais volontairement non touché** : `src/hooks/useTranscription.ts` supprimé (mort après retrait de son unique appelant), mais `src/components/voting/OnboardingForm.tsx:158` mentionne encore la transcription dans un texte de consentement participant (anonymisation du pipeline offline, sans lien avec le hook supprimé) — non modifié, hors périmètre.

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur (volet ModeratorView/ParticipantView)**
  Voir la section dédiée **"Synchronisation temps réel (chantier 35)"** plus bas.

## Questionnaire post-débat

- [ ] **2026-09-01 — Chantier 45 — retrait "à quel débat" + note globale obligatoire en 1ʳᵉ position** — `QuestionnaireModal.tsx` (table), `SessionQuestionnaireForm.tsx` (séance sans table)

  Aucune migration (changement frontend uniquement — `debate_attended` reste en base pour l'historique mais n'est plus jamais renseigné par le frontend).

  **Comportement attendu** : questionnaire post-débat sans la question "à quel débat viens-tu de participer ?" ; la question de note globale (0-5) est en première position et bloque l'envoi tant qu'elle n'est pas remplie (sauf si déjà enregistrée avant ce changement — verrouillée comme les autres champs) ; la question de retour libre est en deuxième position.

  **Déjà vérifié** (via `ParticipantToolsButton` → Outils → Questionnaire post-débat, table `leaderless` de la séance de test) : ordre des questions conforme, absence de la question "à quel débat", clic "Envoyer" sans note → message d'erreur bloquant sans appel réseau, note sélectionnée puis "Envoyer" → succès, réponse relue verrouillée (rating=4 disabled) confirmant la persistance en base. Zéro erreur console.

  **Reste à vérifier — les deux autres points d'entrée, jamais exercés en navigateur** :
  1. `QuestionnaireBtn` dans le header de `ModeratorView` (bouton "Outils Modo" → Questionnaire post-débat, ou l'ancien `QuestionnaireFab` si le chantier 43 n'est pas encore mergé) — nécessite une table **animée** avec Code Ecclesia réel, jamais testé (une table `leaderless` ne donne accès qu'à `ParticipantView`).
  2. `SessionQuestionnaireForm` — formulaire rattaché à la séance sans table, utilisé dans `AllocatingScreen`/`VoteScreen` — modifié à l'identique du point ci-dessus mais jamais exercé en navigateur.

  **Test minimal** : dérouler le même parcours que "Déjà vérifié" ci-dessus, une fois depuis `ModeratorView` (table animée, Code Ecclesia) et une fois depuis `SessionQuestionnaireForm` — **note chantier 39 ci-dessous : ses points d'entrée ont changé, ce n'est plus `allocating`/`voting`**.

- [ ] **2026-09-01 — Chantier 39 — déclenchement de `SessionQuestionnaireForm` déplacé de la phase `questionnaire` (supprimée) vers `closed`** — `VoteScreen.tsx`, `AllocatingScreen.tsx`, `SessionRouterScreen.tsx`, `lib/voting.ts` (`hasQuestionnaireResponse`) *(migration SQL requise, voir "Migration SQL en attente" — mais sans effet sur ce comportement frontend tant qu'aucune séance réelle n'est restée bloquée en phase `questionnaire`)*

  **Pourquoi** : la phase `questionnaire` disparaît de la machine à états (demande explicite de Jules). Le formulaire `SessionQuestionnaireForm` (déjà repositionné par le chantier 45 ci-dessus) doit donc se déclencher autrement : désormais, dès qu'une séance passe en `closed`, `SessionQuestionnaireForm` s'affiche à la place de l'écran de résultats **pour un membre inscrit qui n'a pas encore de ligne dans `questionnaire_responses` pour cette séance** (nouvelle fonction `hasQuestionnaireResponse(sessionId)`, RLS `user_id = auth.uid()` déjà en place — pas de filtre supplémentaire nécessaire). Une fois répondu (`onDone`), l'écran de résultats normal s'affiche. Un visiteur non inscrit (`PublicResultsScreen`) n'est **jamais** concerné par ce gate — volontaire, il n'a jamais voté.

  **Trois points d'entrée concernés, tous avec la même logique** :
  1. `VoteScreen` (`#vote/<join_code>`) — au chargement initial, sur les mises à jour Realtime (2 canaux distincts) et sur le polling 10s de secours.
  2. `AllocatingScreen` (rendu par `VoteScreen` en phase `debating`/`allocating` pour qui n'a pas encore rejoint de table) — sur Realtime et sur le polling 10s.
  3. `SessionRouterScreen` (`#session/<join_code>`) — anciennement un texte statique non fonctionnel ("Réponds au questionnaire", sans formulaire réel, cf. TODO `CLAUDE.md` désormais retiré) ; affiche maintenant le vrai `SessionQuestionnaireForm`. C'est probablement le point d'entrée le plus emprunté en pratique (lien QR code / WhatsApp stable tout au long de la séance).

  **Déjà vérifié** (`tsc -b`, `npm run build`, `npm test`, tous OK) + navigateur, séances de test réelles : `#session/DEBAT8` (`closed`, visiteur non inscrit) → `PublicResultsScreen` normal, aucun questionnaire proposé (comportement attendu, visiteur jamais voté), zéro erreur console. **Non testé faute de compte membre dans une séance `closed` réelle** : l'apparition effective du formulaire pour un membre inscrit sans réponse, ni la disparition après soumission (`onDone` → écran de résultats).

  **Test minimal** (mot de passe superadmin requis pour clôturer une séance de test avec un membre inscrit n'ayant pas encore répondu) :
  1. Membre inscrit, séance passée en `closed`, jamais répondu au questionnaire → `#vote/<join_code>` **et** `#session/<join_code>` (les deux, séparément, avec des comptes/sessions différents si besoin) → vérifier l'apparition de `SessionQuestionnaireForm` dans les deux cas, pastille "Étape 5 · Post-débat" visible dans son en-tête (chantier 39, voir entrée `PhaseIndicator` ci-dessus).
  2. Répondre et envoyer → vérifier la transition vers l'écran de résultats normal (`ResultsMapScreen`) sans reload.
  3. Revenir sur le même lien après avoir déjà répondu → vérifier l'accès direct à l'écran de résultats, sans repasser par le questionnaire.
  4. Séance en `debating` avec un participant connecté à sa table (`ParticipantView`) → superadmin clique "Passer en Clôturée" → vérifier le déclenchement **automatique** du modal questionnaire chez ce participant (couvert aussi par l'entrée superadmin ci-dessus) — ce test-ci vérifie spécifiquement qu'aucune étape de phase intermédiaire n'est nécessaire.

## Synchronisation temps réel (chantier 35)

*Nécessite deux onglets ou deux navigateurs en parallèle sur la même séance/table — ne peut pas se tester avec un seul client.*

- [ ] **Chantier 35 — synchronisation temps réel du statut modérateur**
  Mergé sur `main` (`42ccae2`). Migration `supabase/migrations/20260803_chantier35_session_members_replica_identity.sql` **déjà appliquée et vérifiée par Jules côté Supabase** (`REPLICA IDENTITY FULL` confirmé sur `session_members`) — les deux abonnements realtime `session_members` sont donc actifs, seul le test manuel ci-dessous reste à faire.

  **Comportement attendu** (3 points) :
  1. Superadmin voit en direct (sans reload) un changement de modérateur initié côté participant (auto-attachement chantier 33, `reclaim_moderator`) — section "Tables rattachées" ET onglet Tables/Groupes.
  2. Participant bascule en direct vers `ParticipantView` (sans reload) si le superadmin lui retire son statut de modérateur pendant le débat — et redevient `ModeratorView` si le statut est rendu (réversible, tant que personne d'autre n'a repris le contrôle physique de la table).
  3. Le badge "Vous êtes modérateur" (phase vote) se met à jour en direct si le superadmin décoche le statut depuis l'onglet Membres.

  **Test minimal** (mot de passe superadmin requis, deux onglets/navigateurs) :
  1. **Point 1 (reclaim)** : superadmin sur "Tables rattachées" ouvert, 2ᵉ onglet fait un `reclaim_moderator` sur une table → `moderator_pseudo` doit se mettre à jour sans reload (~15s max).
  2. **Point 1 (auto-attachement, à re-tester en priorité — jamais reproduit en session)** : séance `allocating`/`debating`, table animée sans modérateur, superadmin sur l'onglet 🪑 Tables. 2ᵉ onglet : `#session/<code>` → "🎙️ Modérateur" → se déclarer modérateur → vérifier l'apparition à la table sans reload.
  3. **Point 2 (retrait en débat)** : participant modérateur physique d'une table en `debating` → superadmin retire son statut (onglet Tables ou case Membres) → vérifier bascule vers `ParticipantView` sans reload, puis réversibilité en recochant.
  4. **Point 3 (phase vote)** : participant avec badge "Vous êtes modérateur" visible → superadmin décoche depuis Membres → badge doit disparaître sans reload.
  5. **Régression** : un modérateur "classique" (table créée via `create_table`/`reclaim_moderator`, jamais inscrit au vote de cette séance, donc sans ligne `session_members`) doit garder son `ModeratorView` sans interruption.

- [ ] **2026-09-01 — Chantier 41 — nomination d'un modérateur déjà assis, invisible sans quitter/rejoindre** — `src/context/TableContext.tsx`, branche `chantier-41-reload-moderateur`

  **Retour de Jules** : « Quand je suis déjà en phase débat, et que je nomme quelqu'un en modérateur sur une table, lorsque celui-ci fait un reload, la vue modérateur n'apparaît pas. Il faut pour cela qu'il quitte, avec le bouton quitter, puis revienne dans le débat. »

  **Diagnostic — ce n'est PAS une régression de 35/36/37, c'est l'asymétrie que chantier 35 avait explicitement documentée et volontairement laissée de côté** (ligne "Volontairement pas traité" ci-dessus, maintenant retirée puisque couverte par ce correctif) : `isModerator` était calculé `physicalModerator && !moderatorRevoked` — un pur véto qui ne peut que *dégrader*. `moderatorRevoked` se recalcule bien à chaque `load()` (montage + polling 5s) et via un abonnement realtime sur `session_members`, mais dans les deux cas il ne fait que poser `true`/`false` sur le véto, jamais remonter `physicalModerator` de `false` à `true`. Un participant nommé modérateur *après* avoir déjà rejoint sa table reste donc bloqué, en direct **et** après un simple reload — `physicalModerator` ne vient que du prop `initialIsModerator`, lui-même figé au moment du join initial (`AllocatingScreen.handleJoin` / cache `tableStore` restauré tel quel par `App.tsx` au montage, sans re-vérification). Seul un `leaveTable()` + retour (qui repasse par `AllocatingScreen.handleJoin`, lequel relit `member.is_moderator` à neuf) recalculait correctement — exactement le contournement que Jules a trouvé.

  **Correctif** : `isModerator = physicalModerator || sessionMemberIsModerator` (OR, plus de véto). `sessionMemberIsModerator` reflète `session_members.is_moderator` en direct (realtime, déjà existant côté chantier 35) et à chaque `load()`/reload — dans les deux sens désormais. Ne réintroduit pas de régression sur le cas que chantier 35 ciblait (démodération d'un modérateur assigné côté Bloc C) : pour les tables issues de l'allocation, `tables.created_by` est l'uid du superadmin qui a appelé `apply_allocation`/`create_tables_batch`, jamais celui du participant assigné — `physicalModerator` y est donc déjà `false`, et `session_members.is_moderator = false` suffit seul à garder `isModerator` à `false`.

  **Constat annexe, confirmé en navigateur réel (voir "Déjà vérifié" ci-dessous)** : en creusant ce mécanisme, la même veto asymétrique de chantier 35 casse aussi l'auto-désignation "Désigner comme animateur" (`designate_moderator`, table `leaderless` rattachée à une séance) : cette RPC pose `tables.created_by` mais ne touche jamais `session_members.is_moderator` (qui reste `false` par défaut) — au prochain `load()` (5s ou reload), l'ancien véto retombait systématiquement à `false` pour *tout* auto-désigné sur une table leaderless rattachée à une séance, sans intervention du superadmin. Le passage à l'OR corrige ce cas (il ne dépend plus que de `physicalModerator`) — **reproduit et corrigé en conditions réelles**, pas seulement en théorie.

  **Déjà vérifié** : `tsc --noEmit` propre, `npm run build` réussi, `npm test` (204/206, 2 skips préexistants, aucune régression sur `allocation.ts`/`groupNaming.ts`).

  **Vérifié en navigateur réel (2026-09-01)**, sur la table `589D79` (leaderless, séance "Test manuel — Vote & bascule modérateur", participant "Test Chantier40" — voir note dans "Nettoyage des données de test" : cette table n'est plus leaderless suite à ce test) :
  - Join de la table → `ParticipantView` correcte ("Groupe auto-géré"), zéro erreur console.
  - Clic "🎙️ Devenir modérateur" → confirmation → `designate_moderator` → bascule immédiate vers `ModeratorView` ("Micro libre", panneau Participants). Ceci exerce exactement le mécanisme du "constat annexe" ci-dessus : `physicalModerator=true`, `session_members.is_moderator=false` (jamais posé par cette RPC).
  - **Sans le correctif, l'ancien code aurait dû redescendre en `ParticipantView` au bout de 5s** (véto `moderatorRevoked` recalculé par le polling `load()`, `is_moderator === false` trouvé). Attendu 7s : **toujours `ModeratorView`**, zéro nouvelle erreur console.
  - Reload complet de la page (scénario exact de Jules — recharger sans quitter/rejoindre) : **`ModeratorView` toujours affichée immédiatement**, zéro erreur console.
  - Les 2 erreurs console visibles (404, 401) proviennent de requêtes de diagnostic que j'ai faites moi-même dans la console du navigateur pour retrouver un `join_code` de test (pas de MCP Supabase, clé anon publique lue depuis `.env` — usage en lecture seule, cf. `CLAUDE.md`) ; confirmé sans rapport avec l'app via `read_network_requests` (uniquement des requêtes locales Vite dans la fenêtre capturée). Aucune erreur émise par le code applicatif lui-même à aucune étape.

  **Non testé en conditions réelles — bloqué par l'absence de mot de passe superadmin dans cette session headless** : le scénario exact décrit par Jules (promotion via `session_members.is_moderator`, posée par `set_member_moderator`/`assign_moderator_to_table`, pas par `designate_moderator`). Le code qui consomme ce flag (`setSessionMemberIsModerator`, dans `load()` et dans l'abonnement realtime) est strictement le même que celui exercé ci-dessus — seule la RPC qui écrit `session_members.is_moderator=true` diffère — mais la session de vérification devrait dérouler ce chemin exact avant merge, pas seulement l'analogue.

  **Test minimal restant** (mot de passe superadmin requis) :
  1. **Scénario exact de Jules** : séance `debating`, participant déjà assis à une table (`ParticipantView`). Superadmin → onglet Membres, cocher "modérateur" sur ce participant (assis à une table déjà pourvue **ou** sans modérateur, peu importe — cf. chantier 37 point 2 pour la logique de placement). Sans que le participant ne fasse quoi que ce soit : recharger sa page → vérifier l'apparition immédiate de `ModeratorView` (plus besoin de quitter/rejoindre).
  2. **Variante en direct** : même mise en place, mais sans reload — laisser tourner ~5s (polling `load()`) ou vérifier que le realtime `session_members` (déjà actif, chantier 35) bascule l'écran instantanément.
  3. **Non-régression démodération (chantier 35, point 2 déjà listé ci-dessus)** : toujours vérifier avec ce correctif en place.

## Nettoyage des données de test (séances partagées)

Données factices laissées par les sessions de vérification navigateur, à nettoyer une fois les points correspondants confirmés (pas de MCP Supabase pour le faire depuis une session de chantier — voir la règle SQL ci-dessus ; à faire par la session de vérification ou par Jules directement).

- [ ] **Table `589D79`** — participant **"Test Chantier40"**, créée *leaderless* dans la séance partagée "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 40. **N'est plus leaderless** : utilisée le 2026-09-01 pour vérifier en navigateur réel le chantier 41 (clic "Devenir modérateur" → `designate_moderator`, table basculée `leaderless=false`, `created_by` = l'uid anonyme de la session de test, sans rapport avec un vrai compte). Table + participant toujours à purger, mais ne pas s'étonner de la retrouver en table animée plutôt que leaderless au moment du nettoyage.
- [ ] **Table `6ABDC9`** + pseudo **"TestQ45"** + une réponse `questionnaire_responses` (note=4) — créées dans la séance "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 45.
- [ ] **Table `6296A9`** (leaderless) + participant **"Test Notes QA"** — créée dans la séance **TEST33A** pour vérifier le chantier 42.
- [ ] **Table `589D79`, participants "TestChantier48A" et "TestChantier48B"** — créés dans la séance "Test manuel — Vote & bascule modérateur (chantiers 35/37)" pour vérifier le chantier 48. Les deux illustrent volontairement le bug visé par ce chantier : parties via "Quitter" sans jamais rejoindre une autre table, leurs lignes `participants` sont restées dans `589D79` (`leaveTable()` ne supprime jamais la ligne en base) — à garder tel quel jusqu'à ce que la migration `switch_table` soit appliquée et testée, ça sert de donnée de repro pour le test manuel restant. Les deux ont aussi une ligne `session_members`/`table_assignments` dans la séance (auto-créées par `sync_table_assignment` lors du join en retard).

## Historique / notes de session (non actionnable)

Notes de contexte conservées pour mémoire (règle append-only) mais qui ne demandent aucune action de Jules.

- **2026-08-01 — Réconciliation `main` local / `origin/main`** (préalable au merge du chantier 34) : `main` local et `origin/main` avaient divergé depuis `17c30ff` — `main` local contenait le chantier 29 jamais poussé, `origin/main` contenait 7 commits (chantier 30, B3, docs chantier 18) poussés directement sans passer par `main` local. Réconcilié dans un worktree dédié (`reconcile-main-20260801`), un seul conflit textuel sur `A_VERIFIER.md` (deux sessions ayant chacune inséré leur entrée en tête de "En attente"), résolu sans perte de contenu. `tsc`/`npm test` (90/90) OK, vérification navigateur rapide sans erreur console. Poussé en fast-forward sur `origin/main`. Tag de rollback : `pre-reconcile-main-20260801`.

- [ ] **2026-09-01** — Chantier 38 (reload/remount écran superadmin) — `src/screens/SuperadminScreen.tsx` (1 ligne), diagnostic uniquement sinon

  **Demande de Jules** : « sur l'écran superadmin, il y a un reload successif qui est très désagréable, et qui, toutes les 10 secondes ou moins, nous remmène en haut de la page ». Hypothèse de départ du chantier : un polling ou un abonnement Realtime qui remonte tout le composant au lieu de mettre à jour les données en place.

  **Investigation menée** (aucun accès au mot de passe superadmin — règle de sécurité constante de ce projet, confirmée par des dizaines d'entrées précédentes dans ce fichier — donc aucune manipulation avec un vrai secret) : lecture exhaustive de `SuperadminScreen.tsx` (4748 lignes) — seuls 3 `setInterval` existent, tous dans `SessionDetail` : `loadAssertions` (10 s), `loadMembers` (15 s), `loadStats` (15 s). Aucun ne remonte de composant : les `setState` qu'ils déclenchent (`setAssertions`, `setMembers`, `setVotingStats`) sont de simples mises à jour de props/état, aucun `key` instable trouvé sur un ancêtre commun, `AllocationPanel` a bien un `key={currentSession.id}` mais `currentSession.id` ne change jamais (vérifié : les 3 seuls `setCurrentSession` préservent `id`). Aucun `scrollTo`/`scrollIntoView`/`autoFocus` dans ce fichier ni dans `AllocationPanel.tsx`/`LLMModerationPanel.tsx`/`AnalysisPanel.tsx`/`TableDiagnosticsList.tsx`. Le seul canal Realtime de ce fichier (`table_assignments:<id>`) ne se ré-abonne que sur changement de phase, jamais sur un timer.

  **Reproduction dynamique** (technique déjà validée par une session précédente — cf. entrée E9/H10 plus haut — interception de `window.fetch` pour simuler une authentification superadmin réussie et des réponses RPC, **sans jamais saisir ni faire circuler de vrai mot de passe** ; bascule du hash `#superadmin`→`#foo`→`#superadmin` pour forcer un remount propre de `SuperadminScreen` avec le mock actif) : session factice montée avec succès dans l'onglet 🟢 En direct, en phase `voting` **et** en phase `allocating` (donc avec `AllocationPanel` affiché). Un marqueur JS posé sur `document.querySelector('main')` et un suivi de `window.scrollY` toutes les 3 s, sur ~50-80 s de test à chaque fois (compteurs d'appels confirmant que les 3 `setInterval` tournaient bien en continu, `list_assertions` et `voting_stats`/`list_members` incrémentant à leur cadence attendue) : **aucun remount détecté** (`main` jamais recréé), **`scrollY` resté rigoureusement stable** (testé à 400 px). Test répété à l'identique sur un **build de production** (`npm run build` + `vite preview`, donc sans Vite/HMR) : même résultat, zéro remount, zéro reset de scroll.

  **Hypothèse retenue faute de reproduction côté app** : le symptôme observé par Jules est très probablement un **rechargement complet déclenché par Vite HMR en mode `npm run dev`**, causé par des **sessions Claude Code concurrentes qui sauvegardent des fichiers `src/lib/*.ts`** (modules non-composants comme `lib/allocation.ts`, `lib/voting.ts`) pendant que son onglet navigateur pointe sur le **même serveur dev partagé** (`ecclesia-dev`, port 5173, dossier racine). Un module utilitaire (non-composant React) édité invalide tout le graphe de modules qui l'importe → HMR ne peut pas faire de mise à jour ciblée → rechargement complet de la page → perte du scroll. Preuve indirecte concrète : au tout début de cette session, `git status` sur le dossier racine partagé montrait déjà `src/lib/allocation.ts`, `src/lib/allocation.test.ts` et `bench/strategy-sanity.test.ts` modifiés et non commités par une autre session — cohérent avec le pattern documenté ailleurs dans ce dépôt de « plusieurs chantiers tournent en parallèle sur ce repo ». Cette hypothèse n'explique **pas** un rechargement observé sur le site déployé (GitHub Pages, sans HMR) — si le symptôme se reproduit aussi là, l'hypothèse ci-dessus est fausse et il faut rouvrir l'investigation (tester d'autres onglets — 🪑 Tables / ⚙️ Préparation — ou une séance avec beaucoup plus de données réelles, ce que cette session n'a pas pu reproduire sans le mot de passe).

  **Bug réel trouvé au passage (corrigé)** : `AnalysisPanel` recevait `sessionPhase={session.phase}` (ligne 2057) — la prop `session` est la copie **figée** reçue à l'ouverture de la fiche séance, jamais mise à jour après un changement de phase (c'est `currentSession`, mis à jour par `setCurrentSession`, qui suit la phase réelle). Conséquence : le toggle « auto-analyse » de `AnalysisPanel` (actif seulement en phase `voting`/`pre_voting`) restait activable indéfiniment si la fiche avait été ouverte pendant `voting` puis la séance passée en `allocating`/`debating` sans recharger la page. Corrigé en `sessionPhase={currentSession.phase}`. Sans rapport avec le symptôme de reload — ne change rien au scroll/remount, ne provoque aucune re-fetch supplémentaire (la prop ne contrôle qu'un `if` dans un `useEffect` déjà existant).

  **Déjà vérifié par moi** : `npx tsc -b` (exit 0). `npm run build` (production, exit 0). Reproduction Browser pane décrite ci-dessus, sur serveur dev (`chantier-38-dev`, port 5204, config ajoutée à `.claude/launch.json`) **et** sur build de production (`vite preview`, port 5210, arrêté après test). Après la correction d'`AnalysisPanel`, re-vérifié que la fiche séance factice (phase `allocating`) se remonte toujours sans erreur console (hors erreurs 400 attendues, dues au faux mot de passe non mocké pour tous les endpoints).

  **Non vérifié / reste à faire par Jules ou une session avec le mot de passe superadmin** :
  1. **Confirmer où le symptôme a été observé** : `npm run dev` local (avec ou sans autre session Claude Code active en parallèle dans le même dossier) ou site déployé GitHub Pages ? C'est la donnée manquante la plus importante pour trancher entre l'hypothèse HMR ci-dessus et un vrai bug applicatif non reproduit.
  2. Si le symptôme se reproduit **aussi en production** (ou en dev sans aucune autre session active) : retester spécifiquement les onglets 🪑 Tables et ⚙️ Préparation (non couverts par cette reproduction, qui s'est limitée à 🟢 En direct), et avec un volume de données réaliste (beaucoup d'assertions/membres), ce qu'une session sans mot de passe ne peut pas mettre en place elle-même.
  3. Parcours de clic réel sur une séance de test, avec captures d'écran/vidéo si possible du moment exact du "reload", pour confirmer s'il s'agit d'un vrai remount React (perte de tout l'état local, ex. accordéons qui se referment) ou seulement d'un reset de `scrollY` sans perte d'état (ce qui pointerait vers une cause navigateur plutôt qu'React).

  **⚠️ Hypothèse HMR infirmée par Jules (2026-09-01, 2ème passe)** : « lorsque je constate cette erreur, aucune séance Claude Code ne tournait » + « j'ai l'impression que c'est sur tous les onglets superadmin » + « ça ne clignote pas particulièrement ». Ce retour a rouvert l'investigation — **vrai bug applicatif trouvé et corrigé**, voir la nouvelle entrée en tête de la section **"Parcours Superadmin"** ci-dessous. La reproduction de cette 1ère passe (point "Reproduction dynamique" ci-dessus) n'avait rien vu car son `scrollY` de test (400px) restait **au-dessus** de la hauteur du spinner de chargement plein écran — donc jamais assez profond pour déclencher le clamp de scroll observable en usage réel (beaucoup de contenu ouvert = scroll bien plus profond que 400px). Conservé ici pour mémoire (append-only), ne plus utiliser comme diagnostic de référence.

## Validé

<!-- déplacer ici une fois vérifié, au format : - [x] **AAAA-MM-JJ (validé le AAAA-MM-JJ)** — `fichier` — description -->
