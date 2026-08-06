"use client"

import { useRef, useState } from "react"

import { encodeProductImage } from "@lib/media/image"
import {
  encodeProductVideo,
  VideoEncodeUnsupportedError,
} from "@lib/media/video"
import { uploadSellerMedia } from "@lib/data/seller-media"

type ProductMediaProps = {
  photo: string
  onPhotoChange: (url: string) => void
  videoUrl: string | null
  onVideoChange: (url: string | null) => void
  showVideo: boolean
  hiddenPhotoName?: string
  hiddenVideoName?: string
}

type UploadState = {
  kind: "image" | "video"
  status: "idle" | "encoding" | "uploading" | "done" | "error"
  progress: number | null
  error: string | null
}

// Product media uploader: the image and video are re-encoded in the browser
// (WebP/AVIF for photos, H.264 MP4 for clips), then the result is uploaded via
// the seller server action. Sellers see a live preview and can retry/remove.
const ProductMedia = ({
  photo,
  onPhotoChange,
  videoUrl,
  onVideoChange,
  showVideo,
  hiddenPhotoName,
  hiddenVideoName,
}: ProductMediaProps) => {
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>({
    kind: "image",
    status: "idle",
    progress: null,
    error: null,
  })

  const busy = state.status === "encoding" || state.status === "uploading"

  const uploadImage = async (file: File) => {
    setState({ kind: "image", status: "encoding", progress: 0, error: null })
    try {
      const blob = await encodeProductImage(file)
      setState({ kind: "image", status: "uploading", progress: null, error: null })
      const res = await uploadSellerMedia(
        new File([blob], "photo.webp", { type: blob.type }),
        "image"
      )
      if (res.error || !res.url) {
        setState({ kind: "image", status: "error", progress: null, error: res.error ?? "Upload failed." })
        return
      }
      onPhotoChange(res.url)
      setState({ kind: "image", status: "done", progress: 100, error: null })
    } catch (err: any) {
      setState({ kind: "image", status: "error", progress: null, error: err?.message ?? "Could not process that image." })
    }
  }

  const uploadVideo = async (file: File) => {
    setState({ kind: "video", status: "encoding", progress: 0, error: null })
    let blob: Blob = file
    try {
      blob = await encodeProductVideo(file, (pct) => {
        setState({ kind: "video", status: "encoding", progress: pct, error: null })
      })
    } catch (err: any) {
      // No H.264 encoder (e.g. Firefox): upload the original file — it must
      // already be an MP4; the backend validates the actual bytes.
      if (err instanceof VideoEncodeUnsupportedError) {
        setState({ kind: "video", status: "uploading", progress: null, error: null })
        const direct = await uploadSellerMedia(file, "video")
        if (direct.error || !direct.url) {
          setState({ kind: "video", status: "error", progress: null, error: direct.error ?? "Upload failed." })
          return
        }
        onVideoChange(direct.url)
        setState({ kind: "video", status: "done", progress: 100, error: null })
        return
      }
      setState({ kind: "video", status: "error", progress: null, error: err?.message ?? "Could not process that video." })
      return
    }

    setState({ kind: "video", status: "uploading", progress: null, error: null })
    const res = await uploadSellerMedia(
      new File([blob], "product.mp4", { type: "video/mp4" }),
      "video"
    )
    if (res.error || !res.url) {
      setState({ kind: "video", status: "error", progress: null, error: res.error ?? "Upload failed." })
      return
    }
    onVideoChange(res.url)
    setState({ kind: "video", status: "done", progress: 100, error: null })
  }

  const progressBar = (label: string) => (
    <div className="flex items-center gap-3 text-sm text-ink-muted">
      <div className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-ink transition-all"
          style={{ width: `${state.progress ?? 0}%` }}
        />
      </div>
      <span className="shrink-0">{label}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-y-4">
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="product-media-image-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) uploadImage(file)
          e.currentTarget.value = ""
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        data-testid="product-media-video-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) uploadVideo(file)
          e.currentTarget.value = ""
        }}
      />

      {hiddenPhotoName && <input type="hidden" name={hiddenPhotoName} value={photo} />}
      {hiddenVideoName && <input type="hidden" name={hiddenVideoName} value={videoUrl ?? ""} />}

      <div className="border border-ink-hairline rounded-large p-4 bg-paper-surface">
        <p className="text-sm font-medium text-ink mb-2">Photo</p>
        {photo ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt="Product photo"
              className="h-20 w-32 rounded-medium border border-ink-hairline object-cover"
            />
            <button
              type="button"
              onClick={() => imageInput.current?.click()}
              className="text-sm text-ink-muted underline underline-offset-4"
              data-testid="product-media-change-photo"
            >
              Change photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => imageInput.current?.click()}
            className="text-sm text-ink-muted underline underline-offset-4 disabled:opacity-50"
            data-testid="product-media-add-photo"
          >
            Add a photo
          </button>
        )}
        {state.kind === "image" && state.status === "encoding" && progressBar("Processing…")}
        {state.kind === "image" && state.status === "uploading" && (
          <p className="text-sm text-ink-muted">Uploading…</p>
        )}
      </div>

      {showVideo && (
        <div className="border border-ink-hairline rounded-large p-4 bg-paper-surface">
          <p className="text-sm font-medium text-ink mb-2">
            Video <span className="font-normal text-ink-muted">(optional, short clip)</span>
          </p>
          {videoUrl ? (
            <div className="flex items-center gap-3">
              <video
                src={videoUrl}
                controls
                playsInline
                className="h-20 w-32 rounded-medium border border-ink-hairline object-cover"
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => videoInput.current?.click()}
                  className="text-sm text-ink-muted underline underline-offset-4"
                  data-testid="product-media-change-video"
                >
                  Change video
                </button>
                <button
                  type="button"
                  onClick={() => onVideoChange(null)}
                  className="text-sm text-ink-muted underline underline-offset-4"
                  data-testid="product-media-remove-video"
                >
                  Remove video
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => videoInput.current?.click()}
              className="text-sm text-ink-muted underline underline-offset-4 disabled:opacity-50"
              data-testid="product-media-add-video"
            >
              Add a video
            </button>
          )}
          {state.kind === "video" && state.status === "encoding" && progressBar("Compressing…")}
          {state.kind === "video" && state.status === "uploading" && (
            <p className="text-sm text-ink-muted">Uploading…</p>
          )}
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-rose-600" data-testid="product-media-error">
          {state.error}
        </p>
      )}
    </div>
  )
}

export default ProductMedia
