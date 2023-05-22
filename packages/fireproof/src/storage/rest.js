import fetch from 'node-fetch'
import { Base } from './base.js'

const defaultConfig = {
  url: 'http://localhost:4000'
}

export class Rest extends Base {
  constructor (name, config = {}, header = {}) {
    super(name, Object.assign({}, defaultConfig, config), header)
    this.headerURL = `${this.config.url}/header.json`
  }

  async writeCars (cars) {
    if (this.config.readonly) return
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

  async saveHeader (header) {
    if (this.config.readonly) return
    const response = await fetch(this.headerURL, {
      method: 'PUT',
      body: this.prepareHeader(header),
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) throw new Error(`An error occurred: ${response.statusText}`)
  }
}
