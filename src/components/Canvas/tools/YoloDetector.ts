export interface Detection {
  x: number        // center x in video-native coords
  y: number        // center y in video-native coords
  width: number    // bbox width in video-native coords
  height: number   // bbox height in video-native coords
  confidence: number
  classId: number  // 0 = person
}

const INPUT_SIZE = 640
const CONFIDENCE_THRESHOLD = 0.5
const IOU_THRESHOLD = 0.45
const PERSON_CLASS_ID = 0
const MIN_INFERENCE_INTERVAL = 100 // ms — cap at ~10fps

// Lazily loaded onnxruntime-web module
type OrtModule = typeof import('onnxruntime-web')
type InferenceSession = import('onnxruntime-web').InferenceSession
type Tensor = import('onnxruntime-web').Tensor

export class YoloDetector {
  private session: InferenceSession | null = null
  private ort: OrtModule | null = null
  modelLoaded = false
  private offscreen: OffscreenCanvas
  private offscreenCtx: OffscreenCanvasRenderingContext2D
  private lastInferenceTime = 0

  constructor() {
    this.offscreen = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE)
    this.offscreenCtx = this.offscreen.getContext('2d')!
  }

  async initialize(): Promise<boolean> {
    try {
      // Dynamic import — keeps onnxruntime-web out of the main bundle
      const ort = await import('onnxruntime-web')
      this.ort = ort

      // Configure ONNX Runtime to use WASM backend (works everywhere in Electron)
      ort.env.wasm.numThreads = 1
      ort.env.wasm.simd = true

      // Resolve model path — works for both dev (public/) and prod (dist/)
      const modelPath = new URL('/models/yolov8n.onnx', window.location.origin).href

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
      this.modelLoaded = true
      console.log('[YoloDetector] Model loaded successfully')
      return true
    } catch (err) {
      console.warn('[YoloDetector] Failed to load model, falling back to color tracker:', err)
      this.modelLoaded = false
      return false
    }
  }

  /**
   * Run detection on the current video frame.
   * Returns all person detections in video-native coordinates.
   */
  async detectAll(
    videoEl: HTMLVideoElement,
    nativeW: number,
    nativeH: number
  ): Promise<Detection[]> {
    if (!this.session || !this.modelLoaded || !this.ort) return []

    // Throttle inference
    const now = performance.now()
    if (now - this.lastInferenceTime < MIN_INFERENCE_INTERVAL) return []
    this.lastInferenceTime = now

    try {
      const inputTensor = this.preprocessFrame(videoEl)
      const results = await this.session.run({ images: inputTensor })

      // YOLOv8 output key is typically 'output0'
      const outputKey = Object.keys(results)[0]
      const output = results[outputKey]

      return this.postprocess(output, nativeW, nativeH)
    } catch (err) {
      console.warn('[YoloDetector] Inference error:', err)
      return []
    }
  }

  /**
   * Find the detection whose center is closest to (targetX, targetY).
   */
  findClosestDetection(
    detections: Detection[],
    targetX: number,
    targetY: number
  ): (Detection & { distance: number }) | null {
    if (detections.length === 0) return null

    let best: Detection | null = null
    let bestDist = Infinity

    for (const det of detections) {
      const dx = det.x - targetX
      const dy = det.y - targetY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) {
        bestDist = dist
        best = det
      }
    }

    return best ? { ...best, distance: bestDist } : null
  }

  /**
   * Draw video frame to 640x640 canvas, extract as Float32 NCHW tensor normalized to [0,1].
   */
  private preprocessFrame(videoEl: HTMLVideoElement): Tensor {
    const ort = this.ort!
    this.offscreenCtx.drawImage(videoEl, 0, 0, INPUT_SIZE, INPUT_SIZE)
    const imageData = this.offscreenCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
    const { data } = imageData

    const size = INPUT_SIZE * INPUT_SIZE
    const float32 = new Float32Array(3 * size)

    // NCHW format: [1, 3, 640, 640], normalize 0-255 → 0-1
    for (let i = 0; i < size; i++) {
      const srcIdx = i * 4
      float32[i] = data[srcIdx] / 255             // R
      float32[size + i] = data[srcIdx + 1] / 255   // G
      float32[2 * size + i] = data[srcIdx + 2] / 255 // B
    }

    return new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE])
  }

  /**
   * Parse YOLOv8 output tensor [1, 84, 8400] → Detection[].
   * 84 = 4 bbox coords (cx, cy, w, h) + 80 class scores.
   * 8400 = number of candidate boxes.
   */
  private postprocess(output: Tensor, origW: number, origH: number): Detection[] {
    const data = output.data as Float32Array
    const [, numFeatures, numCandidates] = output.dims // [1, 84, 8400]

    const candidates: Detection[] = []
    const scaleX = origW / INPUT_SIZE
    const scaleY = origH / INPUT_SIZE

    for (let i = 0; i < numCandidates; i++) {
      // Find best class score for this candidate
      let maxScore = 0
      let maxClassId = 0
      for (let c = 4; c < numFeatures; c++) {
        const score = data[c * numCandidates + i]
        if (score > maxScore) {
          maxScore = score
          maxClassId = c - 4
        }
      }

      // Only keep person detections above threshold
      if (maxClassId !== PERSON_CLASS_ID || maxScore < CONFIDENCE_THRESHOLD) continue

      // Extract bbox (center x, center y, width, height) in 640x640 space
      const cx = data[0 * numCandidates + i]
      const cy = data[1 * numCandidates + i]
      const w = data[2 * numCandidates + i]
      const h = data[3 * numCandidates + i]

      candidates.push({
        x: cx * scaleX,
        y: cy * scaleY,
        width: w * scaleX,
        height: h * scaleY,
        confidence: maxScore,
        classId: PERSON_CLASS_ID,
      })
    }

    return this.nms(candidates)
  }

  /**
   * Non-Maximum Suppression: remove overlapping boxes, keeping highest confidence.
   */
  private nms(detections: Detection[]): Detection[] {
    if (detections.length === 0) return []

    // Sort by confidence descending
    detections.sort((a, b) => b.confidence - a.confidence)

    const kept: Detection[] = []

    for (const det of detections) {
      let dominated = false
      for (const existing of kept) {
        if (this.iou(det, existing) > IOU_THRESHOLD) {
          dominated = true
          break
        }
      }
      if (!dominated) kept.push(det)
    }

    return kept
  }

  /**
   * Intersection over Union between two center-format bboxes.
   */
  private iou(a: Detection, b: Detection): number {
    const ax1 = a.x - a.width / 2, ay1 = a.y - a.height / 2
    const ax2 = a.x + a.width / 2, ay2 = a.y + a.height / 2
    const bx1 = b.x - b.width / 2, by1 = b.y - b.height / 2
    const bx2 = b.x + b.width / 2, by2 = b.y + b.height / 2

    const interX1 = Math.max(ax1, bx1), interY1 = Math.max(ay1, by1)
    const interX2 = Math.min(ax2, bx2), interY2 = Math.min(ay2, by2)
    const interW = Math.max(0, interX2 - interX1)
    const interH = Math.max(0, interY2 - interY1)
    const interArea = interW * interH

    const aArea = a.width * a.height
    const bArea = b.width * b.height
    const unionArea = aArea + bArea - interArea

    return unionArea > 0 ? interArea / unionArea : 0
  }

  dispose() {
    this.session?.release()
    this.session = null
    this.ort = null
    this.modelLoaded = false
  }
}
