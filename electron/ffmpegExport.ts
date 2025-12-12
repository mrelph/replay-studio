import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// Try to get ffmpeg path from ffmpeg-static
let ffmpegPath: string
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ffmpegPath = require('ffmpeg-static')
} catch {
  // Fallback to system ffmpeg
  ffmpegPath = 'ffmpeg'
}

export interface ExportOptions {
  inputPath: string
  outputPath: string
  startTime?: number
  endTime?: number
  quality: 'high' | 'medium' | 'low'
  fps: number
  format: 'mp4' | 'gif'
}

export interface ExportProgress {
  percent: number
  frame?: number
  fps?: number
  time?: string
}

type ProgressCallback = (progress: ExportProgress) => void

const QUALITY_PRESETS = {
  high: { crf: 18, preset: 'slow', scale: -1 },
  medium: { crf: 23, preset: 'medium', scale: 720 },
  low: { crf: 28, preset: 'fast', scale: 480 },
}

export function exportVideo(
  options: ExportOptions,
  onProgress?: ProgressCallback
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { inputPath, outputPath, startTime, endTime, quality, fps, format } = options

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      reject(new Error(`Input file not found: ${inputPath}`))
      return
    }

    const qualitySettings = QUALITY_PRESETS[quality]
    const args: string[] = ['-y'] // Overwrite output

    // Input seeking (before input for faster seeking)
    if (startTime !== undefined && startTime > 0) {
      args.push('-ss', startTime.toString())
    }

    // Input file
    args.push('-i', inputPath)

    // Duration limit
    if (startTime !== undefined && endTime !== undefined) {
      const duration = endTime - startTime
      args.push('-t', duration.toString())
    }

    // Output settings based on format
    if (format === 'gif') {
      // GIF export with palette generation for better quality
      args.push(
        '-vf', `fps=${Math.min(fps, 15)},scale=${qualitySettings.scale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer`,
        '-loop', '0'
      )
    } else {
      // MP4 export
      args.push(
        '-c:v', 'libx264',
        '-preset', qualitySettings.preset,
        '-crf', qualitySettings.crf.toString(),
        '-r', fps.toString()
      )

      // Scale if not high quality
      if (qualitySettings.scale !== -1) {
        args.push('-vf', `scale=-2:${qualitySettings.scale}`)
      }

      // Audio settings
      args.push('-c:a', 'aac', '-b:a', '128k')

      // Compatibility settings
      args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart')
    }

    // Output file
    args.push(outputPath)

    // Get video duration for progress calculation
    let videoDuration = endTime !== undefined && startTime !== undefined
      ? endTime - startTime
      : 0

    // Spawn FFmpeg process
    const ffmpeg = spawn(ffmpegPath, args)

    let stderr = ''

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const output = data.toString()
      stderr += output

      // Parse duration if not yet known
      if (videoDuration === 0) {
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
        if (durationMatch) {
          const hours = parseInt(durationMatch[1])
          const minutes = parseInt(durationMatch[2])
          const seconds = parseFloat(durationMatch[3])
          videoDuration = hours * 3600 + minutes * 60 + seconds

          if (startTime !== undefined && endTime !== undefined) {
            videoDuration = endTime - startTime
          }
        }
      }

      // Parse progress
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      const frameMatch = output.match(/frame=\s*(\d+)/)
      const fpsMatch = output.match(/fps=\s*(\d+\.?\d*)/)

      if (timeMatch && videoDuration > 0) {
        const hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const seconds = parseFloat(timeMatch[3])
        const currentTime = hours * 3600 + minutes * 60 + seconds
        const percent = Math.min(100, (currentTime / videoDuration) * 100)

        onProgress?.({
          percent,
          frame: frameMatch ? parseInt(frameMatch[1]) : undefined,
          fps: fpsMatch ? parseFloat(fpsMatch[1]) : undefined,
          time: `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`,
        })
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        onProgress?.({ percent: 100 })
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`))
    })
  })
}

// Get FFmpeg version to verify it's working
export async function getFFmpegVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, ['-version'])
    let stdout = ''

    ffmpeg.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const versionMatch = stdout.match(/ffmpeg version (\S+)/)
        resolve(versionMatch ? versionMatch[1] : 'unknown')
      } else {
        reject(new Error('FFmpeg not found'))
      }
    })

    ffmpeg.on('error', () => {
      reject(new Error('FFmpeg not found'))
    })
  })
}
