const http = require("node:http")
const path = require("node:path")
const { spawn } = require("node:child_process")

const publicPort = Number(process.env.PORT || 9000)
const internalPort = Number(process.env.MEDUSA_INTERNAL_PORT || 9001)
const medusaCli = path.join(
  __dirname,
  "node_modules",
  "@medusajs",
  "cli",
  "cli.js"
)

let ready = false
let failed = false
let medusaProcess = null

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  })
  res.end(payload)
}

const proxy = http.createServer((req, res) => {
  if (req.url === "/health") {
    return sendJson(res, failed ? 503 : 200, {
      ok: !failed,
      ready,
      service: "hows-u-api",
    })
  }

  if (failed || !ready) {
    res.setHeader("retry-after", "5")
    return sendJson(res, 503, {
      ok: false,
      ready: false,
      message: "The service is warming up. Please retry shortly.",
    })
  }

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: internalPort,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${internalPort}`,
      },
    },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
      upstreamResponse.pipe(res)
    }
  )

  upstream.on("error", () => {
    if (!res.headersSent) {
      sendJson(res, 503, { ok: false, ready: false, message: "Service unavailable" })
    } else {
      res.destroy()
    }
  })

  req.pipe(upstream)
})

proxy.listen(publicPort, "0.0.0.0", () => {
  const child = spawn(
    process.execPath,
    [medusaCli, "start", "--host", "127.0.0.1", "--port", String(internalPort)],
    {
      cwd: __dirname,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(internalPort),
      },
      stdio: "inherit",
    }
  )
  medusaProcess = child

  child.on("error", () => {
    failed = true
  })

  child.on("exit", (code, signal) => {
    failed = true
    if (!ready) {
      process.exitCode = code || 1
    }
    if (signal) {
      process.kill(process.pid, signal)
    }
  })

  const checkReady = () => {
    if (failed) return
    const request = http.get(
      { host: "127.0.0.1", port: internalPort, path: "/health", timeout: 1000 },
      (response) => {
        response.resume()
        if (response.statusCode === 200) {
          ready = true
        } else {
          setTimeout(checkReady, 1000).unref()
        }
      }
    )
    request.on("error", () => setTimeout(checkReady, 1000).unref())
    request.on("timeout", () => request.destroy())
  }

  checkReady()
})

function shutdown(signal) {
  if (medusaProcess && !medusaProcess.killed) {
    medusaProcess.kill(signal)
  }
  proxy.close(() => process.exit(0))
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
