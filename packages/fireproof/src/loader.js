import { Fireproof } from './fireproof.js'
import { readFileSync, createReadStream } from 'fs'
import { join } from 'path'
import { parse } from '@jsonlines/core'
import cargoQueue from 'async/cargoQueue.js'

const defaultConfig = {
  dataDir: '~/.fireproof'
}

export class Loader {
  constructor (config = defaultConfig) {
    this.config = config
  }

  loadDatabase (database) {
    const clock = this.loadClock(database)
    if (clock) {
      throw new Error(`Database ${database} already exists`)
    } else {
      return Fireproof.storage(database)
    }
  }

  loadClock (database) {
    const clockFile = join(this.config.dataDir, database, 'clock.json')
    let clock
    try {
      clock = JSON.parse(readFileSync(clockFile, 'utf8'))
    } catch (err) {
      clock = null
    }
    return clock
  }

  async loadData (database, filename) {
    const fullFilePath = join(process.cwd(), filename)
    const readableStream = createReadStream(fullFilePath)
    const parseStream = parse()
    readableStream.pipe(parseStream)

    const saveQueue = cargoQueue(async (tasks, callback) => {
      for (const t of tasks) {
        await database.put(t)
      }
      callback()
    })

    parseStream.on('data', async (data) => {
      saveQueue.push(data)
    })
    let res
    const p = new Promise((resolve, reject) => {
      res = resolve
    })
    saveQueue.drain(async (x) => {
      res()
    })
    return p
  }
}
