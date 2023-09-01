import { useParams } from 'react-router-dom'
import { useFireproof } from 'use-fireproof'
import { CodeHighlight, EditableCodeHighlight } from '../components/CodeHighlight'
import { Doc, DocFragment } from '@fireproof/core'
import { useState } from 'react'

export function DocPage() {
  const { dbName, docId } = useParams()
  // const db = fireproof(dbName as string)
  const { useDocument } = useFireproof(dbName as string)

  const [doc, setDoc, saveDoc] = useDocument({ _id: docId as string })
  const [needsSave, setNeedsSave] = useState(false)

  console.log(dbName, docId, doc)
  const { data, meta } = dataAndMeta(doc)

  const title = meta._id ? `Edit: ${meta._id}` : 'Create new document'

  function editorChanged({ code, valid }: { code: string; valid: boolean }) {
    setNeedsSave(valid)
    if (valid)
    setDoc(JSON.parse(code))
    // setDocToSave(code)
    console.log({code, valid})
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EditableCodeHighlight code={JSON.stringify(data, null, 2)} onChange={editorChanged} />
      <button title="Save" disabled={!needsSave} onClick={() => saveDoc()} className="btn btn-primary">Save</button>
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
