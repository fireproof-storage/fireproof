/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useEffect, useState } from 'react'
import { fireproof } from 'use-fireproof'
import { CID } from 'multiformats'
import { ensureNamed, restore, snapshot } from '../lib/db'

export function Import() {
  const [formData, setFormData] = useState({ key: '', car: '', name: '' })
  const dashDb = fireproof('_dashboard')

  useEffect(() => {
    const handleHashChange = () => {
      const hashParams = new URLSearchParams(window.location.hash.substr(1))
      setFormData({
        key: hashParams.get('key') || '',
        car: hashParams.get('car') || '',
        name: hashParams.get('name') || ''
      })
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }))

    const newHashParams = new URLSearchParams(window.location.hash.substr(1))
    newHashParams.set(name, value)
    window.location.hash = newHashParams.toString()
  }

  const doImport = async () => {
    // console.log('snapshotting', existing)
    const name = formData.name

    await snapshot(dashDb, name)
    await ensureNamed(dashDb, name)

    await dashDb.put({
      type: 'import',
      import: { key: formData.key, car: formData.car },
      name: name
    })

    await restore(name, { key: formData.key, car: formData.car })

    // await snap._crdt.blocks.loader?.metaStore?.save({ key: formData.key, car: CID.parse(formData.car) })

    // const snap = fireproof(name, { meta: { key: formData.key, car: CID.parse(formData.car) } })
    // await snap._crdt.ready
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold">Import</h1>
      <p>Import data from databases created anywhere</p>

      <form className="mt-4 space-y-4">
        {Object.keys(formData).map(key => (
          <div key={key}>
            <label htmlFor={key} className="block text-sm font-medium text-gray-700">
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </label>
            <input
              id={key}
              name={key}
              type="text"
              value={formData[key as 'key' | 'car' | 'name']}
              onChange={handleInputChange}
              className="mt-1 p-2 w-full border rounded-md"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={doImport}
          className="mt-4 px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
        >
          Import
        </button>
      </form>
    </div>
  )
}
