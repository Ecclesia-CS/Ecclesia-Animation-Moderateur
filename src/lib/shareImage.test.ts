import { describe, expect, it } from 'vitest'
import { checkImageFile, fitWithin, SHARE_IMAGE_MAX_INPUT_BYTES } from './shareImage'

describe('fitWithin', () => {
  it('ne touche pas une image déjà assez petite', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
  it('réduit le côté long en gardant les proportions', () => {
    expect(fitWithin(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 })
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 })
  })
  it('ne renvoie jamais une dimension nulle pour une image valide', () => {
    expect(fitWithin(10000, 1, 1600).height).toBe(1)
  })
  it('renvoie 0×0 pour une image sans dimension', () => {
    expect(fitWithin(0, 100, 1600)).toEqual({ width: 0, height: 0 })
  })
})

describe('checkImageFile', () => {
  it('accepte une capture PNG', () => {
    expect(checkImageFile({ type: 'image/png', size: 400_000 })).toBeNull()
  })
  it('refuse ce qui n’est pas une image', () => {
    expect(checkImageFile({ type: 'application/pdf', size: 10 })).not.toBeNull()
  })
  it('refuse le SVG (script embarqué) et le GIF', () => {
    expect(checkImageFile({ type: 'image/svg+xml', size: 10 })).not.toBeNull()
    expect(checkImageFile({ type: 'image/gif', size: 10 })).not.toBeNull()
  })
  it('refuse une image d’origine démesurée', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: SHARE_IMAGE_MAX_INPUT_BYTES + 1 })).not.toBeNull()
  })
})
