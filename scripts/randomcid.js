import crypto from 'node:crypto'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

async function main () {
  const bytes = crypto.webcrypto.getRandomValues(new Uint8Array(32))
  const hash = await sha256.digest(bytes)
  process.stdout.write(CID.create(1, raw.code, hash).toString())
}

main()
