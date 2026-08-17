/**
 * The current AI SDK is ESM-only. Medusa's application runtime is CommonJS,
 * so all SDK entry points stay behind this dynamic-import boundary. This
 * keeps the backend bootable while allowing provider packages to receive
 * security updates independently of the commerce runtime.
 */
export async function generateText(options: Record<string, unknown>) {
  const mock = await runMock(options)
  if (mock) return mock
  const sdk = await import("ai")
  return sdk.generateText(options as never) as any
}

export async function generateObject(options: Record<string, unknown>) {
  const mock = await runMock(options)
  if (mock) {
    const object = JSON.parse(mock.text)
    const schema = options.schema as { parse?: (value: unknown) => unknown } | undefined
    return {
      object: schema?.parse ? schema.parse(object) : object,
      usage: mock.usage,
    }
  }
  const sdk = await import("ai")
  return sdk.generateObject(options as never) as any
}

async function runMock(options: Record<string, unknown>) {
  if (process.env.AI_PROVIDER !== "mock" && process.env.AI_PROVIDER !== "mock-fail") {
    return null
  }
  const model = options.model as { doGenerate?: (input: unknown) => Promise<any> }
  if (!model?.doGenerate) return null
  const prompt = [
    ...(typeof options.system === "string"
      ? [{ role: "system", content: options.system }]
      : []),
    ...((options.messages as unknown[]) || []),
  ]
  const result = await model.doGenerate({ prompt })
  const text = result.content?.find((part: any) => part.type === "text")?.text ?? ""
  return {
    text,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  }
}
