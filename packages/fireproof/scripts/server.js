/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises */
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'

import { HeaderStore } from '../dist/test/store-fs.esm.js'

const PORT = 8000

/**
 * This server is for illustration purposes. It trusts the client.
 * Before using in production it requires customization:
 * - Validate car files
 * - Validate paths & mime types
 * - Authenticate requests and enforce that users can only update their own header file (userid in header filename)
 * - Deploy in a secure environment
 * To connect with a managed service, see https://fireproof.storage
 */

const MIME_TYPES = {
  default: 'application/octet-stream',
  json: 'application/json',
  car: 'application/car'
}

const DATA_PATH = HeaderStore.dataDir

const toBool = [() => true, () => false]

const prepareFile = async url => {
  const paths = [DATA_PATH, url]
  if (url.endsWith('/')) paths.push('index.html')
  const filePath = path.join(...paths)
  const pathTraversal = !filePath.startsWith(DATA_PATH)
  const exists = await fs.promises.access(filePath).then(...toBool)
  const found = !pathTraversal && exists
  const ext = found ? path.extname(filePath).substring(1).toLowerCase() : null
  const stream = found ? fs.createReadStream(filePath) : null
  return { found, ext, stream }
}

export function startServer(quiet = true) {
  const log = quiet ? () => {} : console.log

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'PUT') {
      const filePath = path.join(DATA_PATH, req.url)
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      const writeStream = fs.createWriteStream(filePath)
      req.pipe(writeStream)

      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('File written successfully')
        log(`PUT ${req.url} 200`)
      })

      req.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
        log(`PUT ${req.url} 500 - ${err.message}`)
      })
    } else if (req.method === 'OPTIONS') {
      // Pre-flight request. Reply successfully:
      res.writeHead(200)
      res.end()
    } else {
      const file = await prepareFile(req.url)
      if (file.found) {
        const mimeType = MIME_TYPES[file.ext] || MIME_TYPES.default
        res.writeHead(200, { 'Content-Type': mimeType })
        file.stream.pipe(res)
        log(`GET ${req.url} 200`)
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        log(`GET ${req.url} 404`)
      }
    }
  })
  server.listen(PORT)
  void fs.promises.mkdir(DATA_PATH, { recursive: true }).then(() => {
    log(`Server running at http://127.0.0.1:${PORT}/`)
  })
  return server
}

// if the script is run directly (not imported as a module), start the server:
if (import.meta.url === 'file://' + process.argv[1]) startServer(false)
