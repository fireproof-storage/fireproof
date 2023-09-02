/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useEffect, useState } from 'react'
import { fireproof } from 'use-fireproof'

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
    const existing = await dashDb.get('db:' + formData.name).catch(() => false)
    if (existing) {
      console.log('snapshoting', existing)
      const snap = fireproof(formData.name)
      await snap._crdt.ready
      const snapshot = await snap._crdt.blocks.loader?.metaStore?.load()
      if (snapshot) {
        console.log('snapshot', snapshot)
        await dashDb.put({
          type: 'snapshot',
          created: Date.now(),
          name: formData.name,
          // @ts-ignore
          snapshot
        })
      }
    }
    await dashDb.put({
      type: 'import',
      import: { key: formData.key, car: formData.car },
      name: formData.name
    })
    // const snap = fireproof(formData.name)

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
