// Icônes des deux files de parole (traits, comme celles du menu Outils) :
// boutons de file de la vue participant et en-têtes des files, des deux côtés.

export function IconeAutreSujet({ className = '' }: { className?: string }) {
  // Bulle de parole et signe plus : un nouveau point.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
      <path d="M12 8v7M8.5 11.5h7" />
    </svg>
  )
}

export function IconeSujetActuel({ className = '' }: { className?: string }) {
  // Éclair : réagir tout de suite à ce qui vient d'être dit (⚡ de l'accueil).
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}
