export class Base {
  constructor (name, keyId, config = {}) {
    this.name = name
    this.keyId = keyId
    this.config = config
  }

  writeCars () {
    if (this.config.readonly) {
      throw new Error('Read-only mode')
    }
  }

  saveHeader () {
    if (this.config.readonly) {
      throw new Error('Read-only mode')
    }
  }
}
