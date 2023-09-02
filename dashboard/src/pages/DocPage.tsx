import { useParams } from 'react-router-dom'
import { useFireproof } from 'use-fireproof'
import { CodeHighlight, EditableCodeHighlight } from '../components/CodeHighlight'
import { Doc, DocFragment } from '@fireproof/core'
import { useState } from 'react'

export function DocPage() {
  const { dbName, docId } = useParams()
  // const db = fireproof(dbName as string)
  const { database, useDocument } = useFireproof(dbName as string)

  const initialDoc = docId ? { _id: docId } : {  }
  const [doc, setDoc] = useDocument(initialDoc as Doc)
  const [needsSave, setNeedsSave] = useState(false)

  console.log(dbName, docId, doc)
  const { data, meta } = dataAndMeta(doc)

  const title = meta._id ? `Edit: ${meta._id}` : 'Create document'

  function editorChanged({ code, valid }: { code: string; valid: boolean }) {
    setNeedsSave(valid)
    if (valid)
    setDoc(JSON.parse(code))
    // setDocToSave(code)
    console.log({code, valid})
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
      <h1 className="text-2xl font-bold">{dbName} / {title}</h1>
      <EditableCodeHighlight code={JSON.stringify(data, null, 2)} onChange={editorChanged} />
      <button title="Save" disabled={!needsSave} onClick={() => doSave()} className="btn btn-primary">Save</button>
      <CodeHighlight code={JSON.stringify(meta, null, 2)} />
    </div>
  )
}

function dataAndMeta(doc: Doc) {
  const data = new Map<string, DocFragment>()
  const meta = new Map<string, DocFragment>()
  Object.keys(doc).forEach((key: string) => {
    console.log(key.startsWith('_'))
    if (key.startsWith('_')) {
      meta.set(key, doc[key])
    } else {
      data.set(key, doc[key])
    }
  })
  console.log(JSON.stringify(data), meta)
  const { _id, ...metaObj } = Object.fromEntries(meta)
  return {
    data: Object.fromEntries(data),
    meta: { _id, ...metaObj }
  }
}
