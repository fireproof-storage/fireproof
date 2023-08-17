/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable mocha/max-top-level-suites */
import { assert, equals, resetDirectory } from './helpers.js'
import { database, Database } from '../dist/test/database.esm.js'
import { index, Index } from '../dist/test/index.esm.js'
import { testConfig } from '../dist/test/store-fs.esm.js'

describe('Hello World Test', function () {
  it('should pass the hello world test', function () {
    const result = database('hello') // call to your library function
    assert(result.name === 'hello')
  })
})

describe('public API', function () {
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-api')
    this.db = database('test-api')
    this.index = index(this.db, 'test-index', (doc) => doc.foo)
    this.ok = await this.db.put({ _id: 'test', foo: 'bar' })
    this.doc = await this.db.get('test')
    this.query = await this.index.query()
  })
  it('should have a database', function () {
    assert(this.db)
    assert(this.db instanceof Database)
  })
  it('should have an index', function () {
    assert(this.index)
    assert(this.index instanceof Index)
  })
  it('should put', function () {
    assert(this.ok)
    equals(this.ok.id, 'test')
  })
  it('should get', function () {
    equals(this.doc.foo, 'bar')
  })
  it('should query', function () {
    assert(this.query)
    assert(this.query.rows)
    equals(this.query.rows.length, 1)
    equals(this.query.rows[0].key, 'bar')
  })
})
