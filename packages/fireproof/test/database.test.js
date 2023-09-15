/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, resetDirectory,getDirectoryName,readImages } from './helpers.js'
import { Database } from '../dist/test/database.esm.js'
// import { Doc } from '../dist/test/types.d.esm.js'
import { MetaStore } from '../dist/test/store-fs.esm.js'
import fs from "fs"
import path, { dirname } from "path"
import {File,Blob} from "web-file-polyfill"
import { equal } from 'assert'

/**
 * @typedef {Object.<string, any>} DocBody
 */

/**
 * @typedef {Object} Doc
 * @property {string} _id
 * @property {DocBody} [property] - an additional property
 */

describe('basic Database', function () {
  /** @type {Database} */
  let db
  beforeEach(function () {
    db = new Database()
  })
  it('should put', async function () {
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })
  it('get missing should throw', async function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    const e = await (db.get('missing')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('del missing should result in deleted state', async function () {
    await db.del('missing')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    const e = await (db.get('missing')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('has no changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 0)
  })
})

describe('basic Database with record', function () {
  /** @type {Database} */
  let db
  beforeEach(async function () {
    db = new Database()
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  })
  it('should update', async function () {
    const ok = await db.put({ _id: 'hello', value: 'universe' })
    equals(ok.id, 'hello')
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'universe')
  })
  it('should del last record', async function () {
    const ok = await db.del('hello')
    equals(ok.id, 'hello')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const e = await (db.get('hello')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('has changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 1)
    equals(rows[0].key, 'hello')
    equals(rows[0].value._id, 'hello')
  })
  it('is not persisted', async function () {
    const db2 = new Database()
    const { rows } = await db2.changes([])
    equals(rows.length, 0)
    const doc = await db2.get('hello').catch(e => e)
    assert(doc.message)
  })
})

describe('named Database with record', function () {
  /** @type {Database} */
  let db
  beforeEach(async function () {
    await resetDirectory(MetaStore.dataDir, 'test-db-name')

    db = new Database('test-db-name')
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  })
  it('should update', async function () {
    const ok = await db.put({ _id: 'hello', value: 'universe' })
    equals(ok.id, 'hello')
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'universe')
  })
  it('should del last record', async function () {
    const ok = await db.del('hello')
    equals(ok.id, 'hello')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const e = await (db.get('hello')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('has changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 1)
    equals(rows[0].key, 'hello')
    equals(rows[0].value._id, 'hello')
  })
  it('should have a key', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 1)
    const loader = db._crdt.blocks.loader
    await loader.ready
    equals(loader.key.length, 64)
    equals(loader.keyId.length, 64)
    notEquals(loader.key, loader.keyId)
  })
  it('should work right with a sequence of changes', async function () {
    const numDocs = 10
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: 'world' }
      const ok = await db.put(doc)
      equals(ok.id, `id-${i}`)
    }
    const { rows } = await db.changes([])
    equals(rows.length, numDocs + 1)

    const ok6 = await db.put({ _id: `id-${6}`, hello: 'block' })
    equals(ok6.id, `id-${6}`)

    for (let i = 0; i < numDocs; i++) {
      const id = `id-${i}`
      const doc = await db.get(id)
      assert(doc)
      equals(doc._id, id)
      equals(doc.hello.length, 5)
    }

    const { rows: rows2 } = await db.changes([])
    equals(rows2.length, numDocs + 1)

    const ok7 = await db.del(`id-${7}`)
    equals(ok7.id, `id-${7}`)

    const { rows: rows3 } = await db.changes([])
    equals(rows3.length, numDocs + 1)
    equals(rows3[numDocs].key, `id-${7}`)
    equals(rows3[numDocs].value._deleted, true)

    // test limit
    const { rows: rows4 } = await db.changes([], { limit: 5 })
    equals(rows4.length, 5)
  })

  it('should work right after compaction', async function () {
    const numDocs = 10
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: 'world' }
      const ok = await db.put(doc)
      equals(ok.id, `id-${i}`)
    }
    const { rows } = await db.changes([])
    equals(rows.length, numDocs + 1)

    await db.compact()

    const { rows: rows3 } = await db.changes([], { dirty: true })
    equals(rows3.length, numDocs + 1)

    const { rows: rows4 } = await db.changes([], { dirty: false })
    equals(rows4.length, numDocs + 1)
  })
})

// describe('basic Database parallel writes / public', function () {
//   /** @type {Database} */
//   let db
//   const writes = []
//   beforeEach(async function () {
//     await resetDirectory(MetaStore.dataDir, 'test-parallel-writes')
//     db = new Database('test-parallel-writes', { public: true })
//     /** @type {Doc} */
//     for (let i = 0; i < 10; i++) {
//       const doc = { _id: `id-${i}`, hello: 'world' }
//       writes.push(db.put(doc))
//     }
//     await Promise.all(writes)
//   })

describe('basic Database parallel writes / public', function () {
  /** @type {Database} */
  let db
  const writes = []
  beforeEach(async function () {
    await resetDirectory(MetaStore.dataDir, 'test-parallel-writes')
    db = new Database('test-parallel-writes', { public: true })
    /** @type {Doc} */
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: 'world' }
      writes.push(db.put(doc))
    }
    await Promise.all(writes)
  })
  it('should have one head', function () {
    const crdt = db._crdt
    equals(crdt.clock.head.length, 1)
  })
  it('should write all', async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      const doc = await db.get(id)
      assert(doc)
      equals(doc._id, id)
      equals(doc.hello, 'world')
    }
  })
  it('should del all', async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      const ok = await db.del(id)
      equals(ok.id, id)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const e = await (db.get(id)).catch(e => e)
      matches(e.message, /Not found/)
    }
  })
  it('should delete all in parallel', async function () {
    const deletes = []
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      deletes.push(db.del(id))
    }
    await Promise.all(deletes)
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const e = await (db.get(id)).catch(e => e)
      matches(e.message, /Not found/)
    }
  })
  it('has changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 10)
    for (let i = 0; i < 10; i++) {
      equals(rows[i].key, 'id-' + i)
    }
  })
  it('should not have a key', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 10)
    assert(db.opts.public)
    assert(db._crdt.opts.public)
    const loader = db._crdt.blocks.loader
    await loader.ready
    equals(loader.key, undefined)
    equals(loader.keyId, undefined)
  })
})

describe('basic Database with subscription', function () {
  /** @type {Database} */
  let db, didRun, unsubscribe
  beforeEach(function () {
    db = new Database()
    didRun = 0
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    unsubscribe = db.subscribe((docs) => {
      assert(docs[0]._id)
      didRun++
    })
  })
  it('should run on put', async function () {
    /** @type {Doc} */
    const doc = { _id: 'hello', message: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
    equals(didRun, 1)
  })
  it('should unsubscribe', async function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    unsubscribe()
    /** @type {Doc} */
    const doc = { _id: 'hello', message: 'again' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
    equals(didRun, 0)
  })
})

describe('database with files input', async function()
{
  /** @type {Database} */
  let db
  let imagefiles=[]
  let result
  

  before(function()
  {
    let directoryname=getDirectoryName(import.meta.url)
    let images=readImages(directoryname,'test-images',['image1.jpg','image2.jpg'])
    images.forEach((image,index)=>
      {
        const blob = new Blob([image]);
        imagefiles.push(new File([blob], `image${index+1}.jpg`, { type: "image/jpeg" }));
      })
  })

  beforeEach(async function()
  {
    // await resetDirectory(MetaStore.dataDir, 'fireproof-with-images')
    db=new Database('fireproof-with-images')
  })

  it("Should upload images",async function()
  {
    console.log('These are the image files',imagefiles)
    const doc={
      _id:"images-main",
      type:"files",
      _files:{
        "image1":imagefiles[0],
        "image2":imagefiles[1]
      }
    }

    result=await db.put(doc)
    console.log(result,"This is the result when the images are stored")
    equals(result.id,'images-main')
  })

  it("Should fetch the images",async function()
  {
    let data=await db.get(result.id);
    console.log(data);
    // console.log(data)
    // Object.entries(data._files).map((entry,index)=>
    //   {
    //     let key=entry[0]
    //     let value=entry[1]
    //     // let variablename=`image${index+1}`
    //     // equals(JSON.stringify(value),JSON.stringify(new Uint8Array(variablename)))
    //     if(index==0)
    //     {
    //       equals(JSON.stringify(value),JSON.stringify(new Uint8Array(image1)))
    //     }
    //     else{
    //       equals(JSON.stringify(value),JSON.stringify(new Uint8Array(image2)))
    //     }
    //   })
  })

  // it("Should delete the images",async function()
  // {
  //   // console.log('This is the result',result)
  //   // let olddata=await db.get('images-main')
  //   // console.log(olddata,"This is the old data")
  //   await db.del('images-main');
  //   try{
  //     let newdata=await db.get('images-main')
  //     equals(true,false)
  //   }
  //   catch(e){
  //     equals(true,true)
  //   }

  // })

  // it("Race condition",async function()
  // {
  //   // //From the result we get two things that is - the id and the latest clock of the CAR file
  //   // console.log(result)

  //   // //From the database header we get the latest CID of the CAR file
  //   // console.log(db._crdt.clock.head)

  //   //Let us make a race condition between the two instances of the database
  //   let db1=await new Database('fireproof-with-images-part5')
  //   let db2=await new Database('fireproof-with-images-part5')
  //   let result1,result2;
  //   let first
  //   let doc={
  //     _id:'',
  //     type:"files",
  //     _files:{
  //     }
  //   }
    
  //   const promise1=new Promise((resolve,reject)=>
  //   {
  //     setTimeout(async ()=>
  //     {
  //       try{
  //         doc._files['image1']=image1
  //         doc._id='image1'
  //         result1=await db1.put(doc)
  //         console.log('These are the details of database-1 ')
  //         console.log('This is the result1',result1)
  //         console.log(db1._crdt.clock.head)
  //         console.log(db1._crdt.clock.blocks)
  //         resolve(result1)

  //       }
  //       catch(e)
  //       {
  //         reject(e)
  //       }
  //     },500)
  //   })

  //   const promise2=new Promise((resolve,reject)=>
  //   {
  //     setTimeout(async()=>
  //     {
  //       try{
  //         doc._files['image2']=image2
  //         doc._id='image2'
  //         result2=await db2.put(doc)
  //         console.log('These are the details of database-2')
  //         console.log('This is the result2',result2)
  //         console.log(db2._crdt.clock.head)
  //         console.log(db2._crdt.clock.blocks)
  //         resolve(result2)
  //       }
  //       catch(e)
  //       {
  //         reject(e)
  //       }
  //     },500)
  //   })

  //   await Promise.race([promise1, promise2]).then((value) => {
  //     console.log(value);
  //     first=value
  //     // Both resolve, but one of the promises is faster
  //   });

  //   //Now lets identify the heads of both the databases
  //   //Hence both the databases have different clock heads
  
    

  // })
})
