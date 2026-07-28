import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { AdminCreateProduct } from "@medusajs/medusa/api/admin/products/validators"
import { PostSellerCreateSchema } from "./sellers/route"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/sellers",
      method: ["POST"],
      middlewares: [
        authenticate("seller", ["session", "bearer"], {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostSellerCreateSchema),
      ],
    },
    {
      matcher: "/sellers/*",
      middlewares: [
        authenticate("seller", ["session", "bearer"]),
      ],
    },
    {
      matcher: "/sellers/products",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateProduct),
      ],
    },
  ],
})
