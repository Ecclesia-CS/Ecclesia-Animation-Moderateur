# Chantier 135 — Comptes associations externes : note de conception (2026-09-26)

> Proposition soumise à Jules **avant tout code**, comme au chantier 134. Rien n'est appliqué en base ni codé à ce stade.

## Consigne de Jules (2026-09-26, au lancement)

> « Dans ce chantier, nous lançons une utilisation par des personnes extérieures, à qui je donnerai un autre mot de passe, et je devrai avoir créé un compte (en mettant le nom de leur asso par exemple) pour qu'elles puissent se connecter. Les utilisations seront limitées, pas besoin de questionnaire post débat ou utilisation du sondage, car ce sont des assos extérieures, juste du partage de technologie pure et dure. »

Ce qui change par rapport à l'entrée initiale de `chantiers-a-faire.md` (« sondage + table de modérateur ») : **le sondage sort du périmètre**, et le questionnaire de fin aussi. Il reste le **débat simple** (type `debate` du 134) — à confirmer, question 1.

## Ce que j'ai vérifié (base dev + code)

- **Tout le pouvoir d'administration repose sur un seul mot de passe.** 57 RPC prennent `p_password` et appellent `check_superadmin_password(p_password)` (bcrypt contre `app_config.superadmin_code_hash`). Il n'existe aucune notion de propriétaire d'une séance : qui a le mot de passe voit et modifie **toutes** les séances. Donner ce mot de passe à une asso est donc exclu.
- **La prise de modération exige le Code Ecclesia** (`app_config.creation_code_hash`) : `claim_table_as_moderator`, `claim_moderator_status`, `join_simple_debate`, `reclaim_*`, `create_table`. Un modérateur d'asso ne peut pas l'avoir non plus — il lui faut son propre code.
- **L'accueil public liste toutes les séances en cours** (`EntryScreen`, `from('sessions')…in('phase', …debating)`) : une séance d'asso apparaîtrait sur la page d'accueil d'Ecclesia, à côté des vôtres.
- **Le débat simple du 134 couvre déjà le parcours participant** : QR → « Assignez-moi une table » / code de table → `TableView` ; ajout de tables et déplacements depuis l'onglet Tables. Rien à réécrire côté participant.

## Proposition

### Modèle

Nouvelle table `organizations` :

| colonne | rôle |
|---|---|
| `id`, `name` | nom de l'asso, affiché |
| `password_hash` | bcrypt, **jamais relu** (même règle que les autres hash) |
| `active` | désactiver un compte sans rien supprimer |
| `max_open_sessions` (ou autre limite, question 4) | « utilisations limitées » |
| `created_at`, `note` | usage interne |

`sessions.organization_id uuid NULL` → `NULL` = séance Ecclesia (toutes les séances existantes, rien ne change pour elles).

RLS : aucune lecture directe de `organizations` par `anon`/`authenticated` ; tout passe par des RPC SECURITY DEFINER.

### Autorisation — un seul helper, pas 57 réécritures

`check_session_admin(p_password, p_session_id)` : passe si **mot de passe superadmin** (tout est permis, comme aujourd'hui) **ou** mot de passe d'une asso active **propriétaire de cette séance**. On ne remplace `check_superadmin_password` par ce helper **que dans les RPC nécessaires au débat simple** (création, liste, phase, QR/tables, modérateur, déplacements, historique des tables — une quinzaine). Les autres (analyse, assertions, allocation, IA…) restent superadmin-only : une asso qui tenterait de les appeler se heurte au refus actuel. C'est du fail-closed : on ouvre au cas par cas, on n'ouvre rien par défaut.

`create_session` côté asso : forcé à `session_type = 'debate'`, `organization_id` posé par le serveur d'après le mot de passe (jamais un paramètre du client), limite de la question 4 vérifiée.

**Code modérateur** : `claim_table_as_moderator` & co. acceptent, pour une table d'une séance d'asso, le mot de passe de l'asso (ou un code modérateur distinct, question 3) au lieu du Code Ecclesia — et **seulement** celui-là (le code d'une asso n'ouvre rien chez une autre).

### Interfaces

- **Toi (superadmin)** : un nouvel onglet « Associations » dans `#superadmin` — créer un compte (nom + mot de passe que tu choisis ou généré), désactiver/réactiver, changer le mot de passe, voir ses séances. Dans ta liste de séances, un badge « Asso : X » sur les leurs (tu les vois toutes).
- **L'asso** : un écran dédié `#asso`, pas le superadmin actuel bridé. Connexion par mot de passe → « Mes débats » → créer un débat (titre, date) → fiche du débat : QR/lien, bouton Ouvrir / Clôturer, liste des tables (ajouter une table, voir qui est assis, déplacer, désigner le modérateur). Les composants de l'onglet Tables sont réutilisés, pas dupliqués. Raison : `SuperadminScreen.tsx` fait 5 700 lignes, onglets IA/analyse/allocation compris ; masquer 80 % d'un écran conçu pour autre chose, c'est un risque de fuite à chaque futur chantier qui y ajoute un bouton.
- **Accueil public** : les séances d'asso **exclues** de la liste de `EntryScreen` (on n'y entre que par leur QR/lien).
- **Fin de débat** : pas de questionnaire (consigne) — simple écran « Débat terminé ».

### Découpage

- **135a — socle** : table `organizations`, colonne `sessions.organization_id`, helper, onglet « Associations » du superadmin, filtre de l'accueil.
- **135b — espace asso** : écran `#asso`, ouverture des ~15 RPC du débat simple, code modérateur, suppression du questionnaire pour ces séances.

Chaque migration : dev d'abord, prod au merge (`CLAUDE.md` § Environnements), comparaison `pg_get_functiondef` avant toute réécriture de fonction.

### Question transverse (règle du 134)

Les séances d'asso sont de type `debate` : tout changement futur sur le débat simple les concerne aussi. Je propose d'ajouter à la règle de `CLAUDE.md` : « …et se demander si ça doit être ouvert aux séances d'asso (fail-closed par défaut) ».

## Questions pour Jules (mes recommandations en gras)

1. **Périmètre** : je lis « pas besoin … d'utilisation du sondage » comme : les assos n'ont **que le débat simple** (une ou plusieurs tables modérées, sans vote). C'est bien ça ? → **oui, débat simple seul** ; le sondage pourra s'ouvrir plus tard avec le même mécanisme.
2. **Mot de passe** : un mot de passe **par asso** (tu le choisis à la création du compte, tu peux le changer), plutôt qu'un mot de passe commun à toutes les assos + nom du compte ? → **un par asso** : c'est ce qui isole leurs données, et tu peux couper une asso sans toucher les autres.
3. **Qui modère chez eux** : la personne qui se connecte au compte de l'asso anime-t-elle elle-même, ou confie-t-elle la table à quelqu'un d'autre ? → **un code modérateur distinct, généré par séance** et affiché sur la fiche du débat : l'asso le donne à ses animateurs sans leur donner les clés du compte. (Alternative plus simple : le mot de passe de l'asso sert aussi de code modérateur.)
4. **« Utilisations limitées »** : limité comment ? Pistes : nombre de débats ouverts en même temps (ex. 2), nombre total de débats, date d'expiration du compte, nombre de tables par débat. → **débats ouverts simultanément + date d'expiration facultative**, réglables par compte.
5. **Visibilité des données** : tu vois leurs débats (historique des tables, temps de parole) depuis ton superadmin ? Et à la clôture, rien de public ? → **oui tu vois tout, rien de public** ; purge des codes de rappel à la clôture comme partout.
6. **Nom de l'asso côté participant** : afficher « Débat organisé par <asso> » sur l'écran d'entrée et la table ? → **oui**, discret : utile pour qu'un participant sache qu'il n'est pas chez Ecclesia.
7. **Documentation et liens Ecclesia** (règles du débat, docs biais cognitifs/arguments fallacieux, bouton Outils → document collaboratif) : on les laisse aux assos ? → **règles du débat et fiches pédagogiques oui, document collaboratif non** (lié aux sources d'une séance Ecclesia).
8. **Mode d'emploi** : veux-tu une petite page d'aide imprimable/envoyable aux assos (se connecter, créer un débat, afficher le QR, donner le code modérateur) ? → **oui**, courte, je la rédige à la fin du 135b.
