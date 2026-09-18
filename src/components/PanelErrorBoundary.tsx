import { Component, type ErrorInfo, type ReactNode } from 'react'

// Filet de sécurité posé après quatre pages blanches en production (16-18/09/2026),
// toutes dues à une exception dans un seul panneau : React démonte l'arbre entier
// dès qu'un composant lève pendant son rendu, d'où l'écran totalement blanc que
// F5 ne réparait pas. Isolé ainsi, un panneau fautif reste un panneau fautif — le
// reste de l'écran continue de fonctionner.
//
// ⚠️ Limite inhérente à React : ne capture que les erreurs de **rendu** et de
// cycle de vie. Une exception levée dans un gestionnaire d'événement (onClick) ou
// dans une promesse non attrapée passe à travers. Ce n'est donc pas une raison de
// relâcher les gardes à la lecture des données (voir « Ne jamais faire » dans
// CLAUDE.md) : c'est une seconde barrière, pas la première.
//
// Le message d'erreur est affiché **à l'écran** volontairement : c'est ce que
// l'utilisateur peut recopier pour diagnostiquer, sans avoir à ouvrir la console.

interface Props {
  /** Nom du panneau, affiché dans le message de repli (« Analyse », « Allocation »…). */
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Conservé : la trace complète reste indispensable au diagnostic, et un
    // encadré discret attire moins l'attention qu'une page blanche.
    console.error(`[PanelErrorBoundary] ${this.props.label} :`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <section className="bg-white rounded-2xl border border-red-200 overflow-hidden">
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Le panneau « {this.props.label} » n'a pas pu s'afficher
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Le reste de l'écran fonctionne normalement. Recopier le message ci-dessous
                permet de diagnostiquer la panne.
              </p>
            </div>
          </div>

          <p className="text-xs font-mono text-red-700 bg-red-50 border border-red-200
            rounded-xl px-3 py-2 break-words whitespace-pre-wrap">
            {error.message || String(error)}
          </p>

          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors
              focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-lg px-1 py-0.5"
          >
            ↻ Réessayer d'afficher ce panneau
          </button>
        </div>
      </section>
    )
  }
}
