import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'

const defaultConfig = {
  dataDir: join(homedir(), '.fireproof')
}

export class Filesystem {
  constructor (name, keyId, config = {}) {
    this.name = name
    this.keyId = keyId
    this.config = Object.assign({}, defaultConfig, config)
  }

  async writeCars (cars) {
    const writes = []
    for (const { cid, bytes } of cars) {
      const carFilename = join(this.config.dataDir, this.name, `${cid.toString()}.car`)
      // console.log('writeCars', carFilename)
      writes.push(writeSync(carFilename, bytes))
    }
    await Promise.all(writes)
  }

  async readCar (carCid) {
    const carFilename = join(this.config.dataDir, this.name, `${carCid.toString()}.car`)
    const got = readFileSync(carFilename)
    // console.log('readCar', carFilename, got.constructor.name)
    return got
  }

  getHeader () {
    return loadSync(this.headerFilename())
  }

  async saveHeader (stringValue) {
    // console.log('saveHeader', this.isBrowser)
    await writeSync(this.headerFilename(), stringValue)
  }

  headerFilename () {
    // console.log('headerFilename', this.config.dataDir, this.name)
    return join(this.config.dataDir, this.name, 'header.json')
  }
}

function loadSync (filename) {
  try {
    return readFileSync(filename, 'utf8').toString()
  } catch (error) {
    // console.log('error', error)
    return null
  }
}

async function writeSync (fullpath, stringValue) {
  await mkdir(dirname(fullpath), { recursive: true })
  // writeFileSync(fullpath, stringValue)
  await writeFile(fullpath, stringValue)
}
