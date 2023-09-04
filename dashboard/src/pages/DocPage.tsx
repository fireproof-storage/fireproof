import { useParams } from 'react-router-dom'
import { useFireproof } from 'use-fireproof'
import { CodeHighlight, EditableCodeHighlight } from '../components/CodeHighlight'
import { Doc, DocFragment } from '@fireproof/core'
import { useEffect, useState } from 'react'
import { inspectDb } from '../lib/db'

export function DocPage() {
  const { dbName, docId } = useParams()
  const db = inspectDb(dbName as string)
  const { database, useDocument } = useFireproof(db)

  const initialDoc = docId ? { _id: docId } : {}
  const [doc, setDoc] = useDocument(initialDoc as Doc)
  const [needsSave, setNeedsSave] = useState(false)

  // console.log(dbName, docId, doc)
  const { data, meta } = dataAndMeta(doc)

  const title = meta._id ? `Edit: ${meta._id}` : 'Create document'

  function editorChanged({ code, valid }: { code: string; valid: boolean }) {
    setNeedsSave(valid)
    if (valid) setDoc({...meta, ...JSON.parse(code)}, true)
    // setDocToSave(code)
    // console.log({ code, valid })
  }

  async function doSave() {
    // const ok = await saveDoc()
    const ok = await database.put(doc)
    if (!docId) {
      window.location.href = `/doc/${dbName}/${ok.id}`
    }
    setNeedsSave(false)
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold">
        {dbName} / {title}
      </h1>
      <EditableCodeHighlight code={JSON.stringify(data, null, 2)} onChange={editorChanged} />
      <button
        title="Save"
        disabled={!needsSave}
        onClick={() => doSave()}
        className="btn btn-primary"
      >
        Save
      </button>
      <CodeHighlight code={JSON.stringify(meta, null, 2)} />
      <FileSection doc={doc} />
    </div>
  )
}

function dataAndMeta(doc: Doc) {
  const data = new Map<string, DocFragment>()
  const meta = new Map<string, DocFragment>()
  Object.keys(doc).forEach((key: string) => {
    if (key.startsWith('_')) {
      meta.set(key, doc[key])
    } else {
      data.set(key, doc[key])
    }
  })
  const { _id, ...metaObj } = Object.fromEntries(meta)
  return {
    data: Object.fromEntries(data),
    meta: { _id, ...metaObj }
  }
}

function FileSection({ doc }: { doc: Doc }) {
  console.log('FileSection', doc)
  if (doc._files) {
    console.log('doc._files', doc._files)
    const fileLIs = Object.entries(doc._files).map(([key, meta]) => (
      <li key={key}>
        <span>{key}</span>
        <ImgFile meta={meta} />
      </li>
    ))
    return <ul>{fileLIs}</ul>
  }
  return <></>
}

function ImgFile({ meta, cache = false }) {
  const [imgDataUrl, setImgDataUrl] = useState('')

  useEffect(() => {
    if (meta.file && /image/.test(meta.type)) {
      meta.file().then(file => {
        const src = URL.createObjectURL(file)
        setImgDataUrl(src)
        return () => {
          URL.revokeObjectURL(src)
        }
      })
    }
  }, [meta])

  if (imgDataUrl) {
    return <img src={imgDataUrl} height={100} width={100} />
  } else {
    return <></>
  }
}

function imgForFile(meta, opts = {}) {
  if (meta.file && /image/.test(meta.type)) {
    const img = document.createElement('img')
    meta.file().then(file => {
      const src = URL.createObjectURL(file)
      img.src = src
      if (!opts.cache) {
        img.onload = () => {
          URL.revokeObjectURL(img.src)
        }
      }
    })
    img.height = 100
    img.width = 100
    return img
  }
}
