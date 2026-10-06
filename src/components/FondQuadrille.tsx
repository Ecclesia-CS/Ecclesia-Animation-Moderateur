import { useEffect, useRef, useState } from 'react'

/**
 * Fond quadrillé du site Ecclesia (composant GrilleAnimee de son bandeau
 * d'accueil), refait en CSS : trame de 44 px en traits crème à 10 %, inclinée
 * de 12°, fondue vers le haut, et quelques cases qui s'allument et
 * s'éteignent lentement (crème à 13 %, comme sur le site).
 *
 * À poser en premier enfant d'un parent `relative overflow-hidden` sur fond
 * marine (ou sarcelle, ocre), le contenu venant après lui en `relative`. Pas
 * de z-index ni d'`isolation` ici : l'en-tête participant contient des
 * boutons qui ouvrent des fenêtres `fixed` (Outils, étapes) ; un contexte
 * d'empilement autour d'eux les ferait passer sous le reste de la page.
 *
 * Les cases ne s'allument jamais derrière un texte, une image ou un champ du
 * parent : leurs emplacements sont choisis une fois la mise en page connue
 * (taille du parent, polices chargées), toujours les mêmes pour une même
 * mise en page (suite du nombre d'or, pas de Math.random). Aucun rendu React
 * en boucle : seule l'opacité est animée, en CSS. En mouvement réduit, elles
 * restent éteintes (`index.css`).
 */

const PAS = 44
const PENTE = Math.tan((12 * Math.PI) / 180)
// Débord vertical de la trame : l'inclinaison soulève un bord et abaisse
// l'autre de (largeur / 2) × tan 12°, soit 204 px sur un écran de 1 920 px.
const DEBORD = 260
// Marge laissée autour des textes et des boutons.
const RESPIRATION = 6
// Fondu du site : la trame disparaît dans le haut du bandeau.
const FONDU_SITE = 'linear-gradient(to bottom, transparent 0%, #000 30%, #000 100%)'

interface Case { col: number; lig: number; delai: number; duree: number }
interface Rect { l: number; t: number; r: number; b: number }

function placerCases(nombre: number, largeur: number, hauteur: number, zone: [number, number], obstacles: Rect[]): Case[] {
  const cases: Case[] = []
  const prises = new Set<string>()
  for (let i = 0; cases.length < nombre && i < nombre * 12; i++) {
    const u = (0.17 + i * 0.618034) % 1
    const v = (0.41 + i * 0.754878) % 1
    const col = Math.floor((u * largeur) / PAS)
    const x = col * PAS
    // Hauteur voulue à l'écran (centre de la case), dans la zone permise.
    const yEcran = zone[0] + (zone[1] - zone[0]) * v
    // Inverse de skewY(12deg) autour du centre : y_écran = y + (x − l/2)·tan 12°.
    const lig = Math.floor((yEcran + DEBORD - (x + PAS / 2 - largeur / 2) * PENTE) / PAS)
    const cle = `${col}:${lig}`
    if (col < 0 || prises.has(cle)) continue
    // Boîte de la case inclinée, à l'écran.
    const haut = lig * PAS - DEBORD
    const d1 = (x - largeur / 2) * PENTE
    const d2 = (x + PAS - largeur / 2) * PENTE
    const boite = { l: x, r: x + PAS, t: haut + Math.min(d1, d2), b: haut + PAS + Math.max(d1, d2) }
    if (boite.b < zone[0] - PAS / 2 || boite.t > hauteur) continue
    if (obstacles.some(o => boite.l < o.r && boite.r > o.l && boite.t < o.b && boite.b > o.t)) continue
    prises.add(cle)
    cases.push({ col, lig, delai: (i * 1.7) % 8, duree: 7 + (i % 3) })
  }
  return cases
}

/**
 * Textes, images et champs du parent, en coordonnées du parent. Sont ignorés :
 * le fond lui-même, les décors marqués `data-fond-libre` (la vague de
 * l'en-tête) et les fenêtres `fixed` ouvertes depuis le parent (menu Outils…).
 */
function obstaclesDe(parent: HTMLElement, fond: HTMLElement): Rect[] {
  const origine = parent.getBoundingClientRect()
  const rects: Rect[] = []
  parent.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (fond.contains(el) || el.closest('[data-fond-libre]')) return
    const fenetre = el.closest('.fixed')
    if (fenetre && fenetre !== parent && parent.contains(fenetre)) return
    // Boutons et liens comptent en entier (leur cadre, pas seulement leur texte).
    const porteur = /^(IMG|SVG|INPUT|TEXTAREA|SELECT|BUTTON|A)$/i.test(el.tagName)
      || [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
    if (!porteur) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    rects.push({
      l: r.left - origine.left - RESPIRATION, r: r.right - origine.left + RESPIRATION,
      t: r.top - origine.top - RESPIRATION, b: r.bottom - origine.top + RESPIRATION,
    })
  })
  return rects
}

interface Props {
  /** Nombre de cases qui s'allument (0 : trame seule). */
  cases?: number
  /** Hauteur (px) de la bande du bas où les cases peuvent s'allumer ; par défaut, tout le fond sous le fondu. */
  bande?: number
  /** Masque CSS de la trame (par défaut, le fondu du haut du site). */
  fondu?: string
  /** Grain du site par-dessus l'aplat (classe `bg-grain`). */
  grain?: boolean
  /** Opacité des traits (0,1 sur le site). */
  traits?: number
  className?: string
}

// Que des <span> : le fond se pose aussi dans un <button> (bouton de file actif).
export default function FondQuadrille({
  cases = 8, bande, fondu = FONDU_SITE, grain = true, traits = 0.1, className = '',
}: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [places, setPlaces] = useState<Case[]>([])

  useEffect(() => {
    const fond = ref.current
    const parent = fond?.parentElement
    if (!fond || !parent || cases === 0 || typeof ResizeObserver === 'undefined') return
    let annule = false
    const placer = () => {
      if (annule) return
      const { width, height } = fond.getBoundingClientRect()
      if (!width || !height) return
      const zone: [number, number] = bande ? [height - bande, height - 4] : [height * 0.32, height * 0.95]
      const suivantes = placerCases(cases, width, height, zone, obstaclesDe(parent, fond))
      setPlaces(p => (JSON.stringify(p) === JSON.stringify(suivantes) ? p : suivantes))
    }
    const ro = new ResizeObserver(placer)
    ro.observe(fond)
    // Les polices du site changent la largeur des textes une fois chargées.
    document.fonts?.ready.then(placer).catch(() => {})
    return () => { annule = true; ro.disconnect() }
  }, [cases, bande])

  const trait = `rgba(251, 249, 244, ${traits})`

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
          {places.map(c => (
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
