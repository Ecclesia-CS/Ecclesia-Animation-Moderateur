import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Chantier 59 — ouverture d'un canal Realtime **privé**.
 *
 * Un canal privé fait évaluer les policies de `realtime.messages` au
 * moment du `join` (migration `20260906_chantier59_realtime_canaux_prives.sql`).
 * Passer par ce helper plutôt que par `supabase.channel()` directement
 * garantit qu'aucun canal n'est oublié en public, et donne un point unique
 * pour revenir en arrière si besoin (voir « Rollback » plus bas).
 *
 * ── Ce que ça change, et ce que ça ne change pas ──
 * · **Broadcast** : c'était le trou (F6). Sur un canal public, n'importe
 *   qui connaissant un `table_id` pouvait émettre un `refresh` et
 *   déclencher un refetch REST chez tous les clients de la table. Le
 *   chantier 53 a plafonné la réception ; ici on ferme l'émission.
 * · **`postgres_changes`** : strictement inchangé. La doc Supabase est
 *   explicite — les lignes ne sont livrées qu'aux clients autorisés par
 *   les policies RLS de la table, et « private and public channels can
 *   subscribe to Postgres Changes ». Les canaux qui ne font que du
 *   `postgres_changes` passent en privé par cohérence (voir juste en
 *   dessous), pas parce qu'ils gagnent une protection.
 *
 * ── ⚠️ Pourquoi TOUS les canaux, et pas seulement celui qui broadcaste ──
 * Rendre `table:<id>` privé ne suffit pas : tant que le réglage projet
 * « Allow public access » (dashboard → Realtime → Settings) est activé, un
 * attaquant rejoint le MÊME topic en mode public et y émet quand même.
 * Fermer F6 impose donc de désactiver ce réglage — et ce réglage est
 * **global** : une fois désactivé, tout canal resté public est refusé,
 * partout. D'où la règle : **tout canal de l'app passe par ce helper**.
 *
 * ── ⚠️ Ajouter un canal plus tard ──
 * `can_join_realtime_topic()` est *fail-closed* : tout topic qu'elle ne
 * connaît pas est refusé. Ajouter un `.channel()` sans ajouter la branche
 * correspondante dans cette fonction SQL produira un canal qui ne se
 * connecte jamais. Nommer les topics `préfixe:<uuid>` et tenir la fonction
 * à jour. Le garde-fou `console.error` ci-dessous est là pour que cet
 * oubli se voie tout de suite plutôt qu'en séance.
 *
 * ── Rollback ──
 * Remplacer `{ config: { private: true } }` par rien : tous les canaux
 * redeviennent publics d'un coup. À faire uniquement si « Allow public
 * access » est (re)activé, sinon plus rien ne se connecte.
 */
export function privateChannel(name: string): RealtimeChannel {
  const channel = supabase.channel(name, { config: { private: true } })

  // ── Garde-fou de diagnostic (chantier 59) ────────────────────────
  // Sous canal privé, un `join` refusé par les policies remonte comme
  // `CHANNEL_ERROR`. Or 6 des 8 canaux de l'app appellent `.subscribe()`
  // SANS callback : l'échec serait totalement muet, et l'écran resterait
  // figé sans erreur — exactement le mode de régression identifié comme
  // risque n°1 de ce chantier dans le plan sécurité (« une policy trop
  // stricte fige les écrans sans erreur visible »).
  //
  // On enveloppe donc `subscribe` pour journaliser l'échec, en relayant
  // le callback d'origine intact (TableContext s'en sert pour sa
  // resynchronisation après coupure WebSocket — ne pas le court-circuiter).
  //
  // Volontairement `console.error` et rien d'autre : aucune UI d'erreur,
  // aucun retrait de canal, aucune tentative de reconnexion propre. Les
  // quatre couches de rattrapage existantes (mise à jour locale après RPC,
  // broadcast, polling 5 s, surveillance WebSocket) restent seules maîtres
  // du comportement — elles couvrent déjà le cas « WebSocket coupé », qui
  // est le quotidien des navigateurs in-app de Messenger.
  const subscribe = channel.subscribe.bind(channel)
  channel.subscribe = ((
    callback?: Parameters<RealtimeChannel['subscribe']>[0],
    timeout?: number,
  ) =>
    subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(
          `[realtime] canal privé "${name}" — ${status}. ` +
            'Causes possibles : policy realtime.messages absente pour ce topic ' +
            '(voir can_join_realtime_topic), utilisateur non autorisé sur ce ' +
            'canal, ou simple coupure réseau/WebSocket.',
          err,
        )
      }
      callback?.(status, err)
    }, timeout)) as RealtimeChannel['subscribe']

  return channel
}
