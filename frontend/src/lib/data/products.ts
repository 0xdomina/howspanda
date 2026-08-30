"use server"

import { sdk } from "@lib/config"
import { sortProducts } from "@lib/util/sort-products"
import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { getRegion, retrieveRegion } from "./regions"

export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductListParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductListParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = _pageParam === 1 ? 0 : (_pageParam - 1) * limit

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
    // ISR-style: serve cached for 60s, then refresh in the background. Unlike
    // force-cache, this guarantees stale entries actually expire — seller
    // uploads and edits reach the homepage within a minute.
    revalidate: 60,
  }

  // PandaStack's free runtime sleeps on idle and answers 503 while warming.
  // Retry once without allowing a cold start to consume the whole page
  // function budget. The page can render its friendly empty state and the
  // next navigation will use the warmed service.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await sdk.client
        .fetch<{ products: HttpTypes.StoreProduct[]; count: number }>(
          `/store/products`,
          {
            method: "GET",
            query: {
              limit,
              offset,
              region_id: region?.id,
              fields:
                "*variants.calculated_price,+variants.inventory_quantity,*variants.images,+metadata,+tags,",
              ...queryParams,
            },
            headers,
            next,
          }
        )
        .then(({ products, count }) => {
          const nextPage = count > offset + limit ? pageParam + 1 : null

          return {
            response: {
              products,
              count,
            },
            nextPage,
            queryParams,
          }
        })
    } catch (error: any) {
      const raw = String(error?.message ?? error ?? "")
      const warming =
        [502, 503, 504].includes(Number(error?.status)) ||
        /warming|ready["']?\s*:\s*false|booting/i.test(raw)
      if (!warming || attempt === 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
  }
  // Unreachable: the loop either returns or throws.
  return {
    response: { products: [], count: 0 },
    nextPage: null,
  }
}

/**
 * This will fetch 100 products to the Next.js cache and sort them based on the sortBy parameter.
 * It will then return the paginated products based on the page and limit parameters.
 */
export const listProductsWithSort = async ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  countryCode,
}: {
  page?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy?: SortOptions
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  const limit = queryParams?.limit || 12

  const {
    response: { products, count },
  } = await listProducts({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      limit: 100,
    },
    countryCode,
  })

  const sortedProducts = sortProducts(products, sortBy)

  const pageParam = (page - 1) * limit

  const nextPage = count > pageParam + limit ? pageParam + limit : null

  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count,
    },
    nextPage,
    queryParams,
  }
}
