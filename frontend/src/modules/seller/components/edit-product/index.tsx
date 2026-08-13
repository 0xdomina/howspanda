"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { updateSellerProduct } from "@lib/data/seller"
import ProductMedia from "@modules/seller/components/product-media"

type VariantRow = {
  id: string
  title: string
  price: string
  stock: string
}

const EditProduct = ({
  productId,
  title: initialTitle,
  description: initialDescription,
  photo: initialPhoto,
  videoUrl: initialVideoUrl,
  variants: initialVariants,
  flashSale: initialFlashSale,
  homepageBanner: initialHomepageBanner,
  showVideo,
}: {
  productId: string
  title: string
  description?: string
  photo?: string | null
  videoUrl?: string | null
  variants: {
    id: string
    title: string
    price?: number
    stock?: number
  }[]
  flashSale?: boolean
  homepageBanner?: boolean
  showVideo: boolean
}) => {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription ?? "")
  const [photo, setPhoto] = useState(initialPhoto ?? "")
  const [videoUrl, setVideoUrl] = useState<string | null>(initialVideoUrl ?? null)
  const [flashSale, setFlashSale] = useState(Boolean(initialFlashSale))
  const [homepageBanner, setHomepageBanner] = useState(Boolean(initialHomepageBanner))
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initialVariants.map((v) => ({
      id: v.id,
      title: v.title,
      price: v.price != null ? String(v.price) : "",
      stock: v.stock != null ? String(v.stock) : "",
    }))
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const update: {
      title?: string
      description?: string
      photo?: string
      videoUrl?: string | null
      flashSale?: boolean
      homepageBanner?: boolean
      variants?: {
        id: string
        price?: number
        stock?: number
      }[]
    } = {
      title,
      description: description || undefined,
      photo: photo || undefined,
      variants: variants.map((v) => ({
        id: v.id,
        price: v.price !== "" ? Number(v.price) : undefined,
        stock: v.stock !== "" ? Number(v.stock) : undefined,
      })),
      flashSale,
      homepageBanner,
    }
    if (showVideo && videoUrl !== undefined) update.videoUrl = videoUrl

    startTransition(async () => {
      const result = await updateSellerProduct(productId, update)
      if (result) {
        setError(result)
        return
      }
      router.push("/seller/products")
      router.refresh()
    })
  }

  return (
    <div className="max-w-lg w-full" data-testid="edit-product-page">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-6">
        Edit product
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
        <Input
          label="Title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoComplete="off"
          data-testid="product-title-input"
        />
        <ProductMedia
          photo={photo}
          onPhotoChange={setPhoto}
          videoUrl={videoUrl}
          onVideoChange={setVideoUrl}
          showVideo={showVideo}
        />

        {variants.length > 0 && (
          <div
            className="border border-ink-hairline rounded-large p-4 flex flex-col gap-y-3 bg-paper-surface"
            data-testid="variant-editor"
          >
            <p className="text-sm font-medium text-ink">Price &amp; stock</p>
            {variants.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2"
                data-testid={`variant-row-${v.title}`}
              >
                <span className="text-sm text-ink font-medium">{v.title}</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Price (NGN)"
                    value={v.price}
                    onChange={(e) =>
                      setVariants((prev) =>
                        prev.map((x) =>
                          x.id === v.id ? { ...x, price: e.target.value } : x
                        )
                      )
                    }
                    className="w-28 px-3 py-2 text-sm font-mono tabular-nums border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
                    data-testid={`variant-price-${v.title}`}
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="Qty"
                    value={v.stock}
                    onChange={(e) =>
                      setVariants((prev) =>
                        prev.map((x) =>
                          x.id === v.id ? { ...x, stock: e.target.value } : x
                        )
                      )
                    }
                    className="w-16 px-3 py-2 text-sm tabular-nums border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
                    data-testid={`variant-stock-${v.title}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-ink">Description</label>
          <textarea
            name="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full px-4 py-2 border border-ink-hairline rounded bg-ui-bg-field focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
            data-testid="product-description-input"
          />
        </div>

        <div className="grid gap-3 rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-sm font-medium text-ink">Promote this product</p>
          <label className="flex items-start gap-3 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={flashSale}
              onChange={(event) => setFlashSale(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
              data-testid="flash-sale-checkbox"
            />
            <span>
              <span className="block font-medium text-ink">Add to flash sale</span>
              <span className="block text-xs text-ink-muted">This product appears in the current 3-day sale cycle.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={homepageBanner}
              onChange={(event) => setHomepageBanner(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
              data-testid="homepage-banner-checkbox"
            />
            <span>
              <span className="block font-medium text-ink">Feature in the home banner</span>
              <span className="block text-xs text-ink-muted">Up to five featured products rotate on the homepage.</span>
            </span>
          </label>
        </div>

        <ErrorMessage error={error} data-testid="edit-product-error" />
        <SubmitButton className="mt-2" data-testid="edit-product-submit">
          {isPending ? "Saving…" : "Save changes"}
        </SubmitButton>
      </form>
    </div>
  )
}

export default EditProduct
