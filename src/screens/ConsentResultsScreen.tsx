// =============================================================
// ConsentResultsScreen — résultats d'un sondage « vote par consentement »
// (chantier 160). Remplace la carte des camps de ResultsMapScreen : des
// décomptes par option (X d'accord, Y pas d'accord), rien d'autre — pas de
// camp, pas de carte, pas d'« adopté ». Visible pendant le vote (bouton du
// vote) et après la clôture (route #session/<code>).
// =============================================================

import { useEffect, useState } from 'react'
import { getVoteResults } from '../lib/voting'
import { extractErr } from '../lib/utils'
import type { Session, VoteResult } from '../lib/types'
import PageParcours, { BOUTON_VERRE_PARCOURS, ChargementParcours, ErreurParcours } from '../components/PageParcours'
import ConsentResultsList from '../components/voting/ConsentResultsList'

interface ConsentResultsScreenProps {
  session: Session
  /** Présent quand l'écran est ouvert depuis le vote : « Retour au vote ». */
  onBack?: () => void
}

export default function ConsentResultsScreen({ session, onBack }: ConsentResultsScreenProps) {
  const [results, setResults] = useState<VoteResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getVoteResults(session.id)
      .then(r => { if (alive) setResults(r) })
      .catch(e => { if (alive) setError(extractErr(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session.id])

  return (
    <PageParcours
      session={session}
      sousTitre="Résultats du sondage"
      sansMenu={!!onBack}
      actions={onBack && <button onClick={onBack} className={BOUTON_VERRE_PARCOURS}>Retour au vote</button>}
    >
      <div className="space-y-5">
        {error && <ErreurParcours>{error}</ErreurParcours>}

        {!error && loading && <ChargementParcours texte="Chargement des résultats…" />}

        {!error && !loading && <ConsentResultsList results={results} loading={false} />}
      </div>
    </PageParcours>
  )
}
