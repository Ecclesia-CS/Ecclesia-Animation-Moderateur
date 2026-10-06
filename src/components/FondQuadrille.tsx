import { useEffect, useRef, useState } from 'react'

/**
 * Fond quadrillé du site Ecclesia (composant GrilleAnimee de son bandeau
 * d'accueil), refait en CSS : trame de 44 px en traits crème à 10 %, inclinée
 * de 12°, fondue vers le haut, et quelques cases qui s'allument et
 * s'éteignent lentement (crème à 13 %, comme sur le site).
 *
 * À poser en premier enfant d'un parent `relative overflow-hidden` sur fond
 * marine (ou sarcelle), le contenu venant après lui en `relative`. Pas de
 * z-index ni d'`isolation` ici : l'en-tête participant contient des boutons
 * qui ouvrent des fenêtres `fixed` (Outils, étapes) ; un contexte
 * d'empilement autour d'eux les ferait passer sous le reste de la page.
 *
 * Les cases sont placées une fois la taille du parent connue, pour tomber
 * dans la partie visible malgré l'inclinaison, et toujours aux mêmes
 * endroits (suite du nombre d'or, pas de Math.random) : aucun rendu React en
 * boucle, seule l'opacité est animée, en CSS. En mouvement réduit, elles
 * restent éteintes (`index.css`).
 */

const PAS = 44
const PENTE = Math.tan((12 * Math.PI) / 180)
// Débord vertical de la trame : l'inclinaison soulève un bord et abaisse
// l'autre de (largeur / 2) × tan 12°, soit 204 px sur un écran de 1 920 px.
const DEBORD = 260

interface Case { col: number; lig: number; delai: number; duree: number }

function placerCases(nombre: number, largeur: number, hauteur: number): Case[] {
  const cases: Case[] = []
  const prises = new Set<string>()
  for (let i = 0; cases.length < nombre && i < nombre * 6; i++) {
    const u = (0.17 + i * 0.618034) % 1
    const v = (0.41 + i * 0.754878) % 1
    const col = Math.floor((u * largeur) / PAS)
    // Hauteur voulue à l'écran, sous la zone fondue du haut.
    const yEcran = hauteur * (0.32 + 0.5 * v)
    // Inverse de skewY(12deg) autour du centre : y_écran = y + (x − l/2)·tan 12°.
    const x = col * PAS + PAS / 2
    const lig = Math.floor((yEcran + DEBORD - (x - largeur / 2) * PENTE) / PAS)
    const cle = `${col}:${lig}`
    if (col < 0 || prises.has(cle)) continue
    prises.add(cle)
    cases.push({ col, lig, delai: (i * 1.7) % 8, duree: 7 + (i % 3) })
  }
  return cases
}

interface Props {
  /** Nombre de cases qui s'allument (0 : trame seule). */
  cases?: number
  /** Grain du site par-dessus l'aplat (classe `bg-grain`). */
  grain?: boolean
  /** Opacité des traits (0,1 sur le site). */
  traits?: number
  className?: string
}

// Que des <span> : le fond se pose aussi dans un <button> (bouton de file actif).
export default function FondQuadrille({ cases = 8, grain = true, traits = 0.1, className = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [taille, setTaille] = useState<{ l: number; h: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || cases === 0 || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entree]) => {
      const { width, height } = entree.contentRect
      setTaille(t => (t && Math.abs(t.l - width) < 1 && Math.abs(t.h - height) < 1 ? t : { l: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [cases])

  const trait = `rgba(251, 249, 244, ${traits})`
  const fondu = 'linear-gradient(to bottom, transparent 0%, #000 30%, #000 100%)'

  return (
    <span ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 block overflow-hidden ${className}`}>
      {grain && <span className="bg-grain absolute inset-0 block" />}
      <span className="absolute inset-0 block" style={{ maskImage: fondu, WebkitMaskImage: fondu }}>
        <span
          className="absolute inset-x-0 block skew-y-12"
          style={{
            top: -DEBORD,
            bottom: -DEBORD,
            backgroundImage: `linear-gradient(to right, ${trait} 1px, transparent 1px), linear-gradient(to bottom, ${trait} 1px, transparent 1px)`,
            backgroundSize: `${PAS}px ${PAS}px`,
          }}
        >
          {taille && placerCases(cases, taille.l, taille.h).map(c => (
            <span
              key={`${c.col}:${c.lig}`}
              className="absolute block opacity-0 animate-case"
              style={{
                left: c.col * PAS + 1,
                top: c.lig * PAS + 1,
                width: PAS - 1,
                height: PAS - 1,
                backgroundColor: 'rgba(251, 249, 244, 0.13)',
                animationDelay: `${c.delai}s`,
                animationDuration: `${c.duree}s`,
              }}
            />
          ))}
        </span>
      </span>
    </span>
  )
}
