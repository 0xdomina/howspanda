"use client"

import { useActionState, useMemo, useState } from "react"

import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { createSellerProduct } from "@lib/data/seller"
import ProductMedia from "@modules/seller/components/product-media"

type VariantType = "Size" | "Color" | "Type"

const VARIANT_TYPES: { value: VariantType; label: string }[] = [
  { value: "Size", label: "Size" },
  { value: "Color", label: "Color" },
  { value: "Type", label: "Type" },
]

type VariantValue = {
  id: number
  value: string
  price: string
  stock: string
}

const AddProduct = ({ showVideo }: { showVideo: boolean }) => {
  const [state, formAction] = useActionState(createSellerProduct, {
    success: false,
    error: null,
  } as { success: boolean; error: string | null })

  const [withVariants, setWithVariants] = useState(false)
  const [variantType, setVariantType] = useState<VariantType>("Size")
  const [values, setValues] = useState<VariantValue[]>([])
  const [draftValue, setDraftValue] = useState("")
  const [photo, setPhoto] = useState("")
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // The backend accepts the full admin shape for products that carry
  // options/variants. We serialize it so the server action can forward it
  // verbatim (money stays whole NGN, matching the store's convention).
  const variantsJson = useMemo(() => {
    if (!withVariants || values.length === 0) return ""

    const optionValues = values.map((v) => v.value)
    const variants = values.map((v) => ({
      title: v.value,
      options: { [variantType]: v.value },
      prices: v.price
        ? [{ currency_code: "ngn", amount: Number(v.price) }]
        : [],
      stock: v.stock !== "" ? Number(v.stock) : undefined,
      manage_inventory: true,
    }))

    return JSON.stringify({
      options: [{ title: variantType, values: optionValues }],
      variants,
    })
  }, [withVariants, values, variantType])

  const addValue = () => {
    const value = draftValue.trim()
    if (!value) return
    if (values.some((v) => v.value.toLowerCase() === value.toLowerCase())) return
    setValues((prev) => [
      ...prev,
      { id: Date.now(), value, price: "", stock: "" },
    ])
    setDraftValue("")
  }

  const removeValue = (id: number) => {
    setValues((prev) => prev.filter((v) => v.id !== id))
  }

  const updateValue = (id: number, field: "price" | "stock", next: string) => {
    setValues((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: next } : v))
    )
  }

  return (
    <div className="max-w-lg w-full" data-testid="add-product-page">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-6">
        Add a product
      </h2>

      {state && (state as any).success ? (
        <div
          className="py-8 text-center border border-ink-hairline rounded-large bg-paper-surface"
          data-testid="product-created"
        >
          <p className="text-ink font-medium">Product added</p>
          <p className="text-sm text-ink-muted mt-1">
            Your product is now listed in your store.
          </p>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-y-4">
          <Input
            label="Title"
            name="title"
            required
            autoComplete="off"
            data-testid="product-title-input"
          />

          {!withVariants && (
            <div className="grid grid-cols-2 gap-x-4">
              <Input
                label="Price (NGN)"
                name="price"
                type="number"
                min="0"
                step="any"
                required
                data-testid="product-price-input"
              />
              <Input
                label="Quantity"
                name="stock"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                data-testid="product-quantity-input"
              />
            </div>
          )}

          <ProductMedia
            photo={photo}
            onPhotoChange={setPhoto}
            videoUrl={videoUrl}
            onVideoChange={setVideoUrl}
            showVideo={showVideo}
            hiddenPhotoName="photo"
            hiddenVideoName="video_url"
          />

          {!withVariants ? (
            <button
              type="button"
              onClick={() => setWithVariants(true)}
              className="text-sm text-ink-muted underline underline-offset-4 self-start"
              data-testid="variant-toggle"
            >
              Has sizes, colors, or types?
            </button>
          ) : (
            <div
              className="border border-ink-hairline rounded-large p-4 flex flex-col gap-y-4 bg-paper-surface"
              data-testid="variant-builder"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Variants</p>
                <button
                  type="button"
                  onClick={() => {
                    setWithVariants(false)
                    setValues([])
                    setDraftValue("")
                  }}
                  className="text-sm text-ink-muted underline underline-offset-4"
                  data-testid="variant-toggle-off"
                >
                  Remove variants
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-ink">
                  They differ by
                </label>
                <div className="mt-2 flex gap-2">
                  {VARIANT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setVariantType(t.value)}
                      className={
                        variantType === t.value
                          ? "px-3 py-1.5 text-sm rounded-control bg-ink text-paper font-medium"
                          : "px-3 py-1.5 text-sm rounded-control border border-ink-hairline text-ink-muted"
                      }
                      data-testid={`variant-type-${t.value}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-ink">
                  Values
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addValue()
                      }
                    }}
                    placeholder={variantType === "Color" ? "e.g. Black" : "e.g. M"}
                    className="flex-1 px-3 py-2 text-sm border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
                    data-testid="variant-value-input"
                  />
                  <button
                    type="button"
                    onClick={addValue}
                    className="px-3 py-2 text-sm rounded-control border border-ink-hairline text-ink"
                    data-testid="variant-value-add"
                  >
                    Add
                  </button>
                </div>

                {values.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" data-testid="variant-values">
                    {values.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center gap-2 pl-3 pr-2 py-1 border border-ink-hairline rounded-full text-sm text-ink"
                        data-testid={`variant-chip-${v.value}`}
                      >
                        {v.value}
                        <button
                          type="button"
                          onClick={() => removeValue(v.id)}
                          className="text-ink-muted hover:text-ink"
                          aria-label={`Remove ${v.value}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {values.length > 0 && (
                <div className="flex flex-col gap-y-3" data-testid="variant-rows">
                  {values.map((v) => (
                    <div
                      key={v.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-2"
                      data-testid={`variant-row-${v.value}`}
                    >
                      <span className="text-sm text-ink font-medium">{v.value}</span>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Price (NGN)"
                          value={v.price}
                          onChange={(e) => updateValue(v.id, "price", e.target.value)}
                          className="w-28 px-3 py-2 text-sm font-mono tabular-nums border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
                          data-testid={`variant-price-${v.value}`}
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          placeholder="Qty"
                          value={v.stock}
                          onChange={(e) => updateValue(v.id, "stock", e.target.value)}
                          className="w-16 px-3 py-2 text-sm tabular-nums border border-ink-hairline rounded-control bg-paper focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
                          data-testid={`variant-stock-${v.value}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <input type="hidden" name="variants_json" value={variantsJson} />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-ink">Description</label>
            <textarea
              name="description"
              rows={4}
              className="mt-1 block w-full px-4 py-2 border border-ink-hairline rounded bg-ui-bg-field focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active"
              data-testid="product-description-input"
            />
          </div>

          <ErrorMessage
            error={(state as any)?.error}
            data-testid="add-product-error"
          />
          <SubmitButton className="mt-2" data-testid="add-product-submit">
            Add product
          </SubmitButton>
        </form>
      )}
    </div>
  )
}

export default AddProduct
