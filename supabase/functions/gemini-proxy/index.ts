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

interface NameSingleGroupPayload {
  session_title: string
  session_description: string | null
  assertions: AssertionItem[]
  groups: GroupItem[]
  target_table_number: number
  divisive_assertions?: AssertionItem[]
}

type Action = 'moderate' | 'merge' | 'name_groups' | 'name_single_group'

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

// Étiquettes NEUTRES (lettres A/B/C…) pour le nommage individuel — fix A1.
// Le bug documenté : avec des labels "Groupe N" dans le contexte, Gemini
// recopie systématiquement "Groupe N" comme nom du dernier camp. En ôtant
// tout numéro du contexte (le modèle ne voit que "Camp A", "Camp B"…), il
// ne peut plus recopier d'identifiant technique numéroté. La réponse
// name_single_group ne contient que { name, description } (le table_number
// est réattaché côté frontend) → ce renommage de contexte est sans risque
// pour le mapping.
function groupLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26))
}

function serializeGroupsNeutral(groups: GroupItem[]): { text: string; labelOf: Map<number, string> } {
  const sorted = [...groups].sort((a, b) => a.table_number - b.table_number)
  const labelOf = new Map<number, string>()
  sorted.forEach((g, i) => labelOf.set(g.table_number, groupLetter(i)))
  const text = sorted
    .map(g => {
      const profile = g.votes_by_assertion
        .map(v => `  - "${v.assertion_content}": ${v.agree} pour, ${v.disagree} contre, ${v.pass} pass`)
        .join('\n')
      return `Camp ${labelOf.get(g.table_number)} (${g.member_count} membres) :\n${profile}`
    })
    .join('\n\n')
  return { text, labelOf }
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
  return `Tu es le modérateur de l'association Ecclesia, qui organise des débats délibératifs structurés. Ton rôle est d'identifier uniquement les assertions qui sont des reformulations quasi-identiques de la même idée précise.

Thème de la séance : ${p.session_title}
Description : ${desc}

Voici les assertions approuvées :
${assertionsStr}

RÈGLE FONDAMENTALE — LE TEST DU DÉSACCORD. Avant toute fusion, pose-toi cette question : « puis-je imaginer une personne de bonne foi qui approuve l'une et refuse l'autre ? » Si oui, même de justesse, NE FUSIONNE PAS. Ces assertions vont être soumises au vote : deux formulations susceptibles de recevoir des votes différents doivent rester séparées. La perte d'une nuance est bien plus grave que le maintien d'un quasi-doublon. En cas d'hésitation, ne fusionne pas. Il est parfaitement normal de ne proposer aucune fusion.

ÉTAPE 1 — Détermine le TYPE de chaque assertion :
- PRESCRIPTION : elle demande une action, un changement, une règle. Marqueurs : "il faut", "devrait être interdit / encadré / réglementé / taxé", "nous pourrions remplacer", "créer", "supprimer".
- JUGEMENT : elle porte une appréciation de valeur, sans demander d'action. Marqueurs : "c'est mal", "c'est bien", "c'est grave", "est un problème", "est de la propagande".
- CONSTAT : elle affirme un fait, un effet ou un mécanisme, sans jugement ni demande d'action. Marqueurs : "permet de", "entraîne", "coûte", "représente".

ATTENTION — piège fréquent : une phrase qui porte un jugement SUR une action reste un JUGEMENT, ce n'est pas une prescription. "Interdire la publicité serait une bonne chose" (JUGEMENT) ≠ "Il faut interdire la publicité" (PRESCRIPTION) : on peut trouver une mesure souhaitable en principe sans vouloir l'imposer à ceux qui n'en veulent pas.

RÈGLE DE TYPE (absolue, prioritaire sur tout le reste) : deux assertions de TYPES DIFFÉRENTS ne se fusionnent JAMAIS, même si elles portent sur le même sujet, vont dans le même sens et semblent appartenir au même camp. Si tu hésites sur le type de l'une des deux, NE FUSIONNE PAS.

ÉTAPE 2 — Sept motifs de BLOCAGE. Un seul suffit pour interdire la fusion :
1. OBJET — l'objet doit avoir exactement la même étendue. Un terme plus large ne fusionne jamais avec un terme plus étroit : "le marketing" englobe "la publicité" (prix, distribution, études…) → distincts. Un ensemble ne fusionne jamais avec une de ses parties : "la publicité" ≠ "la publicité ciblée" ≠ "la publicité dans l'espace public" ≠ "la publicité pour les enfants" ≠ "la publicité pendant les programmes jeunesse".
2. DEGRÉ — toute différence d'intensité bloque, y compris pour un lien de cause à effet : "réduire" ≠ "fortement limiter" ≠ "supprimer" ; "c'est mal" ≠ "c'est une catastrophe pour la société" ; "la publicité nous pousse à surconsommer" ≠ "la publicité est responsable de la surconsommation" (contribuer n'est pas être la cause principale).
3. MOTIF — si l'une mentionne une cause, un but ou une justification que l'autre ne mentionne pas, ou si les motifs diffèrent, ne fusionne pas : "Il faut réglementer la publicité" ≠ "Il faut réglementer la publicité car elle est mensongère" ; "…pour protéger les enfants" ≠ "…pour lutter contre la surconsommation". Deux personnes peuvent vouloir la même mesure pour des raisons opposées.
4. MODALITÉ — une obligation n'est pas une possibilité : "Il faut interdire la publicité" ≠ "On pourrait envisager d'interdire la publicité".
5. AGENT — toute différence d'acteur bloque, y compris entre un agent explicite et un agent implicite : "L'État doit réglementer la publicité" ≠ "Il faut réglementer la publicité" ≠ "Les marques doivent s'autoréguler".
6. INCLUSION PARTIELLE — si l'une dit tout ce que dit l'autre PLUS quelque chose, ce n'est pas un doublon : "La publicité est envahissante et manipulatrice" ≠ "La publicité est envahissante" ; "La publicité permet de générer des revenus et de financer des projets" ≠ "La pub permet de financer des projets".
7. PORTÉE D'UN CONSTAT — deux faits voisins mais de portée, d'objet ou de mécanisme différents restent distincts : "La publicité finance les médias" ≠ "Sans publicité, beaucoup de journaux disparaîtraient" (les journaux ne sont pas tous les médias, et un autre modèle de financement reste imaginable) ; "La publicité crée des emplois" ≠ "La publicité fait vivre tout un secteur économique".

Trois cas particuliers qui bloquent également :
- Une réfutation n'est pas une affirmation positive : "La publicité n'est pas si nocive qu'on le dit" ≠ "La publicité est utile".
- Un problème constaté n'est pas une demande d'action : "La publicité est un problème" ≠ "Il faut faire quelque chose contre la publicité".
- Deux actions différentes sur le même sujet restent distinctes, même si elles vont dans le même sens : "interdire" ≠ "remplacer par autre chose" ; "plus de pistes cyclables" ≠ "plus de vélos" ; "améliorer les transports" ≠ "réduire la pollution" (une cause et sa conséquence).

ÉTAPE 3 — Ce n'est qu'après avoir écarté TOUS les blocages ci-dessus que tu peux fusionner, et uniquement dans l'un de ces trois cas :
- REFORMULATION PURE — mêmes mots dans un autre ordre, synonymes stricts, ou simple différence de registre : "Il faut taxer la publicité" = "La publicité devrait être taxée" ; "La pub, faut arrêter ça" = "Il faut mettre fin à la publicité" ; "La publicité manipule les gens" = "La publicité est manipulatrice" ; "La publicité c'est mal" = "La communication publicitaire, c'est pas bien." ; "La publicité devrait être plus strictement encadrée par la loi" = "La publicité devrait être davantage réglementée par la loi".
- ÉQUIVALENCE LOGIQUE STRICTE, double négation comprise : "La publicité ne devrait pas être interdite" = "La publicité doit rester autorisée".
- CADRAGE PERSONNEL vs GÉNÉRAL, à prédicat identique : "Je trouve la publicité agaçante" = "La publicité est agaçante".

Ne fusionne jamais plus de 2 assertions ensemble.

Pour chaque fusion, propose aussi une "formulation combinée" (champ "merged_content") : une SEULE assertion reformulée qui réunit fidèlement les deux et préserve toute nuance commune, sans en ajouter. Elle servira éventuellement à remplacer les deux originales par une version consolidée. Reste au plus près des mots des participants.

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après, sans balises markdown :
[
  {
    "keep_id": "<uuid exact de l'assertion à conserver>",
    "reject_ids": ["<uuid exact>"],
    "merged_content": "<formulation combinée qui réunit les deux assertions>",
    "reason": "<TYPE commun des deux assertions (PRESCRIPTION / JUGEMENT / CONSTAT) + citation des deux assertions + explication en 1 phrase de pourquoi elles sont des reformulations strictes>"
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

function buildNameSingleGroupPrompt(p: NameSingleGroupPayload): string {
  const desc = p.session_description ?? 'Aucune description fournie'
  const assertionsStr = serializeAssertions(p.assertions)
  // Contexte à étiquettes neutres (Camp A/B/C…) — voir serializeGroupsNeutral (fix A1)
  const { text: groupsStr, labelOf } = serializeGroupsNeutral(p.groups)
  const divisiveBlock = buildDivisiveBlock(p.divisive_assertions)
  const target = p.groups.find(g => g.table_number === p.target_table_number)
  const memberCount = target?.member_count ?? '?'
  const targetLabel = labelOf.get(p.target_table_number) ?? '?'
  return `Tu es l'animateur de l'association Ecclesia, qui organise des débats délibératifs structurés. Après un vote sur des assertions, un algorithme a réparti les participants en groupes selon leurs profils de vote.

Thème de la séance : ${p.session_title}
Description : ${desc}

Voici les assertions soumises au vote :
${assertionsStr}

${divisiveBlock}

Voici les profils de vote agrégés pour TOUS les camps (contexte de comparaison) :
${groupsStr}

Chaque profil indique, pour chaque assertion, combien de membres du camp ont voté "agree", "disagree", ou "pass".

Ta tâche : nommer UNIQUEMENT le Camp ${targetLabel} (${memberCount} membres).

Donne à ce camp un nom court (2 à 4 mots) et une description neutre (1-2 phrases) qui reflète objectivement son positionnement sur les assertions, en le distinguant des autres camps.

Méthode : cherche d'abord les assertions sur lesquelles le Camp ${targetLabel} S'ÉCARTE le plus des autres camps (celles listées comme clivantes ci-dessus si elles sont fournies), puis nomme le camp d'après CES positions-là. Ignore les assertions où tous les camps votent pareil : elles ne disent rien de ce camp en particulier.

Règles strictes :
- Test de validité du nom : il doit être VRAI pour le Camp ${targetLabel} et FAUX pour au moins un autre camp. Un nom qui conviendrait aussi bien à un autre camp est un mauvais nom — recommence en te fondant sur un point de divergence.
- Le nom doit exprimer une POSITION ("Pour la gratuité des transports"), pas seulement un thème ("Transports et mobilité").
- Les camps peuvent se ressembler beaucoup : dans ce cas, nomme quand même d'après la nuance qui les sépare (intensité, priorité, exception) — par exemple "Favorables mais prudents" vs "Favorables sans réserve". Ne te rabats jamais sur un identifiant technique sous prétexte que l'écart est faible.
- Sois descriptif, pas normatif. Ne juge pas quel camp a "raison".
- Évite les étiquettes politiques préexistantes — décris les positions concrètes sur ce débat.
- Base-toi uniquement sur les patterns de vote, pas sur des suppositions démographiques.
- Si ce camp a peu ou aucun vote (tous les compteurs à 0), nomme-le "Camp peu actif" et indique dans la description qu'il n'a pas suffisamment participé.
- INTERDIT : le nom ne peut PAS être "Camp A", "Camp B", "Groupe N" ni aucun identifiant réduit à une lettre ou un numéro. Ces labels sont les identifiants techniques du système. Trouve toujours un nom descriptif basé sur les positions exprimées, même vague (ex : "Positionnement modéré", "Profil nuancé").

Réponds UNIQUEMENT avec un objet JSON, sans texte avant ni après, sans balises markdown :
{
  "name": "<nom court descriptif du Camp ${targetLabel}>",
  "description": "<description neutre en français>"
}`
}

// ── Appel Gemini ──────────────────────────────────────────────

// Modèle Gemini effectivement appelé — exposé dans `usage.model` (F19)
// pour que le rapport de tokens affiche le modèle réel plutôt qu'une
// valeur supposée côté frontend.
const MODEL_NAME = 'gemini-2.5-flash-lite'

interface GeminiUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  thoughts_tokens: number
  model: string
}

interface GeminiCallResult {
  results: unknown[]
  usage: GeminiUsage
}

async function callGemini(prompt: string, apiKey: string): Promise<GeminiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`

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
      thoughtsTokenCount?: number
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

  // F22 : les 3 champs sont les valeurs brutes retournées par Google,
  // jamais recalculées côté serveur (total_tokens peut inclure les
  // tokens de réflexion, cf. thoughts_tokens — ne pas faire prompt+completion).
  const usage: GeminiUsage = {
    prompt_tokens:      geminiData.usageMetadata?.promptTokenCount      ?? 0,
    completion_tokens:  geminiData.usageMetadata?.candidatesTokenCount   ?? 0,
    total_tokens:       geminiData.usageMetadata?.totalTokenCount        ?? 0,
    thoughts_tokens:    geminiData.usageMetadata?.thoughtsTokenCount     ?? 0,
    model:              MODEL_NAME,
  }

  return { results: parsed, usage }
}

interface GeminiSingleResult {
  result: { name: string; description: string }
  usage: GeminiUsage
}

async function callGeminiSingle(prompt: string, apiKey: string): Promise<GeminiSingleResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`

  const geminiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            name:        { type: 'string' },
            description: { type: 'string' },
          },
          required: ['name', 'description'],
        },
      },
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
      thoughtsTokenCount?: number
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

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new GeminiError('Gemini response is not an object', cleaned)
  }

  const obj = parsed as Record<string, unknown>
  if (typeof obj.name !== 'string' || typeof obj.description !== 'string') {
    throw new GeminiError('Gemini response missing name or description', cleaned)
  }

  const usage: GeminiUsage = {
    prompt_tokens:     geminiData.usageMetadata?.promptTokenCount     ?? 0,
    completion_tokens: geminiData.usageMetadata?.candidatesTokenCount ?? 0,
    total_tokens:      geminiData.usageMetadata?.totalTokenCount      ?? 0,
    thoughts_tokens:   geminiData.usageMetadata?.thoughtsTokenCount   ?? 0,
    model:             MODEL_NAME,
  }

  return { result: { name: obj.name as string, description: obj.description as string }, usage }
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
      case 'name_single_group': {
        const p = payload as NameSingleGroupPayload
        const singlePrompt = buildNameSingleGroupPrompt(p)
        const { result, usage: singleUsage } = await callGeminiSingle(singlePrompt, apiKey)
        return new Response(
          JSON.stringify({ result, usage: singleUsage }),
          { status: 200, headers: JSON_HEADERS },
        )
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: JSON_HEADERS },
        )
    }

    // ── Appel Gemini + parsing ────────────────────────────────
    const { results, usage } = await callGemini(prompt, apiKey)

    // Sanitisation des résultats merge : Gemini peut halluciner des UUIDs légèrement
    // altérés (ex : premier tiret manquant) ou retourner reject_ids comme une chaîne.
    if (action === 'merge') {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const inputIds = new Set((payload as MergePayload).assertions.map(a => a.id))
      const sanitized = (results as Record<string, unknown>[])
        .filter(r => typeof r.keep_id === 'string' && UUID_RE.test(r.keep_id as string) && inputIds.has(r.keep_id as string))
        .map(r => ({
          ...r,
          reject_ids: (Array.isArray(r.reject_ids) ? r.reject_ids as unknown[] : [])
            .filter(id => typeof id === 'string' && UUID_RE.test(id as string) && inputIds.has(id as string)),
          // La formulation combinée (chantier 7) est optionnelle et purement textuelle :
          // on la conserve seulement si c'est une chaîne non vide, sinon on l'omet.
          merged_content: typeof r.merged_content === 'string' && r.merged_content.trim().length > 0
            ? (r.merged_content as string).trim()
            : undefined,
        }))
        .filter(r => (r.reject_ids as string[]).length > 0)
      return new Response(
        JSON.stringify({ results: sanitized, usage }),
        { status: 200, headers: JSON_HEADERS },
      )
    }

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
