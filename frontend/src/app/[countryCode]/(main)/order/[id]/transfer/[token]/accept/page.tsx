import { acceptTransferRequest } from "@lib/data/orders"
import { Heading, Text } from "@medusajs/ui"
import TransferImage from "@modules/order/components/transfer-image"

export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>
}) {
  const { id, token } = await params

  const { success, error } = await acceptTransferRequest(id, token)

  return (
    <div className="figma-container flex min-h-[calc(100vh-180px)] items-center justify-center py-12 small:py-20">
      <div className="figma-surface flex w-full max-w-2xl flex-col gap-y-6 p-6 small:p-10">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        {success && (
          <>
            <Heading level="h1" className="text-xl text-zinc-900">
              Order transfered!
            </Heading>
            <Text className="text-zinc-600">
              Order {id} has been successfully transfered to the new owner.
            </Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-zinc-600">
              There was an error accepting the transfer. Please try again.
            </Text>
            {error && (
              <Text className="text-red-500">Error message: {error}</Text>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}
