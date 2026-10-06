/** Lien flottant discret pour quitter l'écran courant et revenir au menu (EntryScreen).
 *  Utilisé dans les écrans hors TableContext (vote, allocation…) où il suffit de vider le hash —
 *  aucune table n'a encore été rejointe à ce stade. */
export default function QuitLink() {
  return (
    <button
      onClick={() => { window.location.hash = '' }}
      className="fixed top-3 left-3 z-[100] flex items-center gap-1 text-xs font-medium text-bleu-fonce/80 bg-white/90
        backdrop-blur border border-bleu-fonce/15 px-3 py-1.5 shadow-sm
        hover:bg-white hover:text-bleu-fonce hover:border-bleu-fonce/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bleu-clair"
    >
      Menu
    </button>
  )
}
