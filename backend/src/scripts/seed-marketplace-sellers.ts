import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import createSellerWorkflow from "../workflows/marketplace/create-seller"
import createSellerProductWorkflow from "../workflows/marketplace/create-seller-product"
import KycModuleService from "../modules/kyc/service"
import { KYC_MODULE } from "../modules/kyc"

const PASSWORD = process.env.SEED_MARKETPLACE_PASSWORD ?? "HowsU2026!"
const COUNTRY = "Nigeria"
const STATE = "Lagos"
const CITY = "Ikeja"

type SeedProduct = {
  title: string
  handle: string
  description: string
  price: number
  stock: number
  category?: string
  image: string
  imageAlt: string
  options?: { title: string; values: string[] }
  variants?: { title: string; optionValue: string; price: number; stock: number }[]
}

type SeedSeller = {
  email: string
  firstName: string
  lastName: string
  phone: string
  store: string
  handle: string
  tagline: string
  products: SeedProduct[]
}

const image = (id: string, width = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`

const SELLERS: SeedSeller[] = [
  {
    email: "zainab.adeleke@howsu.test",
    firstName: "Zainab",
    lastName: "Adeleke",
    phone: "+2348031002101",
    store: "Afterhours Studio",
    handle: "afterhours-studio",
    tagline: "Everyday streetwear with Lagos energy.",
    products: [
      {
        title: "Afterhours Boxy Tee",
        handle: "afterhours-boxy-tee",
        description: "A heavyweight cotton tee with a relaxed boxy cut, dropped shoulders, and a clean embroidered chest mark. Made for late nights and slow weekends.",
        price: 18500,
        stock: 42,
        category: "Shirts",
        image: image("photo-1521572163474-6864f9cf17ab"),
        imageAlt: "Folded heavyweight white cotton t-shirt",
        options: { title: "Size", values: ["S", "M", "L", "XL"] },
        variants: ["S", "M", "L", "XL"].map((size) => ({ title: size, optionValue: size, price: 18500, stock: 10 })),
      },
      {
        title: "Night Shift Hoodie",
        handle: "night-shift-hoodie",
        description: "Soft brushed fleece hoodie in washed charcoal. The oversized fit, double-layer hood, and front pocket make it an easy layer for cool evenings.",
        price: 39500,
        stock: 26,
        category: "Sweatshirts",
        image: image("photo-1551488831-00ddcb6c6bd3"),
        imageAlt: "Neutral-toned folded sweatshirt",
        options: { title: "Size", values: ["S", "M", "L", "XL"] },
        variants: ["S", "M", "L", "XL"].map((size) => ({ title: size, optionValue: size, price: 39500, stock: 6 })),
      },
      {
        title: "Run Club Trainers",
        handle: "run-club-trainers",
        description: "Lightweight everyday trainers with a cushioned sole and breathable mesh upper. Comfortable enough for a city day, sharp enough for the link-up.",
        price: 62000,
        stock: 18,
        category: "Merch",
        image: image("photo-1542291026-7eec264c27ff"),
        imageAlt: "Red and white lifestyle sneakers",
        options: { title: "Size", values: ["40", "41", "42", "43", "44"] },
        variants: ["40", "41", "42", "43", "44"].map((size) => ({ title: size, optionValue: size, price: 62000, stock: 4 })),
      },
      {
        title: "Cloudline Crossbody",
        handle: "cloudline-crossbody",
        description: "A compact crossbody with two zipped compartments, an adjustable webbing strap, and room for your phone, keys, and daily essentials.",
        price: 24000,
        stock: 34,
        category: "Merch",
        image: image("photo-1548036328-c9fa89d128fa"),
        imageAlt: "Minimal black everyday bag",
      },
      {
        title: "Sunset Frame Sunglasses",
        handle: "sunset-frame-sunglasses",
        description: "Slim acetate sunglasses with warm amber lenses and UV400 protection. A small finishing touch that changes the whole fit.",
        price: 16500,
        stock: 31,
        category: "Merch",
        image: image("photo-1511499767150-a48a237f0083"),
        imageAlt: "Black sunglasses on a neutral surface",
      },
    ],
  },
  {
    email: "emeka.okoro@howsu.test",
    firstName: "Emeka",
    lastName: "Okoro",
    phone: "+2348031002102",
    store: "Plugged In Lagos",
    handle: "plugged-in-lagos",
    tagline: "Useful tech, tested for real life.",
    products: [
      {
        title: "Pocket ANC Headphones",
        handle: "pocket-anc-headphones",
        description: "Foldable wireless headphones with active noise cancellation, a 32-hour battery, and a warm balanced sound for commutes, study sessions, and flights.",
        price: 89000,
        stock: 16,
        category: "Electronics",
        image: image("photo-1505740420928-5e560c06d30e"),
        imageAlt: "Wireless headphones on a dark surface",
        options: { title: "Color", values: ["Black", "Cream"] },
        variants: ["Black", "Cream"].map((color) => ({ title: color, optionValue: color, price: 89000, stock: 8 })),
      },
      {
        title: "Desk Beam Mini Speaker",
        handle: "desk-beam-mini-speaker",
        description: "A compact Bluetooth speaker with punchy room-filling sound, USB-C charging, and a soft-touch body that looks good on a desk or bedside table.",
        price: 47500,
        stock: 22,
        category: "Electronics",
        image: image("photo-1608043152269-423dbba4e7e1"),
        imageAlt: "Compact modern speaker",
      },
      {
        title: "Creator Clip Light",
        handle: "creator-clip-light",
        description: "Dimmable LED clip light for video calls, makeup, and content days. Three color temperatures and a flexible arm make setup quick.",
        price: 29000,
        stock: 28,
        category: "Electronics",
        image: image("photo-1587829741301-dc798b83add3"),
        imageAlt: "Small LED desk light",
      },
      {
        title: "Studio 75 Mechanical Keyboard",
        handle: "studio-75-mechanical-keyboard",
        description: "A compact mechanical keyboard with hot-swappable switches, soft white backlight, and a satisfying low-profile typing feel.",
        price: 68000,
        stock: 14,
        category: "Electronics",
        image: image("photo-1587829741301-dc798b83add3"),
        imageAlt: "Mechanical keyboard on a desk",
        options: { title: "Switch", values: ["Linear", "Tactile"] },
        variants: ["Linear", "Tactile"].map((switchType) => ({ title: switchType, optionValue: switchType, price: 68000, stock: 7 })),
      },
      {
        title: "Power Up 20K Battery Pack",
        handle: "power-up-20k-battery-pack",
        description: "20,000mAh power bank with dual USB output, USB-C input, and a slim textured shell that is easy to carry between classes, work, and travel.",
        price: 36000,
        stock: 37,
        category: "Electronics",
        image: image("photo-1608043152269-423dbba4e7e1"),
        imageAlt: "Portable power bank",
      },
    ],
  },
  {
    email: "bisola.adebayo@howsu.test",
    firstName: "Bisola",
    lastName: "Adebayo",
    phone: "+2348031002103",
    store: "Soft Life Supply",
    handle: "soft-life-supply",
    tagline: "Small upgrades for your everyday space.",
    products: [
      {
        title: "Maji Glass Table Lamp",
        handle: "maji-glass-table-lamp",
        description: "A warm ambient lamp with a rounded glass base and linen shade. Designed for bedside tables, reading corners, and slow evenings.",
        price: 54000,
        stock: 12,
        category: "Home & Lifestyle",
        image: image("photo-1507473885765-e6ed057f782c"),
        imageAlt: "Warm table lamp in a calm interior",
      },
      {
        title: "Sunday Cotton Throw",
        handle: "sunday-cotton-throw",
        description: "A breathable woven cotton throw with a soft striped pattern. Light enough for warm nights and cosy enough for air-conditioned rooms.",
        price: 32000,
        stock: 20,
        category: "Home & Lifestyle",
        image: image("photo-1584100936595-c0654b55a2e2"),
        imageAlt: "Textured neutral throw blanket",
        options: { title: "Color", values: ["Oat", "Sage", "Clay"] },
        variants: ["Oat", "Sage", "Clay"].map((color) => ({ title: color, optionValue: color, price: 32000, stock: 7 })),
      },
      {
        title: "Little Jungle Plant Pot",
        handle: "little-jungle-plant-pot",
        description: "A hand-finished ceramic planter with a drainage tray. A low-effort way to bring a little green into a shelf, desk, or balcony.",
        price: 18500,
        stock: 25,
        category: "Home & Lifestyle",
        image: image("photo-1485955900006-10f4d324d411"),
        imageAlt: "Green houseplant in a ceramic pot",
      },
      {
        title: "Cloud Nine Accent Chair",
        handle: "cloud-nine-accent-chair",
        description: "A compact boucle accent chair with a curved back and supportive seat. A soft statement piece for bedrooms, studios, and reading corners.",
        price: 185000,
        stock: 6,
        category: "Home & Lifestyle",
        image: image("photo-1503602642458-232111445657"),
        imageAlt: "Modern accent chair in a bright room",
        options: { title: "Color", values: ["Cream", "Moss"] },
        variants: ["Cream", "Moss"].map((color) => ({ title: color, optionValue: color, price: 185000, stock: 3 })),
      },
      {
        title: "Sunday Reset Scented Candle",
        handle: "sunday-reset-scented-candle",
        description: "A soy wax candle scented with bergamot, cedar, and soft musk. Burn time is approximately 35 hours.",
        price: 22000,
        stock: 30,
        category: "Home & Lifestyle",
        image: image("photo-1603006905003-be475563bc59"),
        imageAlt: "Minimal scented candle",
      },
    ],
  },
  {
    email: "tolulope.dada@howsu.test",
    firstName: "Tolulope",
    lastName: "Dada",
    phone: "+2348031002104",
    store: "Dew Club Beauty",
    handle: "dew-club-beauty",
    tagline: "Easy beauty for hot days and soft glam.",
    products: [
      {
        title: "Dew Club Daily SPF 50",
        handle: "dew-club-daily-spf-50",
        description: "Lightweight daily sunscreen with SPF 50 protection and a sheer finish that sits well under makeup. No heavy white cast.",
        price: 28500,
        stock: 45,
        category: "Health & Beauty",
        image: image("photo-1556228720-195a672e8a03"),
        imageAlt: "Skincare bottles and cream",
      },
      {
        title: "Nude Hour Lip Oil",
        handle: "nude-hour-lip-oil",
        description: "A glossy conditioning lip oil with a sheer wash of color and a comfortable non-sticky finish for everyday shine.",
        price: 17500,
        stock: 52,
        category: "Health & Beauty",
        image: image("photo-1586495777744-4413f21062fa"),
        imageAlt: "Makeup products in warm tones",
        options: { title: "Shade", values: ["Clear", "Rose", "Cocoa"] },
        variants: ["Clear", "Rose", "Cocoa"].map((shade) => ({ title: shade, optionValue: shade, price: 17500, stock: 17 })),
      },
      {
        title: "After Shower Body Mist",
        handle: "after-shower-body-mist",
        description: "A fresh body mist with notes of pear, white tea, and clean musk. Layer it after a shower or refresh throughout the day.",
        price: 26000,
        stock: 33,
        category: "Health & Beauty",
        image: image("photo-1541643600914-78b084683601"),
        imageAlt: "Minimal perfume bottle",
      },
      {
        title: "Silk Press Heat Shield",
        handle: "silk-press-heat-shield",
        description: "A lightweight heat protectant spray for blowouts, silk presses, and curls. Helps reduce frizz without leaving hair stiff or greasy.",
        price: 23500,
        stock: 29,
        category: "Health & Beauty",
        image: image("photo-1522337360788-8b13dee7a37e"),
        imageAlt: "Haircare products and styling tools",
      },
      {
        title: "Glow Reset Cleansing Balm",
        handle: "glow-reset-cleansing-balm",
        description: "A buttery cleansing balm that melts makeup and sunscreen, then rinses clean without the tight after-feel. Gentle enough for nightly use.",
        price: 31000,
        stock: 24,
        category: "Health & Beauty",
        image: image("photo-1556228720-195a672e8a03"),
        imageAlt: "Clean skincare jar and botanical ingredients",
      },
    ],
  },
]

async function ensureCustomer(
  container: any,
  account: SeedSeller,
  authIdentityId: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { email: [account.email] },
  })
  if (data[0]) return data[0]

  const { result } = await createCustomerAccountWorkflow(container).run({
    input: {
      authIdentityId,
      customerData: {
        email: account.email,
        first_name: account.firstName,
        last_name: account.lastName,
      },
    },
  })
  return result
}

async function ensureKyc(container: any, account: SeedSeller, customerId: string) {
  const kyc: KycModuleService = container.resolve(KYC_MODULE)
  const profile = await kyc.getOrCreateProfile({
    email: account.email,
    phone: account.phone,
    userType: "customer",
    userId: customerId,
  })
  await kyc.updateKycProfiles({
    id: profile.id,
    email_verified_at: new Date(),
    first_name: account.firstName,
    last_name: account.lastName,
    phone: account.phone,
    address: "18 Creative Lane, Ikeja",
    country: COUNTRY,
    state: STATE,
    city: CITY,
  })
}

async function ensureAuthIdentity(container: any, account: SeedSeller) {
  const auth = container.resolve(Modules.AUTH)
  const identities = await auth.listAuthIdentities(
    {},
    { relations: ["provider_identities"] }
  )
  const existing = identities.find((identity: any) =>
    identity.provider_identities?.some(
      (providerIdentity: any) =>
        providerIdentity.entity_id === account.email &&
        providerIdentity.provider === "emailpass"
    )
  )
  if (existing) return existing.id

  const registration = await auth.register("emailpass", {
    body: { email: account.email, password: PASSWORD },
  })
  if (!registration.success || !registration.authIdentity?.id) {
    throw new Error(`Could not register ${account.email}: ${registration.error ?? "unknown error"}`)
  }
  return registration.authIdentity.id
}

async function ensureSeller(container: any, account: SeedSeller) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existingAdmins } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "email", "seller.id", "seller.name"],
    filters: { email: [account.email] },
  })
  if (existingAdmins[0]?.seller?.id) {
    return { sellerAdminId: existingAdmins[0].id, sellerId: existingAdmins[0].seller.id, created: false }
  }

  const authIdentityId = await ensureAuthIdentity(container, account)
  const customer = await ensureCustomer(container, account, authIdentityId)
  await ensureKyc(container, account, customer.id)
  const { result } = await createSellerWorkflow(container).run({
    input: {
      name: account.store,
      handle: account.handle,
      description: account.tagline,
      admin: {
        email: account.email,
        first_name: account.firstName,
        last_name: account.lastName,
      },
      authIdentityId,
      preserveCustomerAuth: true,
    },
  })
  return {
    sellerAdminId: result.seller.admins?.[0]?.id ?? null,
    sellerId: result.seller.id,
    created: true,
  }
}

async function seedProducts(container: any, account: SeedSeller, sellerAdminId: string, sellerId: string) {
  const productModule = container.resolve(Modules.PRODUCT)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "products.id", "products.handle"],
    filters: { id: [sellerId] },
  })
  const ownedHandles = new Set(
    (sellers[0]?.products ?? []).map((product: any) => product.handle)
  )
  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const categoryIds = new Map(categories.map((category: any) => [category.name, category.id]))
  let created = 0

  for (const item of account.products) {
    if (ownedHandles.has(item.handle)) continue
    const existing = await productModule.listProducts({ handle: [item.handle] })
    if (existing.length) {
      const current = existing[0] as any
      if (current.metadata?.seed_group === "marketplace-showcase") {
        await productModule.updateProducts({
          id: current.id,
          thumbnail: item.image,
          images: [{ url: item.image }],
        })
      }
      continue
    }

    const variants = item.variants?.length
      ? item.variants.map((variant) => ({
          title: variant.title,
          options: { [item.options!.title]: variant.optionValue },
          prices: [{ currency_code: "ngn", amount: variant.price }],
          manage_inventory: true,
        }))
      : [{
          title: "One Size",
          options: { "One Size": "One Size" },
          prices: [{ currency_code: "ngn", amount: item.price }],
          manage_inventory: true,
        }]
    const stocks = item.variants?.length
      ? item.variants.map((variant) => variant.stock)
      : [item.stock]

    await createSellerProductWorkflow(container).run({
      input: {
        seller_admin_id: sellerAdminId,
        product: {
          title: item.title,
          handle: item.handle,
          description: item.description,
          status: ProductStatus.PUBLISHED,
          thumbnail: item.image,
          images: [{ url: item.image }],
          options: item.options
            ? [{ title: item.options.title, values: item.options.values }]
            : [{ title: "One Size", values: ["One Size"] }],
          variants,
          category_ids: item.category && categoryIds.has(item.category)
            ? [categoryIds.get(item.category)]
            : undefined,
          metadata: {
            brand: account.store,
            tagline: account.tagline,
            image_alt: item.imageAlt,
            seed_group: "marketplace-showcase",
          },
        } as any,
        stocks,
      },
    })
    created += 1
  }

  return created
}

export default async function seedMarketplaceSellers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const summary: string[] = []

  for (const account of SELLERS) {
    const seller = await ensureSeller(container, account)
    if (!seller.sellerAdminId) {
      throw new Error(`Seller admin missing for ${account.email}`)
    }
    const createdProducts = await seedProducts(container, account, seller.sellerAdminId, seller.sellerId)
    summary.push(`${account.store}: ${account.email} — ${createdProducts} new products`)
  }

  logger.info("")
  logger.info("How's U showcase sellers ready:")
  for (const line of summary) logger.info(`  • ${line}`)
  logger.info(`Shared password: ${PASSWORD}`)
  logger.info("")
}
