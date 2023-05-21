import fetch from 'node-fetch'
import { Base } from './base.js'

const defaultConfig = {
  url: 'http://localhost:4000'
}

export class Rest extends Base {
  constructor (name, keyId, config = {}) {
    super(name, keyId, Object.assign({}, defaultConfig, config))
    this.headerURL = `${this.config.url}/header.json`
  }

  async writeCars (cars) {
    super.writeCars()
    for (const { cid, bytes } of cars) {
      const carURL = `${this.config.url}/${cid.toString()}.car`
      const response = await fetch(carURL, {
        method: 'PUT',
        body: bytes,
        headers: { 'Content-Type': 'application/car' }
      })
      if (!response.ok) throw new Error(`An error occurred: ${response.statusText}`)
    }
  }

  async readCar (carCid) {
    const carURL = `${this.config.url}/${carCid.toString()}.car`
    const response = await fetch(carURL)
    if (!response.ok) throw new Error(`An error occurred: ${response.statusText}`)
    const got = await response.arrayBuffer()
    return new Uint8Array(got)
  }

  async getHeader () {
    const response = await fetch(this.headerURL)
    if (!response.ok) return null
    return await response.json()
  }

  async saveHeader (stringValue) {
    super.saveHeader()
    const response = await fetch(this.headerURL, {
      method: 'PUT',
      body: stringValue,
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) throw new Error(`An error occurred: ${response.statusText}`)
  }
}
