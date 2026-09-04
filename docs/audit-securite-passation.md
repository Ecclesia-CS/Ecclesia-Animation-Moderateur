# Passation — audit de sécurité Ecclesia

**Pour** : la personne qui prendra en charge la cybersécurité du projet.
**De** : audit mené le 2026-08-03 (analyse assistée, à la demande du responsable du projet).
**Rapport détaillé** : [audit-securite-2026-08-03.md](./audit-securite-2026-08-03.md) — ce document-ci en est le résumé de passation. Lis le rapport complet pour le détail de chaque faille ; ce fichier te donne le contexte, l'état d'avancement, et **surtout ce qui n'a pas été fait**.

---

## 1. Ce qu'est le projet, en deux lignes

App web de modération de débats (React + Vite, hébergée sur **GitHub Pages**, dépôt **public**), adossée à **Supabase** (PostgreSQL + Auth anonyme + Realtime). Toute la logique de sécurité repose sur **Row Level Security (RLS)** et des fonctions PostgreSQL `SECURITY DEFINER`. Il n'y a pas de backend applicatif classique : le navigateur parle directement à Supabase avec une clé publique (`anon`).

Trois secrets structurent les droits :
- **Code Ecclesia** (créer/reprendre une table) — bcrypt dans `app_config`.
- **Mot de passe superadmin** (gérer les séances) — bcrypt dans `app_config`.
- **join_code** par table/séance (6 hex, en clair) — pour rejoindre.

---

## 2. Modèle de menace retenu

- **Attaquant** : étudiant·e en école d'ingé, spécialité cyber. Compétent, motivé par le défi, seul ou en petit groupe. Pas d'infra lourde.
- **Point de départ** : aucun secret. **Mais le dépôt est public** → tout le code, le schéma SQL, les policies RLS et les signatures de fonctions sont connus d'avance. La clé `anon` est dans le bundle JS public : n'importe qui peut appeler l'API REST et Realtime de Supabase depuis un navigateur ou `curl`.
- **Objectif 1 (prioritaire pour le responsable)** : interrompre une séance en cours.
- **Objectif 2** : détruire des données.

**Correction apportée au modèle initial** : on pensait que « prendre le rôle de modérateur » était peu grave. C'est **faux** — un modérateur peut supprimer sa table (policy `tables_delete_moderator`), ce qui cascade sur participants, file d'attente et historique. La prise de modération est donc **destructrice**.

---

## 3. Les vulnérabilités, par priorité

Le rapport détaille **19 points** (IDs A1–A6 = interruption, B1–B6 = destruction/fuite, C1–C7 = intégrité/durcissement). Les 4 à traiter en premier :

| ID | En une phrase | Statut |
|---|---|---|
| **A1** 🔴 | Le canal Realtime est public : n'importe quel anonyme peut inonder toutes les tables de signaux `refresh` → DoS général. | **confirmé par test actif** |
| **B4** 🔴 | `session_members` est en lecture publique : noms réels + **29 codes de rappel en clair** lisibles par tout le monde, **maintenant**. | **confirmé par test actif** |
| **B1** 🔴 | XSS stocké (sources collaboratives) → vol du mot de passe superadmin (stocké en clair dans le navigateur) → suppression de la séance. | confirmé au niveau du code |
| **A2** 🔴 | Un **seul** code Ecclesia pour toute l'asso, partagé, sert à reprendre **n'importe quelle** table puis à la supprimer. | confirmé au niveau du code |

Puis, en 🟠 élevé : **B3** (prise de contrôle d'un membre par pseudo seul), **A4** (`designate_moderator` détourne une table sans animateur), **B2** (`register_collab_pseudo` : vol d'identité + suppression des sources d'autrui). En 🟡/🟢 : voir le rapport (fuites `sessions`/assertions, quota Gemini, injection de prompt, durcissements divers).

**Trois causes racines** expliquent presque tout — c'est le meilleur angle pour découper les chantiers :
1. **5 policies RLS en `USING (true)`** (`sessions`, `session_members`, `table_assignments`, `collab_session_users`, `session_sources`) → à elles seules 7 vulnérabilités. **Le chantier au meilleur rapport effort/effet.**
2. **Reprise d'identité sans preuve de possession** (`join_table`, `confirm_attendance`, `reclaim_prevoting_member`, `register_collab_pseudo` : tous font `ON CONFLICT … DO UPDATE SET user_id = auth.uid()`). Connaître un pseudo public suffit.
3. **Un secret unique, partagé, faible**, sans granularité ni révocation, pour tout le pouvoir.

⚠️ **Le dépôt étant public, suppose que l'attaquant a lu ce rapport avant toi.** Corrige côté serveur (RLS, secrets granulaires, rate-limit), pas côté interface. Ne détaille pas publiquement les fenêtres d'exploitation encore ouvertes.

---

## 4. Ce qui a été confirmé activement (et comment)

Tests réels menés contre la **production**, avec la vraie clé `anon` publique, la séance n'étant pas live (aucun débat avant plusieurs mois). Aucune donnée n'a été modifiée.

- **A1** — Deux clients anonymes distincts sur un canal `table:<id>` : l'un émet un `broadcast` `refresh`, l'autre le reçoit. Le déni de service Realtime est ouvert.
- **B4** — `GET /rest/v1/session_members` en anonyme : noms + `Content-Range: 0-28/29` sur les codes de rappel non nuls → **29 codes à 4 chiffres en clair**.
- **B6** — `GET /rest/v1/sessions` en anonyme : join_codes, titres, URLs de docs de toutes les séances.
- **Lecture `table_assignments`** en anonyme : tous les `table_id`/`session_id`.

Ces requêtes sont de simples appels HTTPS que **n'importe qui peut reproduire** — ce n'est pas un accès privilégié.

**Vérifications positives** (inutile de les refaire) : les RPC de contrôle de table (`grant_floor`, `end_turn`, `kick_participant`, `correct_turn`, reorder…) sont **correctement gardées** par `created_by = auth.uid()` ; les `get_*` participant (`get_results_map`, `get_my_table_assignment`, `submit_entry_response`, `submit_questionnaire`) vérifient bien `auth.uid()` ; `app_config` est verrouillée (RLS, zéro policy — aucun hash ne sort) ; **aucun secret dans l'historique git** ; CI saine (n'injecte que l'URL + clé anon) ; pas d'injection SQL ; pas de XSS ailleurs que B1.

---

## 5. ⚠️ Ce qui n'a PAS été fait ni exploré

**Sois prudent : cet audit n'est pas complet. Voici les angles morts, honnêtement.**

- **Aucune exploitation active des RPC destructrices.** B1, A2, B3, A4, B2, A6 sont confirmées **par lecture du code seulement**. Elles n'ont pas été exécutées **volontairement** (elles écriraient sur de vraies données : transferts de `user_id`/`created_by`, suppressions). Le code est sans ambiguïté, mais tu n'as pas de preuve d'exploitation bout-en-bout.
- **B1 non confirmé en navigateur.** Le fait que React 18 ne neutralise pas les URLs `javascript:` est établi au niveau du code (`sanitizeURL` n'émet qu'un warning en dev, supprimé en prod), mais **personne n'a validé l'exécution par un clic réel** sur le site déployé. Dernier maillon à vérifier.
- **Les ~40 RPC superadmin ne sont pas relues une par une.** J'ai vérifié que le garde-mot-de-passe (`check_superadmin_password`) est **uniformément présent**, mais pas audité le corps de chacune (fuite éventuelle dans une valeur de retour, faille logique, effet de bord). Risque résiduel jugé faible, non nul.
- **Pas de `npm audit`** ni de scan de CVE des dépendances front.
- **Config Auth Supabase non inspectée** : débit réel des `signInAnonymously` (défaut annoncé ~30/h/IP, **non vérifié**), réglages JWT, captcha. Détermine la faisabilité **à grande échelle** de A5 (inscription de masse) et B3. L'advisor Supabase signale aussi `leaked_password_protection` désactivé.
- **Journaux Postgres / PostgREST non vérifiés** : le mot de passe superadmin est passé en **argument** de chaque RPC. Apparaît-il dans les logs (`log_statement`, `pg_stat_statements`, traces d'erreur) ? Question ouverte.
- **Realtime `REPLICA IDENTITY FULL`** : plusieurs tables l'ont (nécessaire au fonctionnement) → le WAL transporte toutes les colonnes, dont `reclaim_code`. Sans effet aujourd'hui (la RLS de B4 laisse déjà tout passer), **mais à revérifier après avoir resserré la RLS de `session_members`** — sinon on referme la porte en laissant la fenêtre ouverte.
- **Supabase Storage non vérifié** (l'app ne semble pas l'utiliser — à confirmer).
- **A3 (brute-force des secrets) écarté** sur la foi d'une information non vérifiée : le responsable indique des secrets d'~12 caractères, majoritairement des lettres → brute-force en ligne hors de portée. **Non vérifié par force brute** (et il ne faut pas le faire). Le coût bcrypt est de 6 (faible) mais ne compte qu'en cas de fuite du hash, qui ne sort pas de la base.
- **Sous-projet `transcription-debat/`** : hors périmètre, et le restera (la transcription ne passera plus par l'app — décision prise). Non audité.
- **Un second projet Supabase existe** dans l'organisation (« Vote-assertions », `fcdhbgsqzvxepzvjweod`), **en pause**. Ancien, non audité. À supprimer s'il ne sert plus (réduction de surface).

**En résumé** : l'audit est **exhaustif sur la couche d'autorisation base de données** (RLS + fonctions), qui concentre l'essentiel du risque, et solide sur le front. Il n'est **pas** exhaustif sur les dépendances, la config Auth, les logs, et l'exploitation bout-en-bout. Les angles morts ci-dessus sont des vérifications de complétude, pas des pistes chaudes — mais ils restent à faire avant de déclarer le système sûr.

---

## 6. Points opérationnels (hors failles)

- **Hébergement** : rester sur Supabase. Les failles viennent de la **configuration RLS**, pas de la plateforme. Migrer ailleurs réintroduirait les mêmes problèmes + un coût énorme. Le modèle RLS de Supabase est le bon outil, il est juste mal réglé.
- **Sauvegardes** : le free tier ne garantit pas de backup. Un workflow a été **écrit** (non commité) : [.github/workflows/db-backup.yml](../.github/workflows/db-backup.yml) — `pg_dump` hebdomadaire (jeudi), **chiffré AES-256**, stocké en artefact GitHub. **Deux secrets à créer à la main** (`SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`) — ce sont des identifiants, à poser côté GitHub par un humain. **Le chiffrement est obligatoire** : sur un dépôt public, les artefacts d'Actions sont téléchargeables par tous. Ne jamais committer de dump dans le dépôt. Le cron ne s'active qu'une fois le fichier fusionné dans `main`.
- **Mise en pause** : le projet ne se met **pas** en pause tant que le workflow `keep-alive` (ping quotidien) tourne. Caveat : GitHub désactive les crons après 60 jours sans commit sur le dépôt.

---

## 7. Prochaine étape suggérée

Ce rapport est un **constat**, pas un plan. La suite logique : une session dédiée qui découpe les chantiers de correction, organisés autour des **3 causes racines** du §3 plutôt que des 19 symptômes. Ordre de priorité proposé :

1. **Resserrer les 5 policies RLS `USING (true)`** → neutralise A1(lecture), B4, B5, B6, A5, B2, B3 en grande partie. Vérifier ensuite l'impact `REPLICA IDENTITY FULL`.
2. **Fermer le canal Realtime** (Realtime Authorization / canaux privés) → A1.
3. **Sortir le mot de passe superadmin du navigateur + valider les URLs (`http`/`https` uniquement)** → B1.
4. **Découpler et granulariser les secrets de modération** (code par table/séance, révocable, expirable ; retirer le `DELETE` direct aux modérateurs) → A2, A4.
5. **Exiger une preuve de possession** sur les reprises d'identité → B3, B2, A6.
6. Durcissements C : quota/rate-limit sur `gemini-proxy` et `check_superadmin_password`, limites de longueur, `search_path`, coût bcrypt.

Avant de conclure quoi que ce soit : **refaire les vérifications du §5**, en particulier confirmer B1 en navigateur et auditer la config Auth Supabase.
