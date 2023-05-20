import { createReadStream } from 'fs'
import { join } from 'path'
import { parse } from '@jsonlines/core'
import cargoQueue from 'async/cargoQueue.js'

// todo maybe this goes in a utils package for tree-shaking?

async function loadData (database, filename) {
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

export { loadData }
