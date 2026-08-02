"use client"

import { useActionState } from "react"

import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { createSellerProduct } from "@lib/data/seller"

const AddProduct = () => {
  const [state, formAction] = useActionState(createSellerProduct, {
    success: false,
    error: null,
  } as { success: boolean; error: string | null })

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
            label="Photo URL"
            name="photo"
            type="url"
            autoComplete="off"
            data-testid="product-photo-input"
          />
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