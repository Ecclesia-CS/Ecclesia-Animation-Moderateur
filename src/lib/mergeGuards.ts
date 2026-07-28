// =============================================================
// Garde-fous déterministes sur les propositions de fusion
// Chantier 18 — calibrage du 2026-07-28.
//
// Certains verdicts du calibrage (docs/calibrage-fusion-assertions.md)
// résistent au prompt : même cité mot pour mot comme contre-exemple,
// Gemini refusait d'appliquer la règle d'inclusion partielle. Plutôt
// qu'empiler des consignes, on les applique ici en dur — mêmes entrées,
// même sortie, aucun appel réseau, testable sans consommer de quota.
//
// Ces fonctions sont PURES : aucun React, aucun Supabase, aucun accès
// réseau. Tests dans mergeGuards.test.ts.
// =============================================================

// Mots vides : ils n'apportent pas de contenu et fausseraient la
// comparaison (« la publicité EST envahissante » vs « … »).
const STOPWORDS = new Set([
  'la', 'le', 'les', 'un', 'une', 'des', 'du', 'de', 'da', 'au', 'aux',
  'et', 'ou', 'ni', 'que', 'qui', 'quo', 'est', 'sont', 'ete', 'etre',
  'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs',
  'pas', 'ne', 'plus', 'tres', 'pour', 'par', 'dans', 'sur', 'avec',
  'ainsi', 'aussi', 'tout', 'toute', 'tous', 'toutes', 'faut', 'il',
  'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'en', 'y', 'sans',
])

/** Minuscules, sans accents, sans ponctuation. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mots porteurs de sens : ni vides, ni trop courts. */
export function significantWords(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
}

// Deux mots comptent comme identiques s'ils partagent un préfixe assez
// long — « manipule » / « manipulatrice », « taxer » / « taxee ». Sans
// ça, une simple flexion ferait passer un mot pour absent.
const PREFIX_MATCH = 4

function matches(word: string, pool: string[]): boolean {
  return pool.some(p =>
    p === word ||
    (Math.min(p.length, word.length) >= PREFIX_MATCH &&
     p.slice(0, PREFIX_MATCH) === word.slice(0, PREFIX_MATCH))
  )
}

// Marqueurs de coordination : c'est là que se joue l'inclusion partielle.
// Une assertion qui coordonne deux propositions dit littéralement deux
// choses ; n'en reprendre qu'une n'est pas la même assertion.
const CONJUNCTIONS = [' et ', " ainsi qu ", ' ainsi que ']

/**
 * Détecte l'INCLUSION PARTIELLE (verdict 21 du calibrage) : l'une des deux
 * assertions dit tout ce que dit l'autre PLUS quelque chose, ce supplément
 * étant introduit par une coordination.
 *
 * Exemples bloqués :
 *   « La publicité est envahissante et manipulatrice » vs « La publicité est envahissante »
 *   « …permet de générer des revenus et de financer des projets » vs « …permet de financer des projets »
 *
 * Volontairement NARROW : on n'agit que s'il y a une coordination explicite
 * dans la plus longue des deux. Une règle plus large (tout mot de contenu en
 * trop) casserait des fusions validées comme « La publicité manipule les gens »
 * = « La publicité est manipulatrice » (le mot « gens » serait vu comme un
 * supplément) ou « Je trouve la publicité agaçante » = « La publicité est
 * agaçante ». Mieux vaut rater un cas que bloquer une fusion légitime.
 */
export function isPartialInclusion(contentA: string, contentB: string): boolean {
  const [longer, shorter] = contentA.length >= contentB.length
    ? [contentA, contentB]
    : [contentB, contentA]

  const normLonger = normalize(longer)
  const conjunction = CONJUNCTIONS.find(c => normLonger.includes(c))
  if (!conjunction) return false

  const shortWords = significantWords(shorter)
  if (shortWords.length === 0) return false

  // Mots de contenu présents dans la longue et absents de la courte.
  const extra = significantWords(longer).filter(w => !matches(w, shortWords))
  if (extra.length === 0) return false // reformulation pure, pas une inclusion

  // Segments coordonnés de la plus longue.
  const segments = normLonger.split(conjunction)
  if (segments.length < 2) return false

  // Inclusion partielle si TOUT le supplément tient dans un seul segment
  // coordonné : la courte reprend l'autre segment et laisse celui-ci de côté.
  return segments.some(seg => {
    const segWords = significantWords(seg)
    return extra.every(w => matches(w, segWords))
  })
}
