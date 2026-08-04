import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

// Curated storefront collections. Products are matched by handle so the seed
// is safe to run on top of existing/marketplace-created products.
const COLLECTION_GROUPS = [
  {
    title: "Apparel",
    handle: "apparel",
    description: "Tops, bottoms and everyday staples from the community.",
    productHandles: [
      "t-shirt",
      "sweatshirt",
      "sweatpants",
      "shorts",
      "variant-tee",
      "qty-tee",
      "edit-test-hoodie",
      "proof-adire-tee",
    ],
  },
  {
    title: "Local & Handmade",
    handle: "local-handmade",
    description: "Ankara, tote bags, caps and handcrafted finds.",
    productHandles: [
      "demo-ankara-tote",
      "proof-adire-tee",
      "proof-cap",
      "second-seller-lamp",
    ],
  },
  {
    title: "Proof & New",
    handle: "proof-new",
    description: "Freshly listed goods across the marketplace.",
    productHandles: [
      "proof-sneakers",
      "proof-gadget",
      "proof-perfume",
      "20-off-template",
      "test-widget",
    ],
  },
] as const;

export default async function seedCollections({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModuleService = container.resolve(Modules.PRODUCT);

  const existing = await productModuleService.listProductCollections({
    handle: COLLECTION_GROUPS.map((g) => g.handle),
  });
  const existingByHandle = new Map(existing.map((c) => [c.handle, c.id]));

  for (const group of COLLECTION_GROUPS) {
    const products = await productModuleService.listProducts({
      handle: [...group.productHandles],
    });
    const productIds = products.map((p) => p.id);

    let collectionId = existingByHandle.get(group.handle);
    if (!collectionId) {
      const [created] = await productModuleService.createProductCollections([
        {
          title: group.title,
          handle: group.handle,
          metadata: group.description ? { description: group.description } : undefined,
        },
      ]);
      collectionId = created.id;
      existingByHandle.set(group.handle, collectionId);
      logger.info(
        `Collection created: ${group.title} (${group.handle}) with ${productIds.length} products`
      );
    } else {
      logger.info(
        `Collection exists: ${group.title} (${group.handle}) with ${productIds.length} products`
      );
    }

    if (productIds.length) {
      await productModuleService.updateProducts(
        { id: productIds },
        { collection_id: collectionId }
      );
    }
  }

  logger.info("Finished seeding collections.");
}
