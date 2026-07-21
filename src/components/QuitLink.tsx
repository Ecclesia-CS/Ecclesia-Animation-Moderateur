/** Lien flottant discret pour quitter l'écran courant et revenir au menu (EntryScreen).
 *  Utilisé dans les écrans hors TableContext (vote, allocation…) où il suffit de vider le hash —
 *  aucune table n'a encore été rejointe à ce stade. */
export default function QuitLink() {
  return (
    <button
      onClick={() => { window.location.hash = '' }}
      className="fixed top-3 left-3 z-[100] flex items-center gap-1 text-xs text-gray-500 bg-white/90
        backdrop-blur border border-gray-200 rounded-full px-3 py-1.5 shadow-sm
        hover:bg-white hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
    >
      ← Menu
    </button>
  )
}
