import type { Session } from '../../lib/types'

// Chantier 122 — nudge documentaire partagé entre VoteScreen (phases
// pre_voting/voting) et AllocatingScreen (phase allocating). Les liens biais
// cognitifs / arguments fallacieux sont fixes (déjà présents dans le panneau
// Outils, ParticipantToolsButton.tsx) — on ne les recrée pas, on les répète ici.

interface DocNudgeProps {
  session: Session
  memberPseudo: string
}

const iconPath = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
  </svg>
)

export default function DocNudge({ session, memberPseudo }: DocNudgeProps) {
  const infoUrl    = session.doc_info_url
  const summaryUrl = session.doc_summary_url
  const collabUrl  = session.doc_collab_url

  function handleCollabClick() {
    sessionStorage.setItem('ecclesia_collab_return', `#vote/${session.join_code}`)
    if (session.join_code) {
      sessionStorage.setItem(`ecclesia_collab_pseudo_${session.join_code}`, memberPseudo)
      window.location.hash = `#collab/${session.join_code}`
    } else if (collabUrl) {
      window.open(collabUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const linkClass = 'flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors'

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
      <p className="text-xs font-semibold text-indigo-700 mb-2">📄 Profites-en pour lire la documentation</p>
      <div className="space-y-1.5">
        {infoUrl && (
          <a href={infoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {iconPath}
            Fiche information
          </a>
        )}
        {summaryUrl && (
          <a href={summaryUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {iconPath}
            Résumé fiche information
          </a>
        )}
        {(collabUrl || session.join_code) && (
          <button onClick={handleCollabClick} className={linkClass}>
            {iconPath}
            Sources collaboratives
          </button>
        )}
        <a
          href="https://ecclesia-centralesupelec.vercel.app/ressources#biais-cognitifs"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {iconPath}
          Biais cognitifs
        </a>
        <a
          href="https://ecclesia-centralesupelec.vercel.app/ressources#arguments-fallacieux"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {iconPath}
          Arguments fallacieux
        </a>
      </div>
    </div>
  )
}
