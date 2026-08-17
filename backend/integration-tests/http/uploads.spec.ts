import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(240 * 1000)

process.env.KYC_VERIFICATION_ENABLED = "true"
process.env.KYC_VERIFICATION_CHANNEL = "mock"

// A tiny 1x1 PNG. The server validates dimensions as well as magic bytes, so
// the fixture stays structurally readable instead of relying on a header-only
// shortcut.
const tinyPng = () =>
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  )

// A minimal playable MP4 metadata tree: ftyp + moov/mvhd/trak/tkhd. The
// upload validator uses the declared dimensions and duration to reject
// malformed or oversized clips before they reach storage.
const tinyMp4 = () => {
  const box = (type: string, payload: Buffer) => {
    const result = Buffer.alloc(8 + payload.length)
    result.writeUInt32BE(result.length, 0)
    result.write(type, 4, "latin1")
    payload.copy(result, 8)
    return result
  }
  const ftyp = Buffer.alloc(16)
  ftyp.write("isom", 0, "latin1")
  ftyp.write("isomiso2", 8, "latin1")
  const mvhd = Buffer.alloc(100)
  mvhd.writeUInt32BE(1000, 12)
  mvhd.writeUInt32BE(10000, 16)
  const tkhd = Buffer.alloc(84)
  tkhd.writeUInt32BE(640 * 65536, 76)
  tkhd.writeUInt32BE(360 * 65536, 80)
  return Buffer.concat([
    box("ftyp", ftyp),
    box("moov", Buffer.concat([box("mvhd", mvhd), box("trak", box("tkhd", tkhd))])),
  ])
}

const svg = () =>
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  )

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let token: string
    let auth: () => { headers: Record<string, string> }
    let storeHeaders: { headers: Record<string, string> }

    describe("seller media uploads", () => {
      beforeAll(async () => {
        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "upload-spec", type: "publishable", created_by: "upload-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "upload-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(
          getContainer,
          "upload-seller@howsu.local",
          "+2348012300016"
        )
        await api.post(
          "/sellers",
          {
            name: "Upload Seller",
            handle: "upload-seller",
            admin: {
              email: "upload-seller@howsu.local",
              first_name: "Up",
              last_name: "Loader",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        const login = await api.post("/auth/seller/emailpass", {
          email: "upload-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token
        auth = () => ({ headers: { Authorization: `Bearer ${token}` } })
      })

      const upload = (buf: Buffer, kind: string, filename: string) => {
        const form = new FormData()
        form.append("file", new Blob([new Uint8Array(buf)], { type: "application/octet-stream" }), filename)
        form.append("kind", kind)
        return api.post("/sellers/uploads", form, auth())
      }

      it("uploads a PNG and serves it with nosniff", async () => {
        const res = await upload(tinyPng(), "image", "photo.png")
        expect(res.status).toEqual(200)
        expect(res.data.url).toMatch(/^\/uploads\/image\/.+\.png$/)
        expect(res.data.kind).toEqual("image")
        expect(res.data.mime).toEqual("image/png")

        const served = await api.get(res.data.url, { responseType: "arraybuffer" })
        expect(served.status).toEqual(200)
        expect(served.headers["content-type"]).toMatch(/^image\/png/)
        expect(served.headers["x-content-type-options"]).toEqual("nosniff")
        expect(Buffer.from(served.data)).toEqual(tinyPng())
      })

      it("uploads an MP4 video", async () => {
        const res = await upload(tinyMp4(), "video", "clip.mp4")
        expect(res.status).toEqual(200)
        expect(res.data.url).toMatch(/^\/uploads\/video\/.+\.mp4$/)
        expect(res.data.kind).toEqual("video")
        expect(res.data.mime).toEqual("video/mp4")

        const served = await api.get(res.data.url, { responseType: "arraybuffer" })
        expect(served.headers["content-type"]).toMatch(/^video\/mp4/)
        expect(served.headers["x-content-type-options"]).toEqual("nosniff")
      })

      it("rejects an SVG (scriptable content)", async () => {
        await expect(upload(svg(), "image", "pic.svg")).rejects.toMatchObject({
          response: { status: 400 },
        })
      })

      it("rejects a file whose bytes disagree with the declared kind", async () => {
        await expect(upload(tinyPng(), "video", "photo.mp4")).rejects.toMatchObject(
          { response: { status: 400 } }
        )
      })

      it("rejects an upload with no file part", async () => {
        const form = new FormData()
        form.append("kind", "image")
        await expect(
          api.post("/sellers/uploads", form, auth())
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("rejects an image over the size cap", async () => {
        const big = Buffer.concat([tinyPng(), Buffer.alloc(11 * 1024 * 1024)])
        await expect(upload(big, "image", "big.png")).rejects.toMatchObject({
          response: { status: 400 },
        })
      })

      it("rejects unauthenticated uploads", async () => {
        const form = new FormData()
        form.append("file", new Blob([new Uint8Array(tinyPng())], { type: "image/png" }), "photo.png")
        form.append("kind", "image")
        await expect(api.post("/sellers/uploads", form)).rejects.toMatchObject({
          response: { status: 401 },
        })
      })
    })

    describe("product video_url (feature-flagged)", () => {
      it("stores video_url in product metadata on create", async () => {
        const created = await api.post(
          "/sellers/products",
          {
            title: "Video product",
            price: 5000,
            video_url: "/uploads/video/clip.mp4",
          },
          auth()
        )
        expect(created.status).toEqual(200)

        const list = await api.get("/sellers/products", auth())
        const product = (list.data.products as any[]).find(
          (p: any) => p.id === created.data.product.id
        )
        expect(product?.metadata?.product_video).toEqual(
          "/uploads/video/clip.mp4"
        )
      })

      it("clears video_url via patch", async () => {
        const created = await api.post(
          "/sellers/products",
          {
            title: "Video product two",
            price: 4000,
            video_url: "/uploads/video/first.mp4",
          },
          auth()
        )

        const patch = await api.patch(
          `/sellers/products/${created.data.product.id}`,
          { video_url: null },
          auth()
        )
        expect(patch.status).toEqual(200)
        expect(patch.data.product.metadata?.product_video).toBeNull()

        const list = await api.get("/sellers/products", auth())
        const product = (list.data.products as any[]).find(
          (p: any) => p.id === created.data.product.id
        )
        expect(product?.metadata?.product_video ?? null).toBeNull()
      })

      it("reports product_video off by default", async () => {
        const features = await api.get("/store/features", storeHeaders)
        expect(features.data.features.product_video).toEqual(false)
      })
    })
  },
})
