// =============================================================
// Edge Function : gemini-proxy
// Relaie les appels Gemini Flash depuis le frontend Ecclesia.
// Valide le JWT Supabase, construit le prompt, appelle l'API
// Gemini, parse la réponse et la retourne au client.
// Ne modifie jamais la base de données directement.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Types payload ─────────────────────────────────────────────

interface AssertionItem {
  id: string
  content: string
}

interface GroupVote {
  assertion_content: string
  agree: number
  disagree: number
  pass: number
}

interface GroupItem {
  table_number: number
  member_count: number
  votes_by_assertion: GroupVote[]
}

interface ModeratePayload {
  session_title: string
  session_description: string | null
  assertions: AssertionItem[]
}

interface MergePayload {
  session_title: string
  session_description: string | null
  assertions: AssertionItem[]
}

interface NameGroupsPayload {
  session_title: string
  session_description: string | null
  assertions: AssertionItem[]
  groups: GroupItem[]
  divisive_assertions?: AssertionItem[]
}

type Action = 'moderate' | 'merge' | 'name_groups'

// ── CORS headers ──────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json',
}

// ── Sérialisation des placeholders ────────────────────────────

function serializeAssertions(assertions: AssertionItem[]): string {
  return assertions
    .map((a, i) => `${i + 1}. [${a.id}] ${a.content}`)
    .join('\n')
}

function serializeGroups(groups: GroupItem[]): string {
  return groups
    .map(g => {
      const profile = g.votes_by_assertion
        .map(v => `  - "${v.assertion_content}": ${v.agree} pour, ${v.disagree} contre, ${v.pass} pass`)
        .join('\n')
      return `Groupe ${g.table_number} (${g.member_count} membres) :\n${profile}`
    })
    .join('\n\n')
}

function buildDivisiveBlock(divisive?: AssertionItem[]): string {
  if (!divisive || divisive.length === 0) return ''
  const list = divisive
    .map((a, i) => `${i + 1}. [${a.id}] ${a.content}`)
    .join('\n')
  return (
    'Les assertions suivantes ont été identifiées comme particulièrement' +
    ' clivantes entre les groupes par l\'algorithme d\'analyse :\n' +
    list + '\n' +
    'Accorde-leur un poids particulier dans ton analyse.'
  )
}

// ── Construction des prompts ──────────────────────────────────

function buildModeratePrompt(p: ModeratePayload): string {
  const desc = p.session_description ?? 'Aucune description fournie'
  const assertionsStr = serializeAssertions(p.assertions)
  return `Tu es le modérateur de l'association Ecclesia, qui organise des débats délibératifs structurés. Ton rôle est de filtrer les assertions soumises par les participants avant le vote.

Thème de la séance : ${p.session_title}
Description : ${desc}

Voici les assertions en attente de modération :
${assertionsStr}

Pour chaque assertion, décide :
- "approve" : l'assertion est formulée de bonne foi, est en lien avec le thème, et peut faire l'objet d'un désaccord raisonnable entre personnes de bonne foi. Une assertion peut être approuvée même si elle est controversée ou provocatrice, tant qu'elle est sérieuse.
- "reject" : l'assertion est un troll évident, une insulte, un hors-sujet complet sans lien avec le thème, ou une phrase sans sens.

Sois permissif. En cas de doute, approuve. Le but n'est pas de censurer les opinions minoritaires ou dérangeantes, mais uniquement d'éliminer ce qui ne contribue pas au débat.

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après, sans balises markdown :
[
  { "id": "<uuid exact>", "action": "approve" },
  { "id": "<uuid exact>", "action": "reject" }
]

Tu dois retourner une entrée pour chaque assertion reçue, avec l'uuid exact tel que fourni. Ne pas inventer d'UUIDs.`
}

function buildMergePrompt(p: MergePayload): string {
  const desc = p.session_description ?? 'Aucune description fournie'
  const assertionsStr = serializeAssertions(p.assertions)
  return `Tu es le modérateur de l'association Ecclesia, qui organise des débats délibératifs structurés. Ton rôle est d'identifier uniquement les assertions qui sont des reformulations quasi-identiques de la même idée.

Thème de la séance : ${p.session_title}
Description : ${desc}

Voici les assertions approuvées :
${assertionsStr}

Tu ne dois fusionner que des assertions qui satisfont ces deux conditions simultanément :
1. Elles proposent exactement la même action ou expriment exactement le même jugement
2. Une personne rationnelle ne pourrait pas voter différemment sur l'une et sur l'autre

Exemples de ce qu'il NE faut PAS fusionner :
- Deux actions différentes sur le même sujet ("plus de pistes cyclables" ≠ "plus de vélos") — ce sont des leviers distincts
- Une action concrète et une valeur générale ("construire des pistes" ≠ "favoriser le vélo en ville")
- Deux degrés différents ("réduire la voiture" ≠ "supprimer la voiture")
- Une cause et sa conséquence ("améliorer les transports" ≠ "réduire la pollution")

Exemples de ce qu'il faut fusionner :
- Reformulations avec des mots différents mais sens strictement identique ("Il faut plus de vélos en ville" = "Il faudrait davantage de vélos dans les zones urbaines")
- Même affirmation avec ou sans précision géographique mineure

En cas de doute, ne fusionne pas. La préservation des nuances est plus importante que l'élimination des doublons.
Ne fusionne jamais plus de 2 assertions ensemble.

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après, sans balises markdown :
[
  {
    "keep_id": "<uuid exact de l'assertion à conserver>",
    "reject_ids": ["<uuid exact>"],
    "reason": "<citation des deux assertions + explication en 1 phrase de pourquoi elles sont strictement identiques>"
  }
]

Si aucune fusion n'est nécessaire, réponds exactement : []
Tu dois utiliser les uuids exacts tels que fournis. Ne pas inventer d'UUIDs.`
}

function buildNameGroupsPrompt(p: NameGroupsPayload): string {
  const desc = p.session_description ?? 'Aucune description fournie'
  const assertionsStr = serializeAssertions(p.assertions)
  const groupsStr = serializeGroups(p.groups)
  const divisiveBlock = buildDivisiveBlock(p.divisive_assertions)
  return `Tu es l'animateur de l'association Ecclesia, qui organise des débats délibératifs structurés. Après un vote sur des assertions, un algorithme a réparti les participants en groupes selon leurs profils de vote.

Thème de la séance : ${p.session_title}
Description : ${desc}

Voici les assertions soumises au vote :
${assertionsStr}

${divisiveBlock}

Voici les profils de vote agrégés par groupe :
${groupsStr}

Chaque profil indique, pour chaque assertion, combien de membres du groupe ont voté "agree", "disagree", ou "pass".

Donne à chaque groupe un nom court (3 mots maximum) et une description neutre (1-2 phrases) qui reflète objectivement leur positionnement sur les assertions.

Règles strictes :
- Sois descriptif, pas normatif. Ne juge pas quel groupe a "raison".
- Évite les étiquettes politiques préexistantes ("les progressistes", "les conservateurs", etc.) — décris les positions concrètes sur ce débat.
- Si les profils de vote sont trop similaires pour distinguer les groupes, indique-le dans la description.
- Base-toi uniquement sur les patterns de vote, pas sur des suppositions démographiques.
- Si un groupe a peu ou aucun vote (tous les compteurs à 0), donne-lui quand même un nom tel que "Groupe peu actif" et indique dans la description que ce groupe n'a pas suffisamment participé au vote pour être caractérisé.
- RÈGLE ABSOLUE : tu dois retourner EXACTEMENT autant d'entrées qu'il y a de groupes reçus. Chaque table_number doit apparaître exactement une fois dans ta réponse, sans exception.

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après, sans balises markdown :
[
  {
    "table_number": <entier exact>,
    "name": "<nom court>",
    "description": "<description neutre en français>"
  }
]

Tu dois retourner une entrée pour CHAQUE groupe reçu, avec le table_number exact tel que fourni. Si tu reçois 3 groupes, tu dois retourner 3 entrées. Si tu reçois 5 groupes, tu dois retourner 5 entrées.`
}

// ── Appel Gemini ──────────────────────────────────────────────

interface GeminiUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface GeminiCallResult {
  results: unknown[]
  usage: GeminiUsage
}

async function callGemini(prompt: string, apiKey: string): Promise<GeminiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`

  const geminiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text()
    throw new GeminiError(`Gemini error: ${geminiRes.status} ${errBody}`, null)
  }

  const geminiData = await geminiRes.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
  }

  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof raw !== 'string') {
    throw new GeminiError('Gemini returned no text content', null)
  }

  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new GeminiError('JSON parse failed', cleaned)
  }

  if (!Array.isArray(parsed)) {
    throw new GeminiError('Gemini response is not an array', cleaned)
  }

  const usage: GeminiUsage = {
    prompt_tokens:      geminiData.usageMetadata?.promptTokenCount      ?? 0,
    completion_tokens:  geminiData.usageMetadata?.candidatesTokenCount   ?? 0,
    total_tokens:       geminiData.usageMetadata?.totalTokenCount        ?? 0,
  }

  return { results: parsed, usage }
}

class GeminiError extends Error {
  raw: string | null
  constructor(message: string, raw: string | null) {
    super(message)
    this.raw = raw
  }
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: JSON_HEADERS },
    )
  }

  try {
    // ── Authentification JWT ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: JSON_HEADERS },
      )
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')  ?? ''
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const apiKey       = Deno.env.get('GEMINI_API_KEY') ?? ''

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: JSON_HEADERS },
      )
    }

    // ── Parse body ────────────────────────────────────────────
    const body = await req.json() as { action: Action; payload: unknown }
    const { action, payload } = body

    // ── Construire le prompt selon l'action ───────────────────
    let prompt: string
    switch (action) {
      case 'moderate':
        prompt = buildModeratePrompt(payload as ModeratePayload)
        break
      case 'merge':
        prompt = buildMergePrompt(payload as MergePayload)
        break
      case 'name_groups':
        prompt = buildNameGroupsPrompt(payload as NameGroupsPayload)
        break
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: JSON_HEADERS },
        )
    }

    // ── Appel Gemini + parsing ────────────────────────────────
    const { results, usage } = await callGemini(prompt, apiKey)

    return new Response(
      JSON.stringify({ results, usage }),
      { status: 200, headers: JSON_HEADERS },
    )

  } catch (err) {
    if (err instanceof GeminiError) {
      const body: Record<string, string> = { error: err.message }
      if (err.raw !== null) body.raw = err.raw
      return new Response(
        JSON.stringify(body),
        { status: 502, headers: JSON_HEADERS },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
