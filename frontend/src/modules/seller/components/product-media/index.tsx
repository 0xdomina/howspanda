"use client"

import { useEffect, useRef, useState } from "react"

import { encodeProductImage } from "@lib/media/image"
import {
  encodeProductVideo,
  VideoEncodeUnsupportedError,
} from "@lib/media/video"
import { uploadSellerMedia } from "@lib/data/seller-media"

type ProductMediaProps = {
  photos: string[]
  onPhotosChange: (urls: string[]) => void
  bannerUrl: string | null
  onBannerChange: (url: string | null) => void
  videoUrl: string | null
  onVideoChange: (url: string | null) => void
  showVideo: boolean
  onBusyChange?: (busy: boolean) => void
  hiddenPhotosName?: string
  hiddenBannerName?: string
  hiddenVideoName?: string
}

type UploadState = {
  kind: "image" | "video" | "banner"
  status: "idle" | "encoding" | "uploading" | "done" | "error"
  progress: number | null
  error: string | null
}

const MAX_PHOTOS = 4

const ProductMedia = ({
  photos,
  onPhotosChange,
  bannerUrl,
  onBannerChange,
  videoUrl,
  onVideoChange,
  showVideo,
  onBusyChange,
  hiddenPhotosName,
  hiddenBannerName,
  hiddenVideoName,
}: ProductMediaProps) => {
  const imageInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>({
    kind: "image",
    status: "idle",
    progress: null,
    error: null,
  })
  const [activeUploads, setActiveUploads] = useState(0)

  const busy = activeUploads > 0 || state.status === "encoding" || state.status === "uploading"

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  const uploadImage = async (file: File, kind: "image" | "banner") => {
    setActiveUploads((count) => count + 1)
    setState({ kind, status: "encoding", progress: 0, error: null })
    try {
      const blob = await encodeProductImage(file)
      setState({ kind, status: "uploading", progress: null, error: null })
      const res = await uploadSellerMedia(
        new File([blob], `${kind}-${Date.now()}.webp`, { type: blob.type }),
        "image"
      )
      if (res.error || !res.url) {
        setState({ kind, status: "error", progress: null, error: res.error ?? "Upload failed." })
        return null
      }
      setState({ kind, status: "done", progress: 100, error: null })
      return res.url
    } catch (err: any) {
      setState({ kind, status: "error", progress: null, error: err?.message ?? "Could not process that image." })
      return null
    } finally {
      setActiveUploads((count) => Math.max(0, count - 1))
    }
  }

  const uploadImages = async (files: File[]) => {
    const remaining = MAX_PHOTOS - photos.length
    if (files.length > remaining) {
      setState({
        kind: "image",
        status: "error",
        progress: null,
        error: `Choose up to ${MAX_PHOTOS} product photos.`,
      })
    }

    const selected = files.slice(0, Math.max(0, remaining))
    const uploaded = await Promise.all(selected.map((file) => uploadImage(file, "image")))
    const nextPhotos = [...photos, ...uploaded.filter((url): url is string => !!url)]
    if (nextPhotos.length !== photos.length) onPhotosChange(nextPhotos)
  }

  const uploadBanner = async (file: File) => {
    const url = await uploadImage(file, "banner")
    if (url) onBannerChange(url)
  }

  const uploadVideo = async (file: File) => {
    setState({ kind: "video", status: "encoding", progress: 0, error: null })
    let blob: Blob = file
    try {
      blob = await encodeProductVideo(file, (pct) => {
        setState({ kind: "video", status: "encoding", progress: pct, error: null })
      })
    } catch (err: any) {
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

  const movePhoto = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= photos.length) return
    const next = [...photos]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    onPhotosChange(next)
  }

  const progressBar = (label: string) => (
    <div className="flex items-center gap-3 text-sm text-ink-muted" role="status">
      <div className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-ink transition-all duration-200"
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
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        data-testid="product-media-image-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length) void uploadImages(files)
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={bannerInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        data-testid="product-media-banner-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void uploadBanner(file)
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        data-testid="product-media-video-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void uploadVideo(file)
          event.currentTarget.value = ""
        }}
      />

      {hiddenPhotosName && <input type="hidden" name={hiddenPhotosName} value={JSON.stringify(photos)} />}
      {hiddenBannerName && <input type="hidden" name={hiddenBannerName} value={bannerUrl ?? ""} />}
      {hiddenVideoName && <input type="hidden" name={hiddenVideoName} value={videoUrl ?? ""} />}

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Product photos</p>
            <p className="mt-1 text-xs text-ink-muted">Add up to four. The first photo is your cover.</p>
          </div>
          <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-muted">{photos.length}/4</span>
        </div>

        {photos.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 small:grid-cols-4">
            {photos.map((url, index) => (
              <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-medium border border-ink-hairline bg-paper-tinted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Product photo ${index + 1}`} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-full bg-ink/70 px-1.5 py-1 text-[10px] text-paper backdrop-blur-sm">
                  <span>{index === 0 ? "Cover" : `Photo ${index + 1}`}</span>
                  <span className="flex items-center gap-0.5">
                    <button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} aria-label={`Move photo ${index + 1} earlier`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30">←</button>
                    <button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} aria-label={`Move photo ${index + 1} later`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30">→</button>
                  </span>
                </div>
                <button type="button" onClick={() => onPhotosChange(photos.filter((_, photoIndex) => photoIndex !== index))} aria-label={`Remove photo ${index + 1}`} className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs text-ink shadow transition-transform duration-200 hover:scale-105">×</button>
              </div>
            ))}
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => imageInput.current?.click()} className="mt-4 flex aspect-[2/1] w-full flex-col items-center justify-center rounded-medium border border-dashed border-ink-hairline text-sm text-ink-muted transition-colors duration-200 hover:border-ink hover:bg-paper-tinted disabled:opacity-50" data-testid="product-media-add-photo">
            <span className="text-2xl">＋</span>
            Add product photos
          </button>
        )}
        {photos.length > 0 && photos.length < MAX_PHOTOS && (
          <button type="button" disabled={busy} onClick={() => imageInput.current?.click()} className="mt-4 text-sm font-medium text-ink underline underline-offset-4 disabled:opacity-50" data-testid="product-media-add-photo">Add another photo</button>
        )}
        {state.kind === "image" && state.status === "encoding" && progressBar("Preparing images…")}
        {state.kind === "image" && state.status === "uploading" && <p className="mt-2 text-sm text-ink-muted" role="status">Uploading photo…</p>}
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Home banner image</p>
            <p className="mt-1 text-xs text-ink-muted">Optional wide artwork for the homepage feature carousel.</p>
          </div>
          <span className="text-xs font-medium text-ink-muted">Optional</span>
        </div>
        {bannerUrl ? (
          <div className="mt-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerUrl} alt="Home banner preview" loading="lazy" decoding="async" className="h-20 w-full rounded-medium border border-ink-hairline object-cover" />
            <div className="flex shrink-0 flex-col gap-2">
              <button type="button" onClick={() => bannerInput.current?.click()} className="text-sm text-ink-muted underline underline-offset-4">Change</button>
              <button type="button" onClick={() => onBannerChange(null)} className="text-sm text-ink-muted underline underline-offset-4">Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => bannerInput.current?.click()} className="mt-4 text-sm font-medium text-ink underline underline-offset-4 disabled:opacity-50" data-testid="product-media-add-banner">Add banner image</button>
        )}
        {state.kind === "banner" && state.status === "encoding" && progressBar("Preparing banner…")}
        {state.kind === "banner" && state.status === "uploading" && <p className="mt-2 text-sm text-ink-muted" role="status">Uploading banner…</p>}
      </div>

      {showVideo && (
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">Product video</p>
              <p className="mt-1 text-xs text-ink-muted">Optional short clip. It joins your four photos as the fifth media item.</p>
            </div>
            <span className="text-xs font-medium text-ink-muted">Optional</span>
          </div>
          {videoUrl ? (
            <div className="mt-4 flex items-center gap-3">
              <video src={videoUrl} controls playsInline preload="metadata" className="h-20 w-32 rounded-medium border border-ink-hairline object-cover" />
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => videoInput.current?.click()} className="text-sm text-ink-muted underline underline-offset-4">Change video</button>
                <button type="button" onClick={() => onVideoChange(null)} className="text-sm text-ink-muted underline underline-offset-4">Remove video</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => videoInput.current?.click()} className="mt-4 text-sm font-medium text-ink underline underline-offset-4 disabled:opacity-50" data-testid="product-media-add-video">Add a video</button>
          )}
          {state.kind === "video" && state.status === "encoding" && progressBar("Preparing video…")}
          {state.kind === "video" && state.status === "uploading" && <p className="mt-2 text-sm text-ink-muted" role="status">Uploading video…</p>}
        </div>
      )}

      <p className="text-xs text-ink-muted">{photos.length + (videoUrl ? 1 : 0)} of 5 product media selected</p>
      {state.status === "error" && <p className="text-sm text-rose-600" role="alert" data-testid="product-media-error">{state.error}</p>}
    </div>
  )
}

export default ProductMedia
