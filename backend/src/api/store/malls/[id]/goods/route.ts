import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"

// Products (goods) listed by the sellers participating in a mall. Public —
// only the mall detail itself is resolved through the mall service.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const mall = await mallService.getDetails(id)

  const sellers = mall?.sellers ?? []
  const sellerIds = [
    ...(sellers ?? []).map((s: { seller_id?: string }) => s?.seller_id),
    mall?.created_by_seller_id,
  ]
    .filter((v): v is string => !!v)
    .filter((v, index, all) => all.indexOf(v) === index)
  const participationBySeller = new Map(
    (sellers ?? []).map((seller: any) => [seller.seller_id, seller])
  )

  let goods: any[] = []
  if (sellerIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "seller",
      fields: [
        "id",
        "name",
        "products.id",
        "products.title",
        "products.handle",
        "products.thumbnail",
        "products.status",
        "products.images.url",
        "products.variants.title",
        "products.variants.prices.amount",
        "products.variants.prices.currency_code",
      ],
      filters: { id: sellerIds },
    })
    const byProduct = new Map<string, any>()
    for (const seller of data ?? []) {
      for (const product of seller.products ?? []) {
        if (!product || product.status !== "published") continue
        const participation = participationBySeller.get(seller.id)
        const rawProductIds = (participation as any)?.product_ids
        const selectedIds = Array.isArray(rawProductIds)
          ? rawProductIds
          : Array.isArray(rawProductIds?.ids)
            ? rawProductIds.ids
            : null
        if (selectedIds?.length && !selectedIds.includes(product.id)) continue
        byProduct.set(product.id, {
          ...product,
          seller_id: seller.id,
          seller_name: seller.name ?? null,
        })
      }
    }
    goods = [...byProduct.values()]
  }

  res.json({ goods, sellerCount: sellerIds.length })
}
