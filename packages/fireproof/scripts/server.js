import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'

import { Loader } from '../src/loader.js'

const PORT = 8000

const MIME_TYPES = {
  default: 'application/octet-stream',
  json: 'application/json',
  car: 'application/car'
}

const DATA_PATH = new Loader('fireproof').config.dataDir

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

http
  .createServer(async (req, res) => {
    if (req.method === 'PUT') {
      const filePath = path.join(DATA_PATH, req.url)
      const writeStream = fs.createWriteStream(filePath)
      req.pipe(writeStream)

      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('File written successfully')
        console.log(`PUT ${req.url} 200`)
      })

      req.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
        console.log(`PUT ${req.url} 500 - ${err.message}`)
      })
    } else {
      const file = await prepareFile(req.url)
      if (file.found) {
        const mimeType = MIME_TYPES[file.ext] || MIME_TYPES.default
        res.writeHead(200, { 'Content-Type': mimeType })
        file.stream.pipe(res)
        console.log(`GET ${req.url} 200`)
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        console.log(`GET ${req.url} 404`)
      }
    }
  })
  .listen(PORT)

console.log(`Server running at http://127.0.0.1:${PORT}/`)
