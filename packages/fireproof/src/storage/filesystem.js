
import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { Base } from './base.js'
// import { readFileSync } from 'node:fs'
// const { readFileSync } = require('fs')
import fs from 'fs'
const readFileSync = fs.readFileSync

export const defaultConfig = {
  dataDir: join(homedir(), '.fireproof')
}

export class Filesystem extends Base {
  constructor (name, config = {}) {
    const mergedConfig = Object.assign({}, defaultConfig, config)
    // console.log('Filesystem', name, mergedConfig, header)
    super(name, mergedConfig)
  }

  async writeCars (cars) {
    if (this.config.readonly) return
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

  loadHeader (branch = 'main') {
    const header = loadSync(this.headerFilename(branch))
    // console.log('fs getHeader', this.headerFilename(), header, typeof header)
    if (!header) return null
    return JSON.parse(header)
  }

  async writeHeader (branch, header) {
    // console.log('saveHeader', this.isBrowser)
    if (this.config.readonly) return
    const pHeader = this.prepareHeader(header)
    // console.log('writeHeader fs', branch, pHeader)
    await writeSync(this.headerFilename(branch), pHeader)
  }

  headerFilename (branch = 'main') {
    // console.log('headerFilename', this.config.dataDir, this.name)
    return join(this.config.dataDir, this.name, branch + '.json')
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
