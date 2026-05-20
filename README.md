# Ecclesia — Modérateur de débat

Application web temps réel de modération de débat pour clubs.

---

## Prérequis

- Node.js ≥ 18
- Un projet [Supabase](https://supabase.com) (tier gratuit suffisant)

---

## 1. Créer le projet Supabase

1. Créez un compte sur [supabase.com](https://supabase.com) et créez un nouveau projet.
2. Dans **Project Settings → API** :
   - Copiez **Project URL** → valeur de `VITE_SUPABASE_URL`
   - Copiez **anon / public key** → valeur de `VITE_SUPABASE_ANON_KEY`

> La clé `anon` est **publique** : elle peut figurer dans le front-end et être commitée.
> Ne commitez **jamais** la clé `service_role`.

---

## 2. Variables d'environnement

```bash
cp .env.example .env
# Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
```

`.env` est ignoré par Git (voir `.gitignore`).

---

## 3. Activer l'authentification anonyme

Dans votre dashboard Supabase :
**Authentication → Providers → Anonymous Sign-ins** → activez l'option.

L'application utilise **uniquement** cette méthode : pas d'email, pas d'OTP.

---

## 4. Appliquer les migrations

### Via le CLI Supabase (recommandé)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <votre-project-ref>
supabase db push
```

### Via le SQL Editor du dashboard

Copiez le contenu de [`supabase/migrations/20260520000000_initial_schema.sql`](supabase/migrations/20260520000000_initial_schema.sql)
et exécutez-le dans **SQL Editor → New query**.

---

## 5. Définir le code de création du club

Ce code protège la création de nouvelles sessions de débat.
Exécutez cette commande **une seule fois** dans le **SQL Editor** de votre dashboard
(remplacez `VOTRE_CODE_SECRET` par votre vrai code) :

```sql
UPDATE app_config
SET value = crypt('VOTRE_CODE_SECRET', gen_salt('bf'))
WHERE key = 'creation_code_hash';
```

> **Règle absolue :** ce code ne doit **jamais** figurer dans le code source,
> dans un fichier commité, ni dans les logs.
> Partagez-le uniquement (hors-bande) avec l'organisateur du club.

La migration insère un hash du mot `PLACEHOLDER` comme valeur initiale.
Tant que vous n'avez pas exécuté la commande ci-dessus, la création de session
échouera — c'est voulu.

---

## 6. Lancer l'application

```bash
npm install
npm run dev
```

Ouvrez [http://localhost:5173](http://localhost:5173).

---

## Structure du projet

```
.
├── .env.example                          # Variables requises (à copier en .env)
├── index.html
├── supabase/
│   └── migrations/
│       └── 20260520000000_initial_schema.sql   # Tables, RLS, fonctions SQL
└── src/
    ├── lib/
    │   └── supabase.ts                   # Client Supabase + auth anonyme
    ├── components/
    │   └── TestScreen.tsx                # Écran de test (créer/rejoindre/reprendre)
    ├── App.tsx                           # Init auth anonyme
    └── main.tsx
```

---

## Modèle de sécurité

| Couche | Mécanisme |
|---|---|
| Authentification | Anonymous Sign-in Supabase (chaque onglet/session obtient un `user_id` UUID unique) |
| Accès aux données | Row Level Security sur les 4 tables |
| Identité modérateur | `sessions.created_by = auth.uid()` ; transférable via `reclaim_moderator` |
| Codes secrets | Stockés uniquement sous forme de hash bcrypt (`pgcrypto.crypt`), jamais renvoyés au client |
| Clé anon | Publique, dans le front-end — normal et sans risque avec RLS activé |
| Clé service_role | Ne doit **jamais** apparaître dans le code front ni être commitée |

Les fonctions `create_session`, `join_session` et `reclaim_moderator` sont en
`SECURITY DEFINER` : elles s'exécutent avec les droits du propriétaire de la base
pour contourner RLS de façon contrôlée, sans jamais exposer les hashes.
