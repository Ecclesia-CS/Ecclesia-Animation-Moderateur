# Retour arrière — merge `dev` → `main` du 2026-09-30

Ce merge a fait passer la prod de `bd9beea` (tag **`pre-merge-dev-20260930`**) aux chantiers 131 à 144,
avec **14 migrations** appliquées sur la base prod (`plpjiehqsxxakbuykmkm`) juste avant.
Deux moitiés indépendantes à défaire : le **code** (git/déploiements) et la **base**.

## Filet de sécurité posé avant les migrations

- Tag git `pre-merge-dev-20260930` (poussé sur `origin`) = état exact de `main` avant le merge.
- Schéma Postgres `rollback_20260930` **dans la base prod**, inaccessible à `anon`/`authenticated` :
  `fn_defs` (définition + ACL des 133 fonctions `public`), `fn_grants`, `policies`, `col_privs`,
  `tbl_privs`, `triggers`, `constraints`, et copies complètes de `collab_session_users` (5 lignes, supprimée
  par le 142), `session_members`, `participants`, `session_sources`, `assertions`, `sessions`, `tables`,
  `queue_entries`, `reclaim_attempts`.
  À supprimer (`DROP SCHEMA rollback_20260930 CASCADE`) une fois le merge jugé stable : il contient des noms réels.
- La sauvegarde quotidienne du chantier 85 reste l'ultime recours (et la seule qui couvre les données
  créées *après* le merge).

## 1. Code

```bash
# GitHub Pages : repartir de l'état d'avant
git revert -m 1 <sha du merge commit>   # commit de retour, sans réécrire l'historique
git push origin main
```

Vercel (prod) : dashboard → Deployments → redéployer le dernier déploiement d'avant le merge (« Instant Rollback »),
ou l'outil `request_rollback`.

## 2. Base — à ne faire que si le code a été ramené en arrière

Les tables et colonnes ajoutées (`table_votes*`, `organizations*`, `sessions.session_type`/`organization_id`,
`participants.wants_next_topic`, `queue_entries.topic_tag`, `tables.active_vote_id`, `session_sources.member_id`)
sont **additives et inoffensives** pour l'ancien code : on les laisse. Ce qu'il faut rétablir, ce sont les
**fonctions** (signatures changées : `create_session` 8 → 9 args, `add_to_queue` 4 → 5 args, `list_session_sources`
type de retour, `register_collab_pseudo` supprimée) et la table `collab_session_users`.

> Script **testé à blanc sur prod le 2026-09-30** (transaction volontairement annulée en fin de course — résultat
> ci-dessous). À jouer dans une transaction (`BEGIN; … ROLLBACK;` d'abord, puis `COMMIT`).

```sql
BEGIN;

-- a. Objets qui dépendent de fonctions nouvelles : le trigger de quota d'association
--    et l'index d'unicité insensible à la casse (140b, basé sur pseudo_key).
DROP TRIGGER IF EXISTS sessions_org_rules ON public.sessions;
DROP INDEX IF EXISTS public.session_members_session_pseudo_key_uniq;

-- b. Supprimer les fonctions absentes de l'instantané (nouvelles surcharges comprises).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
      AND p.oid::regprocedure::text NOT IN (SELECT signature FROM rollback_20260930.fn_defs)
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

-- c. Rejouer les définitions d'origine (drop + create si le type de retour a changé).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT signature, def FROM rollback_20260930.fn_defs LOOP
    BEGIN
      EXECUTE r.def;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'DROP FUNCTION ' || r.signature;
      EXECUTE r.def;
    END;
  END LOOP;
END $$;

-- d. Droits d'exécution d'origine (PUBLIC compris : REVOKE ALL le retire, on le redonne si besoin).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT signature, acl FROM rollback_20260930.fn_defs LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.signature || ' FROM PUBLIC, anon, authenticated, service_role';
    IF r.acl IS NULL OR r.acl ~ '(^\{|,)=X/' THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.signature || ' TO PUBLIC';
    END IF;
  END LOOP;
  FOR r IN SELECT signature, grantee FROM rollback_20260930.fn_grants LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.signature || ' TO ' || r.grantee;
  END LOOP;
END $$;

-- e. Table supprimée par le 142.
CREATE TABLE public.collab_session_users (
  session_id    uuid,
  pseudo        text,
  user_id       uuid,
  registered_at timestamptz,
  CONSTRAINT collab_session_users_pkey PRIMARY KEY (session_id, pseudo),
  CONSTRAINT collab_session_users_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE
);
INSERT INTO public.collab_session_users SELECT * FROM rollback_20260930.collab_session_users;
ALTER TABLE public.collab_session_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY collab_session_users_select_own ON public.collab_session_users
  FOR SELECT USING (user_id = auth.uid());
GRANT ALL ON public.collab_session_users TO anon, authenticated, service_role;

-- f. Le seul nom modifié par la 140b (doublon de casse, séance close du 03/06).
UPDATE public.session_members m SET pseudo = s.pseudo
FROM rollback_20260930.session_members s WHERE s.id = m.id AND s.pseudo <> m.pseudo;
UPDATE public.participants p SET pseudo = s.pseudo
FROM rollback_20260930.participants s WHERE s.id = p.id AND s.pseudo <> p.pseudo;

COMMIT;
```

**Résultat du test à blanc (2026-09-30)** : 133/133 fonctions identiques à l'instantané (définition), 133/133 ACL
identiques, `collab_session_users` recréée avec ses 5 lignes, nom `LOULOU` rétabli, une seule surcharge de
`create_session` et de `add_to_queue` (les anciennes). Premier essai échoué sur l'index `pseudo_key` — d'où l'étape a.

Les lignes créées depuis le merge dans les nouvelles tables (votes de table, associations…) restent en base,
simplement ignorées par l'ancien code.

## Ce que le merge a modifié dans les données existantes (prod, 2026-09-30)

- `LOULOU` → `LOULOU (2)` (séance close du 03/06, doublon de casse, migration 140b) — seul changement de nom.
- `reclaim_attempts` vidée (compteur anti-force-brute d'une minute, sans valeur durable).
- `collab_session_users` supprimée (5 lignes, copiées dans `rollback_20260930`).
- Aucune séance active, aucun participant ni vote supprimé.
