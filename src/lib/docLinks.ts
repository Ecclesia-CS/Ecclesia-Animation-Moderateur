import type { SessionType } from './types'

/**
 * Chantier 155 — liens de documentation côté participant/modérateur.
 *
 * `doc_info_url` porte désormais le lien « Fiche info et résumé » (la fiche et
 * son résumé menaient finalement aux deux mêmes documents). `doc_summary_url`
 * n'est plus renseigné pour les nouvelles séances, mais les séances qui l'ont
 * déjà gardent leur second lien « Résumé fiche information », inchangé.
 */
export const DOC_INFO_LABEL = 'Fiche info et résumé'
export const DOC_SUMMARY_LABEL = 'Résumé fiche information'

export const DOC_BIAIS_URL = 'https://ecclesia-centralesupelec.vercel.app/ressources#biais-cognitifs'
export const DOC_FALLACIES_URL = 'https://ecclesia-centralesupelec.vercel.app/ressources#arguments-fallacieux'

/**
 * Les fiches pédagogiques « Biais cognitifs » et « Arguments fallacieux »
 * portent sur l'argumentation d'un débat : sans objet dans un sondage, où
 * l'on ne fait que voter.
 */
export function showPedagogyDocs(sessionType: SessionType): boolean {
  return sessionType !== 'poll'
}
