# Chantier 162 — Partager des sources avec sa table (lien, image, écran) : note de conception (2026-10-08)

> Conception menée **en discussion avec Jules** (session Opus dédiée). Rien n'est codé ni appliqué en base. **Conception arbitrée le 2026-10-08** (§ 9) : réalisation en **162a** (fil de partage + liens) puis **162b** (images) . Le partage d'écran en direct n'est **pas retenu comme chantier** (étude conservée au § 3).

## 1. Consigne et arbitrages

> **Consigne de Jules (2026-10-05)** : « Faire une discussion Opus sur ce sujet, pour savoir ce qu'il existe comme outil implémentable, à quel point c'est compliqué, qu'est ce que ça impliquerait, etc. : Partager son écran : on peut utiliser un outil annexe, mais ce serait de manière générale intéressante pour montrer des graphiques par exemple. Ou alors : Demander de source : pouvoir projeter ses sources aux autres, en utilisant le lien de sources individuelles. »

Cadre fixé le 2026-10-05 : débats **en présentiel**, partage **seulement avec sa table**, **le modérateur accepte ou refuse toujours**.

Arbitrages de Jules pendant la discussion (2026-10-08) :

- **Étudier d'abord la version « lourde »** : un vrai partage d'écran sur ordinateur, « un peu comme le fait Teams » (onglet, fenêtre ou écran entier), même si ça exclut le téléphone comme émetteur.
- **Sur téléphone** : partager un **lien**, soit une source du document collaboratif, soit un lien collé « à la volée » dans une fenêtre de partage. « On recréerait dans l'essence un chat, mais pour des sources, et uniquement pour des sources, car sinon cela pourrait créer des débats en parallèle. »
- **Image** : partager une **capture d'écran** (coller une image au lieu d'un lien).
- **Modérateur** : il voit le lien, l'image ou l'écran **avant** la table, pour contrôler sa pertinence ; puis accepte ou refuse.
- **Participant** : une carte qui affiche la source acceptée, et qui peut contenir l'écran partagé.
- **Moment** : à tout moment du débat.
- **Types de séance** : oui (séance complète et débat simple ; le sondage n'a pas de table).
- **Après la séance** : garder la **liste des liens**, **pas les images** (place), et les redonner notamment avec les sources collaboratives.

Arbitrages du second tour (2026-10-08), après lecture de l'étude du partage d'écran :

- « Partons plutôt sur des partages d'images, de captures d'écran, qu'on peut trouver dans son appareil ou copier directement à partir du presse-papiers. » → **le partage d'écran en direct n'est pas retenu** (§ 3 conservé pour mémoire).
- **Tables sans modérateur** : on ne propose pas le partage.
- **Découpage** 162a / 162b : validé. Pas de chantier pour l'écran en direct (Jules : « ne mets pas le chantier 162c »).
- **Associations** : « oui, on leur ouvre cette possibilité ».
- **Effacement des images** : « dès qu'on met la séance en closed ».

## 2. Ce qui existe déjà (vérifié dans le code et sur la base dev)

- **Une source du document collaboratif = `title` + `url` (facultatif) + `content` (texte, facultatif)** (`session_sources`). Aucune image, aucun stockage de fichier : l'app n'utilise pas Supabase Storage, et aucun écran n'affiche d'image venue d'un lien.
- **Les sources sont déjà lisibles par toute la séance** (RLS `true`, canal `collab:<session_id>`). Les « partager » n'ouvre aucun accès nouveau : c'est les **mettre sous les yeux de sa table, maintenant**.
- **Pas de document collaboratif dans une séance d'association** (chantier 135) — le partage « à la volée » (lien, image, écran) n'en dépend pas.
- **Le chantier 132 (« proposer un vote ») est le modèle le plus proche** : table dédiée (`table_votes`), colonne piggyback `tables.active_vote_id`, gardes `is_table_moderator` / `is_table_participant` dans chaque RPC, propagation par le broadcast `tables` du canal `table:<table_id>` (déjà privé, chantier 59) + polling 5 s. Aucun nouveau topic Realtime nécessaire pour l'état du partage.

## 3. Le partage d'écran (version « lourde ») — faisable, sur ordinateur uniquement — non retenu

> **Non retenu par Jules le 2026-10-08** au profit des captures d'écran (§ 5). Cette section reste comme étude de faisabilité, à reprendre telle quelle si le besoin revient. Le fil de partage (§ 4) est conçu pour accueillir un type `screen` plus tard sans refonte.

### 3.1 Ce que permet le navigateur

`navigator.mediaDevices.getDisplayMedia()` ouvre le sélecteur natif du navigateur (« Un onglet / Une fenêtre / L'écran entier ») — exactement le choix proposé par Teams ou Meet dans leur version web. Supporté par Chrome, Edge, Firefox et Safari **sur ordinateur**.

**Aucun navigateur mobile ne le supporte** : ni Safari iOS, ni Chrome Android, ni Firefox Android, ni Samsung Internet (caniuse, 2026), ni a fortiori le navigateur intégré à Messenger. Partager l'écran d'un téléphone n'est possible que depuis une application native — hors de portée d'une app web.

En revanche, **recevoir** une vidéo WebRTC marche sur téléphone (Safari iOS, Chrome Android, et les navigateurs intégrés récents) : un ordinateur peut partager vers des téléphones. Contraintes connues : `<video muted playsInline autoplay>` obligatoire sur iOS ; le navigateur intégré de Messenger est à tester (§ 8).

### 3.2 Comment la vidéo voyage

Il faut trois briques :

| Brique | Rôle | Solution proposée | Coût |
|---|---|---|---|
| **Signalisation** | échanger les « offres » WebRTC entre l'émetteur et chaque spectateur | le canal Realtime existant `table:<table_id>` (événement broadcast `rtc`, messages adressés à un membre) | inclus (messages Realtime du plan gratuit : quelques dizaines par spectateur) |
| **STUN** | découvrir son adresse publique | serveur STUN public (Google / Cloudflare) | gratuit |
| **TURN** (relais) | faire passer la vidéo quand la connexion directe est bloquée | Cloudflare Realtime TURN | **1 000 Go/mois gratuits**, puis 0,05 $/Go |

**Pourquoi le relais TURN n'est pas optionnel ici** : en présentiel, tout le monde est sur le Wi-Fi du lieu ou en 4G. Les Wi-Fi « invités » isolent souvent les appareils entre eux, et la 4G passe derrière un NAT d'opérateur : la connexion directe échoue alors, et sans relais l'écran ne s'affiche jamais chez une partie de la table. Les identifiants TURN se génèrent côté serveur (nouvelle Edge Function, sur le modèle de `gemini-proxy`, qui vérifie que l'appelant est bien assis à la table) — la clé Cloudflare ne doit jamais être dans le bundle.

**Ordre de grandeur de consommation** : un écran à 5 images/s, 1280 px de large ≈ 0,5–1 Mbit/s par spectateur. Un partage de 10 min vers 8 personnes, entièrement relayé (pire cas) ≈ 0,4–0,6 Go. Le quota gratuit couvre plus de 1 500 partages par mois.

### 3.3 Deux architectures possibles

| | **A. Maillage direct (recommandé)** | **B. Serveur vidéo géré (SFU)** |
|---|---|---|
| Principe | l'ordinateur envoie un flux à chaque spectateur | l'ordinateur envoie un seul flux à un serveur, qui le redistribue |
| Envoi depuis l'ordinateur | 1 flux × N spectateurs (8 × 1 Mbit/s = 8 Mbit/s) | 1 flux |
| Dépendance | aucune bibliothèque ; Cloudflare pour le relais seulement | SDK + compte LiveKit Cloud ou Cloudflare Realtime SFU |
| Limite gratuite | 1 000 Go/mois (Cloudflare) | LiveKit : 5 000 minutes-participant/mois, **coupure sèche** une fois dépassé ; Cloudflare SFU : 1 000 Go/mois partagés avec le TURN |
| Adapté à | tables de ≤ ~10 personnes | grandes tables, ou plusieurs partages simultanés sur un Wi-Fi faible |

**Recommandation : A.** Les tables Ecclesia font rarement plus de 8–10 personnes, la signalisation réutilise un canal déjà sécurisé, et il n'y a pas de quota qui coupe en pleine séance. Risque à surveiller : plusieurs tables qui partagent en même temps sur un Wi-Fi faible (le débit sortant s'additionne) — on bride l'écran (5 images/s, 1280 px) et on n'autorise **qu'un partage actif par table**.

### 3.4 Le contrôle du modérateur, appliqué à l'écran

1. Le participant (sur ordinateur) clique « Partager mon écran » → sélecteur du navigateur.
2. Le flux part **vers le modérateur seul** : il voit l'écran en direct, en aperçu, avant tout le monde.
3. « Accepter » → l'émetteur ouvre la connexion avec chaque membre de la table. « Refuser » → le flux s'arrête.
4. Le modérateur peut **arrêter** le partage à tout moment ; l'émetteur aussi (ou en fermant son onglet).

Garde : un spectateur n'accepte une offre vidéo que si la base indique un partage d'écran **accepté**, venant de **ce** membre (`tables.active_share_id`). Un client modifié ne peut donc pas imposer son écran aux autres.

Pas de son (présentiel), pas d'enregistrement.

### 3.5 Coût de réalisation

C'est la partie la plus lourde du chantier, comparable au plus gros chantier front récent : gestion des connexions par spectateur, arrivée en cours de partage, reconnexion, Wi-Fi qui coupe, nettoyage quand l'émetteur ferme l'onglet, Edge Function TURN, compte Cloudflare à créer (geste de Jules). Elle se teste mal au Browser pane seul (deux appareils réels nécessaires) → beaucoup d'`A_VERIFIER`. À faire **en dernier**, une fois le fil de partage (§ 4) en place.

## 4. Le fil de partage de la table (« un chat, uniquement pour des sources »)

Un seul mécanisme porte les trois formes de partage. Chaque élément du fil est une demande :

| Type | Ce que le participant fournit | Depuis |
|---|---|---|
| `collab_source` | une de **ses** sources du document collaboratif | téléphone ou ordinateur |
| `link` | un lien collé + un titre court | téléphone ou ordinateur |
| `image` | une capture d'écran (coller, glisser, ou choisir dans la galerie) + un titre court | téléphone ou ordinateur |
| ~~`screen`~~ | un partage d'écran en direct — **non retenu**, pas dans la contrainte `kind` de 162a/162b | ordinateur seulement |

**Pas de texte libre** au-delà d'un titre court (≈ 80 caractères) : c'est ce qui empêche le fil de devenir un chat et d'ouvrir des débats parallèles.

**Parcours** :
- **Participant** : bouton « Partager une source » (Outils) → choix du type → envoi. Il voit sa demande « en attente », puis « montrée » ou « non retenue ».
- **Modérateur** : les demandes en attente apparaissent avec leur **contenu complet** (lien cliquable, image, aperçu de l'écran), et deux boutons Accepter / Refuser.
- **Table** : la source acceptée s'affiche en **grande carte** (titre, qui la montre, lien ou image, ou l'écran en direct). En dessous, le fil des sources déjà montrées pendant ce débat. Une nouvelle acceptation remplace la carte ; le modérateur peut aussi la retirer. Les demandes refusées ne sont jamais vues par la table.

**Modèle de données proposé** :

- `table_shares` : `id`, `table_id`, `session_id`, `member_id` (qui partage), `kind`, `title`, `url`, `source_id` (si `collab_source`), `image_path` (si `image`), `status` (`pending` / `accepted` / `refused` / `ended`), `created_at`, `decided_at`.
- `tables.active_share_id` (piggyback, comme `active_vote_id`).
- RPC : `request_table_share` (garde `is_table_participant`), `decide_table_share` / `end_table_share` (garde `is_table_moderator`), `list_table_shares` (la table voit les acceptées, le modérateur voit tout, l'auteur voit les siennes).
- RLS : aucune lecture directe large ; tout passe par les RPC.

## 5. Images (captures d'écran)

**Possible, sur les deux supports** :
- ordinateur : Ctrl+V d'une capture, glisser-déposer, ou sélection de fichier ;
- téléphone : on fait la capture avec le téléphone, puis on la choisit dans la galerie (le collage depuis le presse-papiers marche sur certains téléphones, pas tous).

**Où la mettre** : Supabase Storage, dans un bucket **privé** `table-shares`, fichier `<table_id>/<share_id>.webp`. L'image est **réduite dans le navigateur** avant envoi (1600 px max, WebP) → ≈ 150–400 Ko. Le plan gratuit offre 1 Go : des milliers d'images.

**Qui la voit** (politiques de stockage, mêmes helpers) : en attente → son auteur et le modérateur de la table ; acceptée → toute la table. Jamais un lien public.

**Alternative écartée** : faire transiter l'image par le broadcast Realtime (≤ 256 Ko sur le plan gratuit). Tous les clients de la table la recevraient avant l'accord du modérateur, et un arrivant tardif ne la verrait jamais.

**Effacement des images — à la clôture de la séance (`closed`), arbitré par Jules.** La ligne `table_shares` reste, marquée « image non conservée » (`image_path` remis à NULL, `image_purged_at` posé).

Mécanisme (vérifié sur la base dev le 2026-10-08) : **un fichier de Storage ne peut pas être supprimé par SQL** — `storage.objects` porte le trigger `protect_objects_delete` (`storage.protect_delete()`), qui refuse tout `DELETE` direct. La suppression passe donc par l'API de stockage, avec la clé `service_role`, côté serveur :
- nouvelle Edge Function `purge-share-images`, appelée par `SuperadminScreen` juste après un passage réussi en `closed` (superadmin **et** association : elle vérifie `check_session_admin(p_password, session_id)` et `phase = 'closed'`) ;
- **filet de sécurité** : à chaque appel, la fonction purge aussi les images de **toutes** les séances déjà closes qui en auraient encore (appel raté, onglet fermé trop tôt, séance close par une autre voie). La purge se rattrape donc à la clôture suivante, n'importe laquelle ;
- `set_session_phase` refuse déjà de revenir en arrière depuis `closed` ? **À vérifier en 162b** (chantier 127, remise en phase antérieure) : si une séance close peut être rouverte, ses images sont perdues — c'est le comportement voulu, à dire dans la confirmation de clôture si le superadmin l'a déjà.

Conséquence assumée : une séance qui n'est **jamais** clôturée garde ses images. Le plan gratuit (1 Go) laisse une large marge ; l'onglet séances du superadmin pourra signaler les séances anciennes non closes si ça devient un sujet.

## 6. Après la séance

- **Liens** (`link` et `collab_source`) conservés, avec titre, auteur et table.
- **Restitution** : dans le document collaboratif, une section « Montrées pendant les débats », groupée par table, qui reprend les liens acceptés.
- **Images** : effacées, la ligne reste sans fichier.
- **Écrans** : rien à conserver (on peut garder la mention « Marie a partagé son écran »).

## 7. Types de séance et associations

| | Fil de liens / images | Écran (en pause) | Restitution après séance |
|---|---|---|---|
| Séance complète (`full`) | oui | — | dans le document collaboratif |
| Débat simple (`debate`) | oui | — | dans le document collaboratif |
| Sondage (`poll`) | non (pas de table) | — | — |
| Association | **oui** (Jules, 2026-10-08) — liens et images, pas de type `collab_source` | — | pas de document collaboratif : les liens restent en base, sans écran de restitution pour l'instant |

Pour les associations, rien de spécifique côté serveur : les gardes sont `is_table_participant` / `is_table_moderator`, qui valent pour toute table, et la purge passe par `check_session_admin` (accepte le jeton `org_…` pour ses séances). Côté écran, seul le choix « Une de mes sources collaboratives » est masqué (`useSessionOrganizationName`, comme le reste du document collaboratif).

**Table sans modérateur (`leaderless`)** — arbitré : **pas de partage**. Le bouton « Partager une source » n'apparaît pas tant que la table n'a pas de modérateur (règle du chantier 152), et `request_table_share` refuse côté serveur (`table_has_moderator`).

## 8. Ce qui devra être vérifié sur appareils réels

Le Browser pane joue un participant et un modérateur dans deux onglets (fil, accepter/refuser, carte, purge à la clôture). Il ne sait pas jouer : le collage d'une image depuis le presse-papiers d'un vrai téléphone, le choix dans la galerie sur iPhone/Android, le navigateur intégré de Messenger → `A_VERIFIER.md`.

(Si le partage d'écran est un jour repris : partage d'écran ordinateur → téléphone sur le Wi-Fi d'un lieu réel, réception iPhone Safari/Messenger, réception en 4G, deux tables qui partagent en même temps.)

## 9. Décisions (2026-10-08) et réalisation

| Question | Décision de Jules |
|---|---|
| Version lourde (écran en direct) | étudiée (§ 3), **non retenue** au profit des captures d'écran |
| Découpage | **162a** puis **162b** ; pas de chantier pour l'écran en direct |
| Tables sans modérateur | pas de partage |
| Associations | ouvert (liens et images) |
| Effacement des images | à la clôture (`closed`) |
| Moment | à tout moment du débat |
| Types de séance | séance complète et débat simple ; pas le sondage |

**162a — Fil de partage de la table : liens et sources collaboratives.** Migration : `table_shares` (sans `image_path` ou avec, inutilisé), `tables.active_share_id`, RPC `request_table_share` / `decide_table_share` / `end_table_share` / `list_table_shares`, broadcast `tables` + `table_shares` sur le canal de table. Écrans : `ParticipantToolsButton` (« Partager une source »), fenêtre de partage (choix d'une de ses sources collaboratives ou lien collé + titre), carte et fil dans `ParticipantView`, demandes en attente dans `ModeratorView` / `ModeratorToolsButton`, état dans `TableContext`. Restitution « Montrées pendant les débats » dans `CollabDocScreen`. URL validée par `isSafeUrl` côté client **et** contrainte SQL (comme le chantier 52).

**162b — Captures d'écran.** Bucket privé `table-shares` + politiques de stockage, réduction de l'image dans le navigateur, collage / glisser / galerie, aperçu chez le modérateur, Edge Function `purge-share-images` appelée à la clôture. Dépend de 162a.

**Écran en direct** — pas de chantier ouvert. Si un jour repris : compte Cloudflare à ouvrir par Jules (relais TURN), Edge Function d'identifiants TURN, architecture A du § 3.3.

## Sources

- [Cloudflare Realtime — tarifs SFU et TURN](https://developers.cloudflare.com/realtime/sfu/pricing)
- [LiveKit Cloud — quotas et limites](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
- [Supabase Realtime — limites (taille des broadcasts)](https://supabase.com/docs/guides/realtime/limits)
- [caniuse — `getDisplayMedia()`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia)
