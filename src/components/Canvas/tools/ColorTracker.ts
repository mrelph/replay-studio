/**
 * Color-based template matching for auto-tracking players in video.
 * Samples a pixel region around a point and finds the best match in subsequent frames.
 */

export interface TemplateData {
  pixels: Uint8ClampedArray
  width: number
  height: number
}

export interface MatchResult {
  x: number
  y: number
  confidence: number
}

export class ColorTracker {
  private offscreen: OffscreenCanvas
  private ctx: OffscreenCanvasRenderingContext2D

  constructor() {
    this.offscreen = new OffscreenCanvas(320, 240)
    this.ctx = this.offscreen.getContext('2d', { willReadFrequently: true })!
  }

  /**
   * Sample a template region from the video around (x, y) in canvas coordinates.
   * The video is drawn to an offscreen canvas and the pixel region is extracted.
   */
  sampleTemplate(
    videoEl: HTMLVideoElement,
    x: number,
    y: number,
    canvasW: number,
    canvasH: number,
    radius: number = 20
  ): TemplateData | null {
    if (!videoEl.videoWidth || !videoEl.videoHeight) return null

    // Resize offscreen to match video
    const vw = videoEl.videoWidth
    const vh = videoEl.videoHeight
    this.offscreen.width = vw
    this.offscreen.height = vh
    this.ctx.drawImage(videoEl, 0, 0, vw, vh)

    // Map canvas coords to video coords
    const scaleX = vw / canvasW
    const scaleY = vh / canvasH
    const vx = Math.round(x * scaleX)
    const vy = Math.round(y * scaleY)
    const vr = Math.round(radius * Math.min(scaleX, scaleY))

    const sx = Math.max(0, vx - vr)
    const sy = Math.max(0, vy - vr)
    const sw = Math.min(vr * 2, vw - sx)
    const sh = Math.min(vr * 2, vh - sy)

    if (sw <= 0 || sh <= 0) return null

    const imageData = this.ctx.getImageData(sx, sy, sw, sh)
    return {
      pixels: imageData.data,
      width: sw,
      height: sh,
    }
  }

  /**
   * Find the best match for a template in the current video frame.
   * Uses coarse-to-fine search around the last known position.
   */
  findBestMatch(
    videoEl: HTMLVideoElement,
    lastX: number,
    lastY: number,
    template: TemplateData,
    canvasW: number,
    canvasH: number,
    searchRadius: number = 60
  ): MatchResult | null {
    if (!videoEl.videoWidth || !videoEl.videoHeight) return null

    const vw = videoEl.videoWidth
    const vh = videoEl.videoHeight
    this.offscreen.width = vw
    this.offscreen.height = vh
    this.ctx.drawImage(videoEl, 0, 0, vw, vh)

    const scaleX = vw / canvasW
    const scaleY = vh / canvasH
    const vLastX = Math.round(lastX * scaleX)
    const vLastY = Math.round(lastY * scaleY)
    const vSearchR = Math.round(searchRadius * Math.min(scaleX, scaleY))

    const tw = template.width
    const th = template.height

    // Coarse search: 4x4 grid
    const coarseStep = Math.max(Math.floor(vSearchR / 2), 4)
    let bestX = vLastX
    let bestY = vLastY
    let bestDist = Infinity

    for (let dy = -vSearchR; dy <= vSearchR; dy += coarseStep) {
      for (let dx = -vSearchR; dx <= vSearchR; dx += coarseStep) {
        const cx = vLastX + dx
        const cy = vLastY + dy
        const dist = this.compareRegion(cx, cy, tw, th, template.pixels, vw, vh)
        if (dist < bestDist) {
          bestDist = dist
          bestX = cx
          bestY = cy
        }
      }
    }

    // Fine search: around best coarse match
    const fineStep = Math.max(Math.floor(coarseStep / 4), 1)
    const fineRadius = coarseStep

    for (let dy = -fineRadius; dy <= fineRadius; dy += fineStep) {
      for (let dx = -fineRadius; dx <= fineRadius; dx += fineStep) {
        const cx = bestX + dx
        const cy = bestY + dy
        const dist = this.compareRegion(cx, cy, tw, th, template.pixels, vw, vh)
        if (dist < bestDist) {
          bestDist = dist
          bestX = cx
          bestY = cy
        }
      }
    }

    // Convert confidence: lower distance = higher confidence
    // Normalize: 0 means perfect match, >1 means poor
    const confidence = Math.max(0, 1 - bestDist / 150)

    // Map back to canvas coords
    return {
      x: bestX / scaleX,
      y: bestY / scaleY,
      confidence,
    }
  }

  /**
   * Compare a region of the current frame against the template using
   * average color distance (sum of absolute channel differences).
   */
  private compareRegion(
    cx: number,
    cy: number,
    tw: number,
    th: number,
    templatePixels: Uint8ClampedArray,
    frameW: number,
    frameH: number
  ): number {
    const sx = cx - Math.floor(tw / 2)
    const sy = cy - Math.floor(th / 2)

    if (sx < 0 || sy < 0 || sx + tw > frameW || sy + th > frameH) {
      return Infinity
    }

    let imageData: ImageData
    try {
      imageData = this.ctx.getImageData(sx, sy, tw, th)
    } catch {
      return Infinity
    }

    const pixels = imageData.data
    let totalDist = 0
    const sampleStep = 4 // Sample every 4th pixel for speed
    let count = 0

    for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
      const dr = Math.abs(pixels[i] - templatePixels[i])
      const dg = Math.abs(pixels[i + 1] - templatePixels[i + 1])
      const db = Math.abs(pixels[i + 2] - templatePixels[i + 2])
      totalDist += (dr + dg + db) / 3
      count++
    }

    return count > 0 ? totalDist / count : Infinity
  }
}
