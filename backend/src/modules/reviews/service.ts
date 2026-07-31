import { MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"
import ProductRating from "./models/product-rating"

class ReviewsModuleService extends MedusaService({
  Review,
  ProductRating,
}) {}

export default ReviewsModuleService
