// Minimal ambient types for `multer` (a transitive dependency of the Medusa
// tree — installed, but ships no bundled types and @types/multer is not
// available in this offline environment). Covers only what the upload route
// uses: memory storage + a single `file` part.
declare module "multer" {
  interface MulterFile {
    fieldname: string
    originalname: string
    encoding: string
    mimetype: string
    size: number
    buffer: Buffer
  }

  interface MulterOptions {
    storage?: unknown
    limits?: { fileSize?: number; files?: number }
  }

  interface MulterInstance {
    single(field: string): (
      req: unknown,
      res: unknown,
      next: (err?: unknown) => void
    ) => void
  }

  function multer(options?: MulterOptions): MulterInstance

  namespace multer {
    function memoryStorage(): unknown
  }

  export default multer
}
