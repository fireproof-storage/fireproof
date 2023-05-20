import fetch from 'node-fetch'

const defaultConfig = {
  baseURL: 'http://localhost:4000'
}

export class Rest {
  constructor (name, keyId, config = {}) {
    this.name = name
    this.keyId = keyId
    this.config = Object.assign({}, defaultConfig, config)
    this.headerURL = `${this.config.url}/header.json`
  }

  async writeCars (cars) {
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
    // console.log('readCar', carURL)
    const response = await fetch(carURL)
    if (!response.ok) throw new Error(`An error occurred: ${response.statusText}`)
    const got = await response.arrayBuffer()
    // console.log('readCar', got.byteLength)
    return new Uint8Array(got)
    // return got
  }

  async getHeader () {
    const response = await fetch(this.headerURL)
    // console.log('getHeader', response)
    if (!response.ok) return null

    return await response.json()
  }

  async saveHeader (stringValue) {
    const response = await fetch(this.headerURL, {
      method: 'PUT',
      body: JSON.stringify(stringValue),
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) throw new Error(`An error occurred: ${response.statusText}`)
  }
}
