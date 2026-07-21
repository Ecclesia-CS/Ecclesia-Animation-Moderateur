import { useState } from 'react'

interface Props {
  joinCode: string
  className?: string
}

/** Copie un lien #table/<join_code> dans le presse-papier — permet d'inviter un ami
 *  directement sur cette table de débat sans repasser par le vote (D8). */
export default function InviteFriendButton({ joinCode, className = '' }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    const url = `${window.location.origin}${window.location.pathname}#table/${joinCode}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papier indisponible (contexte non sécurisé, permission refusée…) — pas d'action de repli.
    }
  }

  return (
    <button onClick={handleClick} className={className} title="Copier un lien à envoyer à un ami">
      {copied ? 'Copié !' : 'Inviter un ami'}
    </button>
  )
}
