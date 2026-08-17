// Client-side product video pipeline. The chosen file is decoded by the
// browser's <video> element, re-encoded to H.264 (WebCodecs VideoEncoder) and
// muxed into a single MP4 (mp4-muxer) in memory — the raw clip never leaves
// the device. Audio is dropped intentionally (short, usually silent product
// clips; keeps the encode deterministic and the file tiny).
//
// WebCodecs needs an H.264 encoder, which Chrome/Edge/Safari expose (often
// hardware-backed) but Firefox does not. When it is unavailable,
// encodeProductVideo throws VideoEncodeUnsupportedError and the form falls
// back to uploading a pre-encoded MP4 directly.
import { Muxer, ArrayBufferTarget } from "mp4-muxer"

export type VideoEncodeProgress = (percent: number) => void

export class VideoEncodeUnsupportedError extends Error {
  constructor() {
    super("This browser can't encode video here — upload a prepared MP4 instead.")
    this.name = "VideoEncodeUnsupportedError"
  }
}

const AVC_CODECS = ["avc1.42001f", "avc1.640028", "avc1.4d0028"]
const MAX_DIM = 1280
const MAX_FPS = 30
const MAX_SECONDS = 30
const MAX_INPUT_BYTES = 40 * 1024 * 1024
const KEYFRAME_EVERY = 2 // seconds
const BITRATE_PER_PIXEL = 0.11

export async function videoEncoderSupported(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    return false
  }
  for (const codec of AVC_CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: 640,
        height: 360,
        bitrate: 1_000_000,
      })
      if (support.supported) return true
    } catch {
      // keep probing the next codec
    }
  }
  return false
}

function pickCodec(width: number, height: number, bitrate: number): Promise<string> {
  return (async () => {
    for (const codec of AVC_CODECS) {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
      })
      if (support.supported) return codec
    }
    throw new VideoEncodeUnsupportedError()
  })()
}

type LoadedVideo = { video: HTMLVideoElement; url: string }

function loadVideo(file: File): Promise<LoadedVideo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    const fail = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read that file as a video."))
    }
    video.onerror = fail
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) return fail()
      resolve({ video, url })
    }
  })
}

function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2)
}

export async function encodeProductVideo(
  file: File,
  onProgress?: VideoEncodeProgress
): Promise<Blob> {
  if (!/^video\/(mp4|quicktime|webm)$/i.test(file.type)) {
    throw new Error("Choose an MP4 video.")
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Choose a video smaller than 40 MB.")
  }
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new VideoEncodeUnsupportedError()
  }

  const loaded = await loadVideo(file)
  const video = loaded.video

  try {
  const duration = Math.min(MAX_SECONDS, video.duration || MAX_SECONDS)
  const fps = Math.min(MAX_FPS, 30)
  const frameUs = Math.round(1_000_000 / fps)
  const keyframeEvery = Math.round(fps * KEYFRAME_EVERY)

  const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight))
  const width = even(video.videoWidth * scale)
  const height = even(video.videoHeight * scale)
  const bitrate = Math.max(1_000_000, Math.min(6_000_000, width * height * BITRATE_PER_PIXEL))

  const codec = await pickCodec(width, height, bitrate)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.")

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
  })

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta)
    },
    error: (e) => {
      throw e
    },
  })
  encoder.configure({ codec, width, height, bitrate, framerate: fps })

  await new Promise<void>((resolve, reject) => {
    const done = () => {
      video.pause()
      resolve()
    }

    const captureFrame = (mediaTime: number, keyFrame: boolean) => {
      ctx.drawImage(video, 0, 0, width, height)
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(mediaTime * 1_000_000),
        duration: frameUs,
      })
      encoder.encode(frame, { keyFrame })
      frame.close()
    }

    let frameIndex = 0

    const finish = () => {
      onProgress?.(100)
      done()
    }

    const step = (mediaTime: number) => {
      const progress = (mediaTime / video.duration) * 100
      onProgress?.(Math.min(99, progress))
      if (video.ended || mediaTime >= duration - 0.02) {
        finish()
        return
      }
      captureFrame(mediaTime, frameIndex % keyframeEvery === 0)
      frameIndex += 1
    }

    const handleError = (err: unknown) => reject(err)

    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        try {
          step(meta.mediaTime ?? video.currentTime)
          if (!video.ended && video.currentTime < duration - 0.02) {
            video.requestVideoFrameCallback(onFrame)
          }
        } catch (err) {
          handleError(err)
        }
      }
      video.requestVideoFrameCallback(onFrame)
    } else {
      // rVFC unavailable: sample on requestAnimationFrame, throttled to fps.
      let last = 0
      const onRaf = () => {
        try {
          if (video.ended || video.currentTime >= duration - 0.02) {
            finish()
            return
          }
          const now = performance.now()
          if (now - last >= 1_000 / fps) {
            last = now
            step(video.currentTime)
          }
          if (!video.ended && video.currentTime < duration - 0.02) {
            requestAnimationFrame(onRaf)
          }
        } catch (err) {
          handleError(err)
        }
      }
      requestAnimationFrame(onRaf)
    }

    video
      .play()
      .catch(() => {
        // Play may be blocked; seek-based sampling still works.
        video.currentTime = 0
      })
  })

  await encoder.flush()
  encoder.close()
  muxer.finalize()

  const { buffer } = muxer.target
  return new Blob([buffer], { type: "video/mp4" })
  } finally {
    video.pause()
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(loaded.url)
  }
}
