// Chantier 162b — préparation d'une capture d'écran avant envoi : réduite dans le
// navigateur (côté long ≤ 1600 px, WebP — JPEG si le navigateur ne sait pas encoder
// du WebP) pour rester sous la limite du bucket (1 Mo) et ménager le plan gratuit.
// La partie « calcul » est pure et testée ; l'encodage utilise le canvas.

/** Côté long maximal de l'image envoyée. */
export const SHARE_IMAGE_MAX_SIDE = 1600
/** Poids maximal de l'image envoyée (miroir de file_size_limit du bucket, avec marge). */
export const SHARE_IMAGE_MAX_BYTES = 1_000_000
/** Poids maximal de l'image d'origine acceptée (avant réduction). */
export const SHARE_IMAGE_MAX_INPUT_BYTES = 25 * 1024 * 1024

/** Dimensions de l'image réduite : ne agrandit jamais, conserve les proportions. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) }
  const k = maxSide / longest
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Message d'erreur si le fichier ne peut pas être partagé, sinon null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'Ce fichier n’est pas une image.'
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return 'Choisis une capture d’écran ou une photo (PNG, JPEG ou WebP).'
  }
  if (file.size > SHARE_IMAGE_MAX_INPUT_BYTES) return 'Cette image est trop lourde (25 Mo maximum).'
  return null
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * Réduit l'image et l'encode (WebP, ou JPEG de repli). Essaie une qualité décroissante
 * puis une taille réduite tant que le résultat dépasse SHARE_IMAGE_MAX_BYTES.
 */
export async function compressShareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    let side = SHARE_IMAGE_MAX_SIDE
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side)
      if (width === 0) throw new Error('Image illisible')
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Image illisible')
      // Fond blanc : une capture transparente ne doit pas devenir noire en JPEG.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)

      for (const quality of [0.82, 0.65]) {
        let blob = await canvasToBlob(canvas, 'image/webp', quality)
        // Safari ancien : toBlob('image/webp') renvoie un PNG, que le bucket refuse.
        if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality)
        if (blob && blob.size <= SHARE_IMAGE_MAX_BYTES) return blob
      }
      side = Math.round(side * 0.75)
    }
    throw new Error('Cette image reste trop lourde après réduction.')
  } finally {
    bitmap.close()
  }
}
