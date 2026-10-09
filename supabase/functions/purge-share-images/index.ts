// =============================================================
// Edge Function : purge-share-images (chantier 162b)
// Efface les captures d'écran partagées aux tables (bucket Storage privé
// `table-shares`) des séances closes. Un fichier de Storage ne peut pas être
// supprimé en SQL (trigger storage.protect_delete) : seule l'API de stockage,
// avec la clé service_role, le permet — d'où cette fonction.
//
// Appelée par l'écran d'administration juste après un passage en `closed`
// (superadmin ou association). Autorisation : un JWT Supabase valide (verify_jwt)
// ET le mot de passe / jeton d'administration de la séance, vérifié DANS la fonction
// SQL purge_share_images_list (check_session_admin n'est pas appelable d'ici).
//
// Filet de sécurité : la fonction purge les images de TOUTES les séances déjà
// closes, pas seulement de celle qui l'appelle — un appel raté ou une séance close
// par une autre voie est rattrapé à la clôture suivante.
//
// Les lignes table_shares gardent leur titre ; elles perdent image_path et
// reçoivent image_purged_at (finalize_share_image_purge).
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const BUCKET = 'table-shares'
const BATCH = 100
const MAX_BODY_BYTES = 2_000

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' })

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'Requête trop volumineuse' })

  let payload: { session_id?: unknown; password?: unknown }
  try { payload = JSON.parse(raw) } catch { return reply(400, { error: 'Requête illisible' }) }
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  if (!sessionId || !password) return reply(400, { error: 'session_id et password requis' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return reply(500, { error: 'Configuration serveur incomplète' })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Liste + contrôle du mot de passe dans la même fonction SQL.
  const { data: rows, error: listErr } = await admin.rpc('purge_share_images_list', {
    p_password: password,
    p_session_id: sessionId,
  })
  if (listErr) {
    const msg = String(listErr.message ?? '')
    const denied = /mot de passe|password|non autoris|not authorized|refus|invalide/i.test(msg)
    return reply(denied ? 403 : 500, { error: denied ? 'Accès refusé' : msg })
  }

  const names = (rows as { name: string }[] | null ?? []).map(r => r.name)
  let removed = 0
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH)
    const { data, error } = await admin.storage.from(BUCKET).remove(chunk)
    if (error) return reply(500, { error: error.message, removed })
    removed += data?.length ?? 0
  }

  const { data: marked, error: finErr } = await admin.rpc('finalize_share_image_purge')
  if (finErr) return reply(500, { error: finErr.message, removed })

  return reply(200, { removed, rows_updated: Number(marked ?? 0) })
})
