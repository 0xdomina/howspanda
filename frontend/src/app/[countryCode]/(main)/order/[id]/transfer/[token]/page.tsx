import { Heading, Text } from "@medusajs/ui"
import TransferActions from "@modules/order/components/transfer-actions"
import TransferImage from "@modules/order/components/transfer-image"
import ShareButton from "@modules/common/components/share-button"
import { getBaseURL } from "@lib/util/env"

export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string; token: string; countryCode: string }>
}) {
  const { id, token, countryCode } = await params

  return (
    <div className="figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface flex w-full max-w-2xl flex-col gap-y-6 p-6 small:p-10">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        <div className="flex items-start justify-between gap-4">
          <Heading level="h1" className="text-xl text-zinc-900">
            Transfer request for order {id}
          </Heading>
          <ShareButton
            entity="order-transfer"
            entityId={id}
            payload={{
              url: `${getBaseURL()}/${countryCode}/order/${id}/transfer/${token}`,
              text: `Transfer request for order ${id} on How's u`,
              title: "Order transfer",
            }}
          />
        </div>
        <Text className="text-zinc-600">
          You&#39;ve received a request to transfer ownership of your order ({id}).
          If you agree to this request, you can approve the transfer by clicking
          the button below.
        </Text>
        <div className="w-full h-px bg-zinc-200" />
        <Text className="text-zinc-600">
          If you accept, the new owner will take over all responsibilities and
          permissions associated with this order.
        </Text>
        <Text className="text-zinc-600">
          If you do not recognize this request or wish to retain ownership, no
          further action is required.
        </Text>
        <div className="w-full h-px bg-zinc-200" />
        <TransferActions id={id} token={token} />
      </div>
      </div>
    </div>
  )
}
